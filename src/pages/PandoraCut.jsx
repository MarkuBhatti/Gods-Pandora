import React, { useEffect, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError } from '../lib/job.jsx';
import { useStore, uid } from '../lib/store.jsx';
import Media from '../lib/Media.jsx';
import AssetActions from '../lib/AssetActions.jsx';

// Pandora Cut — the DaVinci-Resolve ideas that save the most time, made one-click and free:
//   Auto Edit  = beat detection + scene detection + smart reframe + transitions
//   Auto Color = Auto Balance + Shot Match + film looks / your .cube LUTs
const PACES = [['beat', 'Every beat', 'Fast, energetic (Reels/TikTok)'], ['2beats', 'Every 2 beats', 'Punchy'], ['4beats', 'Every bar', 'Balanced'], ['8beats', 'Every 2 bars', 'Cinematic'], ['calm', 'Calm (4 s)', 'No music needed']];
const TRANSITIONS = [['cut', 'Hard cut'], ['fade', 'Crossfade'], ['fadeblack', 'Dip to black'], ['smoothleft', 'Smooth slide'], ['radial', 'Radial wipe'], ['circleopen', 'Iris'], ['mixed', 'Mixed (auto)']];
const ASPECTS = [['9:16', 'Vertical 9:16'], ['16:9', 'Wide 16:9'], ['1:1', 'Square'], ['4:5', 'Feed 4:5'], ['21:9', 'Cinema 21:9']];
const base = (f) => String(f || '').split(/[\\/]/).pop();
const isImg = (f) => /\.(png|jpe?g|webp|bmp)$/i.test(f || '');

