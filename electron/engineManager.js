// Manages the built-in local inference engine (Python sidecar in ./engine).
// Models download into <userData>/models and run fully offline — Ollama/ComfyUI style.
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

// Every helper process runs hidden — the user never sees a console window pop up.
const hide = (o) => ({ windowsHide: true, ...(o || {}) });
const spawn = (cmd, args, o) => cp.spawn(cmd, args, hide(o));
const spawnSync = (cmd, args, o) => cp.spawnSync(cmd, args, hide(o));

// Silences harmless library chatter (symlink notices on Windows, telemetry, deprecations).
const QUIET_ENV = {
  HF_HUB_DISABLE_SYMLINKS_WARNING: '1', HF_HUB_DISABLE_TELEMETRY: '1', HF_HUB_DISABLE_PROGRESS_BARS: '1',
  TRANSFORMERS_VERBOSITY: 'error', DIFFUSERS_VERBOSITY: 'error', TOKENIZERS_PARALLELISM: 'false',
  PYTHONWARNINGS: 'ignore', PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8',
  PIP_DISABLE_PIP_VERSION_CHECK: '1',
};

let proc = null;
let wantRunning = false;   // watchdog: restart the engine if it exits on its own
let restarts = 0;
let lastStart = null;
const downloads = new Map(); // repo -> { proc, timer, cancelled }
let state = { installed: false, running: false, log: [] };
const PORT = 8756;

