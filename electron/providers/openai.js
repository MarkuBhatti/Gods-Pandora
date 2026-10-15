// OpenAI — GPT Image (image generation). Returns base64.
async function generate({ model, prompt, params, key }) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model.endpoint, prompt, size: params.size || 'auto', ...(model.defaults || {}) })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return { dataUrl: `data:image/png;base64,${json.data[0].b64_json}`, mime: 'image/png' };
}
module.exports = { generate };
