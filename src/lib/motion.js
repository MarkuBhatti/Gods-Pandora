// Pandora Motion — a small, deterministic motion-graphics engine on <canvas>.
// Every template is a pure function of time, so the live preview and the frame-by-frame render match exactly.
//   draw(ctx, W, H, t, d, p)  t = seconds into the scene, d = scene length, p = props
// props: { t1, t2, t3, data, font, c1 (bg), c2 (bg 2), accent, ink (text), logo (Image|null) }

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const E = {
  out: (x) => 1 - Math.pow(1 - clamp(x), 3),
  in: (x) => Math.pow(clamp(x), 3),
  inOut: (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  back: (x) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  elastic: (x) => { x = clamp(x); if (x === 0 || x === 1) return x; return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1; },
};
const seg = (t, a, b) => clamp((t - a) / (b - a)); // 0→1 between a and b
const outro = (t, d, len = 0.45) => 1 - E.in(seg(t, d - len, d)); // fades the whole scene at the end
const rnd = (s) => { let x = s >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); };
function font(ctx, p, px, weight = 800, italic = false) { ctx.font = `${italic ? 'italic ' : ''}${weight} ${Math.max(4, px)}px "${p.font || 'Segoe UI'}", "Segoe UI", Arial, sans-serif`; }
function text(ctx, s, x, y, { color, align = 'center', alpha = 1, shadow = 0 } = {}) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = shadow; ctx.shadowOffsetY = shadow / 4; }
  ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.restore();
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
const U = (W, H) => Math.min(W, H); // unit size, so 9:16 and 16:9 both look right
const words = (s) => String(s || '').split(/\s+/).filter(Boolean);

/* ───────── backgrounds ───────── */
export const BACKGROUNDS = [['gradient', 'Gradient'], ['solid', 'Solid'], ['blobs', 'Liquid blobs'], ['stars', 'Starfield'], ['grid', 'Tech grid'], ['rays', 'Light rays'], ['noise', 'Film'], ['transparent', 'Transparent (overlay)']];
export function drawBg(ctx, W, H, T, p, style) {
  if (style === 'transparent') { ctx.clearRect(0, 0, W, H); return; }
  if (style === 'solid') { ctx.fillStyle = p.c1; ctx.fillRect(0, 0, W, H); return; }
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, p.c1); g.addColorStop(1, p.c2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (style === 'blobs') {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
    for (let i = 0; i < 4; i++) { const x = W * (0.5 + 0.38 * Math.sin(T * 0.35 + i * 1.7)), y = H * (0.5 + 0.38 * Math.cos(T * 0.28 + i * 2.3)); const r = U(W, H) * (0.45 + 0.1 * Math.sin(T + i)); const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, i % 2 ? p.accent : p.c2); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  } else if (style === 'stars') {
    const r = rnd(7); ctx.fillStyle = '#fff';
    for (let i = 0; i < 220; i++) { const z = ((r() + T * 0.08 * (0.3 + r())) % 1); const ang = r() * Math.PI * 2; const dist = Math.pow(z, 2) * Math.hypot(W, H) * 0.6; ctx.globalAlpha = z; const s = 0.5 + z * 2.5; ctx.fillRect(W / 2 + Math.cos(ang) * dist, H / 2 + Math.sin(ang) * dist, s, s); }
    ctx.globalAlpha = 1;
  } else if (style === 'grid') {
    ctx.save(); ctx.strokeStyle = p.accent; ctx.globalAlpha = 0.18; ctx.lineWidth = 1; const st = U(W, H) / 12; const off = (T * st * 0.5) % st;
    for (let x = -st; x < W + st; x += st) { ctx.beginPath(); ctx.moveTo(x + off, 0); ctx.lineTo(x + off, H); ctx.stroke(); }
    for (let y = -st; y < H + st; y += st) { ctx.beginPath(); ctx.moveTo(0, y + off); ctx.lineTo(W, y + off); ctx.stroke(); }
    ctx.restore();
  } else if (style === 'rays') {
    ctx.save(); ctx.translate(W / 2, H * 0.55); ctx.rotate(T * 0.12); ctx.globalAlpha = 0.12; ctx.fillStyle = p.accent;
    for (let i = 0; i < 16; i++) { ctx.rotate((Math.PI * 2) / 16); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.hypot(W, H), -U(W, H) * 0.09); ctx.lineTo(Math.hypot(W, H), U(W, H) * 0.09); ctx.fill(); }
    ctx.restore();
  } else if (style === 'noise') {
    const r = rnd(Math.floor(T * 24) + 1); ctx.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 900; i++) ctx.fillRect(r() * W, r() * H, 2, 2);
    const vg = ctx.createRadialGradient(W / 2, H / 2, U(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) / 2); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
}

/* ───────── templates ───────── */
const T = [];
const def = (id, name, cat, dur, fields, draw) => T.push({ id, name, cat, dur, fields, draw });

