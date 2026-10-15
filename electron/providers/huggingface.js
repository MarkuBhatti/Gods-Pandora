// Hugging Face Inference Providers — run open-source models hosted on HF without a GPU.
// One HF token (Settings → API Keys → Hugging Face, with "Inference Providers" permission).
// Endpoint = any Hub repo id (e.g. "black-forest-labs/FLUX.1-dev"). God's Pandora looks up which
// providers serve that model and calls it through router.huggingface.co.
const { poll } = require('../net');

const ROUTER = 'https://router.huggingface.co';
const PREFERRED = ['hf-inference', 'fal-ai', 'replicate'];

async function mapping(repo, key) {
  const r = await fetch(`https://huggingface.co/api/models/${repo}?expand[]=inferenceProviderMapping&expand[]=pipeline_tag`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!r.ok) throw new Error('Hugging Face: model not found or not accessible (' + r.status + '): ' + repo);
  const j = await r.json();
  return { map: j.inferenceProviderMapping || {}, pipeline: j.pipeline_tag };
}

function pickProvider(map, kind) {
  const want = kind === 'video' ? ['text-to-video', 'image-to-video'] : ['text-to-image', 'image-to-image'];
  for (const p of PREFERRED) {
    const m = map[p];
    if (m && m.status === 'live' && want.includes(m.task)) return { provider: p, ...m };
  }
  return null;
}

async function generate({ model, prompt, refs, params, key }) {
  if (!key) throw new Error('Add your Hugging Face token in Settings → API Keys → Hugging Face.');
  const auth = { Authorization: `Bearer ${key}` };
  const { map } = await mapping(model.endpoint, key);
  const chosen = pickProvider(map, model.kind);
  if (!chosen) {
    const live = Object.keys(map).filter((k) => map[k].status === 'live');
    throw new Error(`No supported live inference provider for ${model.endpoint} (${model.kind}). ` +
      (live.length ? 'Available: ' + live.join(', ') + '. ' : '') + 'Download it and run it locally instead, or pick another model.');
  }

  if (/^image-to-/.test(chosen.task) && !refs.length) {
    throw new Error(model.endpoint + ' is served as ' + chosen.task + ' — add a reference image (or a character/location with refs) to use it.');
  }

  if (chosen.provider === 'hf-inference') {
    const parameters = {};
    if (params.width) parameters.width = params.width;
    if (params.height) parameters.height = params.height;
    if (params.steps) parameters.num_inference_steps = params.steps;
    if (params.guidance != null) parameters.guidance_scale = params.guidance;
    if (params.seed != null) parameters.seed = params.seed;
    if (params.negativePrompt) parameters.negative_prompt = params.negativePrompt;
    const r = await fetch(`${ROUTER}/hf-inference/models/${model.endpoint}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: prompt, parameters }),
    });
    if (!r.ok) throw new Error('HF Inference error ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const mime = r.headers.get('content-type') || 'image/png';
    const buf = Buffer.from(await r.arrayBuffer());
    return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mime };
  }

  if (chosen.provider === 'fal-ai') {
    const input = { prompt };
    if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
    if (params.width && params.height) input.image_size = { width: params.width, height: params.height };
    if (params.seed != null) input.seed = params.seed;
    if (params.steps) input.num_inference_steps = params.steps;
    if (params.guidance != null) input.guidance_scale = params.guidance;
    if (refs.length && /image-to/.test(chosen.task)) input.image_url = refs[0];
    const r = await fetch(`${ROUTER}/fal-ai/${chosen.providerId}`, {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('HF → fal error ' + r.status + ': ' + JSON.stringify(json).slice(0, 300));
    const url = json.images?.[0]?.url || json.image?.url || json.video?.url;
    if (!url) throw new Error('HF → fal: no media in response.');
    return { url };
  }

  // replicate via the HF router
  const input = { prompt };
  if (params.aspectRatio) input.aspect_ratio = params.aspectRatio;
  if (params.seed != null) input.seed = params.seed;
  if (refs.length && /image-to/.test(chosen.task)) input.image = refs[0];
  const [slug, version] = String(chosen.providerId).split(':');
  const url = version ? `${ROUTER}/replicate/v1/predictions` : `${ROUTER}/replicate/v1/models/${slug}/predictions`;
  const r = await fetch(url, {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json', Prefer: 'wait=60' },
    body: JSON.stringify(version ? { version, input } : { input }),
  });
  let pred = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('HF → replicate error ' + r.status + ': ' + JSON.stringify(pred).slice(0, 300));
  if (pred.status !== 'succeeded' && pred.id) {
    pred = await poll(async () => {
      const p = await fetch(`${ROUTER}/replicate/v1/predictions/${pred.id}`, { headers: auth });
      const j = await p.json().catch(() => ({}));
      if (j.status === 'succeeded') return j;
      if (j.status === 'failed' || j.status === 'canceled') throw new Error('Replicate (via HF) failed: ' + (j.error || j.status));
      return undefined;
    });
  }
  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  const outUrl = typeof out === 'string' ? out : out?.url;
  if (!outUrl) throw new Error('HF → replicate: no output.');
  return { url: outUrl };
}

module.exports = { generate };
