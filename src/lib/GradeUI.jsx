import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LOOKS, DEFAULTS, buildLUT, applyLUT, applySpatial, applyStrokes, histogram } from './grade.js';
import { applyFx, fxById } from './effects.js';

// ── image helpers ──
export function loadImageData(src, maxSide = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, w, h);
      resolve(ctx.getImageData(0, 0, w, h));
    };
    img.onerror = () => reject(new Error('Could not open this image.'));
    img.src = src;
  });
}
export const cloneImg = (img) => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
export function imgToDataUrl(img, type = 'image/jpeg', q = 0.95) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(img, 0, 0); return c.toDataURL(type, q);
}
export function downscale(img, maxSide) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0);
  const s = Math.min(1, maxSide / Math.max(img.width, img.height)); const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const d = document.createElement('canvas'); d.width = w; d.height = h; const ctx = d.getContext('2d', { willReadFrequently: true }); ctx.drawImage(c, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// Full pipeline: global LUT → spatial → brushes
export function render(orig, params, { spatial = true, strokes = null, lutSize = 33 } = {}) {
  const out = cloneImg(orig);
  applyLUT(out, buildLUT(params, lutSize));
  if (spatial) applySpatial(out, { clarity: params.clarity, sharpen: params.sharpen, vignette: params.vignette, grain: params.grain, smooth: params.smooth, blemish: params.blemish, evenTone: params.evenTone });
  if (strokes && strokes.length) applyStrokes(out, strokes);
  // image effects (colour effects are already inside the LUT)
  const sp = spatial && Array.isArray(params.fx) ? params.fx.filter((x) => x.on !== false && fxById(x.id)?.kind === 'spatial') : [];
  if (sp.length) return applyFx(out, sp);
  return out;
}

// Debounced processing hook
export function useProcessed(orig, params, strokes, opts = {}) {
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!orig) { setOut(null); return undefined; }
    setBusy(true);
    const id = setTimeout(() => {
      try { setOut(render(orig, params, { strokes, ...opts })); } catch (e) { console.error(e); }
      setBusy(false);
    }, 70);
    return () => clearTimeout(id);
  }, [orig, params, strokes]);
  return [out, busy];
}

// ── viewer with before/after split + brush clicks ──
export function Viewer({ before, after, onPoint, brush = null, busy = false }) {
  const ref = useRef(null);
  const [split, setSplit] = useState(100);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    const c = ref.current; const src = after || before; if (!c || !src) return;
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.putImageData(after || before, 0, 0);
    if (before && after && split < 100) {
      const x = Math.round(src.width * split / 100);
      ctx.putImageData(before, 0, 0, x, 0, src.width - x, src.height);
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x - 1, 0, 2, src.height);
    }
  }, [before, after, split]);
  const pt = (e) => { const r = ref.current.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, w: r.width }; };
  const down = useRef(false);
  return (
    <div className="gv">
      <div className="gv-stage" onMouseLeave={() => { setHover(null); down.current = false; }}>
        {before ? (
          <canvas ref={ref} className={'gv-canvas' + (brush ? ' brush' : '')}
            onMouseDown={(e) => { if (!brush || !onPoint) return; down.current = true; onPoint(pt(e)); }}
            onMouseUp={() => { down.current = false; }}
            onMouseMove={(e) => { if (!brush) return; const p = pt(e); setHover(p); if (down.current && onPoint && brush.drag) onPoint(p); }} />
        ) : <div className="gv-empty">Open a photo or clip to start</div>}
        {brush && hover && <div className="gv-brush" style={{ left: hover.x * 100 + '%', top: hover.y * 100 + '%', width: brush.r * 2 * hover.w * Math.min(1, (before?.height || 1) / (before?.width || 1)) + 'px', height: brush.r * 2 * hover.w * Math.min(1, (before?.height || 1) / (before?.width || 1)) + 'px' }} />}
        {busy && <span className="gv-busy">●</span>}
      </div>
      {before && (
        <div className="gv-bar">
          <span className="sub">Before</span>
          <input type="range" min="0" max="100" value={split} onChange={(e) => setSplit(+e.target.value)} />
          <span className="sub">After</span>
          <button className="btn ghost small" onMouseDown={() => setSplit(0)} onMouseUp={() => setSplit(100)} onMouseLeave={() => split === 0 && setSplit(100)}>Hold to compare</button>
        </div>
      )}
    </div>
  );
}