// Kinetic typography
def('pop-words', 'Pop Words', 'Kinetic type', 4, ['t1'], (c, W, H, t, d, p) => {
  const ws = words(p.t1); const u = U(W, H); const px = u * (ws.length > 6 ? 0.075 : 0.11); font(c, p, px, 900);
  const lines = []; let line = []; for (const w of ws) { const test = [...line, w].join(' '); if (c.measureText(test).width > W * 0.85 && line.length) { lines.push(line); line = [w]; } else line.push(w); } lines.push(line);
  let k = 0; const per = Math.min(0.35, (d * 0.55) / Math.max(1, ws.length)); const a = outro(t, d);
  lines.forEach((ln, li) => {
    const full = c.measureText(ln.join(' ')).width; let x = W / 2 - full / 2; const y = H / 2 + (li - (lines.length - 1) / 2) * px * 1.15;
    for (const w of ln) { const ww = c.measureText(w).width; const s = E.back(seg(t, k * per, k * per + 0.35)); if (s > 0) { c.save(); c.translate(x + ww / 2, y); c.scale(s, s); text(c, w, 0, 0, { color: k % 3 === 2 ? p.accent : p.ink, alpha: a, shadow: px * 0.15 }); c.restore(); } x += ww + c.measureText(' ').width; k++; }
  });
});
def('typewriter', 'Typewriter', 'Kinetic type', 4, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const s = String(p.t1 || ''); const n = Math.floor(seg(t, 0.2, d * 0.6) * s.length); const a = outro(t, d);
  font(c, p, u * 0.075, 700); const shown = s.slice(0, n); const w = c.measureText(s).width;
  text(c, shown, W / 2 - w / 2, H / 2, { color: p.ink, align: 'left', alpha: a });
  if (Math.floor(t * 2.2) % 2 === 0 || n < s.length) { c.fillStyle = p.accent; c.globalAlpha = a; c.fillRect(W / 2 - w / 2 + c.measureText(shown).width + 4, H / 2 - u * 0.04, u * 0.012, u * 0.08); c.globalAlpha = 1; }
  if (p.t2) { font(c, p, u * 0.035, 400); text(c, p.t2, W / 2, H / 2 + u * 0.1, { color: p.ink, alpha: a * E.out(seg(t, d * 0.6, d * 0.75)) }); }
});
def('slide-stack', 'Slide Stack', 'Kinetic type', 4, ['t1', 't2', 't3'], (c, W, H, t, d, p) => {
  const u = U(W, H); const ls = [p.t1, p.t2, p.t3].filter(Boolean); const a = outro(t, d);
  ls.forEach((s, i) => { const k = E.out(seg(t, 0.15 + i * 0.25, 0.75 + i * 0.25)); const px = u * (i === 0 ? 0.1 : 0.065); font(c, p, px, i === 0 ? 900 : 700); const y = H / 2 + (i - (ls.length - 1) / 2) * u * 0.13; const dir = i % 2 ? 1 : -1;
    c.save(); c.beginPath(); c.rect(0, y - px * 0.7, W, px * 1.4); c.clip(); text(c, String(s).toUpperCase(), W / 2 + dir * (1 - k) * W * 0.6, y, { color: i === 0 ? p.ink : p.accent, alpha: a }); c.restore(); });
});
def('wave-text', 'Wave Letters', 'Kinetic type', 4, ['t1'], (c, W, H, t, d, p) => {
  const u = U(W, H); const s = String(p.t1 || ''); const px = u * Math.min(0.12, 1.4 / Math.max(6, s.length)); font(c, p, px, 900); const a = outro(t, d);
  const total = c.measureText(s).width; let x = W / 2 - total / 2;
  [...s].forEach((ch, i) => { const cw = c.measureText(ch).width; const k = E.back(seg(t, i * 0.04, i * 0.04 + 0.5)); const y = H / 2 + Math.sin(t * 4 + i * 0.5) * px * 0.12 + (1 - k) * px; text(c, ch, x + cw / 2, y, { color: i % 2 ? p.accent : p.ink, alpha: a * k }); x += cw; });
});
def('glitch', 'Glitch Title', 'Kinetic type', 3.5, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const px = u * 0.12; font(c, p, px, 900); const a = outro(t, d) * E.out(seg(t, 0, 0.2)); const r = rnd(Math.floor(t * 18) + 3);
  const g = (t < 0.8 || (t % 1.3) < 0.12) ? 1 : 0; const s = String(p.t1 || '').toUpperCase();
  c.save(); c.globalCompositeOperation = 'lighter';
  text(c, s, W / 2 - g * r() * px * 0.15, H / 2, { color: '#ff0040', alpha: a }); text(c, s, W / 2 + g * r() * px * 0.15, H / 2 + g * 3, { color: '#00e5ff', alpha: a }); c.restore();
  text(c, s, W / 2, H / 2, { color: p.ink, alpha: a * 0.85 });
  if (g) for (let i = 0; i < 6; i++) { const y = H / 2 + (r() - 0.5) * px * 1.2; c.drawImage(c.canvas, 0, y, W, 6 + r() * 14, (r() - 0.5) * px * 0.4, y, W, 6 + r() * 14); }
  if (p.t2) { font(c, p, u * 0.035, 600); text(c, p.t2, W / 2, H / 2 + px * 0.85, { color: p.accent, alpha: a * E.out(seg(t, 0.8, 1.3)) }); }
});
def('mask-reveal', 'Mask Reveal', 'Kinetic type', 4, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const px = u * 0.11; font(c, p, px, 900); const s = String(p.t1 || '').toUpperCase(); const w = c.measureText(s).width; const a = outro(t, d);
  const k = E.inOut(seg(t, 0.2, 1.1)); const bx = W / 2 - w / 2 - 20;
  c.fillStyle = p.accent; const barX = bx + (w + 40) * (k < 0.5 ? 0 : (k - 0.5) * 2); const barW = (w + 40) * (k < 0.5 ? k * 2 : 1 - (k - 0.5) * 2);
  if (k >= 0.5) { c.save(); c.beginPath(); c.rect(bx, 0, (w + 40), H); c.clip(); text(c, s, W / 2, H / 2, { color: p.ink, alpha: a }); c.restore(); }
  c.globalAlpha = a; c.fillRect(barX, H / 2 - px * 0.62, barW, px * 1.24); c.globalAlpha = 1;
  if (p.t2) { font(c, p, u * 0.04, 500); text(c, p.t2, W / 2, H / 2 + px * 0.95, { color: p.ink, alpha: a * E.out(seg(t, 1.2, 1.7)) }); }
});
def('zoom-through', 'Zoom Through', 'Kinetic type', 3, ['t1'], (c, W, H, t, d, p) => {
  const u = U(W, H); const k = E.out(seg(t, 0, 0.9)); const s = 6 - 5 * k; const a = Math.min(1, k * 2) * outro(t, d, 0.6); const end = E.in(seg(t, d - 0.6, d));
  font(c, p, u * 0.12, 900); c.save(); c.translate(W / 2, H / 2); c.scale(s * (1 + end * 4), s * (1 + end * 4)); text(c, String(p.t1 || '').toUpperCase(), 0, 0, { color: p.ink, alpha: a, shadow: 20 }); c.restore();
});
def('split-title', 'Split Title', 'Kinetic type', 4, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const k = E.out(seg(t, 0.3, 1.1)); const a = outro(t, d); const lw = W * 0.5 * E.inOut(seg(t, 0, 0.5));
  c.fillStyle = p.accent; c.globalAlpha = a; c.fillRect(W / 2 - lw, H / 2 - 2, lw * 2, 4); c.globalAlpha = 1;
  font(c, p, u * 0.09, 900); c.save(); c.beginPath(); c.rect(0, 0, W, H / 2 - 2); c.clip(); text(c, String(p.t1 || '').toUpperCase(), W / 2, H / 2 - u * 0.06 + (1 - k) * u * 0.12, { color: p.ink, alpha: a }); c.restore();
  font(c, p, u * 0.04, 500); c.save(); c.beginPath(); c.rect(0, H / 2 + 2, W, H); c.clip(); text(c, p.t2 || '', W / 2, H / 2 + u * 0.05 - (1 - k) * u * 0.1, { color: p.ink, alpha: a }); c.restore();
});
def('marker', 'Highlighter', 'Kinetic type', 4, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const px = u * 0.085; font(c, p, px, 800); const a = outro(t, d); const s = String(p.t1 || ''); const w = c.measureText(s).width;
  const k = E.inOut(seg(t, 0.5, 1.2)); c.fillStyle = p.accent; c.globalAlpha = 0.85 * a; c.fillRect(W / 2 - w / 2 - 10, H / 2 - px * 0.15, (w + 20) * k, px * 0.55); c.globalAlpha = 1;
  text(c, s, W / 2, H / 2, { color: p.ink, alpha: a * E.out(seg(t, 0, 0.4)) });
  if (p.t2) { font(c, p, u * 0.038, 500); text(c, p.t2, W / 2, H / 2 + px * 0.95, { color: p.ink, alpha: a * E.out(seg(t, 1.2, 1.6)) }); }
});
def('rotate-words', 'Rotating Words', 'Kinetic type', 5, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const ws = String(p.t2 || 'faster, smarter, better').split(',').map((x) => x.trim()).filter(Boolean); const a = outro(t, d);
  font(c, p, u * 0.075, 500); const pre = String(p.t1 || 'Make it'); const pw = c.measureText(pre + ' ').width;
  const per = (d - 0.5) / ws.length; const i = Math.min(ws.length - 1, Math.floor(t / per)); const lt = t - i * per;
  font(c, p, u * 0.075, 900); const ww = Math.max(...ws.map((w) => c.measureText(w).width)); const x0 = W / 2 - (pw + ww) / 2;
  font(c, p, u * 0.075, 500); text(c, pre, x0, H / 2, { color: p.ink, align: 'left', alpha: a });
  font(c, p, u * 0.075, 900); const k = E.back(seg(lt, 0, 0.35)), ko = E.in(seg(lt, per - 0.25, per));
  c.save(); c.beginPath(); c.rect(x0 + pw - 5, H / 2 - u * 0.06, ww + 20, u * 0.12); c.clip();
  text(c, ws[i], x0 + pw, H / 2 + (1 - k) * u * 0.1 - (i < ws.length - 1 ? ko * u * 0.1 : 0), { color: p.accent, align: 'left', alpha: a }); c.restore();
});
def('countdown', 'Countdown', 'Kinetic type', 3.6, ['t1'], (c, W, H, t, d, p) => {
  const u = U(W, H); const step = (d / 3.6) * 1.2; const n = 3 - Math.floor(t / step); const lt = (t % step) / step;
  if (n < 1) { font(c, p, u * 0.11, 900); text(c, String(p.t1 || 'GO!').toUpperCase(), W / 2, H / 2, { color: p.accent, alpha: E.out(lt * 3) }); return; }
  c.strokeStyle = p.accent; c.lineWidth = u * 0.015; c.beginPath(); c.arc(W / 2, H / 2, u * 0.22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lt); c.stroke();
  font(c, p, u * 0.22 * (1.2 - 0.2 * E.out(lt * 2)), 900); text(c, String(n), W / 2, H / 2, { color: p.ink, alpha: 1 - E.in(seg(lt, 0.8, 1)) });
});
def('ticker', 'Number Ticker', 'Data', 4, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const target = parseFloat(String(p.t1 || '1000').replace(/[^\d.]/g, '')) || 0; const suffix = String(p.t1 || '').replace(/[\d.,\s]/g, ''); const a = outro(t, d);
  const v = target * E.out(seg(t, 0.2, d * 0.65)); const shown = (target % 1 ? v.toFixed(1) : Math.round(v).toLocaleString()) + suffix;
  font(c, p, u * 0.17, 900); text(c, shown, W / 2, H / 2 - u * 0.03, { color: p.accent, alpha: a, shadow: 20 });
  font(c, p, u * 0.045, 600); text(c, String(p.t2 || 'happy customers').toUpperCase(), W / 2, H / 2 + u * 0.12, { color: p.ink, alpha: a * E.out(seg(t, 0.6, 1.1)) });
});
def('quote', 'Quote Card', 'Kinetic type', 5, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); font(c, p, u * 0.3, 900); text(c, '“', W / 2, H / 2 - u * 0.24, { color: p.accent, alpha: a * E.out(seg(t, 0, 0.5)) });
  font(c, p, u * 0.055, 500, true); const ws = words(p.t1); const lines = []; let line = '';
  for (const w of ws) { const tt = line ? line + ' ' + w : w; if (c.measureText(tt).width > W * 0.78 && line) { lines.push(line); line = w; } else line = tt; } lines.push(line);
  lines.forEach((l, i) => text(c, l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * u * 0.075, { color: p.ink, alpha: a * E.out(seg(t, 0.3 + i * 0.2, 0.9 + i * 0.2)) }));
  if (p.t2) { font(c, p, u * 0.035, 700); text(c, '— ' + p.t2, W / 2, H / 2 + (lines.length / 2 + 0.9) * u * 0.075, { color: p.accent, alpha: a * E.out(seg(t, 1.2, 1.7)) }); }
});
// Lower thirds
def('lt-bar', 'Lower Third · Bar', 'Lower thirds', 5, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const x = W * 0.06, y = H * 0.78; const k = E.out(seg(t, 0, 0.5)), k2 = E.out(seg(t, 0.3, 0.8));
  font(c, p, u * 0.05, 800); const w1 = c.measureText(p.t1 || '').width; font(c, p, u * 0.032, 500); const w2 = c.measureText(p.t2 || '').width; const bw = Math.max(w1, w2) + u * 0.08;
  c.globalAlpha = a; c.fillStyle = p.accent; c.fillRect(x, y - u * 0.05, u * 0.012, u * 0.13 * k); c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x + u * 0.02, y - u * 0.05, bw * k2, u * 0.13); c.globalAlpha = 1;
  c.save(); c.beginPath(); c.rect(x + u * 0.02, y - u * 0.05, bw * k2, u * 0.13); c.clip();
  font(c, p, u * 0.05, 800); text(c, p.t1 || '', x + u * 0.05, y - u * 0.005, { color: p.ink, align: 'left', alpha: a });
  font(c, p, u * 0.032, 500); text(c, p.t2 || '', x + u * 0.05, y + u * 0.05, { color: p.accent, align: 'left', alpha: a }); c.restore();
});
def('lt-modern', 'Lower Third · Modern', 'Lower thirds', 5, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const x = W * 0.07, y = H * 0.8; const k = E.inOut(seg(t, 0, 0.6));
  c.strokeStyle = p.accent; c.lineWidth = u * 0.005; c.globalAlpha = a; c.beginPath(); c.moveTo(x, y); c.lineTo(x + W * 0.32 * k, y); c.stroke(); c.globalAlpha = 1;
  c.save(); c.beginPath(); c.rect(x, y - u * 0.1, W, u * 0.1); c.clip(); font(c, p, u * 0.055, 800); text(c, p.t1 || '', x, y - u * 0.04 + (1 - E.out(seg(t, 0.3, 0.8))) * u * 0.08, { color: p.ink, align: 'left', alpha: a }); c.restore();
  c.save(); c.beginPath(); c.rect(x, y, W, u * 0.08); c.clip(); font(c, p, u * 0.03, 500); text(c, String(p.t2 || '').toUpperCase(), x, y + u * 0.035 - (1 - E.out(seg(t, 0.45, 0.95))) * u * 0.06, { color: p.ink, align: 'left', alpha: a * 0.85 }); c.restore();
});
def('lt-box', 'Lower Third · Box', 'Lower thirds', 5, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const k = E.back(seg(t, 0, 0.5)); font(c, p, u * 0.045, 800); const w = Math.max(c.measureText(p.t1 || '').width, u * 0.3) + u * 0.08;
  c.save(); c.translate(W * 0.06, H * 0.82); c.scale(1, k); c.globalAlpha = a; c.fillStyle = p.accent; rr(c, 0, -u * 0.05, w, u * 0.075, u * 0.012); c.fill(); c.fillStyle = 'rgba(255,255,255,.95)'; rr(c, u * 0.02, u * 0.03, w * 0.8, u * 0.05, u * 0.01); c.fill(); c.restore();
  font(c, p, u * 0.045, 800); text(c, p.t1 || '', W * 0.06 + u * 0.04, H * 0.82 - u * 0.012, { color: '#fff', align: 'left', alpha: a * E.out(seg(t, 0.3, 0.6)) });
  font(c, p, u * 0.027, 600); text(c, p.t2 || '', W * 0.06 + u * 0.05, H * 0.82 + u * 0.055, { color: '#111', align: 'left', alpha: a * E.out(seg(t, 0.4, 0.7)) });
});
// Logo / brand
def('logo-reveal', 'Logo Reveal', 'Logo & brand', 4, ['t1', 't2', 'logo'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const k = E.back(seg(t, 0.1, 0.9)); const sz = u * 0.32;
  c.save(); c.translate(W / 2, H / 2 - u * 0.05); c.scale(k, k); c.globalAlpha = a;
  c.shadowColor = p.accent; c.shadowBlur = u * 0.08 * (1 - seg(t, 0.8, 1.6));
  if (p.logo) { const r = Math.min(sz / p.logo.width, sz / p.logo.height); c.drawImage(p.logo, -p.logo.width * r / 2, -p.logo.height * r / 2, p.logo.width * r, p.logo.height * r); }
  else { c.fillStyle = p.accent; c.beginPath(); c.arc(0, 0, sz * 0.38, 0, 7); c.fill(); font(c, p, sz * 0.36, 900); text(c, String(p.t1 || 'P').trim().charAt(0).toUpperCase(), 0, sz * 0.02, { color: p.c1 }); }
  c.restore();
  // light sweep
  const sw = seg(t, 0.9, 1.6); if (sw > 0 && sw < 1) { c.save(); c.globalCompositeOperation = 'lighter'; const gx = W / 2 - sz + sw * sz * 2; const g = c.createLinearGradient(gx - 60, 0, gx + 60, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(W / 2 - sz, H / 2 - sz * 0.7, sz * 2, sz * 1.3); c.restore(); }
  font(c, p, u * 0.07, 900); text(c, String(p.t1 || '').toUpperCase(), W / 2, H / 2 + u * 0.2, { color: p.ink, alpha: a * E.out(seg(t, 0.8, 1.3)) });
  if (p.t2) { font(c, p, u * 0.032, 500); text(c, p.t2, W / 2, H / 2 + u * 0.27, { color: p.accent, alpha: a * E.out(seg(t, 1.1, 1.6)) }); }
});
def('particles', 'Particle Assemble', 'Logo & brand', 4.5, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const r = rnd(11); const k = E.inOut(seg(t, 0, 1.6));
  for (let i = 0; i < 160; i++) { const ang = r() * Math.PI * 2, dist = (0.4 + r()) * Math.hypot(W, H) * 0.6; const tx = W / 2 + (r() - 0.5) * u * 0.9, ty = H / 2 + (r() - 0.5) * u * 0.18; const x = tx + Math.cos(ang) * dist * (1 - k), y = ty + Math.sin(ang) * dist * (1 - k); c.globalAlpha = a * (1 - seg(t, 1.4, 2)) * 0.9; c.fillStyle = i % 3 ? p.accent : p.ink; c.beginPath(); c.arc(x, y, u * 0.005 * (1 + r()), 0, 7); c.fill(); }
  c.globalAlpha = 1; font(c, p, u * 0.11, 900); text(c, String(p.t1 || '').toUpperCase(), W / 2, H / 2, { color: p.ink, alpha: a * E.out(seg(t, 1.2, 1.8)), shadow: 20 });
  if (p.t2) { font(c, p, u * 0.035, 500); text(c, p.t2, W / 2, H / 2 + u * 0.1, { color: p.accent, alpha: a * E.out(seg(t, 1.6, 2.1)) }); }
});
def('circle-burst', 'Circle Burst', 'Logo & brand', 3.5, ['t1'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d);
  for (let i = 0; i < 4; i++) { const k = E.out(seg(t, i * 0.12, 0.8 + i * 0.12)); c.strokeStyle = i % 2 ? p.ink : p.accent; c.lineWidth = u * 0.02 * (1 - k) + 1; c.globalAlpha = a * (1 - k * 0.7); c.beginPath(); c.arc(W / 2, H / 2, u * 0.5 * k, 0, 7); c.stroke(); }
  c.globalAlpha = 1; const s = E.back(seg(t, 0.4, 0.9)); font(c, p, u * 0.11, 900); c.save(); c.translate(W / 2, H / 2); c.scale(s, s); text(c, String(p.t1 || '').toUpperCase(), 0, 0, { color: p.ink, alpha: a }); c.restore();
});
def('neon', 'Neon Sign', 'Logo & brand', 4, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const on = t < 0.6 ? (Math.sin(t * 60) > 0.3 ? 1 : 0.15) : (Math.sin(t * 40) > 0.97 ? 0.4 : 1);
  font(c, p, u * 0.12, 700); c.save(); c.globalAlpha = a * on; c.shadowColor = p.accent; c.shadowBlur = u * 0.06; text(c, String(p.t1 || ''), W / 2, H / 2, { color: p.accent }); c.shadowBlur = u * 0.02; text(c, String(p.t1 || ''), W / 2, H / 2, { color: '#fff' }); c.restore();
  if (p.t2) { font(c, p, u * 0.035, 500); text(c, p.t2, W / 2, H / 2 + u * 0.12, { color: p.ink, alpha: a * E.out(seg(t, 0.8, 1.2)) }); }
});
def('cinematic', 'Cinematic Title', 'Logo & brand', 5, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d, 1); const bar = H * 0.12 * E.inOut(seg(t, 0, 1));
  font(c, p, u * 0.075, 300); try { c.letterSpacing = `${u * 0.02 * (1 + seg(t, 0, d) * 0.6)}px`; } catch (_) { /* old canvas */ }
  text(c, String(p.t1 || '').toUpperCase(), W / 2, H / 2, { color: p.ink, alpha: a * E.inOut(seg(t, 0.5, 1.8)) }); try { c.letterSpacing = '0px'; } catch (_) { /* */ }
  if (p.t2) { font(c, p, u * 0.028, 400, true); text(c, p.t2, W / 2, H / 2 + u * 0.08, { color: p.accent, alpha: a * E.inOut(seg(t, 1.5, 2.5)) }); }
  c.fillStyle = '#000'; c.fillRect(0, 0, W, bar); c.fillRect(0, H - bar, W, bar);
});
// Shapes & energy
def('shape-burst', 'Shape Burst', 'Shapes', 3.5, ['t1'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const r = rnd(5);
  for (let i = 0; i < 26; i++) { const ang = r() * Math.PI * 2, sp = 0.3 + r() * 0.7; const k = E.out(seg(t, 0, 1.4)) * sp; const x = W / 2 + Math.cos(ang) * k * u * 0.7, y = H / 2 + Math.sin(ang) * k * u * 0.7; const s = u * 0.03 * (0.5 + r()) * (1 - seg(t, 1, 2.5)); c.save(); c.translate(x, y); c.rotate(t * 3 * (r() - 0.5)); c.globalAlpha = a; c.fillStyle = [p.accent, p.ink, p.c2][i % 3]; if (i % 3 === 0) c.fillRect(-s / 2, -s / 2, s, s); else if (i % 3 === 1) { c.beginPath(); c.arc(0, 0, s / 2, 0, 7); c.fill(); } else { c.beginPath(); c.moveTo(0, -s / 2); c.lineTo(s / 2, s / 2); c.lineTo(-s / 2, s / 2); c.fill(); } c.restore(); }
  const k2 = E.back(seg(t, 0.2, 0.7)); font(c, p, u * 0.12, 900); c.save(); c.translate(W / 2, H / 2); c.scale(k2, k2); text(c, String(p.t1 || '').toUpperCase(), 0, 0, { color: p.ink, alpha: a, shadow: 25 }); c.restore();
});
def('line-sweep', 'Line Sweep', 'Shapes', 3.5, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d);
  for (let i = 0; i < 7; i++) { const k = E.inOut(seg(t, i * 0.06, 0.6 + i * 0.06)); c.fillStyle = i % 2 ? p.accent : p.c2; c.globalAlpha = a * 0.9; c.fillRect(-W * 0.2 + k * W * 1.4 - W, (H / 7) * i, W, H / 7 + 1); }
  c.globalAlpha = 1; font(c, p, u * 0.1, 900); text(c, String(p.t1 || '').toUpperCase(), W / 2, H / 2, { color: p.ink, alpha: a * E.out(seg(t, 0.7, 1.1)), shadow: 20 });
  if (p.t2) { font(c, p, u * 0.04, 600); text(c, p.t2, W / 2, H / 2 + u * 0.1, { color: p.ink, alpha: a * E.out(seg(t, 0.9, 1.3)) }); }
});
def('confetti', 'Confetti Celebration', 'Shapes', 4, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const r = rnd(21); const cols = [p.accent, p.ink, '#ffd166', '#06d6a0', '#ef476f'];
  for (let i = 0; i < 140; i++) { const x0 = r() * W, sp = 0.4 + r(), ph = r() * 6; const y = -20 + ((t * sp * H * 0.35 + r() * H) % (H + 40)); c.save(); c.translate(x0 + Math.sin(t * 2 + ph) * 20, y); c.rotate(t * 4 * (r() - 0.5) + ph); c.scale(1, Math.sin(t * 6 + ph)); c.globalAlpha = a; c.fillStyle = cols[i % cols.length]; c.fillRect(-u * 0.007, -u * 0.012, u * 0.014, u * 0.024); c.restore(); }
  const k = E.elastic(seg(t, 0.1, 1.2)); font(c, p, u * 0.11, 900); c.save(); c.translate(W / 2, H / 2); c.scale(k, k); text(c, String(p.t1 || ''), 0, 0, { color: p.ink, alpha: a, shadow: 20 }); c.restore();
  if (p.t2) { font(c, p, u * 0.04, 600); text(c, p.t2, W / 2, H / 2 + u * 0.11, { color: p.accent, alpha: a * E.out(seg(t, 0.8, 1.2)) }); }
});
def('grid-pulse', 'Grid Pulse', 'Shapes', 4, ['t1'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const n = 9; const s = u / n;
  for (let i = 0; i < Math.ceil(W / s); i++) for (let j = 0; j < Math.ceil(H / s); j++) { const dd = Math.hypot(i * s + s / 2 - W / 2, j * s + s / 2 - H / 2) / u; const k = E.back(seg(t, dd * 0.6, dd * 0.6 + 0.4)) * (0.6 + 0.4 * Math.sin(t * 3 - dd * 6)); c.globalAlpha = a * 0.6; c.fillStyle = (i + j) % 2 ? p.accent : p.c2; const q = s * 0.4 * k; rr(c, i * s + s / 2 - q, j * s + s / 2 - q, q * 2, q * 2, q * 0.3); c.fill(); }
  c.globalAlpha = 1; font(c, p, u * 0.1, 900); text(c, String(p.t1 || '').toUpperCase(), W / 2, H / 2, { color: p.ink, alpha: a * E.out(seg(t, 0.8, 1.3)), shadow: 30 });
});
// Data
def('bar-chart', 'Bar Chart', 'Data', 5, ['t1', 'data'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const items = String(p.data || 'Jan:30, Feb:55, Mar:80, Apr:95').split(',').map((x) => { const [l, v] = x.split(':'); return { l: (l || '').trim(), v: parseFloat(v) || 0 }; }).filter((x) => x.l).slice(0, 8);
  font(c, p, u * 0.06, 800); text(c, p.t1 || '', W / 2, H * 0.15, { color: p.ink, alpha: a });
  const mx = Math.max(1, ...items.map((x) => x.v)); const cw = (W * 0.75) / items.length; const base = H * 0.82; const top = H * 0.28;
  items.forEach((x, i) => { const k = E.out(seg(t, 0.3 + i * 0.12, 1.2 + i * 0.12)); const h = (base - top) * (x.v / mx) * k; const bx = W * 0.125 + i * cw + cw * 0.15; c.globalAlpha = a; c.fillStyle = i === items.length - 1 ? p.accent : p.ink; rr(c, bx, base - h, cw * 0.7, h, u * 0.01); c.fill(); font(c, p, u * 0.03, 700); text(c, String(Math.round(x.v * k)), bx + cw * 0.35, base - h - u * 0.03, { color: p.ink, alpha: a * k }); font(c, p, u * 0.028, 500); text(c, x.l, bx + cw * 0.35, base + u * 0.035, { color: p.ink, alpha: a }); });
  c.globalAlpha = 1;
});
def('progress', 'Progress Bar', 'Data', 4, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const target = clamp((parseFloat(p.t2) || 75) / 100); const k = E.inOut(seg(t, 0.4, d * 0.7)) * target; const bw = W * 0.6, bh = u * 0.04, x = W / 2 - bw / 2, y = H / 2 + u * 0.05;
  font(c, p, u * 0.06, 800); text(c, p.t1 || '', W / 2, H / 2 - u * 0.06, { color: p.ink, alpha: a });
  c.globalAlpha = a; c.fillStyle = 'rgba(255,255,255,.15)'; rr(c, x, y, bw, bh, bh / 2); c.fill(); c.fillStyle = p.accent; rr(c, x, y, Math.max(bh, bw * k), bh, bh / 2); c.fill(); c.globalAlpha = 1;
  font(c, p, u * 0.04, 800); text(c, Math.round(k * 100) + '%', x + Math.max(bh, bw * k), y - u * 0.035, { color: p.accent, alpha: a });
});
// Social
def('subscribe', 'Subscribe Button', 'Social', 4, ['t1'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const k = E.back(seg(t, 0, 0.5)); const clicked = t > 1.6; const bw = u * 0.42, bh = u * 0.11; const x = W / 2 - bw / 2, y = H * 0.7 - bh / 2;
  c.save(); c.translate(W / 2, H * 0.7); c.scale(k * (t > 1.5 && t < 1.7 ? 0.92 : 1), k); c.translate(-W / 2, -H * 0.7); c.globalAlpha = a; c.fillStyle = clicked ? '#606060' : '#ff0033'; rr(c, x, y, bw, bh, u * 0.015); c.fill();
  font(c, p, u * 0.045, 800); text(c, clicked ? 'SUBSCRIBED' : String(p.t1 || 'SUBSCRIBE').toUpperCase(), W / 2, H * 0.7, { color: '#fff' }); c.restore();
  const bk = E.back(seg(t, 2, 2.4)); if (bk > 0) { c.save(); c.translate(x + bw + u * 0.08, H * 0.7); c.rotate(Math.sin(t * 20) * 0.3 * (1 - seg(t, 2.4, 3))); c.scale(bk, bk); c.globalAlpha = a; c.fillStyle = p.ink; c.beginPath(); c.arc(0, -u * 0.005, u * 0.03, Math.PI, 0); c.lineTo(u * 0.035, u * 0.025); c.lineTo(-u * 0.035, u * 0.025); c.fill(); c.beginPath(); c.arc(0, u * 0.033, u * 0.009, 0, 7); c.fill(); c.restore(); }
  const cx = W / 2 + u * 0.4 * (1 - E.inOut(seg(t, 0.6, 1.5))), cy = H * 0.7 + u * 0.3 * (1 - E.inOut(seg(t, 0.6, 1.5))) + u * 0.02;
  c.globalAlpha = a * (1 - seg(t, 2.2, 2.6)); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, cy + u * 0.06); c.lineTo(cx + u * 0.016, cy + u * 0.045); c.lineTo(cx + u * 0.04, cy + u * 0.045); c.closePath(); c.fill(); c.stroke(); c.globalAlpha = 1;
});
def('follow', 'Follow Card', 'Social', 4, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const k = E.back(seg(t, 0, 0.6)); const cw = u * 0.7, ch = u * 0.2;
  c.save(); c.translate(W / 2, H / 2); c.scale(k, k); c.globalAlpha = a; c.fillStyle = 'rgba(255,255,255,.95)'; rr(c, -cw / 2, -ch / 2, cw, ch, u * 0.03); c.fill();
  const g = c.createLinearGradient(-cw / 2, 0, -cw / 2 + ch, ch); g.addColorStop(0, p.accent); g.addColorStop(1, p.c2); c.fillStyle = g; c.beginPath(); c.arc(-cw / 2 + ch / 2 + u * 0.02, 0, ch * 0.32, 0, 7); c.fill();
  font(c, p, u * 0.045, 800); text(c, p.t1 || '@yourhandle', -cw / 2 + ch + u * 0.03, -u * 0.025, { color: '#111', align: 'left' }); font(c, p, u * 0.028, 500); text(c, p.t2 || 'Follow for more', -cw / 2 + ch + u * 0.03, u * 0.035, { color: '#555', align: 'left' }); c.restore();
});
def('end-card', 'End Screen', 'Social', 6, ['t1', 't2'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); font(c, p, u * 0.07, 900); text(c, p.t1 || 'THANKS FOR WATCHING', W / 2, H * 0.2, { color: p.ink, alpha: a * E.out(seg(t, 0, 0.5)) });
  const bw = Math.min(W * 0.36, u * 0.7), bh = bw * 9 / 16;
  [-1, 1].forEach((s, i) => { const k = E.back(seg(t, 0.3 + i * 0.15, 0.8 + i * 0.15)); c.save(); c.translate(W / 2 + s * (bw / 2 + u * 0.03), H * 0.55); c.scale(k, k); c.globalAlpha = a; c.strokeStyle = p.accent; c.lineWidth = u * 0.006; rr(c, -bw / 2, -bh / 2, bw, bh, u * 0.02); c.stroke(); c.fillStyle = 'rgba(255,255,255,.06)'; c.fill(); font(c, p, u * 0.03, 600); text(c, i ? (p.t2 || 'Best video') : 'Latest video', 0, 0, { color: p.ink }); c.restore(); });
});

