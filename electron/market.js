// 🛒 Model Market — search and install open models from many hubs:
//   • Hugging Face (image, video, audio, 3D, LLM — by pipeline task)
//   • Civitai (checkpoints, LoRAs, embeddings, ControlNets…) — REST v1, optional API token
//   • OpenModelDB (upscalers)
//   • Ollama (local LLMs, pulled through your running Ollama)
//   • any direct file URL (.safetensors / .ckpt / .pth / .gguf / .onnx …)
// Files land in <userData>/models/<source>/<type>/ with a .json sidecar describing them.
const fs = require('fs');
const path = require('path');

const HF_TASKS = {
  image: ['text-to-image', 'image-to-image'],
  video: ['text-to-video', 'image-to-video'],
  audio: ['text-to-speech', 'text-to-audio', 'automatic-speech-recognition', 'audio-to-audio'],
  '3d': ['image-to-3d', 'text-to-3d'],
  llm: ['text-generation', 'image-text-to-text'],
};
const TYPE_OF_TASK = Object.fromEntries(Object.entries(HF_TASKS).flatMap(([k, v]) => v.map((t) => [t, k])));
const HF_SORT = { trending: 'trendingScore', downloads: 'downloads', likes: 'likes', newest: 'createdAt' };

async function getJSON(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': 'GodsPandora-Desktop', ...headers } });
  if (!r.ok) throw new Error((new URL(url)).host + ' returned ' + r.status);
  return r.json();
}

/* ── Hugging Face ── */
async function hfSearch({ q = '', category = 'all', sort = 'trending', limit = 40 } = {}, token) {
  const tasks = category === 'all' ? [null] : (HF_TASKS[category] || [category]);
  const per = Math.max(10, Math.ceil(limit / tasks.length));
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  const lists = await Promise.allSettled(tasks.map((t) => {
    const u = new URL('https://huggingface.co/api/models');
    if (q) u.searchParams.set('search', q);
    if (t) u.searchParams.set('pipeline_tag', t);
    u.searchParams.set('sort', HF_SORT[sort] || 'trendingScore');
    u.searchParams.set('direction', '-1');
    u.searchParams.set('limit', String(per));
    return getJSON(u.toString(), headers);
  }));
  const seen = new Set();
  const out = [];
  lists.forEach((r) => (r.status === 'fulfilled' ? r.value : []).forEach((m) => {
    if (seen.has(m.id)) return; seen.add(m.id);
    const tags = m.tags || [];
    out.push({
      source: 'huggingface', id: m.id, name: m.id.split('/').pop(), author: m.id.split('/')[0],
      task: m.pipeline_tag || '', type: TYPE_OF_TASK[m.pipeline_tag] || 'other',
      downloads: m.downloads || 0, likes: m.likes || 0, createdAt: m.createdAt,
      license: (tags.find((t) => t.startsWith('license:')) || '').replace('license:', '') || 'see card',
      engine: tags.includes('diffusers') && /image|video/.test(TYPE_OF_TASK[m.pipeline_tag] || ''),
      link: 'https://huggingface.co/' + m.id,
    });
  }));
  const key = { trending: 'likes', downloads: 'downloads', likes: 'likes' }[sort];
  if (sort === 'newest') out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  else if (key && tasks.length > 1) out.sort((a, b) => b[key] - a[key]);
  return out.slice(0, limit);
}

