const { app, BrowserWindow, ipcMain, dialog, safeStorage, protocol, shell, Notification } = require('electron');
const jobs = require('./jobs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { generate } = require('./generate');
const engine = require('./engineManager');
const anthropic = require('./providers/anthropic');
const resolveBridge = require('./resolve');
const tdBridge = require('./touchdesigner');
const updater = require('./updater');
const hf = require('./hfModels');
const jutsu = require('./jutsu');
const cut = require('./cut');
const market = require('./market');

let win;

// The app was renamed from "God's Eye" to "God's Pandora": keep the old keys, library, characters
// and the installed local engine by moving the old data folder over (or reusing it in place).
(() => {
  try {
    const appData = app.getPath('appData');
    const now = app.getPath('userData');
    const has = (d) => ['db.json', 'keys.enc.json', 'engine-venv'].some((f) => fs.existsSync(path.join(d, f)));
    const legacy = ["God's Eye", 'gods-eye'].map((n) => path.join(appData, n)).find((d) => d !== now && has(d));
    if (!legacy || has(now)) return;
    if (fs.existsSync(now)) { app.setPath('userData', legacy); return; }
    try { fs.renameSync(legacy, now); } catch { app.setPath('userData', legacy); }
  } catch { /* first run */ }
})();

const userData  = () => app.getPath('userData');
const libraryDir= () => ensure(path.join(userData(), 'library'));
const assetsDir = () => ensure(path.join(userData(), 'assets'));
const dbPath    = () => path.join(userData(), 'db.json');
const keysPath  = () => path.join(userData(), 'keys.enc.json');

function ensure(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  return dir;
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) ?? fallback; }
  catch (_) { return fallback; }
}

// Atomic write: .tmp then rename so a mid-write crash never corrupts the file
function writeJSON(file, data) {
  try {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error('[writeJSON] failed:', file, err.message);
  }
}

function getKeys() {
  const enc = readJSON(keysPath(), {});
  const out = {};
  for (const [k, v] of Object.entries(enc)) {
    try {
      out[k] = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(Buffer.from(v, 'base64'))
        : Buffer.from(v, 'base64').toString('utf8');
    } catch (_) { /* skip corrupt entry */ }
  }
  return out;
}

function setKey(provider, value) {
  const enc = readJSON(keysPath(), {});
  if (!value) { delete enc[provider]; }
  else {
    enc[provider] = safeStorage.isEncryptionAvailable()
      ? safeStorage.encryptString(value).toString('base64')
      : Buffer.from(value, 'utf8').toString('base64');
  }
  writeJSON(keysPath(), enc);
}

function extFromType(t) {
  if (!t) return 'bin';
  if (t.includes('png'))  return 'png';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('webp')) return 'webp';
  if (t.includes('mp4'))  return 'mp4';
  if (t.includes('webm')) return 'webm';
  if (t.includes('mpeg') || t.includes('mp3')) return 'mp3';
  if (t.includes('wav'))  return 'wav';
  return 'bin';
}

async function saveFromUrl(url, kindHint) {
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) throw new Error('Malformed data URL from provider.');
    const file = path.join(libraryDir(), id + '.' + extFromType(m[1]));
    fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    return file;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('Download failed: ' + res.status + ' ' + res.statusText);
  const type = res.headers.get('content-type') || kindHint || '';
  const file = path.join(libraryDir(), id + '.' + extFromType(type));
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function fileToDataUrl(file) {
  if (!file || !fs.existsSync(file)) throw new Error('File not found: ' + file);
  const ext  = path.extname(file).slice(1).toLowerCase();
  const mime = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp',
                 mp4:'video/mp4', mp3:'audio/mpeg', wav:'audio/wav', webm:'video/webm' }[ext]
               || 'application/octet-stream';
  return 'data:' + mime + ';base64,' + fs.readFileSync(file).toString('base64');
}

