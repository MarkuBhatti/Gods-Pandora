import { fxColorFn, fxFilters } from './effects.js';
// Pandora grade engine — one source of truth for colour.
// Every global adjustment (balance, colour match, primaries, tone, split-tone, looks) is baked into a 3D LUT,
// so the live preview in the app and the final ffmpeg render (lut3d) are pixel-identical.
// Spatial effects (clarity, sharpen, skin retouch, brushes, vignette, grain) run separately on pixels.
//
// Ideas borrowed (and re-implemented from scratch): DaVinci Resolve primaries + Auto Balance + Shot Match,
// Lift/Gamma/Gain/Offset colour wheels, custom + hue curves, HSL qualifier, LUT nodes and a serial node tree,
// Colourlab AI reference matching + film-look library, Retouch4Me Color Match (reference transfer + LUT export),
// Imagen personal profiles ("My Looks"), Evoto skin retouch, Lightroom-style tone sliders.

export const DEFAULTS = {
  exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0,
  temp: 0, tint: 0, vibrance: 0, saturation: 0, fade: 0,
  shHue: 200, shSat: 0, hiHue: 35, hiSat: 0, balance: 0,
  clarity: 0, sharpen: 0, vignette: 0, grain: 0,
  mix: 100,
  wb: null,     // { r, g, b } gains from Auto Balance
  levels: null, // { lo, hi } from Auto Balance
  match: null,  // { src: labStats, ref: labStats, amount: 0..100 }
  wheels: null, // { lift:{x,y,m}, gamma:{x,y,m}, gain:{x,y,m}, offset:{x,y,m} }  (Resolve primaries wheels)
  curves: null, // { y:[[x,y]…], r:[…], g:[…], b:[…] }  custom curves, 0..1
  hueSat: null, hueHue: null, lumSat: null, // [[x,y]…] hue/lum curves, y 0.5 = neutral
  qual: null,   // { h, hw, s0, s1, l0, l1, soft, invert } HSL qualifier — limits this node to a colour range
  lut: null,    // { size, data, name } an imported .cube applied in this node
};
export const WHEEL0 = { x: 0, y: 0, m: 0 };

// Looks = parameter presets (so every look is fully editable afterwards)
export const LOOKS = [
  { id: 'none', name: 'Original', p: {} },
  { id: 'natural', name: 'Natural Pop', p: { contrast: 0.12, vibrance: 0.22, clarity: 0.15 } },
  { id: 'teal-orange', name: 'Teal & Orange', p: { contrast: 0.18, shHue: 190, shSat: 0.32, hiHue: 30, hiSat: 0.28, vibrance: 0.1, saturation: 0.05 } },
  { id: 'warm-film', name: 'Warm Film', p: { temp: 0.22, contrast: 0.1, fade: 0.25, hiHue: 40, hiSat: 0.18, saturation: -0.08, grain: 0.18 } },
  { id: 'golden', name: 'Golden Hour', p: { temp: 0.35, tint: 0.05, highlights: -0.15, vibrance: 0.2, hiHue: 38, hiSat: 0.25 } },
  { id: 'cool-night', name: 'Cool Night', p: { temp: -0.3, exposure: -0.15, contrast: 0.15, shHue: 220, shSat: 0.25, saturation: -0.15 } },
  { id: 'moody', name: 'Moody Matte', p: { contrast: 0.08, fade: 0.45, saturation: -0.25, shHue: 210, shSat: 0.15, highlights: -0.2, vignette: 0.3 } },
  { id: 'bleach', name: 'Bleach Bypass', p: { contrast: 0.4, saturation: -0.5, clarity: 0.3 } },
  { id: 'kodak', name: 'Kodak-ish 2383', p: { contrast: 0.22, temp: 0.08, shHue: 185, shSat: 0.18, hiHue: 45, hiSat: 0.2, blacks: -0.15, fade: 0.08 } },
  { id: 'fuji', name: 'Fuji-ish Eterna', p: { contrast: -0.1, saturation: -0.2, shHue: 160, shSat: 0.15, fade: 0.15, highlights: -0.2 } },
  { id: 'vintage', name: 'Vintage 70s', p: { temp: 0.25, fade: 0.4, saturation: -0.15, shHue: 260, shSat: 0.12, hiHue: 50, hiSat: 0.3, grain: 0.3, vignette: 0.25 } },
  { id: 'cyber', name: 'Neon Cyber', p: { contrast: 0.25, tint: 0.15, shHue: 250, shSat: 0.4, hiHue: 320, hiSat: 0.25, vibrance: 0.3 } },
  { id: 'clean', name: 'Clean Commercial', p: { exposure: 0.1, contrast: 0.08, highlights: -0.1, shadows: 0.15, vibrance: 0.15, clarity: 0.1 } },
  { id: 'portrait', name: 'Soft Portrait', p: { contrast: -0.05, highlights: -0.15, shadows: 0.1, temp: 0.08, vibrance: -0.05, fade: 0.1, clarity: -0.15 } },
  { id: 'bw', name: 'Black & White', p: { saturation: -1, contrast: 0.25, clarity: 0.2 } },
  { id: 'bw-soft', name: 'Silver Soft B&W', p: { saturation: -1, contrast: -0.05, fade: 0.25, grain: 0.25 } },
];

