// Manages the built-in local inference engine (Python sidecar in ./engine).
// Models download into <userData>/models and run fully offline — Ollama/ComfyUI style.
const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let proc = null;
const downloads = new Map(); // repo -> { proc, timer, cancelled }
let state = { installed: false, running: false, log: [] };
const PORT = 8756;

// Python can't read inside app.asar — the engine folder is unpacked next to it (build.asarUnpack)
function enginePath() { return path.join(__dirname, '..', 'engine').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep); }
function modelsDir(userData) { const d = path.join(userData, 'models'); fs.mkdirSync(d, { recursive: true }); return d; }
function python() {
  for (const cmd of ['python3', 'python', 'py']) {
    try { if (spawnSync(cmd, ['--version']).status === 0) return cmd; } catch { /* try next */ }
  }
  return null;
}

function log(line) { state.log.push(line); if (state.log.length > 200) state.log.shift(); }

module.exports = {
  status(userData) {
    const venvReady = userData ? fs.existsSync(venvPy(path.join(userData, 'engine-venv'))) : false;
    return { ...state, installed: state.installed || venvReady, python: !!python(), port: PORT };
  },

  // pip-installs the engine requirements into a dedicated venv inside userData
  install(userData) {
    return new Promise((resolve) => {
      const py = python();
      if (!py) return resolve({ ok: false, error: 'Python 3.10+ not found. Install it from python.org, then retry.' });
      const venv = path.join(userData, 'engine-venv');
      // NVIDIA GPU → install the CUDA build of PyTorch first (PyPI's Windows wheel is CPU-only)
      let nvidia = false;
      try { nvidia = spawnSync('nvidia-smi', ['-L']).status === 0; } catch { /* no driver */ }
      const TORCH_INDEX = 'https://download.pytorch.org/whl/cu130';
      const steps = [
        ...(fs.existsSync(venvPy(venv)) ? [] : [[py, ['-m', 'venv', venv]]]),
        [venvPy(venv), ['-m', 'pip', 'install', '--upgrade', 'pip']],
      ];
      if (nvidia && process.platform !== 'darwin') {
        const cudaOk = fs.existsSync(venvPy(venv)) &&
          String(spawnSync(venvPy(venv), ['-c', 'import torch;print(torch.version.cuda)']).stdout || '').trim().match(/^\d/);
        steps.push([venvPy(venv), ['-m', 'pip', 'install', '--upgrade', ...(cudaOk ? [] : ['--force-reinstall']), 'torch', 'torchvision', '--index-url', TORCH_INDEX]]);
        log('NVIDIA GPU detected — installing CUDA PyTorch from ' + TORCH_INDEX + '\n');
      }
      steps.push([venvPy(venv), ['-m', 'pip', 'install', '-r', path.join(enginePath(), 'requirements.txt')]]);
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
    const py = fs.existsSync(venvPy(venv)) ? venvPy(venv) : python();
    if (!py) return { ok: false, error: 'Python not found.' };
    proc = spawn(py, [path.join(enginePath(), 'server.py'), '--port', String(PORT), '--models-dir', modelsDir(userData)], {
      env: { ...process.env, HF_HOME: modelsDir(userData), ...(token ? { HF_TOKEN: token } : {}) }
    });
    proc.stdout.on('data', (d) => log(d.toString()));
    proc.stderr.on('data', (d) => log(d.toString()));
    proc.on('close', () => { proc = null; state.running = false; });
    state.running = true;
    return { ok: true };
  },

  stop() {
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

      const env = { ...process.env, HF_HOME: modelsDir(userData), HF_HUB_DISABLE_TELEMETRY: '1' };
      if (opts.token) env.HF_TOKEN = opts.token;
      const code = [
        'import sys',
        'from huggingface_hub import snapshot_download',
        'snapshot_download(sys.argv[1])',
      ].join('; ');
      const p = spawn(py, ['-c', code, repo], { env });
      let errTail = '';
      p.stdout.on('data', (d) => log(d.toString()));
      p.stderr.on('data', (d) => { const t = d.toString(); errTail = (errTail + t).slice(-2000); log(t); });

      const report = (extra = {}) => {
        if (!opts.onProgress) return;
        let bytes = 0;
        try { bytes = require('./hfModels').bytesOnDisk(modelsDir(userData), repo); } catch (_) {}
        opts.onProgress({ repo, bytes, total: opts.totalBytes || 0, ...extra });
      };
      const timer = setInterval(() => report(), 1500);
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
      return { repo, className, kind, runnable: !!className };
    });
  },

  listModels(userData) {
    const hub = path.join(modelsDir(userData), 'hub');
    try {
      return fs.readdirSync(hub).filter((d) => d.startsWith('models--')).map((d) => d.replace('models--', '').replace(/--/g, '/'));
    } catch { return []; }
  }
};

function venvPy(venv) {
  return process.platform === 'win32' ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python');
}
