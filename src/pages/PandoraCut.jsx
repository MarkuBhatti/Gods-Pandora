import React, { useEffect, useMemo, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError } from '../lib/job.jsx';
import { useStore, uid } from '../lib/store.jsx';
import Media from '../lib/Media.jsx';
import AssetActions from '../lib/AssetActions.jsx';
import { DEFAULTS, LOOKS, lookById, buildLUT, lutToCube, ffmpegFinish } from '../lib/grade.js';

// Pandora AutoEdit — CapCut AutoCut-style templates + DaVinci-style smarts, free and offline (ffmpeg):
//   • Music montage: beat detection, highlight picking (busiest moments), scene detection, smart reframe,
//     style templates (transitions, punch-in zooms, cinematic bars, opening title, colour look).
//   • Talking video: jump cuts that remove pauses and silences automatically.
const PACES = [['beat', 'Every beat'], ['2beats', 'Every 2 beats'], ['4beats', 'Every bar'], ['8beats', 'Every 2 bars'], ['calm', 'Calm (4 s)']];
const TRANSITIONS = [['cut', 'Hard cut'], ['fade', 'Crossfade'], ['fadeblack', 'Dip to black'], ['fadewhite', 'Flash white'], ['smoothleft', 'Smooth slide'], ['radial', 'Radial wipe'], ['circleopen', 'Iris'], ['mixed', 'Mixed (auto)']];
const ASPECTS = [['9:16', 'Vertical 9:16'], ['16:9', 'Wide 16:9'], ['1:1', 'Square'], ['4:5', 'Feed 4:5'], ['21:9', 'Cinema 21:9']];
// Style templates — each one is a full recipe
const STYLES = [
  { id: 'vlog', name: 'Vlog', icon: '🎒', desc: 'Friendly pace, smooth slides, bright colour', s: { pace: '2beats', transition: 'mixed', mixSet: ['smoothleft', 'fade', 'slideup'], look: 'natural', zoomPulse: 0.5, letterbox: false, aspect: '9:16' } },
  { id: 'travel', name: 'Travel', icon: '✈️', desc: 'Best moments, golden colour, dissolves', s: { pace: '4beats', transition: 'mixed', mixSet: ['fade', 'dissolve', 'smoothleft'], look: 'golden', zoomPulse: 0.4, letterbox: false, aspect: '16:9' } },
  { id: 'hype', name: 'Hype / Sports', icon: '⚡', desc: 'Every beat, white flashes, punch-ins', s: { pace: 'beat', transition: 'mixed', mixSet: ['fadewhite', 'radial', 'fade'], look: 'bleach', zoomPulse: 1, letterbox: false, aspect: '9:16' } },
  { id: 'cinematic', name: 'Cinematic', icon: '🎬', desc: 'Slow cuts, 2.39 bars, teal & orange', s: { pace: '8beats', transition: 'fade', look: 'teal-orange', zoomPulse: 0, letterbox: true, aspect: '16:9' } },
  { id: 'wedding', name: 'Wedding / Romantic', icon: '💍', desc: 'Soft dissolves, warm film, gentle', s: { pace: '4beats', transition: 'fade', look: 'warm-film', zoomPulse: 0.3, letterbox: false, aspect: '16:9' } },
  { id: 'promo', name: 'Product Promo', icon: '🛍', desc: 'Clean commercial, zoom pulses', s: { pace: '2beats', transition: 'mixed', mixSet: ['smoothleft', 'fadewhite', 'fade'], look: 'clean', zoomPulse: 0.8, letterbox: false, aspect: '9:16' } },
  { id: 'trend', name: 'TikTok Trend', icon: '📱', desc: 'Fast cuts on every beat, punchy', s: { pace: 'beat', transition: 'cut', look: 'natural', zoomPulse: 1, letterbox: false, aspect: '9:16' } },
  { id: 'doc', name: 'Documentary', icon: '🎞', desc: 'Calm pacing, natural film look', s: { pace: '8beats', transition: 'fadeblack', look: 'fuji', zoomPulse: 0.2, letterbox: false, aspect: '16:9' } },
  { id: 'moody', name: 'Moody Night', icon: '🌙', desc: 'Matte shadows, cool tones, iris cuts', s: { pace: '4beats', transition: 'mixed', mixSet: ['fadeblack', 'circleopen'], look: 'moody', zoomPulse: 0.3, letterbox: true, aspect: '16:9' } },
];
const base = (f) => String(f || '').split(/[\\/]/).pop();
const isImg = (f) => /\.(png|jpe?g|webp|bmp)$/i.test(f || '');

