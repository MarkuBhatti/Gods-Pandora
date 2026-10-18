"""Free, offline speech-to-text for God's Pandora (OpenAI Whisper, ~99 languages).

Two backends, picked automatically:
  • faster-whisper (fastest) if it is installed
  • 🤗 transformers Whisper — already part of the local engine, works on every Python version, GPU via torch
Audio arrives as 16 kHz mono WAV (the app converts it with ffmpeg first), so no extra decoders are needed.

usage:  python transcribe.py --serve        (long-running: one JSON request per stdin line)
        python transcribe.py <wav> [model] [language|auto] [transcribe|translate]
"""
import json
import os
import sys
import wave

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
import warnings  # noqa: E402
warnings.filterwarnings("ignore")

HF_IDS = {"tiny": "openai/whisper-tiny", "base": "openai/whisper-base", "small": "openai/whisper-small",
          "medium": "openai/whisper-medium", "large-v3-turbo": "openai/whisper-large-v3-turbo", "large-v3": "openai/whisper-large-v3"}
_CACHE = {}


def backend():
    try:
        import faster_whisper  # noqa: F401
        return "faster"
    except Exception:
        pass
    try:
        import transformers  # noqa: F401
        import torch  # noqa: F401
        return "hf"
    except Exception:
        return None


def read_wav(path):
    import numpy as np
    with wave.open(path, "rb") as w:
        sr, n, ch, sw = w.getframerate(), w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    dtype = {1: np.int8, 2: np.int16, 4: np.int32}[sw]
    a = np.frombuffer(raw, dtype=dtype).astype("float32") / float(np.iinfo(dtype).max)
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    if sr != 16000:  # simple resample (the app normally sends 16 kHz already)
        idx = np.linspace(0, len(a) - 1, int(len(a) * 16000 / sr))
        a = np.interp(idx, np.arange(len(a)), a).astype("float32")
    return a


def load(name, kind):
    key = (kind, name)
    if key in _CACHE:
        return _CACHE[key]
    if kind == "faster":
        from faster_whisper import WhisperModel
        m = None
        try:
            import ctranslate2
            if ctranslate2.get_cuda_device_count() > 0:
                m = (WhisperModel(name, device="cuda", compute_type="float16"), "cuda")
        except Exception:
            m = None
        if m is None:
            m = (WhisperModel(name, device="cpu", compute_type="int8"), "cpu")
    else:
        import torch
        from transformers import pipeline
        dev = "cuda" if torch.cuda.is_available() else ("mps" if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available() else "cpu")
        dtype = torch.float16 if dev == "cuda" else torch.float32
        mid = HF_IDS.get(name, name)
        try:  # newer transformers use dtype=, older ones torch_dtype=
            pipe = pipeline("automatic-speech-recognition", model=mid, dtype=dtype, device=dev)
        except TypeError:
            pipe = pipeline("automatic-speech-recognition", model=mid, torch_dtype=dtype, device=dev)
        m = (pipe, dev)
    _CACHE[key] = m
    return m


def run(req):
    kind = backend()
    if not kind:
        return {"error": "NO_WHISPER"}
    name = req.get("model") or "small"
    lang = req.get("language") or None
    if lang == "auto":
        lang = None
    task = req.get("task") or "transcribe"
    model, dev = load(name, kind)
    if kind == "faster":
        segs, info = model.transcribe(req["file"], language=lang, task=task, beam_size=req.get("beam", 5), vad_filter=bool(req.get("vad", True)))
        return {"text": " ".join(s.text.strip() for s in segs).strip(), "language": info.language, "device": dev, "backend": "faster-whisper"}
    audio = read_wav(req["file"])
    if audio.size < 1600:
        return {"text": "", "language": lang or "", "device": dev, "backend": "transformers"}
    gen = {"task": task}
    if lang:
        gen["language"] = lang
    peak = float(abs(audio).max()) if audio.size else 0.0
    if 0 < peak < 0.3:  # quiet laptop mics: normalise so Whisper hears clearly
        audio = (audio * (0.5 / peak)).astype("float32")
    try:
        out = model({"raw": audio, "sampling_rate": 16000}, generate_kwargs=gen, return_timestamps=len(audio) > 16000 * 29)
    except (ValueError, TypeError):  # some versions reject language codes / task for this model
        gen.pop("language", None)
        out = model({"raw": audio, "sampling_rate": 16000}, generate_kwargs=gen, return_timestamps=len(audio) > 16000 * 29)
    text = (out.get("text") if isinstance(out, dict) else str(out)) or ""
    return {"text": text.strip(), "language": lang or "auto", "device": dev, "backend": "transformers"}


def serve():
    kind = backend()
    print(json.dumps({"ready": bool(kind), "backend": kind, "error": None if kind else "NO_WHISPER"}), flush=True)
    if not kind:
        return
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = None
        try:
            req = json.loads(line)
            res = run(req)
        except Exception as e:  # noqa: BLE001
            res = {"error": str(e)[:400]}
        res["id"] = req.get("id") if isinstance(req, dict) else None
        print(json.dumps(res, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--serve":
        serve()
    elif len(sys.argv) > 1:
        try:
            r = run({"file": sys.argv[1], "model": sys.argv[2] if len(sys.argv) > 2 else "small",
                     "language": sys.argv[3] if len(sys.argv) > 3 else "auto", "task": sys.argv[4] if len(sys.argv) > 4 else "transcribe"})
        except Exception as e:  # noqa: BLE001
            r = {"error": str(e)[:400]}
        print(json.dumps(r, ensure_ascii=False))