export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];
export const withLook = (base, look) => ({ ...DEFAULTS, wb: base.wb, levels: base.levels, match: base.match, ...look.p });

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);

// ── Lab (D65) for colour matching ──
function rgb2lab(r, g, b) {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function lab2rgb(L, a, bb) {
  let y = (L + 16) / 116, x = a / 500 + y, z = y - bb / 200;
  const fi = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
  x = fi(x) * 0.95047; y = fi(y); z = fi(z) * 1.08883;
  const R = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const G = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const B = x * 0.0557 + y * -0.204 + z * 1.057;
  return [clamp(toSrgb(R)), clamp(toSrgb(G)), clamp(toSrgb(B))];
}
function hue2rgb(h) { // hue 0..360 → unit RGB direction (zero-mean) for tinting
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
  const r = f(5), g = f(3), b = f(1); const m = (r + g + b) / 3;
  return [r - m, g - m, b - m];
}

// Tone curve for one channel value
function tone(x, p) {
  if (p.shadows) x += p.shadows * 0.45 * x * (1 - x) * (1 - x) * 1.6;
  if (p.highlights) x += p.highlights * 0.45 * x * x * (1 - x) * 1.6;
  if (p.whites) x += p.whites * 0.18 * x * x * x;
  if (p.blacks) x += p.blacks * 0.18 * (1 - x) * (1 - x) * (1 - x);
  x = clamp(x);
  if (p.contrast) { const s = x * x * (3 - 2 * x); x = clamp(x + p.contrast * (s - x) * 1.6); }
  if (p.fade) x = p.fade * 0.14 + x * (1 - p.fade * 0.2);
  return x;
}

// ── curves: monotone cubic (Fritsch–Carlson) through the control points → 1024-entry table ──
export function curveTable(pts, periodic = false, N = 1024) {
  let P = (pts || []).map(([x, y]) => [clamp(x), clamp(y)]).sort((a, b) => a[0] - b[0]);
  if (periodic) { if (!P.length) return null; P = [...P.map(([x, y]) => [x - 1, y]), ...P, ...P.map(([x, y]) => [x + 1, y])]; }
  if (P.length < 2) return null;
  const n = P.length, dx = [], m = [], t = new Float32Array(n);
  for (let i = 0; i < n - 1; i++) { dx[i] = Math.max(1e-6, P[i + 1][0] - P[i][0]); m[i] = (P[i + 1][1] - P[i][1]) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; } const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b; if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
  const out = new Float32Array(N); let k = 0;
  for (let j = 0; j < N; j++) {
    const x = j / (N - 1);
    if (x <= P[0][0]) { out[j] = P[0][1]; continue; } if (x >= P[n - 1][0]) { out[j] = P[n - 1][1]; continue; }
    while (k < n - 2 && x > P[k + 1][0]) k++;
    const h = dx[k], u = (x - P[k][0]) / h, u2 = u * u, u3 = u2 * u;
    out[j] = (2 * u3 - 3 * u2 + 1) * P[k][1] + (u3 - 2 * u2 + u) * h * t[k] + (-2 * u3 + 3 * u2) * P[k + 1][1] + (u3 - u2) * h * t[k + 1];
  }
  return out;
}
const isIdentity = (pts) => !pts || (pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 1 && pts[1][1] === 1);
const isFlat = (pts) => !pts || !pts.length || pts.every(([, y]) => Math.abs(y - 0.5) < 1e-3);
const look1 = (tab, x) => tab[Math.max(0, Math.min(1023, Math.round(x * 1023)))];
function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  if (!s) return [l, l, l];
  const f = (p, q, t) => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
}
const wheelVec = (w) => { if (!w || (!w.x && !w.y)) return [0, 0, 0]; const ang = (Math.atan2(w.y, w.x) * 180) / Math.PI; const rad = Math.min(1, Math.hypot(w.x, w.y)); const v = hue2rgb((ang + 360) % 360); return [v[0] * rad, v[1] * rad, v[2] * rad]; };
function lutSample({ size, data }, r, g, b) {
  const n = size - 1, s2 = size * size; const R = clamp(r) * n, G = clamp(g) * n, B = clamp(b) * n;
  const r0 = R | 0, g0 = G | 0, b0 = B | 0, r1 = Math.min(n, r0 + 1), g1 = Math.min(n, g0 + 1), b1 = Math.min(n, b0 + 1); const fr = R - r0, fg = G - g0, fb = B - b0;
  const o = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const v = (x, y, z) => data[(z * s2 + y * size + x) * 3 + c];
    const c0 = (v(r0, g0, b0) * (1 - fr) + v(r1, g0, b0) * fr) * (1 - fg) + (v(r0, g1, b0) * (1 - fr) + v(r1, g1, b0) * fr) * fg;
    const c1 = (v(r0, g0, b1) * (1 - fr) + v(r1, g0, b1) * fr) * (1 - fg) + (v(r0, g1, b1) * (1 - fr) + v(r1, g1, b1) * fr) * fg;
    o[c] = c0 * (1 - fb) + c1 * fb;
  }
  return o;
}
// Parse a .cube file (Resolve / Premiere / any 3D LUT) → { size, data } in .cube order (red fastest)
export function parseCube(text, name = 'LUT') {
  let size = 0; const vals = []; let dmin = [0, 0, 0], dmax = [1, 1, 1];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l[0] === '#') continue;
    const m = l.match(/^LUT_3D_SIZE\s+(\d+)/i); if (m) { size = +m[1]; continue; }
    if (/^DOMAIN_MIN/i.test(l)) { dmin = l.split(/\s+/).slice(1).map(Number); continue; }
    if (/^DOMAIN_MAX/i.test(l)) { dmax = l.split(/\s+/).slice(1).map(Number); continue; }
    if (/^[A-Z_]/i.test(l)) continue;
    const p = l.split(/\s+/).map(Number); if (p.length >= 3 && p.every((x) => !Number.isNaN(x))) vals.push((p[0] - dmin[0]) / (dmax[0] - dmin[0]), (p[1] - dmin[1]) / (dmax[1] - dmin[1]), (p[2] - dmin[2]) / (dmax[2] - dmin[2]));
  }
  if (!size || vals.length < size * size * size * 3) throw new Error('That file is not a 3D .cube LUT (1D LUTs are not supported).');
  return { size, data: Float32Array.from(vals.slice(0, size * size * size * 3)), name };
}

