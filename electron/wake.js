// "Hey Pandora" wake word — a dedicated keyword spotter instead of a general speech recogniser.
// sherpa-onnx open-vocabulary keyword spotting (zipformer transducer, GigaSpeech English, 3.3M params, ~6 MB).
// Why: it is built for exactly this job (like the engines behind "Hey Siri"), runs on the CPU in a few ms per
// chunk, works offline, needs no Python/engine/GPU, and recognises the phrase in any accent without training.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { Worker } = require('worker_threads');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const NAME = 'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01';
const GH = `https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/${NAME}.tar.bz2`;
const HF = 'https://huggingface.co/mobilebytesensei/sherpa-onnx-kws-zipformer-gigaspeech-3.3M/resolve/main/';
const HF_FILES = ['tokens.txt', 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx', 'decoder-epoch-12-avg-2-chunk-16-left-64.onnx', 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx'];

// "HEY PANDORA" written in the model's BPE tokens (several spellings so every accent/segmentation matches)
const B = '\u2581';
const PHRASES = [
  `${B}HE Y ${B}PA N D OR A`, `${B}HE Y ${B}PA N D O RA`, `${B}HE Y ${B}P AN D OR A`, `${B}HE Y ${B}PA N ${B}DO RA`,
  `${B}HI ${B}PA N D OR A`, `${B}OKAY ${B}PA N D OR A`, `${B}HE Y ${B}PA N D OR RA`,
];
const SENS = { low: 0.3, normal: 0.2, high: 0.12 };

const unpacked = (p) => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep); // workers + WASM load from real files
const modelDir = (userData) => path.join(userData, 'models', 'wake-kws');

function findModel(dir) {
  const all = [];
  const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; } for (const e of es) { const p = path.join(d, e.name); if (e.isDirectory() && depth < 2) walk(p, depth + 1); else if (e.isFile()) all.push(p); } };
  walk(dir, 0);
  const pick = (re, prefer) => { const c = all.filter((f) => re.test(path.basename(f)) && fs.statSync(f).size > 1000); return c.find((f) => prefer.every((p) => p.test(path.basename(f)))) || c.find((f) => prefer[0].test(path.basename(f))) || c[0]; };
  const m = {
    tokens: all.find((f) => path.basename(f) === 'tokens.txt'),
    encoder: pick(/^encoder.*\.onnx$/, [/chunk-16/, /int8/]),
    decoder: pick(/^decoder.*\.onnx$/, [/chunk-16/, /^(?!.*int8)/]),
    joiner: pick(/^joiner.*\.onnx$/, [/chunk-16/, /int8/]),
  };
  return m.tokens && m.encoder && m.decoder && m.joiner ? m : null;
}

async function download(url, out, timeoutMs = 180000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: 'follow', signal: ac.signal });
    if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(out + '.part'));
    fs.renameSync(out + '.part', out);
  } finally { clearTimeout(t); }
}

