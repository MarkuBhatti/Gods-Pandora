// Higgsfield API (https://docs.higgsfield.ai) — SOUL, Kling, MiniMax, Seedance, Wan… through one async API.
// Key format in Settings: "KEY_ID:KEY_SECRET" (create credentials at https://console.higgsfield.ai).
// Endpoint = model path, e.g. "higgsfield-ai/soul/standard" or "kling-video/v2.5-turbo/pro/image-to-video".
const { optionalParams } = require('./params');
const { poll } = require('../net');

const BASE = 'https://api.higgsfield.ai';

function authHeader(key) {
  if (!key || !key.includes(':')) throw new Error('Higgsfield key must be "KEY_ID:KEY_SECRET" (Settings → API Keys → Higgsfield).');
  return { Authorization: `Key ${key}` };
}

// Higgsfield takes public URLs for input media — upload data URIs via a presigned URL first.
async function uploadDataUrl(dataUrl, key) {
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return dataUrl; // already a URL
  const contentType = m[1] === 'image/jpg' ? 'image/jpeg' : m[1];
  const r = await fetch(`${BASE}/files/generate-upload-url`, {
    method: 'POST', headers: { ...authHeader(key), 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: contentType }),
  });
  const up = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Higgsfield upload error ' + r.status + ': ' + JSON.stringify(up).slice(0, 200));
  const put = await fetch(up.upload_url, { method: 'PUT', headers: up.upload_headers || { 'Content-Type': contentType }, body: Buffer.from(m[2], 'base64') });
  if (!put.ok) throw new Error('Higgsfield upload failed: ' + put.status);
  return up.public_url;
}

async function generate({ model, prompt, refs, params, key }) {
  const body = { prompt, ...(model.defaults || {}) };
  if (params.aspectRatio && model.params?.aspect !== false) body.aspect_ratio = params.aspectRatio;
  if (params.negativePrompt && model.params?.negative) body.negative_prompt = params.negativePrompt;
  Object.assign(body, optionalParams(model, params));
  if (model.soul && params.soul && params.soul.provider === 'higgsfield' && params.soul.id) {
    body.custom_reference_id = params.soul.id;       // trained Identity Lock
    body.custom_reference_strength = 1;
  }
  if (model.refInput && refs.length) {
    const urls = [];
    for (const r of refs.slice(0, model.maxRefs || 1)) urls.push(await uploadDataUrl(r, key));
    body[model.refInput] = model.refInput.endsWith('s') ? urls : urls[0];
  } else if (model.requiresImage) {
    throw new Error(model.name + ' needs an input image — add a reference image, character or location with refs.');
  }

  const res = await fetch(`${BASE}/${model.endpoint}`, {
    method: 'POST',
    headers: { ...authHeader(key), 'Content-Type': 'application/json', 'Idempotency-Key': cryptoId() },
    body: JSON.stringify(body),
  });
  const job = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Higgsfield error ${res.status}: ${JSON.stringify(job).slice(0, 400)}`);

  // Cancel → ask Higgsfield to drop the request if it's still queued (no credits used)
  require('../jobs').onCancel(() => {
    const url = job.cancel_url || `${BASE}/requests/${job.request_id}/cancel`;
    fetch(url, { method: 'POST', headers: authHeader(key), signal: AbortSignal.timeout(10000) }).catch(() => {});
  });
  const statusUrl = job.status_url || `${BASE}/requests/${job.request_id}/status`;
  const done = await poll(async () => {
    const s = await fetch(statusUrl, { headers: authHeader(key) });
    const st = await s.json().catch(() => ({}));
    if (st.status === 'completed') return st;
    if (['failed', 'nsfw', 'canceled'].includes(st.status)) {
      throw new Error('Higgsfield: generation ' + st.status + (st.error ? ' — ' + st.error : ''));
    }
    return undefined;
  });
  const url = done.images?.[0]?.url || done.video?.url || done.audio?.url || done.audios?.[0]?.url;
  if (!url) throw new Error('Higgsfield: no media in response.');
  return { url };
}

function cryptoId() { return require('crypto').randomUUID(); }

module.exports = { generate };
