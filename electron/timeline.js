// Pandora Edit — the Resolve-style timeline's engine (ffmpeg, free, offline).
//
//   analyze()        probe a file + optional beats / shot cuts / pauses / waveform peaks (auto editing)
//   thumbStrip()     filmstrip sprite for clips on the timeline
//   renderTimeline() renders a multi-track project: V1 is the main storyline (cuts + transitions using the
//                    outgoing clip's handles, like Resolve), V2+ are overlays (picture-in-picture, titles,
//                    motion graphics), A1+ are music / voice / SFX, and every clip's own sound is mixed in.
//   motion*          frame-by-frame encoder for the Motion Design tab (canvas frames piped into ffmpeg).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { typed } = require('./libpath');
const cp = require('child_process');
const cut = require('./cut');

const tmpDir = () => { const d = path.join(os.tmpdir(), 'pandora-edit'); fs.mkdirSync(d, { recursive: true }); return d; };
const n3 = (v) => (+v || 0).toFixed(3);
const even = (v) => Math.max(2, Math.round(v / 2) * 2);

function needFf(userData) { const ff = cut.findFfmpeg(userData); if (!ff) throw new Error('FFMPEG_MISSING'); return ff; }

async function analyze(userData, { file, beats = false, scenes = false, silences = false, peaks = false, noiseDb = -35, minSilence = 0.45 }) {
  const ff = needFf(userData);
  if (!file || !fs.existsSync(file)) throw new Error('File not found: ' + file);
  const info = await cut.probe(ff, file);
  const out = { ...info };
  if (beats && info.audio) { try { out.beats = await cut.beats(ff, file); } catch (_) { out.beats = null; } }
  if (scenes && !info.image) out.scenes = await cut.scenes(ff, file);
  if (silences && info.audio) out.silences = await cut.silences(ff, file, noiseDb, minSilence);
  if (peaks && info.audio) {
    const PPS = 50; // peaks per second
    const r = await cut.run(ff, ['-t', '1800', '-i', file, '-vn', '-ac', '1', '-ar', String(PPS * 40), '-f', 's16le', '-'], { timeout: 180000 });
    const b = r.stdout; const n = Math.floor(b.length / 2); const p = [];
    for (let i = 0; i < n; i += 40) { let m = 0; for (let k = i; k < Math.min(n, i + 40); k++) { const v = Math.abs(b.readInt16LE(k * 2)); if (v > m) m = v; } p.push(Math.round(m / 327.67)); }
    out.peaks = { pps: PPS, data: p };
  }
  return out;
}

// One JPEG with `count` frames side by side (the clip's filmstrip on the timeline)
async function thumbStrip(userData, { file, count = 8, h = 54 }) {
  const ff = needFf(userData);
  const info = await cut.probe(ff, file);
  if (info.image) { const f = await cut.frame(userData, { file, max: 240 }); return { dataUrl: f.dataUrl, count: 1, image: true }; }
  const dur = Math.max(0.1, info.duration);
  const step = dur / count;
  const r = await cut.run(ff, ['-i', file, '-an', '-vf', `fps=1/${n3(step)},scale=-2:${h},tile=${count}x1`, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '5', '-'], { timeout: 120000 });
  if (!r.stdout || r.stdout.length < 100) throw new Error(cut.friendly(r.stderr));
  return { dataUrl: 'data:image/jpeg;base64,' + r.stdout.toString('base64'), count };
}