// ── Your media (photos, products, app screens) — images preloaded into IMG by loadImages() ──
export const IMG = new Map(); // path → HTMLImageElement
export async function loadImages(paths) {
  await Promise.all([...new Set(paths.filter(Boolean))].filter((f) => !IMG.has(f)).map(async (f) => {
    try { const u = typeof window !== 'undefined' && window.api ? await window.api.dataUrl(f) : f; await new Promise((res) => { const i = new Image(); i.onload = () => { IMG.set(f, i); res(); }; i.onerror = res; i.src = u; }); } catch (_) { /* skip */ }
  }));
}
const cover = (c, im, x, y, w, h, z = 1, ox = 0, oy = 0) => { const s = Math.max(w / im.width, h / im.height) * z; const iw = im.width * s, ih = im.height * s; c.drawImage(im, x + (w - iw) / 2 + ox * w, y + (h - ih) / 2 + oy * h, iw, ih); };
const contain = (c, im, x, y, w, h) => { const s = Math.min(w / im.width, h / im.height); const iw = im.width * s, ih = im.height * s; c.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); return [x + (w - iw) / 2, y + (h - ih) / 2, iw, ih]; };
def('photo', 'Photo (Ken Burns)', 'Your media', 4, ['img', 't1', 't2'], (c, W, H, t, d, p) => {
  const im = IMG.get(p.img); const a = outro(t, d) * E.out(seg(t, 0, 0.4)); const u = U(W, H);
  if (im) { c.save(); c.globalAlpha = a; cover(c, im, 0, 0, W, H, 1.08 + 0.1 * (t / d), -0.02 + 0.04 * (t / d), 0); c.restore(); }
  const g = c.createLinearGradient(0, H * 0.55, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)'); c.fillStyle = g; c.globalAlpha = a; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
  if (p.t1) { font(c, p, u * 0.07, 900); text(c, p.t1, W * 0.06, H * 0.8, { color: '#fff', align: 'left', alpha: a * E.out(seg(t, 0.3, 0.8)), shadow: 12 }); }
  if (p.t2) { font(c, p, u * 0.035, 500); text(c, p.t2, W * 0.06, H * 0.8 + u * 0.075, { color: p.accent, align: 'left', alpha: a * E.out(seg(t, 0.6, 1.1)) }); }
});
def('product', 'Product Hero', 'Your media', 4.5, ['img', 't1', 't2'], (c, W, H, t, d, p) => {
  const im = IMG.get(p.img); const u = U(W, H); const a = outro(t, d); const k = E.back(seg(t, 0.1, 0.9)); const fl = Math.sin(t * 2) * u * 0.01;
  const port = H > W; const bx = port ? W * 0.1 : W * 0.06, by = port ? H * 0.12 : H * 0.14, bw = port ? W * 0.8 : W * 0.46, bh = port ? H * 0.46 : H * 0.72;
  c.save(); c.globalAlpha = a; c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(bx + bw / 2, by + bh * 0.98, bw * 0.32 * k, u * 0.02, 0, 0, 7); c.fill();
  if (im) { c.translate(bx + bw / 2, by + bh / 2 + fl); c.scale(k, k); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = u * 0.05; contain(c, im, -bw / 2, -bh / 2, bw, bh); } c.restore();
  const tx = port ? W / 2 : W * 0.58, al = port ? 'center' : 'left', ty = port ? H * 0.68 : H * 0.42;
  font(c, p, u * 0.08, 900); text(c, p.t1 || 'Product', tx, ty, { color: p.ink, align: al, alpha: a * E.out(seg(t, 0.4, 0.9)) });
  if (p.t2) { font(c, p, u * 0.04, 600); const w = c.measureText(p.t2).width + u * 0.06; const px0 = port ? W / 2 - w / 2 : tx; const kk = E.back(seg(t, 0.8, 1.3)); c.save(); c.globalAlpha = a; c.translate(px0 + w / 2, ty + u * 0.12); c.scale(kk, kk); c.fillStyle = p.accent; rr(c, -w / 2, -u * 0.04, w, u * 0.08, u * 0.04); c.fill(); text(c, p.t2, 0, 0, { color: p.c1 }); c.restore(); }
});
def('device', 'App Screen (device)', 'Your media', 5, ['img', 't1', 't2'], (c, W, H, t, d, p) => {
  const im = IMG.get(p.img); const u = U(W, H); const a = outro(t, d); const k = E.out(seg(t, 0, 0.9)); const port = H > W;
  const fw = port ? W * 0.88 : W * 0.58, fh = fw * 0.62, fx = (W - fw) / 2, fy = port ? H * 0.34 : H * 0.17 + (1 - k) * H * 0.3;
  c.save(); c.globalAlpha = a * k; c.translate(W / 2, fy + fh / 2); const tilt = (1 - k) * 0.35; c.transform(1, 0, -tilt * 0.3, 1, 0, 0); c.scale(0.9 + 0.1 * k + 0.03 * (t / d), 0.9 + 0.1 * k + 0.03 * (t / d)); c.translate(-W / 2, -(fy + fh / 2));
  c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = u * 0.08; c.shadowOffsetY = u * 0.03; c.fillStyle = '#16161e'; rr(c, fx - u * 0.012, fy - u * 0.04, fw + u * 0.024, fh + u * 0.052, u * 0.02); c.fill(); c.shadowColor = 'transparent';
  c.fillStyle = '#2a2a35'; [0, 1, 2].forEach((i) => { c.beginPath(); c.arc(fx + u * 0.015 + i * u * 0.022, fy - u * 0.02, u * 0.006, 0, 7); c.fill(); });
  c.save(); rr(c, fx, fy, fw, fh, u * 0.008); c.clip(); if (im) cover(c, im, fx, fy, fw, fh, 1 + 0.06 * (t / d), 0, -0.03 * (t / d)); else { c.fillStyle = p.c2; c.fillRect(fx, fy, fw, fh); } c.restore();
  const sweep = seg(t, 0.6, 1.6); if (sweep > 0 && sweep < 1) { c.save(); rr(c, fx, fy, fw, fh, u * 0.008); c.clip(); const gx = fx + fw * (sweep * 1.6 - 0.3); const g = c.createLinearGradient(gx - fw * 0.15, 0, gx + fw * 0.15, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(fx, fy, fw, fh); c.restore(); }
  c.restore();
  const ty = port ? H * 0.14 : H * 0.1; font(c, p, u * (port ? 0.075 : 0.06), 900); text(c, p.t1 || '', W / 2, ty, { color: p.ink, alpha: a * E.out(seg(t, 0.2, 0.7)) });
  if (p.t2) { font(c, p, u * 0.032, 500); text(c, p.t2, W / 2, port ? H * 0.88 : H * 0.92, { color: p.accent, alpha: a * E.out(seg(t, 0.7, 1.2)) }); }
});
def('collage', 'Media Collage', 'Your media', 4.5, ['img', 'img2', 'img3', 't1'], (c, W, H, t, d, p) => {
  const u = U(W, H); const a = outro(t, d); const ims = [p.img, p.img2, p.img3].map((f) => IMG.get(f)).filter(Boolean);
  const n = Math.max(1, ims.length); const cw = W * (n === 1 ? 0.6 : 0.3), ch = cw * 0.66;
  ims.forEach((im, i) => { const k = E.back(seg(t, 0.15 + i * 0.18, 0.75 + i * 0.18)); const x = W / 2 + (i - (n - 1) / 2) * cw * 1.08; const y = H * 0.5 + (i % 2 ? 1 : -1) * u * 0.03; const r = (i - (n - 1) / 2) * 0.06;
    c.save(); c.globalAlpha = a * Math.min(1, k * 1.5); c.translate(x, y); c.rotate(r * (1 - 0.3 * (t / d))); c.scale(k, k); c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = u * 0.04; c.fillStyle = '#fff'; c.fillRect(-cw / 2 - u * 0.008, -ch / 2 - u * 0.008, cw + u * 0.016, ch + u * 0.016); c.shadowColor = 'transparent'; c.save(); c.beginPath(); c.rect(-cw / 2, -ch / 2, cw, ch); c.clip(); cover(c, im, -cw / 2, -ch / 2, cw, ch, 1.05); c.restore(); c.restore(); });
  if (p.t1) { font(c, p, u * 0.065, 900); text(c, p.t1, W / 2, H * 0.14, { color: p.ink, alpha: a * E.out(seg(t, 0.5, 1)) }); }
});

// ── Code scenes: an AI writes the animation itself as canvas code (every frame is code, no video generation).
// The code runs in an isolated Web Worker on an OffscreenCanvas — it has no access to the app, files or network.
export const CODE_LAST = new Map(); // key → ImageBitmap (latest frame, used by the live preview)
let worker = null, reqId = 0; const waits = new Map();
function codeWorker() {
  if (worker) return worker;
  const src = `const cache=new Map();onmessage=(e)=>{const {id,code,W,H,t,d,p}=e.data;try{let f=cache.get(code);if(!f){f=new Function('ctx','W','H','t','d','p','"use strict";\\n'+code);cache.set(code,f);}
    const cv=new OffscreenCanvas(W,H);const ctx=cv.getContext('2d');f(ctx,W,H,t,d,p);const bmp=cv.transferToImageBitmap();postMessage({id,bmp},[bmp]);}catch(err){postMessage({id,error:String(err&&err.message||err)});}};
    self.fetch=undefined;self.XMLHttpRequest=undefined;self.WebSocket=undefined;self.importScripts=undefined;self.indexedDB=undefined;`;
  worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  worker.onmessage = (e) => { const w = waits.get(e.data.id); if (w) { waits.delete(e.data.id); w(e.data); } };
  return worker;
}
function runCode(code, W, H, t, d, p) {
  return new Promise((res) => { const id = ++reqId; const to = setTimeout(() => { waits.delete(id); res({ error: 'Code scene took too long (over 2 s per frame).' }); }, 2000); waits.set(id, (m) => { clearTimeout(to); res(m); }); codeWorker().postMessage({ id, code, W, H, t, d, p }); });
}
const plainLook = (p) => ({ c1: p.c1, c2: p.c2, accent: p.accent, ink: p.ink, font: p.font, t1: p.t1, t2: p.t2, t3: p.t3 });
// render code scenes needed for time T0 (current + previous during a transition); await before drawFrame when exporting
export async function prepareFrame(scenes, T0, W, H, look) {
  if (!scenes.some((s) => s.tpl === 'code')) return;
  const { i, t } = sceneAt(scenes, T0); const need = [[i, t]]; if (i > 0 && t < 0.4) need.push([i - 1, scenes[i - 1].dur]);
  for (const [k, tt] of need) { const sc = scenes[k]; if (sc.tpl !== 'code' || !sc.props?.code) continue;
    const m = await runCode(sc.props.code, W, H, tt, sc.dur, plainLook({ ...look, ...sc.props }));
    const key = sc.id + ':' + W; const old = CODE_LAST.get(key); if (m.bmp) { CODE_LAST.set(key, m.bmp); if (old && old !== m.bmp) old.close?.(); } else CODE_LAST.set(key + ':err', m.error); }
}
def('code', 'AI Code Scene', 'Your media', 5, ['code', 't1', 't2'], (c, W, H, t, d, p) => {
  const bmp = CODE_LAST.get(p._id + ':' + W); if (bmp) { c.drawImage(bmp, 0, 0, W, H); return; }
  const err = CODE_LAST.get(p._id + ':' + W + ':err'); const u = U(W, H); font(c, p, u * 0.03, 600);
  text(c, err ? '⚠ ' + String(err).slice(0, 80) : (p.code ? 'Rendering code scene…' : 'Describe this scene and press “Write with AI”'), W / 2, H / 2, { color: p.ink, alpha: 0.8 });
});
export const CODE_SYSTEM = `You are a world-class motion designer who animates in JavaScript on an HTML canvas. Write ONLY the body of a function
(ctx, W, H, t, d, p) that draws ONE frame of a scene at time t seconds (0..d). It must be a pure function of t (no state, no randomness
unless seeded from integers), draw the full frame including the background, use only the Canvas 2D API and Math, and finish quickly.
p has colours p.c1 (bg), p.c2 (bg2), p.accent, p.ink (text), p.font, and texts p.t1, p.t2, p.t3. Use easing (cubic, back, elastic), layered
shapes, gradients, masks (clip), kinetic typography, motion blur by drawing trails, and precise timing (intro 0–0.8 s, hold, outro last 0.5 s).
Scale everything by Math.min(W,H) so it works in 16:9 and 9:16. No external images, fonts, DOM, fetch or comments outside code. Output only code.`;

// ── Reference remake (Katana-style): analysis of a reference edit → the same structure rebuilt with your text and media ──
export const REMAKE_SYSTEM = (media) => `You rebuild the editing structure of a reference video as a motion-graphics storyboard for a different brand.
Keep the reference's rhythm (number of beats, timing, pacing), transitions, layout ideas and energy; replace its content with the user's brand, text and media.
Reply with ONLY JSON:
{"palette":{"c1":"#hex","c2":"#hex","accent":"#hex","ink":"#hex"},"bg":"gradient|solid|blobs|stars|grid|rays|noise","font":"Segoe UI|Arial Black|Impact|Bahnschrift|Georgia|Trebuchet MS|Verdana",
 "scenes":[{"tpl":"<template id>","dur":<seconds>,"t1":"","t2":"","t3":"","data":"","img":"<media id or empty>","img2":"","img3":"","transition":"fade|wipe|zoom|slide|cut","code_brief":"only for tpl=code: what to animate"}]}
Media you can place (use their ids exactly): ${media.length ? media.map((m, i) => `m${i + 1} = ${m.label}`).join('; ') : 'none'}.
Use photo/product/device/collage templates for media; use "code" for 1–2 signature moments that no template covers (describe them in code_brief).
Templates: ${T.map((x) => `${x.id} (${x.name}; ${x.fields.join('/')})`).join('; ')}.`;

export const TEMPLATES = T;
export const TPL_CATS = [...new Set(T.map((x) => x.cat))];
export const tplById = (id) => T.find((x) => x.id === id) || T[0];

export const PALETTES = [
  { id: 'midnight', name: 'Midnight Cyan', c1: '#060c12', c2: '#0d2b45', accent: '#00d4ff', ink: '#ffffff' },
  { id: 'sunset', name: 'Sunset', c1: '#2b0f3a', c2: '#ff5e62', accent: '#ffd166', ink: '#ffffff' },
  { id: 'gold', name: 'Luxury Gold', c1: '#0b0b0b', c2: '#2a2112', accent: '#d4af37', ink: '#f5ecd7' },
  { id: 'fresh', name: 'Fresh Mint', c1: '#e8fff6', c2: '#b8f2e6', accent: '#00a37a', ink: '#0a2e24' },
  { id: 'pop', name: 'Pop Pink', c1: '#ff2e63', c2: '#7b2cbf', accent: '#ffe74c', ink: '#ffffff' },
  { id: 'corporate', name: 'Corporate Blue', c1: '#0a1f44', c2: '#1d4ed8', accent: '#38bdf8', ink: '#ffffff' },
  { id: 'paper', name: 'Clean Paper', c1: '#fafafa', c2: '#e9e9ef', accent: '#ff4d2e', ink: '#141414' },
  { id: 'neon', name: 'Neon Night', c1: '#09001a', c2: '#2a0050', accent: '#ff00e5', ink: '#e9fbff' },
  { id: 'forest', name: 'Forest', c1: '#0b1f14', c2: '#1f4d2e', accent: '#a3e635', ink: '#f0fdf4' },
  { id: 'fire', name: 'Fire', c1: '#140400', c2: '#7a1500', accent: '#ff7a00', ink: '#fff4e6' },
];

/* scene list → frame at time T (with a short crossfade / wipe / zoom between scenes) */
export function sceneAt(scenes, T0) {
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) { const d = scenes[i].dur; if (T0 < acc + d || i === scenes.length - 1) return { i, t: Math.min(d, T0 - acc), start: acc }; acc += d; }
  return { i: 0, t: 0, start: 0 };
}
export const totalDur = (scenes) => scenes.reduce((s, x) => s + (+x.dur || 0), 0);
function drawScene(ctx, W, H, sc, t, globalT, p, bg) {
  drawBg(ctx, W, H, globalT, p, sc.bg || bg);
  const tp = tplById(sc.tpl);
  try { tp.draw(ctx, W, H, t, sc.dur, { ...p, ...sc.props, _id: sc.id }); } catch (e) { /* a bad template never stops the preview */ console.error(e); }
}
export function drawFrame(ctx, W, H, scenes, T0, look) {
  const p = { ...look }; ctx.save(); ctx.clearRect(0, 0, W, H);
  if (!scenes.length) { drawBg(ctx, W, H, T0, p, look.bg); ctx.restore(); return; }
  const { i, t } = sceneAt(scenes, T0); const sc = scenes[i];
  drawScene(ctx, W, H, sc, t, T0, p, look.bg);
  const tr = sc.transition || 'fade'; const TD = 0.4;
  if (i > 0 && t < TD && tr !== 'cut') {
    const prev = scenes[i - 1]; const k = E.inOut(t / TD);
    const off = document.createElement('canvas'); off.width = W; off.height = H; const oc = off.getContext('2d');
    drawScene(oc, W, H, prev, prev.dur, T0, p, look.bg);
    ctx.save();
    if (tr === 'fade') { ctx.globalAlpha = 1 - k; ctx.drawImage(off, 0, 0); }
    else if (tr === 'wipe') { ctx.beginPath(); ctx.rect(W * k, 0, W, H); ctx.clip(); ctx.drawImage(off, 0, 0); }
    else if (tr === 'slide') { ctx.drawImage(off, -W * k, 0); }
    else if (tr === 'zoom') { ctx.globalAlpha = 1 - k; ctx.translate(W / 2, H / 2); ctx.scale(1 + k * 0.6, 1 + k * 0.6); ctx.drawImage(off, -W / 2, -H / 2); }
    ctx.restore();
  }
  ctx.restore();
}

