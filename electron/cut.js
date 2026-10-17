// Pandora Cut — DaVinci-Resolve-inspired auto edit + auto color grading, 100 % free (ffmpeg).
//
//  • Auto edit:  beat detection on your music → cuts land on the beat; scene detection picks fresh shots
//                from every clip; smart reframe (centre-crop) to 9:16 / 1:1 / 16:9; transitions (xfade).
//  • Auto color: Auto Balance (grey-world white balance + levels), Shot Match to a reference clip,
//                film looks, your own .cube LUTs, vignette + grain finishing.
//
// Everything runs as a child process with low priority so the app UI never freezes, and every step has
// a friendly error. No GPU, no API key, no internet needed.
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const hide = (o) => ({ windowsHide: true, ...(o || {}) });

/* ───────────── ffmpeg discovery (PATH → engine venv → system Python's imageio-ffmpeg) ───────────── */
let cachedFf = null;
function pyCandidates(userData) {
  const venv = process.platform === 'win32' ? path.join(userData, 'engine-venv', 'Scripts', 'python.exe') : path.join(userData, 'engine-venv', 'bin', 'python');
  return [...(fs.existsSync(venv) ? [venv] : []), 'python', 'python3', 'py'];
}
function findFfmpeg(userData) {
  if (cachedFf && (cachedFf === 'ffmpeg' || fs.existsSync(cachedFf))) return cachedFf;
  try { if (cp.spawnSync('ffmpeg', ['-version'], hide()).status === 0) return (cachedFf = 'ffmpeg'); } catch (_) { /* next */ }
  const bundled = path.join(userData, 'tools', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(bundled)) return (cachedFf = bundled);
  for (const py of pyCandidates(userData)) {
    try {
      const r = cp.spawnSync(py, ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], hide({ timeout: 20000 }));
      const exe = String(r.stdout || '').trim().split('\n').pop();
      if (r.status === 0 && exe && fs.existsSync(exe)) return (cachedFf = exe);
    } catch (_) { /* next */ }
  }
  return null;
}

// One click: installs the free ffmpeg build that ships inside the imageio-ffmpeg wheel (~30 MB).
function ensureFfmpeg(userData) {
  return new Promise((resolve) => {
    const have = findFfmpeg(userData);
    if (have) return resolve({ ok: true, path: have });
    const pys = pyCandidates(userData).filter((p) => { try { return cp.spawnSync(p, ['--version'], hide()).status === 0; } catch (_) { return false; } });
    if (!pys.length) return resolve({ ok: false, error: 'Pandora Cut needs ffmpeg (free). Install the local engine (Pandora Core → Install engine) or install ffmpeg from ffmpeg.org, then try again.' });
    const py = pys[0];
    const isVenv = /engine-venv/.test(py);
    const p = cp.spawn(py, ['-m', 'pip', 'install', ...(isVenv ? [] : ['--user']), 'imageio-ffmpeg'], hide({ env: { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1' } }));
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-800); });
    p.on('error', (e) => resolve({ ok: false, error: e.message }));
    p.on('close', (code) => {
      cachedFf = null;
      const ff = findFfmpeg(userData);
      resolve(ff ? { ok: true, path: ff } : { ok: false, error: 'Could not install ffmpeg automatically (' + (code === 0 ? 'not found after install' : err.split('\n').slice(-2).join(' ')) + '). Install it from ffmpeg.org and restart the app.' });
    });
  });
}

/* ───────────── small process helpers ───────────── */
const running = new Set();
function run(ff, args, { onStderr, input, timeout = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const p = cp.spawn(ff, ['-hide_banner', '-nostdin', ...args], hide());
    try { os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (_) { /* best effort */ }
    running.add(p);
    const out = []; let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { const t = d.toString(); err = (err + t).slice(-6000); onStderr && onStderr(t); });
    let timer = null;
    if (timeout) timer = setTimeout(() => { try { p.kill(); } catch (_) {} }, timeout);
    p.on('error', (e) => { running.delete(p); reject(e); });
    p.on('close', (code) => { running.delete(p); if (timer) clearTimeout(timer); resolve({ code, stdout: Buffer.concat(out), stderr: err }); });
    if (input) p.stdin.end(input);
  });
}
function cancelAll() { for (const p of running) { try { p.kill(); } catch (_) {} } running.clear(); }

const IMG = /\.(png|jpe?g|webp|bmp)$/i;

async function probe(ff, file) {
  const r = await run(ff, ['-i', file], { timeout: 30000 });
  const s = r.stderr;
  const dm = s.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const duration = dm ? (+dm[1]) * 3600 + (+dm[2]) * 60 + parseFloat(dm[3]) : 0;
  const vm = s.match(/Video: .*?, (\d{2,5})x(\d{2,5})/);
  return { file, image: IMG.test(file), duration: IMG.test(file) ? 0 : duration, width: vm ? +vm[1] : 0, height: vm ? +vm[2] : 0, audio: /Audio: /.test(s) };
}

