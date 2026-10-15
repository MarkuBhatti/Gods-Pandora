"""God's Pandora local Soul ID trainer — DreamBooth-style LoRA for SDXL or SD 1.5, fully offline.

Usage (run by the app with the engine venv python):
  python train_lora.py --base stabilityai/stable-diffusion-xl-base-1.0 --images-dir DIR \
      --trigger gxmayaid --class-word person --out OUT_DIR --steps 800 --rank 16

Prints one JSON object per line: {"event": "progress", "step": n, "total": N, "loss": x} / {"event": "done", "path": ...}
VRAM: SD 1.5 ≈ 8 GB, SDXL ≈ 12–16 GB (gradient checkpointing + fp16/bf16 weights).
"""
import argparse
import json
import math
import os
import random
import sys


def emit(**kw):
    print(json.dumps(kw), flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--images-dir", required=True)
    ap.add_argument("--trigger", required=True)
    ap.add_argument("--class-word", default="person")
    ap.add_argument("--out", required=True)
    ap.add_argument("--steps", type=int, default=800)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--resolution", type=int, default=0)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    import torch
    import torch.nn.functional as F
    from PIL import Image, ImageOps
    from diffusers import AutoencoderKL, DDPMScheduler, UNet2DConditionModel
    from peft import LoraConfig
    from peft.utils import get_peft_model_state_dict
    from diffusers.utils import convert_state_dict_to_diffusers
    from transformers import AutoTokenizer, CLIPTextModel, CLIPTextModelWithProjection

    if not torch.cuda.is_available() and not torch.backends.mps.is_available():
        emit(event="error", message="Local Soul ID training needs an NVIDIA GPU (CUDA) or Apple Silicon.")
        sys.exit(2)
    device = "cuda" if torch.cuda.is_available() else "mps"
    torch.manual_seed(args.seed)
    random.seed(args.seed)

    # SDXL repos ship tokenizer_2 / text_encoder_2
    from huggingface_hub import list_repo_files
    try:
        files = list_repo_files(args.base)
        is_xl = any(f.startswith("text_encoder_2/") for f in files)
    except Exception:  # offline: look in the local cache
        is_xl = "xl" in args.base.lower()
    res = args.resolution or (1024 if is_xl else 512)
    weight_dtype = torch.bfloat16 if device == "cuda" and torch.cuda.is_bf16_supported() else torch.float16
    emit(event="status", message=f"Loading {'SDXL' if is_xl else 'SD 1.5'} base model…")

    tok1 = AutoTokenizer.from_pretrained(args.base, subfolder="tokenizer", use_fast=False)
    te1 = CLIPTextModel.from_pretrained(args.base, subfolder="text_encoder", torch_dtype=weight_dtype).to(device)
    tok2 = te2 = None
    if is_xl:
        tok2 = AutoTokenizer.from_pretrained(args.base, subfolder="tokenizer_2", use_fast=False)
        te2 = CLIPTextModelWithProjection.from_pretrained(args.base, subfolder="text_encoder_2", torch_dtype=weight_dtype).to(device)
    vae = AutoencoderKL.from_pretrained(args.base, subfolder="vae", torch_dtype=torch.float32).to(device)  # fp32 VAE avoids NaNs
    unet = UNet2DConditionModel.from_pretrained(args.base, subfolder="unet", torch_dtype=weight_dtype).to(device)
    sched = DDPMScheduler.from_pretrained(args.base, subfolder="scheduler")
    for m in (te1, te2, vae, unet):
        if m is not None:
            m.requires_grad_(False)

    unet.add_adapter(LoraConfig(r=args.rank, lora_alpha=args.rank, init_lora_weights="gaussian",
                                target_modules=["to_k", "to_q", "to_v", "to_out.0"]))
    for p in unet.parameters():          # train LoRA weights in fp32 for stability
        if p.requires_grad:
            p.data = p.data.float()
    unet.enable_gradient_checkpointing()
    params = [p for p in unet.parameters() if p.requires_grad]
    try:
        import bitsandbytes as bnb  # optional: saves ~2 GB
        opt = bnb.optim.AdamW8bit(params, lr=args.lr)
    except Exception:
        opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=1e-2)

    # ── text conditioning for the instance prompt (computed once) ──
    prompt = f"a photo of {args.trigger} {args.class_word}"
    with torch.no_grad():
        ids1 = tok1(prompt, padding="max_length", max_length=tok1.model_max_length, truncation=True, return_tensors="pt").input_ids.to(device)
        if is_xl:
            ids2 = tok2(prompt, padding="max_length", max_length=tok2.model_max_length, truncation=True, return_tensors="pt").input_ids.to(device)
            o1 = te1(ids1, output_hidden_states=True)
            o2 = te2(ids2, output_hidden_states=True)
            prompt_embeds = torch.cat([o1.hidden_states[-2], o2.hidden_states[-2]], dim=-1)
            pooled = o2[0]
            time_ids = torch.tensor([[res, res, 0, 0, res, res]], device=device, dtype=prompt_embeds.dtype)
        else:
            prompt_embeds = te1(ids1)[0]
    del te1, te2
    if device == "cuda":
        torch.cuda.empty_cache()

    # ── dataset: center-cropped squares with flips, latents cached ──
    exts = (".png", ".jpg", ".jpeg", ".webp")
    paths = [os.path.join(args.images_dir, f) for f in sorted(os.listdir(args.images_dir)) if f.lower().endswith(exts)]
    if not paths:
        emit(event="error", message="No training images found.")
        sys.exit(2)
    emit(event="status", message=f"Encoding {len(paths)} images…")
    latents = []
    with torch.no_grad():
        for pth in paths:
            img = ImageOps.exif_transpose(Image.open(pth)).convert("RGB")
            img = ImageOps.fit(img, (res, res), Image.LANCZOS)
            for flip in (False, True):
                im = ImageOps.mirror(img) if flip else img
                t = torch.from_numpy(__import__("numpy").array(im)).permute(2, 0, 1).float() / 127.5 - 1.0
                lat = vae.encode(t.unsqueeze(0).to(device)).latent_dist.sample() * vae.config.scaling_factor
                latents.append(lat.to(weight_dtype))
    del vae
    if device == "cuda":
        torch.cuda.empty_cache()

    total = max(50, args.steps)
    unet.train()
    ema = None
    for step in range(1, total + 1):
        lat = random.choice(latents)
        noise = torch.randn_like(lat)
        t = torch.randint(0, sched.config.num_train_timesteps, (1,), device=device).long()
        noisy = sched.add_noise(lat, noise, t)
        with torch.autocast(device_type="cuda" if device == "cuda" else "cpu", dtype=weight_dtype, enabled=device == "cuda"):
            if is_xl:
                pred = unet(noisy, t, prompt_embeds, added_cond_kwargs={"text_embeds": pooled, "time_ids": time_ids}).sample
            else:
                pred = unet(noisy, t, prompt_embeds).sample
        target = noise if sched.config.prediction_type == "epsilon" else sched.get_velocity(lat, noise, t)
        loss = F.mse_loss(pred.float(), target.float())
        loss.backward()
        torch.nn.utils.clip_grad_norm_(params, 1.0)
        opt.step()
        opt.zero_grad(set_to_none=True)
        lv = float(loss.detach())
        ema = lv if ema is None else 0.95 * ema + 0.05 * lv
        if step % 5 == 0 or step == total:
            emit(event="progress", step=step, total=total, loss=round(ema, 4))
        if math.isnan(lv):
            emit(event="error", message="Training diverged (NaN loss). Try fewer steps or a lower learning rate.")
            sys.exit(3)

    os.makedirs(args.out, exist_ok=True)
    layers = convert_state_dict_to_diffusers(get_peft_model_state_dict(unet))
    if is_xl:
        from diffusers import StableDiffusionXLPipeline as P
    else:
        from diffusers import StableDiffusionPipeline as P
    P.save_lora_weights(args.out, unet_lora_layers=layers)
    emit(event="done", path=os.path.join(args.out, "pytorch_lora_weights.safetensors"), base=args.base, xl=is_xl)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "out of memory" in msg.lower():
            msg = "GPU out of memory — try SD 1.5, fewer steps, or close other GPU apps."
        emit(event="error", message=msg)
        sys.exit(1)