// The pixel transform of ONE node (0..1 RGB in → out)
function makeSingle(p0) {
  const p = { ...DEFAULTS, ...p0 };
  const expM = Math.pow(2, p.exposure || 0);
  const tR = 1 + p.temp * 0.18 - p.tint * 0.03, tG = 1 - p.tint * 0.12, tB = 1 - p.temp * 0.18 - p.tint * 0.03;
  const sh = hue2rgb(p.shHue), hi = hue2rgb(p.hiHue);
  const m = p.match && p.match.src && p.match.ref ? p.match : null;
  const mAmt = m ? (m.amount ?? 100) / 100 : 0;
  const mix = (p.mix ?? 100) / 100;
  const lut = p.lut && p.lut.data ? p.lut : null;
  let wh = null;
  if (p.wheels) {
    const W = p.wheels, v = (k) => wheelVec(W[k]), m = (k) => (W[k] && W[k].m) || 0;
    const L = v('lift'), G = v('gamma'), N = v('gain'), O = v('offset');
    wh = { lift: L.map((x) => m('lift') * 0.3 + x * 0.3), gamma: G.map((x) => m('gamma') * 0.6 + x * 0.6), gain: N.map((x) => 1 + m('gain') * 0.6 + x * 0.6), off: O.map((x) => m('offset') * 0.25 + x * 0.25) };
    if (wh.lift.every((x) => !x) && wh.gamma.every((x) => !x) && wh.gain.every((x) => x === 1) && wh.off.every((x) => !x)) wh = null;
  }
  const cv = p.curves || {};
  const cY = isIdentity(cv.y) ? null : curveTable(cv.y), cR = isIdentity(cv.r) ? null : curveTable(cv.r), cG = isIdentity(cv.g) ? null : curveTable(cv.g), cB = isIdentity(cv.b) ? null : curveTable(cv.b);
  const hS = isFlat(p.hueSat) ? null : curveTable(p.hueSat, true), hH = isFlat(p.hueHue) ? null : curveTable(p.hueHue, true), lS = isFlat(p.lumSat) ? null : curveTable(p.lumSat);
  const q = p.qual && p.qual.on !== false ? p.qual : null;
  return (r0, g0, b0) => {
    let r = r0, g = g0, b = b0;
    if (p.wb) { r *= p.wb.r; g *= p.wb.g; b *= p.wb.b; }
    if (p.levels) { const d = Math.max(0.05, p.levels.hi - p.levels.lo); r = (r - p.levels.lo) / d; g = (g - p.levels.lo) / d; b = (b - p.levels.lo) / d; }
    r = clamp(r); g = clamp(g); b = clamp(b);
    if (m && mAmt > 0) { // Reinhard colour transfer in Lab (reference-based colour match)
      const [L, A, B] = rgb2lab(r, g, b); const s = m.src, t = m.ref;
      const L2 = (L - s.mL) * (t.sL / Math.max(s.sL, 1e-3)) + t.mL;
      const A2 = (A - s.mA) * (t.sA / Math.max(s.sA, 1e-3)) + t.mA;
      const B2 = (B - s.mB) * (t.sB / Math.max(s.sB, 1e-3)) + t.mB;
      const [rr, gg, bb2] = lab2rgb(L + (L2 - L) * mAmt, A + (A2 - A) * mAmt, B + (B2 - B) * mAmt);
      r = rr; g = gg; b = bb2;
    }
    // exposure + white balance in linear light
    let R = toLin(r) * expM * tR, G = toLin(g) * expM * tG, B = toLin(b) * expM * tB;
    r = clamp(toSrgb(R)); g = clamp(toSrgb(G)); b = clamp(toSrgb(B));
    r = tone(r, p); g = tone(g, p); b = tone(b, p);
    // saturation / vibrance around luma
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const cur = Math.max(r, g, b) - Math.min(r, g, b);
    const k = (1 + p.saturation) * (1 + p.vibrance * (1 - cur) * 1.2);
    r = Y + (r - Y) * k; g = Y + (g - Y) * k; b = Y + (b - Y) * k;
    // split toning (shadows / highlights tint)
    if (p.shSat || p.hiSat) {
      const bal = p.balance * 0.5;
      const ws = clamp(1 - Y + bal) ** 2 * p.shSat * 0.35, wh = clamp(Y + bal) ** 2 * p.hiSat * 0.35;
      r += sh[0] * ws + hi[0] * wh; g += sh[1] * ws + hi[1] * wh; b += sh[2] * ws + hi[2] * wh;
    }
    r = clamp(r); g = clamp(g); b = clamp(b);
    if (lut) { const o = lutSample(lut, r, g, b); r = o[0]; g = o[1]; b = o[2]; }
    if (wh) { // Lift / Gamma / Gain / Offset (Resolve primaries wheels)
      const c = [r, g, b];
      for (let i = 0; i < 3; i++) {
        let v = c[i] * wh.gain[i];
        v = v + wh.lift[i] * (1 - v);
        v = Math.pow(clamp(v), 1 / Math.max(0.2, 1 + wh.gamma[i]));
        c[i] = clamp(v + wh.off[i]);
      }
      r = c[0]; g = c[1]; b = c[2];
    }
    if (cY) { r = look1(cY, r); g = look1(cY, g); b = look1(cY, b); }
    if (cR) r = look1(cR, r); if (cG) g = look1(cG, g); if (cB) b = look1(cB, b);
    if (hS || hH || lS) {
      let [h, s2, l] = rgb2hsl(clamp(r), clamp(g), clamp(b));
      const h0 = h;
      if (hH) h = h + (look1(hH, h0) - 0.5) * 0.5;
      if (hS) s2 = s2 * look1(hS, h0) * 2;
      if (lS) s2 = s2 * look1(lS, l) * 2;
      [r, g, b] = hsl2rgb(h, clamp(s2), l);
    }
    r = clamp(r); g = clamp(g); b = clamp(b);
    let kk = mix;
    if (q) { // HSL qualifier: only colours inside the picked range get this node's correction
      const [h, s2, l] = rgb2hsl(r0, g0, b0); const soft = Math.max(0.005, q.soft ?? 0.05);
      const dh = Math.min(Math.abs(h - q.h), 1 - Math.abs(h - q.h));
      const mh = q.hw >= 0.5 ? 1 : clamp(1 - (dh - q.hw) / soft);
      const ms = clamp((s2 - (q.s0 ?? 0)) / soft + 1) * clamp(((q.s1 ?? 1) - s2) / soft + 1);
      const ml = clamp((l - (q.l0 ?? 0)) / soft + 1) * clamp(((q.l1 ?? 1) - l) / soft + 1);
      let m = clamp(mh * ms * ml); if (q.invert) m = 1 - m; kk *= m;
    }
    if (kk < 1) { r = r0 + (r - r0) * kk; g = g0 + (g - g0) * kk; b = b0 + (b - b0) * kk; }
    return [r, g, b];
  };
}