function dataUrlToFile(dataUrl, ext) {
  const m = String(dataUrl || '').match(/^data:[^;]+;base64,(.*)$/s);
  if (!m) return null;
  const f = path.join(tmpDir(), `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  fs.writeFileSync(f, Buffer.from(m[1], 'base64')); return f;
}

// atempo only takes 0.5…2 per stage → chain stages for any speed
function atempo(speed) {
  let s = +speed || 1; const st = [];
  while (s > 2.0001) { st.push('atempo=2'); s /= 2; }
  while (s < 0.4999) { st.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1) > 1e-3) st.push('atempo=' + s.toFixed(4));
  return st;
}

const XFADES = new Set(['fade', 'fadeblack', 'fadewhite', 'dissolve', 'distance', 'wipeleft', 'wiperight', 'wipeup', 'wipedown', 'slideleft', 'slideright', 'slideup', 'slidedown', 'smoothleft', 'smoothright', 'smoothup', 'smoothdown', 'circlecrop', 'rectcrop', 'circleclose', 'circleopen', 'horzclose', 'horzopen', 'vertclose', 'vertopen', 'diagbl', 'diagbr', 'diagtl', 'diagtr', 'hlslice', 'hrslice', 'vuslice', 'vdslice', 'radial', 'pixelize', 'zoomin', 'hblur', 'fadegrays', 'squeezev', 'squeezeh', 'wipetl', 'wipetr', 'wipebl', 'wipebr', 'hlwind', 'hrwind', 'vuwind', 'vdwind']);

/* project = { W, H, fps, tracks:[{ type:'video'|'audio'|'text', hidden, muted, clips:[clip] }] }  (video tracks bottom → top)
   clip    = { file, kind:'video'|'image'|'audio'|'text', start, dur, in, speed, volume, fadeIn, fadeOut,
               transition:{ type, dur } (V1 only — blends from the previous clip), fit:'fill'|'fit',
               cube, filters:[…], x, y, scale, opacity, png (text clips), anim } */
async function renderTimeline(userData, opts, onProgress = () => {}) {
  const ff = needFf(userData);
  const P = opts.project || {};
  const W = even(P.W || 1920), H = even(P.H || 1080), FPS = Math.max(1, Math.min(120, +P.fps || 30));
  const tracks = (P.tracks || []).filter((t) => t && Array.isArray(t.clips));
  const all = tracks.flatMap((t) => t.clips);
  const total = Math.max(0, ...all.map((c) => (+c.start || 0) + (+c.dur || 0)));
  if (!(total > 0.05)) throw new Error('The timeline is empty — add some clips first.');
  onProgress({ stage: 'Preparing', pct: 1 });

  // probe every media file once
  const infos = {};
  for (const f of [...new Set(all.filter((c) => c.file && c.kind !== 'text').map((c) => c.file))]) {
    if (!fs.existsSync(f)) throw new Error('Missing media: ' + path.basename(f) + ' — it was moved or deleted.');
    infos[f] = await cut.probe(ff, f);
  }

  const inputs = []; const graph = []; const audio = [];
  let uid = 0; const U = (p) => `${p}${uid++}`;
  const addInput = (args) => { inputs.push(...args); return inputs.filter((a) => a === '-i').length - 1; };
  const temp = [];
  const fitChain = (c) => (c.fit === 'fit'
    ? `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`
    : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  const colourAndFx = (c, inLab) => {
    const cube = c.cube ? cut.tempCube(c.cube) : null; if (cube) temp.push(cube);
    const pre = cube ? [`lut3d=file='${cut.ffPath(cube)}'`] : [];
    const r = cut.fxChain(inLab, [...pre, ...(Array.isArray(c.filters) ? c.filters : [])], W, H, U('fx'));
    if (r.graph) graph.push(r.graph);
    return r.out;
  };
  // media input for a clip reading `len` seconds of timeline (source length = len × speed)
  const mediaInput = (c, len) => {
    const info = infos[c.file]; const sp = +c.speed || 1;
    if (info.image) return { idx: addInput(['-loop', '1', '-framerate', String(FPS), '-t', n3(len + 0.1), '-i', c.file]), info };
    const srcLen = Math.min(len * sp, Math.max(0.05, info.duration - (+c.in || 0)));
    return { idx: addInput(['-ss', n3(+c.in || 0), '-t', n3(srcLen + 0.05), '-i', c.file]), info };
  };
  const videoPrep = (c, idx, info, len) => {
    const sp = +c.speed || 1;
    const lab = U('v');
    const base = [info.image ? 'setpts=PTS-STARTPTS' : `setpts=(PTS-STARTPTS)/${sp.toFixed(4)}`, `fps=${FPS}`];
    graph.push(`[${idx}:v]${base.join(',')}[${lab}]`);
    return lab;
  };
  // sound of a clip (video's own audio or an audio clip), placed at its timeline start
  const addAudio = (c, idx, info) => {
    if (!info || !info.audio || (c.volume ?? 1) <= 0) return;
    const sp = +c.speed || 1; const d = +c.dur;
    const f = ['asetpts=PTS-STARTPTS', ...atempo(sp), `atrim=0:${n3(d)}`, 'asetpts=PTS-STARTPTS', `volume=${(+(c.volume ?? 1)).toFixed(3)}`];
    if (c.fadeIn > 0) f.push(`afade=t=in:st=0:d=${n3(Math.min(c.fadeIn, d))}`);
    if (c.fadeOut > 0) f.push(`afade=t=out:st=${n3(Math.max(0, d - c.fadeOut))}:d=${n3(Math.min(c.fadeOut, d))}`);
    const ms = Math.round((+c.start || 0) * 1000);
    f.push(`adelay=${ms}|${ms}`, 'aformat=sample_rates=48000:channel_layouts=stereo');
    const lab = U('a'); graph.push(`[${idx}:a]${f.join(',')}[${lab}]`); audio.push(lab);
  };

  const vTracks = tracks.filter((t) => t.type === 'video');
  const main = vTracks[0];

  /* ── V1: the storyline (sequential, gaps = black, transitions blend using the outgoing clip's handles) ── */
  const segs = [];
  let tcur = 0;
  const v1 = main && !main.hidden ? [...main.clips].sort((a, b) => a.start - b.start) : [];
  for (const c of v1) {
    const st = Math.max(+c.start || 0, tcur);
    if (st - tcur > 0.02) segs.push({ gap: true, start: tcur, len: st - tcur });
    const end = Math.max(st, (+c.start || 0) + (+c.dur || 0));
    if (end - st > 0.02) segs.push({ clip: c, start: st, len: end - st });
    tcur = Math.max(tcur, end);
  }
  if (total - tcur > 0.02) segs.push({ gap: true, start: tcur, len: total - tcur });
  // transitions: only between two real clips that touch
  for (let i = 1; i < segs.length; i++) {
    const a = segs[i - 1], b = segs[i];
    const tr = b.clip && b.clip.transition;
    if (!a.gap && !b.gap && tr && tr.type && tr.type !== 'cut' && XFADES.has(tr.type)) {
      const d = Math.max(0.1, Math.min(+tr.dur || 0.5, a.len * 0.9, b.len * 0.9));
      b.xf = { type: tr.type, d }; a.ext = d;
    }
  }
  let vcur = null; let vlen = 0;
  for (const sgm of segs) {
    const L = sgm.len + (sgm.ext || 0);
    let lab;
    if (sgm.gap) {
      lab = U('gap'); graph.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${n3(L)},format=yuv420p,setsar=1,settb=AVTB[${lab}]`);
    } else {
      const c = sgm.clip;
      const { idx, info } = mediaInput(c, L);
      const raw = videoPrep(c, idx, info, L);
      const fitted = U('f'); graph.push(`[${raw}]${fitChain(c)},setsar=1[${fitted}]`);
      const fxd = colourAndFx(c, fitted);
      const tail = [`scale=${W}:${H},setsar=1`, `tpad=stop_mode=clone:stop_duration=${n3(L)}`, `trim=duration=${n3(L)}`, 'setpts=PTS-STARTPTS'];
      if (c.fadeIn > 0 && !sgm.xf) tail.push(`fade=t=in:st=0:d=${n3(Math.min(c.fadeIn, sgm.len))}`);
      if (c.fadeOut > 0 && !sgm.ext) tail.push(`fade=t=out:st=${n3(Math.max(0, sgm.len - c.fadeOut))}:d=${n3(Math.min(c.fadeOut, sgm.len))}`);
      if ((c.opacity ?? 1) < 1) tail.push(`colorchannelmixer=rr=${n3(c.opacity)}:gg=${n3(c.opacity)}:bb=${n3(c.opacity)}`);
      tail.push('format=yuv420p', 'settb=AVTB', `fps=${FPS}`);
      lab = U('s'); graph.push(`[${fxd}]${tail.join(',')}[${lab}]`);
      if (!main.muted) addAudio(c, idx, info);
    }
    if (!vcur) { vcur = lab; vlen = L; continue; }
    const o = U('j');
    if (sgm.xf) { graph.push(`[${vcur}][${lab}]xfade=transition=${sgm.xf.type}:duration=${n3(sgm.xf.d)}:offset=${n3(sgm.start)}[${o}]`); vlen = sgm.start + L; }
    else { graph.push(`[${vcur}][${lab}]concat=n=2:v=1:a=0[${o}]`); vlen += L; }
    vcur = o;
  }
  if (!vcur) { vcur = U('bg'); graph.push(`color=c=black:s=${W}x${H}:r=${FPS}:d=${n3(total)},format=yuv420p,setsar=1[${vcur}]`); }

  /* ── V2+ overlays and title tracks (top of the stack wins) ── */
  const layers = [];
  for (const t of tracks) {
    if (t === main || t.hidden) continue;
    if (t.type === 'video' || t.type === 'text') for (const c of t.clips) layers.push({ c, t });
  }
  for (const { c, t } of layers) {
    const d = +c.dur || 0; if (d <= 0.02) continue;
    const st = +c.start || 0;
    let lab; let isFull = false;
    if (c.kind === 'text' || c.png) {
      const png = dataUrlToFile(c.png, 'png'); if (!png) continue; temp.push(png);
      const idx = addInput(['-loop', '1', '-framerate', String(FPS), '-t', n3(d + 0.1), '-i', png]);
      lab = U('t'); graph.push(`[${idx}:v]fps=${FPS},scale=${W}:${H},format=rgba,trim=duration=${n3(d)},setpts=PTS-STARTPTS[${lab}]`); isFull = true;
    } else {
      const { idx, info } = mediaInput(c, d);
      const raw = videoPrep(c, idx, info, d);
      const sc = Math.max(0.05, Math.min(4, +c.scale || 1));
      const sized = U('o');
      if (c.fit === 'fill' && sc === 1) { graph.push(`[${raw}]${fitChain({ fit: 'fill' })},setsar=1[${sized}]`); isFull = true; }
      else graph.push(`[${raw}]scale=w='trunc(${W}*${sc.toFixed(4)}/2)*2':h=-2,setsar=1[${sized}]`);
      const fxd = colourAndFx(c, sized);
      lab = U('ol'); graph.push(`[${fxd}]tpad=stop_mode=clone:stop_duration=${n3(d)},trim=duration=${n3(d)},setpts=PTS-STARTPTS,format=rgba[${lab}]`);
      if (!t.muted) addAudio(c, idx, info);
    }
    const post = [];
    if (c.fadeIn > 0) post.push(`fade=t=in:st=0:d=${n3(Math.min(c.fadeIn, d))}:alpha=1`);
    if (c.fadeOut > 0) post.push(`fade=t=out:st=${n3(Math.max(0, d - c.fadeOut))}:d=${n3(Math.min(c.fadeOut, d))}:alpha=1`);
    if ((c.opacity ?? 1) < 1) post.push(`colorchannelmixer=aa=${n3(c.opacity)}`);
    post.push(`setpts=PTS-STARTPTS+${n3(st)}/TB`);
    const shifted = U('sh'); graph.push(`[${lab}]${post.join(',')}[${shifted}]`);
    // position (+ entrance animation) — x/y are offsets in frame fractions, centre = 0,0
    const ox = isFull ? '0' : `(W-w)/2+${(+(c.x || 0) * W).toFixed(1)}`;
    const oy = isFull ? '0' : `(H-h)/2+${(+(c.y || 0) * H).toFixed(1)}`;
    const k = `max(0\\,1-(t-${n3(st)})/0.45)`;
    const ease = `(${k}*${k}*${k})`;
    const anim = c.anim || 'none';
    const xExpr = anim === 'slideleft' ? `${ox}+W*0.25*${ease}` : anim === 'slideright' ? `${ox}-W*0.25*${ease}` : ox;
    const yExpr = anim === 'slideup' ? `${oy}+H*0.12*${ease}` : anim === 'drop' ? `${oy}-H*0.12*${ease}` : oy;
    const o = U('ov');
    graph.push(`[${vcur}][${shifted}]overlay=x='${xExpr}':y='${yExpr}':enable='between(t\\,${n3(st)}\\,${n3(st + d)})':eof_action=pass:format=auto[${o}]`);
    vcur = o;
  }

  /* ── audio tracks ── */
  for (const t of tracks) {
    if (t.type !== 'audio' || t.muted) continue;
    for (const c of t.clips) {
      if (!c.file || !(+c.dur > 0.02)) continue;
      const info = infos[c.file]; if (!info || !info.audio) continue;
      const idx = addInput(['-ss', n3(+c.in || 0), '-t', n3((+c.dur) * (+c.speed || 1) + 0.05), '-i', c.file]);
      addAudio(c, idx, info);
    }
  }
  const vout = U('vout'); graph.push(`[${vcur}]trim=duration=${n3(total)},setpts=PTS-STARTPTS,format=yuv420p[${vout}]`);
  const aout = U('aout');
  if (audio.length) graph.push(`${audio.map((a) => `[${a}]`).join('')}amix=inputs=${audio.length}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.97,apad,atrim=0:${n3(total)}[${aout}]`);
  else graph.push(`anullsrc=r=48000:cl=stereo,atrim=0:${n3(total)}[${aout}]`);

  const name = String(opts.name || 'pandora-edit').replace(/[^\w-]+/g, '_').slice(0, 40) || 'pandora-edit';
  const out = typed(path.join(opts.outDir || cut.outDirFor(userData), `${Date.now()}-${name}.mp4`));
  const fcFile = path.join(tmpDir(), `graph-${Date.now()}.txt`); fs.writeFileSync(fcFile, graph.join(';\n')); temp.push(fcFile);
  const q = { draft: ['-preset', 'ultrafast', '-crf', '26'], good: ['-preset', 'veryfast', '-crf', '19'], best: ['-preset', 'medium', '-crf', '16'] }[opts.quality || 'good'];
  const args = ['-y', ...inputs, '-filter_complex_script', fcFile, '-map', `[${vout}]`, '-map', `[${aout}]`, '-r', String(FPS), '-c:v', 'libx264', ...q, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-t', n3(total), '-movflags', '+faststart', out];
  onProgress({ stage: 'Rendering', pct: 3 });
  const r = await cut.run(ff, args, {
    onStderr: (s) => { const m = s.match(/time=(\d+):(\d+):([\d.]+)/); if (m) { const sec = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]); onProgress({ stage: 'Rendering', pct: Math.min(99, 3 + Math.round(sec / total * 96)) }); } },
  });
  if (!process.env.PANDORA_KEEP_GRAPH) for (const f of temp) { try { fs.unlinkSync(f); } catch (_) {} }
  if (r.code !== 0 || !fs.existsSync(out)) throw new Error(cut.friendly(r.stderr));
  onProgress({ stage: 'Done', pct: 100 });
  return { file: out, duration: total };
}