/* ── Civitai ── */
const CIVITAI = 'https://civitai.com/api/v1';
async function civitaiSearch({ q = '', types = [], sort = 'Most Downloaded', period = 'Month', baseModel = '', nextUrl = '' } = {}, token) {
  // nextUrl = metadata.nextPage from the previous call ("Load more")
  const u = nextUrl && nextUrl.startsWith(CIVITAI + '/models') ? new URL(nextUrl) : new URL(CIVITAI + '/models');
  if (!nextUrl) {
  u.searchParams.set('limit', '24');
  u.searchParams.set('nsfw', 'false');            // safe results only
  u.searchParams.set('primaryFileOnly', 'true');
  if (q) u.searchParams.set('query', q);
  [].concat(types || []).forEach((t) => u.searchParams.append('types', t));
  if (sort) u.searchParams.set('sort', sort);
  if (period) u.searchParams.set('period', period);
  }
  const j = await getJSON(u.toString(), token ? { Authorization: 'Bearer ' + token } : {});
  const items = (j.items || []).filter((m) => !m.nsfw && m.mode !== 'TakenDown' && m.mode !== 'Archived').map((m) => {
    const versions = (m.modelVersions || []).map((v) => {
      const file = (v.files || []).find((f) => f.primary) || (v.files || [])[0] || {};
      const img = (v.images || []).find((i) => !i.nsfw || i.nsfw === 'None' || i.nsfwLevel === 1) || null;
      return {
        id: v.id, name: v.name, baseModel: v.baseModel || '', createdAt: v.createdAt,
        downloadUrl: v.downloadUrl || (CIVITAI.replace('/api/v1', '') + '/api/download/models/' + v.id),
        trainedWords: v.trainedWords || [], fileName: file.name || '', sizeKB: file.sizeKB || 0,
        format: file.metadata?.format || '', scan: file.virusScanResult || '', pickle: file.pickleScanResult || '',
        image: img ? img.url : null,
      };
    });
    return {
      source: 'civitai', id: String(m.id), name: m.name, type: m.type, author: m.creator?.username || '',
      downloads: m.stats?.downloadCount || 0, likes: m.stats?.favoriteCount || m.stats?.thumbsUpCount || 0,
      rating: m.stats?.rating || 0, tags: m.tags || [], versions,
      image: versions.find((v) => v.image)?.image || null,
      link: 'https://civitai.com/models/' + m.id,
    };
  });
  // base-model filter (SD 1.5, SDXL 1.0, Pony, Illustrious, Flux.1 D…) applied on the versions we got
  const filtered = baseModel ? items.map((m) => ({ ...m, versions: m.versions.filter((v) => v.baseModel === baseModel) })).filter((m) => m.versions.length) : items;
  return { items: filtered, nextPage: j.metadata?.nextPage || '' };
}

/* ── OpenModelDB (upscalers) ── */
let omdbCache = null;
async function openModelDb({ q = '', scale = 0 } = {}) {
  if (!omdbCache) omdbCache = await getJSON('https://openmodeldb.info/api/v1/models.json');
  const t = q.trim().toLowerCase();
  return Object.entries(omdbCache)
    .map(([id, m]) => {
      const res = (m.resources || []).find((r) => (r.urls || []).some(directUrl)) || (m.resources || [])[0] || {};
      return {
        source: 'openmodeldb', id, name: m.name || id, author: [].concat(m.author || []).join(', '), type: 'upscaler',
        scale: m.scale, arch: m.architecture, license: m.license || '', tags: m.tags || [], date: m.date,
        description: String(m.description || '').slice(0, 220), size: res.size || 0, format: res.type || '',
        url: (res.urls || []).find(directUrl) || null, link: 'https://openmodeldb.info/models/' + id,
      };
    })
    .filter((m) => (!t || (m.name + ' ' + m.tags.join(' ') + ' ' + m.description + ' ' + m.author).toLowerCase().includes(t)) && (!scale || m.scale === scale))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 60);
}
// links we can stream directly (not Mega / Google Drive pages)
function directUrl(u) { return /^https?:\/\//.test(u) && !/mega\.nz|drive\.google|1drv\.ms|mediafire/i.test(u); }

/* ── Downloads ── */
function modelsRoot(userData) { const d = path.join(userData, 'models'); fs.mkdirSync(d, { recursive: true }); return d; }
const safe = (s) => String(s || 'file').replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 140);

