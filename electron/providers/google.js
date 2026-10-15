// Google AI Studio key — Imagen (image) & Veo (video) via the Generative Language API.
async function generate({ model, prompt, params, key }) {
  if (model.kind === 'image') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model.endpoint}:predict?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: params.aspectRatio || '1:1' }
        })
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(`Google error ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
    const b64 = json.predictions?.[0]?.bytesBase64Encoded;
    return { dataUrl: `data:image/png;base64,${b64}`, mime: 'image/png' };
  }
  // Veo long-running operation
  const start = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.endpoint}:predictLongRunning?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instances: [{ prompt }] }) }
  );
  let op = await start.json();
  if (!start.ok) throw new Error(`Google error: ${JSON.stringify(op).slice(0, 400)}`);
  while (!op.done) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op.name}?key=${key}`);
    op = await poll.json();
  }
  const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error('Google Veo: no video in response');
  return { url: uri.includes('key=') ? uri : `${uri}&key=${key}` };
}
module.exports = { generate };
