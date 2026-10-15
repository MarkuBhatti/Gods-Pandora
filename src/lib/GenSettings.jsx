import React from 'react';

// Resolution + advanced generation controls (Higgsfield-style presets, ComfyUI-style sampler params).
// Image sizes are multiples of 8 so they are valid latent sizes for SD / SDXL / FLUX.

export const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'];

// Native-friendly sizes per aspect ratio, by quality tier (~megapixels)
const IMAGE_SIZES = {
  '1:1':  { sd: [512, 512],  xl: [1024, 1024], hi: [1536, 1536], max: [2048, 2048] },
  '16:9': { sd: [768, 432],  xl: [1344, 768],  hi: [1920, 1088], max: [2560, 1440] },
  '9:16': { sd: [432, 768],  xl: [768, 1344],  hi: [1088, 1920], max: [1440, 2560] },
  '4:3':  { sd: [640, 480],  xl: [1152, 896],  hi: [1600, 1200], max: [2048, 1536] },
  '3:4':  { sd: [480, 640],  xl: [896, 1152],  hi: [1200, 1600], max: [1536, 2048] },
  '3:2':  { sd: [768, 512],  xl: [1216, 832],  hi: [1728, 1152], max: [2304, 1536] },
  '2:3':  { sd: [512, 768],  xl: [832, 1216],  hi: [1152, 1728], max: [1536, 2304] },
  '21:9': { sd: [896, 384],  xl: [1536, 640],  hi: [2016, 864],  max: [2688, 1152] },
};
export const IMAGE_TIERS = [
  ['sd',  'SD · ~0.3 MP (SD 1.5 native, fastest)'],
  ['xl',  'XL · ~1 MP (SDXL / FLUX native)'],
  ['hi',  'HD · ~2 MP (1080p-class)'],
  ['max', '2K+ · ~4 MP (FLUX.2 / Qwen-Image max)'],
];

export const VIDEO_RES = [
  ['480p',  '480p · 854×480 (fast drafts)'],
  ['720p',  '720p · 1280×720 (most models native)'],
  ['1080p', '1080p · 1920×1080 (Kling / Seedance / Veo / Wan 2.6+)'],
  ['4k',    '4K · 3840×2160 (LTX-2.3 / Veo 3.1 / upscaled)'],
];

export const SAMPLERS = [
  ['default', 'Model default'],
  ['euler', 'Euler'], ['euler_a', 'Euler Ancestral'], ['dpmpp_2m', 'DPM++ 2M'],
  ['dpmpp_2m_karras', 'DPM++ 2M Karras'], ['dpmpp_sde_karras', 'DPM++ SDE Karras'],
  ['unipc', 'UniPC'], ['ddim', 'DDIM'], ['heun', 'Heun'], ['lms', 'LMS'],
];

export const DEFAULT_GEN = {
  aspectRatio: '16:9', tier: 'xl', custom: false, width: 1344, height: 768,
  videoRes: '720p', duration: 5, fps: 24,
  steps: '', guidance: '', seed: '', sampler: 'default',
};

const r8 = (n) => Math.max(64, Math.round((+n || 0) / 8) * 8);

export function resolveSize(g) {
  if (g.custom) return [r8(g.width), r8(g.height)];
  const t = IMAGE_SIZES[g.aspectRatio] || IMAGE_SIZES['1:1'];
  return t[g.tier] || t.xl;
}

// Turn UI state into the params object sent to providers
export function genParams(g, kind) {
  const p = { aspectRatio: g.aspectRatio };
  if (kind === 'image') {
    const [w, h] = resolveSize(g);
    p.width = w; p.height = h;
  }
  if (kind === 'video') {
    p.resolution = g.videoRes; p.duration = +g.duration || 5; p.fps = +g.fps || 24;
  }
  if (g.steps !== '' && g.steps != null) p.steps = +g.steps;
  if (g.guidance !== '' && g.guidance != null) p.guidance = +g.guidance;
  if (g.seed !== '' && g.seed != null) p.seed = Math.max(0, Math.floor(+g.seed));
  if (g.sampler && g.sampler !== 'default') p.sampler = g.sampler;
  return p;
}