/* ───────────── Motion Design encoder: canvas frames → ffmpeg ───────────── */
const sessions = new Map();
function motionBegin(userData, { fps = 30, W = 1920, H = 1080, alpha = false, name = 'motion', outDir, audio = null }) {
  const ff = needFf(userData);
  const id = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
  const safe = String(name).replace(/[^\w-]+/g, '_').slice(0, 40) || 'motion';
  const out = typed(path.join(outDir || cut.outDirFor(userData), `${Date.now()}-${safe}${alpha ? '.mov' : '.mp4'}`));
  const enc = alpha
    ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0']
    : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
  const aud = audio && fs.existsSync(audio) ? ['-i', audio] : [];
  const args = ['-hide_banner', '-nostdin', '-y', '-f', 'image2pipe', '-c:v', alpha ? 'png' : 'mjpeg', '-framerate', String(fps), '-i', '-', ...aud,
    '-vf', `scale=${even(W)}:${even(H)}`, ...enc, ...(aud.length ? ['-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-shortest'] : []), out];
  const p = cp.spawn(ff, args, { windowsHide: true });
  let err = '';
  p.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
  const done = new Promise((resolve) => p.on('close', (code) => resolve(code)));
  p.stdin.on('error', () => {});
  sessions.set(id, { p, out, done, err: () => err });
  return { id, out };
}
function motionFrame(id, bytes) {
  const s = sessions.get(id); if (!s) throw new Error('Render session ended.');
  if (s.p.exitCode !== null) throw new Error(cut.friendly(s.err()) || 'The encoder stopped.');
  const buf = Buffer.from(bytes);
  const wrote = new Promise((resolve) => { if (!s.p.stdin.write(buf)) s.p.stdin.once('drain', () => resolve(true)); else resolve(true); });
  // if ffmpeg dies mid-render, fail this frame instead of waiting forever
  return Promise.race([wrote, s.done.then(() => { throw new Error(cut.friendly(s.err()) || 'The encoder stopped.'); })]);
}
async function motionEnd(id, cancel = false) {
  const s = sessions.get(id); if (!s) throw new Error('Render session ended.');
  sessions.delete(id);
  if (cancel) { try { s.p.kill(); } catch (_) {} try { fs.unlinkSync(s.out); } catch (_) {} return { cancelled: true }; }
  s.p.stdin.end();
  const code = await s.done;
  if (code !== 0 || !fs.existsSync(s.out)) throw new Error(cut.friendly(s.err()));
  return { file: s.out };
}

module.exports = { analyze, thumbStrip, renderTimeline, motionBegin, motionFrame, motionEnd, XFADES: [...XFADES] };
