import React, { useEffect, useRef, useState } from 'react';
import { curveTable, WHEEL0 } from './grade.js';

// Resolve-style colour page tools: Lift/Gamma/Gain/Offset wheels, custom + hue curves, scopes, HSL qualifier.

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

/* ── one colour wheel: drag the puck for colour balance, the bar underneath for master level ── */
export function ColorWheel({ label, value, onChange, size = 118 }) {
  const v = value || WHEEL0;
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return; const x = c.getContext('2d'); const r = size / 2;
    const img = x.createImageData(size, size);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const dx = (i - r) / r, dy = (r - j) / r, d = Math.hypot(dx, dy); const o = (j * size + i) * 4;
      if (d > 1) { img.data[o + 3] = 0; continue; }
      const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360; const s = d * 0.75;
      const k = (n) => (n + h / 60) % 6; const f = (n) => 0.32 + s * 0.6 * (1 - Math.max(0, Math.min(k(n), 4 - k(n), 1))) - s * 0.15;
      img.data[o] = f(5) * 255; img.data[o + 1] = f(3) * 255; img.data[o + 2] = f(1) * 255; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.strokeStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.moveTo(r, 4); x.lineTo(r, size - 4); x.moveTo(4, r); x.lineTo(size - 4, r); x.stroke();
    x.beginPath(); x.arc(r, r, r - 1, 0, 7); x.stroke();
  }, [size]);
  const drag = (e) => {
    const rect = ref.current.getBoundingClientRect(); const fine = e.shiftKey ? 0.25 : 1;
    const start = { x: v.x, y: v.y, cx: e.clientX, cy: e.clientY };
    const mv = (ev) => {
      let nx = start.x + ((ev.clientX - start.cx) / (rect.width / 2)) * fine, ny = start.y - ((ev.clientY - start.cy) / (rect.height / 2)) * fine;
      const d = Math.hypot(nx, ny); if (d > 1) { nx /= d; ny /= d; }
      onChange({ ...v, x: +nx.toFixed(4), y: +ny.toFixed(4) }, false);
    };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); onChange(null, true); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const r = size / 2;
  return (
    <div className="cw">
      <div className="cw-title"><span>{label}</span><button title="Reset" onClick={() => onChange({ ...WHEEL0 }, true)}>↺</button></div>
      <div className="cw-wheel" style={{ width: size, height: size }} onMouseDown={drag} onDoubleClick={() => onChange({ ...v, x: 0, y: 0 }, true)} title="Drag to balance colour (Shift = fine). Double-click to centre.">
        <canvas ref={ref} width={size} height={size} />
        <i className="cw-puck" style={{ left: r + v.x * r * 0.98, top: r - v.y * r * 0.98 }} />
      </div>
      <input type="range" min="-1" max="1" step="0.005" value={v.m || 0} onChange={(e) => onChange({ ...v, m: +e.target.value }, false)} onMouseUp={() => onChange(null, true)} onDoubleClick={() => onChange({ ...v, m: 0 }, true)} title="Master (double-click resets)" />
      <div className="cw-val">{(v.m || 0) >= 0 ? '+' : ''}{(v.m || 0).toFixed(2)}</div>
    </div>
  );
}

export function WheelsPanel({ params, set }) {
  const w = params.wheels || {};
  const pend = useRef(null);
  const ch = (k) => (val, commit) => {
    if (val) { pend.current = { ...(params.wheels || {}), [k]: val }; set({ wheels: pend.current }); }
    else if (commit && pend.current) set({ wheels: pend.current });
  };
  return (
    <div className="cw-row">
      <ColorWheel label="Lift" value={w.lift} onChange={ch('lift')} />
      <ColorWheel label="Gamma" value={w.gamma} onChange={ch('gamma')} />
      <ColorWheel label="Gain" value={w.gain} onChange={ch('gain')} />
      <ColorWheel label="Offset" value={w.offset} onChange={ch('offset')} />
    </div>
  );
}

