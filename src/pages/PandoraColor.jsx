import React, { useEffect, useMemo, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError } from '../lib/job.jsx';
import { useStore, uid } from '../lib/store.jsx';
import Media from '../lib/Media.jsx';
import { DEFAULTS, sampleStats, autoParams, autoChoices, buildLUT, lutToCube, ffmpegFinish } from '../lib/grade.js';
import { loadImageData, downscale, useProcessed, Viewer, Histogram, SliderGroup, ChoiceGallery, lookChoices, Tabs, Slider } from '../lib/GradeUI.jsx';

// Pandora Color — a colourist's toolkit in one tab:
//   Auto Balance + "auto grade" choices (Resolve Auto Balance / Colourlab Auto-colour)
//   Looks library + My Looks (Colourlab look library, Imagen-style personal profiles)
//   Reference colour match with strength (Retouch4Me Color Match / Resolve Shot Match)
//   Primaries, tone, split-toning, finishing (Resolve primaries + Lightroom tone)
//   Export the grade as a .cube LUT, render one clip or the whole batch.
const base = (f) => String(f || '').split(/[\\/]/).pop();
const isImg = (f) => /\.(png|jpe?g|webp|bmp)$/i.test(f || '');
const creative = (p) => { const { wb, levels, match, exposure, ...rest } = p; return { ...rest, exposure: 0 }; };