// Shot boundaries (like Resolve's Scene Cut Detector)
async function scenes(ff, file, threshold = 0.32) {
  const r = await run(ff, ['-t', '900', '-i', file, '-an', '-vf', `scale=240:-2,select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], { timeout: 180000 });
  return [...r.stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1]).filter((t) => t > 0.2);
}

// Average colour + luma levels from a few small frames → drives Auto Balance and Shot Match
async function colorStats(ff, info) {
  const times = info.image ? [null] : [0.2, 0.5, 0.8].map((f) => Math.max(0, info.duration * f));
  const acc = { r: 0, g: 0, b: 0, lo: 0, hi: 0, n: 0 };
  for (const t of times) {
    const args = [...(t != null ? ['-ss', t.toFixed(2)] : []), '-i', info.file, '-frames:v', '1', '-vf', 'scale=96:54,format=rgb24', '-f', 'rawvideo', '-'];
    const r = await run(ff, args, { timeout: 30000 });
    const px = r.stdout;
    if (!px || px.length < 300) continue;
    const lum = [];
    let R = 0, G = 0, B = 0; const n = Math.floor(px.length / 3);
    for (let i = 0; i < n; i++) {
      const rr = px[i * 3], gg = px[i * 3 + 1], bb = px[i * 3 + 2];
      R += rr; G += gg; B += bb; lum.push(0.2126 * rr + 0.7152 * gg + 0.0722 * bb);
    }
    lum.sort((a, b) => a - b);
    acc.r += R / n; acc.g += G / n; acc.b += B / n;
    acc.lo += lum[Math.floor(n * 0.02)]; acc.hi += lum[Math.floor(n * 0.98)]; acc.n++;
  }
  if (!acc.n) return null;
  const k = acc.n * 255;
  return { r: acc.r / k, g: acc.g / k, b: acc.b / k, lo: acc.lo / k, hi: acc.hi / k };
}

// Motion/activity per moment (CapCut-style highlight picking: busy, eventful moments score higher)
async function activity(ff, file) {
  const r = await run(ff, ['-t', '900', '-i', file, '-an', '-vf', "fps=4,scale=160:-2,select='gte(scene,0)',metadata=print:key=lavfi.scene_score", '-f', 'null', '-'], { timeout: 180000 });
  const out = []; let t = null;
  for (const line of r.stderr.split('\n')) {
    const a = line.match(/pts_time:([\d.]+)/); if (a) t = +a[1];
    const b = line.match(/lavfi\.scene_score=([\d.]+)/); if (b && t != null) { out.push([t, +b[1]]); t = null; }
  }
  return out;
}
function bestWindow(act, d, used, dur) {
  if (!act || act.length < 4) return null;
  let best = null, bestS = -1;
  for (let st = 0; st + d <= dur - 0.05; st += 0.25) {
    if (used.some(([a, b]) => st < b && st + d > a)) continue;
    let sum = 0, n = 0; for (const [t, v] of act) if (t >= st && t <= st + d) { sum += v; n++; }
    const sc = n ? sum / n : 0; if (sc > bestS) { bestS = sc; best = st; }
  }
  return best;
}
function tempCube(text) {
  if (!text) return null;
  const dir = path.join(os.tmpdir(), 'pandora-cut'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'look-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.cube');
  fs.writeFileSync(f, text); return f;
}
function titleFont() {
  const c = process.platform === 'win32'
    ? ['C:/Windows/Fonts/segoeuib.ttf', 'C:/Windows/Fonts/arialbd.ttf', 'C:/Windows/Fonts/arial.ttf']
    : ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'];
  return c.find((f) => fs.existsSync(f)) || null;
}
const ffText = (t) => String(t).replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/%/g, '\\%').slice(0, 80);

// One frame as a JPEG data URL (for the live colour preview)
async function frame(userData, { file, t = null, max = 1280 }) {
  const ff = findFfmpeg(userData);
  if (!ff) throw new Error('FFMPEG_MISSING');
  const info = await probe(ff, file);
  const at = info.image ? null : (t == null ? info.duration * 0.4 : Math.min(Math.max(0, t), Math.max(0, info.duration - 0.05)));
  const r = await run(ff, [...(at != null ? ['-ss', at.toFixed(3)] : []), '-i', file, '-frames:v', '1', '-vf', `scale='min(${max},iw)':-2`, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '3', '-'], { timeout: 30000 });
  if (!r.stdout || r.stdout.length < 100) throw new Error(friendly(r.stderr));
  return { dataUrl: 'data:image/jpeg;base64,' + r.stdout.toString('base64'), duration: info.duration, image: info.image, width: info.width, height: info.height, t: at };
}

// Silence detection for talking videos (jump cuts)
async function silences(ff, file, noiseDb = -35, minSil = 0.45) {
  const r = await run(ff, ['-i', file, '-vn', '-af', `silencedetect=noise=${noiseDb}dB:d=${minSil}`, '-f', 'null', '-'], { timeout: 600000 });
  const list = []; let st = null;
  for (const line of r.stderr.split('\n')) {
    const a = line.match(/silence_start: ([\d.]+)/); if (a) st = +a[1];
    const b = line.match(/silence_end: ([\d.]+)/); if (b && st != null) { list.push([st, +b[1]]); st = null; }
  }
  return list;
}

/* ───────────── Beat detection (onset envelope + autocorrelation tempo + phase fit) ───────────── */
async function beats(ff, music) {
  const SR = 11025, HOP = 256;
  const r = await run(ff, ['-t', '900', '-i', music, '-vn', '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { timeout: 180000 });
  const buf = r.stdout;
  const n = Math.floor(buf.length / 4);
  if (n < SR * 2) return null;
  const pcm = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + n * 4));
  const frames = Math.floor(n / HOP);
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0; const o = f * HOP;
    for (let i = 0; i < HOP; i++) { const v = pcm[o + i]; e += v * v; }
    e = Math.log1p(1000 * e / HOP);
    env[f] = Math.max(0, e - prev); prev = e;
  }
  // normalise + light smoothing
  let mean = 0; for (const v of env) mean += v; mean /= frames;
  for (let f = 0; f < frames; f++) env[f] = Math.max(0, env[f] - mean);
  const fps = SR / HOP;
  const minLag = Math.round(fps * 60 / 180), maxLag = Math.round(fps * 60 / 70);
  let best = minLag, bestScore = -1;
  const lim = Math.min(frames, Math.round(fps * 120)); // first 2 minutes is plenty for tempo
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0; for (let i = lag; i < lim; i++) s += env[i] * env[i - lag];
    s *= 1 + 0.15 * Math.exp(-Math.pow((60 * fps / lag - 120) / 40, 2)); // gentle prior towards ~120 BPM
    if (s > bestScore) { bestScore = s; best = lag; }
  }
  // refine to a fractional period (integer lags are ±2 % off, which drifts over a song)
  const ac = (lag) => { let s = 0; for (let i = lag; i < lim; i++) s += env[i] * env[i - lag]; return s; };
  const y0 = ac(best - 1), y1 = ac(best), y2 = ac(best + 1);
  const den = y0 - 2 * y1 + y2;
  let lagF = best + (den < 0 ? clamp(0.5 * (y0 - y2) / den, -0.5, 0.5) : 0);
  // fine search ±1.5 % for the period whose grid collects the most onset energy
  const gridScore = (L, p) => { let s = 0; for (let x = p; x < frames - 1; x += L) { const i = Math.round(x); s += env[i] + 0.5 * (env[i - 1] || 0) + 0.5 * (env[i + 1] || 0); } return s; };
  let bestL = lagF, phase = 0, phaseScore = -1;
  for (let L = lagF * 0.985; L <= lagF * 1.015; L += lagF * 0.0025) {
    for (let p = 0; p < L; p += 0.5) {
      const s = gridScore(L, p);
      if (s > phaseScore) { phaseScore = s; phase = p; bestL = L; }
    }
  }
  lagF = bestL;
  const period = lagF / fps;
  const duration = n / SR;
  const list = [];
  for (let t = phase / fps; t < duration; t += period) list.push(+t.toFixed(3));
  return { bpm: Math.round(60 / period), period, beats: list, duration };
}

/* ───────────── colour grading filters ───────────── */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const f3 = (v) => (+v).toFixed(3);
const LOOKS = {
  none: '',
  'Natural pop': 'eq=contrast=1.06:saturation=1.14',
  'Teal & Orange': 'colorbalance=rs=-0.08:bs=0.10:rh=0.10:gh=0.02:bh=-0.09,eq=contrast=1.08:saturation=1.1',
  'Warm film': 'colorbalance=rm=0.06:gm=0.01:bm=-0.06:rh=0.04:bh=-0.03,curves=preset=medium_contrast,eq=saturation=0.95',
  'Cool night': 'colorbalance=bs=0.10:bm=0.06:rh=-0.04,eq=brightness=-0.03:saturation=0.9',
  'Golden hour': 'colorbalance=rm=0.10:gm=0.04:bm=-0.08:rh=0.08:gh=0.03:bh=-0.06,eq=saturation=1.08',
  'Bleach bypass': 'eq=saturation=0.55:contrast=1.25',
  'Vintage': 'curves=preset=vintage,eq=saturation=0.85',
  'Cross process': 'curves=preset=cross_process',
  'Black & white': 'hue=s=0,eq=contrast=1.15',
  'Moody matte': 'curves=all=0/0.06 0.5/0.47 1/0.94,eq=saturation=0.85',
};

function ffPath(p) { return String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'"); }

// stats → Auto Balance; stats + ref → Shot Match (Resolve's Color Match idea, on average colour + levels)
function gradeChain(stats, ref, opt = {}) {
  const parts = [];
  if (stats && (opt.auto || ref)) {
    const target = ref || (() => { const a = (stats.r + stats.g + stats.b) / 3; return { r: a, g: a, b: a, lo: Math.min(stats.lo, 0.04), hi: Math.max(stats.hi, 0.94) }; })();
    const k = ref ? 1 : 0.75; // auto balance is a little gentler than a full match
    const gain = (src, dst) => f3(clamp(1 + (dst / Math.max(src, 0.02) - 1) * k, 0.7, 1.45));
    parts.push(`colorchannelmixer=rr=${gain(stats.r, target.r)}:gg=${gain(stats.g, target.g)}:bb=${gain(stats.b, target.b)}`);
    const lo = clamp(stats.lo, 0, 0.25), hi = clamp(stats.hi, 0.6, 1);
    const olo = clamp(target.lo, 0, 0.2), ohi = clamp(target.hi, 0.7, 1);
    if (hi - lo > 0.2) parts.push(`colorlevels=rimin=${f3(lo)}:gimin=${f3(lo)}:bimin=${f3(lo)}:rimax=${f3(hi)}:gimax=${f3(hi)}:bimax=${f3(hi)}:romin=${f3(olo)}:gomin=${f3(olo)}:bomin=${f3(olo)}:romax=${f3(ohi)}:gomax=${f3(ohi)}:bomax=${f3(ohi)}`);
  }
  if (opt.lut && fs.existsSync(opt.lut)) parts.push(`lut3d=file='${ffPath(opt.lut)}'`);
  else if (opt.look && LOOKS[opt.look]) parts.push(LOOKS[opt.look]);
  if (opt.vignette) parts.push('vignette=angle=PI/5');
  if (opt.grain) parts.push('noise=alls=7:allf=t');
  return parts.filter(Boolean).join(',');
}

const SIZES = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350], '21:9': [2560, 1080] };
const reframe = (W, H) => `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`; // Smart Reframe (centre)

function outDirFor(userData) { const d = path.join(userData, 'library'); fs.mkdirSync(d, { recursive: true }); return d; }

/* ───────────── AUTO EDIT ───────────── */
// opts: { clips:[path], music, aspect, length, pace:'beat'|'2beats'|'4beats'|'calm', transition, auto, matchRef, look, lut, vignette, grain, outDir }
async function autoEdit(userData, opts, onProgress = () => {}) {
  const ff = findFfmpeg(userData);
  if (!ff) throw new Error('FFMPEG_MISSING');
  const clips = (opts.clips || []).filter((f) => f && fs.existsSync(f));
  if (!clips.length) throw new Error('Add at least one video clip or image.');
  const [W, H] = SIZES[opts.aspect] || SIZES['9:16'];

  onProgress({ stage: 'Reading your clips', pct: 2 });
  const infos = [];
  for (const f of clips) {
    const i = await probe(ff, f);
    if (!i.image && i.duration < 0.3) continue; // unreadable → skip instead of failing
    infos.push(i);
  }
  if (!infos.length) throw new Error('None of these files could be read as video or images.');

  onProgress({ stage: 'Finding shots (scene detection)', pct: 8 });
  for (const i of infos) i.cuts = i.image || i.duration < 5 ? [] : await scenes(ff, i.file).catch(() => []);

  let beat = null;
  if (opts.music && fs.existsSync(opts.music)) {
    onProgress({ stage: 'Detecting the beat', pct: 18 });
    beat = await beats(ff, opts.music).catch(() => null);
  }

  if (opts.cube) opts.cubeFile = tempCube(opts.cube);
  if (opts.highlights) {
    onProgress({ stage: 'Finding the best moments', pct: 14 });
    for (const i of infos) if (!i.image && i.duration > 3) i.act = await activity(ff, i.file).catch(() => null);
  }
  const wantColor = opts.auto || opts.matchRef || opts.look !== 'none' || opts.lut || opts.cubeFile;
  if (wantColor) onProgress({ stage: 'Analysing colour', pct: 26 });
  if (opts.auto || opts.matchRef) for (const i of infos) i.stats = await colorStats(ff, i).catch(() => null);
  let ref = null;
  if (opts.matchRef) {
    const ri = infos.find((i) => i.file === opts.matchRef) || await probe(ff, opts.matchRef).catch(() => null);
    ref = ri ? (ri.stats || await colorStats(ff, ri).catch(() => null)) : null;
  }

  // segment length from the beat (or a calm default)
  const per = { beat: 1, '2beats': 2, '4beats': 4, '8beats': 8 }[opts.pace];
  const segLen = beat && per ? clamp(beat.period * per, 0.35, 8) : opts.pace === 'calm' ? 4 : 2.5;
  const sumClips = infos.reduce((s, i) => s + (i.image ? 3 : i.duration), 0);
  const total = clamp(+opts.length || (beat ? Math.min(beat.duration, 90) : Math.min(sumClips, 60)), 3, 600);
  let trans = opts.transition === 'zoomin' ? 'radial' : (opts.transition || 'cut');
  if (!['cut', 'mixed', 'fade', 'fadeblack', 'fadewhite', 'dissolve', 'smoothleft', 'smoothright', 'slideup', 'slideleft', 'radial', 'circleopen', 'circleclose', 'wipeleft', 'wiperight', 'pixelize'].includes(trans)) trans = 'fade';
  const XF = ['fade', 'fadeblack', 'fadewhite', 'dissolve', 'smoothleft', 'smoothright', 'slideup', 'slideleft', 'radial', 'circleopen', 'circleclose', 'wipeleft', 'wiperight', 'pixelize'];
  const pickedMix = (opts.mixSet || []).filter((x) => XF.includes(x));
  const MIX = pickedMix.length ? pickedMix : ['fade', 'smoothleft', 'circleopen', 'slideup', 'radial', 'fadeblack', 'dissolve', 'wipeleft']; // all exist since ffmpeg 4.3
  let T = trans === 'cut' ? 0 : clamp(segLen * 0.3, 0.12, 0.6);

  // build the segment list: round-robin through clips, each segment starts on a fresh shot when possible
  const segs = []; const cursor = new Map(); let t = 0; let k = 0; let guard = 0;
  // beat-sync: snap cut times to the beat grid so cuts land exactly on the music
  const nextCut = (from) => {
    if (!beat || !per) return from + segLen;
    const target = from + segLen;
    let bestB = target, bestD = 1e9;
    for (const b of beat.beats) { const d = Math.abs(b - target); if (d < bestD) { bestD = d; bestB = b; } if (b > target + segLen) break; }
    return bestB > from + 0.25 ? bestB : from + segLen;
  };
  while (t < total - 0.05 && guard++ < 2000) {
    const info = infos[k % infos.length]; k++;
    const end = Math.min(total, nextCut(t));
    const d = end - t;
    if (d < 0.1) break;
    let start = 0;
    const hl = !info.image && info.act ? bestWindow(info.act, d + T, (info.used = info.used || []), info.duration) : null;
    if (hl != null) { start = hl; info.used.push([hl, hl + d + T]); }
    else if (!info.image) {
      let c = cursor.get(info.file) || 0;
      const fresh = info.cuts.find((x) => x >= c && x + d <= info.duration);
      start = fresh != null ? fresh : c;
      if (start + d + T > info.duration) start = Math.max(0, Math.min(c, info.duration - d - T));
      if (start + d > info.duration) start = 0;
      cursor.set(info.file, start + d + 0.05 >= info.duration - 0.2 ? 0 : start + d + 0.05);
    }
    segs.push({ info, start, d });
    t = end;
  }

  // never leave a sliver at the end: a segment shorter than the transition would stall xfade
  while (segs.length > 1 && segs[segs.length - 1].d < Math.max(0.6, T * 1.6)) { const tail = segs.pop(); segs[segs.length - 1].d += tail.d; }
  const minLen = Math.min(...segs.map((x) => x.d));
  if (T > minLen * 0.45) T = Math.max(0, +(minLen * 0.45).toFixed(3));
  onProgress({ stage: `Cutting ${segs.length} shots${beat ? ' to ' + beat.bpm + ' BPM' : ''}`, pct: 32 });

  const args = ['-y'];
  const graph = [];
  segs.forEach((s, i) => {
    const len = s.d + (i < segs.length - 1 ? T : 0); // overlap for the transition so cuts stay on the beat
    const grade = gradeChain(s.info.stats, ref, opts);
    if (s.info.image) {
      args.push('-i', s.info.file); // single frame in → zoompan generates every output frame
      const frames = Math.max(2, Math.round(len * 30));
      // gentle Ken-Burns push-in for stills
      graph.push(`[${i}:v]${reframe(Math.round(W * 1.5 / 2) * 2, Math.round(H * 1.5 / 2) * 2)},zoompan=z='min(zoom+${(0.12 / frames).toFixed(5)},1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30${grade ? ',' + grade : ''},format=yuv420p,trim=duration=${len.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    } else {
      const avail = s.info.duration - s.start;
      args.push('-ss', s.start.toFixed(3), '-t', Math.min(len, avail).toFixed(3), '-i', s.info.file);
      const stretch = avail < len ? `,setpts=${f3(Math.min(2, len / Math.max(avail, 0.05)))}*PTS,tpad=stop_mode=clone:stop_duration=${len.toFixed(2)}` : '';
      // punch-in zoom on every other cut (CapCut-style energy), zoompan with one output frame per input frame
      const zp = opts.zoomPulse && i % 2 === 1 ? `,zoompan=z='1+${(0.06 * opts.zoomPulse).toFixed(3)}*on/${Math.max(2, Math.round(len * 30))}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=30` : '';
      graph.push(`[${i}:v]${reframe(W, H)},fps=30${zp}${stretch}${grade ? ',' + grade : ''},format=yuv420p,trim=duration=${len.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    }
  });
  // transitions
  let last = 'v0';
  if (segs.length > 1) {
    if (trans === 'cut') {
      graph.push(segs.map((_, i) => `[v${i}]`).join('') + `concat=n=${segs.length}:v=1:a=0[vout]`);
      last = 'vout';
    } else {
      let offset = 0;
      for (let i = 1; i < segs.length; i++) {
        offset += segs[i - 1].d;
        const kind = trans === 'mixed' ? MIX[i % MIX.length] : trans;
        const out = i === segs.length - 1 ? 'vout' : `x${i}`;
        graph.push(`[${last}][v${i}]xfade=transition=${kind}:duration=${T.toFixed(3)}:offset=${offset.toFixed(3)}[${out}]`);
        last = out;
      }
    }
  } else { graph.push('[v0]null[vout]'); last = 'vout'; }

  const outLen = segs.reduce((s, x) => s + x.d, 0);
  // finishing: cinematic bars, clarity/vignette/grain, opening title
  const post = [];
  if (opts.letterbox) { const bar = Math.round(H * (W > H ? 0.12 : 0.08)); post.push(`drawbox=x=0:y=0:w=iw:h=${bar}:color=black:t=fill`, `drawbox=x=0:y=ih-${bar}:w=iw:h=${bar}:color=black:t=fill`); }
  if (Array.isArray(opts.finish)) post.push(...opts.finish.filter((f) => /^[a-z0-9_]+=[\w.:=\/-]+$/i.test(f)));
  const font = opts.title ? titleFont() : null;
  if (opts.title && font) {
    const fs1 = Math.round(Math.min(W, H) * 0.075);
    post.push(`drawtext=fontfile='${ffPath(font)}':text='${ffText(opts.title)}':fontcolor=white:fontsize=${fs1}:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black@0.6:shadowx=2:shadowy=2:alpha='if(lt(t,0.3),0,if(lt(t,0.8),(t-0.3)/0.5,if(lt(t,2.6),1,if(lt(t,3.2),(3.2-t)/0.6,0))))'`);
  }
  if (post.length) { graph.push(`[${last}]${post.join(',')}[vpost]`); last = 'vpost'; }
  let audioMap = [];
  if (beat || (opts.music && fs.existsSync(opts.music))) {
    args.push('-i', opts.music);
    const ai = segs.length;
    graph.push(`[${ai}:a]atrim=0:${outLen.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,afade=t=out:st=${Math.max(0, outLen - 1.5).toFixed(3)}:d=1.5[aout]`);
    audioMap = ['-map', '[aout]', '-c:a', 'aac', '-b:a', '192k'];
  }
  const out = path.join(opts.outDir || outDirFor(userData), Date.now() + '-pandora-cut.mp4');
  args.push('-filter_complex', graph.join(';'), '-map', `[${last}]`, ...audioMap,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', outLen.toFixed(3), out);

  const r = await run(ff, args, {
    timeout: Math.max(180000, outLen * 90000), // safety net: never hang forever
    onStderr: (s) => {
      const m = s.match(/time=(\d+):(\d+):([\d.]+)/);
      if (m) { const sec = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]); onProgress({ stage: 'Rendering', pct: Math.min(99, 35 + Math.round((sec / outLen) * 64)) }); }
    },
  });
  if (r.code !== 0 || !fs.existsSync(out)) throw new Error(friendly(r.stderr));
  onProgress({ stage: 'Done', pct: 100 });
  return { file: out, shots: segs.length, bpm: beat ? beat.bpm : null, duration: +outLen.toFixed(2) };
}

/* ───────────── ANIMATE A STILL (free video shot on any PC: slow cinematic push-in / pan) ───────────── */
async function animateStill(userData, { image, seconds = 5, aspect = '16:9', move = 'push', outFile }) {
  const ff = findFfmpeg(userData);
  if (!ff) throw new Error('FFMPEG_MISSING');
  if (!image || !fs.existsSync(image)) throw new Error('Image not found.');
  const [W, H] = SIZES[aspect] || SIZES['16:9'];
  const frames = Math.round(seconds * 30);
  const z = { push: `min(1+0.0009*on,1.25)`, pull: `max(1.25-0.0009*on,1)`, pan: '1.15' }[move] || 'min(1+0.0009*on,1.25)';
  const x = move === 'pan' ? `(iw-iw/zoom)*on/${frames}` : 'iw/2-(iw/zoom/2)';
  const out = outFile || path.join(outDirFor(userData), Date.now() + '-still-motion.mp4');
  const r = await run(ff, ['-y', '-i', image, '-vf', `${reframe(Math.round(W * 1.5 / 2) * 2, Math.round(H * 1.5 / 2) * 2)},zoompan=z='${z}':x='${x}':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30,format=yuv420p`, '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart', out], { timeout: 300000 });
  if (r.code !== 0 || !fs.existsSync(out)) throw new Error(friendly(r.stderr));
  return out;
}

/* ───────────── JUMP CUT (talking videos: remove silences, keep the speech) ───────────── */
async function jumpCut(userData, opts, onProgress = () => {}) {
  const ff = findFfmpeg(userData);
  if (!ff) throw new Error('FFMPEG_MISSING');
  if (!opts.file || !fs.existsSync(opts.file)) throw new Error('Choose a talking video first.');
  onProgress({ stage: 'Listening for pauses', pct: 5 });
  const info = await probe(ff, opts.file);
  if (!info.audio) throw new Error('This video has no sound — jump cuts need speech to find the pauses.');
  const sil = await silences(ff, opts.file, opts.noiseDb || -35, opts.minSilence || 0.45);
  const pad = opts.padding ?? 0.12;
  const keep = []; let cur = 0;
  for (const [a, b] of sil) { if (a - pad > cur + 0.15) keep.push([Math.max(0, cur), a + pad]); cur = Math.max(cur, b - pad); }
  if (info.duration - cur > 0.15) keep.push([cur, info.duration]);
  if (!keep.length) throw new Error('No speech found — try a lower silence threshold.');
  const removed = info.duration - keep.reduce((s, [a, b]) => s + (b - a), 0);
  onProgress({ stage: `Cutting ${sil.length} pauses (−${removed.toFixed(1)} s)`, pct: 20 });
  const cubeFile = tempCube(opts.cube);
  const vf = [...(cubeFile ? [`lut3d=file='${ffPath(cubeFile)}'`] : []), ...(Array.isArray(opts.finish) ? opts.finish : [])];
  const sel = keep.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+');
  const vchain = [`select='${sel}'`, 'setpts=N/FRAME_RATE/TB', ...vf, 'format=yuv420p'].join(',');
  const achain = `aselect='${sel}',asetpts=N/SR/TB`;
  const out = path.join(opts.outDir || outDirFor(userData), Date.now() + '-pandora-jumpcut.mp4');
  const total = info.duration - removed;
  const r = await run(ff, ['-y', '-i', opts.file, '-vf', vchain, '-af', achain, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], {
    onStderr: (t) => { const m = t.match(/time=(\d+):(\d+):([\d.]+)/); if (m) { const sec = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]); onProgress({ stage: 'Rendering', pct: Math.min(99, 22 + Math.round(sec / total * 77)) }); } },
  });
  if (r.code !== 0 || !fs.existsSync(out)) throw new Error(friendly(r.stderr));
  onProgress({ stage: 'Done', pct: 100 });
  return { file: out, removed: +removed.toFixed(1), cuts: sil.length, duration: +total.toFixed(1) };
}

/* ───────────── RENDER A GRADE (Color tab): LUT from the grade engine + finishing filters ───────────── */
async function renderGrade(userData, opts, onProgress = () => {}) {
  const ff = findFfmpeg(userData);
  if (!ff) throw new Error('FFMPEG_MISSING');
  if (!opts.file || !fs.existsSync(opts.file)) throw new Error('Choose a video or photo to grade.');
  const info = await probe(ff, opts.file);
  const cubeFile = tempCube(opts.cube);
  const finish = (Array.isArray(opts.finish) ? opts.finish : []).filter((f) => /^[a-z0-9_]+=[\w.:=\/-]+$/i.test(f));
  const vf = [...(cubeFile ? [`lut3d=file='${ffPath(cubeFile)}'`] : []), ...finish].join(',') || 'null';
  const base = path.basename(opts.file).replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 40);
  const out = path.join(opts.outDir || outDirFor(userData), `${Date.now()}-${base}-graded${info.image ? '.jpg' : '.mp4'}`);
  const args = ['-y', '-i', opts.file, '-vf', info.image ? vf : vf + ',format=yuv420p'];
  if (info.image) args.push('-frames:v', '1', '-q:v', '2', out);
  else args.push('-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'copy', '-movflags', '+faststart', out);
  onProgress({ stage: 'Rendering', pct: 3 });
  const r = await run(ff, args, {
    onStderr: (t) => { const m = t.match(/time=(\d+):(\d+):([\d.]+)/); if (m && info.duration) { const sec = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]); onProgress({ stage: 'Rendering', pct: Math.min(99, 3 + Math.round(sec / info.duration * 96)) }); } },
  });
  if (r.code !== 0 || !fs.existsSync(out)) throw new Error(friendly(r.stderr));
  onProgress({ stage: 'Done', pct: 100 });
  return { file: out, image: info.image };
}

/* ───────────── AUTO COLOR (one clip, keeps its audio) ───────────── */
async function autoColor(userData, opts, onProgress = () => {}) {
  const ff = findFfmpeg(userData);
  if (!ff) throw new Error('FFMPEG_MISSING');
  if (!opts.file || !fs.existsSync(opts.file)) throw new Error('Choose a video or image to grade.');
  onProgress({ stage: 'Analysing colour', pct: 5 });
  const info = await probe(ff, opts.file);
  const stats = (opts.auto || opts.matchRef) ? await colorStats(ff, info) : null;
  let ref = null;
  if (opts.matchRef && fs.existsSync(opts.matchRef)) ref = await colorStats(ff, await probe(ff, opts.matchRef));
  const grade = gradeChain(stats, ref, opts) || 'null';
  const ext = info.image ? '.png' : '.mp4';
  const out = path.join(opts.outDir || outDirFor(userData), Date.now() + '-pandora-graded' + ext);
  const args = ['-y', '-i', opts.file, '-vf', grade + (info.image ? '' : ',format=yuv420p')];
  if (info.image) args.push('-frames:v', '1', out);
  else args.push('-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'copy', '-movflags', '+faststart', out);
  const r = await run(ff, args, {
    onStderr: (s) => {
      const m = s.match(/time=(\d+):(\d+):([\d.]+)/);
      if (m && info.duration) { const sec = (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]); onProgress({ stage: 'Rendering', pct: Math.min(99, 10 + Math.round((sec / info.duration) * 89)) }); }
    },
  });
  if (r.code !== 0 || !fs.existsSync(out)) throw new Error(friendly(r.stderr));
  onProgress({ stage: 'Done', pct: 100 });
  return { file: out };
}

// Before/after still for the grade preview
async function previewGrade(userData, opts) {
  const ff = findFfmpeg(userData);
  if (!ff) throw new Error('FFMPEG_MISSING');
  const info = await probe(ff, opts.file);
  const stats = (opts.auto || opts.matchRef) ? await colorStats(ff, info) : null;
  let ref = null;
  if (opts.matchRef && fs.existsSync(opts.matchRef)) ref = await colorStats(ff, await probe(ff, opts.matchRef));
  const grade = gradeChain(stats, ref, opts) || 'null';
  const t = info.image ? null : Math.max(0, info.duration * 0.4);
  const dir = path.join(os.tmpdir(), 'pandora-cut'); fs.mkdirSync(dir, { recursive: true });
  try { for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f)); } catch (_) { /* keep temp folder small */ }
  const stamp = Date.now();
  const before = path.join(dir, stamp + '-before.jpg'); const after = path.join(dir, stamp + '-after.jpg');
  const seek = t != null ? ['-ss', t.toFixed(2)] : [];
  await run(ff, ['-y', ...seek, '-i', opts.file, '-frames:v', '1', '-vf', 'scale=640:-2', before], { timeout: 30000 });
  const r = await run(ff, ['-y', ...seek, '-i', opts.file, '-frames:v', '1', '-vf', grade + ',scale=640:-2', after], { timeout: 30000 });
  if (r.code !== 0) throw new Error(friendly(r.stderr));
  return { before, after, stats };
}

function friendly(stderr) {
  const s = String(stderr || '');
  if (/No space left/i.test(s)) return 'Not enough disk space to render. Free some space and try again.';
  if (/Invalid data found|moov atom not found/i.test(s)) return 'One of the files is damaged or not a supported video. Remove it and try again.';
  if (/lut3d|\.cube/i.test(s) && /Error|Invalid/i.test(s)) return 'That LUT file could not be read — use a 3D .cube LUT.';
  if (/Exiting normally, received signal|signal 15|killed/i.test(s)) return 'cancelled';
  const tail = s.split('\n').filter((l) => /error|invalid|failed/i.test(l)).slice(-2).join(' ').trim();
  return 'Rendering failed' + (tail ? ': ' + tail.slice(0, 220) : '. Try fewer clips or a different transition.');
}

module.exports = { animateStill, findFfmpeg, ensureFfmpeg, autoEdit, autoColor, previewGrade, beats, cancelAll, frame, jumpCut, renderGrade, LOOKS: Object.keys(LOOKS) };
