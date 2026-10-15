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
        engine: type === 'image' && tags.includes('diffusers'),
        link: 'https://huggingface.co/' + m.id,
      });
    }
  });
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { items: items.slice(0, 80), fetchedAt: new Date().toISOString(), failedLabs: failed };
}

async function info(repo, token) {
  const q = ['gated', 'usedStorage', 'sha', 'lastModified', 'pipeline_tag', 'tags'].map((e) => 'expand[]=' + e).join('&');
  const j = await getJSON(`${API}/${repo}?${q}`, token);
  return {
    id: j.id || repo, gated: j.gated || false, sizeBytes: j.usedStorage || 0,
    sha: j.sha || null, lastModified: j.lastModified || null,
    engine: (j.tags || []).includes('diffusers') && /image/.test(j.pipeline_tag || ''),
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

module.exports = { feed, info, localRevision, checkInstalled, bytesOnDisk, repoDir };