// Whole grade: a single node, or a serial node tree { chain:[node params…], fx:[…] } + colour effects
export function makeTransform(p) {
  const nodes = p && Array.isArray(p.chain) ? p.chain : [p || {}];
  const fs = nodes.map(makeSingle);
  const fx = fxColorFn(p && p.fx);
  if (fs.length === 1 && !fx) return fs[0];
  return (r, g, b) => { let c = [r, g, b]; for (const f of fs) c = f(c[0], c[1], c[2]); return fx ? fx(c[0], c[1], c[2]) : c; };
}

// Combine a node list (+ effects) into one params object the preview, the LUT and the render all understand
export function composite(nodes, fx = []) {
  const on = (nodes || []).filter((n) => n && n.on !== false).map((n) => n.p || n);
  const pick = (k, f = Math.max) => on.reduce((a, p) => f(a, p[k] || 0), 0);
  const sum = (k) => on.reduce((a, p) => a + (p[k] || 0), 0);
  return {
    chain: on.length ? on : [{ ...DEFAULTS }], fx,
    clarity: Math.max(-1, Math.min(1, sum('clarity'))), sharpen: pick('sharpen'), vignette: pick('vignette'), grain: pick('grain'),
    smooth: pick('smooth'), blemish: pick('blemish'), evenTone: pick('evenTone'),
  };
}

