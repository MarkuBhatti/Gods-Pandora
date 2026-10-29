// Titles drawn on a canvas — the same function draws the live preview and the PNG layer that is rendered,
// so text looks identical in the editor and in the final video.

export const FONTS = ['Segoe UI', 'Arial', 'Arial Black', 'Impact', 'Bahnschrift', 'Trebuchet MS', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Palatino Linotype', 'Courier New', 'Consolas', 'Comic Sans MS', 'Segoe Script', 'Gabriola'];

export const TEXT_DEFAULT = {
  content: 'Your title', font: 'Segoe UI', size: 0.08, weight: 800, italic: false, upper: false, spacing: 0,
  color: '#ffffff', align: 'center', x: 0.5, y: 0.5, maxW: 0.86, lineH: 1.15,
  stroke: 0, strokeColor: '#000000', shadow: 0.5, glow: 0, glowColor: '#00d4ff',
  box: false, boxColor: '#000000', boxOpacity: 0.55, boxPad: 0.4, boxRadius: 0.25,
};

export const TEXT_PRESETS = [
  { id: 'title', name: 'Big Title', text: { content: 'BIG TITLE', size: 0.12, weight: 900, upper: true, spacing: 0.04, y: 0.5 } },
  { id: 'cinematic', name: 'Cinematic', text: { content: 'A FILM BY YOU', font: 'Georgia', size: 0.055, weight: 400, upper: true, spacing: 0.35, shadow: 0, y: 0.5 } },
  { id: 'lower', name: 'Lower Third', text: { content: 'Name Surname\nTitle · Company', size: 0.045, weight: 700, align: 'left', x: 0.07, y: 0.8, box: true, boxOpacity: 0.7, boxColor: '#0b1622', shadow: 0 } },
  { id: 'caption', name: 'Caption', text: { content: 'Your caption here', size: 0.05, weight: 800, y: 0.84, stroke: 0.12, shadow: 0.3 } },
  { id: 'subtitle', name: 'Subtitle Box', text: { content: 'Subtitle text', size: 0.042, weight: 600, y: 0.88, box: true, boxOpacity: 0.6, shadow: 0 } },
  { id: 'tiktok', name: 'Shorts Hook', text: { content: 'WAIT FOR IT…', font: 'Arial Black', size: 0.075, weight: 900, upper: true, y: 0.3, stroke: 0.14, color: '#ffe14d' } },
  { id: 'neon', name: 'Neon Glow', text: { content: 'NEON', font: 'Bahnschrift', size: 0.13, weight: 700, color: '#e9fbff', glow: 1, glowColor: '#00d4ff', shadow: 0, upper: true, spacing: 0.08 } },
  { id: 'quote', name: 'Quote', text: { content: '“Make it simple,\nbut significant.”', font: 'Georgia', size: 0.06, italic: true, weight: 400, shadow: 0.4 } },
  { id: 'impact', name: 'Meme Impact', text: { content: 'TOP TEXT', font: 'Impact', size: 0.1, weight: 400, upper: true, y: 0.12, stroke: 0.16 } },
  { id: 'minimal', name: 'Minimal', text: { content: 'minimal', size: 0.05, weight: 300, spacing: 0.2, shadow: 0 } },
  { id: 'badge', name: 'Badge', text: { content: 'NEW', size: 0.045, weight: 900, upper: true, x: 0.88, y: 0.1, box: true, boxColor: '#ff2e63', boxOpacity: 1, boxRadius: 0.5, shadow: 0 } },
  { id: 'end', name: 'Subscribe', text: { content: 'SUBSCRIBE', size: 0.06, weight: 900, upper: true, y: 0.75, box: true, boxColor: '#ff0033', boxOpacity: 1, boxRadius: 0.3, shadow: 0 } },
];

const hexA = (hex, a) => { const h = String(hex || '#000').replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/); let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
    }
    out.push(line);
  }
  return out;
}

// draw one title. o = { alpha, dx, dy, scale } (animation, in frame fractions)
export function drawText(ctx, W, H, t0, o = {}) {
  const t = { ...TEXT_DEFAULT, ...(t0 || {}) };
  const alpha = o.alpha ?? 1; if (alpha <= 0.001) return;
  const px = Math.max(4, t.size * H * (o.scale || 1));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${t.italic ? 'italic ' : ''}${t.weight} ${px}px "${t.font}", "Segoe UI", Arial, sans-serif`;
  try { ctx.letterSpacing = `${(t.spacing || 0) * px}px`; } catch (_) { /* older canvas */ }
  ctx.textBaseline = 'middle';
  ctx.textAlign = t.align;
  const content = t.upper ? String(t.content).toUpperCase() : String(t.content);
  const lines = wrap(ctx, content, t.maxW * W);
  const lh = px * t.lineH;
  const cx = (t.x + (o.dx || 0)) * W, cy = (t.y + (o.dy || 0)) * H;
  const top = cy - ((lines.length - 1) * lh) / 2;
  if (t.box) {
    const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const pad = t.boxPad * px;
    const bx = t.align === 'left' ? cx - pad : t.align === 'right' ? cx - wMax - pad : cx - wMax / 2 - pad;
    const by = top - lh / 2 - pad * 0.5, bw = wMax + pad * 2, bh = lines.length * lh + pad;
    const r = Math.min(bh / 2, t.boxRadius * px);
    ctx.fillStyle = hexA(t.boxColor, t.boxOpacity);
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, r); else ctx.rect(bx, by, bw, bh); ctx.fill();
  }
  lines.forEach((l, i) => {
    const y = top + i * lh;
    if (t.glow > 0) { ctx.save(); ctx.shadowColor = t.glowColor; ctx.shadowBlur = px * 0.6 * t.glow; ctx.fillStyle = t.glowColor; ctx.fillText(l, cx, y); ctx.shadowBlur = px * 0.25 * t.glow; ctx.fillText(l, cx, y); ctx.restore(); }
    if (t.shadow > 0) { ctx.shadowColor = `rgba(0,0,0,${0.75 * t.shadow})`; ctx.shadowBlur = px * 0.25 * t.shadow; ctx.shadowOffsetY = px * 0.06 * t.shadow; }
    if (t.stroke > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = t.stroke * px; ctx.strokeStyle = t.strokeColor; ctx.strokeText(l, cx, y); }
    ctx.fillStyle = t.color; ctx.fillText(l, cx, y);
    ctx.shadowColor = 'transparent';
  });
  ctx.restore();
}

// Same easing as the ffmpeg render (electron/timeline.js): entrance over 0.45 s, cubic ease-out
export function textAnim(clip, t) {
  const local = t - clip.start; const d = clip.dur;
  let alpha = 1;
  if (clip.fadeIn > 0) alpha *= Math.min(1, Math.max(0, local / clip.fadeIn));
  if (clip.fadeOut > 0) alpha *= Math.min(1, Math.max(0, (d - local) / clip.fadeOut));
  const k = Math.max(0, 1 - local / 0.45); const e = k * k * k;
  const a = clip.anim || 'none';
  return { alpha, dx: a === 'slideleft' ? 0.25 * e : a === 'slideright' ? -0.25 * e : 0, dy: a === 'slideup' ? 0.12 * e : a === 'drop' ? -0.12 * e : 0 };
}

export function textPng(text, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  drawText(c.getContext('2d'), W, H, text);
  return c.toDataURL('image/png');
}
