// Pandora FX — 100+ image & video effects, one definition each, used everywhere (Timeline, Color, Photo).
//
// Each effect works the same in the live preview and in the final render:
//   kind 'color'   → a pure colour transform  color(r,g,b,a) → [r,g,b]   (0..1). Preview: applied per pixel.
//                    Render: baked into the clip's 3D LUT (lut3d), so preview and render match exactly.
//   kind 'spatial' → preview(ctx, canvas, a, W, H) draws on a canvas; ff(a) is the ffmpeg filter for the render.
//   kind 'time'    → only meaningful on video (speed ramps, echoes, flicker…). ff(a) only; preview = badge.
// `a` is the effect strength 0..1. ff() may return a filter-graph using {in} {out} {u} {W} {H} placeholders.

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const mix = (x, y, t) => x + (y - x) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  return [h, s, l];
}
function hsl2rgb(h, s, l) {
  if (!s) return [l, l, l];
  const f = (p, q, t) => { t = (t % 1 + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
}
const hueShift = (deg) => (r, g, b) => { const [h, s, l] = rgb2hsl(r, g, b); return hsl2rgb(h + deg / 360, s, l); };
const sat = (k) => (r, g, b) => { const y = lum(r, g, b); return [y + (r - y) * k, y + (g - y) * k, y + (b - y) * k]; };
const duo = (c1, c2) => { const A = hex(c1), B = hex(c2); return (r, g, b) => { const y = clamp(lum(r, g, b)); return [mix(A[0], B[0], y), mix(A[1], B[1], y), mix(A[2], B[2], y)]; }; };
const tri = (c1, c2, c3) => { const A = hex(c1), B = hex(c2), C = hex(c3); return (r, g, b) => { const y = clamp(lum(r, g, b)); const [P, Q, t] = y < 0.5 ? [A, B, y * 2] : [B, C, y * 2 - 1]; return [mix(P[0], Q[0], t), mix(P[1], Q[1], t), mix(P[2], Q[2], t)]; }; };
const curve = (fn) => (r, g, b) => [fn(r), fn(g), fn(b)];
const sCurve = (k) => (x) => clamp(x + k * (x * x * (3 - 2 * x) - x) * 1.6);
const tint = (c, amt) => { const T = hex(c); return (r, g, b) => { const y = lum(r, g, b); return [mix(r, y * T[0] * 1.6, amt), mix(g, y * T[1] * 1.6, amt), mix(b, y * T[2] * 1.6, amt)]; }; };
const chain = (...fs) => (r, g, b) => fs.reduce((c, f) => f(c[0], c[1], c[2]), [r, g, b]);
const keepHue = (h0, w = 0.07) => (r, g, b) => {
  const [h, s] = rgb2hsl(r, g, b); const d = Math.min(Math.abs(h - h0), 1 - Math.abs(h - h0));
  const k = clamp(1 - (d - w) / 0.05) * clamp(s * 3); const y = lum(r, g, b); return [mix(y, r, k), mix(y, g, k), mix(y, b, k)];
};
const split = (shCol, hiCol, amt = 0.35) => { const S = hex(shCol), H = hex(hiCol); return (r, g, b) => {
  const y = lum(r, g, b); const ws = (1 - y) * (1 - y) * amt, wh = y * y * amt;
  return [r + (S[0] - 0.5) * ws + (H[0] - 0.5) * wh, g + (S[1] - 0.5) * ws + (H[1] - 0.5) * wh, b + (S[2] - 0.5) * ws + (H[2] - 0.5) * wh];
}; };
const gain = (kr, kg, kb) => (r, g, b) => [r * kr, g * kg, b * kb];

// colour effect: full-strength transform; strength a blends from original
const C = (id, name, cat, fn, css) => ({ id, name, cat, kind: 'color', color: (r, g, b, a = 1) => { const o = fn(r, g, b); return [clamp(mix(r, o[0], a)), clamp(mix(g, o[1], a)), clamp(mix(b, o[2], a))]; }, css });

const COLOR = [
  // Basic
  C('bright', 'Brighten', 'Basic', curve((x) => Math.pow(x, 0.75)), (a) => `brightness(${1 + a * 0.3})`),
  C('darken', 'Darken', 'Basic', curve((x) => Math.pow(x, 1.35)), (a) => `brightness(${1 - a * 0.25})`),
  C('contrast', 'Punchy Contrast', 'Basic', curve(sCurve(0.45)), (a) => `contrast(${1 + a * 0.4})`),
  C('flat', 'Flat / Log', 'Basic', curve((x) => 0.12 + x * 0.76), (a) => `contrast(${1 - a * 0.35})`),
  C('vivid', 'Vivid', 'Basic', sat(1.55), (a) => `saturate(${1 + a * 0.55})`),
  C('muted', 'Muted', 'Basic', sat(0.55), (a) => `saturate(${1 - a * 0.45})`),
  C('bw', 'Black & White', 'Basic', sat(0), (a) => `grayscale(${a})`),
  C('bw-hard', 'Hard B&W', 'Basic', chain(sat(0), curve(sCurve(0.8))), (a) => `grayscale(${a}) contrast(${1 + a * 0.6})`),
  C('sepia', 'Sepia', 'Basic', (r, g, b) => [r * 0.393 + g * 0.769 + b * 0.189, r * 0.349 + g * 0.686 + b * 0.168, r * 0.272 + g * 0.534 + b * 0.131], (a) => `sepia(${a})`),
  C('invert', 'Invert', 'Basic', (r, g, b) => [1 - r, 1 - g, 1 - b], (a) => `invert(${a})`),
  C('warm', 'Warm', 'Basic', gain(1.08, 1.0, 0.86), (a) => `sepia(${a * 0.25}) saturate(${1 + a * 0.15})`),
  C('cool', 'Cool', 'Basic', gain(0.88, 0.98, 1.1), (a) => `hue-rotate(${-a * 12}deg) saturate(${1 + a * 0.1})`),
  C('magenta', 'Magenta Tint', 'Basic', gain(1.06, 0.9, 1.06)),
  C('green-tint', 'Green Tint', 'Basic', gain(0.94, 1.07, 0.92)),
  C('lift', 'Lift Shadows', 'Basic', curve((x) => x + (1 - x) * (1 - x) * 0.18)),
  C('crush', 'Crushed Blacks', 'Basic', curve((x) => clamp((x - 0.08) / 0.92))),
  C('rolloff', 'Highlight Roll-off', 'Basic', curve((x) => (x > 0.7 ? 0.7 + (1 - Math.exp(-(x - 0.7) * 3)) * 0.3 / (1 - Math.exp(-0.9)) : x))),
  C('matte', 'Matte Fade', 'Basic', curve((x) => 0.09 + x * 0.86), (a) => `contrast(${1 - a * 0.2}) brightness(${1 + a * 0.05})`),
  // Film
  C('bleach', 'Bleach Bypass', 'Film', chain(sat(0.45), curve(sCurve(0.6)))),
  C('crossproc', 'Cross Process', 'Film', (r, g, b) => [sCurve(0.5)(r), clamp(g * 1.05 + 0.02), clamp(0.15 + b * 0.7)]),
  C('technicolor', 'Two-Strip Technicolor', 'Film', (r, g, b) => { const c = (g + b) / 2; return [r, c * 1.02, c * 1.08]; }),
  C('kodachrome', 'Kodachrome-ish', 'Film', chain(curve(sCurve(0.35)), gain(1.06, 1.0, 0.92), sat(1.2))),
  C('portra', 'Portra-ish', 'Film', chain(gain(1.04, 1.0, 0.95), sat(0.85), curve((x) => 0.04 + x * 0.94))),
  C('cinestill', 'Cinestill Night', 'Film', chain(split('#1d4e6e', '#ff8a5c', 0.5), curve(sCurve(0.25)))),
  C('polaroid', 'Polaroid', 'Film', chain(curve((x) => 0.08 + x * 0.88), gain(1.05, 1.02, 0.9), sat(0.8))),
  C('faded90s', 'Faded 90s', 'Film', chain(curve((x) => 0.1 + x * 0.82), sat(0.75), gain(1.04, 1.0, 1.02))),
  C('yellowed', 'Old Film Yellowing', 'Film', chain(sat(0.5), tint('#d6b36b', 0.45), curve((x) => 0.06 + x * 0.9))),
  C('silver', 'Silver Screen', 'Film', chain(sat(0), curve((x) => 0.05 + sCurve(0.3)(x) * 0.92), gain(0.98, 1.0, 1.04))),
  C('noir', 'Noir Blue', 'Film', chain(sat(0.15), tint('#5d7fae', 0.35), curve(sCurve(0.5)))),
  // Cinematic
  C('tealorange', 'Teal & Orange', 'Cinematic', chain(split('#008080', '#ff9a3c', 0.55), sat(1.08))),
  C('golden', 'Golden Hour', 'Cinematic', chain(gain(1.1, 1.0, 0.8), split('#7a4a2a', '#ffcf73', 0.35))),
  C('moonlight', 'Moonlight', 'Cinematic', chain(gain(0.8, 0.9, 1.12), sat(0.7), curve((x) => Math.pow(x, 1.15)))),
  C('dayfornight', 'Day for Night', 'Cinematic', chain(gain(0.55, 0.65, 0.95), sat(0.5), curve((x) => Math.pow(x, 1.4)))),
  C('blockbuster', 'Blockbuster', 'Cinematic', chain(split('#0d5c7a', '#f4a35a', 0.5), curve(sCurve(0.35)))),
  C('matrix', 'Matrix Green', 'Cinematic', chain(gain(0.85, 1.1, 0.82), sat(0.8), curve(sCurve(0.3)))),
  C('desert', 'Desert Heat', 'Cinematic', chain(gain(1.12, 1.02, 0.78), curve((x) => 0.05 + x * 0.95))),
  C('arctic', 'Arctic', 'Cinematic', chain(gain(0.9, 1.0, 1.14), sat(0.75), curve((x) => Math.pow(x, 0.9)))),
  C('horror', 'Horror', 'Cinematic', chain(sat(0.35), gain(0.95, 1.04, 0.95), curve(sCurve(0.6)))),
  C('dreamscape', 'Dreamscape', 'Cinematic', chain(curve((x) => 0.1 + Math.pow(x, 0.8) * 0.88), sat(0.9), gain(1.04, 0.98, 1.06))),
  C('sunset', 'Sunset Glow', 'Cinematic', chain(gain(1.12, 0.95, 0.85), split('#5a2d82', '#ffb347', 0.4))),
  C('emerald', 'Emerald', 'Cinematic', chain(split('#0b4d3c', '#d9f2c4', 0.5), sat(0.9))),
  // Stylized
  C('cyberpunk', 'Cyberpunk', 'Stylized', chain(split('#3a00ff', '#ff00a8', 0.6), sat(1.3), curve(sCurve(0.3)))),
  C('vaporwave', 'Vaporwave', 'Stylized', chain(tri('#2b0f54', '#ff4fa3', '#7ef9ff'), sat(1.1))),
  C('pastel', 'Pastel', 'Stylized', chain(sat(0.6), curve((x) => 0.18 + x * 0.8))),
  C('neon', 'Neon Boost', 'Stylized', chain(sat(1.9), curve(sCurve(0.25)))),
  C('infrared', 'Infrared', 'Stylized', (r, g, b) => { const y = lum(r, g, b); return [clamp(g * 1.2), clamp(r * 0.6 + y * 0.3), clamp(b * 0.6 + y * 0.25)]; }),
  C('thermal', 'Thermal Camera', 'Stylized', (r, g, b) => { const y = clamp(lum(r, g, b)); const st = [[0, 0, 0.2], [0.4, 0, 0.6], [0.9, 0.1, 0.2], [1, 0.6, 0], [1, 1, 0.6]]; const t = y * 4, i = Math.min(3, Math.floor(t)), f = t - i; return [mix(st[i][0], st[i + 1][0], f), mix(st[i][1], st[i + 1][1], f), mix(st[i][2], st[i + 1][2], f)]; }),
  C('nightvision', 'Night Vision', 'Stylized', (r, g, b) => { const y = clamp(Math.pow(lum(r, g, b), 0.7) * 1.2); return [y * 0.25, y, y * 0.3]; }),
  C('solarize', 'Solarize', 'Stylized', curve((x) => (x > 0.5 ? 1 - x : x) * 1.7)),
  C('posterize', 'Posterize', 'Stylized', curve((x) => Math.round(x * 4) / 4)),
  C('threshold', 'Threshold (Ink)', 'Stylized', (r, g, b) => { const y = lum(r, g, b) > 0.5 ? 1 : 0; return [y, y, y]; }),
  C('comic', 'Comic Colours', 'Stylized', chain(sat(1.6), curve((x) => Math.round(x * 5) / 5))),
  C('popart', 'Pop Art', 'Stylized', tri('#1b1464', '#ff2e63', '#ffe74c')),
  C('rgb-brg', 'Channel Swap BRG', 'Stylized', (r, g, b) => [b, r, g]),
  C('rgb-gbr', 'Channel Swap GBR', 'Stylized', (r, g, b) => [g, b, r]),
  C('hue60', 'Hue Shift +60°', 'Stylized', hueShift(60), (a) => `hue-rotate(${a * 60}deg)`),
  C('hue120', 'Hue Shift +120°', 'Stylized', hueShift(120), (a) => `hue-rotate(${a * 120}deg)`),
  C('hue180', 'Hue Shift 180°', 'Stylized', hueShift(180), (a) => `hue-rotate(${a * 180}deg)`),
  C('hue-60', 'Hue Shift −60°', 'Stylized', hueShift(-60), (a) => `hue-rotate(${-a * 60}deg)`),
  // Duotone
  C('duo-purple', 'Duotone Purple/Orange', 'Duotone', duo('#2d0b59', '#ffb36b')),
  C('duo-blue', 'Duotone Blue/Pink', 'Duotone', duo('#0b2a6f', '#ff8fd0')),
  C('duo-red', 'Duotone Red/Black', 'Duotone', duo('#0b0b0b', '#ff2a2a')),
  C('duo-teal', 'Duotone Teal/Gold', 'Duotone', duo('#003f4f', '#ffd36b')),
  C('duo-green', 'Duotone Forest', 'Duotone', duo('#062b1c', '#c8ff9e')),
  C('duo-mono', 'Duotone Navy/Cream', 'Duotone', duo('#101b33', '#f6ecd6')),
  // Selective colour (Sin City style)
  C('keep-red', 'Colour Pop: Red', 'Selective', keepHue(0)),
  C('keep-orange', 'Colour Pop: Orange', 'Selective', keepHue(0.08)),
  C('keep-yellow', 'Colour Pop: Yellow', 'Selective', keepHue(0.15)),
  C('keep-green', 'Colour Pop: Green', 'Selective', keepHue(0.33, 0.1)),
  C('keep-blue', 'Colour Pop: Blue', 'Selective', keepHue(0.6, 0.09)),
  C('keep-pink', 'Colour Pop: Pink', 'Selective', keepHue(0.9)),
  C('rosegold', 'Rose Gold', 'Selective', chain(tint('#e8a598', 0.35), sat(0.9))),
  C('mint', 'Mint Fresh', 'Selective', chain(split('#2a6b5e', '#e6fff5', 0.4), sat(0.85))),
  C('autumn', 'Autumn', 'Selective', chain(hueShift(-12), gain(1.08, 1.0, 0.85), sat(1.15))),
  C('spring', 'Spring', 'Selective', chain(gain(0.98, 1.06, 0.96), sat(1.2), curve((x) => Math.pow(x, 0.92)))),
];

// ── spatial helpers (canvas based preview) ──
function blurDraw(ctx, src, px) { ctx.save(); ctx.filter = `blur(${px}px)`; ctx.drawImage(src, 0, 0); ctx.restore(); }
function copyCanvas(cv) { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c; }
function convolve(ctx, W, H, k, { bias = 0, gray = false, abs = false } = {}) {
  const src = ctx.getImageData(0, 0, W, H), out = ctx.createImageData(W, H); const s = src.data, d = out.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, i = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++, i++) {
      const xx = x + dx < 0 ? 0 : x + dx >= W ? W - 1 : x + dx, yy = y + dy < 0 ? 0 : y + dy >= H ? H - 1 : y + dy; const o = (yy * W + xx) * 4;
      r += s[o] * k[i]; g += s[o + 1] * k[i]; b += s[o + 2] * k[i];
    }
    if (abs) { r = Math.abs(r); g = Math.abs(g); b = Math.abs(b); }
    const o = (y * W + x) * 4;
    if (gray) { const v = (r + g + b) / 3 + bias; d[o] = d[o + 1] = d[o + 2] = v; } else { d[o] = r + bias; d[o + 1] = g + bias; d[o + 2] = b + bias; }
    d[o + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}
function lerpCanvas(ctx, before, a) { if (a >= 0.999) return; ctx.save(); ctx.globalAlpha = 1 - a; ctx.drawImage(before, 0, 0); ctx.restore(); }
const evenPx = (n) => Math.max(2, Math.round(n / 2) * 2);

// S(id, name, cat, preview(ctx, W, H, a, before), ff(a) → filter string or graph)
const S = (id, name, cat, preview, ff, css) => ({ id, name, cat, kind: 'spatial', preview, ff, css });
const T = (id, name, cat, ff, css) => ({ id, name, cat, kind: 'time', ff, css });
const glowGraph = (sigma, op, mode = 'screen') => `{in}split[{u}a][{u}b];[{u}b]gblur=sigma=${sigma}[{u}c];[{u}a][{u}c]blend=all_mode=${mode}:all_opacity=${op}{out}`;

const SPATIAL = [
  // Blur & glow
  S('blur', 'Gaussian Blur', 'Blur & Glow', (ctx, W, H, a, b) => { ctx.clearRect(0, 0, W, H); blurDraw(ctx, b, Math.max(0.5, a * W / 160)); }, (a) => `gblur=sigma=${(0.5 + a * 9).toFixed(2)}`, (a) => `blur(${a * 6}px)`),
  S('motionblur', 'Motion Blur', 'Blur & Glow', (ctx, W, H, a, b) => { const n = 9, sp = a * W / 60; ctx.clearRect(0, 0, W, H); for (let i = 0; i < n; i++) { ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(b, (i - n / 2) * sp / n, 0); } ctx.globalAlpha = 1; }, (a) => `avgblur=sizeX=${Math.max(1, Math.round(a * 24))}:sizeY=1`),
  S('softfocus', 'Soft Focus', 'Blur & Glow', (ctx, W, H, a, b) => { ctx.save(); ctx.globalAlpha = 0.5 * a; ctx.filter = `blur(${W / 120}px)`; ctx.drawImage(b, 0, 0); ctx.restore(); }, (a) => glowGraph(8, (0.5 * a).toFixed(2), 'normal')),
  S('glow', 'Glow', 'Blur & Glow', (ctx, W, H, a, b) => { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.6 * a; ctx.filter = `blur(${W / 70}px)`; ctx.drawImage(b, 0, 0); ctx.restore(); }, (a) => glowGraph(14, (0.6 * a).toFixed(2))),
  S('bloom', 'Bloom (highlights)', 'Blur & Glow', (ctx, W, H, a, b) => { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.8 * a; ctx.filter = `brightness(0.6) contrast(2.4) blur(${W / 45}px)`; ctx.drawImage(b, 0, 0); ctx.restore(); },
    (a) => `{in}split[{u}a][{u}b];[{u}b]curves=all='0/0 0.6/0 1/1',gblur=sigma=22[{u}c];[{u}a][{u}c]blend=all_mode=screen:all_opacity=${(0.8 * a).toFixed(2)}{out}`),
  S('dreamy', 'Dreamy Haze', 'Blur & Glow', (ctx, W, H, a, b) => { ctx.save(); ctx.globalCompositeOperation = 'lighten'; ctx.globalAlpha = 0.55 * a; ctx.filter = `blur(${W / 50}px) brightness(1.15)`; ctx.drawImage(b, 0, 0); ctx.restore(); }, (a) => `{in}split[{u}a][{u}b];[{u}b]gblur=sigma=20,eq=brightness=0.06[{u}c];[{u}a][{u}c]blend=all_mode=lighten:all_opacity=${(0.55 * a).toFixed(2)}{out}`),
  S('tiltshift', 'Tilt-Shift Miniature', 'Blur & Glow', (ctx, W, H, a, b) => { const bl = copyCanvas(b); const bc = bl.getContext('2d'); bc.clearRect(0, 0, W, H); blurDraw(bc, b, a * W / 110); const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#000'); g.addColorStop(0.35, 'rgba(0,0,0,0)'); g.addColorStop(0.65, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); const m = document.createElement('canvas'); m.width = W; m.height = H; const mc = m.getContext('2d'); mc.fillStyle = g; mc.fillRect(0, 0, W, H); mc.globalCompositeOperation = 'source-in'; mc.drawImage(bl, 0, 0); ctx.drawImage(m, 0, 0); },
    (a) => `{in}split[{u}a][{u}b];[{u}b]gblur=sigma=${(2 + a * 10).toFixed(1)}[{u}c];[{u}a][{u}c]blend=all_expr='A+(B-A)*min(1\\,max(0\\,(abs(Y/H-0.5)-0.15)*3.3))'{out}`),
  S('denoise', 'Denoise / Smooth', 'Blur & Glow', (ctx, W, H, a, b) => { ctx.save(); ctx.globalAlpha = 0.6 * a; ctx.filter = 'blur(1px)'; ctx.drawImage(b, 0, 0); ctx.restore(); }, (a) => `hqdn3d=${(2 + a * 6).toFixed(1)}:${(1.5 + a * 4).toFixed(1)}:6:6`),
  // Sharpen & detail
  S('sharpen', 'Sharpen', 'Detail', (ctx, W, H, a) => { const before = copyCanvas(ctx.canvas); convolve(ctx, W, H, [0, -1, 0, -1, 5, -1, 0, -1, 0]); lerpCanvas(ctx, before, a); }, (a) => `unsharp=5:5:${(0.4 + a * 1.4).toFixed(2)}:5:5:0`),
  S('clarity', 'Clarity Pop', 'Detail', (ctx, W, H, a) => { const before = copyCanvas(ctx.canvas); convolve(ctx, W, H, [-1, -1, -1, -1, 9, -1, -1, -1, -1]); lerpCanvas(ctx, before, a * 0.5); }, (a) => `unsharp=13:13:${(0.3 + a * 1.1).toFixed(2)}:13:13:0`),
  S('hdr', 'HDR Look', 'Detail', (ctx, W, H, a) => { const before = copyCanvas(ctx.canvas); convolve(ctx, W, H, [-1, -1, -1, -1, 9, -1, -1, -1, -1]); lerpCanvas(ctx, before, a * 0.6); ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = a * 0.5; ctx.drawImage(before, 0, 0); ctx.restore(); },
    (a) => `unsharp=13:13:${(0.6 + a * 1.2).toFixed(2)}:13:13:0,eq=saturation=${(1 + a * 0.25).toFixed(2)}`),
  // Stylize
  S('pixelate', 'Pixelate', 'Stylize', (ctx, W, H, a, b) => { const n = Math.max(2, Math.round(2 + a * 30)); const t = document.createElement('canvas'); t.width = Math.ceil(W / n); t.height = Math.ceil(H / n); t.getContext('2d').drawImage(b, 0, 0, t.width, t.height); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, W, H); ctx.imageSmoothingEnabled = true; },
    (a) => { const n = Math.max(2, Math.round(2 + a * 30)); return `scale=iw/${n}:ih/${n}:flags=neighbor,scale=iw*${n}:ih*${n}:flags=neighbor`; }),
  S('edges', 'Edge Detect', 'Stylize', (ctx, W, H, a) => { const before = copyCanvas(ctx.canvas); convolve(ctx, W, H, [-1, -1, -1, -1, 8, -1, -1, -1, -1], { gray: true, abs: true }); lerpCanvas(ctx, before, a); }, (a) => `{in}split[{u}a][{u}b];[{u}b]edgedetect=low=0.08:high=0.25[{u}c];[{u}a][{u}c]blend=all_mode=normal:all_opacity=${a.toFixed(2)}{out}`),
  S('sketch', 'Pencil Sketch', 'Stylize', (ctx, W, H, a) => { const before = copyCanvas(ctx.canvas); convolve(ctx, W, H, [-1, -1, -1, -1, 8, -1, -1, -1, -1], { gray: true, abs: true }); const id = ctx.getImageData(0, 0, W, H); for (let i = 0; i < id.data.length; i += 4) { const v = 255 - Math.min(255, id.data[i] * 2.2); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; } ctx.putImageData(id, 0, 0); lerpCanvas(ctx, before, a); },
    (a) => `{in}split[{u}a][{u}b];[{u}b]edgedetect=low=0.06:high=0.2,negate,format=gray,format=yuv420p[{u}c];[{u}a][{u}c]blend=all_mode=normal:all_opacity=${a.toFixed(2)}{out}`),
  S('neonedges', 'Neon Edges', 'Stylize', (ctx, W, H, a) => { const before = copyCanvas(ctx.canvas); convolve(ctx, W, H, [-1, -1, -1, -1, 8, -1, -1, -1, -1], { abs: true }); const e = copyCanvas(ctx.canvas); ctx.drawImage(e, 0, 0); ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.filter = 'blur(3px) saturate(3)'; ctx.drawImage(e, 0, 0); ctx.restore(); lerpCanvas(ctx, before, a); },
    (a) => `{in}split[{u}a][{u}b];[{u}b]edgedetect=mode=colormix:high=0.1,eq=saturation=2.5[{u}c];[{u}a][{u}c]blend=all_mode=normal:all_opacity=${a.toFixed(2)}{out}`),
  S('emboss', 'Emboss', 'Stylize', (ctx, W, H, a) => { const before = copyCanvas(ctx.canvas); convolve(ctx, W, H, [-2, -1, 0, -1, 1, 1, 0, 1, 2], { gray: true, bias: 0 }); lerpCanvas(ctx, before, a); }, (a) => `{in}split[{u}a][{u}b];[{u}b]convolution='-2 -1 0 -1 1 1 0 1 2:-2 -1 0 -1 1 1 0 1 2:-2 -1 0 -1 1 1 0 1 2:-2 -1 0 -1 1 1 0 1 2',hue=s=0[{u}c];[{u}a][{u}c]blend=all_mode=normal:all_opacity=${a.toFixed(2)}{out}`),
  S('oil', 'Oil Paint', 'Stylize', (ctx, W, H, a, b) => { ctx.save(); ctx.filter = `blur(${1 + a * 2}px) saturate(1.3) contrast(1.15)`; ctx.drawImage(b, 0, 0); ctx.restore(); }, (a) => `median=radius=${Math.max(1, Math.round(1 + a * 4))},eq=saturation=1.25:contrast=1.1`),
  S('cartoon', 'Cartoon', 'Stylize', (ctx, W, H, a, b) => { const before = copyCanvas(b); ctx.save(); ctx.filter = 'blur(2px) saturate(1.6)'; ctx.drawImage(before, 0, 0); ctx.restore(); const id = ctx.getImageData(0, 0, W, H); for (let i = 0; i < id.data.length; i++) if (i % 4 !== 3) id.data[i] = Math.round(id.data[i] / 48) * 48; ctx.putImageData(id, 0, 0); const e = copyCanvas(before); const ec = e.getContext('2d'); convolve(ec, W, H, [-1, -1, -1, -1, 8, -1, -1, -1, -1], { gray: true, abs: true }); ctx.save(); ctx.globalCompositeOperation = 'difference'; ctx.drawImage(e, 0, 0); ctx.restore(); lerpCanvas(ctx, before, a); },
    (a) => `{in}split[{u}a][{u}b];[{u}a]median=radius=3,eq=saturation=1.6,lutrgb=r='floor(val/48)*48':g='floor(val/48)*48':b='floor(val/48)*48'[{u}c];[{u}b]edgedetect=low=0.1:high=0.3,negate[{u}d];[{u}c][{u}d]blend=all_mode=multiply:all_opacity=${a.toFixed(2)}{out}`),
  S('halftone', 'Halftone Dots', 'Stylize', (ctx, W, H, a, b) => { const step = Math.max(4, Math.round(W / 90)); const id = b.getContext('2d').getImageData(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#111'; for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) { const o = (y * W + x) * 4; const v = 1 - (id.data[o] + id.data[o + 1] + id.data[o + 2]) / 765; ctx.beginPath(); ctx.arc(x + step / 2, y + step / 2, v * step * 0.62, 0, 7); ctx.fill(); } lerpCanvas(ctx, b, a); },
    (a) => `{in}split[{u}a][{u}b];[{u}b]format=gray,scale=iw/8:ih/8,scale=iw*8:ih*8:flags=neighbor,geq=lum='if(lt(hypot(mod(X\\,8)-4\\,mod(Y\\,8)-4)\\,(255-lum(X\\,Y))/255*5)\\,20\\,235)',format=yuv420p[{u}c];[{u}a][{u}c]blend=all_mode=normal:all_opacity=${a.toFixed(2)}{out}`),
  S('rgbsplit', 'RGB Split', 'Glitch', (ctx, W, H, a, b) => { const sh = Math.round(a * W / 90); ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter'; for (const [dx, col] of [[-sh, 'rgb(255,0,0)'], [0, 'rgb(0,255,0)'], [sh, 'rgb(0,0,255)']]) { const t = copyCanvas(b); const tc = t.getContext('2d'); tc.globalCompositeOperation = 'multiply'; tc.fillStyle = col; tc.fillRect(0, 0, W, H); ctx.drawImage(t, dx, 0); } ctx.globalCompositeOperation = 'source-over'; },
    (a) => { const s = Math.max(1, Math.round(a * 22)); return `rgbashift=rh=-${s}:bh=${s}`; }),
  S('chroma', 'Chromatic Aberration', 'Glitch', (ctx, W, H, a, b) => { const sh = Math.max(1, Math.round(a * W / 260)); ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter'; for (const [dx, dy, col] of [[-sh, 0, 'rgb(255,0,0)'], [0, 0, 'rgb(0,255,0)'], [sh, sh / 2, 'rgb(0,0,255)']]) { const t = copyCanvas(b); const tc = t.getContext('2d'); tc.globalCompositeOperation = 'multiply'; tc.fillStyle = col; tc.fillRect(0, 0, W, H); ctx.drawImage(t, dx, dy); } ctx.globalCompositeOperation = 'source-over'; },
    (a) => { const s = Math.max(1, Math.round(a * 7)); return `rgbashift=rh=-${s}:bh=${s}:bv=${Math.ceil(s / 2)}`; }),
  S('glitchbars', 'Glitch Bars', 'Glitch', (ctx, W, H, a, b) => { let s = 9; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647); const n = Math.round(4 + a * 14); for (let i = 0; i < n; i++) { const y = rnd() * H, h = 2 + rnd() * H / 18, dx = (rnd() - 0.5) * W * 0.15 * a; ctx.drawImage(b, 0, y, W, h, dx, y, W, h); } },
    (a) => `rgbashift=rh=${Math.round(4 + a * 10)}:gv=${Math.round(a * 4)},noise=alls=${Math.round(a * 30)}:allf=t+u`),
  S('scanlines', 'Scanlines', 'Retro', (ctx, W, H, a) => { ctx.fillStyle = `rgba(0,0,0,${0.35 * a})`; const st = Math.max(2, Math.round(H / 240)); for (let y = 0; y < H; y += st * 2) ctx.fillRect(0, y, W, st); }, (a) => `drawgrid=w=iw:h=4:t=2:c=black@${(0.35 * a).toFixed(2)}`),
  S('crt', 'CRT Monitor', 'Retro', (ctx, W, H, a) => { ctx.fillStyle = `rgba(0,0,0,${0.3 * a})`; for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1); const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.7 * a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); },
    (a) => `lenscorrection=k1=${(0.08 * a).toFixed(3)}:k2=${(0.04 * a).toFixed(3)},drawgrid=w=iw:h=3:t=1:c=black@${(0.3 * a).toFixed(2)},vignette=angle=${(0.3 + a * 0.4).toFixed(2)}`),
  S('vhs', 'VHS Tape', 'Retro', (ctx, W, H, a, b) => { ctx.save(); ctx.filter = 'blur(1px) saturate(1.3)'; ctx.drawImage(b, Math.round(a * 3), 0); ctx.restore(); ctx.fillStyle = `rgba(0,0,0,${0.18 * a})`; for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2); },
    (a) => `rgbashift=rh=${Math.round(2 + a * 4)}:bh=-${Math.round(1 + a * 3)},gblur=sigma=0.8,noise=alls=${Math.round(8 + a * 14)}:allf=t,eq=saturation=1.3,drawgrid=w=iw:h=4:t=2:c=black@${(0.18 * a).toFixed(2)}`),
  S('grain', 'Film Grain', 'Retro', (ctx, W, H, a) => { const id = ctx.getImageData(0, 0, W, H); const k = a * 40; for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * k; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } ctx.putImageData(id, 0, 0); }, (a) => `noise=alls=${Math.round(4 + a * 22)}:allf=t`),
  S('heavygrain', 'Heavy 16mm Grain', 'Retro', (ctx, W, H, a) => { const id = ctx.getImageData(0, 0, W, H); const k = a * 80; for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * k; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } ctx.putImageData(id, 0, 0); }, (a) => `noise=alls=${Math.round(15 + a * 40)}:allf=t,gblur=sigma=0.6`),
  S('dither', '8-bit Dither', 'Retro', (ctx, W, H, a) => { const id = ctx.getImageData(0, 0, W, H); const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; const t = (B[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 64; for (let c = 0; c < 3; c++) id.data[o + c] = Math.round((id.data[o + c] + t) / 64) * 64; } ctx.putImageData(id, 0, 0); },
    () => `scale=iw/3:ih/3,lutrgb=r='floor(val/64)*64':g='floor(val/64)*64':b='floor(val/64)*64',scale=iw*3:ih*3:flags=neighbor`),
  // Lens & light
  S('vignette', 'Vignette', 'Lens & Light', (ctx, W, H, a) => { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.75 * a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }, (a) => `vignette=angle=${(0.25 + a * 0.5).toFixed(3)}`),
  S('whitevig', 'White Vignette', 'Lens & Light', (ctx, W, H, a) => { const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${0.75 * a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); },
    (a) => `negate,vignette=angle=${(0.25 + a * 0.5).toFixed(3)},negate`),
  S('fisheye', 'Fisheye', 'Lens & Light', (ctx, W, H, a, b) => { const z = 1 + a * 0.25; ctx.drawImage(b, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z); const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) / 2); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.8 * a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); },
    (a) => `lenscorrection=k1=${(0.3 * a).toFixed(3)}:k2=${(0.15 * a).toFixed(3)}`),
  S('pincushion', 'Lens Squeeze', 'Lens & Light', (ctx, W, H, a, b) => { const z = 1 - a * 0.08; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.drawImage(b, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z); }, (a) => `lenscorrection=k1=-${(0.25 * a).toFixed(3)}:k2=-${(0.05 * a).toFixed(3)}`),
  S('leakwarm', 'Light Leak Warm', 'Lens & Light', (ctx, W, H, a) => { ctx.save(); ctx.globalCompositeOperation = 'screen'; const g = ctx.createRadialGradient(W * 0.1, H * 0.15, 0, W * 0.1, H * 0.15, W * 0.7); g.addColorStop(0, `rgba(255,140,40,${0.85 * a})`); g.addColorStop(0.5, `rgba(255,60,80,${0.35 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); },
    (a) => `{in}split[{u}a][{u}b];[{u}b]scale=160:-2,geq=r='255*exp(-(pow(X/W-0.1\\,2)+pow(Y/H-0.15\\,2))*4)':g='130*exp(-(pow(X/W-0.1\\,2)+pow(Y/H-0.15\\,2))*5)':b='60*exp(-(pow(X/W-0.1\\,2)+pow(Y/H-0.15\\,2))*7)',scale={W}:{H}[{u}c];[{u}a][{u}c]blend=all_mode=screen:all_opacity=${(0.85 * a).toFixed(2)}{out}`, null),
  S('leakcool', 'Light Leak Cool', 'Lens & Light', (ctx, W, H, a) => { ctx.save(); ctx.globalCompositeOperation = 'screen'; const g = ctx.createRadialGradient(W * 0.9, H * 0.2, 0, W * 0.9, H * 0.2, W * 0.7); g.addColorStop(0, `rgba(80,160,255,${0.8 * a})`); g.addColorStop(0.5, `rgba(160,80,255,${0.3 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); },
    (a) => `{in}split[{u}a][{u}b];[{u}b]scale=160:-2,geq=r='90*exp(-(pow(X/W-0.9\\,2)+pow(Y/H-0.2\\,2))*5)':g='150*exp(-(pow(X/W-0.9\\,2)+pow(Y/H-0.2\\,2))*4)':b='255*exp(-(pow(X/W-0.9\\,2)+pow(Y/H-0.2\\,2))*3.5)',scale={W}:{H}[{u}c];[{u}a][{u}c]blend=all_mode=screen:all_opacity=${(0.8 * a).toFixed(2)}{out}`),
  S('sunflare', 'Sun Flare', 'Lens & Light', (ctx, W, H, a) => { ctx.save(); ctx.globalCompositeOperation = 'screen'; const g = ctx.createRadialGradient(W * 0.78, H * 0.22, 0, W * 0.78, H * 0.22, W * 0.35); g.addColorStop(0, `rgba(255,250,220,${a})`); g.addColorStop(0.2, `rgba(255,200,120,${0.5 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore(); },
    (a) => `{in}split[{u}a][{u}b];[{u}b]scale=160:-2,geq=r='255*exp(-(pow(X/W-0.78\\,2)+pow((Y/H-0.22)*H/W\\,2))*30)':g='235*exp(-(pow(X/W-0.78\\,2)+pow((Y/H-0.22)*H/W\\,2))*34)':b='190*exp(-(pow(X/W-0.78\\,2)+pow((Y/H-0.22)*H/W\\,2))*40)',scale={W}:{H}[{u}c];[{u}a][{u}c]blend=all_mode=screen:all_opacity=${a.toFixed(2)}{out}`),
  // Frame & mirror
  S('mirror-h', 'Mirror Left→Right', 'Frame & Mirror', (ctx, W, H, a, b) => { ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(b, 0, 0, W / 2, H, 0, 0, W / 2, H); ctx.restore(); }, () => `{in}split[{u}a][{u}b];[{u}b]crop=iw/2:ih:0:0,hflip[{u}c];[{u}a][{u}c]overlay=W/2:0{out}`),
  S('mirror-v', 'Mirror Top→Bottom', 'Frame & Mirror', (ctx, W, H, a, b) => { ctx.save(); ctx.translate(0, H); ctx.scale(1, -1); ctx.drawImage(b, 0, 0, W, H / 2, 0, 0, W, H / 2); ctx.restore(); }, () => `{in}split[{u}a][{u}b];[{u}b]crop=iw:ih/2:0:0,vflip[{u}c];[{u}a][{u}c]overlay=0:H/2{out}`),
  S('kaleido', 'Kaleidoscope', 'Frame & Mirror', (ctx, W, H, a, b) => { const q = copyCanvas(b); ctx.drawImage(q, 0, 0, W / 2, H / 2, 0, 0, W / 2, H / 2); ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(q, 0, 0, W / 2, H / 2, 0, 0, W / 2, H / 2); ctx.restore(); ctx.save(); ctx.translate(0, H); ctx.scale(1, -1); ctx.drawImage(q, 0, 0, W / 2, H / 2, 0, 0, W / 2, H / 2); ctx.restore(); ctx.save(); ctx.translate(W, H); ctx.scale(-1, -1); ctx.drawImage(q, 0, 0, W / 2, H / 2, 0, 0, W / 2, H / 2); ctx.restore(); },
    () => `{in}crop=floor(iw/4)*2:floor(ih/4)*2:0:0,split[{u}a][{u}b];[{u}b]hflip[{u}c];[{u}a][{u}c]hstack,split[{u}d][{u}e];[{u}e]vflip[{u}f];[{u}d][{u}f]vstack{out}`),
  S('flip-h', 'Flip Horizontal', 'Frame & Mirror', (ctx, W, H, a, b) => { ctx.save(); ctx.translate(W, 0); ctx.scale(-1, 1); ctx.drawImage(b, 0, 0); ctx.restore(); }, () => 'hflip'),
  S('flip-v', 'Flip Vertical', 'Frame & Mirror', (ctx, W, H, a, b) => { ctx.save(); ctx.translate(0, H); ctx.scale(1, -1); ctx.drawImage(b, 0, 0); ctx.restore(); }, () => 'vflip'),
  S('letterbox', 'Cinema Bars 2.39', 'Frame & Mirror', (ctx, W, H, a) => { const bh = Math.max(0, (H - W / 2.39) / 2) * a; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); }, (a) => `drawbox=x=0:y=0:w=iw:h=max(0\\,(ih-iw/2.39)/2*${a.toFixed(2)}):color=black:t=fill,drawbox=x=0:y=ih-max(0\\,(ih-iw/2.39)/2*${a.toFixed(2)}):w=iw:h=ih:color=black:t=fill`),
  S('letterbox185', 'Cinema Bars 1.85', 'Frame & Mirror', (ctx, W, H, a) => { const bh = Math.max(0, (H - W / 1.85) / 2) * a; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh); }, (a) => `drawbox=x=0:y=0:w=iw:h=max(0\\,(ih-iw/1.85)/2*${a.toFixed(2)}):color=black:t=fill,drawbox=x=0:y=ih-max(0\\,(ih-iw/1.85)/2*${a.toFixed(2)}):w=iw:h=ih:color=black:t=fill`),
  S('border-white', 'White Border', 'Frame & Mirror', (ctx, W, H, a, b) => { const m = Math.round(Math.min(W, H) * 0.05 * a); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.drawImage(b, m, m, W - m * 2, H - m * 2); }, (a) => { const k = (1 - 0.1 * a).toFixed(3); return `scale=trunc(iw*${k}/2)*2:trunc(ih*${k}/2)*2,pad=trunc(iw/${k}/2)*2:trunc(ih/${k}/2)*2:(ow-iw)/2:(oh-ih)/2:white`; }),
  S('border-black', 'Black Frame', 'Frame & Mirror', (ctx, W, H, a, b) => { const m = Math.round(Math.min(W, H) * 0.05 * a); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.drawImage(b, m, m, W - m * 2, H - m * 2); }, (a) => { const k = (1 - 0.1 * a).toFixed(3); return `scale=trunc(iw*${k}/2)*2:trunc(ih*${k}/2)*2,pad=trunc(iw/${k}/2)*2:trunc(ih/${k}/2)*2:(ow-iw)/2:(oh-ih)/2:black`; }),
  S('polaroidframe', 'Polaroid Frame', 'Frame & Mirror', (ctx, W, H, a, b) => { const m = Math.round(Math.min(W, H) * 0.05), mb = m * 3; ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, W, H); ctx.drawImage(b, m, m, W - m * 2, H - m - mb); }, () => `scale=trunc(iw*0.9/2)*2:trunc(ih*0.82/2)*2,pad=trunc(iw/0.9/2)*2:trunc(ih/0.82/2)*2:(ow-iw)/2:oh*0.045:0xf4f1ea`),
  S('zoomcrop', 'Punch-in 120%', 'Frame & Mirror', (ctx, W, H, a, b) => { const z = 1 + 0.2 * a; ctx.drawImage(b, (W - W * z) / 2, (H - H * z) / 2, W * z, H * z); }, (a) => { const z = (1 + 0.2 * a).toFixed(3); return `crop=trunc(iw/${z}/2)*2:trunc(ih/${z}/2)*2`; }),
  S('splitscreen', 'Split Screen ×2', 'Frame & Mirror', (ctx, W, H, a, b) => { ctx.drawImage(b, W / 4, 0, W / 2, H, 0, 0, W / 2, H); ctx.drawImage(b, W / 4, 0, W / 2, H, W / 2, 0, W / 2, H); }, () => `{in}crop=floor(iw/4)*2:ih,split[{u}a][{u}b];[{u}a][{u}b]hstack{out}`),
  S('grid4', 'Grid ×4', 'Frame & Mirror', (ctx, W, H, a, b) => { for (let i = 0; i < 4; i++) ctx.drawImage(b, 0, 0, W, H, (i % 2) * W / 2, Math.floor(i / 2) * H / 2, W / 2, H / 2); }, () => `{in}scale=trunc(iw/4)*2:trunc(ih/4)*2,split=4[{u}a][{u}b][{u}c][{u}d];[{u}a][{u}b]hstack[{u}e];[{u}c][{u}d]hstack[{u}f];[{u}e][{u}f]vstack{out}`),
];

// Time / motion effects (video). Preview shows these as a badge — they play in the render.
const TIME = [
  T('fadein', 'Fade In (black)', 'Motion', () => 'fade=t=in:st=0:d=0.6'),
  T('fadein-w', 'Fade In (white)', 'Motion', () => 'fade=t=in:st=0:d=0.6:c=white'),
  T('flashin', 'Flash In', 'Motion', (a) => `eq=eval=frame:brightness='${(0.9 * a).toFixed(2)}*max(0\\,1-t/0.35)'`),
  T('strobe', 'Strobe', 'Motion', (a) => `eq=eval=frame:brightness='${(0.5 * a).toFixed(2)}*lt(mod(t\\,0.25)\\,0.05)'`),
  T('flicker', 'Old Film Flicker', 'Motion', (a) => `eq=eval=frame:brightness='${(0.06 * a).toFixed(3)}*sin(t*53)*sin(t*17)'`),
  T('huecycle', 'Hue Cycle', 'Motion', (a) => `hue=H='t*${(1 + a * 3).toFixed(1)}'`),
  T('breathe', 'Breathing Colour', 'Motion', (a) => `hue=s='1+${(0.6 * a).toFixed(2)}*sin(t*3)'`),
  T('glitchflash', 'Glitch Flash', 'Motion', () => `hue=H='if(lt(mod(t\\,0.9)\\,0.06)\\,PI\\,0)':s='if(lt(mod(t\\,0.9)\\,0.06)\\,2.5\\,1)'`),
  T('echo', 'Echo Trails', 'Motion', (a) => `tmix=frames=${Math.max(2, Math.round(2 + a * 6))}`),
  T('ghost', 'Ghost Trails', 'Motion', (a) => `lagfun=decay=${(0.85 + a * 0.12).toFixed(3)}`),
  T('stopmotion', 'Stop Motion (8 fps)', 'Motion', () => 'fps=8,fps=30'),
  T('choppy', 'Choppy (12 fps)', 'Motion', () => 'fps=12,fps=30'),
  T('reverse', 'Reverse', 'Motion', () => 'reverse'),
  T('boomerang', 'Boomerang', 'Motion', () => '{in}split[{u}a][{u}b];[{u}b]reverse[{u}c];[{u}a][{u}c]concat=n=2:v=1:a=0{out}'),
  T('shake', 'Camera Shake', 'Camera', (a) => { const k = (0.012 * a).toFixed(4); return `crop=iw*0.94:ih*0.94:x='(iw-ow)/2+sin(t*27)*iw*${k}+sin(t*13)*iw*${k}':y='(ih-oh)/2+cos(t*23)*ih*${k}'`; }),
  T('handheld', 'Handheld Drift', 'Camera', (a) => { const k = (0.01 * a).toFixed(4); return `crop=iw*0.95:ih*0.95:x='(iw-ow)/2+sin(t*1.3)*iw*${k}':y='(ih-oh)/2+sin(t*1.7)*ih*${k}'`; }),
  T('zoomin', 'Slow Zoom In', 'Camera', (a) => `scale=w='trunc(iw*(1+${(0.25 * a).toFixed(3)}*min(t/6\\,1))/2)*2':h=-2:eval=frame,crop={W}:{H}`),
  T('zoomout', 'Slow Zoom Out', 'Camera', (a) => `scale=w='trunc(iw*(1+${(0.25 * a).toFixed(3)}*max(1-t/6\\,0))/2)*2':h=-2:eval=frame,crop={W}:{H}`),
  T('zoompulse', 'Zoom Pulse (beat)', 'Camera', (a) => `scale=w='trunc(iw*(1+${(0.06 * a).toFixed(3)}*pow(abs(sin(t*PI*2))\\,6))/2)*2':h=-2:eval=frame,crop={W}:{H}`),
  T('panright', 'Pan Right', 'Camera', () => `crop=iw*0.8:ih*0.8:x='(iw-ow)*min(t/6\\,1)':y=(ih-oh)/2`),
  T('panleft', 'Pan Left', 'Camera', () => `crop=iw*0.8:ih*0.8:x='(iw-ow)*(1-min(t/6\\,1))':y=(ih-oh)/2`),
  T('tiltup', 'Tilt Up', 'Camera', () => `crop=iw*0.8:ih*0.8:x=(iw-ow)/2:y='(ih-oh)*(1-min(t/6\\,1))'`),
];

export const EFFECTS = [...COLOR, ...SPATIAL, ...TIME];
export const FX_CATS = [...new Set(EFFECTS.map((e) => e.cat))];
export const fxById = (id) => EFFECTS.find((e) => e.id === id) || null;

// One colour transform for a list of effects (used inside the grade LUT)
export function fxColorFn(list) {
  const fs = (list || []).map((x) => ({ e: fxById(x.id), a: x.amt ?? 1 })).filter((x) => x.e && x.e.kind === 'color' && x.a > 0 && x.on !== false);
  if (!fs.length) return null;
  return (r, g, b) => fs.reduce((c, x) => x.e.color(c[0], c[1], c[2], x.a), [r, g, b]);
}

// ffmpeg filters for the spatial + time effects of a list (colour effects go into the LUT)
const RESIZES = new Set(['pixelate', 'dither', 'kaleido', 'border-white', 'border-black', 'polaroidframe', 'zoomcrop', 'splitscreen', 'grid4', 'shake', 'handheld', 'panright', 'panleft', 'tiltup', 'crt', 'fisheye', 'pincushion']);
const NORM = 'scale={W}:{H},setsar=1';
export function fxFilters(list, { video = true } = {}) {
  return (list || []).map((x) => ({ e: fxById(x.id), a: x.amt ?? 1, on: x.on })).filter((x) => x.e && x.on !== false && x.e.kind !== 'color' && (video || x.e.kind !== 'time'))
    .map((x) => {
      const f = x.e.ff(x.a);
      if (!RESIZES.has(x.e.id)) return f;
      return f.includes('{out}') ? f.replace('{out}', `[{u}z];[{u}z]${NORM}{out}`) : f + ',' + NORM;
    });
}

// CSS approximation (live video monitor in the Timeline, where pixels can't be read)
export function fxCss(list) {
  return (list || []).map((x) => ({ e: fxById(x.id), a: x.amt ?? 1 })).filter((x) => x.e && x.e.css && x.on !== false).map((x) => x.e.css(x.a)).join(' ');
}

// Apply a list of effects to ImageData for previews / photo export. Colour effects run per pixel through a
// small LUT (fast); spatial effects draw on a canvas. Time effects are skipped (video only).
export function applyFx(img, list) {
  const items = (list || []).filter((x) => x.on !== false).map((x) => ({ e: fxById(x.id), a: x.amt ?? 1 })).filter((x) => x.e && x.a > 0);
  if (!items.length) return img;
  const W = img.width, H = img.height;
  const colorFn = fxColorFn(list);
  if (colorFn) {
    const N = 33, n = N - 1, lut = new Float32Array(N * N * N * 3); let i = 0;
    for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) { const o = colorFn(r / n, g / n, b / n); lut[i++] = o[0]; lut[i++] = o[1]; lut[i++] = o[2]; }
    const px = img.data, s2 = N * N;
    for (let p = 0; p < px.length; p += 4) {
      const r = px[p] / 255 * n, g = px[p + 1] / 255 * n, b = px[p + 2] / 255 * n;
      const r0 = r | 0, g0 = g | 0, b0 = b | 0, r1 = Math.min(n, r0 + 1), g1 = Math.min(n, g0 + 1), b1 = Math.min(n, b0 + 1);
      const fr = r - r0, fg = g - g0, fb = b - b0;
      for (let c = 0; c < 3; c++) {
        const v = (x, y, z) => lut[(z * s2 + y * N + x) * 3 + c];
        const c0 = (v(r0, g0, b0) * (1 - fr) + v(r1, g0, b0) * fr) * (1 - fg) + (v(r0, g1, b0) * (1 - fr) + v(r1, g1, b0) * fr) * fg;
        const c1 = (v(r0, g0, b1) * (1 - fr) + v(r1, g0, b1) * fr) * (1 - fg) + (v(r0, g1, b1) * (1 - fr) + v(r1, g1, b1) * fr) * fg;
        px[p + c] = (c0 * (1 - fb) + c1 * fb) * 255 + 0.5;
      }
    }
  }
  const sp = items.filter((x) => x.e.kind === 'spatial' && x.e.preview);
  if (!sp.length) return img;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.putImageData(img, 0, 0);
  for (const x of sp) {
    const before = copyCanvas(cv);
    try { x.e.preview(ctx, W, H, x.a, before); } catch (e) { console.error('fx', x.e.id, e); }
  }
  return ctx.getImageData(0, 0, W, H);
}

export const FX_COUNT = EFFECTS.length;