/* ── curve editor: click to add a point, drag to move, double-click a point to delete ── */
const CURVE_TABS = [['y', 'Luma', '#ddd'], ['r', 'Red', '#ff5a5a'], ['g', 'Green', '#4ce07a'], ['b', 'Blue', '#5a8dff'], ['hueSat', 'Hue vs Sat', '#ffb84d'], ['hueHue', 'Hue vs Hue', '#ff6bd6'], ['lumSat', 'Lum vs Sat', '#9ad']];
const isHue = (k) => k === 'hueSat' || k === 'hueHue' || k === 'lumSat';
const defPts = (k) => (isHue(k) ? [[0, 0.5], [1, 0.5]] : [[0, 0], [1, 1]]);
export function CurvesPanel({ params, set }) {
  const [tab, setTab] = useState('y');
  const ref = useRef(null);
  const S = 256;
  const get = (k) => (isHue(k) ? params[k] : params.curves?.[k]) || defPts(k);
  const put = (k, pts) => (isHue(k) ? set({ [k]: pts }) : set({ curves: { ...(params.curves || {}), [k]: pts } }));
  const pts = get(tab);
  useEffect(() => {
    const c = ref.current; if (!c) return; const x = c.getContext('2d'); x.clearRect(0, 0, S, S);
    if (tab === 'hueSat' || tab === 'hueHue') { for (let i = 0; i < S; i++) { x.fillStyle = `hsl(${(i / S) * 360},70%,35%)`; x.fillRect(i, S - 10, 1, 10); } }
    x.strokeStyle = 'rgba(255,255,255,.08)'; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo((i * S) / 4, 0); x.lineTo((i * S) / 4, S); x.moveTo(0, (i * S) / 4); x.lineTo(S, (i * S) / 4); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,.18)'; x.beginPath(); if (isHue(tab)) { x.moveTo(0, S / 2); x.lineTo(S, S / 2); } else { x.moveTo(0, S); x.lineTo(S, 0); } x.stroke();
    const tabl = curveTable(pts, tab === 'hueSat' || tab === 'hueHue');
    const col = CURVE_TABS.find((t) => t[0] === tab)[2];
    if (tabl) { x.strokeStyle = col; x.lineWidth = 2; x.beginPath(); for (let i = 0; i < S; i++) { const y = tabl[Math.round((i / (S - 1)) * 1023)]; if (i) x.lineTo(i, (1 - y) * S); else x.moveTo(i, (1 - y) * S); } x.stroke(); x.lineWidth = 1; }
    for (const [px, py] of pts) { x.fillStyle = '#fff'; x.beginPath(); x.arc(px * S, (1 - py) * S, 4, 0, 7); x.fill(); }
  });
  const toPt = (e) => { const r = ref.current.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width), clamp(1 - (e.clientY - r.top) / r.height)]; };
  const down = (e) => {
    const [mx, my] = toPt(e);
    let list = pts.map((p) => [...p]); let i = list.findIndex(([px, py]) => Math.hypot(px - mx, py - my) < 0.035);
    if (i < 0) { list.push([mx, my]); list.sort((a, b) => a[0] - b[0]); i = list.findIndex(([px, py]) => px === mx && py === my); }
    const endPoint = !isHue(tab) && (i === 0 || i === list.length - 1);
    put(tab, list);
    const mv = (ev) => { const [nx, ny] = toPt(ev); const l2 = list.map((p) => [...p]); l2[i] = [endPoint ? l2[i][0] : nx, ny]; const sorted = [...l2].sort((a, b) => a[0] - b[0]); i = sorted.indexOf(l2[i]); list = sorted; put(tab, sorted); };
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
  };
  const dbl = (e) => { const [mx, my] = toPt(e); const i = pts.findIndex(([px, py]) => Math.hypot(px - mx, py - my) < 0.04); if (i < 0) return; if (!isHue(tab) && (i === 0 || i === pts.length - 1)) return; put(tab, pts.filter((_, j) => j !== i)); };
  return (
    <div>
      <div className="row" style={{ gap: 3, marginBottom: 6 }}>{CURVE_TABS.map(([k, l, c]) => <button key={k} className={'chip mini' + (tab === k ? ' on' : '')} style={tab === k ? { borderColor: c, color: c } : null} onClick={() => setTab(k)}>{l}</button>)}</div>
      <canvas ref={ref} width={S} height={S} className="cc-canvas" onMouseDown={down} onDoubleClick={dbl} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="sub" style={{ fontSize: 10.5 }}>{isHue(tab) ? 'Click to add a point · drag up/down · double-click removes' : 'Click to add · drag · double-click removes'}</span>
        <button className="btn ghost small" onClick={() => put(tab, defPts(tab))}>Reset curve</button>
      </div>
      {!isHue(tab) && <div className="row" style={{ gap: 4 }}>{[['S-curve', [[0, 0], [0.25, 0.2], [0.75, 0.82], [1, 1]]], ['Film fade', [[0, 0.07], [0.5, 0.5], [1, 0.95]]], ['Brighten', [[0, 0], [0.5, 0.62], [1, 1]]], ['Crush', [[0, 0], [0.12, 0], [1, 1]]]].map(([n, p]) => <button key={n} className="chip mini" onClick={() => put(tab, p)}>{n}</button>)}</div>}
    </div>
  );
}