async function downloadFile(userData, { url, source = 'files', type = 'other', meta = {}, token, fileName }, onProgress = () => {}) {
  if (!url || !/^https?:\/\//.test(url)) throw new Error('Not a downloadable URL.');
  let u = url;
  if (token && /civitai\.com/.test(u)) u += (u.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
  const res = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'GodsPandora-Desktop' } });
  if (res.status === 401 || res.status === 403) {
    throw new Error(/civitai/.test(url) ? 'This Civitai model needs you to be logged in — add a Civitai API key in Settings → API Keys (civitai.com → Account → API Keys).' : 'Access denied (' + res.status + ').');
  }
  if (!res.ok || !res.body) throw new Error('Download failed: HTTP ' + res.status);
  const cd = res.headers.get('content-disposition') || '';
  const fromHeader = (cd.match(/filename\*=UTF-8''([^;]+)/i) || [])[1] || (cd.match(/filename="?([^";]+)"?/i) || [])[1];
  let name = safe(decodeURIComponent(fileName || fromHeader || path.basename(new URL(res.url || url).pathname) || 'model.bin'));
  if (/text\/html/i.test(res.headers.get('content-type') || '')) throw new Error('That link points to a web page, not a model file.');
  const dir = path.join(modelsRoot(userData), source, safe(type).toLowerCase());
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name);
  const tmp = dest + '.part';
  const total = Number(res.headers.get('content-length')) || meta.sizeBytes || 0;
  const out = fs.createWriteStream(tmp);
  let got = 0; let last = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      if (Date.now() - last > 700) { last = Date.now(); onProgress({ bytes: got, total }); }
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  } catch (e) {
    out.destroy(); try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
  fs.renameSync(tmp, dest);
  fs.writeFileSync(dest + '.json', JSON.stringify({ ...meta, source, type, file: dest, url, downloadedAt: new Date().toISOString() }, null, 2));
  onProgress({ bytes: got, total: got, done: true });
  return { file: dest, name };
}

// Everything downloaded from Civitai / OpenModelDB / URLs (not the HF cache)
function listFiles(userData) {
  const root = modelsRoot(userData);
  const out = [];
  for (const src of ['civitai', 'openmodeldb', 'files']) {
    const base = path.join(root, src);
    if (!fs.existsSync(base)) continue;
    for (const type of fs.readdirSync(base)) {
      const d = path.join(base, type);
      if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d)) {
        if (f.endsWith('.json') || f.endsWith('.part')) continue;
        const p = path.join(d, f);
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(p + '.json', 'utf8')); } catch (_) { /* no sidecar */ }
        out.push({ file: p, name: meta.name || f, source: src, type, baseModel: meta.baseModel || '', trainedWords: meta.trainedWords || [], sizeBytes: fs.statSync(p).size, image: meta.image || null });
      }
    }
  }
  return out;
}

function deleteFile(userData, file) {
  const root = modelsRoot(userData);
  if (!path.resolve(file).startsWith(path.resolve(root))) throw new Error('Not a model file.');
  fs.rmSync(file, { force: true }); fs.rmSync(file + '.json', { force: true });
  return { ok: true };
}

/* ── Ollama (local LLMs) ── */
async function ollamaPull(model, onProgress = () => {}) {
  const r = await fetch('http://localhost:11434/api/pull', { method: 'POST', body: JSON.stringify({ model, stream: true }) }).catch(() => null);
  if (!r || !r.ok) throw new Error('Ollama is not running. Install it from ollama.com and start it, then try again.');
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try {
        const ev = JSON.parse(line);
        if (ev.error) throw new Error('Ollama: ' + ev.error);
        onProgress({ status: ev.status, bytes: ev.completed || 0, total: ev.total || 0 });
      } catch (e) { if (/Ollama:/.test(e.message)) throw e; }
    }
  }
  return { ok: true };
}
async function ollamaList() {
  const r = await fetch('http://localhost:11434/api/tags').catch(() => null);
  if (!r || !r.ok) return { running: false, models: [] };
  const j = await r.json();
  return { running: true, models: (j.models || []).map((m) => ({ name: m.name, size: m.size })) };
}

const { pinokioSearch } = require('./pinokio');

module.exports = { pinokioSearch, hfSearch, civitaiSearch, openModelDb, downloadFile, listFiles, deleteFile, ollamaPull, ollamaList, HF_TASKS };