// Python can't read inside app.asar — the engine folder is unpacked next to it (build.asarUnpack)
function enginePath() { return path.join(__dirname, '..', 'engine').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep); }
function modelsDir(userData) { const d = path.join(userData, 'models'); fs.mkdirSync(d, { recursive: true }); return d; }
// Python versions with ready-made wheels for torch / diffusers / pyyaml on Windows. A brand-new or pre-release
// Python (e.g. 3.15) has none, so pip tries to compile packages and fails ("Microsoft Visual C++ 14.0 is required").
const GOOD_PY = ['3.12', '3.13', '3.11', '3.10', '3.14'];
const PRIVATE_PY_VER = '3.12.10';
const privatePy = (userData) => path.join(userData, 'python-' + PRIVATE_PY_VER, 'tools', 'python.exe');
function pyVersion(cmd, args = []) {
  try {
    const r = spawnSync(cmd, [...args, '-c', 'import sys;print("%d.%d"%sys.version_info[:2])'], { timeout: 20000 });
    return r.status === 0 ? String(r.stdout || '').trim() : null;
  } catch { return null; }
}
// best compatible Python on this PC: Pandora's own private copy, then py-launcher versions, then PATH
function findPython(userData) {
  const cands = [];
  if (userData && fs.existsSync(privatePy(userData))) cands.push([privatePy(userData), []]);
  if (process.platform === 'win32') for (const v of GOOD_PY) cands.push(['py', ['-' + v]]);
  cands.push(['python3', []], ['python', []]);
  let best = null; let other = null;
  for (const [cmd, args] of cands) {
    const v = pyVersion(cmd, args); if (!v) continue;
    const rank = GOOD_PY.indexOf(v);
    if (rank < 0) { other = other || v; continue; }
    if (!best || rank < best.rank) best = { cmd, args, v, rank };
    if (rank === 0) break;
  }
  return best ? { ...best, other } : { other };
}
function python() { const p = findPython(null); return p && p.cmd ? p.cmd : null; }
// Windows: download a private, isolated Python 3.12 (official python.org NuGet build, no installer, no admin)
async function ensurePrivatePython(userData) {
  const exe = privatePy(userData);
  if (fs.existsSync(exe)) return exe;
  if (process.platform !== 'win32') return null;
  const dir = path.dirname(path.dirname(exe)); fs.mkdirSync(dir, { recursive: true });
  const pkg = path.join(dir, 'python.zip');
  log(`Downloading a private Python ${PRIVATE_PY_VER} for the engine (about 15 MB, one time)…\n`);
  const r = await fetch(`https://www.nuget.org/api/v2/package/python/${PRIVATE_PY_VER}`, { redirect: 'follow' });
  if (!r.ok) throw new Error('Could not download Python (' + r.status + ')');
  fs.writeFileSync(pkg, Buffer.from(await r.arrayBuffer()));
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  let ok = fs.existsSync(tar) && spawnSync(tar, ['-xf', pkg, '-C', dir], { timeout: 180000 }).status === 0;
  if (!ok) ok = spawnSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${pkg.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`], { timeout: 300000 }).status === 0;
  try { fs.unlinkSync(pkg); } catch { /* ignore */ }
  if (!ok || !fs.existsSync(exe)) throw new Error('Could not unpack the private Python.');
  log('Private Python ready.\n');
  return exe;
}

function log(line) { state.log.push(line); if (state.log.length > 200) state.log.shift(); }

module.exports = {
  status(userData) {
    const venvReady = userData ? fs.existsSync(venvPy(path.join(userData, 'engine-venv'))) : false;
    return { ...state, installed: state.installed || venvReady, python: process.platform === 'win32' || !!python(), port: PORT };
  },

  // pip-installs the engine requirements into a dedicated venv inside userData
  install(userData) {
    return new Promise(async (resolve) => {
      const venv = path.join(userData, 'engine-venv');
      // an engine built on an unsupported Python (e.g. 3.15) can never install its packages → rebuild it
      if (fs.existsSync(venvPy(venv))) {
        const vv = pyVersion(venvPy(venv));
        if (vv && !GOOD_PY.includes(vv)) { log(`The engine was set up with Python ${vv}, which has no ready-made packages yet — rebuilding it with a supported Python…\n`); try { fs.rmSync(venv, { recursive: true, force: true }); } catch { /* ignore */ } }
      }
      let found = findPython(userData);
      let pyCmd = found.cmd ? [found.cmd, ...found.args] : null;
      if (!pyCmd) {
        try { const exe = await ensurePrivatePython(userData); if (exe) pyCmd = [exe]; } catch (e) { log(String(e.message || e) + '\n'); }
      }
      if (!pyCmd) {
        return resolve({ ok: false, error: found.other
          ? `Your Python is ${found.other}, which is too new for the AI packages. Install Python 3.12 from python.org, then click Install engine again.`
          : 'Python 3.10–3.13 not found. Install Python 3.12 from python.org, then click Install engine again.' });
      }
      log('Using Python: ' + pyCmd.join(' ') + (found.v ? ' (' + found.v + ')' : '') + '\n');
      const py = pyCmd[0]; const pyArgs = pyCmd.slice(1);
      // NVIDIA GPU → install the CUDA build of PyTorch first (PyPI's Windows wheel is CPU-only)
      let nvidia = false;
      try { nvidia = spawnSync('nvidia-smi', ['-L']).status === 0; } catch { /* no driver */ }
      const TORCH_INDEX = 'https://download.pytorch.org/whl/cu130';
      const steps = [
        ...(fs.existsSync(venvPy(venv)) ? [] : [[py, [...pyArgs, '-m', 'venv', venv]]]),
        [venvPy(venv), ['-m', 'pip', 'install', '--upgrade', 'pip']],
      ];
      if (nvidia && process.platform !== 'darwin') {
        const cudaOk = fs.existsSync(venvPy(venv)) &&
          String(spawnSync(venvPy(venv), ['-c', 'import torch;print(torch.version.cuda)']).stdout || '').trim().match(/^\d/);
        steps.push([venvPy(venv), ['-m', 'pip', 'install', '--upgrade', ...(cudaOk ? [] : ['--force-reinstall']), 'torch', 'torchvision', '--index-url', TORCH_INDEX]]);
        log('NVIDIA GPU detected — installing CUDA PyTorch from ' + TORCH_INDEX + '\n');
      }
      steps.push([venvPy(venv), ['-m', 'pip', 'install', '--prefer-binary', '-r', path.join(enginePath(), 'requirements.txt')]]);
      const run = (i) => {
        if (i >= steps.length) {
          state.installed = true;
          // Optional extras for local Shapeshift (torch.compile on Windows) — never blocks the install
          if (process.platform === 'win32') {
            const x = spawn(venvPy(venv), ['-m', 'pip', 'install', 'triton-windows']);
            x.stdout.on('data', (d) => log(d.toString())); x.stderr.on('data', (d) => log(d.toString()));
            x.on('close', () => resolve({ ok: true }));
            return undefined;
          }
          return resolve({ ok: true });
        }
        const p = spawn(steps[i][0], steps[i][1]);
        p.stdout.on('data', (d) => log(d.toString()));
        p.stderr.on('data', (d) => log(d.toString()));
        p.on('close', (code) => (code === 0 ? run(i + 1) : resolve({ ok: false, error: `Step ${i} failed (code ${code}). See engine log.` })));
      };
      run(0);
    });
  },

  start(userData, token) {
    if (proc) return { ok: true, already: true };
    const venv = path.join(userData, 'engine-venv');
    const py = fs.existsSync(venvPy(venv)) ? venvPy(venv) : null;
    if (!py) return { ok: false, error: 'Install the local engine first (Pandora Core & Cloud → Install engine).' };
    wantRunning = true;
    lastStart = { userData, token };
    proc = spawn(py, [path.join(enginePath(), 'server.py'), '--port', String(PORT), '--models-dir', modelsDir(userData)], {
      env: { ...process.env, ...QUIET_ENV, HF_HOME: modelsDir(userData), ...(token ? { HF_TOKEN: token } : {}) },
      windowsHide: true,
    });
    const started = Date.now();
    proc.stdout.on('data', (d) => log(d.toString()));
    proc.stderr.on('data', (d) => log(d.toString()));
    proc.on('error', (e) => log('Engine could not start: ' + e.message + '\n'));
    proc.on('close', (code) => {
      proc = null; state.running = false;
      // Watchdog: if the engine dies unexpectedly (driver hiccup, out of RAM) bring it back quietly.
      // The app itself never goes down with it — generation just shows a friendly retry message.
      if (!wantRunning) return;
      restarts = Date.now() - started > 60000 ? 0 : restarts + 1;
      if (restarts > 3) { log('Engine stopped repeatedly — open Pandora Models → Engine to repair it.\n'); wantRunning = false; return; }
      log('Engine stopped (code ' + code + ') — restarting automatically…\n');
      setTimeout(() => { if (wantRunning && !proc) module.exports.start(lastStart.userData, lastStart.token); }, 1500 * (restarts + 1));
    });
    state.running = true;
    return { ok: true };
  },

  stop() {
    wantRunning = false;
    if (proc) { proc.kill(); proc = null; }
    state.running = false;
    return { ok: true };
  },

  // Download an open-source model from Hugging Face into app storage.
  // opts: { token, totalBytes, onProgress({repo, bytes, total, done, error}) }
  downloadModel(userData, repoId, opts = {}) {
    return new Promise((resolve) => {
      const repo = String(repoId || '').trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return resolve({ ok: false, error: 'Invalid Hugging Face repo id: ' + repo });
      if (downloads.has(repo)) return resolve({ ok: false, error: 'Already downloading ' + repo });
      const venv = path.join(userData, 'engine-venv');
      const py = fs.existsSync(venvPy(venv)) ? venvPy(venv) : python();
      if (!py) return resolve({ ok: false, error: 'Python 3.10+ not found. Install Python from python.org, then click "Install engine" on the Models page.' });
      const check = spawnSync(py, ['-c', 'import huggingface_hub']);
      if (check.status !== 0) return resolve({ ok: false, error: 'The local engine is not installed yet. Click "Install engine" (Models or Update page) first — it sets up the Hugging Face downloader.' });

      const env = { ...process.env, ...QUIET_ENV, HF_HOME: modelsDir(userData) };
      if (opts.token) env.HF_TOKEN = opts.token;
      // engine/hub.py downloads ONE fp16 copy of the weights + configs (not the whole multi-GB repo)
      const p = spawn(py, [path.join(enginePath(), 'hub.py'), repo], { env, windowsHide: true });
      let errTail = '';
      let total = opts.totalBytes || 0;
      let live = null; // real byte counts reported by hub.py (PROGRESS done total)
      p.stdout.on('data', (d) => {
        const t = d.toString();
        const m = t.match(/TOTAL (\d+)/);
        if (m && +m[1] > 0) total = +m[1];
        const all = [...t.matchAll(/PROGRESS (\d+) (\d+)/g)];
        if (all.length) { const last = all[all.length - 1]; live = { bytes: +last[1], total: +last[2] }; if (live.total) total = live.total; }
        else log(t);
      });
      p.stderr.on('data', (d) => { const t = d.toString(); errTail = (errTail + t).slice(-2000); log(t); });

      const report = (extra = {}) => {
        if (!opts.onProgress) return;
        let bytes = 0;
        if (live) bytes = live.bytes;
        else if (!total) { try { bytes = require('./hfModels').bytesOnDisk(modelsDir(userData), repo); } catch (_) {} }
        if (extra.done && !extra.error && total) bytes = total;
        opts.onProgress({ repo, bytes: total ? Math.min(bytes, total) : bytes, total, ...extra });
      };
      const timer = setInterval(() => report(), 700);
      downloads.set(repo, { proc: p, timer });

      p.on('close', (code, signal) => {
        clearInterval(timer);
        const cancelled = downloads.get(repo)?.cancelled;
        downloads.delete(repo);
        if (cancelled) { report({ done: true, error: 'cancelled' }); return resolve({ ok: false, error: 'Download cancelled. Partial files are kept and resume next time.' }); }
        if (code === 0) { report({ done: true }); return resolve({ ok: true }); }
        let error = 'Download failed. See engine log.';
        if (/401|403|gated|GatedRepo|restricted/i.test(errTail)) {
          error = 'This model is gated. Accept its license on huggingface.co (open the model page while logged in), then add your Hugging Face token in Settings → API Keys → "huggingface".';
        } else if (/404|RepositoryNotFound|not found/i.test(errTail)) {
          error = 'Model not found on Hugging Face: ' + repo;
        } else if (/No space left|ENOSPC|disk/i.test(errTail)) {
          error = 'Not enough disk space for this model.';
        } else if (/No internet|ConnectionError|resolve|timed out|offline/i.test(errTail)) {
          error = 'No internet connection. Connect and press Download again — it resumes where it stopped.';
        }
        report({ done: true, error });
        resolve({ ok: false, error });
      });
    });
  },

  cancelDownload(repo) {
    const d = downloads.get(repo);
    if (!d) return { ok: false, error: 'Not downloading.' };
    d.cancelled = true;
    try { d.proc.kill(); } catch (_) {}
    return { ok: true };
  },

  activeDownloads() { return [...downloads.keys()]; },

  deleteModel(userData, repo) {
    if (downloads.has(repo)) return { ok: false, error: 'Cancel the download first.' };
    const dir = require('./hfModels').repoDir(modelsDir(userData), repo);
    if (!fs.existsSync(dir)) return { ok: false, error: 'Not in storage.' };
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true };
  },

  modelsDir,

  // GPU / VRAM report from the engine venv (works without starting the server)
  hardware(userData) {
    const venv = path.join(userData, 'engine-venv');
    if (!fs.existsSync(venvPy(venv))) return { installed: false };
    const code = 'import json,torch\nd={"cuda":torch.cuda.is_available(),"mps":torch.backends.mps.is_available()}\n' +
      'if d["cuda"]:\n p=torch.cuda.get_device_properties(0); d.update(gpu=p.name, vram_gb=round(p.total_memory/1024**3,1))\nprint(json.dumps(d))';
    const r = spawnSync(venvPy(venv), ['-c', code], { timeout: 60000 });
    try { return { installed: true, ...JSON.parse(String(r.stdout).trim().split('\n').pop()) }; }
    catch { return { installed: true, error: String(r.stderr || '').slice(-300) }; }
  },

  // Local Identity Lock: DreamBooth-style LoRA (SDXL / SD 1.5) with engine/train_lora.py
  trainLora(userData, { base, files, trigger, classWord = 'person', steps = 800, rank = 16, token }, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      const venv = path.join(userData, 'engine-venv');
      if (!fs.existsSync(venvPy(venv))) return reject(new Error('Install the local engine first (Models → Install engine).'));
      const work = path.join(userData, 'soul', trigger + '-' + Date.now());
      const imgs = path.join(work, 'images');
      fs.mkdirSync(imgs, { recursive: true });
      files.forEach((f, i) => {
        const m = String(f).match(/^data:image\/(\w+);base64,(.*)$/s);
        const ext = m ? (m[1] === 'jpeg' ? 'jpg' : m[1]) : (path.extname(f).slice(1) || 'jpg');
        fs.writeFileSync(path.join(imgs, `img_${i}.${ext}`), m ? Buffer.from(m[2], 'base64') : fs.readFileSync(f));
      });
      const out = path.join(work, 'lora');
      const env = { ...process.env, HF_HOME: modelsDir(userData), PYTHONUNBUFFERED: '1', ...(token ? { HF_TOKEN: token } : {}) };
      const p = spawn(venvPy(venv), [path.join(enginePath(), 'train_lora.py'), '--base', base, '--images-dir', imgs, '--trigger', trigger,
        '--class-word', classWord, '--out', out, '--steps', String(steps), '--rank', String(rank)], { env });
      let last = null; let errTail = '';
      // Cancel → stop the trainer process
      const jobSig = require('./jobs').signal();
      require('./jobs').onCancel(() => { try { p.kill(); } catch (_) {} });
      p.stdout.on('data', (d) => {
        String(d).split('\n').filter(Boolean).forEach((line) => {
          try { const ev = JSON.parse(line); last = ev; onProgress(ev); } catch { log(line); }
        });
      });
      p.stderr.on('data', (d) => { const t = String(d); errTail = (errTail + t).slice(-1500); log(t); });
      p.on('close', () => {
        if (last && last.event === 'done') return resolve({ loraPath: last.path, base: last.base, xl: last.xl });
        if (jobSig && jobSig.aborted) return reject(new (require('./jobs').CancelledError)());
        reject(new Error((last && last.event === 'error' && last.message) || 'Training failed: ' + errTail.split('\n').slice(-3).join(' ')));
      });
    });
  },

  // Downloaded repos + what they are (image / video diffusers pipeline, or other) from model_index.json
  listModelsDetailed(userData) {
    const hub = path.join(modelsDir(userData), 'hub');
    let dirs = [];
    try { dirs = fs.readdirSync(hub).filter((d) => d.startsWith('models--')); } catch { return []; }
    return dirs.map((d) => {
      const repo = d.replace('models--', '').replace(/--/g, '/');
      let className = null;
      try {
        const snaps = path.join(hub, d, 'snapshots');
        for (const s of fs.readdirSync(snaps)) {
          const mi = path.join(snaps, s, 'model_index.json');
          if (fs.existsSync(mi)) { className = JSON.parse(fs.readFileSync(mi, 'utf8'))._class_name || null; break; }
        }
      } catch { /* incomplete download */ }
      let kind = 'other';
      if (className) kind = /Video|Wan|LTX|CogVideo|Mochi|SkyReels|Animate|I2V|T2V/i.test(className) ? 'video' : 'image';
      const downloading = downloads.has(repo);
      const complete = !downloading && isComplete(path.join(hub, d));
      return { repo, className, kind, runnable: !!className && complete, complete, downloading };
    });
  },

  listModels(userData) {
    const hub = path.join(modelsDir(userData), 'hub');
    try {
      return fs.readdirSync(hub).filter((d) => d.startsWith('models--')).map((d) => d.replace('models--', '').replace(/--/g, '/'));
    } catch { return []; }
  }
};

// A model is "ready" only when its download finished: hub.py writes a marker; older downloads count
// as ready when no *.incomplete blobs remain and some weights exist.
function isComplete(dir) {
  if (fs.existsSync(path.join(dir, '.pandora-complete'))) return true;
  let weights = false; let partial = false;
  const walk = (p, depth) => {
    if (depth > 6 || partial) return;
    let es = [];
    try { es = fs.readdirSync(p, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      if (e.name.endsWith('.incomplete')) { partial = true; return; }
      if (e.isDirectory()) walk(path.join(p, e.name), depth + 1);
      else if (/\.(safetensors|bin|ckpt|gguf|pt|pth|onnx)$/i.test(e.name)) weights = true;
    }
  };
  walk(dir, 0);
  return weights && !partial;
}

function venvPy(venv) {
  return process.platform === 'win32' ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python');
}
