// FAL.ai — one key unlocks hundreds of image/video/audio models.
// Uses the queue API (submit → poll → fetch result) so long video jobs never time out.
const { optionalParams } = require('./params');
const { poll } = require('../net');

async function generate({ model, prompt, refs, params, key }) {
  const input = { prompt, ...mapParams(model, params) };
  if (model.refInput && refs.length) {
    // most FAL endpoints take either image_url (single) or image_urls (array); data URIs are accepted
    input[model.refInput] = model.refInput.endsWith('s') ? refs : refs[0];
  }
  const auth = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
  const sub = await fetch(`https://queue.fal.run/${model.endpoint}`, { method: 'POST', headers: auth, body: JSON.stringify(input) });
  const job = await sub.json().catch(() => ({}));
  if (!sub.ok) throw new Error(`FAL error ${sub.status}: ${JSON.stringify(job).slice(0, 400)}`);

  let json = job;
  if (job.request_id) {
    require('../jobs').onCancel(() => {
      const url = job.cancel_url || `https://queue.fal.run/${model.endpoint}/requests/${job.request_id}/cancel`;
      fetch(url, { method: 'PUT', headers: auth, signal: AbortSignal.timeout(10000) }).catch(() => {});
    });
  }
  if (job.status_url && job.response_url) {
    await poll(async () => {
      const s = await fetch(job.status_url, { headers: auth });
      const st = await s.json().catch(() => ({}));
      if (st.status === 'COMPLETED') return true;
      if (st.status === 'FAILED' || st.status === 'ERROR' || (!s.ok && s.status !== 202)) throw new Error('FAL job failed: ' + JSON.stringify(st).slice(0, 300));
      return undefined;
    });
    const r = await fetch(job.response_url, { headers: auth });
    json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`FAL error ${r.status}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  const url =
    json.images?.[0]?.url || json.image?.url || json.video?.url ||
    json.audio?.url || json.audio_file?.url || json.output?.url;
  if (!url) throw new Error('FAL: no media in response: ' + JSON.stringify(json).slice(0, 400));
  return { url };
}

function mapParams(model, params) {
  const out = { ...(model.defaults || {}) };
  if (model.params?.imageSize) {
    if (params.width && params.height) out.image_size = { width: params.width, height: params.height };
  } else if (params.aspectRatio && model.kind !== 'audio') out.aspect_ratio = params.aspectRatio;
  if (model.kind === 'audio' && model.secondsParam && params.seconds) out[model.secondsParam] = Math.max(1, Math.min(47, +params.seconds));
  if (params.negativePrompt) out.negative_prompt = params.negativePrompt;
  if (model.soul && params.soul && params.soul.provider === 'fal' && params.soul.loraUrl) {
    out.loras = [{ path: params.soul.loraUrl, scale: 1 }];
  }
  return { ...out, ...optionalParams(model, params) };
}
module.exports = { generate };