export default function PandoraColor() {
  const { db, update } = useStore();
  const [ff, setFf] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [clips, setClips] = useState([]);
  const [cur, setCur] = useState('');
  const [frameInfo, setFrameInfo] = useState(null);
  const [t, setT] = useState(null);
  const [orig, setOrig] = useState(null);
  const [stats, setStats] = useState(null);
  const [params, setParams] = useState({ ...DEFAULTS });
  const [active, setActive] = useState('none');
  const [panel, setPanel] = useState('auto');
  const [ref, setRef] = useState(null); // { file, url, lab }
  const [perClipBalance, setPerClipBalance] = useState(true);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [lookName, setLookName] = useState('');
  const job = useJob();
  const myLooks = db.settings?.myLooks || [];
  const lib = (db.generations || []).filter((g) => g.kind === 'video' || g.kind === 'image').slice(0, 40);

  useEffect(() => { window.api.cut?.status().then((s) => setFf(!!s.ffmpeg)).catch(() => setFf(false)); }, []);
  useEffect(() => { const off = window.api.cut?.onProgress?.((p) => setProgress(p)); return typeof off === 'function' ? off : undefined; }, []);

  const loadFrame = async (file, at = null) => {
    setError('');
    try {
      const fr = await window.api.cut.frame({ file, t: at, max: 1280 });
      setFrameInfo(fr); setT(fr.t);
      const img = await loadImageData(fr.dataUrl, 1280);
      setOrig(img); setStats(sampleStats(img));
    } catch (e) { if (/FFMPEG_MISSING/.test(String(e.message))) setFf(false); else setError(friendlyError(e) || 'Could not read this file.'); }
  };
  const open = (file) => { setCur(file); loadFrame(file); };
  const addClips = (files) => { const list = (files || []).filter(Boolean); if (!list.length) return; setClips((c) => [...new Set([...c, ...list])]); if (!cur) open(list[0]); };

  const thumb = useMemo(() => (orig ? downscale(orig, 220) : null), [orig]);
  const [out, busy] = useProcessed(orig, params, null);
  const set = (patch) => { setParams((p) => ({ ...p, ...patch })); setActive('custom'); };

  const autoList = useMemo(() => (stats ? autoChoices(stats) : []), [stats]);
  const looks = useMemo(() => lookChoices(params, myLooks.map((m) => ({ id: 'my-' + m.id, name: '★ ' + m.name, p: m.p }))), [params.wb, params.levels, params.match, params.exposure, myLooks]);

  const pickRef = async () => {
    const f = await window.api.pickMedia(); if (!f?.[0]) return;
    try {
      const fr = await window.api.cut.frame({ file: f[0], max: 640 });
      const img = await loadImageData(fr.dataUrl, 640);
      const st = sampleStats(img);
      setRef({ file: f[0], url: fr.dataUrl, lab: st.lab });
      if (stats) setParams((p) => ({ ...p, wb: null, levels: null, match: { src: stats.lab, ref: st.lab, amount: 85 } }));
      setActive('custom');
    } catch (e) { setError(friendlyError(e)); }
  };

  const saveLook = () => {
    const name = lookName.trim() || 'My look ' + (myLooks.length + 1);
    update((d) => { d.settings = d.settings || {}; d.settings.myLooks = [...(d.settings.myLooks || []), { id: uid(), name, p: creative(params) }]; return d; });
    setLookName('');
  };

  // per-clip params: re-balance each clip and re-aim the reference match at that clip's own colours
  async function paramsFor(file) {
    if (!perClipBalance || file === cur) return params;
    const fr = await window.api.cut.frame({ file, max: 640 });
    const st = sampleStats(await loadImageData(fr.dataUrl, 640));
    const p = { ...params };
    if (params.wb || params.levels) Object.assign(p, autoParams(st), { vibrance: params.vibrance });
    if (params.match) p.match = { ...params.match, src: st.lab };
    return p;
  }

  async function renderList(files) {
    setError(''); setResults([]);
    await job.start(async (jobId, isCancelled) => {
      for (let i = 0; i < files.length; i++) {
        if (isCancelled && isCancelled()) break;
        try {
          setProgress({ stage: `Grading ${i + 1} of ${files.length}`, pct: 0 });
          const p = await paramsFor(files[i]);
          const r = await window.api.cut.renderGrade({ jobId, file: files[i], cube: lutToCube(buildLUT(p, 33)), finish: ffmpegFinish(p) });
          setResults((x) => [...x, r.file]);
          update((d) => { d.generations.unshift({ id: uid(), file: r.file, kind: r.image ? 'image' : 'video', prompt: `[Pandora Color] ${base(files[i])}`, model: 'Pandora Color (ffmpeg)', at: new Date().toISOString() }); return d; });
        } catch (e) { if (/FFMPEG_MISSING/.test(String(e.message))) { setFf(false); return; } const m = friendlyError(e); if (m && m !== 'cancelled') setError(m); break; }
      }
    });
    setProgress(null);
  }

  if (ff === false) {
    return (
      <div>
        <h1>🎨 Pandora Color</h1>
        <div className="card" style={{ maxWidth: 620 }}>
          <h3 style={{ marginTop: 0 }}>One small free add-on first</h3>
          <p className="sub">Colour grading renders with <b>ffmpeg</b> (free, ~30 MB, works offline after).</p>
          <button className="btn" disabled={installing} onClick={async () => { setInstalling(true); const r = await window.api.cut.ensure().catch((e) => ({ ok: false, error: e.message })); setInstalling(false); if (r.ok) setFf(true); else setError(r.error); }}>{installing ? 'Installing…' : '⬇ Install ffmpeg (free)'}</button>
          <ErrorBox error={error} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>🎨 Pandora Color</h1>
          <p className="sub" style={{ margin: 0 }}>Auto balance, pick a grade from real previews, match any reference, fine-tune like a colourist — then render or export a LUT. Free and offline.</p>
        </div>
      </div>

      <div className="g-layout">
        {/* media bin */}
        <div className="card g-bin">
          <div className="row" style={{ justifyContent: 'space-between' }}><strong>Media</strong>
            <button className="btn ghost small" onClick={async () => addClips(await window.api.pickMedia())}>+ Add</button></div>
          {lib.length > 0 && (
            <select value="" onChange={(e) => addClips([e.target.value])} style={{ marginTop: 6 }}>
              <option value="">…from Library</option>
              {lib.map((g) => <option key={g.id} value={g.file}>{g.kind === 'video' ? '🎞 ' : '🖼 '}{(g.prompt || g.kind).slice(0, 40)}</option>)}
            </select>
          )}
          <div className="g-clips">
            {clips.map((f) => (
              <button key={f} className={'g-clip' + (f === cur ? ' on' : '')} onClick={() => open(f)} title={f}>
                <span>{isImg(f) ? '🖼' : '🎞'}</span><span className="g-clip-n">{base(f)}</span>
                <i onClick={(e) => { e.stopPropagation(); setClips((c) => c.filter((x) => x !== f)); if (f === cur) { setCur(''); setOrig(null); } }}>✕</i>
              </button>
            ))}
            {!clips.length && <p className="sub" style={{ fontSize: 12 }}>Add videos or photos to grade.</p>}
          </div>
          <div className="g-ref">
            <strong style={{ fontSize: 12 }}>Reference look</strong>
            {ref ? <img src={ref.url} alt="reference" /> : <p className="sub" style={{ fontSize: 11 }}>Any still, film frame or graded clip — Pandora matches its colour.</p>}
            <div className="row"><button className="btn ghost small" onClick={pickRef}>{ref ? 'Change' : 'Pick reference'}</button>{ref && <button className="btn ghost small" onClick={() => { setRef(null); setParams((p) => ({ ...p, match: null })); }}>Clear</button>}</div>
          </div>
        </div>

        {/* viewer */}
        <div className="card g-view">
          <Viewer before={orig} after={out} busy={busy} />
          {frameInfo && !frameInfo.image && frameInfo.duration > 0 && (
            <div className="g-scrub">
              <span className="sub">Frame</span>
              <input type="range" min="0" max={frameInfo.duration} step="0.04" value={t ?? 0} onChange={(e) => setT(+e.target.value)} onMouseUp={() => loadFrame(cur, t)} onKeyUp={() => loadFrame(cur, t)} />
              <span className="sub">{(t ?? 0).toFixed(1)} / {frameInfo.duration.toFixed(1)} s</span>
            </div>
          )}
          <div className="row" style={{ alignItems: 'flex-end', marginTop: 8 }}>
            <Histogram img={out || orig} />
            <div style={{ flex: 1 }}>
              <Slider label="Grade strength" value={params.mix / 100} min={0} max={1} onChange={(v) => set({ mix: Math.round(v * 100) })} fmt={(v) => Math.round(v * 100) + '%'} />
              <div className="row" style={{ marginTop: 6 }}>
                <RunButton job={job} label="🎨 Render this clip" busyLabel={progress ? `${progress.stage} ${progress.pct ?? ''}%` : 'Rendering…'} onRun={() => renderList([cur])} disabled={!cur} />
                {clips.length > 1 && !job.running && <button className="btn ghost" onClick={() => renderList(clips)}>Grade all {clips.length}</button>}
              </div>
              {clips.length > 1 && <label className="row" style={{ gap: 6, marginTop: 6, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={perClipBalance} onChange={(e) => setPerClipBalance(e.target.checked)} /><span className="sub" style={{ fontSize: 11 }}>Shot match: re-balance each clip so the whole batch looks like one scene</span></label>}
            </div>
          </div>
          {progress && job.running && <div className="mstat-bar" style={{ marginTop: 8 }}><i style={{ width: (progress.pct || 2) + '%' }} /></div>}
          <ErrorBox error={error} />
          {results.length > 0 && (
            <div className="result-box"><Media file={results[results.length - 1]} kind={isImg(results[results.length - 1]) ? 'image' : 'video'} controls />
              <p className="sub" style={{ fontSize: 12 }}>✓ {results.length} graded file(s) saved to your Gallery.</p></div>
          )}
        </div>

        {/* panels */}
        <div className="card g-panel">
          <Tabs value={panel} onChange={setPanel} tabs={[['auto', 'Auto'], ['looks', 'Looks'], ['primaries', 'Primaries'], ['tone', 'Split-tone'], ['finish', 'Finish'], ['match', 'Match'], ['save', 'Save / LUT']]} />
          {!orig && <p className="sub" style={{ marginTop: 10 }}>Open a clip to see live previews of every grade.</p>}
          {orig && panel === 'auto' && (<>
            <p className="sub" style={{ fontSize: 12 }}>Auto Balance fixes white balance, exposure and black/white points. Then pick the direction you like:</p>
            <ChoiceGallery thumb={thumb} choices={autoList} active={active} onPick={(c) => { setParams({ ...c.p }); setActive(c.id); }} />
          </>)}
          {orig && panel === 'looks' && (<>
            <p className="sub" style={{ fontSize: 12 }}>Film looks on top of your balance — every look stays fully editable.</p>
            <ChoiceGallery thumb={thumb} choices={looks} active={active} onPick={(c) => { setParams({ ...c.p, mix: params.mix }); setActive(c.id); }} />
          </>)}
          {orig && panel === 'primaries' && (<>
            <h4 className="g-h">Light</h4><SliderGroup group="light" params={params} set={set} />
            <h4 className="g-h">Colour</h4><SliderGroup group="color" params={params} set={set} />
            <button className="btn ghost small" onClick={() => stats && set(autoParams(stats))}>⚖ Auto Balance</button>
          </>)}
          {orig && panel === 'tone' && (<><h4 className="g-h">Split-toning (shadows / highlights)</h4><SliderGroup group="split" params={params} set={set} /></>)}
          {orig && panel === 'finish' && (<><h4 className="g-h">Finishing</h4><SliderGroup group="finish" params={params} set={set} /></>)}
          {orig && panel === 'match' && (<>
            <p className="sub" style={{ fontSize: 12 }}>Make this clip look like any reference: a movie still, a photo you love, or your hero shot.</p>
            <button className="btn small" onClick={pickRef}>{ref ? 'Change reference' : 'Pick reference'}</button>
            {params.match && <Slider label="Match strength" value={(params.match.amount ?? 100) / 100} min={0} max={1} onChange={(v) => setParams((p) => ({ ...p, match: { ...p.match, amount: Math.round(v * 100) } }))} fmt={(v) => Math.round(v * 100) + '%'} />}
          </>)}
          {orig && panel === 'save' && (<>
            <h4 className="g-h">My Looks</h4>
            <div className="row"><input value={lookName} onChange={(e) => setLookName(e.target.value)} placeholder="Name this look" style={{ flex: 1 }} /><button className="btn small" onClick={saveLook}>★ Save look</button></div>
            <p className="sub" style={{ fontSize: 11 }}>Saved looks appear in Looks here, in Pandora Photo and in AutoEdit.</p>
            {myLooks.length > 0 && <div className="row" style={{ flexWrap: 'wrap' }}>{myLooks.map((m) => <span key={m.id} className="badge">★ {m.name} <a style={{ cursor: 'pointer', marginLeft: 4 }} onClick={() => update((d) => { d.settings.myLooks = d.settings.myLooks.filter((x) => x.id !== m.id); return d; })}>✕</a></span>)}</div>}
            <h4 className="g-h">Export LUT</h4>
            <p className="sub" style={{ fontSize: 11 }}>A .cube LUT of this grade for DaVinci Resolve, Premiere, Final Cut, Photoshop or OBS.</p>
            <button className="btn ghost small" onClick={() => window.api.cut.saveCube(lutToCube(buildLUT(params, 33), lookName || 'Pandora look'), lookName || 'pandora-look')}>⬇ Export .cube</button>
          </>)}
          <div className="row" style={{ marginTop: 12 }}><button className="btn ghost small" onClick={() => { setParams({ ...DEFAULTS }); setActive('none'); }}>↺ Reset</button></div>
        </div>
      </div>
    </div>
  );
}