// 3D LUT (Float32Array size³×3, red fastest — .cube order)
export function buildLUT(p, size = 33) {
  const f = makeTransform(p);
  const lut = new Float32Array(size * size * size * 3);
  let i = 0; const n = size - 1;
  for (let bz = 0; bz < size; bz++) for (let gy = 0; gy < size; gy++) for (let rx = 0; rx < size; rx++) {
    const o = f(rx / n, gy / n, bz / n); lut[i++] = o[0]; lut[i++] = o[1]; lut[i++] = o[2];
  }
  return { size, data: lut };
}

export function lutToCube({ size, data }, title = "God's Pandora look") {
  const lines = [`TITLE "${title.replace(/"/g, '')}"`, `LUT_3D_SIZE ${size}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  for (let i = 0; i < data.length; i += 3) lines.push(`${data[i].toFixed(6)} ${data[i + 1].toFixed(6)} ${data[i + 2].toFixed(6)}`);
  return lines.join('\n') + '\n';
}

// Apply a LUT to ImageData (trilinear) — in place
export function applyLUT(img, { size, data }) {
  const px = img.data, n = size - 1, s2 = size * size;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255 * n, g = px[i + 1] / 255 * n, b = px[i + 2] / 255 * n;
    const r0 = r | 0, g0 = g | 0, b0 = b | 0;
    const r1 = r0 < n ? r0 + 1 : n, g1 = g0 < n ? g0 + 1 : n, b1 = b0 < n ? b0 + 1 : n;
    const fr = r - r0, fg = g - g0, fb = b - b0;
    for (let c = 0; c < 3; c++) {
      const v = (x, y, z) => data[(z * s2 + y * size + x) * 3 + c];
      const c00 = v(r0, g0, b0) * (1 - fr) + v(r1, g0, b0) * fr;
      const c10 = v(r0, g1, b0) * (1 - fr) + v(r1, g1, b0) * fr;
      const c01 = v(r0, g0, b1) * (1 - fr) + v(r1, g0, b1) * fr;
      const c11 = v(r0, g1, b1) * (1 - fr) + v(r1, g1, b1) * fr;
      const c0 = c00 * (1 - fg) + c10 * fg, c1 = c01 * (1 - fg) + c11 * fg;
      px[i + c] = (c0 * (1 - fb) + c1 * fb) * 255 + 0.5;
    }
  }
  return img;
}

// ── analysis ──
export function sampleStats(img, step = 0) {
  const px = img.data; const total = px.length / 4;
  const st = step || Math.max(1, Math.floor(total / 60000));
  let R = 0, G = 0, B = 0, n = 0; const lum = [];
  let mL = 0, mA = 0, mB = 0, qL = 0, qA = 0, qB = 0;
  for (let i = 0; i < total; i += st) {
    const o = i * 4, r = px[o] / 255, g = px[o + 1] / 255, b = px[o + 2] / 255;
    R += r; G += g; B += b; n++; lum.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const [L, A, BB] = rgb2lab(r, g, b); mL += L; mA += A; mB += BB; qL += L * L; qA += A * A; qB += BB * BB;
  }
  lum.sort((a, b) => a - b);
  const q = (f) => lum[Math.min(lum.length - 1, Math.floor(lum.length * f))];
  mL /= n; mA /= n; mB /= n;
  return {
    r: R / n, g: G / n, b: B / n, lo: q(0.005), hi: q(0.995), median: q(0.5),
    lab: { mL, mA, mB, sL: Math.sqrt(Math.max(qL / n - mL * mL, 1e-6)), sA: Math.sqrt(Math.max(qA / n - mA * mA, 1e-6)), sB: Math.sqrt(Math.max(qB / n - mB * mB, 1e-6)) },
  };
}

// Auto Balance (Resolve-style): neutral white balance, black/white points, gentle exposure fix
export function autoParams(stats) {
  const avg = (stats.r + stats.g + stats.b) / 3;
  const damp = (g) => clamp(1 + (g - 1) * 0.8, 0.75, 1.35);
  const wb = { r: damp(avg / Math.max(stats.r, 0.02)), g: damp(avg / Math.max(stats.g, 0.02)), b: damp(avg / Math.max(stats.b, 0.02)) };
  const levels = { lo: clamp(stats.lo, 0, 0.12), hi: clamp(stats.hi, 0.7, 1) };
  const mid = (stats.median - levels.lo) / Math.max(0.05, levels.hi - levels.lo);
  const exposure = clamp(Math.log2(0.45 / Math.max(mid, 0.05)) * 0.5, -0.8, 0.8);
  return { wb, levels, exposure: +exposure.toFixed(2), vibrance: 0.08 };
}

// "Auto grade" choices: a balanced base + a few tasteful directions to pick from
export function autoChoices(stats) {
  const a = autoParams(stats);
  const base = { ...DEFAULTS, ...a };
  return [
    { id: 'auto', name: 'Auto Balance', p: base },
    { id: 'auto-pop', name: 'Bright & Punchy', p: { ...base, contrast: 0.2, vibrance: 0.3, clarity: 0.2 } },
    { id: 'auto-warm', name: 'Warm Film', p: { ...base, ...lookById('warm-film').p, wb: a.wb, levels: a.levels, exposure: a.exposure } },
    { id: 'auto-cine', name: 'Cinematic', p: { ...base, ...lookById('teal-orange').p, wb: a.wb, levels: a.levels, exposure: a.exposure } },
    { id: 'auto-moody', name: 'Moody', p: { ...base, ...lookById('moody').p, wb: a.wb, levels: a.levels, exposure: a.exposure - 0.1 } },
    { id: 'auto-clean', name: 'Clean Commercial', p: { ...base, ...lookById('clean').p, wb: a.wb, levels: a.levels, exposure: a.exposure + 0.05 } },
  ];
}

export function histogram(img) {
  const h = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256) };
  const px = img.data; const st = Math.max(1, Math.floor(px.length / 4 / 200000)) * 4;
  for (let i = 0; i < px.length; i += st) {
    h.r[px[i]]++; h.g[px[i + 1]]++; h.b[px[i + 2]]++;
    h.l[(px[i] * 54 + px[i + 1] * 183 + px[i + 2] * 19) >> 8]++;
  }
  return h;
}

// ── spatial effects ──
function boxBlur(src, w, h, r) { // separable box blur ×3 ≈ gaussian, on Float32 single channel (fast, no closures)
  if (r < 1) return src.slice();
  const a = Float32Array.from(src), b = new Float32Array(src.length); const d = 1 / (r * 2 + 1);
  const hor = (inp, out) => {
    for (let y = 0; y < h; y++) {
      const row = y * w; let acc = 0;
      for (let k = -r; k <= r; k++) acc += inp[row + (k < 0 ? 0 : k >= w ? w - 1 : k)];
      for (let x = 0; x < w; x++) {
        out[row + x] = acc * d;
        const add = x + r + 1, sub = x - r;
        acc += inp[row + (add >= w ? w - 1 : add)] - inp[row + (sub < 0 ? 0 : sub)];
      }
    }
  };
  const ver = (inp, out) => {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += inp[(k < 0 ? 0 : k >= h ? h - 1 : k) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = acc * d;
        const add = y + r + 1, sub = y - r;
        acc += inp[(add >= h ? h - 1 : add) * w + x] - inp[(sub < 0 ? 0 : sub) * w + x];
      }
    }
  };
  for (let i = 0; i < 3; i++) { hor(a, b); ver(b, a); }
  return a;
}
const lumaOf = (px, n) => { const y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = (px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722) / 255; return y; };
const add = (px, i, d) => { px[i] = clamp(px[i] + d, 0, 255); px[i + 1] = clamp(px[i + 1] + d, 0, 255); px[i + 2] = clamp(px[i + 2] + d, 0, 255); };

export function skinMask(img) {
  const { width: w, height: h, data: px } = img; const n = w * h; const m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const inCb = 1 - clamp(Math.abs(cb - 105) / 26 - 0.6, 0, 1), inCr = 1 - clamp(Math.abs(cr - 152) / 22 - 0.6, 0, 1);
    m[i] = y > 40 && y < 250 ? inCb * inCr : 0;
  }
  return boxBlur(m, w, h, Math.max(2, Math.round(Math.min(w, h) / 250)));
}

// p: { clarity, sharpen, vignette, grain, smooth, blemish, evenTone } — all 0..1 (clarity −1..1)
export function applySpatial(img, p, seed = 7) {
  const { width: w, height: h, data: px } = img; const n = w * h; const scale = Math.min(w, h);
  if (p.clarity) {
    const y = lumaOf(px, n), by = boxBlur(y, w, h, Math.max(2, Math.round(scale / 60)));
    for (let i = 0; i < n; i++) { const d = (y[i] - by[i]) * p.clarity * 255 * 0.9; const mid = 1 - Math.abs(y[i] - 0.5) * 1.6; add(px, i * 4, d * clamp(mid, 0.15, 1)); }
  }
  if (p.smooth || p.blemish || p.evenTone) {
    const mask = skinMask(img), y = lumaOf(px, n);
    const rS = Math.max(2, Math.round(scale / 170));
    const ch = [0, 1, 2].map((c) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = px[i * 4 + c]; return a; });
    const bl = ch.map((a) => boxBlur(a, w, h, rS));
    const yb = boxBlur(y, w, h, rS), ybFine = boxBlur(y, w, h, 1);
    let cbAvg = 0, crAvg = 0, wsum = 0;
    if (p.evenTone) for (let i = 0; i < n; i += 7) { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; cbAvg += mask[i] * (-0.1687 * r - 0.3313 * g + 0.5 * b); crAvg += mask[i] * (0.5 * r - 0.4187 * g - 0.0813 * b); wsum += mask[i]; }
    if (wsum) { cbAvg /= wsum; crAvg /= wsum; }
    for (let i = 0; i < n; i++) {
      const mk = mask[i]; if (mk < 0.02) continue;
      const o = i * 4; const edge = clamp(Math.abs(y[i] - yb[i]) * 9, 0, 1);
      // edge-preserving smoothing that keeps fine pore texture (frequency-separation idea)
      let a = (p.smooth || 0) * mk * (1 - edge * 0.85);
      // blemishes: small dark/red spots that stand out from their surroundings → pulled to the local average
      if (p.blemish) { const spot = clamp((yb[i] - y[i]) * 14 - 0.25, 0, 1); a = Math.max(a, spot * p.blemish * mk); }
      if (a > 0) {
        const tex = (y[i] - ybFine[i]) * 255 * 0.5;
        for (let c = 0; c < 3; c++) px[o + c] = clamp(px[o + c] + (bl[c][i] - px[o + c]) * a + tex * a * 0.6, 0, 255);
      }
      if (p.evenTone && wsum) {
        const r = px[o], g = px[o + 1], b = px[o + 2]; const Y = 0.299 * r + 0.587 * g + 0.114 * b;
        let cb = -0.1687 * r - 0.3313 * g + 0.5 * b, cr = 0.5 * r - 0.4187 * g - 0.0813 * b;
        const k = p.evenTone * mk * 0.6; cb += (cbAvg - cb) * k; cr += (crAvg - cr) * k;
        px[o] = clamp(Y + 1.402 * cr, 0, 255); px[o + 1] = clamp(Y - 0.344 * cb - 0.714 * cr, 0, 255); px[o + 2] = clamp(Y + 1.772 * cb, 0, 255);
      }
    }
  }
  if (p.sharpen) {
    const y = lumaOf(px, n), by = boxBlur(y, w, h, 1);
    for (let i = 0; i < n; i++) add(px, i * 4, (y[i] - by[i]) * p.sharpen * 255 * 1.6);
  }
  if (p.vignette) {
    const cx = w / 2, cy = h / 2, md2 = cx * cx + cy * cy; const LUTN = 512; const kt = new Float32Array(LUTN + 1);
    for (let i = 0; i <= LUTN; i++) { const d = Math.sqrt(i / LUTN); kt[i] = 1 - p.vignette * 0.75 * clamp((d - 0.35) / 0.65) ** 1.6; }
    for (let yy = 0; yy < h; yy++) { const dy = (yy - cy) * (yy - cy); for (let xx = 0; xx < w; xx++) {
      const k = kt[Math.min(LUTN, ((((xx - cx) * (xx - cx) + dy) / md2) * LUTN) | 0)];
      const o = (yy * w + xx) * 4; px[o] *= k; px[o + 1] *= k; px[o + 2] *= k;
    } }
  }
  if (p.grain) {
    let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
    const a = p.grain * 28;
    for (let i = 0; i < n; i++) add(px, i * 4, rnd() * a);
  }
  return img;
}

// Brushes (spot heal, whiten teeth/eyes, smooth, brighten eyes) — strokes use 0..1 coordinates so they
// replay identically on the preview and on the full-resolution export.
export function applyStrokes(img, strokes) {
  if (!strokes || !strokes.length) return img;
  const { width: w, height: h, data: px } = img; const scale = Math.min(w, h);
  for (const s of strokes) {
    const R = Math.max(2, s.r * scale), x0 = s.x * w, y0 = s.y * h;
    const xa = Math.max(0, Math.floor(x0 - R * 2)), xb = Math.min(w - 1, Math.ceil(x0 + R * 2));
    const ya = Math.max(0, Math.floor(y0 - R * 2)), yb = Math.min(h - 1, Math.ceil(y0 + R * 2));
    // ring average around the spot (for healing)
    let ar = 0, ag = 0, ab = 0, an = 0;
    if (s.tool === 'heal') {
      for (let k = 0; k < 48; k++) { const t = (k / 48) * Math.PI * 2; const xx = Math.round(x0 + Math.cos(t) * R * 1.5), yy = Math.round(y0 + Math.sin(t) * R * 1.5); if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const o = (yy * w + xx) * 4; ar += px[o]; ag += px[o + 1]; ab += px[o + 2]; an++; }
      if (an) { ar /= an; ag /= an; ab /= an; }
    }
    for (let yy = ya; yy <= yb; yy++) for (let xx = xa; xx <= xb; xx++) {
      const d = Math.hypot(xx - x0, yy - y0) / R; if (d > 1) continue;
      const f = (1 - d * d) * (s.strength ?? 1); const o = (yy * w + xx) * 4;
      if (s.tool === 'heal' && an) {
        const lum = (px[o] + px[o + 1] + px[o + 2]) / 3, avg = (ar + ag + ab) / 3; const tex = (lum - avg) * 0.15;
        px[o] += (ar + tex - px[o]) * f; px[o + 1] += (ag + tex - px[o + 1]) * f; px[o + 2] += (ab + tex - px[o + 2]) * f;
      } else if (s.tool === 'whiten') { // teeth / eye whites: remove yellow, lift brightness
        const r = px[o], g = px[o + 1], b = px[o + 2]; const Y = 0.299 * r + 0.587 * g + 0.114 * b;
        const k = f * 0.7; const Y2 = Math.min(255, Y * (1 + 0.18 * f));
        px[o] = clamp(r + (Y2 - r) * k, 0, 255); px[o + 1] = clamp(g + (Y2 - g) * k, 0, 255); px[o + 2] = clamp(b + (Y2 + 4 - b) * k, 0, 255);
      } else if (s.tool === 'brighten') {
        for (let c = 0; c < 3; c++) px[o + c] = clamp(px[o + c] * (1 + 0.25 * f), 0, 255);
      } else if (s.tool === 'smooth') {
        let sr = 0, sg = 0, sb = 0, sn = 0; const rr = Math.max(1, Math.round(R / 5));
        for (let dy = -rr; dy <= rr; dy += Math.max(1, rr >> 1)) for (let dx = -rr; dx <= rr; dx += Math.max(1, rr >> 1)) {
          const X = Math.min(w - 1, Math.max(0, xx + dx)), Y = Math.min(h - 1, Math.max(0, yy + dy)); const q = (Y * w + X) * 4; sr += px[q]; sg += px[q + 1]; sb += px[q + 2]; sn++;
        }
        px[o] += (sr / sn - px[o]) * f * 0.8; px[o + 1] += (sg / sn - px[o + 1]) * f * 0.8; px[o + 2] += (sb / sn - px[o + 2]) * f * 0.8;
      }
    }
  }
  return img;
}

// ffmpeg finishing filters that match the spatial preview (for video renders)
export function ffmpegFinish(p, { video = true } = {}) {
  const f = [];
  if (p.clarity > 0) f.push(`unsharp=13:13:${(p.clarity * 1.2).toFixed(2)}:13:13:0`);
  if (p.clarity < 0) f.push(`gblur=sigma=${(-p.clarity * 2).toFixed(2)}`);
  if (p.sharpen > 0) f.push(`unsharp=5:5:${(p.sharpen * 1.5).toFixed(2)}:5:5:0`);
  if (p.vignette > 0) f.push(`vignette=angle=${(0.25 + p.vignette * 0.55).toFixed(3)}`);
  if (p.grain > 0) f.push(`noise=alls=${Math.round(p.grain * 22)}:allf=t`);
  if (p.fx && p.fx.length) f.push(...fxFilters(p.fx, { video }));
  return f;
}
