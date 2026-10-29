// Voice input for God's Pandora — speak in almost any language (Whisper, ~99 languages).
//   Free & offline: Whisper in the local engine's Python (transformers is already installed there;
//   faster-whisper is used automatically if present). Audio is converted to 16 kHz WAV with ffmpeg first.
//   Cloud: OpenAI transcription with your OpenAI key.
//   "Translate to English" turns any spoken language into an English prompt.
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const venvPy = (userData) => (process.platform === 'win32' ? path.join(userData, 'engine-venv', 'Scripts', 'python.exe') : path.join(userData, 'engine-venv', 'bin', 'python'));
const enginePath = () => path.join(__dirname, '..', 'engine').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const SIZES = { tiny: '75 MB', base: '290 MB', small: '970 MB', 'large-v3-turbo': '1.6 GB' };
const pyEnv = (userData) => ({ ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONWARNINGS: 'ignore', HF_HUB_DISABLE_SYMLINKS_WARNING: '1', HF_HUB_DISABLE_TELEMETRY: '1', TRANSFORMERS_VERBOSITY: 'error', HF_HOME: path.join(userData, 'models') });

function runPy(py, args, env, timeout = 600000) {
  return new Promise((resolve) => {
    const p = cp.spawn(py, args, { windowsHide: true, env });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-3000); });
    const t = setTimeout(() => { try { p.kill(); } catch (_) {} }, timeout);
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: e.message }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

// 16 kHz mono WAV (Whisper's native input) via ffmpeg
async function toWav(userData, file) {
  if (/\.wav$/i.test(file)) return file;
  const cut = require('./cut');
  let ff = cut.findFfmpeg(userData);
  if (!ff) { const r = await cut.ensureFfmpeg(userData); ff = r.ok ? r.path : null; }
  if (!ff) throw new Error('Voice input needs ffmpeg — open Pandora AutoEdit once to install it (free), then try again.');
  const out = file.replace(/\.[^.]+$/, '') + '-16k.wav';
  await new Promise((resolve, reject) => {
    const p = cp.spawn(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out], { windowsHide: true });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject); p.on('close', (c) => (c === 0 && fs.existsSync(out) ? resolve() : reject(new Error('Could not read the recording: ' + err.slice(-200)))));
  });
  return out;
}

let checked = null;
async function ensureWhisper(userData, onStatus = () => {}) {
  const py = venvPy(userData);
  if (!fs.existsSync(py)) throw new Error('LOCAL_ENGINE_MISSING');
  if (checked === py) return py;
  const env = pyEnv(userData);
  const ok = await runPy(py, ['-c', 'import transformers, torch, numpy'], env, 120000);
  if (ok.code !== 0) {
    const fw = await runPy(py, ['-c', 'import faster_whisper'], env, 60000);
    if (fw.code !== 0) {
      onStatus('Installing free voice recognition (one time)…');
      const r = await runPy(py, ['-m', 'pip', 'install', '--disable-pip-version-check', 'faster-whisper'], env, 900000);
      if (r.code !== 0) throw new Error('Voice recognition is not available: reinstall the local engine (Pandora Core & Cloud → Install engine).');
    }
  }
  checked = py;
  return py;
}

// Persistent Whisper worker: models stay in memory, so commands and "Hey Pandora" answer fast
let worker = null;
const loaded = new Set();
function getWorker(py, userData) {
  if (worker && !worker.dead) return worker.ready;
  const p = cp.spawn(py, [path.join(enginePath(), 'transcribe.py'), '--serve'], { windowsHide: true, env: pyEnv(userData) });
  const w = { p, dead: false, pending: new Map(), buf: '', seq: 0, err: '' };
  w.ready = new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => {
      w.buf += d; let i;
      while ((i = w.buf.indexOf('\n')) >= 0) {
        const line = w.buf.slice(0, i).trim(); w.buf = w.buf.slice(i + 1); if (!line) continue;
        let j; try { j = JSON.parse(line); } catch (_) { continue; }
        if ('ready' in j) { if (j.ready) resolve(w); else reject(new Error(j.error === 'NO_WHISPER' ? 'Voice recognition is not installed in the local engine.' : (j.error || 'Voice worker failed'))); continue; }
        const cb = w.pending.get(j.id); if (cb) { w.pending.delete(j.id); cb(j); }
      }
    });
    p.stderr.on('data', (d) => { w.err = (w.err + d).slice(-2000); });
    p.on('close', () => { w.dead = true; loaded.clear(); for (const cb of w.pending.values()) cb({ error: 'Voice worker stopped: ' + w.err.split('\n').filter(Boolean).slice(-1)[0] }); w.pending.clear(); reject(new Error('Voice worker stopped: ' + w.err.split('\n').filter(Boolean).slice(-2).join(' '))); });
    p.on('error', (e) => { w.dead = true; reject(e); });
  });
  worker = w;
  return w.ready;
}
function workerCall(w, req, timeout) {
  return new Promise((resolve) => {
    const id = ++w.seq; const t = setTimeout(() => { w.pending.delete(id); resolve({ error: 'Voice recognition timed out' }); }, timeout);
    w.pending.set(id, (j) => { clearTimeout(t); resolve(j); });
    w.p.stdin.write(JSON.stringify({ ...req, id }) + '\n');
  });
}
function stopWorker() { if (worker && !worker.dead) { try { worker.p.kill(); } catch (_) {} } worker = null; loaded.clear(); }