/* ── scopes: waveform, RGB parade, vectorscope, histogram ── */
export function Scopes({ img, mode, setMode }) {
  const ref = useRef(null);
  const W = 300, H = 170;
  useEffect(() => {
    const c = ref.current; if (!c) return; const x = c.getContext('2d');
    x.fillStyle = '#05090d'; x.fillRect(0, 0, W, H);
    if (!img) return;
    const { width: iw, height: ih, data } = img;
    const step = Math.max(1, Math.floor((iw * ih) / 90000));
    const acc = new Float32Array(W * H * 3);
    const plot = (px, py, r, g, b) => { if (px < 0 || py < 0 || px >= W || py >= H) return; const o = (py * W + px) * 3; acc[o] += r; acc[o + 1] += g; acc[o + 2] += b; };
    if (mode === 'vector') {
      for (let i = 0; i < iw * ih; i += step) {
        const o = i * 4, r = data[o], g = data[o + 1], b = data[o + 2];
        const cb = -0.1687 * r - 0.3313 * g + 0.5 * b, cr = 0.5 * r - 0.4187 * g - 0.0813 * b;
        plot(Math.round(W / 2 + (cb / 128) * (H / 2 - 6)), Math.round(H / 2 - (cr / 128) * (H / 2 - 6)), r, g, b);
      }
    } else if (mode === 'hist') {
      const h = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
      for (let i = 0; i < iw * ih; i += step) { const o = i * 4; h[0][data[o]]++; h[1][data[o + 1]]++; h[2][data[o + 2]]++; }
      let m = 1; for (const a of h) for (let i = 2; i < 254; i++) m = Math.max(m, a[i]);
      x.globalCompositeOperation = 'lighter';
      ['rgba(255,70,70,.6)', 'rgba(70,255,120,.5)', 'rgba(80,140,255,.6)'].forEach((col, k) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, H); for (let i = 0; i < 256; i++) x.lineTo((i / 255) * W, H - Math.min(1, h[k][i] / m) * (H - 4)); x.lineTo(W, H); x.fill(); });
      x.globalCompositeOperation = 'source-over';
      return;
    } else {
      const parade = mode === 'parade';
      for (let i = 0; i < iw * ih; i += step) {
        const o = i * 4, r = data[o], g = data[o + 1], b = data[o + 2]; const px = i % iw;
        if (parade) {
          const cw = W / 3; const bx = (px / iw) * cw;
          plot(Math.round(bx), Math.round(H - 1 - (r / 255) * (H - 2)), 255, 40, 40);
          plot(Math.round(bx + cw), Math.round(H - 1 - (g / 255) * (H - 2)), 40, 255, 60);
          plot(Math.round(bx + cw * 2), Math.round(H - 1 - (b / 255) * (H - 2)), 50, 110, 255);
        } else { const y = 0.2126 * r + 0.7152 * g + 0.0722 * b; plot(Math.round((px / iw) * (W - 1)), Math.round(H - 1 - (y / 255) * (H - 2)), 120, 255, 160); }
      }
    }
    let mx = 1; for (let i = 0; i < acc.length; i++) if (acc[i] > mx) mx = acc[i];
    const out = x.createImageData(W, H); const gain = 255 * 6 / mx;
    for (let i = 0; i < W * H; i++) for (let k = 0; k < 3; k++) out.data[i * 4 + k] = Math.min(255, Math.sqrt(acc[i * 3 + k] * gain) * 16);
    for (let i = 0; i < W * H; i++) out.data[i * 4 + 3] = 255;
    x.putImageData(out, 0, 0);
    x.strokeStyle = 'rgba(255,255,255,.12)'; x.fillStyle = 'rgba(255,255,255,.35)'; x.font = '9px sans-serif';
    if (mode === 'vector') {
      x.beginPath(); x.arc(W / 2, H / 2, H / 2 - 6, 0, 7); x.stroke(); x.beginPath(); x.moveTo(W / 2, 4); x.lineTo(W / 2, H - 4); x.moveTo(W / 2 - H / 2, H / 2); x.lineTo(W / 2 + H / 2, H / 2); x.stroke();
      // skin-tone line (I-line)
      x.strokeStyle = 'rgba(255,190,140,.4)'; x.beginPath(); x.moveTo(W / 2, H / 2); x.lineTo(W / 2 - 0.55 * (H / 2), H / 2 - 0.84 * (H / 2)); x.stroke();
      [['R', 255, 0, 0], ['G', 0, 255, 0], ['B', 0, 0, 255], ['Y', 255, 255, 0], ['C', 0, 255, 255], ['M', 255, 0, 255]].forEach(([n, r, g, b]) => {
        const cb = -0.1687 * r - 0.3313 * g + 0.5 * b, cr = 0.5 * r - 0.4187 * g - 0.0813 * b;
        const px = W / 2 + (cb / 128) * (H / 2 - 6), py = H / 2 - (cr / 128) * (H / 2 - 6);
        x.strokeRect(px - 4, py - 4, 8, 8); x.fillText(n, px + 6, py + 3);
      });
    } else { for (const v of [0, 0.25, 0.5, 0.75, 1]) { const y = H - 1 - v * (H - 2); x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); x.fillText(String(Math.round(v * 1023)), 2, y - 2); } }
  }, [img, mode]);
  return (
    <div className="sc">
      <div className="row" style={{ gap: 3, marginBottom: 4 }}>{[['wave', 'Waveform'], ['parade', 'Parade'], ['vector', 'Vectorscope'], ['hist', 'Histogram']].map(([k, l]) => <button key={k} className={'chip mini' + (mode === k ? ' on' : '')} onClick={() => setMode(k)}>{l}</button>)}</div>
      <canvas ref={ref} width={W} height={H} className="sc-canvas" />
    </div>
  );
}

