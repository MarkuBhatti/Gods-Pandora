"""God's Pandora local inference engine.

A small FastAPI sidecar that loads open-source diffusion models (SDXL, Flux,
SD3, Playground, etc.) from local storage and serves generations to the
Electron app - the same role ComfyUI/Ollama play, but embedded.

Models are stored under --models-dir (HF_HOME), fully offline after download.
"""
import argparse
import base64
import io
import os

import hub
hub.quiet()  # no scary-but-harmless warnings in the console

import torch
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="God's Pandora Engine")
PIPELINES = {}  # model_id -> loaded pipeline (LRU of 1 to save VRAM)
CANCEL = {"flag": False}  # set by POST /cancel; checked between denoising steps


class Cancelled(Exception):
    pass


class GenRequest(BaseModel):
    model_id: str
    prompt: str
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    steps: int = 28
    guidance: float = 4.5
    seed: int | None = None           # None = random; same seed + settings = same image
    sampler: str = "default"          # ComfyUI-style sampler name (SD/SDXL-type pipelines)
    kind: str = "image"               # "image" | "video"
    duration: float = 5.0             # seconds (video)
    fps: int = 24                     # frames per second (video)
    reference_images: list[str] = []  # data URIs: edit/reference input, IP-Adapter, or video start frame
    lora_path: str | None = None      # local Soul ID LoRA (.safetensors) trained by train_lora.py
    lora_scale: float = 1.0
    loras: list[dict] = []            # extra LoRAs from the Model Market: [{"path": ..., "scale": 0.8}]
    base_hint: str = ""               # "SDXL 1.0", "SD 1.5", "Pony"… for single-file checkpoints


class AnimateRequest(BaseModel):
    model_id: str = "Wan-AI/Wan2.2-Animate-2-14B-Distilled-Diffusers"
    image_path: str                   # character / edited first frame (local file)
    video_path: str                   # driving video (local file)
    prompt: str = ""
    negative_prompt: str = ""
    height: int = 800                 # target area; aspect ratio follows the image
    width: int = 640
    seed: int | None = None
    max_seconds: float = 30.0


def device():
    if torch.cuda.is_available():
        return "cuda", torch.float16
    if torch.backends.mps.is_available():  # Apple Silicon
        return "mps", torch.float16
    return "cpu", torch.float32


def load_single_file(path: str, base_hint: str, dtype):
    """Civitai-style checkpoint (.safetensors / .ckpt): SD 1.5 or SDXL family (Pony, Illustrious…)."""
    from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline
    hint = (base_hint or "").lower()
    xl_first = any(k in hint for k in ("xl", "pony", "illustrious", "noob")) or (not hint and os.path.getsize(path) > 5 * 1024**3)
    order = [StableDiffusionXLPipeline, StableDiffusionPipeline] if xl_first else [StableDiffusionPipeline, StableDiffusionXLPipeline]
    last = None
    for cls in order:
        try:
            return cls.from_single_file(path, torch_dtype=dtype)
        except Exception as e:  # noqa: BLE001
            last = e
    raise ValueError(f"Could not load this checkpoint as SD 1.5 or SDXL ({str(last)[:160]}). Flux / SD3 single files need ComfyUI.")


def load_pipeline(model_id: str, base_hint: str = ""):
    if model_id in PIPELINES:
        return PIPELINES[model_id]
    from diffusers import AutoPipelineForText2Image, DiffusionPipeline
    dev, dtype = device()
    if dev == "cuda" and torch.cuda.is_bf16_supported():
        dtype = torch.bfloat16  # FLUX / FLUX.2 / Qwen-Image are trained in bf16
    PIPELINES.clear()  # keep only one pipeline in memory
    if dev == "cuda":
        torch.cuda.empty_cache()
    if os.path.isfile(model_id):
        if dtype == torch.bfloat16:
            dtype = torch.float16  # SD 1.5 / SDXL checkpoints are fp16
        pipe = load_single_file(model_id, base_hint, dtype)
    else:
        path, variant = hub.fetch(model_id, os.environ.get("HF_TOKEN") or None)  # only fp16 weights, not the whole repo
        if variant == "fp16" and dtype == torch.bfloat16 and "stable-diffusion" in model_id.lower():
            dtype = torch.float16
        def _load(cls, v):
            kw = {"torch_dtype": dtype}
            if v:
                kw["variant"] = v
            return cls.from_pretrained(path, **kw)
        pipe = None
        last = None
        for cls in (AutoPipelineForText2Image, DiffusionPipeline):  # video / newer families use their own class
            for v in ([variant, None] if variant else [None]):
                try:
                    pipe = _load(cls, v)
                    break
                except Exception as e:  # noqa: BLE001
                    last = e
            if pipe is not None:
                break
        if pipe is None:
            raise last
    optimize_memory(pipe, dev)
    PIPELINES[model_id] = pipe
    return pipe