async function transcribeLocal(userData, file, { language, translate, model = 'small', quick = false }, onStatus) {
  const py = await ensureWhisper(userData, onStatus);
  const wav = await toWav(userData, file);
  const w = await getWorker(py, userData);
  const first = !loaded.has(model);
  if (first) onStatus(`Loading the ${model} voice model… (first time downloads ${SIZES[model] || 'it'}, then it's instant and offline)`);
  const j = await workerCall(w, { file: wav, model, language: language || 'auto', task: translate ? 'translate' : 'transcribe', beam: quick ? 1 : 5, vad: !quick }, first ? 1800000 : 120000);
  if (wav !== file) { try { fs.unlinkSync(wav); } catch (_) {} }
  if (j.error) throw new Error(j.error);
  loaded.add(model);
  return { text: j.text, language: j.language, engine: `Whisper ${model} (free, ${j.device})` };
}

async function transcribeCloud(key, file, mime, { language, translate }) {
  const buf = fs.readFileSync(file);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime || 'audio/webm' }), path.basename(file));
  fd.append('model', translate ? 'whisper-1' : 'gpt-4o-mini-transcribe');
  if (language && !translate) fd.append('language', language);
  const url = translate ? 'https://api.openai.com/v1/audio/translations' : 'https://api.openai.com/v1/audio/transcriptions';
  const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('OpenAI transcription error ' + r.status + ': ' + JSON.stringify(j).slice(0, 200));
  return { text: String(j.text || '').trim(), language: language || 'auto', engine: 'OpenAI (API)' };
}

// opts: { audio: base64, mime, language, translate, engine: 'auto'|'local'|'cloud', model, quick }
async function transcribe(userData, keys, opts, onStatus = () => {}) {
  const ext = /wav/.test(opts.mime || '') ? '.wav' : /ogg/.test(opts.mime || '') ? '.ogg' : /mp4|m4a/.test(opts.mime || '') ? '.m4a' : '.webm';
  const dir = path.join(os.tmpdir(), 'pandora-voice'); fs.mkdirSync(dir, { recursive: true });
  // a media file on disk (timeline auto-captions) is read in place — it is never deleted
  const own = !(opts.file && fs.existsSync(opts.file));
  const file = own ? path.join(dir, 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + ext) : opts.file;
  if (own) fs.writeFileSync(file, Buffer.from(String(opts.audio || ''), 'base64'));
  const lang = opts.language && opts.language !== 'auto' ? opts.language : null;
  const pref = opts.engine || 'auto';
  const haveLocal = fs.existsSync(venvPy(userData));
  try {
    if (opts.quick && !haveLocal) throw new Error('"Hey Pandora" listens privately on your PC — install the local engine first (Pandora Core & Cloud → Install engine).');
    if (!opts.quick && (pref === 'cloud' || (pref === 'auto' && !haveLocal && keys.openai))) {
      if (!keys.openai) throw new Error('Add an OpenAI key in Settings for cloud voice input, or use the free local option.');
      return await transcribeCloud(keys.openai, file, opts.mime, { language: lang, translate: opts.translate });
    }
    try { return await transcribeLocal(userData, file, { language: lang, translate: opts.translate, model: opts.model || 'small', quick: !!opts.quick }, onStatus); }
    catch (e) {
      if (keys.openai && pref === 'auto' && !opts.quick) { onStatus('Local voice failed (' + String(e.message).slice(0, 80) + ') — using OpenAI…'); return await transcribeCloud(keys.openai, file, opts.mime, { language: lang, translate: opts.translate }); }
      if (String(e.message) === 'LOCAL_ENGINE_MISSING') throw new Error('Free voice input needs the local engine (Pandora Core & Cloud → Install engine), or add an OpenAI key for cloud voice input.');
      throw e;
    }
  } finally { if (own) { try { fs.unlinkSync(file); } catch (_) {} } }
}

// warm up the worker + model in the background (so the first "Hey Pandora" isn't slow)
async function warm(userData, model = 'base', onStatus = () => {}) {
  const py = await ensureWhisper(userData, onStatus);
  const w = await getWorker(py, userData);
  if (loaded.has(model)) return { ok: true };
  onStatus(`Preparing voice recognition (${model}, first time downloads ${SIZES[model] || ''})…`);
  const dir = path.join(os.tmpdir(), 'pandora-voice'); fs.mkdirSync(dir, { recursive: true });
  const silent = path.join(dir, 'warm.wav');
  const n = 16000; const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(silent, b);
  const j = await workerCall(w, { file: silent, model, language: 'en', task: 'transcribe', beam: 1, vad: false }, 1800000);
  if (j.error) throw new Error(j.error);
  loaded.add(model); onStatus('Voice ready');
  return { ok: true };
}

function status(userData, keys) { return { local: fs.existsSync(venvPy(userData)), cloud: !!keys.openai, warm: [...loaded] }; }

module.exports = { transcribe, status, stopWorker, warm };
