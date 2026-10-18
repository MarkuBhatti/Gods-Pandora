"""Free, local audio for God's Pandora (runs in the engine's Python with 🤗 transformers — already installed).

  music  : facebook/musicgen-small  (instrumental music from a description)
  speech : suno/bark-small          (expressive, multilingual voices; speaker presets like v2/en_speaker_6)

usage: python audio_gen.py <music|speech> <model_id> <out.wav> <seconds> <voice_preset>   (prompt text on stdin)
prints one JSON line: {"file": ...} or {"error": ...}
"""
import json
import os
import re
import sys
import wave

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
import warnings  # noqa: E402
warnings.filterwarnings("ignore")


def write_wav(path, audio, rate):
    import numpy as np
    a = np.asarray(audio, dtype="float32").reshape(-1)
    peak = float(np.max(np.abs(a))) if a.size else 0.0
    if peak > 1.0:
        a = a / peak
    pcm = (np.clip(a, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(rate))
        w.writeframes(pcm.tobytes())


def device():
    import torch
    return "cuda" if torch.cuda.is_available() else "cpu"


def music(model_id, prompt, seconds):
    from transformers import pipeline
    dev = device()
    pipe = pipeline("text-to-audio", model=model_id, device=dev)
    tokens = int(max(2, min(30, seconds)) * 50)  # MusicGen ≈ 50 tokens per second
    out = pipe(prompt, forward_params={"do_sample": True, "max_new_tokens": tokens})
    return out["audio"], out["sampling_rate"], dev


def speech(model_id, text, preset):
    import numpy as np
    import torch
    from transformers import AutoProcessor, BarkModel
    dev = device()
    proc = AutoProcessor.from_pretrained(model_id)
    model = BarkModel.from_pretrained(model_id, torch_dtype=torch.float16 if dev == "cuda" else torch.float32).to(dev)
    rate = model.generation_config.sample_rate
    # Bark speaks ~13 s per pass → split long scripts into sentences and join them with short pauses
    parts, cur = [], ""
    for s in re.split(r"(?<=[.!?।۔。！？])\s+", text.strip()):
        if len(cur) + len(s) < 200:
            cur = (cur + " " + s).strip()
        else:
            if cur:
                parts.append(cur)
            cur = s
    if cur:
        parts.append(cur)
    pause = np.zeros(int(rate * 0.25), dtype="float32")
    chunks = []
    for p in parts[:40]:
        inputs = proc(p, voice_preset=preset or "v2/en_speaker_6", return_tensors="pt").to(dev)
        with torch.no_grad():
            audio = model.generate(**inputs, pad_token_id=proc.tokenizer.pad_token_id)
        chunks += [audio.cpu().float().numpy().reshape(-1), pause]
    return np.concatenate(chunks) if chunks else np.zeros(rate, dtype="float32"), rate, dev


def main():
    task, model_id, out = sys.argv[1], sys.argv[2], sys.argv[3]
    seconds = float(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] else 10.0
    preset = sys.argv[5] if len(sys.argv) > 5 else ""
    text = sys.stdin.read().strip()
    if not text:
        print(json.dumps({"error": "Write what to generate first."}))
        return
    if task == "music":
        audio, rate, dev = music(model_id, text, seconds)
    else:
        audio, rate, dev = speech(model_id, text, preset)
    write_wav(out, audio, rate)
    print(json.dumps({"file": out, "device": dev}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        msg = str(e)
        if "out of memory" in msg.lower():
            msg = "Not enough GPU memory for this audio model — close other apps or try a shorter text."
        print(json.dumps({"error": msg[:400]}))