def vram_gb():
    try:
        return torch.cuda.get_device_properties(0).total_memory / 1024**3 if torch.cuda.is_available() else 0
    except Exception:  # noqa: BLE001
        return 0


def optimize_memory(pipe, dev):
    """ComfyUI-style memory management: keep small models on the GPU, offload big ones, tile the VAE."""
    if dev != "cuda":
        pipe.to(dev)
        return
    vram = vram_gb()
    small = type(pipe).__name__ in ("StableDiffusionPipeline", "StableDiffusionImg2ImgPipeline", "StableDiffusionInpaintPipeline")
    try:
        if small and vram >= 6:
            pipe.to("cuda")                     # SD 1.5 fits fully on 6 GB+ — fastest
        elif vram and vram < 6:
            pipe.enable_sequential_cpu_offload()  # 4-6 GB: slowest but never runs out of memory
        else:
            pipe.enable_model_cpu_offload()      # SDXL / FLUX / video on 8-16 GB
    except Exception:  # noqa: BLE001
        pipe.to("cuda")
    for fn in ("enable_vae_slicing", "enable_vae_tiling"):
        try:
            getattr(pipe, fn)()
        except Exception:  # noqa: BLE001
            pass
    if vram and vram <= 8:
        try:
            pipe.enable_attention_slicing("auto")
        except Exception:  # noqa: BLE001
            pass


# native resolutions: going far above them makes duplicated subjects and wastes VRAM
NATIVE_AREA = {"StableDiffusionPipeline": 512 * 512, "StableDiffusionXLPipeline": 1024 * 1024}