// Wrap every IPC handler so errors always surface to the renderer (never crash main)
function safeHandle(channel, fn) {
  ipcMain.handle(channel, async (...args) => {
    try { return await fn(...args); }
    catch (err) { console.error('[IPC ' + channel + ']', err.message || err); throw err; }
  });
}

// Start the local engine on demand and wait until it answers /health
async function ensureEngine(token) {
  const ping = async () => {
    try { const r = await fetch('http://127.0.0.1:8756/health'); return r.ok; } catch (_) { return false; }
  };
  if (await ping()) return;
  const st = engine.status(userData());
  if (!st.installed) throw new Error('The local engine is not installed yet. Open Models (or Update) → "Install engine", then try again.');
  const r = engine.start(userData(), token);
  if (r && r.ok === false) throw new Error(r.error || 'Could not start the local engine.');
  for (let i = 0; i < 90; i++) {           // up to ~90 s (first start imports torch)
    if (await ping()) return;
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error('The local engine did not start. Check the engine log on the Models page.');
}

// Desktop notification when a long job finishes while the window isn't focused
function notifyDone(title, body) {
  try {
    if (win && !win.isDestroyed() && !win.isFocused() && Notification.isSupported()) {
      const n = new Notification({ title, body, silent: false });
      n.on('click', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } });
      n.show();
      if (process.platform === 'win32') win.flashFrame(true);
    }
  } catch (_) { /* notifications unavailable */ }
}

// Run fn as a cancellable job; long jobs notify on completion
async function asJob(jobId, label, fn) {
  const t0 = Date.now();
  const out = await jobs.run(jobId, label, fn);
  if (Date.now() - t0 > 20000) notifyDone("God's Pandora", label + ' is ready.');
  return out;
}

