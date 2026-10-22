// Live model intelligence from the Hugging Face Hub API:
//  • feed()          newest releases from the major open-source labs
//  • info()          size / gated / revision of one repo (before downloading)
//  • localRevision() which revision of a repo is in app storage
//  • checkInstalled() compares local revisions with the Hub to find model updates
const fs = require('fs');
const path = require('path');

const API = 'https://huggingface.co/api/models';

const LABS = [
  'black-forest-labs', 'stabilityai', 'Qwen', 'Wan-AI', 'Lightricks', 'tencent',
  'meta-llama', 'deepseek-ai', 'google', 'zai-org', 'moonshotai', 'mistralai',
  'genmo', 'Skywork', 'HiDream-ai', 'nvidia', 'microsoft', 'openai',
  'hexgrad', 'ResembleAI', 'fishaudio', 'IndexTeam', 'ACE-Step', 'm-a-p', 'MiniMaxAI', 'k2-fsa', 'bosonai', 'TencentARC',
];

const TYPE_BY_PIPELINE = {
  'text-to-image': 'image', 'image-to-image': 'image',
  'text-to-video': 'video', 'image-to-video': 'video', 'video-to-video': 'video',
  'text-generation': 'llm', 'image-text-to-text': 'llm', 'any-to-any': 'llm',
  'text-to-speech': 'audio', 'text-to-audio': 'audio', 'automatic-speech-recognition': 'audio', 'audio-to-audio': 'audio',
  'image-to-3d': '3d', 'text-to-3d': '3d',
};

// Skip quantized / adapter / research-artifact variants — the feed shows base releases
const NOISE = /(fp8|fp4|nvfp4|gguf|onnx|awq|gptq|int4|int8|bnb|mlx|exl2|[-_]sae[-_]|^sae-|lora|eagle|dflash|dspark|-original|-decoder$|-bench|aligner|-pe-|guard)/i;

function headers(token) {
  const h = { 'User-Agent': 'GodsPandora-Desktop' };
  if (token) h.Authorization = 'Bearer ' + token;
  return h;
}

async function getJSON(url, token) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: headers(token), signal: ctrl.signal });
    if (!res.ok) throw new Error('Hugging Face API ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

async function feed({ token, perLab = 12 } = {}) {
  const results = await Promise.allSettled(LABS.map((a) =>
    getJSON(`${API}?author=${encodeURIComponent(a)}&sort=createdAt&direction=-1&limit=${perLab}`, token)));
  const seen = new Set();
  const items = [];
  results.forEach((r) => {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) return;
    for (const m of r.value) {
      const type = TYPE_BY_PIPELINE[m.pipeline_tag];
      if (!type || NOISE.test(m.id) || seen.has(m.id)) continue;
      seen.add(m.id);
      const tags = m.tags || [];
      const lic = (tags.find((t) => t.startsWith('license:')) || '').replace('license:', '');
      items.push({
        id: m.id, type, pipeline: m.pipeline_tag, createdAt: m.createdAt,
        likes: m.likes || 0, downloads: m.downloads || 0, license: lic || 'see card',
        engine: (type === 'image' || type === 'video') && tags.includes('diffusers'), // the built-in engine runs diffusers image AND video models (Wan, LTX…)
        link: 'https://huggingface.co/' + m.id,
      });
    }
  });
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { items: items.slice(0, 80), fetchedAt: new Date().toISOString(), failedLabs: failed };
}

// Same plan as engine/hub.py: config files + ONE copy of the weights per component (fp16 safetensors
// when available). Returns the bytes that will really be downloaded.
function plannedBytes(files) {
  const names = files.map((f) => f.path);
  const size = Object.fromEntries(files.map((f) => [f.path, f.size || 0]));
  const sum = (list) => list.reduce((a, f) => a + (size[f] || 0), 0);
  if (!names.includes('model_index.json')) {
    const st = names.filter((f) => f.endsWith('.safetensors'));
    if (st.length) return sum(st) + sum(names.filter((f) => /\.(json|txt|model)$/.test(f)));
    return sum(names.filter((f) => !/\.(onnx|onnx_data|msgpack|h5)$/i.test(f)));
  }
  let total = size['model_index.json'] || 0;
  const folders = [...new Set(names.filter((f) => f.includes('/')).map((f) => f.split('/')[0]))];
  for (const d of folders) {
    const inside = names.filter((f) => f.startsWith(d + '/'));
    total += sum(inside.filter((f) => /\.(json|txt|model|jinja)$/.test(f) || /vocab|merges/.test(f)));
    const st = inside.filter((f) => f.endsWith('.safetensors'));
    const fp16 = st.filter((f) => /\.fp16\.|fp16-/.test(f));
    total += fp16.length ? sum(fp16) : st.length ? sum(st) : sum(inside.filter((f) => f.endsWith('.bin')));
  }
  return total;
}

