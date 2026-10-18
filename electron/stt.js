// Voice input for God's Pandora — speak in almost any language (Whisper, ~99 languages).
//   Free & offline: Whisper (faster-whisper) in the local engine's Python — installed on first use.
//   Cloud: OpenAI transcription with your OpenAI key (fast, no setup).
//   "Translate to English" turns any spoken language into an English prompt (best for image/video models).
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const venvPy = (userData) => (process.platform === 'win32' ? path.join(userData, 'engine-venv', 'Scripts', 'python.exe') : path.join(userData, 'engine-venv', 'bin', 'python'));
const enginePath = () => path.join(__dirname, '..', 'engine').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);

function runPy(py, args, timeout = 600000) {
  return new Promise((resolve) => {
    const p = cp.spawn(py, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONWARNINGS: 'ignore' } });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err = (err + d).slice(-3000); });
    const t = setTimeout(() => { try { p.kill(); } catch (_) {} }, timeout);
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: e.message }); });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out, err }); });
  });
}

let installing = null;
async function ensureWhisper(userData, onStatus = () => {}) {
  const py = venvPy(userData);
  if (!fs.existsSync(py)) throw new Error('LOCAL_ENGINE_MISSING');
  const chk = await runPy(py, ['-c', 'import faster_whisper'], 60000);
  if (chk.code === 0) return py;
  if (!installing) {
    onStatus('Installing free voice recognition (one time, ~100 MB)…');
    installing = runPy(py, ['-m', 'pip', 'install', '--disable-pip-version-check', 'faster-whisper'], 900000).finally(() => { installing = null; });
  }
  const r = await installing;
  if (r.code !== 0) throw new Error('Could not install voice recognition: ' + r.err.split('\n').slice(-2).join(' '));
  return py;
}

// Persistent Whisper worker: models stay in memory, so commands and "Hey Pandora" answer fast
let worker = null;
function getWorker(py) {
  if (worker && !worker.dead) return worker.ready;
  const p = cp.spawn(py, [path.join(enginePath(), 'transcribe.py'), '--serve'], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONWARNINGS: 'ignore', HF_HUB_DISABLE_SYMLINKS_WARNING: '1' } });
  const w = { p, dead: false, pending: new Map(), buf: '', seq: 0 };
  w.ready = new Promise((resolve, reject) => {
    p.stdout.on('data', (d) => {
      w.buf += d; let i;
      while ((i = w.buf.indexOf('\n')) >= 0) {
        const line = w.buf.slice(0, i).trim(); w.buf = w.buf.slice(i + 1); if (!line) continue;
        let j; try { j = JSON.parse(line); } catch (_) { continue; }
        if ('ready' in j) { if (j.ready) resolve(w); else reject(new Error(j.error || 'worker failed')); continue; }
        const cb = w.pending.get(j.id); if (cb) { w.pending.delete(j.id); cb(j); }
      }
    });
    p.stderr.on('data', () => {});
    p.on('close', () => { w.dead = true; for (const cb of w.pending.values()) cb({ error: 'Voice worker stopped' }); w.pending.clear(); reject(new Error('Voice worker stopped')); });
    p.on('error', (e) => { w.dead = true; reject(e); });
  });
  worker = w;
  return w.ready;
}
function workerCall(w, req, timeout = 300000) {
  return new Promise((resolve) => {
    const id = ++w.seq; const t = setTimeout(() => { w.pending.delete(id); resolve({ error: 'Voice recognition timed out' }); }, timeout);
    w.pending.set(id, (j) => { clearTimeout(t); resolve(j); });
    w.p.stdin.write(JSON.stringify({ ...req, id }) + '\n');
  });
}
function stopWorker() { if (worker && !worker.dead) { try { worker.p.kill(); } catch (_) {} } worker = null; }

async function transcribeLocal(userData, file, { language, translate, model = 'small', quick = false }, onStatus) {
  const py = await ensureWhisper(userData, onStatus);
  try {
    const w = await getWorker(py);
    if (!quick) onStatus('Listening… (first use downloads the ' + model + ' voice model)');
    const j = await workerCall(w, { file, model, language: language || 'auto', task: translate ? 'translate' : 'transcribe', beam: quick ? 1 : 5, vad: !quick });
    if (j.error) throw new Error(j.error);
    return { text: j.text, language: j.language, engine: 'Whisper ' + model + ' (free, ' + j.device + ')' };
  } catch (e) { if (quick) throw e; /* fall back to a one-off process below */ }
  onStatus('Listening… (first use downloads the ' + model + ' voice model)');
  const r = await runPy(py, [path.join(enginePath(), 'transcribe.py'), file, model, language || 'auto', translate ? 'translate' : 'transcribe']);
  const line = r.out.trim().split('\n').filter(Boolean).pop() || '';
  let j = null; try { j = JSON.parse(line); } catch (_) {}
  if (!j) throw new Error('Voice recognition failed: ' + (r.err.split('\n').slice(-2).join(' ') || 'no output'));
  if (j.error) throw new Error(j.error === 'MISSING_FASTER_WHISPER' ? 'Voice recognition is not installed yet.' : j.error);
  return { text: j.text, language: j.language, engine: 'Whisper ' + model + ' (free, ' + j.device + ')' };
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

// opts: { audio: base64, mime, language: 'auto'|'en'|'ur'…, translate: bool, engine: 'auto'|'local'|'cloud', model }
async function transcribe(userData, keys, opts, onStatus = () => {}) {
  const ext = /ogg/.test(opts.mime || '') ? '.ogg' : /wav/.test(opts.mime || '') ? '.wav' : /mp4|m4a/.test(opts.mime || '') ? '.m4a' : '.webm';
  const dir = path.join(os.tmpdir(), 'pandora-voice'); fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'rec-' + Date.now() + ext);
  fs.writeFileSync(file, Buffer.from(String(opts.audio || ''), 'base64'));
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
      if (keys.openai && pref === 'auto' && !opts.quick) return await transcribeCloud(keys.openai, file, opts.mime, { language: lang, translate: opts.translate });
      if (String(e.message) === 'LOCAL_ENGINE_MISSING') throw new Error('Free voice input needs the local engine (Pandora Core & Cloud → Install engine), or add an OpenAI key for cloud voice input.');
      throw e;
    }
  } finally { try { fs.unlinkSync(file); } catch (_) {} }
}

function status(userData, keys) { return { local: fs.existsSync(venvPy(userData)), cloud: !!keys.openai }; }

module.exports = { transcribe, status, stopWorker };