def fit_resolution(pipe, width, height, mult):
    area = NATIVE_AREA.get(type(pipe).__name__)
    note = None
    if area and width * height > area * 1.6:
        scale = (area / (width * height)) ** 0.5
        nw, nh = int(width * scale), int(height * scale)
        note = f"Resized {width}×{height} → {nw // mult * mult}×{nh // mult * mult} (this model's native size) for sharper results."
        width, height = nw, nh
    return max(64, width // mult * mult), max(64, height // mult * mult), note


SAMPLERS = {
    "euler": ("EulerDiscreteScheduler", {}),
    "euler_a": ("EulerAncestralDiscreteScheduler", {}),
    "dpmpp_2m": ("DPMSolverMultistepScheduler", {}),
    "dpmpp_2m_karras": ("DPMSolverMultistepScheduler", {"use_karras_sigmas": True}),
    "dpmpp_sde_karras": ("DPMSolverSDEScheduler", {"use_karras_sigmas": True}),
    "unipc": ("UniPCMultistepScheduler", {}),
    "ddim": ("DDIMScheduler", {}),
    "heun": ("HeunDiscreteScheduler", {}),
    "lms": ("LMSDiscreteScheduler", {}),
}


def apply_sampler(pipe, name: str):
    """Swap the scheduler on SD/SDXL-type pipelines. Flow-matching models keep their own."""
    if not name or name == "default" or name not in SAMPLERS:
        return
    current = type(pipe.scheduler).__name__
    if "FlowMatch" in current:
        return
    import diffusers
    cls_name, extra = SAMPLERS[name]
    cls = getattr(diffusers, cls_name, None)
    if cls is None:
        return
    if not hasattr(pipe, "_original_scheduler_config"):
        pipe._original_scheduler_config = pipe.scheduler.config
    pipe.scheduler = cls.from_config(pipe._original_scheduler_config, **extra)


@app.get("/health")
def health():
    dev, _ = device()
    info = {"ok": True, "device": dev, "loaded": list(PIPELINES.keys())}
    if dev == "cuda":
        p = torch.cuda.get_device_properties(0)
        info.update(gpu=p.name, vram_gb=round(p.total_memory / 1024**3, 1))
    return info


@app.post("/cancel")
def cancel():
    """Stop the running generation after the current step."""
    CANCEL["flag"] = True
    return {"ok": True}


def step_callback(pipe, step, timestep, callback_kwargs):
    if CANCEL["flag"]:
        raise Cancelled()
    return callback_kwargs


@app.post("/unload")
def unload():
    """Free GPU memory (before local LoRA training or switching to a big model)."""
    PIPELINES.clear()
    import gc
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return {"ok": True}


def apply_loras(pipe, items):
    """Load / switch / remove LoRAs (Soul ID + Model Market LoRAs) on the cached pipeline.
    items: [(path, scale)]. Reloads only when the set of files changes."""
    items = [(p, float(sc)) for p, sc in items if p]
    want = tuple(sorted(p for p, _ in items))
    current = getattr(pipe, "_godseye_loras", ())
    if items and not hasattr(pipe, "load_lora_weights"):
        raise ValueError("This model does not support LoRAs — pick an SD 1.5 / SDXL / FLUX model that matches the LoRA.")
    if want != current:
        if current and hasattr(pipe, "unload_lora_weights"):
            pipe.unload_lora_weights()
        pipe._godseye_loras = ()
        for i, (p, _) in enumerate(items):
            try:
                pipe.load_lora_weights(p, adapter_name=f"l{i}")
            except Exception as e:  # noqa: BLE001
                raise ValueError(f"LoRA {os.path.basename(p)} doesn't fit this model ({str(e)[:120]}). Check its base model (SD 1.5 vs SDXL vs FLUX).")
        pipe._godseye_loras = want
        pipe._godseye_lora_names = {p: f"l{i}" for i, (p, _) in enumerate(items)}
    if items and hasattr(pipe, "set_adapters"):
        names = pipe._godseye_lora_names
        pipe.set_adapters([names[p] for p, _ in items], adapter_weights=[sc for _, sc in items])


def apply_lora(pipe, path, scale):
    """Back-compat: a single Soul ID LoRA."""
    apply_loras(pipe, [(path, scale)] if path else [])


def decode_images(data_uris):
    from PIL import Image
    out = []
    for d in data_uris or []:
        try:
            b64 = d.split(",", 1)[1] if "," in d else d
            out.append(Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB"))
        except Exception:  # noqa: BLE001
            pass
    return out


def call_params(pipe):
    import inspect
    try:
        return set(inspect.signature(pipe.__call__).parameters)
    except (TypeError, ValueError):
        return set()


def is_video_pipeline(pipe):
    name = type(pipe).__name__
    return any(k in name for k in ("Video", "Wan", "LTX", "CogVideoX", "Mochi", "SkyReels", "Animate"))


def try_ip_adapter(pipe, refs, kwargs, params):
    """SD 1.5 / SDXL consistency: load IP-Adapter once and feed the first reference image."""
    if "ip_adapter_image" not in params or not refs:
        return None
    name = type(pipe).__name__
    try:
        if not getattr(pipe, "_godseye_ip", False):
            if "XL" in name:
                pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models", weight_name="ip-adapter_sdxl.bin")
            else:
                pipe.load_ip_adapter("h94/IP-Adapter", subfolder="models", weight_name="ip-adapter_sd15.bin")
            pipe.set_ip_adapter_scale(0.6)
            pipe._godseye_ip = True
        kwargs["ip_adapter_image"] = refs[0]
        return "IP-Adapter used for character/location consistency."
    except Exception as e:  # noqa: BLE001
        return f"Reference images skipped (IP-Adapter unavailable: {str(e)[:120]})."


def native_fps(pipe, requested):
    name = type(pipe).__name__
    if "Wan" in name:
        return 16
    if "CogVideoX" in name:
        return 8
    return requested if requested in (8, 12, 15, 16, 24, 25, 30) else 24


def frame_count(pipe, seconds, fps):
    """Model-friendly frame counts: Wan/HunyuanVideo/CogVideoX use 4k+1, LTX uses 8k+1."""
    n = max(9, int(round(seconds * native_fps(pipe, fps))))
    name = type(pipe).__name__
    step = 8 if "LTX" in name else 4
    n = (n // step) * step + 1
    return min(n, 257 if "LTX" in name else 129)


@app.post("/generate")
def generate(req: GenRequest):
    try:
        CANCEL["flag"] = False
        pipe = load_pipeline(req.model_id, req.base_hint)
        if CANCEL["flag"]:
            return {"error": "Cancelled."}
        apply_sampler(pipe, req.sampler)
        apply_loras(pipe, ([(req.lora_path, req.lora_scale)] if req.lora_path else []) +
                    [(x.get("path"), x.get("scale", 0.8)) for x in (req.loras or []) if isinstance(x, dict)])
        params = call_params(pipe)
        refs = decode_images(req.reference_images)
        # dimensions must be multiples of 8 (latent space); FLUX / video models prefer multiples of 16/32
        mult = 32 if is_video_pipeline(pipe) else (8 if type(pipe).__name__.startswith("StableDiffusion") else 16)
        width, height, fit_note = fit_resolution(pipe, req.width, req.height, mult)
        note = fit_note
        seed = req.seed if req.seed is not None else int(torch.randint(0, 2**31 - 1, (1,)).item())
        generator = torch.Generator(device="cpu").manual_seed(seed)
        kwargs = dict(prompt=req.prompt, generator=generator)
        if "num_inference_steps" in params or not params:
            kwargs["num_inference_steps"] = req.steps
        if "guidance_scale" in params or not params:
            kwargs["guidance_scale"] = req.guidance
        if "width" in params or not params:
            kwargs["width"] = width
        if "height" in params or not params:
            kwargs["height"] = height
        if req.negative_prompt and ("negative_prompt" in params or not params):
            kwargs["negative_prompt"] = req.negative_prompt
        if "callback_on_step_end" in params:
            kwargs["callback_on_step_end"] = step_callback

        # Reference images → edit / multi-reference input (FLUX.2, Qwen-Image edit, Kontext, I2V start frame)
        if refs and "image" in params:
            multi = any(k in type(pipe).__name__ for k in ("Flux2", "QwenImage"))
            kwargs["image"] = refs if multi and len(refs) > 1 else refs[0]
            note = f"{len(refs) if multi else 1} reference image(s) used as model input."
        elif refs:
            note = try_ip_adapter(pipe, refs, kwargs, params) or "This model has no image input — references were used as text guidance only."

        if req.kind == "video" or is_video_pipeline(pipe):
            if "num_frames" in params:
                kwargs["num_frames"] = frame_count(pipe, req.duration, req.fps)
            out = pipe(**kwargs)
            frames = out.frames[0] if hasattr(out, "frames") else out[0]
            from diffusers.utils import export_to_video
            import tempfile, os
            tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            tmp.close()
            fps = native_fps(pipe, req.fps)
            export_to_video(frames, tmp.name, fps=fps)
            with open(tmp.name, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
            os.unlink(tmp.name)
            return {"video": f"data:video/mp4;base64,{b64}", "seed": seed, "width": width, "height": height, "note": note}

        try:
            image = pipe(**kwargs).images[0]
        except torch.cuda.OutOfMemoryError:
            # recover instead of failing: free memory, switch to the lowest-VRAM mode, retry smaller
            torch.cuda.empty_cache()
            try:
                pipe.enable_sequential_cpu_offload()
            except Exception:  # noqa: BLE001
                pass
            if "width" in kwargs:
                kwargs["width"] = max(256, int(kwargs["width"] * 0.75) // 8 * 8)
                kwargs["height"] = max(256, int(kwargs["height"] * 0.75) // 8 * 8)
            image = pipe(**kwargs).images[0]
            note = (note + " " if note else "") + "Your GPU ran low on memory, so God's Pandora retried in low-memory mode."
            width, height = kwargs.get("width", width), kwargs.get("height", height)
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        return {"image": f"data:image/png;base64,{b64}", "seed": seed, "width": width, "height": height, "note": note}
    except Cancelled:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return {"error": "Cancelled."}
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        low = msg.lower()
        if "out of memory" in low:
            msg = "Not enough GPU memory for this model at this size. Try a smaller resolution, fewer frames, or a lighter model (SD 1.5 / SDXL Turbo)."
        elif "gated" in low or "401" in low or "access to model" in low:
            msg = "This model needs a free Hugging Face login: accept its licence on huggingface.co, then paste your Hugging Face token in Settings → API Keys."
        elif "connection" in low or "resolve host" in low or "timed out" in low:
            msg = "Couldn't reach Hugging Face to download the model. Check your internet connection and try again."
        return {"error": msg}


@app.post("/animate")
def animate(req: AnimateRequest):
    """Genjutsu local: Wan-Animate-2 animates a reference image with the motion of a driving video.
    Motion transfer uses the character image; swap / restyle pass an edited first frame."""
    try:
        from diffusers import ModularPipeline
        from diffusers.utils import export_to_video, load_image, load_video
        dev, _ = device()
        if dev != "cuda":
            return {"error": "Local Genjutsu needs an NVIDIA GPU (Wan-Animate-2 is a 14B video model)."}
        CANCEL["flag"] = False
        key = "animate2:" + req.model_id
        pipe = PIPELINES.get(key)
        if pipe is None:
            PIPELINES.clear()
            torch.cuda.empty_cache()
            pipe = ModularPipeline.from_pretrained(req.model_id)
            pipe.load_components(dtype=torch.bfloat16)
            # stream transformer blocks from CPU RAM so it fits consumer GPUs (needs plenty of system RAM)
            pipe.transformer.enable_group_offload(onload_device=torch.device("cuda"), offload_device=torch.device("cpu"),
                                                  offload_type="block_level", use_stream=True)
            for name in ("text_encoder", "image_encoder", "vae"):
                getattr(pipe, name).to("cuda")
            try:
                pipe.transformer.compile_repeated_blocks(fullgraph=False)
            except Exception as ce:  # noqa: BLE001
                return {"error": "Wan-Animate-2 needs torch.compile (on Windows install triton-windows in the engine venv): " + str(ce)[:200]}
            PIPELINES[key] = pipe
        image = load_image(req.image_path)
        frames, fps = load_video(req.video_path, return_fps=True)
        max_frames = int((fps or 24) * req.max_seconds)
        frames = frames[:max_frames]
        seed = req.seed if req.seed is not None else int(torch.randint(0, 2**31 - 1, (1,)).item())
        kwargs = dict(image=image, driving_video=frames, driving_video_fps=fps, prompt=req.prompt or "high quality, detailed character, natural motion",
                      height=req.height, width=req.width, generator=torch.Generator(device="cpu").manual_seed(seed), output="videos")
        if req.negative_prompt:
            kwargs["negative_prompt"] = req.negative_prompt
        if CANCEL["flag"]:
            return {"error": "Cancelled."}
        videos = pipe(**kwargs)
        if CANCEL["flag"]:
            return {"error": "Cancelled."}
        import tempfile
        tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        tmp.close()
        export_to_video(videos[0], tmp.name, fps=24)
        with open(tmp.name, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        os.unlink(tmp.name)
        return {"video": f"data:video/mp4;base64,{b64}", "seed": seed}
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "out of memory" in msg.lower():
            msg = "Out of GPU / system memory — Wan-Animate-2 needs ~24 GB VRAM plus 64 GB+ RAM. Try a shorter clip or the cloud engine."
        return {"error": msg}


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8756)
    parser.add_argument("--models-dir", type=str, default="")
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port)