export default function PandoraCut() {
  const { db, update } = useStore();
  const [tab, setTab] = useState('edit');
  const [ff, setFf] = useState(null); // null = checking
  const [looks, setLooks] = useState(['none']);
  const [installing, setInstalling] = useState(false);
  const [clips, setClips] = useState([]);
  const [music, setMusic] = useState('');
  const [aspect, setAspect] = useState('9:16');
  const [pace, setPace] = useState('2beats');
  const [transition, setTransition] = useState('fade');
  const [length, setLength] = useState('');
  const [auto, setAuto] = useState(true);
  const [matchRef, setMatchRef] = useState('');
  const [look, setLook] = useState('Natural pop');
  const [lut, setLut] = useState('');
  const [vignette, setVignette] = useState(false);
  const [grain, setGrain] = useState(false);
  const [gradeFile, setGradeFile] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const job = useJob();
  const libVideos = (db.generations || []).filter((g) => g.kind === 'video' || g.kind === 'image').slice(0, 40);

  const check = () => window.api.cut?.status().then((s) => { setFf(!!s.ffmpeg); if (s.looks) setLooks(s.looks); }).catch(() => setFf(false));
  useEffect(() => { check(); }, []);
  useEffect(() => { const off = window.api.cut?.onProgress?.((p) => setProgress(p)); return typeof off === 'function' ? off : undefined; }, []);

  const install = async () => {
    setInstalling(true); setError('');
    const r = await window.api.cut.ensure().catch((e) => ({ ok: false, error: e.message }));
    setInstalling(false);
    if (!r.ok) setError(r.error); else check();
  };

  const colorOpts = { auto, matchRef: matchRef || null, look: lut ? 'none' : look, lut: lut || null, vignette, grain };
  const addClips = (files) => setClips((c) => [...new Set([...c, ...(files || []).filter(Boolean)])].slice(0, 60));
  const move = (i, d) => setClips((c) => { const n = [...c]; const j = i + d; if (j < 0 || j >= n.length) return c; [n[i], n[j]] = [n[j], n[i]]; return n; });

  const save = (file, kind, label) => update((d) => { d.generations.unshift({ id: uid(), file, kind, prompt: label, model: 'Pandora Cut (ffmpeg)', at: new Date().toISOString() }); return d; });

  async function runEdit() {
    setError(''); setResult(null); setProgress({ stage: 'Starting', pct: 0 });
    await job.start(async (jobId) => {
      try {
        const r = await window.api.cut.autoEdit({ jobId, clips, music: music || null, aspect, pace: music ? pace : 'calm', transition, length: +length || 0, ...colorOpts });
        setResult({ file: r.file, kind: 'video', info: `${r.shots} shots · ${r.duration}s${r.bpm ? ' · ' + r.bpm + ' BPM' : ''}` });
        save(r.file, 'video', `[Pandora Cut] auto edit · ${clips.length} clips${r.bpm ? ' · ' + r.bpm + ' BPM' : ''}`);
      } catch (e) {
        if (/FFMPEG_MISSING/.test(String(e.message))) { setFf(false); return; }
        const m = friendlyError(e); if (m && m !== 'cancelled') setError(m);
      }
    });
    setProgress(null);
  }

  async function runColor() {
    setError(''); setResult(null); setProgress({ stage: 'Starting', pct: 0 });
    await job.start(async (jobId) => {
      try {
        const r = await window.api.cut.autoColor({ jobId, file: gradeFile, ...colorOpts });
        const kind = isImg(r.file) ? 'image' : 'video';
        setResult({ file: r.file, kind, info: 'Graded' });
        save(r.file, kind, `[Pandora Cut] auto colour · ${lut ? base(lut) : look}${matchRef ? ' · matched' : ''}`);
      } catch (e) {
        if (/FFMPEG_MISSING/.test(String(e.message))) { setFf(false); return; }
        const m = friendlyError(e); if (m && m !== 'cancelled') setError(m);
      }
    });
    setProgress(null);
  }

  async function doPreview(file) {
    if (!file) return;
    setPreviewing(true); setError('');
    try { setPreview(await window.api.cut.preview({ file, ...colorOpts })); }
    catch (e) { const m = friendlyError(e); if (m && !/FFMPEG_MISSING/.test(m)) setError(m); else setFf(false); }
    setPreviewing(false);
  }

  const colorPanel = (
    <div className="cut-color">
      <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        <span><b>Auto Balance</b> — fixes white balance and exposure on every shot</span>
      </label>
      <label>Shot Match (make everything look like one clip)</label>
      <div className="row">
        <select value={matchRef} onChange={(e) => setMatchRef(e.target.value)} style={{ flex: 1 }}>
          <option value="">Off</option>
          {[...new Set([...clips, gradeFile].filter(Boolean))].map((f) => <option key={f} value={f}>{base(f)}</option>)}
        </select>
        <button className="btn ghost small" onClick={async () => { const f = await window.api.pickMedia(); if (f?.[0]) setMatchRef(f[0]); }}>Pick reference…</button>
      </div>
      <label>Look</label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {looks.map((l) => <button key={l} className={'chip mini' + (!lut && look === l ? ' on' : '')} onClick={() => { setLook(l); setLut(''); }}>{l === 'none' ? 'No look' : l}</button>)}
        <button className={'chip mini' + (lut ? ' on' : '')} onClick={async () => { const f = await window.api.pickLut(); if (f) setLut(f); }}>{lut ? '🎞 ' + base(lut) : '🎞 Load .cube LUT…'}</button>
      </div>
      <div className="row" style={{ gap: 16, marginTop: 8 }}>
        <label className="row" style={{ gap: 6, cursor: 'pointer', margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={vignette} onChange={(e) => setVignette(e.target.checked)} /> Vignette</label>
        <label className="row" style={{ gap: 6, cursor: 'pointer', margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={grain} onChange={(e) => setGrain(e.target.checked)} /> Film grain</label>
      </div>
    </div>
  );

  if (ff === false) {
    return (
      <div>
        <h1>🎞 Pandora Cut</h1>
        <div className="card" style={{ maxWidth: 620 }}>
          <h3 style={{ marginTop: 0 }}>One small free add-on first</h3>
          <p className="sub">Pandora Cut edits and grades with <b>ffmpeg</b> — the free engine behind most video tools. It's a one-time ~30 MB download and works offline after that.</p>
          <button className="btn" disabled={installing} onClick={install}>{installing ? <><span className="spinner" /> Installing…</> : '⬇ Install ffmpeg (free)'}</button>
          <ErrorBox error={error} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>🎞 Pandora Cut</h1>
      <p className="sub">Auto edit to the beat and auto colour grade — inspired by DaVinci Resolve's smartest tools, free and offline. Drop in clips, pick music, press one button.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <button className={'chip' + (tab === 'edit' ? ' on' : '')} onClick={() => { setTab('edit'); setResult(null); }}>🎬 Auto Edit</button>
        <button className={'chip' + (tab === 'color' ? ' on' : '')} onClick={() => { setTab('color'); setResult(null); }}>🎨 Auto Color</button>
      </div>

      <div className="two-col">
        <div className="card">
          {tab === 'edit' ? (
            <>
              <label>1 · Clips & photos ({clips.length})</label>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn ghost small" onClick={async () => addClips(await window.api.pickMedia())}>+ From computer</button>
                {libVideos.length > 0 && (
                  <select style={{ flex: 1, minWidth: 160 }} value="" onChange={(e) => addClips([e.target.value])}>
                    <option value="">…or add from Library</option>
                    {libVideos.map((g) => <option key={g.id} value={g.file}>{g.kind === 'video' ? '🎞 ' : '🖼 '}{(g.prompt || g.kind).slice(0, 50)}</option>)}
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

              <label>2 · Music (cuts follow the beat)</label>
              <div className="row">
                <button className="btn ghost small" onClick={async () => { const f = await window.api.pickAudio(); if (f) setMusic(f); }}>{music ? '♪ ' + base(music) : '+ Choose music'}</button>
                {music && <button className="btn ghost small" onClick={() => setMusic('')}>Remove</button>}
              </div>

              <label>3 · Pace</label>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {PACES.filter(([id]) => (music ? id !== 'calm' : id === 'calm')).map(([id, name, hint]) => <button key={id} title={hint} className={'chip mini' + ((music ? pace : 'calm') === id ? ' on' : '')} onClick={() => setPace(id)}>{name}</button>)}
              </div>

              <div className="cinerow" style={{ marginTop: 4 }}>
                <div><label>Format (smart reframe)</label><select value={aspect} onChange={(e) => setAspect(e.target.value)}>{ASPECTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
                <div><label>Transition</label><select value={transition} onChange={(e) => setTransition(e.target.value)}>{TRANSITIONS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></div>
                <div><label>Length (s, blank = auto)</label><input type="number" min="3" max="600" value={length} onChange={(e) => setLength(e.target.value)} placeholder={music ? 'song length (max 90)' : 'auto'} /></div>
              </div>

              <label style={{ marginTop: 10 }}>4 · Colour</label>
              {colorPanel}

              <div style={{ marginTop: 16 }}>
                <RunButton job={job} label="✂ Auto edit my video" busyLabel={progress ? `${progress.stage} ${progress.pct ?? ''}%` : 'Working…'} onRun={runEdit} disabled={!clips.length} />
                {!clips.length && <span className="sub" style={{ fontSize: 11, marginLeft: 8 }}>Add a few clips or photos to start.</span>}
              </div>
            </>
          ) : (
            <>
              <label>Video or photo to grade</label>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn ghost small" onClick={async () => { const f = await window.api.pickMedia(); if (f?.[0]) { setGradeFile(f[0]); setPreview(null); } }}>{gradeFile ? base(gradeFile) : '+ Choose file'}</button>
                {libVideos.length > 0 && (
                  <select style={{ flex: 1, minWidth: 160 }} value="" onChange={(e) => { setGradeFile(e.target.value); setPreview(null); }}>
                    <option value="">…or pick from Library</option>
                    {libVideos.map((g) => <option key={g.id} value={g.file}>{g.kind === 'video' ? '🎞 ' : '🖼 '}{(g.prompt || g.kind).slice(0, 50)}</option>)}
                  </select>
                )}
              </div>
              {colorPanel}
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn ghost" disabled={!gradeFile || previewing || job.running} onClick={() => doPreview(gradeFile)}>{previewing ? <><span className="spinner" /> Preview…</> : '👁 Preview'}</button>
                <RunButton job={job} label="🎨 Grade & save" busyLabel={progress ? `${progress.stage} ${progress.pct ?? ''}%` : 'Working…'} onRun={runColor} disabled={!gradeFile} />
              </div>
            </>
          )}
          {progress && job.running && <div className="mstat-bar" style={{ marginTop: 10 }}><i style={{ width: (progress.pct || 2) + '%' }} /></div>}
          <ErrorBox error={error} />
        </div>

        <div className="card">
          {result ? (
            <div className="result-box">
              <Media file={result.file} kind={result.kind} controls />
              <p className="sub" style={{ fontSize: 12 }}>✓ {result.info} — saved to your Library.</p>
              <AssetActions file={result.file} kind={result.kind} prompt="Pandora Cut" compact />
            </div>
          ) : tab === 'color' && preview ? (
            <div className="cut-compare">
              <div><span className="sub">Before</span><img src={'media://' + preview.before} alt="before" /></div>
              <div><span className="sub">After</span><img src={'media://' + preview.after} alt="after" /></div>
            </div>
          ) : (
            <div className="cut-help">
              <h3 style={{ marginTop: 0 }}>{tab === 'edit' ? 'How Auto Edit works' : 'How Auto Color works'}</h3>
              {tab === 'edit' ? (
                <ol className="sub">
                  <li><b>Beat detection</b> finds the tempo of your song — every cut lands on the beat.</li>
                  <li><b>Scene detection</b> starts each shot on a fresh moment from every clip.</li>
                  <li><b>Smart reframe</b> crops to vertical, square or wide automatically.</li>
                  <li><b>Auto colour</b> balances every shot, then applies one look so it all matches.</li>
                  <li>Photos get a gentle Ken-Burns push-in.</li>
                </ol>
              ) : (
                <ol className="sub">
                  <li><b>Auto Balance</b> neutralises colour casts and sets black and white levels.</li>
                  <li><b>Shot Match</b> copies the colour and contrast of a reference clip.</li>
                  <li><b>Looks</b> or your own <b>.cube LUT</b> add the final style.</li>
                  <li>Press <b>Preview</b> to compare before and after on one frame.</li>
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
