import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError } from '../lib/job.jsx';
import { useStore, uid } from '../lib/store.jsx';
import { usePersist } from '../lib/qol.jsx';
import Media from '../lib/Media.jsx';
import { EFFECTS, FX_CATS, fxById, fxCss } from '../lib/effects.js';
import { DEFAULTS, LOOKS, lookById, buildLUT, lutToCube, ffmpegFinish, sampleStats, autoParams } from '../lib/grade.js';
import { loadImageData } from '../lib/GradeUI.jsx';
import { OpenButtons } from '../lib/Viewer.jsx';
import { drawText, textAnim, textPng, TEXT_DEFAULT, TEXT_PRESETS, FONTS } from '../lib/textRender.js';

// Pandora Edit — a DaVinci-Resolve-style editor: media pool, viewer, inspector and a multi-track timeline
// (V1 storyline + overlay tracks + titles + audio), blade/trim/ripple/snapping, J/K/L, in/out, undo, and
// one-click auto editing (beat montage, shot detection, silence removal, captions, transitions, colour).
// Everything renders with ffmpeg on this PC (electron/timeline.js) — free and offline.

const ASPECTS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '21:9': [2560, 1080], '4:3': [1440, 1080] };
const TRANSITIONS = [
  ['dissolve', 'Cross Dissolve'], ['fade', 'Fade'], ['fadeblack', 'Dip to Black'], ['fadewhite', 'Dip to White'], ['fadegrays', 'Fade Greys'],
  ['wipeleft', 'Wipe Left'], ['wiperight', 'Wipe Right'], ['wipeup', 'Wipe Up'], ['wipedown', 'Wipe Down'], ['wipetl', 'Wipe Corner'],
  ['slideleft', 'Slide Left'], ['slideright', 'Slide Right'], ['slideup', 'Slide Up'], ['slidedown', 'Slide Down'],
  ['smoothleft', 'Smooth Left'], ['smoothright', 'Smooth Right'], ['smoothup', 'Smooth Up'], ['smoothdown', 'Smooth Down'],
  ['circleopen', 'Iris Open'], ['circleclose', 'Iris Close'], ['circlecrop', 'Circle Crop'], ['rectcrop', 'Box Crop'], ['radial', 'Clock Wipe'],
  ['horzopen', 'Barn Door H'], ['vertopen', 'Barn Door V'], ['diagtl', 'Diagonal'], ['hlslice', 'Slices'], ['vuslice', 'Blinds'],
  ['pixelize', 'Pixelize'], ['zoomin', 'Zoom In'], ['hblur', 'Blur'], ['distance', 'Distance'], ['squeezeh', 'Squeeze'], ['hlwind', 'Wind'],
];
const ANIMS = [['none', 'None'], ['slideup', 'Slide up'], ['drop', 'Drop in'], ['slideleft', 'Slide from right'], ['slideright', 'Slide from left']];
const base = (f) => String(f || '').split(/[\\/]/).pop();
const kindOf = (f) => (/\.(png|jpe?g|webp|bmp|gif)$/i.test(f) ? 'image' : /\.(mp3|wav|m4a|aac|flac|ogg|opus)$/i.test(f) ? 'audio' : 'video');
const mediaUrl = (f) => 'media://' + String(f).replace(/%/g, '%25').replace(/#/g, '%23').replace(/\?/g, '%3F');
const tc = (s, fps = 30) => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), f = Math.floor((s % 1) * fps); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}:${String(f).padStart(2, '0')}`; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const newTrack = (type, name) => ({ id: uid(), type, name, muted: false, hidden: false, locked: false, clips: [] });
const NEW_PROJECT = () => ({ name: 'My edit', aspect: '16:9', fps: 30, tracks: [newTrack('video', 'V1'), newTrack('video', 'V2'), newTrack('text', 'T1'), newTrack('audio', 'A1'), newTrack('audio', 'A2')] });
const end = (c) => c.start + c.dur;
const accepts = (track, kind) => (track.type === 'audio' ? kind === 'audio' : track.type === 'text' ? kind === 'text' : kind === 'video' || kind === 'image');

export default function PandoraEdit() {
  const { db, update } = useStore();
  const [ff, setFf] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [project, setProjectRaw] = usePersist('edit.project', null);
  const proj = project || NEW_PROJECT();
  const [pool, setPool] = usePersist('edit.pool', []); // [{ file, kind, duration, width, height, audio }]
  const [thumbs, setThumbs] = useState({}); // file → { dataUrl, count }
  const [peaks, setPeaks] = useState({}); // file → { pps, data }
  const [sel, setSel] = useState([]); // selected clip ids
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [pps, setPps] = useState(60); // timeline zoom: pixels per second
  const [tool, setTool] = useState('select');
  const [snap, setSnap] = useState(true);
  const [mark, setMark] = useState({ in: null, out: null });
  const [left, setLeft] = usePersist('edit.leftTab', 'media');
  const [insp, setInsp] = useState('video');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [showRender, setShowRender] = useState(false);
  const job = useJob();
  const past = useRef([]); const future = useRef([]); const pending = useRef(null);
  const tRef = useRef(0); tRef.current = t;
  const W = (ASPECTS[proj.aspect] || ASPECTS['16:9'])[0], H = (ASPECTS[proj.aspect] || ASPECTS['16:9'])[1];

  useEffect(() => { window.api.cut?.status().then((s) => setFf(!!s.ffmpeg)).catch(() => setFf(false)); }, []);
  useEffect(() => { const off = window.api.cut?.onProgress?.((p) => setProgress(p)); return typeof off === 'function' ? off : undefined; }, []);

  /* ── history ── */
  const setProject = useCallback((next, record = true) => {
    setProjectRaw((cur) => {
      const c = cur || NEW_PROJECT();
      const n = typeof next === 'function' ? next(clone(c)) : next;
      // live changes (dragging a slider or a clip) don't add undo steps; the final commit records the state
      // from before the gesture started, so one Ctrl+Z undoes the whole drag
      if (!record) { if (!pending.current) pending.current = c; }
      else { past.current.push(pending.current || c); pending.current = null; if (past.current.length > 120) past.current.shift(); future.current = []; }
      return n;
    });
  }, [setProjectRaw]);
  const undo = () => { pending.current = null; const p = past.current.pop(); if (!p) return; future.current.push(proj); setProjectRaw(p); };
  const redo = () => { const n = future.current.pop(); if (!n) return; past.current.push(proj); setProjectRaw(n); };

  const allClips = useMemo(() => proj.tracks.flatMap((tr) => tr.clips.map((c) => ({ ...c, track: tr }))), [proj]);
  const total = useMemo(() => Math.max(0, ...allClips.map(end)), [allClips]);
  const selClip = allClips.find((c) => c.id === sel[0]) || null;
  const poolInfo = (f) => pool.find((p) => p.file === f);
  const srcLen = (c) => { const p = poolInfo(c.file); return c.kind === 'video' || c.kind === 'audio' ? Math.max(0.05, ((p?.duration || c.srcDur || 9999) - (c.in || 0)) / (c.speed || 1)) : 36000; };

  const updateClip = (id, patch, record = true) => setProject((p) => { for (const tr of p.tracks) for (const c of tr.clips) if (c.id === id) Object.assign(c, typeof patch === 'function' ? patch(c) : patch); return p; }, record);

  /* ── media pool ── */
  const loadMeta = async (file) => {
    try {
      const info = await window.api.cut.analyze({ file, peaks: true });
      if (info.peaks) setPeaks((m) => ({ ...m, [file]: info.peaks }));
      if (!info.image && info.width) window.api.cut.thumbs({ file, count: 10 }).then((th) => setThumbs((m) => ({ ...m, [file]: th }))).catch(() => {});
      else if (info.image) window.api.cut.thumbs({ file }).then((th) => setThumbs((m) => ({ ...m, [file]: th }))).catch(() => {});
      return { file, kind: info.image ? 'image' : (!info.width || kindOf(file) === 'audio') ? 'audio' : 'video', duration: info.duration || 0, width: info.width, height: info.height, audio: info.audio };
    } catch (e) { if (/FFMPEG_MISSING/.test(String(e.message))) setFf(false); return null; }
  };
  const addToPool = async (files) => {
    const list = [...new Set((files || []).filter(Boolean))].filter((f) => !pool.some((p) => p.file === f));
    if (!list.length) return [];
    setBusy('Reading media…');
    const metas = (await Promise.all(list.map(loadMeta))).filter(Boolean);
    setPool((p) => [...p, ...metas]); setBusy('');
    return metas;
  };
  useEffect(() => { if (ff) for (const p of pool) if (!thumbs[p.file]) loadMeta(p.file); }, [ff]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── placing clips ── */
  const trackFor = (p, kind) => p.tracks.find((tr) => accepts(tr, kind) && !tr.locked);
  const makeClip = (m, start) => ({ id: uid(), file: m.file, kind: m.kind, start, dur: m.kind === 'image' ? 4 : Math.max(0.1, m.duration || 4), in: 0, speed: 1, volume: 1, srcDur: m.duration, fadeIn: 0, fadeOut: 0, fx: [], grade: null, fit: 'fill', scale: 1, x: 0, y: 0, opacity: 1 });
  const appendMedia = (m, trackId = null, at = null) => setProject((p) => {
    const tr = (trackId && p.tracks.find((x) => x.id === trackId)) || trackFor(p, m.kind);
    if (!tr || !accepts(tr, m.kind)) return p;
    const start = at != null ? at : Math.max(0, ...tr.clips.map(end));
    const c = makeClip(m, start); tr.clips.push(c); setSel([c.id]); return p;
  });
  const addText = (preset, at = tRef.current) => setProject((p) => {
    const tr = p.tracks.find((x) => x.type === 'text' && !x.locked) || (p.tracks.push(newTrack('text', 'T' + (p.tracks.filter((x) => x.type === 'text').length + 1))), p.tracks[p.tracks.length - 1]);
    const c = { id: uid(), kind: 'text', start: at, dur: 3, fadeIn: 0.3, fadeOut: 0.3, anim: 'slideup', text: { ...TEXT_DEFAULT, ...(preset?.text || {}) } };
    tr.clips.push(c); setSel([c.id]); setInsp('text'); return p;
  });

  /* ── edit operations ── */
  const splitAt = (time, ids = null) => setProject((p) => {
    for (const tr of p.tracks) {
      if (tr.locked) continue;
      const out = [];
      for (const c of tr.clips) {
        if ((ids && !ids.includes(c.id)) || time <= c.start + 0.03 || time >= end(c) - 0.03) { out.push(c); continue; }
        const d1 = time - c.start;
        const a = { ...c, dur: d1, fadeOut: 0 };
        const b = { ...clone(c), id: uid(), start: time, dur: c.dur - d1, in: (c.in || 0) + d1 * (c.speed || 1), fadeIn: 0, transition: null };
        out.push(a, b);
      }
      tr.clips = out;
    }
    return p;
  });
  const deleteSel = (ripple = false) => { if (!sel.length) return; setProject((p) => {
    for (const tr of p.tracks) {
      if (tr.locked) continue;
      const gone = tr.clips.filter((c) => sel.includes(c.id));
      tr.clips = tr.clips.filter((c) => !sel.includes(c.id));
      if (ripple) for (const g of gone.sort((a, b) => b.start - a.start)) for (const c of tr.clips) if (c.start >= g.start) c.start = Math.max(0, c.start - g.dur);
    }
    return p;
  }); setSel([]); };
  const duplicateSel = () => setProject((p) => { const ids = []; for (const tr of p.tracks) { const add = tr.clips.filter((c) => sel.includes(c.id)).map((c) => ({ ...clone(c), id: uid(), start: Math.max(...tr.clips.map(end)) })); add.forEach((c) => { tr.clips.push(c); ids.push(c.id); }); } setSel(ids); return p; });
  const clipboard = useRef(null);
  const copySel = () => { clipboard.current = allClips.filter((c) => sel.includes(c.id)).map(({ track, ...c }) => ({ c: clone(c), trackId: track.id })); };
  const paste = () => { const cb = clipboard.current; if (!cb || !cb.length) return; const t0 = Math.min(...cb.map((x) => x.c.start)); setProject((p) => { const ids = []; for (const x of cb) { const tr = p.tracks.find((y) => y.id === x.trackId) || trackFor(p, x.c.kind); if (!tr) continue; const c = { ...clone(x.c), id: uid(), start: tRef.current + (x.c.start - t0) }; tr.clips.push(c); ids.push(c.id); } setSel(ids); return p; }); };
  const closeGaps = (trackId) => setProject((p) => { const tr = p.tracks.find((x) => x.id === trackId) || p.tracks[0]; let cur = 0; for (const c of [...tr.clips].sort((a, b) => a.start - b.start)) { c.start = cur; cur = end(c); } return p; });

  /* ── playback ── */
  const raf = useRef(0); const clock = useRef({ t0: 0, wall: 0 });
  useEffect(() => {
    if (!playing) return undefined;
    clock.current = { t0: tRef.current, wall: performance.now() };
    const stopAt = mark.out != null && tRef.current < mark.out ? mark.out : total;
    const step = () => {
      const nt = clock.current.t0 + ((performance.now() - clock.current.wall) / 1000) * rate;
      if (nt >= stopAt || nt < 0) { setT(Math.max(0, Math.min(stopAt, nt))); setPlaying(false); return; }
      setT(nt); raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, rate]); // eslint-disable-line react-hooks/exhaustive-deps
  const togglePlay = () => { if (!playing && tRef.current >= total - 0.05) setT(mark.in ?? 0); setRate(1); setPlaying((v) => !v); };
  const seek = (time) => { setT(Math.max(0, Math.min(Math.max(total, 1), time))); if (playing) clock.current = { t0: time, wall: performance.now() }; };

  /* ── keyboard (Resolve-style shortcuts) ── */
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase(); const ctrl = e.ctrlKey || e.metaKey; const fr = 1 / (proj.fps || 30);
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (k === 'k') { setPlaying(false); setRate(1); }
    else if (k === 'l') { setRate((r) => (playing && r > 0 ? Math.min(8, r * 2) : 1)); setPlaying(true); }
    else if (k === 'j') { setPlaying(false); seek(tRef.current - 1); }
    else if (k === 'arrowleft') { e.preventDefault(); setPlaying(false); seek(tRef.current - (e.shiftKey ? 1 : fr)); }
    else if (k === 'arrowright') { e.preventDefault(); setPlaying(false); seek(tRef.current + (e.shiftKey ? 1 : fr)); }
    else if (k === 'home') seek(0);
    else if (k === 'end') seek(total);
    else if (k === 'i' && !ctrl) setMark((m) => ({ ...m, in: tRef.current }));
    else if (k === 'o' && !ctrl) setMark((m) => ({ ...m, out: tRef.current }));
    else if (k === 'b' && ctrl) { e.preventDefault(); splitAt(tRef.current, sel.length ? sel : null); }
    else if (k === 'b') setTool('blade');
    else if (k === 'a' && !ctrl) setTool('select');
    else if (k === 's' && !ctrl) splitAt(tRef.current, sel.length ? sel : null);
    else if (k === 'n' && !ctrl) setSnap((v) => !v);
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(e.shiftKey); }
    else if (ctrl && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (ctrl && k === 'y') { e.preventDefault(); redo(); }
    else if (ctrl && k === 'd') { e.preventDefault(); duplicateSel(); }
    else if (ctrl && k === 'c') copySel();
    else if (ctrl && k === 'v') { e.preventDefault(); paste(); }
    else if (k === '=' || k === '+') setPps((v) => Math.min(600, v * 1.25));
    else if (k === '-') setPps((v) => Math.max(4, v / 1.25));
    else if (k === 'escape') setSel([]);
  };
  useEffect(() => { const h = (e) => keyRef.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  /* ── auto editing ── */
  const [auto, setAuto] = usePersist('edit.auto', { pace: 2, transition: 'none', length: 0, tdur: 0.4, captionWords: 5 });
  async function beatMontage() {
    setError('');
    const vids = pool.filter((p) => p.kind === 'video' || p.kind === 'image');
    const music = pool.find((p) => p.kind === 'audio') || pool.find((p) => p.kind === 'video' && p.audio && !vids.length);
    if (!vids.length) { setError('Add some videos or photos to the Media Pool first.'); return; }
    if (!music) { setError('Add a music track (mp3 / wav) to the Media Pool — cuts will land on its beat.'); return; }
    setBusy('Finding the beat…');
    try {
      const a = await window.api.cut.analyze({ file: music.file, beats: true });
      const beats = a.beats?.beats || [];
      const len = auto.length > 0 ? Math.min(auto.length, music.duration) : music.duration;
      const step = Math.max(1, +auto.pace || 2);
      const cuts = [0, ...beats.filter((b, i) => i % step === step - 1 && b > 0.3 && b < len - 0.3), len];
      setProject((p) => {
        const v1 = p.tracks.find((x) => x.type === 'video'); const a1 = p.tracks.find((x) => x.type === 'audio');
        v1.clips = []; a1.clips = [];
        for (let i = 0; i < cuts.length - 1; i++) {
          const m = vids[i % vids.length]; const d = cuts[i + 1] - cuts[i]; if (d < 0.08) continue;
          const round = Math.floor(i / vids.length);
          const room = Math.max(0, (m.duration || 0) - d);
          const inP = m.kind === 'video' ? (room * ((0.15 + round * 0.37) % 0.85)) : 0;
          const c = { ...makeClip(m, cuts[i]), dur: d, in: +inP.toFixed(3), volume: 0 };
          if (auto.transition !== 'none' && i > 0) c.transition = { type: auto.transition, dur: Math.min(auto.tdur, d * 0.5) };
          if (m.kind === 'image') c.fx = [{ id: i % 2 ? 'zoomin' : 'zoomout', amt: 0.6 }];
          v1.clips.push(c);
        }
        a1.clips.push({ ...makeClip(music, 0), dur: len, volume: 1, fadeOut: Math.min(2, len / 4) });
        return p;
      });
      setBusy(''); seek(0);
    } catch (e) { setBusy(''); setError(friendlyError(e)); }
  }
  async function detectScenes() {
    const c = selClip; if (!c || c.kind !== 'video') { setError('Select a video clip on the timeline first.'); return; }
    setBusy('Detecting shot changes…'); setError('');
    try {
      const a = await window.api.cut.analyze({ file: c.file, scenes: true });
      const times = (a.scenes || []).map((s) => c.start + (s - (c.in || 0)) / (c.speed || 1)).filter((x) => x > c.start + 0.1 && x < end(c) - 0.1);
      if (!times.length) { setBusy(''); setError('No shot changes found inside this clip.'); return; }
      setProject((p) => {
        for (const tr of p.tracks) {
          const i = tr.clips.findIndex((x) => x.id === c.id); if (i < 0) continue;
          const orig = tr.clips[i]; const parts = []; let st = orig.start;
          for (const x of [...times, end(orig)]) { parts.push({ ...clone(orig), id: parts.length ? uid() : orig.id, start: st, dur: x - st, in: (orig.in || 0) + (st - orig.start) * (orig.speed || 1), transition: parts.length ? null : orig.transition }); st = x; }
          tr.clips.splice(i, 1, ...parts);
        }
        return p;
      });
      setBusy('');
    } catch (e) { setBusy(''); setError(friendlyError(e)); }
  }
  async function removeSilences() {
    const c = selClip; if (!c || (c.kind !== 'video' && c.kind !== 'audio')) { setError('Select a talking video or voice clip first.'); return; }
    setBusy('Listening for pauses…'); setError('');
    try {
      const a = await window.api.cut.analyze({ file: c.file, silences: true, minSilence: 0.4 });
      const sp = c.speed || 1; const s0 = c.in || 0, s1 = s0 + c.dur * sp; const pad = 0.1;
      const keep = []; let cur = s0;
      for (const [x, y] of (a.silences || [])) { if (y < s0 || x > s1) continue; if (x - pad > cur + 0.12) keep.push([cur, Math.min(s1, x + pad)]); cur = Math.max(cur, y - pad); }
      if (s1 - cur > 0.12) keep.push([cur, s1]);
      if (keep.length <= 1) { setBusy(''); setError('No pauses long enough to cut.'); return; }
      const newDur = keep.reduce((s, [x, y]) => s + (y - x) / sp, 0); const removed = c.dur - newDur;
      setProject((p) => {
        for (const tr of p.tracks) {
          const i = tr.clips.findIndex((x) => x.id === c.id); if (i < 0) continue;
          const orig = tr.clips[i]; let st = orig.start;
          const parts = keep.map(([x, y], k) => { const q = { ...clone(orig), id: k ? uid() : orig.id, start: st, in: x, dur: (y - x) / sp, fadeIn: 0, fadeOut: 0, transition: k ? null : orig.transition }; st += q.dur; return q; });
          for (const o of tr.clips) if (o.start >= end(orig) - 0.01) o.start -= removed;
          tr.clips.splice(i, 1, ...parts);
        }
        return p;
      });
      setBusy('');
    } catch (e) { setBusy(''); setError(friendlyError(e)); }
  }
  async function autoCaptions() {
    const c = selClip && (selClip.kind === 'video' || selClip.kind === 'audio') ? selClip : allClips.find((x) => (x.kind === 'video' || x.kind === 'audio') && poolInfo(x.file)?.audio);
    if (!c) { setError('Select a clip with speech first.'); return; }
    setError(''); setBusy('Transcribing speech (free, on this PC)…');
    try {
      const [tx, a] = await Promise.all([window.api.stt.transcribe({ file: c.file }), window.api.cut.analyze({ file: c.file, silences: true, minSilence: 0.3 })]);
      const words = String(tx.text || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) throw new Error('No speech was recognised in this clip.');
      const sp = c.speed || 1; const s0 = c.in || 0, s1 = s0 + c.dur * sp;
      const speech = []; let cur = s0;
      for (const [x, y] of (a.silences || [])) { if (y < s0 || x > s1) continue; if (x > cur + 0.15) speech.push([cur, Math.min(x, s1)]); cur = Math.max(cur, y); }
      if (s1 - cur > 0.15) speech.push([cur, s1]);
      const spans = speech.length ? speech : [[s0, s1]];
      const totalSpeech = spans.reduce((s, [x, y]) => s + y - x, 0);
      const per = Math.max(1, +auto.captionWords || 5); const chunks = [];
      for (let i = 0; i < words.length; i += per) chunks.push(words.slice(i, i + per).join(' '));
      // place chunks along the speech time, proportional to word count
      const timeAt = (frac) => { let need = frac * totalSpeech; for (const [x, y] of spans) { if (need <= y - x) return x + need; need -= y - x; } return s1; };
      let wi = 0; const caps = chunks.map((txt) => { const n = txt.split(' ').length; const a0 = timeAt(wi / words.length), a1 = timeAt((wi + n) / words.length); wi += n; return { txt, a0, a1 }; });
      setProject((p) => {
        let tr = p.tracks.find((x) => x.type === 'text' && x.name === 'Captions');
        if (!tr) { tr = newTrack('text', 'Captions'); p.tracks.push(tr); }
        tr.clips = caps.map(({ txt, a0, a1 }) => ({ id: uid(), kind: 'text', start: c.start + (a0 - s0) / sp, dur: Math.max(0.3, (a1 - a0) / sp), fadeIn: 0, fadeOut: 0, anim: 'none', text: { ...TEXT_DEFAULT, ...TEXT_PRESETS.find((x) => x.id === 'caption').text, content: txt } }));
        return p;
      });
      setBusy('');
    } catch (e) { setBusy(''); setError(friendlyError(e)); }
  }
  const autoTransitions = (type) => setProject((p) => { const v1 = p.tracks.find((x) => x.type === 'video'); const cs = [...v1.clips].sort((a, b) => a.start - b.start); cs.forEach((c, i) => { if (i && Math.abs(cs[i - 1].start + cs[i - 1].dur - c.start) < 0.05) c.transition = type === 'cut' ? null : { type, dur: Math.min(auto.tdur, c.dur * 0.45) }; }); return p; });
  async function autoColor() {
    setError(''); setBusy('Balancing colour of every shot…');
    try {
      const vids = allClips.filter((c) => c.kind === 'video' || c.kind === 'image');
      const grades = {};
      for (const c of vids) {
        const fr = await window.api.cut.frame({ file: c.file, t: c.kind === 'video' ? (c.in || 0) + c.dur * (c.speed || 1) / 2 : null, max: 480 });
        const st = sampleStats(await loadImageData(fr.dataUrl, 480));
        grades[c.id] = { ...(c.grade || {}), ...autoParams(st) };
      }
      setProject((p) => { for (const tr of p.tracks) for (const c of tr.clips) if (grades[c.id]) c.grade = grades[c.id]; return p; });
      setBusy('');
    } catch (e) { setBusy(''); if (/FFMPEG_MISSING/.test(String(e.message))) setFf(false); else setError(friendlyError(e)); }
  }

  /* ── render ── */
  const [rq, setRq] = usePersist('edit.renderQ', { quality: 'good', range: 'all' });
  function buildRenderProject() {
    const r0 = rq.range === 'inout' && mark.in != null && mark.out != null && mark.out > mark.in ? [mark.in, mark.out] : null;
    const tracks = proj.tracks.map((tr) => ({
      type: tr.type, hidden: tr.hidden, muted: tr.muted,
      clips: tr.clips.flatMap((c) => {
        let st = c.start, d = c.dur, inn = c.in || 0;
        if (r0) { const a = Math.max(st, r0[0]), b = Math.min(st + d, r0[1]); if (b - a < 0.02) return []; inn += (a - st) * (c.speed || 1); d = b - a; st = a - r0[0]; }
        const g = { ...DEFAULTS, ...(c.grade || {}), fx: c.fx || [] };
        const needCube = !!c.grade || (c.fx || []).some((x) => fxById(x.id)?.kind === 'color' && x.on !== false);
        const out = { kind: c.kind, file: c.file, start: st, dur: d, in: inn, speed: c.speed || 1, volume: c.volume ?? 1, fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0, transition: c.transition || null, fit: c.fit || 'fill', scale: c.scale ?? 1, x: c.x || 0, y: c.y || 0, opacity: c.opacity ?? 1, anim: c.anim || 'none' };
        if (c.kind === 'text') out.png = textPng(c.text, W, H);
        else { out.cube = needCube ? lutToCube(buildLUT(g, 33)) : null; out.filters = ffmpegFinish(g, { video: true }); }
        return [out];
      }),
    }));
    return { W, H, fps: proj.fps || 30, tracks };
  }
  async function render() {
    setError(''); setResult(null);
    await job.start(async (jobId) => {
      try {
        setProgress({ stage: 'Preparing', pct: 0 });
        const r = await window.api.cut.renderTimeline({ jobId, project: buildRenderProject(), name: proj.name, quality: rq.quality });
        setResult(r.file); setShowRender(false);
        update((d) => { d.generations.unshift({ id: uid(), file: r.file, kind: 'video', prompt: `[Pandora Edit] ${proj.name}`, model: 'Pandora Edit (ffmpeg)', at: new Date().toISOString() }); return d; });
      } catch (e) { if (/FFMPEG_MISSING/.test(String(e.message))) setFf(false); else { const m = friendlyError(e); if (m && m !== 'cancelled') setError(m); } }
    });
    setProgress(null);
  }

  if (ff === false) {
    return (
      <div>
        <h1>🎬 Pandora Edit</h1>
        <div className="card" style={{ maxWidth: 620 }}>
          <h3 style={{ marginTop: 0 }}>One small free add-on first</h3>
          <p className="sub">The editor reads and renders video with <b>ffmpeg</b> (free, ~30 MB, works offline after).</p>
          <button className="btn" disabled={installing} onClick={async () => { setInstalling(true); const r = await window.api.cut.ensure().catch((e) => ({ ok: false, error: e.message })); setInstalling(false); if (r.ok) setFf(true); else setError(r.error); }}>{installing ? 'Installing…' : '⬇ Install ffmpeg (free)'}</button>
          <ErrorBox error={error} />
        </div>
      </div>
    );
  }

  const lib = (db.generations || []).filter((g) => g.kind === 'video' || g.kind === 'image' || g.kind === 'audio').slice(0, 60);

  return (
    <div className="ed">
      <div className="ed-top">
        {/* left: media pool / effects / transitions / titles / auto */}
        <div className="ed-left card">
          <div className="ed-tabs">
            {[['media', 'Media'], ['fx', 'Effects'], ['tr', 'Transitions'], ['titles', 'Titles'], ['auto', '✨ Auto']].map(([k, l]) => <button key={k} className={left === k ? 'on' : ''} onClick={() => setLeft(k)}>{l}</button>)}
          </div>
          {left === 'media' && <MediaPool pool={pool} thumbs={thumbs} lib={lib} onAdd={addToPool} onRemove={(f) => setPool((p) => p.filter((x) => x.file !== f))} onAppend={(m) => appendMedia(m)} />}
          {left === 'fx' && <FxLibrary target={selClip} onAdd={(id) => selClip && selClip.kind !== 'text' && updateClip(selClip.id, (c) => ({ fx: [...(c.fx || []), { id, amt: fxById(id).kind === 'color' ? 1 : 0.6 }] }))} />}
          {left === 'tr' && (
            <div className="ed-scroll">
              <p className="sub" style={{ fontSize: 11 }}>{selClip ? 'Click to blend into the selected clip from the clip before it.' : 'Select a clip on V1, then pick a transition.'} Uses the outgoing clip's extra frames, like Resolve.</p>
              <label>Duration {auto.tdur.toFixed(1)} s</label>
              <input type="range" min="0.1" max="2" step="0.1" value={auto.tdur} onChange={(e) => setAuto({ ...auto, tdur: +e.target.value })} />
              <div className="ed-grid">
                <button className="ed-tile" onClick={() => selClip && updateClip(selClip.id, { transition: null })}>✂ Cut</button>
                {TRANSITIONS.map(([id, name]) => <button key={id} className={'ed-tile' + (selClip?.transition?.type === id ? ' on' : '')} onClick={() => selClip && updateClip(selClip.id, { transition: { type: id, dur: auto.tdur } })}>{name}</button>)}
              </div>
            </div>
          )}
          {left === 'titles' && (
            <div className="ed-scroll">
              <p className="sub" style={{ fontSize: 11 }}>Adds a title at the playhead on the text track.</p>
              <div className="ed-grid">{TEXT_PRESETS.map((p) => <button key={p.id} className="ed-tile" onClick={() => addText(p)}><TitleThumb text={{ ...TEXT_DEFAULT, ...p.text }} /><span>{p.name}</span></button>)}</div>
            </div>
          )}
          {left === 'auto' && (
            <div className="ed-scroll ed-auto">
              <h4>Beat-synced montage</h4>
              <p className="sub">Uses every video/photo in the Media Pool and the first music track. Cuts land on the beat.</p>
              <div className="row" style={{ gap: 4 }}>{[[1, 'Every beat'], [2, '2 beats'], [4, 'Bar (4)'], [8, '2 bars']].map(([v, l]) => <button key={v} className={'chip mini' + (auto.pace === v ? ' on' : '')} onClick={() => setAuto({ ...auto, pace: v })}>{l}</button>)}</div>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <select value={auto.transition} onChange={(e) => setAuto({ ...auto, transition: e.target.value })} style={{ flex: 1 }}><option value="none">Hard cuts</option>{TRANSITIONS.slice(0, 14).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
                <select value={auto.length} onChange={(e) => setAuto({ ...auto, length: +e.target.value })} style={{ width: 110 }}><option value={0}>Full song</option>{[15, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} s</option>)}</select>
              </div>
              <button className="btn small" onClick={beatMontage} disabled={!!busy}>🎵 Build montage</button>
              <h4>On the selected clip</h4>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn ghost small" onClick={detectScenes} disabled={!!busy}>✂ Split at shot changes</button>
                <button className="btn ghost small" onClick={removeSilences} disabled={!!busy}>🔇 Remove pauses</button>
              </div>
              <h4>Captions</h4>
              <p className="sub">Transcribes speech with the free Whisper engine and lays captions along the speech.</p>
              <div className="row" style={{ gap: 6 }}><select value={auto.captionWords} onChange={(e) => setAuto({ ...auto, captionWords: +e.target.value })} style={{ width: 130 }}>{[2, 3, 4, 5, 7, 10].map((n) => <option key={n} value={n}>{n} words / caption</option>)}</select><button className="btn ghost small" onClick={autoCaptions} disabled={!!busy}>💬 Auto captions</button></div>
              <h4>Whole timeline</h4>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn ghost small" onClick={() => autoTransitions('dissolve')}>Dissolve every cut</button>
                <button className="btn ghost small" onClick={() => autoTransitions('cut')}>Remove transitions</button>
                <button className="btn ghost small" onClick={() => closeGaps(proj.tracks[0].id)}>Close gaps on V1</button>
                <button className="btn ghost small" onClick={autoColor} disabled={!!busy}>⚖ Auto colour balance</button>
              </div>
            </div>
          )}
        </div>

        {/* centre: viewer */}
        <div className="ed-view card">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
            <input className="ed-name" value={proj.name} onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }), false)} />
            <div className="row" style={{ gap: 6 }}>
              <select value={proj.aspect} onChange={(e) => setProject((p) => ({ ...p, aspect: e.target.value }))} title="Timeline resolution">{Object.entries(ASPECTS).map(([k, [w, h]]) => <option key={k} value={k}>{k} · {w}×{h}</option>)}</select>
              <select value={proj.fps} onChange={(e) => setProject((p) => ({ ...p, fps: +e.target.value }))}>{[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select>
            </div>
          </div>
          <Viewer proj={proj} W={W} H={H} t={t} playing={playing} rate={rate} />
          <div className="ed-transport">
            <button onClick={() => seek(0)} title="Start (Home)">⏮</button>
            <button onClick={() => { setPlaying(false); seek(t - 1 / (proj.fps || 30)); }} title="Back one frame (←)">◂</button>
            <button className="play" onClick={togglePlay} title="Play / pause (Space)">{playing ? '❚❚' : '▶'}</button>
            <button onClick={() => { setPlaying(false); seek(t + 1 / (proj.fps || 30)); }} title="Forward one frame (→)">▸</button>
            <button onClick={() => seek(total)} title="End">⏭</button>
            <span className="ed-tc">{tc(t, proj.fps)}</span>
            <span className="sub" style={{ fontSize: 11 }}>/ {tc(total, proj.fps)}{rate !== 1 ? ` · ${rate}×` : ''}</span>
            <span style={{ flex: 1 }} />
            <span className="sub" style={{ fontSize: 11 }}>{mark.in != null ? 'In ' + tc(mark.in, proj.fps) : ''} {mark.out != null ? '· Out ' + tc(mark.out, proj.fps) : ''}</span>
            {(mark.in != null || mark.out != null) && <button onClick={() => setMark({ in: null, out: null })} title="Clear in/out">✕</button>}
          </div>
        </div>

        {/* right: inspector */}
        <div className="ed-insp card">
          {!selClip && <div className="sub" style={{ fontSize: 12 }}><strong>Inspector</strong><p>Select a clip to change its transform, speed, sound, colour, effects or text.</p><p style={{ fontSize: 11, opacity: 0.8 }}>Shortcuts: Space play · J K L shuttle · ← → frame · I / O in-out · B blade · A select · S or Ctrl+B split · Del lift · Shift+Del ripple · Ctrl+Z undo · Ctrl+D duplicate · N snapping · + / − zoom</p></div>}
          {selClip && <Inspector clip={selClip} tab={insp} setTab={setInsp} update={(patch, rec) => updateClip(selClip.id, patch, rec)} srcLen={srcLen(selClip)} poolItem={poolInfo(selClip.file)} />}
        </div>
      </div>

      {/* toolbar */}
      <div className="ed-bar">
        <button className={tool === 'select' ? 'on' : ''} onClick={() => setTool('select')} title="Selection (A)">⇱ Select</button>
        <button className={tool === 'blade' ? 'on' : ''} onClick={() => setTool('blade')} title="Blade (B)">✂ Blade</button>
        <button className={snap ? 'on' : ''} onClick={() => setSnap((v) => !v)} title="Snapping (N)">🧲 Snap</button>
        <span className="ed-sep" />
        <button onClick={undo} disabled={!past.current.length} title="Undo (Ctrl+Z)">↶</button>
        <button onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Shift+Z)">↷</button>
        <button onClick={() => splitAt(t, sel.length ? sel : null)} title="Split at playhead (S)">Split</button>
        <button onClick={() => deleteSel(false)} disabled={!sel.length} title="Delete (Del)">Delete</button>
        <button onClick={() => deleteSel(true)} disabled={!sel.length} title="Ripple delete (Shift+Del)">Ripple</button>
        <button onClick={() => addText(TEXT_PRESETS[0])} title="Add a title at the playhead">＋ Title</button>
        <button onClick={() => setProject((p) => { const v = p.tracks.filter((x) => x.type === 'video').length; const i = p.tracks.findIndex((x) => x.type !== 'video'); p.tracks.splice(i < 0 ? p.tracks.length : i, 0, newTrack('video', 'V' + (v + 1))); return p; })}>＋ Video track</button>
        <button onClick={() => setProject((p) => { p.tracks.push(newTrack('audio', 'A' + (p.tracks.filter((x) => x.type === 'audio').length + 1))); return p; })}>＋ Audio track</button>
        <span className="ed-sep" />
        <span className="sub" style={{ fontSize: 11 }}>Zoom</span>
        <input type="range" min="0" max="1" step="0.001" value={Math.log(pps / 4) / Math.log(150)} onChange={(e) => setPps(4 * Math.pow(150, +e.target.value))} style={{ width: 120 }} />
        <button onClick={() => { const w = document.querySelector('.ed-lanes')?.clientWidth || 900; setPps(Math.max(4, Math.min(600, (w - 40) / Math.max(1, total)))); }} title="Fit timeline">Fit</button>
        <span style={{ flex: 1 }} />
        {busy && <span className="sub" style={{ fontSize: 12 }}>⏳ {busy}</span>}
        <button onClick={() => { if (window.confirm('Start a new, empty timeline? (Undo can bring the old one back.)')) { setProject(NEW_PROJECT()); setSel([]); setT(0); } }}>New</button>
        <button className="ed-render" onClick={() => setShowRender(true)} disabled={!total}>⬆ Render</button>
      </div>
      <ErrorBox error={error} />

      <Timeline proj={proj} setProject={setProject} pps={pps} t={t} seek={(x) => { setPlaying(false); seek(x); }} sel={sel} setSel={setSel} tool={tool} snap={snap} mark={mark}
        thumbs={thumbs} peaks={peaks} pool={pool} srcLen={srcLen} total={total} splitAt={splitAt} makeClip={makeClip} />

      {showRender && (
        <div className="ed-modal" onClick={() => !job.running && setShowRender(false)}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
            <h3 style={{ marginTop: 0 }}>Render — Deliver</h3>
            <p className="sub" style={{ fontSize: 12 }}>{W}×{H} · {proj.fps} fps · H.264 MP4 · {tc(total, proj.fps)}</p>
            <label>Quality</label>
            <div className="row" style={{ gap: 4 }}>{[['draft', 'Draft (fast)'], ['good', 'High'], ['best', 'Master (slow)']].map(([k, l]) => <button key={k} className={'chip mini' + (rq.quality === k ? ' on' : '')} onClick={() => setRq({ ...rq, quality: k })}>{l}</button>)}</div>
            <label>Range</label>
            <div className="row" style={{ gap: 4 }}><button className={'chip mini' + (rq.range === 'all' ? ' on' : '')} onClick={() => setRq({ ...rq, range: 'all' })}>Entire timeline</button><button className={'chip mini' + (rq.range === 'inout' ? ' on' : '')} disabled={mark.in == null || mark.out == null} onClick={() => setRq({ ...rq, range: 'inout' })}>In → Out</button></div>
            <div className="row" style={{ marginTop: 14 }}>
              <RunButton job={job} label="⬆ Render video" busyLabel={progress ? `${progress.stage} ${progress.pct ?? ''}%` : 'Rendering…'} onRun={render} />
              {!job.running && <button className="btn ghost" onClick={() => setShowRender(false)}>Close</button>}
            </div>
            {progress && job.running && <div className="mstat-bar" style={{ marginTop: 8 }}><i style={{ width: (progress.pct || 2) + '%' }} /></div>}
          </div>
        </div>
      )}
      {result && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><strong>✓ Rendered — saved to your Gallery</strong><button className="btn ghost small" onClick={() => setResult(null)}>✕</button></div>
          <div className="result-box" style={{ maxWidth: 640 }}><Media file={result} kind="video" controls /></div>
          <div className="row" style={{ marginTop: 6 }}><OpenButtons file={result} kind="video" /><button className="btn ghost small" onClick={() => addToPool([result])}>＋ Add to Media Pool</button></div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Media pool ───────────────────────── */
function MediaPool({ pool, thumbs, lib, onAdd, onRemove, onAppend }) {
  const [over, setOver] = useState(false);
  return (
    <div className={'ed-scroll' + (over ? ' ed-over' : '')}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => { e.preventDefault(); setOver(false); const paths = [...(e.dataTransfer.files || [])].map((f) => window.api.pathForFile(f)).filter(Boolean); if (paths.length) onAdd(paths); }}>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn small" onClick={async () => { const f = await window.api.pickMedia(); onAdd(Array.isArray(f) ? f : f ? [f] : []); }}>＋ Import</button>
        <button className="btn ghost small" onClick={async () => { const f = await window.api.pickAudio(); onAdd(Array.isArray(f) ? f : f ? [f] : []); }}>＋ Music / audio</button>
      </div>
      {lib.length > 0 && <select value="" onChange={(e) => e.target.value && onAdd([e.target.value])} style={{ marginTop: 6 }}><option value="">＋ from your Gallery…</option>{lib.map((g) => <option key={g.id} value={g.file}>{g.kind === 'video' ? '🎞 ' : g.kind === 'audio' ? '🎵 ' : '🖼 '}{(g.prompt || g.kind).slice(0, 44)}</option>)}</select>}
      <div className="ed-pool">
        {pool.map((m) => (
          <div key={m.file} className="ed-pitem" draggable onDragStart={(e) => { e.dataTransfer.setData('application/x-pandora-media', JSON.stringify(m)); e.dataTransfer.effectAllowed = 'copy'; }} onDoubleClick={() => onAppend(m)} title={m.file + '\nDrag onto the timeline, or double-click to append'}>
            <div className="ed-pthumb" style={thumbs[m.file] ? { backgroundImage: `url("${thumbs[m.file].dataUrl}")`, backgroundSize: thumbs[m.file].count > 1 ? `${thumbs[m.file].count * 100}% 100%` : 'cover', backgroundPosition: thumbs[m.file].count > 1 ? `${100 * 0.4}% 0` : 'center' } : null}>
              {m.kind === 'audio' && <span>♫</span>}
              <i>{m.kind === 'image' ? 'IMG' : (m.duration || 0).toFixed(1) + 's'}</i>
            </div>
            <div className="ed-pname">{base(m.file)}</div>
            <button className="ed-px" onClick={() => onRemove(m.file)} title="Remove from pool">✕</button>
          </div>
        ))}
      </div>
      {!pool.length && <p className="sub" style={{ fontSize: 12 }}>Import videos, photos and music — or drop files here. Then drag them onto the timeline.</p>}
    </div>
  );
}

/* ───────────────────────── Effects library ───────────────────────── */
function FxLibrary({ target, onAdd }) {
  const [q, setQ] = useState(''); const [cat, setCat] = useState('');
  const list = EFFECTS.filter((e) => (!cat || e.cat === cat) && (!q || (e.name + ' ' + e.cat).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="ed-scroll">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${EFFECTS.length} effects…`} />
      <div className="row" style={{ gap: 3, margin: '6px 0' }}>
        <button className={'chip mini' + (!cat ? ' on' : '')} onClick={() => setCat('')}>All</button>
        {FX_CATS.map((c) => <button key={c} className={'chip mini' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      {!target && <p className="sub" style={{ fontSize: 11 }}>Select a clip, then click an effect to add it.</p>}
      <div className="ed-fxlist">
        {list.map((e) => (
          <button key={e.id} className="ed-fx" disabled={!target || target.kind === 'text'} onClick={() => onAdd(e.id)} title={e.kind === 'time' ? 'Motion effect — plays in the render' : e.kind === 'color' ? 'Colour effect — baked into the grade' : 'Image effect'}>
            <span className={'ed-fxk ' + e.kind} />{e.name}<small>{e.cat}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function TitleThumb({ text }) {
  const ref = useRef(null);
  useEffect(() => { const c = ref.current; if (!c) return; const x = c.getContext('2d'); x.fillStyle = '#16222e'; x.fillRect(0, 0, c.width, c.height); drawText(x, c.width, c.height, { ...text, size: text.size * 1.6 }); }, [text]);
  return <canvas ref={ref} width={160} height={90} className="ed-tthumb" />;
}

/* ───────────────────────── Viewer ───────────────────────── */
function Viewer({ proj, W, H, t, playing, rate }) {
  const box = useRef(null); const txt = useRef(null);
  const at = (tr) => tr.clips.find((c) => t >= c.start && t < c.start + c.dur);
  const vis = proj.tracks.filter((tr) => tr.type === 'video' && !tr.hidden);
  const texts = proj.tracks.filter((tr) => tr.type === 'text' && !tr.hidden).flatMap((tr) => tr.clips.filter((c) => t >= c.start && t < c.start + c.dur));
  useEffect(() => {
    const c = txt.current; if (!c) return; const ctx = c.getContext('2d'); ctx.clearRect(0, 0, c.width, c.height);
    for (const tc0 of texts) drawText(ctx, c.width, c.height, tc0.text, textAnim(tc0, t));
  });
  const aud = proj.tracks.filter((tr) => tr.type === 'audio' && !tr.muted);
  return (
    <div className="ed-screen" style={{ aspectRatio: `${W} / ${H}` }} ref={box}>
      {vis.map((tr, i) => { const c = at(tr); return c ? <Layer key={tr.id} clip={c} t={t} playing={playing} rate={rate} main={i === 0} muted={tr.muted} /> : null; })}
      <canvas ref={txt} width={Math.round(W / 2)} height={Math.round(H / 2)} className="ed-textlayer" />
      {aud.map((tr) => { const c = at(tr); return c ? <AudioLayer key={tr.id} clip={c} t={t} playing={playing} rate={rate} /> : null; })}
    </div>
  );
}
function syncMedia(el, clip, t, playing, rate) {
  if (!el) return;
  const want = (clip.in || 0) + (t - clip.start) * (clip.speed || 1);
  const pr = (clip.speed || 1) * rate;
  if (Math.abs(el.playbackRate - pr) > 0.01) { try { el.playbackRate = Math.max(0.0625, Math.min(16, pr)); } catch (_) {} }
  el.volume = Math.max(0, Math.min(1, clip.volume ?? 1));
  if (playing) { if (el.paused) el.play().catch(() => {}); if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want; }
  else { if (!el.paused) el.pause(); if (Math.abs(el.currentTime - want) > 0.02) el.currentTime = want; }
}
function Layer({ clip, t, playing, rate, main, muted }) {
  const ref = useRef(null);
  useEffect(() => { if (clip.kind === 'video') syncMedia(ref.current, clip, t, playing, rate); });
  const g = clip.grade || {};
  const gradeCss = [g.exposure ? `brightness(${Math.pow(2, g.exposure).toFixed(2)})` : '', g.contrast ? `contrast(${(1 + g.contrast).toFixed(2)})` : '', g.saturation ? `saturate(${(1 + g.saturation).toFixed(2)})` : '', g.temp > 0 ? `sepia(${(g.temp * 0.4).toFixed(2)})` : g.temp < 0 ? `hue-rotate(${(g.temp * 15).toFixed(0)}deg)` : ''].join(' ');
  const local = t - clip.start; let op = clip.opacity ?? 1;
  if (clip.fadeIn > 0) op *= Math.min(1, local / clip.fadeIn); if (clip.fadeOut > 0) op *= Math.min(1, (clip.dur - local) / clip.fadeOut);
  const style = { filter: (fxCss(clip.fx) + ' ' + gradeCss).trim() || undefined, opacity: Math.max(0, op) };
  if (main || (clip.fit === 'fill' && (clip.scale ?? 1) === 1)) Object.assign(style, { inset: 0, width: '100%', height: '100%', objectFit: clip.fit === 'fit' ? 'contain' : 'cover' });
  else Object.assign(style, { width: `${(clip.scale ?? 1) * 100}%`, left: `${50 + (clip.x || 0) * 100}%`, top: `${50 + (clip.y || 0) * 100}%`, transform: 'translate(-50%,-50%)' });
  if (clip.kind === 'image') return <img src={mediaUrl(clip.file)} className="ed-layer" style={style} alt="" />;
  return <video ref={ref} src={mediaUrl(clip.file)} className="ed-layer" style={style} muted={muted || (clip.volume ?? 1) <= 0} preload="auto" playsInline />;
}
function AudioLayer({ clip, t, playing, rate }) {
  const ref = useRef(null);
  useEffect(() => { syncMedia(ref.current, clip, t, playing, rate); });
  return <audio ref={ref} src={mediaUrl(clip.file)} preload="auto" />;
}

/* ───────────────────────── Inspector ───────────────────────── */
function Num({ label, value, min, max, step = 0.01, onChange, fmt }) {
  return (
    <div className="ed-num">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value, false)} onMouseUp={(e) => onChange(+e.target.value, true)} />
      <b>{fmt ? fmt(value) : (+value).toFixed(2)}</b>
    </div>
  );
}
function Inspector({ clip, tab, setTab, update, srcLen, poolItem }) {
  const tabs = clip.kind === 'text' ? [['text', 'Text'], ['video', 'Timing']] : clip.kind === 'audio' ? [['audio', 'Audio'], ['fx', 'Effects']] : [['video', 'Video'], ['audio', 'Audio'], ['color', 'Colour'], ['fx', 'Effects']];
  const cur = tabs.some(([k]) => k === tab) ? tab : tabs[0][0];
  const set = (k) => (v, rec = true) => update({ [k]: v }, rec);
  const g = clip.grade || {};
  const setG = (patch, rec = true) => update((c) => ({ grade: { ...(c.grade || {}), ...patch } }), rec);
  const tx = { ...TEXT_DEFAULT, ...(clip.text || {}) };
  const setT = (patch, rec = true) => update((c) => ({ text: { ...TEXT_DEFAULT, ...(c.text || {}), ...patch } }), rec);
  return (
    <div className="ed-scroll">
      <div className="ed-tabs small">{tabs.map(([k, l]) => <button key={k} className={cur === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="sub" style={{ fontSize: 11, margin: '4px 0 8px', wordBreak: 'break-all' }}>{clip.kind === 'text' ? '🅣 ' + String(tx.content).slice(0, 40) : base(clip.file)}</div>
      {cur === 'video' && (<>
        <Num label="Duration" value={clip.dur} min={0.1} max={Math.max(clip.dur, Math.min(srcLen, 120))} step={0.04} onChange={set('dur')} fmt={(v) => v.toFixed(2) + 's'} />
        {clip.kind !== 'text' && <>
          <Num label="Speed" value={clip.speed || 1} min={0.25} max={4} step={0.05} onChange={(v, rec) => update((c) => ({ speed: v, dur: Math.min(c.dur * (c.speed || 1) / v, poolItem?.duration ? (poolItem.duration - (c.in || 0)) / v : c.dur * (c.speed || 1) / v) }), rec)} fmt={(v) => v.toFixed(2) + '×'} />
          <label>Fit</label>
          <div className="row" style={{ gap: 4 }}>{[['fill', 'Fill frame'], ['fit', 'Fit (bars)']].map(([k, l]) => <button key={k} className={'chip mini' + ((clip.fit || 'fill') === k ? ' on' : '')} onClick={() => update({ fit: k })}>{l}</button>)}</div>
          <h5>Transform (overlay tracks)</h5>
          <Num label="Zoom" value={clip.scale ?? 1} min={0.1} max={2} onChange={set('scale')} fmt={(v) => Math.round(v * 100) + '%'} />
          <Num label="Position X" value={clip.x || 0} min={-0.5} max={0.5} onChange={set('x')} />
          <Num label="Position Y" value={clip.y || 0} min={-0.5} max={0.5} onChange={set('y')} />
          <div className="row" style={{ gap: 4 }}>{[['PiP ↗', { scale: 0.32, x: 0.3, y: -0.3, fit: 'fit' }], ['PiP ↘', { scale: 0.32, x: 0.3, y: 0.3, fit: 'fit' }], ['Left half', { scale: 0.5, x: -0.25, y: 0, fit: 'fit' }], ['Full', { scale: 1, x: 0, y: 0, fit: 'fill' }]].map(([l, p]) => <button key={l} className="chip mini" onClick={() => update(p)}>{l}</button>)}</div>
          <Num label="Opacity" value={clip.opacity ?? 1} min={0} max={1} onChange={set('opacity')} fmt={(v) => Math.round(v * 100) + '%'} />
          <label>Entrance (overlays)</label>
          <select value={clip.anim || 'none'} onChange={(e) => update({ anim: e.target.value })}>{ANIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </>}
        {clip.kind === 'text' && <><label>Animation</label><select value={clip.anim || 'none'} onChange={(e) => update({ anim: e.target.value })}>{ANIMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></>}
        <h5>Fades</h5>
        <Num label="Fade in" value={clip.fadeIn || 0} min={0} max={Math.min(3, clip.dur)} step={0.05} onChange={set('fadeIn')} fmt={(v) => v.toFixed(2) + 's'} />
        <Num label="Fade out" value={clip.fadeOut || 0} min={0} max={Math.min(3, clip.dur)} step={0.05} onChange={set('fadeOut')} fmt={(v) => v.toFixed(2) + 's'} />
        {clip.kind !== 'text' && <><label>Transition in</label>
          <select value={clip.transition?.type || 'cut'} onChange={(e) => update({ transition: e.target.value === 'cut' ? null : { type: e.target.value, dur: clip.transition?.dur || 0.5 } })}><option value="cut">Cut</option>{TRANSITIONS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
          {clip.transition && <Num label="Length" value={clip.transition.dur} min={0.1} max={2} step={0.05} onChange={(v, rec) => update((c) => ({ transition: { ...c.transition, dur: v } }), rec)} fmt={(v) => v.toFixed(2) + 's'} />}</>}
      </>)}
      {cur === 'audio' && (<>
        {poolItem && !poolItem.audio && clip.kind !== 'audio' && <p className="sub" style={{ fontSize: 11 }}>This clip has no sound.</p>}
        <Num label="Volume" value={clip.volume ?? 1} min={0} max={2} onChange={set('volume')} fmt={(v) => (v <= 0 ? 'muted' : (20 * Math.log10(v)).toFixed(1) + ' dB')} />
        <div className="row" style={{ gap: 4 }}><button className="chip mini" onClick={() => update({ volume: 0 })}>Mute</button><button className="chip mini" onClick={() => update({ volume: 0.25 })}>Duck −12 dB</button><button className="chip mini" onClick={() => update({ volume: 1 })}>0 dB</button></div>
        <Num label="Fade in" value={clip.fadeIn || 0} min={0} max={Math.min(5, clip.dur)} step={0.05} onChange={set('fadeIn')} fmt={(v) => v.toFixed(2) + 's'} />
        <Num label="Fade out" value={clip.fadeOut || 0} min={0} max={Math.min(5, clip.dur)} step={0.05} onChange={set('fadeOut')} fmt={(v) => v.toFixed(2) + 's'} />
        {clip.kind === 'audio' && <Num label="Speed" value={clip.speed || 1} min={0.5} max={2} step={0.05} onChange={(v, rec) => update((c) => ({ speed: v, dur: c.dur * (c.speed || 1) / v }), rec)} fmt={(v) => v.toFixed(2) + '×'} />}
      </>)}
      {cur === 'color' && (<>
        <label>Look</label>
        <select value={g.look || 'none'} onChange={(e) => { const l = lookById(e.target.value); setG({ ...DEFAULTS, wb: g.wb, levels: g.levels, exposure: g.wb ? g.exposure : 0, ...l.p, look: l.id }); }}>{LOOKS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <Num label="Exposure" value={g.exposure || 0} min={-2} max={2} onChange={(v, r) => setG({ exposure: v }, r)} />
        <Num label="Contrast" value={g.contrast || 0} min={-1} max={1} onChange={(v, r) => setG({ contrast: v }, r)} />
        <Num label="Highlights" value={g.highlights || 0} min={-1} max={1} onChange={(v, r) => setG({ highlights: v }, r)} />
        <Num label="Shadows" value={g.shadows || 0} min={-1} max={1} onChange={(v, r) => setG({ shadows: v }, r)} />
        <Num label="Temperature" value={g.temp || 0} min={-1} max={1} onChange={(v, r) => setG({ temp: v }, r)} />
        <Num label="Tint" value={g.tint || 0} min={-1} max={1} onChange={(v, r) => setG({ tint: v }, r)} />
        <Num label="Saturation" value={g.saturation || 0} min={-1} max={1} onChange={(v, r) => setG({ saturation: v }, r)} />
        <Num label="Vibrance" value={g.vibrance || 0} min={-1} max={1} onChange={(v, r) => setG({ vibrance: v }, r)} />
        <Num label="Vignette" value={g.vignette || 0} min={0} max={1} onChange={(v, r) => setG({ vignette: v }, r)} />
        <Num label="Grain" value={g.grain || 0} min={0} max={1} onChange={(v, r) => setG({ grain: v }, r)} />
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <button className="btn ghost small" onClick={async () => { try { const fr = await window.api.cut.frame({ file: clip.file, t: clip.kind === 'video' ? (clip.in || 0) + clip.dur * (clip.speed || 1) / 2 : null, max: 480 }); const st = sampleStats(await loadImageData(fr.dataUrl, 480)); setG(autoParams(st)); } catch (_) { /* ignore */ } }}>⚖ Auto balance</button>
          <button className="btn ghost small" onClick={() => update({ grade: null })}>Reset</button>
        </div>
        <p className="sub" style={{ fontSize: 11 }}>The live viewer shows an approximation; the render uses the exact grade. For wheels, curves and scopes, use the Color page.</p>
      </>)}
      {cur === 'fx' && (<>
        {!(clip.fx || []).length && <p className="sub" style={{ fontSize: 11 }}>No effects yet — open the Effects library on the left and click one.</p>}
        {(clip.fx || []).map((x, i) => { const e = fxById(x.id); if (!e) return null; return (
          <div key={i} className="ed-fxrow">
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <label className="row" style={{ gap: 6, margin: 0, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={x.on !== false} onChange={(ev) => update((c) => ({ fx: c.fx.map((y, j) => (j === i ? { ...y, on: ev.target.checked } : y)) }))} /><span className={'ed-fxk ' + e.kind} />{e.name}</label>
              <span className="row" style={{ gap: 2 }}>
                <button className="ed-mini" disabled={!i} onClick={() => update((c) => { const f = [...c.fx]; [f[i - 1], f[i]] = [f[i], f[i - 1]]; return { fx: f }; })}>▲</button>
                <button className="ed-mini" onClick={() => update((c) => ({ fx: c.fx.filter((_, j) => j !== i) }))}>✕</button>
              </span>
            </div>
            <input type="range" min="0" max="1" step="0.01" value={x.amt ?? 1} onChange={(ev) => update((c) => ({ fx: c.fx.map((y, j) => (j === i ? { ...y, amt: +ev.target.value } : y)) }), false)} onMouseUp={() => update((c) => ({ fx: [...c.fx] }))} />
          </div>
        ); })}
      </>)}
      {cur === 'text' && (<>
        <label>Text</label>
        <textarea value={tx.content} onChange={(e) => setT({ content: e.target.value }, false)} onBlur={() => setT({})} style={{ minHeight: 60 }} />
        <div className="row" style={{ gap: 6 }}>
          <select value={tx.font} onChange={(e) => setT({ font: e.target.value })} style={{ flex: 1 }}>{FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}</select>
          <select value={tx.weight} onChange={(e) => setT({ weight: +e.target.value })} style={{ width: 90 }}>{[300, 400, 600, 700, 800, 900].map((w) => <option key={w} value={w}>{w}</option>)}</select>
        </div>
        <div className="row" style={{ gap: 4, marginTop: 6 }}>
          {['left', 'center', 'right'].map((a) => <button key={a} className={'chip mini' + (tx.align === a ? ' on' : '')} onClick={() => setT({ align: a, x: a === 'left' ? 0.07 : a === 'right' ? 0.93 : 0.5 })}>{a}</button>)}
          <button className={'chip mini' + (tx.upper ? ' on' : '')} onClick={() => setT({ upper: !tx.upper })}>AA</button>
          <button className={'chip mini' + (tx.italic ? ' on' : '')} onClick={() => setT({ italic: !tx.italic })}><i>I</i></button>
          <input type="color" value={tx.color} onChange={(e) => setT({ color: e.target.value })} style={{ width: 34, padding: 0, height: 24 }} />
        </div>
        <Num label="Size" value={tx.size} min={0.02} max={0.3} step={0.005} onChange={(v, r) => setT({ size: v }, r)} />
        <Num label="Spacing" value={tx.spacing} min={0} max={0.5} onChange={(v, r) => setT({ spacing: v }, r)} />
        <Num label="X" value={tx.x} min={0} max={1} onChange={(v, r) => setT({ x: v }, r)} />
        <Num label="Y" value={tx.y} min={0} max={1} onChange={(v, r) => setT({ y: v }, r)} />
        <div className="row" style={{ gap: 4 }}>{[['Top', 0.12], ['Middle', 0.5], ['Lower', 0.8], ['Bottom', 0.9]].map(([l, y]) => <button key={l} className="chip mini" onClick={() => setT({ y })}>{l}</button>)}</div>
        <Num label="Outline" value={tx.stroke} min={0} max={0.3} onChange={(v, r) => setT({ stroke: v }, r)} />
        <Num label="Shadow" value={tx.shadow} min={0} max={1} onChange={(v, r) => setT({ shadow: v }, r)} />
        <div className="row" style={{ gap: 6, alignItems: 'center' }}>
          <Num label="Glow" value={tx.glow} min={0} max={1.5} onChange={(v, r) => setT({ glow: v }, r)} />
          <input type="color" value={tx.glowColor} onChange={(e) => setT({ glowColor: e.target.value })} style={{ width: 34, padding: 0, height: 24 }} />
        </div>
        <label className="row" style={{ gap: 6, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={tx.box} onChange={(e) => setT({ box: e.target.checked })} /> Background box <input type="color" value={tx.boxColor} onChange={(e) => setT({ boxColor: e.target.value })} style={{ width: 34, padding: 0, height: 22 }} /></label>
        {tx.box && <Num label="Box opacity" value={tx.boxOpacity} min={0} max={1} onChange={(v, r) => setT({ boxOpacity: v }, r)} />}
      </>)}
    </div>
  );
}

/* ───────────────────────── Timeline ───────────────────────── */
const ROW_H = { video: 58, text: 34, audio: 50 };
function Timeline({ proj, setProject, pps, t, seek, sel, setSel, tool, snap, mark, thumbs, peaks, pool, srcLen, total, splitAt, makeClip }) {
  const lanes = useRef(null); const heads = useRef(null);
  const drag = useRef(null);
  const [ghost, setGhost] = useState(null);
  // display order: overlay/text tracks on top (highest first), then V1, then audio
  const visual = proj.tracks.filter((x) => x.type !== 'audio');
  const order = [...visual].reverse().concat(proj.tracks.filter((x) => x.type === 'audio'));
  const width = Math.max(1200, (Math.max(total, 30) + 20) * pps);
  const timeAtX = (clientX) => { const r = lanes.current.getBoundingClientRect(); return Math.max(0, (clientX - r.left + lanes.current.scrollLeft) / pps); };
  const edges = (excludeId) => [0, t, ...proj.tracks.flatMap((tr) => tr.clips.filter((c) => c.id !== excludeId).flatMap((c) => [c.start, c.start + c.dur])), ...(mark.in != null ? [mark.in] : []), ...(mark.out != null ? [mark.out] : [])];
  const snapT = (x, excl, extra = []) => { if (!snap) return x; const th = 8 / pps; let best = x, bd = th; for (const e of [...edges(excl), ...extra]) { const d = Math.abs(e - x); if (d < bd) { bd = d; best = e; } } return best; };

  const onClipDown = (e, clip, track, mode) => {
    e.stopPropagation(); if (e.button !== 0) return;
    if (tool === 'blade' && mode === 'move') { splitAt(snapT(timeAtX(e.clientX), null), [clip.id]); return; }
    if (track.locked) return;
    if (e.shiftKey || e.ctrlKey) setSel((s) => (s.includes(clip.id) ? s.filter((x) => x !== clip.id) : [...s, clip.id]));
    else if (!sel.includes(clip.id)) setSel([clip.id]);
    drag.current = { mode, id: clip.id, x0: e.clientX, y0: e.clientY, orig: { ...clip }, track: track.id, base: proj, moved: false };
    const move = (ev) => {
      const d = drag.current; if (!d) return;
      const dt = (ev.clientX - d.x0) / pps;
      if (!d.moved && Math.abs(ev.clientX - d.x0) < 3 && Math.abs(ev.clientY - d.y0) < 3) return;
      d.moved = true;
      setProject(() => {
        const p = clone(d.base);
        let tr = p.tracks.find((x) => x.id === d.track); const c = tr.clips.find((x) => x.id === d.id); const o = d.orig; const sp = o.speed || 1;
        if (d.mode === 'move') {
          let ns = Math.max(0, o.start + dt);
          const sA = snapT(ns, o.id), sB = snapT(ns + o.dur, o.id) - o.dur;
          ns = Math.abs(sA - ns) <= Math.abs(sB - ns) ? sA : sB; c.start = Math.max(0, ns);
          // vertical: move to another compatible track under the pointer
          const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-track]');
          const target = el && p.tracks.find((x) => x.id === el.dataset.track);
          if (target && target.id !== tr.id && accepts(target, c.kind) && !target.locked) { tr.clips = tr.clips.filter((x) => x.id !== c.id); target.clips.push(c); d.track = target.id; d.base = clone(p); d.orig = { ...c }; d.x0 = ev.clientX; }
        } else if (d.mode === 'l') {
          const maxBack = c.kind === 'video' || c.kind === 'audio' ? (o.in || 0) / sp : o.start;
          let ns = snapT(o.start + dt, o.id); ns = Math.max(o.start - maxBack, Math.min(o.start + o.dur - 0.1, ns, ));
          ns = Math.max(0, ns); const delta = ns - o.start;
          c.start = ns; c.dur = o.dur - delta; if (c.kind === 'video' || c.kind === 'audio') c.in = Math.max(0, (o.in || 0) + delta * sp);
        } else if (d.mode === 'r') {
          let ne = snapT(o.start + o.dur + dt, o.id);
          const lim = srcLen({ ...o }) ; ne = Math.max(o.start + 0.1, Math.min(o.start + lim, ne)); c.dur = ne - o.start;
        }
        return p;
      }, false);
    };
    const up = () => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      const d = drag.current; drag.current = null;
      if (d && d.moved) setProject((p) => p, true); // record one undo step for the whole drag
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  const onRuler = (e) => { seek(timeAtX(e.clientX)); const mv = (ev) => seek(timeAtX(ev.clientX)); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); };
  const onDrop = (e, track) => {
    e.preventDefault(); setGhost(null);
    const raw = e.dataTransfer.getData('application/x-pandora-media'); if (!raw) return;
    const m = JSON.parse(raw); if (!accepts(track, m.kind) || track.locked) return;
    const at = snapT(timeAtX(e.clientX), null);
    setProject((p) => { const tr = p.tracks.find((x) => x.id === track.id); const c = makeClip(m, at); tr.clips.push(c); setSel([c.id]); return p; });
  };
  const tick = pps > 120 ? 1 : pps > 40 ? 2 : pps > 15 ? 5 : pps > 6 ? 10 : 30;
  const ticks = []; for (let s = 0; s * pps < width; s += tick) ticks.push(s);
  const trackPatch = (id, patch) => setProject((p) => { Object.assign(p.tracks.find((x) => x.id === id), patch); return p; });
  return (
    <div className="ed-tl card">
      <div className="ed-heads" ref={heads}>
        <div className="ed-rulerhead">{tool === 'blade' ? '✂ Blade' : 'Timeline'}</div>
        {order.map((tr) => (
          <div key={tr.id} className={'ed-head ' + tr.type} style={{ height: ROW_H[tr.type] }}>
            <input value={tr.name} onChange={(e) => trackPatch(tr.id, { name: e.target.value })} />
            <div className="row" style={{ gap: 2 }}>
              {tr.type !== 'audio' && <button className={tr.hidden ? 'off' : ''} title="Show / hide" onClick={() => trackPatch(tr.id, { hidden: !tr.hidden })}>{tr.hidden ? '◌' : '◉'}</button>}
              {tr.type !== 'text' && <button className={tr.muted ? 'off' : ''} title="Mute" onClick={() => trackPatch(tr.id, { muted: !tr.muted })}>{tr.muted ? 'M̶' : 'M'}</button>}
              <button className={tr.locked ? 'off' : ''} title="Lock" onClick={() => trackPatch(tr.id, { locked: !tr.locked })}>{tr.locked ? '🔒' : '🔓'}</button>
              {proj.tracks.filter((x) => x.type === tr.type).length > 1 && <button title="Delete track" onClick={() => { if (!tr.clips.length || window.confirm('Delete this track and its clips?')) setProject((p) => { p.tracks = p.tracks.filter((x) => x.id !== tr.id); return p; }); }}>✕</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="ed-lanes" ref={lanes} onScroll={(e) => { if (heads.current) heads.current.scrollTop = e.currentTarget.scrollTop; }}>
        <div style={{ width, position: 'relative' }}>
          <div className="ed-ruler" onMouseDown={onRuler}>
            {ticks.map((s) => <span key={s} style={{ left: s * pps }}>{s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : s + 's'}</span>)}
            {mark.in != null && mark.out != null && mark.out > mark.in && <div className="ed-range" style={{ left: mark.in * pps, width: (mark.out - mark.in) * pps }} />}
          </div>
          {order.map((tr) => (
            <div key={tr.id} data-track={tr.id} className={'ed-lane ' + tr.type + (tr.locked ? ' locked' : '') + (tr.hidden || tr.muted ? ' dim' : '')} style={{ height: ROW_H[tr.type] }}
              onMouseDown={(e) => { if (e.target === e.currentTarget) { setSel([]); seek(timeAtX(e.clientX)); } }}
              onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-pandora-media')) { e.preventDefault(); setGhost({ track: tr.id, x: timeAtX(e.clientX) }); } }}
              onDragLeave={() => setGhost(null)} onDrop={(e) => onDrop(e, tr)}>
              {tr.clips.map((c) => {
                const th = thumbs[c.file]; const pk = peaks[c.file];
                const left = c.start * pps, w = Math.max(3, c.dur * pps);
                const style = { left, width: w };
                if (th && tr.type === 'video' && c.kind !== 'text') { const info = pool.find((p) => p.file === c.file); const D = info?.duration || 1; const sp = c.speed || 1; const full = th.count > 1 ? (D / sp) * pps : w; style.backgroundImage = `url("${th.dataUrl}")`; style.backgroundSize = th.count > 1 ? `${full}px 100%` : `auto 100%`; style.backgroundPosition = th.count > 1 ? `${-((c.in || 0) / sp) * pps}px 0` : 'left'; style.backgroundRepeat = th.count > 1 ? 'no-repeat' : 'repeat-x'; }
                return (
                  <div key={c.id} className={'ed-clip ' + (c.kind) + (sel.includes(c.id) ? ' sel' : '') + (tool === 'blade' ? ' blade' : '')} style={style} onMouseDown={(e) => onClipDown(e, c, tr, 'move')} title={(c.kind === 'text' ? c.text?.content : base(c.file)) + `\n${c.dur.toFixed(2)} s`}>
                    {c.transition && <span className="ed-xf" style={{ width: Math.min(w, c.transition.dur * pps) }} title={'Transition: ' + c.transition.type} />}
                    {pk && (tr.type === 'audio' || tr.type === 'video') && <Wave peaks={pk} clip={c} pps={pps} h={tr.type === 'audio' ? 34 : 16} />}
                    <span className="ed-cname">{c.kind === 'text' ? '🅣 ' + String(c.text?.content || '').split('\n')[0] : base(c.file)}{(c.speed || 1) !== 1 ? ` · ${(c.speed).toFixed(2)}×` : ''}{c.fx?.length ? ` · fx ${c.fx.length}` : ''}</span>
                    {c.fadeIn > 0 && <span className="ed-fade in" style={{ width: c.fadeIn * pps }} />}
                    {c.fadeOut > 0 && <span className="ed-fade out" style={{ width: c.fadeOut * pps }} />}
                    <i className="ed-trim l" onMouseDown={(e) => onClipDown(e, c, tr, 'l')} />
                    <i className="ed-trim r" onMouseDown={(e) => onClipDown(e, c, tr, 'r')} />
                  </div>
                );
              })}
              {ghost && ghost.track === tr.id && <div className="ed-ghost" style={{ left: ghost.x * pps }} />}
            </div>
          ))}
          <div className="ed-playhead" style={{ left: t * pps }}><i /></div>
        </div>
      </div>
    </div>
  );
}
function Wave({ peaks, clip, pps, h }) {
  const ref = useRef(null);
  const w = Math.max(3, Math.min(8000, Math.round(clip.dur * pps)));
  useEffect(() => {
    const c = ref.current; if (!c) return; const x = c.getContext('2d'); x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(160,255,200,.75)';
    const sp = clip.speed || 1; const vol = Math.min(2, clip.volume ?? 1);
    for (let px = 0; px < w; px++) {
      const st = (clip.in || 0) + (px / pps) * sp; const i = Math.floor(st * peaks.pps);
      const v = (peaks.data[i] || 0) / 100 * vol; const bh = Math.max(1, v * h);
      x.fillRect(px, (h - bh) / 2, 1, bh);
    }
  }, [peaks, clip.in, clip.dur, clip.speed, clip.volume, pps, w, h]);
  return <canvas ref={ref} width={w} height={h} className="ed-wave" style={{ height: h }} />;
}