function registerIpc() {
  safeHandle('job:cancel', (_e, jobId) => jobs.cancel(jobId));
  safeHandle('job:cancelAll', () => jobs.cancelAll());
  safeHandle('job:list', () => jobs.list());
  const EMPTY_DB = { characters: [], locations: [], generations: [], settings: {} };

  safeHandle('store:get', () => readJSON(dbPath(), EMPTY_DB));
  safeHandle('store:set', (_e, db) => writeJSON(dbPath(), db));

  safeHandle('keys:list', () => {
    const keys = getKeys();
    return Object.fromEntries(
      Object.entries(keys).map(([k, v]) => [k, v ? v.slice(0,4) + '...' + v.slice(-4) : ''])
    );
  });
  safeHandle('keys:set', (_e, provider, value) => setKey(provider, value));

  safeHandle('media:pickImages', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','webp'] }]
    });
    if (r.canceled) return [];
    return r.filePaths.map((p) => {
      try {
        const dest = path.join(assetsDir(), Date.now() + '-' + path.basename(p));
        fs.copyFileSync(p, dest);
        return dest;
      } catch (_) { return p; }
    });
  });

  safeHandle('media:dataUrl', (_e, file) => fileToDataUrl(file));
  // Drag & drop: copy dropped files into app assets (so refs keep working if originals move)
  safeHandle('media:import', (_e, paths) => (paths || []).filter((p) => p && fs.existsSync(p)).map((p) => {
    const dest = path.join(assetsDir(), Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '-' + path.basename(p).replace(/[^\w.-]+/g, '_'));
    fs.copyFileSync(p, dest);
    return dest;
  }));
  // ✨ Prompt enhancer: Claude if you have a key, otherwise your local LLM (Ollama / LM Studio)
  safeHandle('prompt:enhance', async (_e, { prompt, kind }) => {
    const system = `You rewrite rough ideas into one excellent ${kind || 'image'}-generation prompt. Keep every @Name tag and every concrete detail the user gave. ` +
      'Add subject, setting, composition, camera/lens, lighting, mood, style and quality cues' + (kind === 'video' ? ', plus motion and camera movement' : '') +
      '. Under 120 words. Reply with the prompt only — no quotes, no preamble.';
    const keys = getKeys();
    if (keys.anthropic) {
      return (await anthropic.complete({ key: keys.anthropic, system, prompt, maxTokens: 400 })).trim();
    }
    const base = 'http://localhost:11434/v1';
    let model = null;
    try { model = (await jutsu.listLocalLLMs(base))[0]; } catch (_) { /* none */ }
    if (!model) throw new Error('Add an Anthropic key in Settings, or run a local model in Ollama (e.g. "ollama pull llama3.2") to use ✨ Enhance.');
    const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.7, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }) });
    const j = await r.json();
    if (!r.ok) throw new Error('Local model error ' + r.status);
    return String(j.choices?.[0]?.message?.content || '').trim();
  });
  safeHandle('media:pickVideo', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm'] }] });
    if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0];
    const dest = path.join(assetsDir(), Date.now() + '-' + path.basename(src).replace(/[^\w.-]+/g, '_'));
    fs.copyFileSync(src, dest);
    return dest;
  });
  // file:// URL for large local media (videos) so the renderer can stream instead of base64
  safeHandle('media:fileUrl', (_e, file) => require('url').pathToFileURL(file).href);

  // ── Skilled tools: Identity Lock · Shapeshift · Ad Multiplier ─────────────────────
  const jprog = (tool) => (p) => { if (win && !win.isDestroyed()) win.webContents.send('jutsu:progress', { tool, ...p }); };
  const unloadEngine = async () => { try { await fetch('http://127.0.0.1:8756/unload', { method: 'POST' }); } catch (_) { /* not running */ } };
  const localDeps = () => ({
    engine, userData: userData(), unload: unloadEngine,
    ensureEngine: () => ensureEngine(getKeys().huggingface),
    saveDataUrl: (d) => {
      const m = String(d).match(/^data:([^;]+);base64,(.*)$/s);
      const f = path.join(assetsDir(), Date.now() + '-frame.' + extFromType(m[1]));
      fs.writeFileSync(f, Buffer.from(m[2], 'base64'));
      return f;
    },
  });
  safeHandle('soul:train', async (_e, args) => asJob(args && args.jobId, 'Identity Lock training', () => jutsu.trainSoul(args, getKeys(), jprog('soul'), localDeps())));
  // ── 🛒 Model Market ──────────────────────────────────────────────────────
  const mprog = (id) => (p) => { if (win && !win.isDestroyed()) win.webContents.send('market:progress', { id, ...p }); };
  safeHandle('market:hf', (_e, args) => market.hfSearch(args, getKeys().huggingface));
  safeHandle('market:civitai', (_e, args) => market.civitaiSearch(args, getKeys().civitai));
  safeHandle('market:omdb', (_e, args) => market.openModelDb(args));
  safeHandle('market:pinokio', (_e, args) => market.pinokioSearch(args));
  // Pinokio desktop: detect + launch (installs happen inside Pinokio itself)
  const pinokioExe = () => {
    const fs = require('fs'); const p = require('path'); const home = app.getPath('home');
    const c = process.platform === 'win32'
      ? [p.join(process.env.LOCALAPPDATA || '', 'Programs', 'Pinokio', 'Pinokio.exe'), p.join(process.env.ProgramFiles || 'C:\\Program Files', 'Pinokio', 'Pinokio.exe')]
      : process.platform === 'darwin' ? ['/Applications/Pinokio.app', p.join(home, 'Applications', 'Pinokio.app')] : [p.join(home, 'Applications', 'Pinokio.AppImage')];
    return c.find((x) => { try { return fs.existsSync(x); } catch { return false; } }) || null;
  };
  const pk = require('./pinokio');
  safeHandle('market:pinokioStatus', async () => { const running = await pk.pinokioRunning(); return { installed: running || !!pinokioExe(), running, path: pinokioExe() }; });
  safeHandle('market:pinokioInstall', async (_e, repoUrl) => {
    if (!(await pk.pinokioRunning())) throw new Error('Start Pinokio first (click "Open Pinokio"), then press Install again.');
    await shell.openExternal(pk.oneClickUrl(repoUrl));
    return { ok: true };
  });
  safeHandle('market:openPinokio', async () => {
    const exe = pinokioExe();
    if (!exe) { await shell.openExternal('https://pinokio.co/'); return { opened: 'website' }; }
    const err = await shell.openPath(exe); if (err) throw new Error(err);
    return { opened: 'app' };
  });
  safeHandle('market:download', (_e, args) => asJob(args && args.jobId, 'Downloading ' + ((args && args.meta && args.meta.name) || 'model'),
    () => market.downloadFile(userData(), { ...args, token: /civitai/.test((args && args.url) || '') ? getKeys().civitai : undefined }, mprog(args.id || args.url))));
  safeHandle('market:files', () => market.listFiles(userData()));
  safeHandle('market:deleteFile', (_e, file) => market.deleteFile(userData(), file));
  safeHandle('market:ollamaList', () => market.ollamaList());
  safeHandle('market:ollamaPull', (_e, args) => asJob(args && args.jobId, 'Ollama pull ' + (args && args.model), () => market.ollamaPull(args.model, mprog('ollama:' + args.model))));
  safeHandle('engine:hardware', () => engine.hardware(userData()));
  safeHandle('ad:listLocal', (_e, baseUrl) => jutsu.listLocalLLMs(baseUrl));
  safeHandle('genjutsu:presets', () => jutsu.genjutsuPresets(getKeys()));
  safeHandle('genjutsu:run', async (_e, args) => asJob(args && args.jobId, 'Shapeshift video', async () => {
    const keys = getKeys();
    const generateImage = async (frame, prompt, extraRefs, editModel) => {
      if (!editModel) throw new Error('Pick an image-edit model for Restyle.');
      const r = await generate({ provider: editModel.provider, model: editModel, kind: 'image', prompt, toolRefs: [frame, ...(extraRefs || [])], params: {} }, keys, { fileToDataUrl });
      return saveFromUrl(r.url || r.dataUrl, r.mime);
    };
    const out = await jutsu.genjutsu(args, keys, jprog('genjutsu'), generateImage, localDeps());
    const file = await saveFromUrl(out.url || out.dataUrl, 'video/mp4');
    return { file, kind: 'video' };
  }));
  safeHandle('ad:analyze', (_e, args) => asJob(args && args.jobId, 'Ad breakdown', () => jutsu.analyzeAd(args, getKeys())));
  // ── Pandora Cut: auto edit + auto colour (ffmpeg, free) ─────────────────────
  const cutProg = (p) => { if (win && !win.isDestroyed()) win.webContents.send('cut:progress', p); };
  const cutErr = (e) => { if (String(e && e.message) === 'FFMPEG_MISSING') throw new Error('FFMPEG_MISSING'); throw e; };
  safeHandle('cut:status', () => ({ ffmpeg: !!cut.findFfmpeg(userData()), looks: cut.LOOKS }));
  safeHandle('cut:ensure', () => cut.ensureFfmpeg(userData()));
  safeHandle('cut:autoEdit', (_e, args) => asJob(args && args.jobId, 'Pandora Cut — auto edit', async () => {
    jobs.onCancel(() => cut.cancelAll());
    return cut.autoEdit(userData(), { ...args, outDir: libraryDir() }, cutProg).catch(cutErr);
  }));
  safeHandle('cut:autoColor', (_e, args) => asJob(args && args.jobId, 'Pandora Cut — auto colour', async () => {
    jobs.onCancel(() => cut.cancelAll());
    return cut.autoColor(userData(), { ...args, outDir: libraryDir() }, cutProg).catch(cutErr);
  }));
  safeHandle('cut:preview', (_e, args) => cut.previewGrade(userData(), args));
  safeHandle('media:pickMedia', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video & images', extensions: ['mp4', 'mov', 'webm', 'mkv', 'm4v', 'avi', 'png', 'jpg', 'jpeg', 'webp'] }] });
    return r.canceled ? [] : r.filePaths;
  });
  safeHandle('media:pickAudio', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Music', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'mp4'] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  safeHandle('media:pickLut', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: '3D LUT', extensions: ['cube'] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  safeHandle('media:concat', async (_e, files, aspect) => {
    const out = path.join(libraryDir(), Date.now() + '-ad.mp4');
    await jutsu.concatVideos(files, out, userData(), aspect);
    return out;
  });
  // Save a data URL produced in the renderer (e.g. last frame of a video for "Extend") into assets
  safeHandle('media:saveDataUrl', (_e, dataUrl, name) => {
    const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.*)$/s);
    if (!m) throw new Error('Invalid image data.');
    const safe = String(name || 'frame').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 40);
    const file = path.join(assetsDir(), Date.now() + '-' + safe + '.' + extFromType(m[1]));
    fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    return file;
  });
  safeHandle('media:reveal',  (_e, file) => {
    if (file && fs.existsSync(file)) shell.showItemInFolder(file);
  });

  safeHandle('generate', async (_e, payload) => asJob(payload && payload.jobId, (payload && payload.kind === 'video' ? 'Video' : payload && payload.kind === 'audio' ? 'Audio' : 'Image') + ' generation', async () => {
    const keys   = getKeys();
    if (payload && payload.provider === 'local') await ensureEngine(keys.huggingface);
    const result = await generate(payload, keys, { fileToDataUrl });
    const src    = result.url || result.dataUrl;
    if (!src) throw new Error('Provider returned no output URL or data.');
    const file   = await saveFromUrl(src, result.mime);
    return { file, kind: payload.kind, note: result.note || null };
  }));

  safeHandle('claude:complete', async (_e, args) => asJob(args && args.jobId, 'Claude build', async () => {
    const { system, prompt, maxTokens } = args || {};
    const keys = getKeys();
    if (!keys.anthropic) throw new Error('No API key saved for Anthropic (Claude). Add it in Settings → API Keys.');
    return anthropic.complete({ key: keys.anthropic, system, prompt, maxTokens });
  }));

  // Local LLM (Ollama / LM Studio / any OpenAI-compatible server) — free alternative to Claude for text & code
  safeHandle('llm:local', async (_e, args) => asJob(args && args.jobId, 'Local model build', async () => {
    const { system, prompt, model, baseUrl, maxTokens } = args || {};
    const bases = baseUrl ? [baseUrl] : ['http://localhost:11434/v1', 'http://localhost:1234/v1'];
    let base = null; let models = [];
    for (const b of bases) { try { models = await jutsu.listLocalLLMs(b); base = b; break; } catch (_) { /* try next */ } }
    if (!base) throw new Error('No local model server found. Install Ollama (ollama.com) and run e.g. "ollama pull qwen2.5-coder", or start LM Studio\'s local server.');
    const pick = model && models.includes(model) ? model
      : (models.find((m) => /coder|code|deepseek|qwen/i.test(m)) || models[0]);
    if (!pick) throw new Error('Your local model server has no models yet. In Ollama run: ollama pull qwen2.5-coder');
    const { requestJSON } = require('./net');
    const { status, json } = await requestJSON(base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', timeoutMs: 30 * 60 * 1000,
      body: { model: pick, temperature: 0.4, max_tokens: maxTokens || 16000, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] },
    });
    if (status !== 200) throw new Error('Local model error ' + status + ': ' + JSON.stringify(json).slice(0, 200));
    return String(json.choices?.[0]?.message?.content || '');
  }));
  safeHandle('llm:localModels', async () => {
    for (const b of ['http://localhost:11434/v1', 'http://localhost:1234/v1']) { try { return await jutsu.listLocalLLMs(b); } catch (_) { /* next */ } }
    return [];
  });

  safeHandle('resolve:send', async (_e, files) => {
    const r = await resolveBridge.sendToResolve('python3', files);
    return r.ok ? r : resolveBridge.sendToResolve('python', files);
  });

  const forgeDir = () => ensure(path.join(userData(), 'forge'));

  safeHandle('forge:save', (_e, name, html) => {
    const slug = (name || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
    const file = path.join(forgeDir(), slug + '-' + Date.now().toString(36) + '.html');
    fs.writeFileSync(file, html || '');
    return file;
  });

  safeHandle('forge:list', () => {
    try {
      return fs.readdirSync(forgeDir())
        .filter((f) => f.endsWith('.html'))
        .map((f) => ({ name: f, file: path.join(forgeDir(), f) }));
    } catch (_) { return []; }
  });

  safeHandle('forge:read', (_e, file) => {
    if (!file || !fs.existsSync(file)) throw new Error('App file not found.');
    return fs.readFileSync(file, 'utf8');
  });

  safeHandle('engine:status',        ()           => engine.status(userData()));
  safeHandle('engine:install',       ()           => engine.install(userData()));
  safeHandle('engine:start',         ()           => engine.start(userData(), getKeys().huggingface));
  safeHandle('engine:stop',          ()           => engine.stop());
  safeHandle('engine:downloadModel', async (_e, repoId, totalBytes) => {
    const token = getKeys().huggingface;
    let total = totalBytes || 0;
    if (!total) { try { total = (await hf.info(String(repoId).trim(), token)).sizeBytes; } catch (_) {} }
    return engine.downloadModel(userData(), repoId, {
      token, totalBytes: total,
      onProgress: (p) => { if (win && !win.isDestroyed()) win.webContents.send('engine:progress', p); },
    });
  });
  safeHandle('engine:listModelsDetailed', () => {
    try { return engine.listModelsDetailed(userData()); } catch (_) { return []; }
  });
  safeHandle('engine:cancelDownload', (_e, repo) => engine.cancelDownload(repo));
  safeHandle('engine:activeDownloads', () => engine.activeDownloads());
  safeHandle('engine:deleteModel',    (_e, repo) => engine.deleteModel(userData(), repo));

  // ── Model intelligence (Hugging Face Hub API) ──────────────────────────────
  safeHandle('models:feed',  ()          => hf.feed({ token: getKeys().huggingface }));
  safeHandle('models:info',  (_e, repo)  => hf.info(String(repo).trim(), getKeys().huggingface));
  safeHandle('models:checkInstalled', () => {
    let repos = [];
    try { repos = engine.listModels(userData()); } catch (_) {}
    return hf.checkInstalled(engine.modelsDir(userData()), repos, getKeys().huggingface);
  });
  safeHandle('models:openFolder', () => shell.openPath(engine.modelsDir(userData())));

  // ── App self-update (GitHub Releases) ──────────────────────────────────────
  safeHandle('update:status',    ()          => updater.status());
  safeHandle('update:check',     ()          => updater.check());
  safeHandle('update:download',  ()          => updater.download());
  safeHandle('update:install',   ()          => updater.install());
  safeHandle('update:setConfig', (_e, patch) => updater.setConfig(patch));
  // First launch after the installer: welcome sheet with install options
  safeHandle('app:installInfo', () => {
    const arg = process.argv.find((a) => a.startsWith('--installed'));
    const lnk = path.join(app.getPath('desktop'), "God's Pandora.lnk");
    return { justInstalled: !!arg, version: app.getVersion(), desktopShortcut: fs.existsSync(lnk), openAtLogin: app.getLoginItemSettings().openAtLogin };
  });
  safeHandle('app:setLoginItem', (_e, on) => { app.setLoginItemSettings({ openAtLogin: !!on }); return true; });
  safeHandle('app:desktopShortcut', (_e, on) => {
    if (process.platform !== 'win32') return false;
    const lnk = path.join(app.getPath('desktop'), "God's Pandora.lnk");
    if (on) shell.writeShortcutLink(lnk, 'create', { target: process.execPath, icon: process.execPath, iconIndex: 0, description: "God's Pandora" });
    else if (fs.existsSync(lnk)) fs.unlinkSync(lnk);
    return true;
  });
  safeHandle('app:openExternal', (_e, url) => {
    if (/^https:\/\/(huggingface\.co|github\.com)\//.test(String(url))) return shell.openExternal(url);
    return false;
  });
  safeHandle('engine:listModels',    () => {
    try { return engine.listModels(userData()); } catch (_) { return []; }
  });

  // ── System Info (for Setup Wizard) ──────────────────────────────────────────
  safeHandle('system:info', () => {
    const totalRam = Math.round(os.totalmem() / (1024 ** 3));
    const cpus = os.cpus();
    const cpu = cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
    const arch = os.arch();
    const platform = process.platform; // 'win32' | 'darwin' | 'linux'
    const platformLabel = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux';
    // Recommend models based on available RAM
    let tier = 'low';
    if (totalRam >= 32) tier = 'high';
    else if (totalRam >= 16) tier = 'mid';
    const recommendations = {
      low: [
        { name: 'SD Turbo (SDXL)', repo: 'stabilityai/sdxl-turbo', size: '~6 GB', note: 'Lightning-fast image gen, great for low-VRAM machines' },
        { name: 'LCM (LatentConsistency)', repo: 'SimianLuo/LCM_Dreamshaper_v7', size: '~4 GB', note: 'Fast, consistent, 4-step generation' },
        { name: 'Stable Diffusion 1.5', repo: 'stable-diffusion-v1-5/stable-diffusion-v1-5', size: '~4 GB', note: 'Classic workhorse, runs on 4 GB VRAM' },
      ],
      mid: [
        { name: 'SDXL Base 1.0', repo: 'stabilityai/stable-diffusion-xl-base-1.0', size: '~7 GB', note: 'Full-quality SDXL — best balance of quality and speed' },
        { name: 'Realistic Vision v5', repo: 'SG161222/Realistic_Vision_V5.1_noVAE', size: '~4 GB', note: 'Stunning photorealistic images' },
        { name: 'SDXL Lightning', repo: 'ByteDance/SDXL-Lightning', size: '~7 GB', note: '4-step SDXL-quality generation at LCM speed' },
      ],
      high: [
        { name: 'Flux.1 Dev', repo: 'black-forest-labs/FLUX.1-dev', size: '~23 GB', note: 'State-of-the-art open-source image generation' },
        { name: 'Flux.1 Schnell', repo: 'black-forest-labs/FLUX.1-schnell', size: '~23 GB', note: 'Fastest Flux — 4 steps, incredible quality' },
        { name: 'SDXL + Refiner', repo: 'stabilityai/stable-diffusion-xl-refiner-1.0', size: '~13 GB', note: 'Full SDXL pipeline with detail refiner pass' },
      ],
    };
    return { platform, platformLabel, arch, totalRam, cpu, tier, recommendations: recommendations[tier] };
  });

  // ── TouchDesigner Bridge IPC ─────────────────────────────────────────────────
  safeHandle('td:connect', async (_e, config) => {
    const r = await tdBridge.connectOSC(config || {});
    if (config && config.wsPort) tdBridge.connectWS(config.wsPort);
    return { ok: r.ok, status: tdBridge.status() };
  });

  safeHandle('td:disconnect', () => { tdBridge.disconnect(); return { ok: true }; });
  safeHandle('td:status',     () => tdBridge.status());

  safeHandle('td:sendOSC', (_e, address, value) => {
    return tdBridge.sendOSC(address, value);
  });

  safeHandle('td:sendParams', (_e, paramMap) => {
    tdBridge.sendParams(paramMap || {}); return { ok: true };
  });

  safeHandle('td:sendWS', (_e, obj) => {
    return tdBridge.sendWS(obj);
  });

  safeHandle('td:launch', (_e, toePath, exePath) => {
    return tdBridge.launch(toePath || null, exePath || null);
  });

  safeHandle('td:watchOutput', (_e, folder) => {
    tdBridge.watchOutput(folder, (file) => {
      if (win && !win.isDestroyed()) win.webContents.send('td:render', file);
    });
    return { ok: true, folder };
  });

  safeHandle('td:pickOutputFolder', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
}

function createWindow() {
  // Resolve-style launch card while the studio loads (closes as soon as the main window is ready)
  let splash = null;
  try {
    splash = new BrowserWindow({ width: 660, height: 380, frame: false, transparent: true, resizable: false, movable: true, center: true,
      skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, webPreferences: { sandbox: true } });
    splash.loadFile(path.join(__dirname, 'splash.html'));
    splash.once('ready-to-show', () => splash && !splash.isDestroyed() && splash.show());
  } catch (_) { splash = null; }
  const closeSplash = () => { if (splash && !splash.isDestroyed()) splash.destroy(); splash = null; };
  setTimeout(closeSplash, 15000); // never get stuck

  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    show: false,
    backgroundColor: '#0b0920',
    title: "God's Pandora",
    autoHideMenuBar: true,   // cleaner window; press Alt to show the menu
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    }
  });

  // Links with target="_blank" (Hugging Face, docs, GitHub) open in the system browser
  // Windows mouse back/forward buttons and keyboard media keys → in-app history
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') win.webContents.send('nav:history', 'back');
    if (cmd === 'browser-forward') win.webContents.send('nav:history', 'forward');
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  const t0 = Date.now();
  win.once('ready-to-show', () => {
    // keep the card up at least ~1.2 s so it doesn't flash
    setTimeout(() => { closeSplash(); if (!win.isDestroyed()) { win.show(); win.focus(); } }, Math.max(0, 1200 - (Date.now() - t0)));
  });
  if (process.env.VITE_DEV) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Renderer crash -> offer reload
  win.webContents.on('render-process-gone', (_ev, details) => {
    console.error('[Window] Renderer gone:', details.reason);
    if (['crashed','killed','oom'].includes(details.reason)) {
      dialog.showMessageBox({
        type: 'warning', title: "God's Pandora - Recovering",
        message: "The display process crashed. Reload now?",
        buttons: ['Reload', 'Quit'], defaultId: 0,
      }).then(({ response }) => { if (response === 0) win.reload(); else app.quit(); })
        .catch(() => win.reload());
    }
  });

  // Unresponsive window -> offer reload
  win.on('unresponsive', () => {
    dialog.showMessageBox({
      type: 'warning', title: "God's Pandora - Not Responding",
      message: "The app is not responding. Reload it?",
      buttons: ['Reload', 'Wait'], defaultId: 0,
    }).then(({ response }) => { if (response === 0) win.reload(); })
      .catch(() => {});
  });
}

// Process-level safety net: log but never quit on unhandled errors
process.on('uncaughtException',  (err)    => console.error('[Process] uncaughtException:', err));
process.on('unhandledRejection', (reason) => console.error('[Process] unhandledRejection:', reason));

const gotLock = app.requestSingleInstanceLock();
app.whenReady().then(() => {
  if (!gotLock) return;
  protocol.registerFileProtocol('media', (request, cb) => {
    try { cb({ path: decodeURIComponent(request.url.replace('media://', '')) }); }
    catch (_) { cb({ error: -2 }); }
  });
  registerIpc();
  createWindow();
  updater.init((payload) => { if (win && !win.isDestroyed()) win.webContents.send('update:event', payload); });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// One God's Pandora at a time: a second launch focuses the open window (avoids two engines on one port)
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
}
app.on('before-quit', () => {
  try { engine.stop(); } catch (_) {}
  try { for (const r of engine.activeDownloads()) engine.cancelDownload(r); } catch (_) {}
  try { cut.cancelAll(); } catch (_) {}
});

app.on('window-all-closed', () => {
  try { engine.stop(); } catch (_) {}
  try { tdBridge.disconnect(); } catch (_) {}
  if (process.platform !== 'darwin') app.quit();
});
