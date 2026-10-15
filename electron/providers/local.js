// Local open-source engine (bundled Python sidecar, see engine/server.py). Ollama/ComfyUI-style: models live in app storage.
// Uses node:http with a long timeout — first loads and local video can take many minutes.
const { requestJSON } = require('../net');
const BASE = 'http://127.0.0.1:8756';

async function generate({ model, prompt, refs, params }) {
  // Cancel → the engine stops after the current denoising step
  require('../jobs').onCancel(() => { fetch(`${BASE}/cancel`, { method: 'POST', signal: AbortSignal.timeout(5000) }).catch(() => {}); });
  const kind = model.kind === 'video' ? 'video' : 'image';
  const { status, json } = await requestJSON(`${BASE}/generate`, {
    method: 'POST',
    timeoutMs: 60 * 60 * 1000,
    body: {
      model_id: model.endpoint,
      kind,
      prompt,
      negative_prompt: params.negativePrompt || '',
      width: params.width || (kind === 'video' ? resW(params.resolution, params.aspectRatio) : 1024),
      height: params.height || (kind === 'video' ? resH(params.resolution, params.aspectRatio) : 1024),
      steps: params.steps || (model.defaults?.steps ?? (kind === 'video' ? 30 : 28)),
      guidance: params.guidance ?? (model.defaults?.guidance ?? (kind === 'video' ? 5 : 4.5)),
      seed: params.seed ?? null,
      sampler: params.sampler || 'default',
      duration: params.duration || 5,
      fps: params.fps || 24,
      reference_images: refs, // data URIs: image editing / IP-Adapter consistency / image-to-video start frame
      lora_path: params.soul && params.soul.provider === 'local' ? params.soul.loraPath : null, // local Identity Lock
      loras: Array.isArray(params.loras) ? params.loras.filter((x) => x && x.path).map((x) => ({ path: x.path, scale: +x.scale || 0.8 })) : [],
      base_hint: model.base || '', // e.g. "SDXL 1.0" / "SD 1.5" for single-file checkpoints from Civitai
    },
  });
  if (status !== 200 || !json || json.error) throw new Error('Local engine: ' + ((json && json.error) || 'HTTP ' + status));
  if (json.video) return { dataUrl: json.video, mime: 'video/mp4', note: json.note };
  return { dataUrl: json.image, mime: 'image/png', note: json.note };
}

// Local video defaults: keep to sizes consumer GPUs can handle (engine rounds to model-friendly multiples)
const BASES = { '480p': 480, '720p': 720, '1080p': 1080, '4k': 1080 };
function dims(res, ar) {
  const short = BASES[res] || 480;
  const [a, b] = String(ar || '16:9').split(':').map(Number);
  const r = a && b ? a / b : 16 / 9;
  return r >= 1 ? [Math.round(short * r), short] : [short, Math.round(short / r)];
}
const resW = (res, ar) => dims(res, ar)[0];
const resH = (res, ar) => dims(res, ar)[1];

module.exports = { generate };