export default function GenSettings({ value, onChange, kind, source }) {
  const g = value;
  const set = (patch) => onChange({ ...g, ...patch });
  const [adv, setAdv] = React.useState(false);
  if (kind === 'audio') return null;
  const [w, h] = resolveSize(g);
  const mp = ((w * h) / 1e6).toFixed(2);
  const local = source === 'local';

  return (
    <div className="gen-settings">
      <label>Aspect ratio</label>
      <div className="row">
        {ASPECTS.map((a) => (
          <button key={a} className={'chip' + (g.aspectRatio === a ? ' on' : '')}
            onClick={() => set({ aspectRatio: a, custom: false })}>{a}</button>
        ))}
      </div>

      {kind === 'image' && (
        <>
          <label>Image resolution</label>
          <div className="row">
            <select style={{ flex: 1 }} value={g.custom ? 'custom' : g.tier}
              onChange={(e) => e.target.value === 'custom'
                ? set({ custom: true, width: w, height: h })
                : set({ custom: false, tier: e.target.value })}>
              {IMAGE_TIERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              <option value="custom">Custom width × height…</option>
            </select>
            <span className="badge">{w}×{h} · {mp} MP</span>
          </div>
          {g.custom && (
            <div className="row" style={{ marginTop: 6 }}>
              <input type="number" min="64" max="4096" step="8" style={{ width: 100 }} value={g.width}
                onChange={(e) => set({ width: e.target.value })} />
              <span className="sub">×</span>
              <input type="number" min="64" max="4096" step="8" style={{ width: 100 }} value={g.height}
                onChange={(e) => set({ height: e.target.value })} />
              <span className="sub" style={{ fontSize: 11 }}>rounded to multiples of 8</span>
            </div>
          )}
          {!local && (
            <p className="sub" style={{ fontSize: 11, margin: '4px 0 0' }}>
              Cloud models receive the aspect ratio; exact pixel size is sent only to models that accept it.
            </p>
          )}
        </>
      )}

      {kind === 'video' && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label>Video resolution</label>
            <select value={g.videoRes} onChange={(e) => set({ videoRes: e.target.value })}>
              {VIDEO_RES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Duration (s)</label>
            <select value={g.duration} onChange={(e) => set({ duration: +e.target.value })}>
              {[3, 4, 5, 6, 8, 10, 12, 15, 20].map((d) => <option key={d} value={d}>{d}s</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label>Frame rate</label>
            <select value={g.fps} onChange={(e) => set({ fps: +e.target.value })}>
              {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}
            </select>
          </div>
        </div>
      )}

      <button className="btn ghost small" style={{ marginTop: 10 }} onClick={() => setAdv((v) => !v)}>
        {adv ? '▾' : '▸'} Advanced (steps · CFG · seed · sampler)
      </button>
      {adv && (
        <div className="adv-grid">
          <div>
            <label>Steps <span className="sub">(blank = model default)</span></label>
            <input type="number" min="1" max="150" placeholder="e.g. 28" value={g.steps}
              onChange={(e) => set({ steps: e.target.value })} />
          </div>
          <div>
            <label>CFG / guidance</label>
            <input type="number" min="0" max="30" step="0.5" placeholder="e.g. 4.5" value={g.guidance}
              onChange={(e) => set({ guidance: e.target.value })} />
          </div>
          <div>
            <label>Seed <span className="sub">(blank = random)</span></label>
            <div className="row">
              <input type="number" min="0" style={{ flex: 1 }} placeholder="random" value={g.seed}
                onChange={(e) => set({ seed: e.target.value })} />
              <button className="btn ghost small" title="Pick a random seed you can reuse"
                onClick={() => set({ seed: Math.floor(Math.random() * 2 ** 31) })}>🎲</button>
            </div>
          </div>
          <div>
            <label>Sampler {local ? '' : <span className="sub">(local engine only)</span>}</label>
            <select value={g.sampler} disabled={!local} onChange={(e) => set({ sampler: e.target.value })}>
              {SAMPLERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <p className="sub" style={{ gridColumn: '1 / -1', fontSize: 11, margin: 0 }}>
            FLUX-family models use their own flow-matching scheduler, so the sampler choice applies to SD 1.5 / SDXL-type models.
            Cloud providers receive seed / steps / guidance only where their API supports them.
          </p>
        </div>
      )}
    </div>
  );
}