/* ── Auto Motion Design: brief → storyboard (built-in, works offline, no model needed) ── */
const MOODS = [
  { k: /luxur|premium|elegant|gold|jewel|fashion|perfume|watch/i, pal: 'gold', bg: 'noise', font: 'Georgia', seq: ['logo-reveal', 'cinematic', 'mask-reveal', 'end-card'] },
  { k: /tech|ai\b|software|app|startup|saas|crypto|code|cyber|future|robot/i, pal: 'neon', bg: 'grid', font: 'Bahnschrift', seq: ['glitch', 'rotate-words', 'ticker', 'particles'] },
  { k: /corporate|business|report|quarter|finance|bank|growth|kpi|sales|revenue/i, pal: 'corporate', bg: 'gradient', font: 'Segoe UI', seq: ['split-title', 'bar-chart', 'ticker', 'lt-modern'] },
  { k: /party|birthday|celebrat|wedding|eid|congrat|launch party|anniversary/i, pal: 'pop', bg: 'blobs', font: 'Segoe UI', seq: ['confetti', 'pop-words', 'circle-burst', 'quote'] },
  { k: /youtube|subscribe|channel|vlog|shorts|tiktok|reel|instagram|follow/i, pal: 'pop', bg: 'blobs', font: 'Arial Black', seq: ['zoom-through', 'pop-words', 'follow', 'subscribe'] },
  { k: /film|movie|trailer|cinematic|story|documentary|drama|horror/i, pal: 'fire', bg: 'noise', font: 'Georgia', seq: ['cinematic', 'typewriter', 'mask-reveal', 'cinematic'] },
  { k: /nature|eco|green|organic|plant|health|wellness|yoga|food|fresh/i, pal: 'forest', bg: 'blobs', font: 'Segoe UI', seq: ['slide-stack', 'marker', 'quote', 'logo-reveal'] },
  { k: /sport|gym|fitness|energy|hype|game|gaming|esport|fast/i, pal: 'fire', bg: 'rays', font: 'Impact', seq: ['shape-burst', 'zoom-through', 'countdown', 'line-sweep'] },
];
export function autoStoryboard(brief, seed = 1) {
  const b = String(brief || '').trim(); const r = rnd(seed * 7919 + b.length);
  const mood = MOODS.find((m) => m.k.test(b)) || { pal: ['midnight', 'sunset', 'paper'][Math.floor(r() * 3)], bg: ['gradient', 'blobs', 'rays'][Math.floor(r() * 3)], font: 'Segoe UI', seq: ['pop-words', 'slide-stack', 'marker', 'logo-reveal'] };
  const quoted = [...b.matchAll(/["“']([^"”']{2,40})["”']/g)].map((m) => m[1]);
  const caps = (b.match(/\b[A-Z][\w&'-]+(?:\s+[A-Z][\w&'-]+){0,2}/g) || []).filter((w) => !/^(A|An|The|I|Make|Create|For|With|And|Our|My|We)$/.test(w));
  const brand = quoted[0] || caps[0] || 'Your Brand';
  const sentences = b.replace(/["“”]/g, '').split(/[.!?\n]+/).map((x) => x.trim()).filter((x) => x.length > 2);
  const lines = sentences.length ? sentences : ['Something big is coming'];
  const short = (s, n = 6) => words(s).slice(0, n).join(' ');
  const nums = (b.match(/\d[\d,.]*\s?%?\+?/g) || []).map((x) => x.trim());
  const pal = PALETTES.find((p) => p.id === mood.pal) || PALETTES[0];
  // light variation per seed
  const seq = [...mood.seq]; if (seed > 1) { const pool = TEMPLATES.filter((x) => x.cat !== 'Your media'); const alt = pool[Math.floor(r() * pool.length)].id; seq[1 + Math.floor(r() * (seq.length - 1))] = alt; }
  const scenes = seq.map((id, i) => {
    const tp = tplById(id); const props = {};
    if (tp.fields.includes('t1')) props.t1 = id === 'ticker' ? (nums[0] || '10,000+') : id === 'progress' ? 'Progress' : id === 'subscribe' ? 'Subscribe' : id === 'follow' ? '@' + brand.replace(/\s+/g, '').toLowerCase() : i === 0 || /logo|particles|circle|neon|cinematic/.test(id) ? brand : short(lines[Math.min(lines.length - 1, i)] || brand, id === 'pop-words' ? 7 : 5);
    if (tp.fields.includes('t2')) props.t2 = id === 'rotate-words' ? 'faster, smarter, better' : id === 'ticker' ? short(lines[1] || 'and counting', 4) : short(lines[Math.min(lines.length - 1, i + 1)] || '', 6);
    if (tp.fields.includes('t3')) props.t3 = short(lines[Math.min(lines.length - 1, i + 2)] || '', 4);
    if (tp.fields.includes('data')) props.data = 'Q1:30, Q2:52, Q3:71, Q4:96';
    if (id === 'quote') props.t2 = brand;
    if (props.t2 && props.t2 === props.t1) props.t2 = i ? brand !== props.t1 ? brand : '' : short(lines[0], 6) !== props.t1 ? short(lines[0], 6) : '';
    if (props.t3 && (props.t3 === props.t1 || props.t3 === props.t2)) props.t3 = '';
    return { id: 's' + i + '-' + seed, tpl: id, dur: tp.dur, props, transition: ['fade', 'wipe', 'zoom', 'slide'][Math.floor(r() * 4)] };
  });
  return { scenes, look: { ...pal, palette: pal.id, bg: mood.bg, font: mood.font } };
}

export const AI_SYSTEM = `You design short motion-graphics videos. Reply with ONLY JSON, no prose:
{"palette":{"c1":"#hex bg","c2":"#hex bg2","accent":"#hex","ink":"#hex text"},"bg":"gradient|solid|blobs|stars|grid|rays|noise","font":"Segoe UI|Arial Black|Impact|Bahnschrift|Georgia|Trebuchet MS|Verdana|Courier New",
 "scenes":[{"tpl":"<template id>","dur":<seconds 2-7>,"t1":"main text","t2":"secondary text","t3":"third line","data":"Label:number, Label:number","transition":"fade|wipe|zoom|slide|cut"}]}
Use 3-6 scenes, short punchy text (max ~7 words per field). Template ids and what they show:
${T.filter((x) => x.cat !== 'Your media').map((x) => `${x.id} (${x.name}; fields ${x.fields.join('/')})`).join('; ')}.`;

export function parseAiStoryboard(raw) {
  const s = typeof raw === 'string' ? raw : raw?.text || raw?.content || JSON.stringify(raw || {});
  const m = s.match(/\{[\s\S]*\}/); if (!m) throw new Error('The model did not return a storyboard. Try again or use Auto (built-in).');
  const j = JSON.parse(m[0]);
  const hex = (x, d) => (/^#[0-9a-f]{6}$/i.test(String(x || '')) ? x : d);
  const look = { c1: hex(j.palette?.c1, '#060c12'), c2: hex(j.palette?.c2, '#0d2b45'), accent: hex(j.palette?.accent, '#00d4ff'), ink: hex(j.palette?.ink, '#ffffff'), bg: BACKGROUNDS.some(([k]) => k === j.bg) ? j.bg : 'gradient', font: j.font || 'Segoe UI', palette: 'custom' };
  const scenes = (j.scenes || []).slice(0, 10).map((x, i) => { const tp = tplById(x.tpl); return { id: 'ai' + i + Date.now(), tpl: tp.id, dur: clamp(+x.dur || tp.dur, 1.5, 10), transition: ['fade', 'wipe', 'zoom', 'slide', 'cut'].includes(x.transition) ? x.transition : 'fade', props: { t1: String(x.t1 || '').slice(0, 80), t2: String(x.t2 || '').slice(0, 80), t3: String(x.t3 || '').slice(0, 80), data: String(x.data || '').slice(0, 200), img: x.img || '', img2: x.img2 || '', img3: x.img3 || '', code_brief: x.code_brief || '' } }; });
  if (!scenes.length) throw new Error('The storyboard was empty — try a more detailed brief.');
  return { scenes, look };
}
