const { optionalParams } = require('./params');
// Replicate — one key, thousands of open + closed models. Uses the "Prefer: wait" sync mode, falls back to polling.
async function generate({ model, prompt, refs, params, key }) {
  const input = { prompt, ...(model.defaults || {}) };
  const extra = optionalParams(model, params);
  if (params.aspectRatio && !extra.width) input.aspect_ratio = params.aspectRatio;
  Object.assign(input, extra);
  if (params.negativePrompt && model.params?.size) input.negative_prompt = params.negativePrompt;
  if (model.refInput && refs.length) input[model.refInput] = model.maxRefs === 1 ? refs[0] : refs;

  const res = await fetch(`https://api.replicate.com/v1/models/${model.endpoint}/predictions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'wait=60' },
    body: JSON.stringify({ input })
  });
  let pred = await res.json();
  if (!res.ok) throw new Error(`Replicate error ${res.status}: ${JSON.stringify(pred).slice(0, 400)}`);

  while (pred.status === 'starting' || pred.status === 'processing') {
    await new Promise((r) => setTimeout(r, 2500));
    const poll = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${key}` } });
    pred = await poll.json();
  }
  if (pred.status !== 'succeeded') throw new Error('Replicate failed: ' + (pred.error || pred.status));
  const out = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  return { url: typeof out === 'string' ? out : out?.url };
}
module.exports = { generate };
