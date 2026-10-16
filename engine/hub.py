"""Small, quiet, offline-friendly model downloads.

Hugging Face model repos often contain the same weights 3-5 times (fp32 + fp16, .ckpt + .safetensors,
ONNX, Flax, EMA copies). Downloading the whole repo wastes 10-20 GB and lots of time. This module plans
a download that fetches only what diffusers actually loads: the config files plus ONE copy of the
weights per component — fp16 safetensors when available, otherwise regular safetensors.

It also silences the noisy-but-harmless library warnings (symlinks on Windows, deprecations, telemetry).
"""
import fnmatch
import logging
import os
import warnings


def quiet():
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("HF_HUB_DISABLE_IMPLICIT_TOKEN", "1")
    os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
    os.environ.setdefault("DIFFUSERS_VERBOSITY", "error")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    warnings.filterwarnings("ignore", category=FutureWarning)
    warnings.filterwarnings("ignore", category=DeprecationWarning)
    warnings.filterwarnings("ignore", category=UserWarning, module=r"(huggingface_hub|torch|diffusers|transformers|accelerate)(\..*)?")
    warnings.filterwarnings("ignore", message=r".*(symlink|unauthenticated|local_dir_use_symlinks|torch_dtype|jit\.script).*")
    for name in ("huggingface_hub", "diffusers", "transformers", "accelerate", "urllib3"):
        logging.getLogger(name).setLevel(logging.ERROR)


SKIP_EXT = (".ckpt", ".bin", ".onnx", ".onnx_data", ".msgpack", ".h5", ".pt", ".pth", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".md")
KEEP_META = ("*.json", "*.txt", "*.model", "*vocab*", "*merges*", "*.jinja")


def plan(files):
    """Given a repo file list, return (allow_patterns, variant) for a diffusers-format repo, or (None, None)."""
    if "model_index.json" not in files:
        return None, None
    allow = ["model_index.json"]
    folders = sorted({f.split("/")[0] for f in files if "/" in f})
    fp16_any = False
    for d in folders:
        inside = [f for f in files if f.startswith(d + "/")]
        allow += [f"{d}/{m}" for m in KEEP_META]
        st = [f for f in inside if f.endswith(".safetensors")]
        fp16 = [f for f in st if ".fp16." in f or "fp16-" in f]
        if fp16:
            allow += fp16
            fp16_any = True
        elif st:
            allow += st
        else:  # rare: component only ships .bin weights
            allow += [f for f in inside if f.endswith(".bin")]
    return allow, ("fp16" if fp16_any else None)


MARKER = ".pandora-complete"


def repo_cache_dir(repo):
    home = os.environ.get("HF_HOME") or os.path.join(os.path.expanduser("~"), ".cache", "huggingface")
    return os.path.join(home, "hub", "models--" + repo.replace("/", "--"))


def mark_complete(repo, variant):
    try:
        with open(os.path.join(repo_cache_dir(repo), MARKER), "w", encoding="utf-8") as f:
            f.write(variant or "")
    except OSError:
        pass


def _sizes(repo, token=None):
    """{filename: bytes} for every file in the repo (one API call)."""
    try:
        from huggingface_hub import HfApi
        info = HfApi().model_info(repo, files_metadata=True, token=token)
        return {s.rfilename: (s.size or 0) for s in info.siblings}
    except Exception:  # noqa: BLE001
        return {}


def planned_size(repo, allow, token=None):
    """Bytes the planned download will occupy (for an honest progress bar)."""
    sizes = _sizes(repo, token)
    return sum(v for f, v in sizes.items() if any(fnmatch.fnmatch(f, a) for a in allow))


# ── real byte-level progress ────────────────────────────────────────────────
# huggingface_hub (plain HTTP and Xet) reports every downloaded chunk to a tqdm bar with unit="B".
# We count those chunks — this works even with progress bars disabled — so the app shows the true %.
_progress = {"done": 0, "total": 0}


def _hook_tqdm():
    try:
        import tqdm.std as _t
    except Exception:  # noqa: BLE001
        return
    if getattr(_t.tqdm, "_pandora_hooked", False):
        return
    orig_init, orig_update = _t.tqdm.__init__, _t.tqdm.update

    def _init(self, *a, **k):
        self._pandora_bytes = k.get("unit") == "B"
        if self._pandora_bytes and k.get("initial"):
            _progress["done"] += int(k.get("initial") or 0)  # resumed partial file
        orig_init(self, *a, **k)

    def _update(self, n=1):
        if getattr(self, "_pandora_bytes", False) and n:
            _progress["done"] += int(n)
        return orig_update(self, n)

    _t.tqdm.__init__, _t.tqdm.update, _t.tqdm._pandora_hooked = _init, _update, True


def fetch(repo, token=None, on_plan=None):
    """Download only what's needed; works offline when the files are already cached.
    Returns (local_path, variant)."""
    from huggingface_hub import HfApi, snapshot_download, try_to_load_from_cache
    try:
        sizes = _sizes(repo, token)
        files = list(sizes) or HfApi().list_repo_files(repo, token=token)
    except Exception:  # offline or rate-limited: use whatever is cached
        try:
            path = snapshot_download(repo, local_files_only=True, token=token)
            has_fp16 = any(".fp16." in n or "fp16-" in n for _r, _d, fs in os.walk(path) for n in fs)
            return path, ("fp16" if has_fp16 else None)
        except Exception:
            raise RuntimeError("No internet connection and this model isn't downloaded yet. Connect once to download it — after that it works offline.")
    allow, variant = plan(files)
    if allow is None:  # not a diffusers repo (single-file / other) — fetch safetensors + configs only
        allow = [f for f in files if not f.lower().endswith(SKIP_EXT) or f.endswith(".safetensors")]
        if not any(f.endswith(".safetensors") for f in allow):
            allow = [f for f in files if not any(fnmatch.fnmatch(f, "*" + e) for e in (".onnx", ".msgpack", ".h5"))]
    wanted = [f for f in files if any(fnmatch.fnmatch(f, a) for a in allow)]
    total = sum(sizes.get(f, 0) for f in wanted)
    # files already in the cache count as done (re-sync / resume shows the real remaining part)
    have = 0
    for f in wanted:
        try:
            if isinstance(try_to_load_from_cache(repo, f), str):
                have += sizes.get(f, 0)
        except Exception:  # noqa: BLE001
            pass
    _progress.update(done=have, total=total)
    if on_plan:
        on_plan(total)
    _hook_tqdm()
    path = snapshot_download(repo, allow_patterns=allow, token=token)
    _progress["done"] = _progress["total"]
    mark_complete(repo, variant)
    return path, variant


if __name__ == "__main__":  # used by the app's "Download" button: python hub.py <repo>  (token via HF_TOKEN env)
    import sys
    import threading
    import time
    quiet()
    repo = sys.argv[1]
    tok = os.environ.get("HF_TOKEN") or None  # never on the command line, so it can't leak into process lists
    stop = threading.Event()

    def _report():
        while not stop.is_set():
            if _progress["total"]:
                print("PROGRESS", min(_progress["done"], _progress["total"]), _progress["total"], flush=True)
            time.sleep(0.6)

    threading.Thread(target=_report, daemon=True).start()
    p, v = fetch(repo, tok, on_plan=lambda n: print("TOTAL", n, flush=True))
    stop.set()
    print("PROGRESS", _progress["total"], _progress["total"], flush=True)
    print("DOWNLOADED", p, v or "", flush=True)
