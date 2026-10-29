"""Sets up the audio engines God's Pandora needs to run open-source audio models itself.

Some audio models need library versions that differ from the main engine (ACE-Step needs Python 3.11 +
PyTorch 2.7, Chatterbox pins PyTorch 2.6 …). Instead of sending the user to ComfyUI or another app,
God's Pandora builds a private, self-contained Python for each such model family — once — inside
<userData>/audio-backends/<family>. Python itself, the package cache and the environment all live there.

Run with the ENGINE Python:
  python audio_backends.py status            → {"families": {...}}
  python audio_backends.py ensure <family>   → JSON lines: {"event":"progress",...} … {"event":"done","python":...}

Environment: PANDORA_AUDIO_DIR (required) — where backends live.
"""
import json
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from audio_families import ENGINE_EXTRAS  # noqa: E402

ACESTEP_COMMIT = "ca1e85fe9430179831e6bc6be790c332190a3866"  # tested ACE-Step 1.5 source

# family → how to build its private runtime
ISOLATED = {
    "acestep": {"python": "3.11", "zip": f"https://github.com/ACE-Step/ACE-Step-1.5/archive/{ACESTEP_COMMIT}.zip", "gb": 7},
    "chatterbox": {"python": "3.11", "pip": ["chatterbox-tts"], "gb": 5},
    "f5": {"python": "3.11", "pip": ["f5-tts"], "gb": 5},
    "xtts": {"python": "3.11", "pip": ["coqui-tts"], "gb": 5},
    "parler": {"python": "3.11", "pip": ["parler-tts @ https://github.com/huggingface/parler-tts/archive/refs/heads/main.zip"], "gb": 5},
}
# engine-Python families that get their own runtime if the engine's Python can't take them (e.g. too new)
FALLBACK = {f: {"python": "3.11", "pip": list(pk), "gb": 3} for f, pk in ENGINE_EXTRAS.items()}
TORCH_CUDA_INDEX = "https://download.pytorch.org/whl/cu124"
TORCH_CPU_INDEX = "https://download.pytorch.org/whl/cpu"


def emit(**ev):
    print(json.dumps(ev), flush=True)


def base():
    d = os.environ.get("PANDORA_AUDIO_DIR") or os.path.join(os.path.expanduser("~"), ".gods-pandora-audio")
    os.makedirs(d, exist_ok=True)
    return d


def venv_python(venv):
    return os.path.join(venv, "Scripts", "python.exe") if os.name == "nt" else os.path.join(venv, "bin", "python")


def family_dir(family):
    return os.path.join(base(), family)


def runtime_info(family):
    """Where a ready isolated runtime lives (python + working dir), or None."""
    d = family_dir(family)
    py = venv_python(os.path.join(d, "venv"))
    if not (os.path.exists(py) and os.path.exists(os.path.join(d, ".ready"))):
        return None
    info = {"python": py, "cwd": d}
    if family == "acestep":
        info["cwd"] = os.path.join(d, "src")
    return info


def engine_extra_ready(family):
    try:
        if family == "kokoro":
            import importlib.util
            return importlib.util.find_spec("kokoro") is not None and importlib.util.find_spec("soundfile") is not None
    except Exception:  # noqa: BLE001
        return False
    return True


def status():
    fams = {f: bool(runtime_info(f)) for f in ISOLATED}
    fams.update({f: engine_extra_ready(f) or bool(runtime_info(f)) for f in ENGINE_EXTRAS})
    sizes = {f: v["gb"] for f, v in ISOLATED.items()}
    return {"families": fams, "sizesGB": sizes}


def has_nvidia():
    try:
        return subprocess.run(["nvidia-smi", "-L"], capture_output=True, timeout=15).returncode == 0
    except Exception:  # noqa: BLE001
        return False


def run(cmd, step, env=None, cwd=None):
    """Run a command, streaming its last output line as progress. Raises on failure."""
    emit(event="progress", step=step, message=" ".join(os.path.basename(c) if i == 0 else c for i, c in enumerate(cmd))[:200])
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, cwd=cwd,
                         text=True, encoding="utf-8", errors="replace",
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    tail = []
    for line in p.stdout:
        line = line.strip()
        if not line:
            continue
        tail = (tail + [line])[-25:]
        emit(event="progress", step=step, message=line[:200])
    if p.wait() != 0:
        raise RuntimeError(f"{step} failed: " + " | ".join(tail[-4:]))


def uv_cmd():
    """uv (fast Python + package manager) installed into the engine Python on demand."""
    try:
        subprocess.run([sys.executable, "-m", "uv", "--version"], check=True, capture_output=True)
    except Exception:  # noqa: BLE001
        run([sys.executable, "-m", "pip", "install", "--upgrade", "uv"], "Installing the package manager")
    return [sys.executable, "-m", "uv"]