export function Histogram({ img }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const ctx = c.getContext('2d'); const W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H); if (!img) return;
    const h = histogram(img); let max = 1;
    for (const k of ['r', 'g', 'b']) for (let i = 2; i < 254; i++) max = Math.max(max, h[k][i]);
    ctx.globalCompositeOperation = 'lighter';
    [['r', 'rgba(255,70,70,.65)'], ['g', 'rgba(70,255,120,.55)'], ['b', 'rgba(80,140,255,.65)']].forEach(([k, col]) => {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, H);
      for (let i = 0; i < 256; i++) ctx.lineTo(i / 255 * W, H - Math.min(1, h[k][i] / max) * H);
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }, [img]);
  return <canvas ref={ref} width={256} height={70} className="gv-hist" title="RGB histogram" />;
}

export function Slider({ label, value, onChange, min = -1, max = 1, step = 0.01, fmt }) {
  const v = value ?? 0;
  return (
    <label className="gs-row" onDoubleClick={() => onChange(0)} title="Double-click to reset">
      <span className="gs-l">{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(+e.target.value)} />
      <span className="gs-v">{fmt ? fmt(v) : (v > 0 ? '+' : '') + Math.round(v * 100)}</span>
    </label>
  );
}

export const GROUPS = {
  light: [['exposure', 'Exposure', -2, 2, 0.05, (v) => (v > 0 ? '+' : '') + v.toFixed(2) + ' EV'], ['contrast', 'Contrast'], ['highlights', 'Highlights'], ['shadows', 'Shadows'], ['whites', 'Whites'], ['blacks', 'Blacks'], ['fade', 'Fade / matte', 0, 1]],
  color: [['temp', 'Temperature'], ['tint', 'Tint'], ['vibrance', 'Vibrance'], ['saturation', 'Saturation']],
  split: [['shHue', 'Shadows hue', 0, 360, 1, (v) => Math.round(v) + '°'], ['shSat', 'Shadows tint', 0, 1], ['hiHue', 'Highlights hue', 0, 360, 1, (v) => Math.round(v) + '°'], ['hiSat', 'Highlights tint', 0, 1], ['balance', 'Balance']],
  finish: [['clarity', 'Clarity'], ['sharpen', 'Sharpen', 0, 1], ['vignette', 'Vignette', 0, 1], ['grain', 'Film grain', 0, 1]],
  retouch: [['smooth', 'Skin smoothing', 0, 1], ['blemish', 'Blemish removal', 0, 1], ['evenTone', 'Even skin tone', 0, 1]],
};

export function SliderGroup({ group, params, set }) {
  return (
    <div className="gs-group">
      {GROUPS[group].map(([k, label, min, max, step, fmt]) => (
        <Slider key={k} label={label} value={params[k] ?? DEFAULTS[k] ?? 0} min={min ?? -1} max={max ?? 1} step={step ?? 0.01} fmt={fmt} onChange={(v) => set({ [k]: v })} />
      ))}
    </div>
  );
}

// Thumbnail gallery: every choice rendered on the actual image (pick visually, like a colourist's stills)
export function ChoiceGallery({ thumb, choices, active, onPick }) {
  const items = useMemo(() => {
    if (!thumb) return [];
    return choices.map((c) => {
      try { return { ...c, url: imgToDataUrl(render(thumb, c.p, { lutSize: 17, spatial: false }), 'image/jpeg', 0.8) }; } catch { return { ...c, url: null }; }
    });
  }, [thumb, choices]);
  return (
    <div className="gc-grid">
      {items.map((c) => (
        <button key={c.id} type="button" className={'gc-item' + (active === c.id ? ' on' : '')} onClick={() => onPick(c)}>
          {c.url ? <img src={c.url} alt="" /> : <span className="gc-ph" />}
          <span>{c.name}</span>
        </button>
      ))}
    </div>
  );
}

export const lookChoices = (base, extra = []) => [...LOOKS, ...extra].map((l) => ({ id: l.id, name: l.name, p: { ...DEFAULTS, wb: base.wb, levels: base.levels, match: base.match, exposure: base.wb ? base.exposure : 0, ...l.p } }));

export function Tabs({ tabs, value, onChange }) {
  return <div className="g-tabs">{tabs.map(([id, label]) => <button key={id} type="button" className={'chip mini' + (value === id ? ' on' : '')} onClick={() => onChange(id)}>{label}</button>)}</div>;
}
