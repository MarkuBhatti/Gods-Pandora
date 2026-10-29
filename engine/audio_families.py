"""Which open-source audio models God's Pandora runs itself, and how.

Every family runs inside God's Pandora — no ComfyUI, Ollama or other apps:
  runtime "engine"   → runs in the app's own engine Python (engine-venv)
  runtime "isolated" → the model needs its own library versions, so the app builds a private,
                       self-contained Python for it once (under <userData>/audio-backends/<family>)

Keep in sync with electron/audioFamilies.js.
"""
import re

FAMILIES = {
    # name: (regex on repo id, runtime, audio type)
    "acestep":     (r"ace-?step", "isolated", "music"),
    "kokoro":      (r"kokoro", "engine", "speech"),
    "chatterbox":  (r"chatterbox", "isolated", "speech"),
    "f5":          (r"f5-?tts", "isolated", "speech"),
    "xtts":        (r"(^|/)xtts", "isolated", "speech"),
    "parler":      (r"parler", "isolated", "speech"),
    "musicgen":    (r"musicgen", "engine", "music"),
    "bark":        (r"(^|/)bark", "engine", "speech"),
    "stableaudio": (r"stable-audio-open", "engine", "music"),
    "audioldm":    (r"audioldm|musicldm", "engine", "sfx"),
    "tts":         (r"mms-tts|(^|/)vits|speecht5|seamless|(^|/)fastspeech", "engine", "speech"),
}

# Packages added to the engine Python on first use (pinned against the engine's torch/transformers).
ENGINE_EXTRAS = {
    "kokoro": ["kokoro>=0.9.4", "soundfile", "misaki[en]>=0.9.4"],
}


def detect(repo, files=None):
    """Family name for a repo id (and optionally its file list), or None if unsupported."""
    rid = (repo or "").lower()
    for name, (rx, _rt, _t) in FAMILIES.items():
        if re.search(rx, rid):
            return name
    files = files or []
    if any(f == "model_index.json" for f in files):
        return "diffusers-audio"
    return None


def runtime(family):
    if family == "diffusers-audio":
        return "engine"
    return FAMILIES.get(family, (None, None, None))[1]