def uv_env():
    b = base()
    env = dict(os.environ)
    env.update({
        "UV_PYTHON_INSTALL_DIR": os.path.join(b, "python"),  # private Python lives inside the app's data
        "UV_CACHE_DIR": os.path.join(b, "uv-cache"),
        "UV_LINK_MODE": "copy",
        "UV_PYTHON_PREFERENCE": "only-managed",  # never depend on whatever Python the PC has
        "UV_HTTP_TIMEOUT": "300",
        "PYTHONIOENCODING": "utf-8",
    })
    env.pop("VIRTUAL_ENV", None)
    return env


def download(url, dest, step):
    emit(event="progress", step=step, message=url)
    req = urllib.request.Request(url, headers={"User-Agent": "GodsPandora"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            done += len(chunk)
            if total:
                emit(event="progress", step=step, pct=int(done * 100 / total))


def ensure_isolated(family):
    spec = ISOLATED.get(family) or FALLBACK[family]
    ready = runtime_info(family)
    if ready:
        emit(event="done", **ready)
        return
    d = family_dir(family)
    os.makedirs(d, exist_ok=True)
    uv = uv_cmd()
    env = uv_env()
    venv = os.path.join(d, "venv")
    gpu = has_nvidia()

    if family == "acestep":
        src = os.path.join(d, "src")
        if not os.path.exists(os.path.join(src, "pyproject.toml")):
            z = os.path.join(d, "acestep.zip")
            download(spec["zip"], z, "Downloading ACE-Step")
            tmp = os.path.join(d, "unzip")
            shutil.rmtree(tmp, ignore_errors=True)
            with zipfile.ZipFile(z) as zf:
                zf.extractall(tmp)
            inner = os.path.join(tmp, os.listdir(tmp)[0])
            shutil.rmtree(src, ignore_errors=True)
            shutil.move(inner, src)
            shutil.rmtree(tmp, ignore_errors=True)
            os.remove(z)
        # ACE-Step's own lock file → the exact, tested versions (CUDA PyTorch, prebuilt Windows wheels)
        env["UV_PROJECT_ENVIRONMENT"] = venv
        run(uv + ["sync", "--python", spec["python"], "--no-dev"], "Installing ACE-Step (one time, several GB)", env=env, cwd=src)
    else:
        if not os.path.exists(venv_python(venv)):
            run(uv + ["venv", "--python", spec["python"], venv], "Creating a private Python " + spec["python"], env=env)
        py = venv_python(venv)
        index = TORCH_CUDA_INDEX if gpu else TORCH_CPU_INDEX
        run(uv + ["pip", "install", "--python", py, "torch", "torchaudio", "--index-url", index], "Installing PyTorch" + (" (CUDA)" if gpu else ""), env=env)
        run(uv + ["pip", "install", "--python", py, *spec["pip"], "soundfile", "numpy",
                  "--extra-index-url", index, "--index-strategy", "unsafe-best-match"], "Installing " + family, env=env)
    with open(os.path.join(d, ".ready"), "w", encoding="utf-8") as f:
        f.write("ok")
    emit(event="done", **runtime_info(family))


def ensure_engine_extra(family):
    if runtime_info(family):
        emit(event="done", **runtime_info(family))
        return
    if engine_extra_ready(family):
        emit(event="done", python=sys.executable)
        return
    # keep the engine's core libraries exactly as they are
    pins = []
    for name in ("torch", "torchvision", "torchaudio", "transformers", "diffusers", "numpy", "huggingface_hub", "accelerate"):
        try:
            from importlib.metadata import version
            pins.append(f"{name}=={version(name)}")
        except Exception:  # noqa: BLE001
            pass
    cons = os.path.join(base(), "engine-constraints.txt")
    with open(cons, "w", encoding="utf-8") as f:
        f.write("\n".join(pins))
    try:
        run([sys.executable, "-m", "pip", "install", "--prefer-binary", *ENGINE_EXTRAS[family], "-c", cons],
            "Installing " + family + " into the engine")
    except Exception as e:  # noqa: BLE001  — e.g. engine Python too new for this package
        emit(event="progress", step="Building a private runtime instead", message=str(e)[:200])
        ensure_isolated(family)
        return
    emit(event="done", python=sys.executable)


def ensure(family):
    if family in ISOLATED:
        ensure_isolated(family)
    elif family in ENGINE_EXTRAS:
        ensure_engine_extra(family)
    else:
        emit(event="done", python=sys.executable)


if __name__ == "__main__":
    try:
        if sys.argv[1] == "status":
            print(json.dumps(status()), flush=True)
        elif sys.argv[1] == "ensure":
            ensure(sys.argv[2])
        else:
            raise SystemExit("usage: audio_backends.py status | ensure <family>")
    except Exception as e:  # noqa: BLE001
        emit(event="error", message=str(e)[:600])
        sys.exit(1)
