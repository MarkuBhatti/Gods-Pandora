"""Free, offline speech-to-text for God's Pandora (Whisper via faster-whisper, ~99 languages).

usage: python transcribe.py <audio_file> [model=small] [language=auto] [task=transcribe|translate]
prints one JSON line: {"text": ..., "language": ..., "device": ...} or {"error": ...}
"""
import json
import os
import sys

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "no audio file"}))
        return
    audio = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "small"
    lang = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] not in ("", "auto") else None
    task = sys.argv[4] if len(sys.argv) > 4 else "transcribe"
    try:
        from faster_whisper import WhisperModel
    except Exception:
        print(json.dumps({"error": "MISSING_FASTER_WHISPER"}))
        return
    model = None
    device = "cpu"
    # GPU first (fast), CPU int8 fallback (works everywhere)
    try:
        import ctranslate2
        if ctranslate2.get_cuda_device_count() > 0:
            model = WhisperModel(model_name, device="cuda", compute_type="float16")
            device = "cuda"
    except Exception:
        model = None
    if model is None:
        model = WhisperModel(model_name, device="cpu", compute_type="int8")
        device = "cpu"
    try:
        segments, info = model.transcribe(audio, language=lang, task=task, beam_size=5, vad_filter=True)
        text = " ".join(s.text.strip() for s in segments).strip()
    except Exception as e:  # e.g. CUDA libraries missing at run time → retry on CPU
        if device == "cuda":
            model = WhisperModel(model_name, device="cpu", compute_type="int8")
            device = "cpu"
            segments, info = model.transcribe(audio, language=lang, task=task, beam_size=5, vad_filter=True)
            text = " ".join(s.text.strip() for s in segments).strip()
        else:
            raise e
    print(json.dumps({"text": text, "language": info.language, "probability": round(info.language_probability, 3), "device": device}, ensure_ascii=False))


_MODELS = {}


def _load(name):
    """Cached Whisper model: GPU first, CPU int8 fallback."""
    if name in _MODELS:
        return _MODELS[name]
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
    _MODELS[name] = m
    return m


def serve():
    """Long-running mode for the app: one JSON request per stdin line, one JSON answer per stdout line.
    Keeps models in memory so voice commands and "Hey Pandora" answer in about a second."""
    try:
        import faster_whisper  # noqa: F401
    except Exception:
        print(json.dumps({"ready": False, "error": "MISSING_FASTER_WHISPER"}), flush=True)
        return
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = None
        try:
            req = json.loads(line)
            model, device = _load(req.get("model") or "small")
            lang = req.get("language") or None
            if lang == "auto":
                lang = None
            try:
                segs, info = model.transcribe(req["file"], language=lang, task=req.get("task") or "transcribe",
                                              beam_size=req.get("beam", 5), vad_filter=bool(req.get("vad", True)))
                text = " ".join(x.text.strip() for x in segs).strip()
            except Exception:
                if device != "cuda":
                    raise
                _MODELS.pop(req.get("model") or "small", None)
                from faster_whisper import WhisperModel
                model = WhisperModel(req.get("model") or "small", device="cpu", compute_type="int8")
                _MODELS[req.get("model") or "small"] = (model, "cpu")
                device = "cpu"
                segs, info = model.transcribe(req["file"], language=lang, task=req.get("task") or "transcribe", beam_size=req.get("beam", 5))
                text = " ".join(x.text.strip() for x in segs).strip()
            print(json.dumps({"id": req.get("id"), "text": text, "language": info.language, "device": device}, ensure_ascii=False), flush=True)
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"id": req.get("id") if isinstance(req, dict) else None, "error": str(e)[:300]}), flush=True)


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "--serve":
    serve()
    sys.exit(0)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": str(e)[:400]}))
