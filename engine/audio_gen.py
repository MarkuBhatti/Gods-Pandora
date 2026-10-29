"""God's Pandora's built-in audio engine — runs open-source music, voice and sound models on this PC.

usage: python audio_gen.py <out.wav>     with a JSON job on stdin:
  {"repo": "...", "family": "...", "prompt": "...", "seconds": 30, "voice": "...", "lyrics": "...", "seed": 1}
prints one JSON line: {"file": ..., "device": ...} or {"error": ...}

Families (see audio_families.py):
  engine Python : musicgen · bark · kokoro · stableaudio · audioldm · tts (MMS/VITS…) · diffusers-audio
  own Python    : acestep · chatterbox · f5 · xtts · parler   (set up once by audio_backends.py)
Only the standard library is imported at the top, so the same file runs in every runtime.
"""
import json
import os
import re
import sys
import wave

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("DIFFUSERS_VERBOSITY", "error")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
import warnings  # noqa: E402
warnings.filterwarnings("ignore")

HERE = os.path.dirname(os.path.abspath(__file__))


# ── helpers ──────────────────────────────────────────────────────────────────
def write_wav(path, audio, rate):
    """Mono or stereo float audio → 16-bit WAV. Accepts (n,), (n, ch) or (ch, n)."""
    import numpy as np
    a = np.asarray(audio, dtype="float32")
    a = np.squeeze(a)
    if a.ndim == 2 and a.shape[0] in (1, 2) and a.shape[1] > a.shape[0]:
        a = a.T  # (ch, n) → (n, ch)
    if a.ndim == 2 and a.shape[1] == 1:
        a = a[:, 0]
    peak = float(np.max(np.abs(a))) if a.size else 0.0
    if peak > 1.0:
        a = a / peak
    ch = 1 if a.ndim == 1 else a.shape[1]
    pcm = (np.clip(a, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(int(rate))
        w.writeframes(pcm.tobytes())


def device():
    import torch
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def vram_gb():
    try:
        import torch
        if torch.cuda.is_available():
            return torch.cuda.get_device_properties(0).total_memory / 1024 ** 3
    except Exception:  # noqa: BLE001
        pass
    return 0.0


def load_pipe(cls, repo, dtype):
    """Load a diffusers pipeline; the app may have downloaded only the fp16 copy of the weights."""
    try:
        return cls.from_pretrained(repo, torch_dtype=dtype)
    except Exception:  # noqa: BLE001
        return cls.from_pretrained(repo, torch_dtype=dtype, variant="fp16")


def seed_all(seed):
    if seed is None or seed == "":
        return
    try:
        import random
        import numpy as np
        import torch
        s = int(seed)
        random.seed(s)
        np.random.seed(s % (2 ** 32))
        torch.manual_seed(s)
    except Exception:  # noqa: BLE001
        pass


def sentences(text, limit=220):
    """Split long scripts into chunks a TTS model can read in one pass."""
    parts, cur = [], ""
    for s in re.split(r"(?<=[.!?।۔。！？])\s+", text.strip()):
        if len(cur) + len(s) < limit:
            cur = (cur + " " + s).strip()
        else:
            if cur:
                parts.append(cur)
            cur = s
    if cur:
        parts.append(cur)
    return parts[:60] or [text]


def join_chunks(chunks, rate, pause=0.25):
    import numpy as np
    gap = np.zeros(int(rate * pause), dtype="float32")
    out = []
    for c in chunks:
        out += [np.asarray(c, dtype="float32").reshape(-1), gap]
    return np.concatenate(out) if out else np.zeros(rate, dtype="float32")


def split_lyrics(prompt, lyrics):
    """'style … \\n Lyrics: …' or [verse] blocks in the prompt → (caption, lyrics)."""
    if lyrics:
        return prompt.strip(), lyrics.strip()
    m = re.search(r"(?im)^\s*lyrics\s*:\s*", prompt)
    if m:
        return prompt[:m.start()].strip(), prompt[m.end():].strip()
    m = re.search(r"(?m)^\s*\[(verse|chorus|intro|bridge|hook|pre-chorus|outro)", prompt, re.I)
    if m:
        return prompt[:m.start()].strip(), prompt[m.start():].strip()
    return prompt.strip(), ""


# ── engine-Python families ───────────────────────────────────────────────────
def run_musicgen(job):
    from transformers import pipeline
    dev = device()
    pipe = pipeline("text-to-audio", model=job["repo"], device=dev)
    tokens = int(max(2, min(60, float(job.get("seconds") or 15))) * 50)  # ≈50 tokens per second
    out = pipe(job["prompt"], forward_params={"do_sample": True, "max_new_tokens": tokens})
    return out["audio"], out["sampling_rate"], dev


def run_bark(job):
    import torch
    from transformers import AutoProcessor, BarkModel
    dev = device()
    proc = AutoProcessor.from_pretrained(job["repo"])
    model = BarkModel.from_pretrained(job["repo"], torch_dtype=torch.float16 if dev == "cuda" else torch.float32).to(dev)
    rate = model.generation_config.sample_rate
    preset = job.get("voice") or "v2/en_speaker_6"
    chunks = []
    for p in sentences(job["prompt"], 200)[:40]:
        inputs = proc(p, voice_preset=preset, return_tensors="pt").to(dev)
        with torch.no_grad():
            audio = model.generate(**inputs, pad_token_id=proc.tokenizer.pad_token_id)
        chunks.append(audio.cpu().float().numpy().reshape(-1))
    return join_chunks(chunks, rate), rate, dev


KOKORO_LANG = {"a": "a", "b": "b", "e": "e", "f": "f", "h": "h", "i": "i", "j": "j", "p": "p", "z": "z"}


def run_kokoro(job):
    from kokoro import KPipeline
    voice = job.get("voice") or "af_heart"
    lang = KOKORO_LANG.get(voice[:1], "a")
    dev = device()
    pipe = KPipeline(lang_code=lang, repo_id=job["repo"], device=dev if dev != "mps" else "cpu")
    chunks = []
    for _gs, _ps, audio in pipe(job["prompt"], voice=voice, speed=float(job.get("speed") or 1.0), split_pattern=r"\n+"):
        if audio is not None:
            chunks.append(audio.cpu().numpy() if hasattr(audio, "cpu") else audio)
    return join_chunks(chunks, 24000, 0.15), 24000, dev


def run_stableaudio(job):
    import torch
    from diffusers import StableAudioPipeline
    dev = device()
    pipe = load_pipe(StableAudioPipeline, job["repo"], torch.float16 if dev == "cuda" else torch.float32)
    if dev == "cuda" and vram_gb() < 12:
        pipe.enable_model_cpu_offload()
    else:
        pipe = pipe.to(dev)
    seconds = max(1.0, min(47.0, float(job.get("seconds") or 10)))
    out = pipe(job["prompt"], negative_prompt="Low quality.", num_inference_steps=int(job.get("steps") or 100),
               audio_end_in_s=seconds, num_waveforms_per_prompt=1).audios
    return out[0].T.float().cpu().numpy(), pipe.vae.sampling_rate, dev


def run_diffusers_audio(job):
    import torch
    from diffusers import DiffusionPipeline
    dev = device()
    pipe = load_pipe(DiffusionPipeline, job["repo"], torch.float16 if dev == "cuda" else torch.float32)
    if dev == "cuda" and vram_gb() < 12 and hasattr(pipe, "enable_model_cpu_offload"):
        pipe.enable_model_cpu_offload()
    else:
        pipe = pipe.to(dev)
    seconds = max(1.0, min(60.0, float(job.get("seconds") or 10)))
    kw = {}
    import inspect
    sig = inspect.signature(pipe.__call__).parameters
    for name in ("audio_length_in_s", "audio_end_in_s"):
        if name in sig:
            kw[name] = seconds
    if "num_inference_steps" in sig:
        kw["num_inference_steps"] = int(job.get("steps") or 100)
    res = pipe(job["prompt"], **kw)
    audio = getattr(res, "audios", None)
    if audio is None:
        raise RuntimeError("This model is not an audio pipeline.")
    a = audio[0]
    a = a.float().cpu().numpy() if hasattr(a, "cpu") else a
    rate = getattr(getattr(pipe, "vae", None), "sampling_rate", None) or getattr(getattr(pipe, "vocoder", None), "config", None)
    rate = getattr(rate, "sampling_rate", rate) if not isinstance(rate, int) else rate
    return a, int(rate or 16000), dev


def run_tts(job):
    from transformers import pipeline
    dev = device()
    for task in ("text-to-speech", "text-to-audio"):
        try:
            pipe = pipeline(task, model=job["repo"], device=dev)
            break
        except Exception as e:  # noqa: BLE001
            err = e
    else:
        raise RuntimeError("This voice model can't be loaded by the built-in engine: " + str(err)[:200])
    chunks, rate = [], 16000
    for p in sentences(job["prompt"]):
        out = pipe(p)
        rate = out["sampling_rate"]
        chunks.append(out["audio"])
    return join_chunks(chunks, rate), rate, dev


# ── own-Python families (run with the private runtime from audio_backends.py) ───
def acestep_checkpoints(repo):
    """Use the copy God's Pandora downloaded; only small missing pieces are fetched."""
    from huggingface_hub import snapshot_download
    try:
        path = snapshot_download(repo, local_files_only=True)
    except Exception:  # noqa: BLE001
        path = None
    need = ("acestep-v15-turbo", "vae", "Qwen3-Embedding-0.6B")
    if path and all(os.path.isdir(os.path.join(path, n)) for n in need):
        try:  # older downloads skipped a few small files (.pt / code) — top them up
            snapshot_download(repo, allow_patterns=["*.pt", "*.py", "*.json", "*.txt", "*.model"])
        except Exception:  # noqa: BLE001
            pass
        return path
    return None  # ACE-Step downloads its own copy into the app's audio folder


def run_acestep(job):
    import tempfile
    ckpt = acestep_checkpoints(job["repo"]) if "/" in (job.get("repo") or "") else None
    if ckpt:
        os.environ["ACESTEP_CHECKPOINTS_DIR"] = ckpt
    else:
        os.environ["ACESTEP_CHECKPOINTS_DIR"] = os.path.join(os.path.dirname(os.getcwd()), "checkpoints")
    sys.path.insert(0, os.getcwd())
    from acestep.handler import AceStepHandler
    from acestep.inference import GenerationConfig, GenerationParams, generate_music
    low = 0 < vram_gb() < 12
    h = AceStepHandler()
    msg, ok = h.initialize_service(project_root=os.getcwd(), config_path="acestep-v15-turbo", device="auto",
                                   offload_to_cpu=low, offload_dit_to_cpu=False)
    if not ok:
        raise RuntimeError("ACE-Step could not start: " + str(msg)[:300])
    caption, lyrics = split_lyrics(job["prompt"], job.get("lyrics") or "")
    secs = float(job.get("seconds") or 0)
    params = GenerationParams(task_type="text2music", thinking=False, caption=caption,
                              lyrics=lyrics or "[Instrumental]", duration=secs if secs >= 10 else -1.0)
    if job.get("seed") not in (None, ""):
        params.seed = int(job["seed"])
    cfg = GenerationConfig(batch_size=1, audio_format="wav", use_random_seed=job.get("seed") in (None, ""))
    out_dir = tempfile.mkdtemp(prefix="pandora-acestep-")
    res = generate_music(h, None, params, cfg, save_dir=out_dir)
    if not getattr(res, "success", True) or not res.audios:
        raise RuntimeError(getattr(res, "error", None) or "ACE-Step produced no audio.")
    return {"path": res.audios[0]["path"], "device": h.device if hasattr(h, "device") else "cuda"}


def run_chatterbox(job):
    import torch
    dev = device()
    lang = (job.get("voice") or "en").split(":")[0]
    if lang and lang != "en":
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        model = ChatterboxMultilingualTTS.from_pretrained(device=dev)
        gen = lambda t: model.generate(t, language_id=lang)  # noqa: E731
    else:
        from chatterbox.tts import ChatterboxTTS
        model = ChatterboxTTS.from_pretrained(device=dev)
        gen = lambda t: model.generate(t)  # noqa: E731
    chunks = []
    with torch.no_grad():
        for p in sentences(job["prompt"], 300):
            chunks.append(gen(p).cpu().numpy().reshape(-1))
    return join_chunks(chunks, model.sr), model.sr, dev


def run_f5(job):
    from importlib.resources import files
    from f5_tts.api import F5TTS
    import tempfile
    dev = device()
    tts = F5TTS(device=dev)
    ref = str(files("f5_tts").joinpath("infer/examples/basic/basic_ref_en.wav"))
    out = os.path.join(tempfile.mkdtemp(prefix="pandora-f5-"), "f5.wav")
    tts.infer(ref_file=ref, ref_text="Some call me nature, others call me mother nature.",
              gen_text=job["prompt"], file_wave=out, seed=int(job["seed"]) if job.get("seed") not in (None, "") else None)
    return {"path": out, "device": dev}


def run_xtts(job):
    os.environ.setdefault("COQUI_TOS_AGREED", "1")
    from TTS.api import TTS
    import tempfile
    dev = device()
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(dev)
    voice = job.get("voice") or "en:Ana Florence"
    lang, _, speaker = voice.partition(":")
    out = os.path.join(tempfile.mkdtemp(prefix="pandora-xtts-"), "xtts.wav")
    tts.tts_to_file(text=job["prompt"], speaker=speaker or "Ana Florence", language=lang or "en", file_path=out)
    return {"path": out, "device": dev}


def run_parler(job):
    import torch
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer
    dev = device()
    model = ParlerTTSForConditionalGeneration.from_pretrained(job["repo"]).to(dev)
    tok = AutoTokenizer.from_pretrained(job["repo"])
    desc = job.get("voice") or "A clear, expressive female voice with a moderate pace, recorded in a quiet room with very high quality."
    d_ids = tok(desc, return_tensors="pt").input_ids.to(dev)
    chunks = []
    for p in sentences(job["prompt"]):
        p_ids = tok(p, return_tensors="pt").input_ids.to(dev)
        with torch.no_grad():
            gen = model.generate(input_ids=d_ids, prompt_input_ids=p_ids)
        chunks.append(gen.cpu().float().numpy().reshape(-1))
    rate = model.config.sampling_rate
    return join_chunks(chunks, rate), rate, dev


RUNNERS = {
    "musicgen": run_musicgen, "bark": run_bark, "kokoro": run_kokoro, "stableaudio": run_stableaudio,
    "audioldm": run_diffusers_audio, "diffusers-audio": run_diffusers_audio, "tts": run_tts,
    "acestep": run_acestep, "chatterbox": run_chatterbox, "f5": run_f5, "xtts": run_xtts, "parler": run_parler,
}


def main():
    out = sys.argv[1]
    job = json.loads(sys.stdin.read() or "{}")
    job["prompt"] = str(job.get("prompt") or "").strip()
    if not job["prompt"] and not job.get("lyrics"):
        print(json.dumps({"error": "Write what to generate first."}))
        return
    fam = job.get("family")
    if fam not in RUNNERS:
        sys.path.insert(0, HERE)
        from audio_families import detect
        fam = detect(job.get("repo"))
    run = RUNNERS.get(fam)
    if not run:
        print(json.dumps({"error": f"{job.get('repo')} is not supported by the built-in audio engine yet."}))
        return
    seed_all(job.get("seed"))
    res = run(job)
    if isinstance(res, dict):  # the runner saved its own file
        import shutil
        shutil.move(res["path"], out) if res["path"].lower().endswith(".wav") else convert(res["path"], out)
        print(json.dumps({"file": out, "device": res.get("device", "")}))
        return
    audio, rate, dev = res
    write_wav(out, audio, rate)
    print(json.dumps({"file": out, "device": dev}))


def convert(src, out):
    import soundfile as sf
    data, rate = sf.read(src, dtype="float32")
    write_wav(out, data, rate)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        low = msg.lower()
        if "out of memory" in low:
            msg = "Not enough GPU memory for this audio model — close other apps, shorten the text, or pick a lighter model."
        elif "no module named" in low:
            msg = "This model's audio engine isn't set up yet (" + msg + "). Click 'Set up' on the model and try again."
        print(json.dumps({"error": msg[:500]}))