export default function PandoraCut() {
  const { db, update } = useStore();
  const [mode, setMode] = useState('montage');
  const [ff, setFf] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [clips, setClips] = useState([]);
  const [music, setMusic] = useState('');
  const [style, setStyle] = useState('vlog');
  const [aspect, setAspect] = useState('9:16');
  const [pace, setPace] = useState('2beats');
  const [transition, setTransition] = useState('mixed');
  const [mixSet, setMixSet] = useState(STYLES[0].s.mixSet);
  const [zoomPulse, setZoomPulse] = useState(0.5);
  const [letterbox, setLetterbox] = useState(false);
  const [highlights, setHighlights] = useState(true);
  const [title, setTitle] = useState('');
  const [length, setLength] = useState('');
  const [auto, setAuto] = useState(true);
  const [look, setLook] = useState('natural');
  const [matchRef, setMatchRef] = useState('');
  const [talk, setTalk] = useState('');
  const [tight, setTight] = useState(0.45);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const job = useJob();
  const myLooks = db.settings?.myLooks || [];
  const lib = (db.generations || []).filter((g) => g.kind === 'video' || g.kind === 'image').slice(0, 40);

  const check = () => window.api.cut?.status().then((s) => setFf(!!s.ffmpeg)).catch(() => setFf(false));
  useEffect(() => { check(); }, []);
  useEffect(() => { const off = window.api.cut?.onProgress?.((p) => setProgress(p)); return typeof off === 'function' ? off : undefined; }, []);

  const applyStyle = (st) => {
    setStyle(st.id); const s = st.s;
    setPace(s.pace); setTransition(s.transition); setMixSet(s.mixSet || null); setLook(s.look); setZoomPulse(s.zoomPulse); setLetterbox(s.letterbox); setAspect(s.aspect);
  };
  const lookParams = useMemo(() => {
    const my = myLooks.find((m) => 'my-' + m.id === look);
    return { ...DEFAULTS, ...(my ? my.p : lookById(look).p) };
  }, [look, myLooks]);
  const colour = () => ({ auto, matchRef: matchRef || null, look: 'none', cube: look === 'none' && !auto ? null : lutToCube(buildLUT(lookParams, 33)), finish: ffmpegFinish(lookParams) });
  const addClips = (files) => setClips((c) => [...new Set([...c, ...(files || []).filter(Boolean)])].slice(0, 60));
  const move = (i, d) => setClips((c) => { const n = [...c]; const j = i + d; if (j < 0 || j >= n.length) return c; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const save = (file, label) => update((d) => { d.generations.unshift({ id: uid(), file, kind: 'video', prompt: label, model: 'Pandora AutoEdit (ffmpeg)', at: new Date().toISOString() }); return d; });

  async function runMontage() {
    setError(''); setResult(null); setProgress({ stage: 'Starting', pct: 0 });
    await job.start(async (jobId) => {
      try {
        const r = await window.api.cut.autoEdit({ jobId, clips, music: music || null, aspect, pace: music ? pace : 'calm', transition, mixSet: transition === 'mixed' ? mixSet : null, length: +length || 0, zoomPulse, letterbox, highlights, title: title.trim(), ...colour() });
        setResult({ file: r.file, info: `${r.shots} shots · ${r.duration}s${r.bpm ? ' · ' + r.bpm + ' BPM' : ''}` });
        save(r.file, `[AutoEdit · ${STYLES.find((s) => s.id === style)?.name || 'Custom'}] ${clips.length} clips${r.bpm ? ' · ' + r.bpm + ' BPM' : ''}`);
      } catch (e) { if (/FFMPEG_MISSING/.test(String(e.message))) { setFf(false); return; } const m = friendlyError(e); if (m && m !== 'cancelled') setError(m); }
    });
    setProgress(null);
  }
  async function runJump() {
    setError(''); setResult(null); setProgress({ stage: 'Starting', pct: 0 });
    await job.start(async (jobId) => {
      try {
        const c = colour();
        const r = await window.api.cut.jumpCut({ jobId, file: talk, minSilence: tight, padding: 0.12, cube: c.cube, finish: c.finish });
        setResult({ file: r.file, info: `${r.cuts} pauses removed · ${r.removed}s shorter · ${r.duration}s` });
        save(r.file, `[AutoEdit · Jump cut] ${base(talk)}`);
      } catch (e) { if (/FFMPEG_MISSING/.test(String(e.message))) { setFf(false); return; } const m = friendlyError(e); if (m && m !== 'cancelled') setError(m); }
    });
    setProgress(null);
  }

  if (ff === false) {
    return (
      <div>
        <h1>🎞 Pandora AutoEdit</h1>
        <div className="card" style={{ maxWidth: 620 }}>
          <h3 style={{ marginTop: 0 }}>One small free add-on first</h3>
          <p className="sub">AutoEdit renders with <b>ffmpeg</b> — the free engine behind most video tools. One-time ~30 MB download, offline after.</p>
          <button className="btn" disabled={installing} onClick={async () => { setInstalling(true); setError(''); const r = await window.api.cut.ensure().catch((e) => ({ ok: false, error: e.message })); setInstalling(false); if (!r.ok) setError(r.error); else check(); }}>{installing ? <><span className="spinner" /> Installing…</> : '⬇ Install ffmpeg (free)'}</button>
          <ErrorBox error={error} />
        </div>
      </div>
    );
  }

  const colourPanel = (
    <div className="cut-color">
      <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={auto} onChange={(e) => setAuto(e.target.checked)} /><span><b>Auto Balance every shot</b> — fixes white balance and exposure so all clips match</span></label>
      <label>Colour look</label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {[...LOOKS, ...myLooks.map((m) => ({ id: 'my-' + m.id, name: '★ ' + m.name }))].map((l) => <button key={l.id} className={'chip mini' + (look === l.id ? ' on' : '')} onClick={() => setLook(l.id)}>{l.name}</button>)}
      </div>
      {mode === 'montage' && <>
        <label>Match everything to a reference (optional)</label>
        <div className="row">
          <select value={matchRef} onChange={(e) => setMatchRef(e.target.value)} style={{ flex: 1 }}><option value="">Off</option>{clips.map((f) => <option key={f} value={f}>{base(f)}</option>)}</select>
          <button className="btn ghost small" onClick={async () => { const f = await window.api.pickMedia(); if (f?.[0]) setMatchRef(f[0]); }}>Pick…</button>
        </div>
      </>}
      <p className="sub" style={{ fontSize: 11, margin: '6px 0 0' }}>For shot-by-shot grading with live previews use <a style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => window.dispatchEvent(new CustomEvent('pandora:go', { detail: 'color' }))}>Pandora Color</a>.</p>
    </div>
  );

  return (
    <div>
      <h1>🎞 Pandora AutoEdit</h1>
      <p className="sub">Drop in clips and music, pick a style — AutoEdit finds the best moments, cuts on the beat, adds transitions, zooms, titles and a colour look. Or turn a talking video into tight jump cuts. Free and offline.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={'chip' + (mode === 'montage' ? ' on' : '')} onClick={() => { setMode('montage'); setResult(null); }}>🎵 Music montage</button>
        <button className={'chip' + (mode === 'talk' ? ' on' : '')} onClick={() => { setMode('talk'); setResult(null); }}>🗣 Talking video (jump cuts)</button>
      </div>

      <div className="two-col">
        <div className="card">
          {mode === 'montage' ? (<>
            <label>1 · Style</label>
            <div className="ae-styles">
              {STYLES.map((st) => (
                <button key={st.id} type="button" className={'ae-style' + (style === st.id ? ' on' : '')} onClick={() => applyStyle(st)}>
                  <span className="ae-ico">{st.icon}</span><b>{st.name}</b><small>{st.desc}</small>
                </button>
              ))}
            </div>

            <label>2 · Clips & photos ({clips.length})</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn ghost small" onClick={async () => addClips(await window.api.pickMedia())}>+ From computer</button>
              {lib.length > 0 && (
                <select style={{ flex: 1, minWidth: 160 }} value="" onChange={(e) => addClips([e.target.value])}>
                  <option value="">…or add from Gallery</option>
                  {lib.map((g) => <option key={g.id} value={g.file}>{g.kind === 'video' ? '🎞 ' : '🖼 '}{(g.prompt || g.kind).slice(0, 50)}</option>)}
                </select>
              )}
            </div>
            {clips.length > 0 && (
              <div className="cut-list">
                {clips.map((f, i) => (
                  <div key={f} className="cut-item">
                    <span className="cut-n">{i + 1}</span>
                    <span className="cut-name" title={f}>{isImg(f) ? '🖼 ' : '🎞 '}{base(f)}</span>
                    <button className="btn ghost small" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                    <button className="btn ghost small" onClick={() => move(i, 1)} disabled={i === clips.length - 1}>↓</button>
                    <button className="btn ghost small" onClick={() => setClips((c) => c.filter((x) => x !== f))}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <label>3 · Music (cuts land on the beat)</label>
            <div className="row">
              <button className="btn ghost small" onClick={async () => { const f = await window.api.pickAudio(); if (f) setMusic(f); }}>{music ? '♪ ' + base(music) : '+ Choose music'}</button>
              {music && <button className="btn ghost small" onClick={() => setMusic('')}>Remove</button>}
            </div>

            <details className="ae-more">
              <summary>Fine-tune the edit</summary>
              <div className="cinerow" style={{ marginTop: 6 }}>
                <div><label>Pace</label><select value={music ? pace : 'calm'} onChange={(e) => setPace(e.target.value)} disabled={!music}>{PACES.filter(([id]) => (music ? id !== 'calm' : id === 'calm')).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
                <div><label>Transition</label><select value={transition} onChange={(e) => setTransition(e.target.value)}>{TRANSITIONS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
                <div><label>Format (smart reframe)</label><select value={aspect} onChange={(e) => setAspect(e.target.value)}>{ASPECTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
                <div><label>Length (s, blank = auto)</label><input type="number" min="3" max="600" value={length} onChange={(e) => setLength(e.target.value)} placeholder={music ? 'song (max 90)' : 'auto'} /></div>
              </div>
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={highlights} onChange={(e) => setHighlights(e.target.checked)} /><span>Pick the best moments (most action) from each clip</span></label>
              <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={letterbox} onChange={(e) => setLetterbox(e.target.checked)} /><span>Cinematic bars</span></label>
              <label>Punch-in zoom on cuts: {Math.round(zoomPulse * 100)}%</label>
              <input type="range" min="0" max="1" step="0.1" value={zoomPulse} onChange={(e) => setZoomPulse(+e.target.value)} />
              <label>Opening title (optional)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer in Lahore" maxLength={60} />
            </details>

            <label style={{ marginTop: 10 }}>4 · Colour</label>
            {colourPanel}
            <div style={{ marginTop: 16 }}>
              <RunButton job={job} label="✂ Auto edit my video" busyLabel={progress ? `${progress.stage} ${progress.pct ?? ''}%` : 'Working…'} onRun={runMontage} disabled={!clips.length} />
              {!clips.length && <span className="sub" style={{ fontSize: 11, marginLeft: 8 }}>Add a few clips or photos to start.</span>}
            </div>
          </>) : (<>
            <label>Talking video (vlog, podcast, tutorial, interview)</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <button className="btn ghost small" onClick={async () => { const f = await window.api.pickVideo(); if (f) setTalk(f); }}>{talk ? '🎞 ' + base(talk) : '+ Choose video'}</button>
              {lib.filter((g) => g.kind === 'video').length > 0 && (
                <select style={{ flex: 1, minWidth: 160 }} value="" onChange={(e) => setTalk(e.target.value)}>
                  <option value="">…or pick from Gallery</option>
                  {lib.filter((g) => g.kind === 'video').map((g) => <option key={g.id} value={g.file}>{(g.prompt || 'video').slice(0, 50)}</option>)}
                </select>
              )}
            </div>
            <label>How tight? (shortest pause to remove: {tight.toFixed(2)} s)</label>
            <input type="range" min="0.25" max="1.2" step="0.05" value={tight} onChange={(e) => setTight(+e.target.value)} />
            <p className="sub" style={{ fontSize: 11 }}>Lower = snappier YouTube-style jump cuts. Higher = only long silences are removed.</p>
            <label style={{ marginTop: 10 }}>Colour</label>
            {colourPanel}
            <div style={{ marginTop: 16 }}>
              <RunButton job={job} label="✂ Remove pauses" busyLabel={progress ? `${progress.stage} ${progress.pct ?? ''}%` : 'Working…'} onRun={runJump} disabled={!talk} />
            </div>
          </>)}
          {progress && job.running && <div className="mstat-bar" style={{ marginTop: 10 }}><i style={{ width: (progress.pct || 2) + '%' }} /></div>}
          <ErrorBox error={error} />
        </div>

        <div className="card">
          {result ? (
            <div className="result-box">
              <Media file={result.file} kind="video" controls />
              <p className="sub" style={{ fontSize: 12 }}>✓ {result.info} — saved to your Gallery.</p>
              <AssetActions file={result.file} kind="video" prompt="Pandora AutoEdit" compact />
            </div>
          ) : (
            <div className="cut-help">
              <h3 style={{ marginTop: 0 }}>{mode === 'montage' ? 'How AutoEdit works' : 'How jump cuts work'}</h3>
              {mode === 'montage' ? (
                <ol className="sub">
                  <li><b>Style</b> sets pace, transitions, zooms, bars and colour in one click — tweak anything after.</li>
                  <li><b>Beat detection</b> finds the tempo of your song; every cut lands on the beat.</li>
                  <li><b>Best moments</b>: each clip is scanned for action, and the liveliest parts are used.</li>
                  <li><b>Smart reframe</b> crops to vertical, square or wide automatically.</li>
                  <li><b>Colour</b>: every shot is balanced, then one look makes it feel like one film.</li>
                  <li>Photos get a gentle Ken-Burns push-in; an optional title fades in at the start.</li>
                </ol>
              ) : (
                <ol className="sub">
                  <li>Pandora listens to the audio and finds every pause.</li>
                  <li>Silences are cut out, with a little breathing room kept around each sentence.</li>
                  <li>Picture and sound stay perfectly in sync; an optional colour look is applied.</li>
                </ol>
              )}
              <p className="sub" style={{ fontSize: 11 }}>Free and offline. Low-priority rendering keeps the rest of the app smooth.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
