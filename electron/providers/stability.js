// Stability AI — Stable Image endpoints.
async function generate({ model, prompt, params, key }) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('output_format', 'png');
  if (params.aspectRatio) form.append('aspect_ratio', params.aspectRatio);
  const res = await fetch(`https://api.stability.ai/v2beta/stable-image/generate/${model.endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
    body: form
  });
  if (!res.ok) throw new Error(`Stability error ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, mime: 'image/png' };
}
module.exports = { generate };