/* ── HSL qualifier (secondary correction): pick a colour on the viewer, refine the range ── */
export function QualifierPanel({ params, set, picking, setPicking }) {
  const q = params.qual;
  const upd = (patch) => set({ qual: { h: 0.05, hw: 0.06, s0: 0.15, s1: 1, l0: 0.05, l1: 0.95, soft: 0.05, invert: false, ...(q || {}), ...patch } });
  const R = ({ label, k, min = 0, max = 1, fmt }) => (
    <label className="gs-row"><span className="gs-l">{label}</span><input type="range" min={min} max={max} step="0.005" value={q?.[k] ?? 0} onChange={(e) => upd({ [k]: +e.target.value })} /><span className="gs-v">{fmt ? fmt(q?.[k] ?? 0) : Math.round((q?.[k] ?? 0) * 100)}</span></label>
  );
  return (
    <div>
      <p className="sub" style={{ fontSize: 11.5 }}>Limit this node to one colour range — e.g. warm up only skin, make only the sky bluer, or keep one colour while desaturating the rest (Invert).</p>
      <div className="row" style={{ gap: 6 }}>
        <button className={'btn small' + (picking ? '' : ' ghost')} onClick={() => setPicking(!picking)}>{picking ? '🎯 Click the viewer…' : '🎯 Pick colour'}</button>
        {q && <button className="btn ghost small" onClick={() => set({ qual: null })}>Remove qualifier</button>}
      </div>
      {q && (<>
        <div className="q-hue" style={{ background: `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => `hsl(${i * 30},80%,50%)`).join(',')})` }}><i style={{ left: `${q.h * 100}%`, width: `${Math.min(100, q.hw * 200)}%` }} /></div>
        <R label="Hue centre" k="h" fmt={(v) => Math.round(v * 360) + '°'} />
        <R label="Hue width" k="hw" max={0.5} fmt={(v) => '±' + Math.round(v * 360) + '°'} />
        <R label="Sat low" k="s0" /><R label="Sat high" k="s1" />
        <R label="Lum low" k="l0" /><R label="Lum high" k="l1" />
        <R label="Softness" k="soft" max={0.3} />
        <label className="row" style={{ gap: 6, cursor: 'pointer', fontSize: 12 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!q.invert} onChange={(e) => upd({ invert: e.target.checked })} /> Invert (correct everything except this colour)</label>
        <p className="sub" style={{ fontSize: 11 }}>Now adjust Primaries, Wheels or Curves — the change only lands inside the selection.</p>
      </>)}
    </div>
  );
}

// a pixel picked on the viewer → qualifier centred on its hue / sat / lum
export function qualFromPixel(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return { h, hw: 0.05, s0: Math.max(0, s - 0.3), s1: Math.min(1, s + 0.35), l0: Math.max(0, l - 0.35), l1: Math.min(1, l + 0.35), soft: 0.06, invert: false };
}