// Pandora-ready (diffusers) twins of popular models that are often re-uploaded in ComfyUI / GGUF form
const READY_TWIN = [
  [/wan[-_ ]?2[._]?2.*(ti2v|5b)|wan_2\.2_comfyui|wan2\.2.*comfy/i, 'Wan-AI/Wan2.2-TI2V-5B-Diffusers'],
  [/wan[-_ ]?2[._]?2.*t2v.*a14b/i, 'Wan-AI/Wan2.2-T2V-A14B-Diffusers'],
  [/wan[-_ ]?2[._]?2.*i2v.*a14b/i, 'Wan-AI/Wan2.2-I2V-A14B-Diffusers'],
  [/wan[-_ ]?2[._]?1.*1\.3b/i, 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers'],
  [/flux[-_.]?2.*klein/i, 'black-forest-labs/FLUX.2-klein-4B'],
  [/ltx[-_ ]?(video|2)/i, 'Lightricks/LTX-Video'],
];
async function info(repo, token) {
  const q = ['gated', 'usedStorage', 'sha', 'lastModified', 'pipeline_tag', 'tags'].map((e) => 'expand[]=' + e).join('&');
  const j = await getJSON(`${API}/${repo}?${q}`, token);
  let download = 0; let hasIndex = null; let files = [];
  try {
    const tree = await getJSON(`${API}/${repo}/tree/main?recursive=true`, token);
    if (Array.isArray(tree)) {
      files = tree.filter((f) => f.type === 'file');
      download = plannedBytes(files);
      hasIndex = files.some((f) => f.path === 'model_index.json'); // diffusers layout = runs in Pandora's engine
    }
  } catch (_) { /* fall back to tags */ }
  const tags = j.tags || [];
  const pipe = j.pipeline_tag || '';
  const visual = /image|video/.test(pipe) || /wan|flux|ltx|stable-diffusion|sdxl|hunyuan|cogvideo/i.test(repo);
  const engine = visual && (hasIndex === true || (hasIndex === null && tags.includes('diffusers')));
  // a ComfyUI / GGUF / single-file copy: point to the twin Pandora can run directly
  let alt = null;
  if (!engine && visual) {
    const hit = READY_TWIN.find(([re]) => re.test(repo));
    let cand = hit ? hit[1] : (!/-diffusers$/i.test(repo) ? repo + '-Diffusers' : null);
    if (cand && cand.toLowerCase() !== repo.toLowerCase()) {
      try { const t = await getJSON(`${API}/${cand}?expand[]=usedStorage`, token); if (t && (t.id || t.usedStorage)) alt = t.id || cand; } catch (_) { /* no twin */ }
    }
  }
  const format = engine ? 'diffusers' : files.some((f) => /\.gguf$/i.test(f.path)) ? 'gguf' : /comfy/i.test(repo) || files.some((f) => /comfy/i.test(f.path)) ? 'comfyui' : files.length && files.every((f) => !/\//.test(f.path) || /^(assets|images|examples)\//.test(f.path)) ? 'single-file' : 'other';
  return {
    id: j.id || repo, gated: j.gated || false, sizeBytes: download || j.usedStorage || 0, repoBytes: j.usedStorage || 0,
    sha: j.sha || null, lastModified: j.lastModified || null,
    engine, kind: /video/.test(pipe) || /wan|ltx|cogvideo|hunyuanvideo/i.test(repo) ? 'video' : /image/.test(pipe) ? 'image' : (pipe || 'other'),
    format, alt,
  };
}

function repoDir(modelsDir, repo) {
  return path.join(modelsDir, 'hub', 'models--' + repo.replace(/\//g, '--'));
}

function localRevision(modelsDir, repo) {
  try { return fs.readFileSync(path.join(repoDir(modelsDir, repo), 'refs', 'main'), 'utf8').trim(); }
  catch (_) { return null; }
}

async function checkInstalled(modelsDir, repos, token) {
  const out = [];
  for (const repo of repos) {
    const local = localRevision(modelsDir, repo);
    try {
      const remote = await info(repo, token);
      out.push({ repo, local, remote: remote.sha, lastModified: remote.lastModified, updateAvailable: !!(local && remote.sha && local !== remote.sha) });
    } catch (err) {
      out.push({ repo, local, error: String(err.message || err) });
    }
  }
  return out;
}

// Bytes on disk for a repo in the HF cache (blobs incl. *.incomplete) — used for download progress
function bytesOnDisk(modelsDir, repo) {
  let total = 0;
  const walk = (d) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) { try { total += fs.statSync(p).size; } catch (_) {} }
    }
  };
  // with symlinks: data lives in blobs/ (snapshots/ holds links, skipped by isFile);
  // without symlinks (Windows w/o Developer Mode): data lives directly in snapshots/
  walk(repoDir(modelsDir, repo));
  return total;
}

module.exports = { plannedBytes, feed, info, localRevision, checkInstalled, bytesOnDisk, repoDir };