function tarBin() {
  if (process.platform === 'win32') { const w = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'); return fs.existsSync(w) ? w : 'tar'; }
  return 'tar';
}

// diagnostics: a small log + live stats so problems can be reported in one click
const stats = { state: 'off', model: null, chunks: 0, loud: 0, hits: 0, lastHit: null, lastError: null, startedAt: null, sensitivity: null };
let logFile = null;
function log(userData, msg) {
  try { if (!logFile) { const d = path.join(userData, 'logs'); fs.mkdirSync(d, { recursive: true }); logFile = path.join(d, 'voice.log'); }
    fs.appendFileSync(logFile, new Date().toISOString() + '  ' + msg + '\n'); } catch (_) { /* ignore */ }
}
function report(userData) {
  let tail = ''; try { tail = fs.readFileSync(path.join(userData, 'logs', 'voice.log'), 'utf8').split('\n').slice(-40).join('\n'); } catch (_) {}
  let files = []; try { files = fs.readdirSync(modelDir(userData), { recursive: true }).map(String); } catch (_) {}
  return JSON.stringify({ ...stats, worker: !!worker, modelFiles: files.slice(0, 20), platform: process.platform + ' ' + process.arch, node: process.versions.node }, null, 1) + '\n--- voice.log ---\n' + tail;
}

let preparing = null;
async function ensureModel(userData, onStatus = () => {}) {
  const dir = modelDir(userData);
  let m = findModel(dir); if (m) return m;
  if (preparing) return preparing;
  preparing = (async () => {
    fs.mkdirSync(dir, { recursive: true });
    log(userData, 'downloading detector model');
    onStatus('Downloading the "Hey Pandora" detector (6 MB, one time)…');
    const errors = [];
    // 1) Hugging Face (individual files, no extraction needed — works on every Windows version)
    try {
      const sub = path.join(dir, 'hf'); fs.mkdirSync(sub, { recursive: true });
      for (const f of HF_FILES) { const out = path.join(sub, f); if (!fs.existsSync(out)) await download(HF + f, out); }
      m = findModel(dir); if (m) return m;
      throw new Error('files missing');
    } catch (e) { errors.push('Hugging Face: ' + e.message); log(userData, 'HF source failed: ' + e.message); }
    // 2) official k2-fsa release archive (needs a tar with bzip2 support)
    try {
      const arc = path.join(dir, NAME + '.tar.bz2');
      await download(GH, arc);
      const r = cp.spawnSync(tarBin(), ['-xjf', arc, '-C', dir], { windowsHide: true, timeout: 120000 });
      try { fs.unlinkSync(arc); } catch (_) {}
      if (r.status !== 0) throw new Error('extract failed: ' + String(r.stderr || '').slice(0, 160));
      m = findModel(dir); if (m) return m;
      throw new Error('archive had no model files');
    } catch (e) { errors.push('GitHub: ' + e.message); log(userData, 'GitHub source failed: ' + e.message); }
    throw new Error('Could not download the "Hey Pandora" detector — check your internet connection. (' + errors.join('; ') + ')');
  })();
  try { return await preparing; } finally { preparing = null; }
}

let worker = null; const listeners = new Set();
async function start(userData, opts = {}, onStatus = () => {}) {
  stats.state = 'starting'; stats.sensitivity = opts.sensitivity || 'normal'; stats.lastError = null;
  try { const r = await startOnce(userData, opts, onStatus); stats.state = 'listening'; stats.startedAt = new Date().toISOString(); log(userData, 'detector listening (' + stats.sensitivity + ')'); return r; } catch (e) {
    stats.lastError = e.message; log(userData, 'start failed: ' + e.message);
    if (/download/i.test(e.message)) { stats.state = 'failed'; throw e; }
    // a half-downloaded or damaged model: wipe it and fetch a fresh copy once
    try { fs.rmSync(modelDir(userData), { recursive: true, force: true }); } catch (_) {}
    try { const r = await startOnce(userData, opts, onStatus); stats.state = 'listening'; log(userData, 'detector listening after re-download'); return r; } catch (e2) {
      stats.state = 'failed'; stats.lastError = e2.message; log(userData, 'start failed again: ' + e2.message);
      throw new Error('The "Hey Pandora" detector could not start (' + (/^\d+$/.test(e2.message) ? 'model file damaged' : e2.message) + ').');
    }
  }
}
async function startOnce(userData, { sensitivity = 'normal' } = {}, onStatus = () => {}) {
  stop();
  const model = await ensureModel(userData, onStatus);
  stats.model = model.encoder; logUD = userData;
  // NOTE: in the WebAssembly build sherpa-onnx parses `keywords` as the keyword TEXT itself, not a file path
  const keywordsText = PHRASES.map((p) => p + ' @HEY_PANDORA').join('\n');
  onStatus('Starting the detector…');
  const w = new Worker(unpacked(path.join(__dirname, 'wakeWorker.js')), { workerData: { sherpa: unpacked(require.resolve('sherpa-onnx')), model, keywordsText, threshold: SENS[sensitivity] || SENS.normal, score: 1.5 } });
  worker = w;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('The "Hey Pandora" detector did not start in time.')), 60000);
    w.once('error', (e) => { clearTimeout(t); reject(e); });
    w.once('exit', (code) => { clearTimeout(t); reject(new Error('detector stopped (' + code + ')')); if (worker === w) { worker = null; for (const l of listeners) l({ type: 'error', error: 'The "Hey Pandora" detector stopped — turn it off and on again.' }); } });
    w.on('message', (msg) => {
      if (msg.type === 'ready') { clearTimeout(t); resolve(); }
      else if (msg.type === 'error') { clearTimeout(t); reject(new Error(msg.error)); for (const l of listeners) l({ type: 'error', error: msg.error }); }
      else if (msg.type === 'hit') { stats.hits++; stats.lastHit = new Date().toISOString(); log(userData, 'WAKE WORD detected'); for (const l of listeners) l(msg); }
    });
  }).catch((e) => { stop(); throw e; });
  return { ok: true, engine: 'sherpa-onnx keyword spotter (offline)' };
}

let logUD = null;
function feed(buf) {
  if (!worker) return;
  stats.chunks++;
  const f = new Float32Array(buf); let e = 0; for (let i = 0; i < f.length; i += 8) e += f[i] * f[i];
  if (Math.sqrt(e / Math.max(1, f.length / 8)) > 0.01) stats.loud++;
  if (logUD && stats.chunks % 600 === 0) log(logUD, `audio ok: ${stats.chunks} chunks, ${stats.loud} with speech, ${stats.hits} wake hits`);
  worker.postMessage({ type: 'audio', data: buf }, [buf]);
}
function stop() { if (stats.state === 'listening') stats.state = 'off'; if (worker) { const w = worker; worker = null; try { w.postMessage({ type: 'stop' }); } catch (_) {} setTimeout(() => w.terminate().catch(() => {}), 300); } }
function onEvent(cb) { listeners.add(cb); return () => listeners.delete(cb); }

module.exports = { start, stop, feed, onEvent, ensureModel, findModel, report, PHRASES };
