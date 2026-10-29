import React, { useMemo, useState } from 'react';
import { ErrorBox, friendlyError } from '../lib/job.jsx';
import { useStore, uid } from '../lib/store.jsx';
import { DEFAULTS, sampleStats, autoParams, autoChoices } from '../lib/grade.js';
import FxStack from '../lib/FxStack.jsx';
import { loadImageData, downscale, render, imgToDataUrl, useProcessed, Viewer, Histogram, SliderGroup, ChoiceGallery, lookChoices, Tabs, Slider } from '../lib/GradeUI.jsx';

// Pandora Photo — auto photo edit & portrait retouch:
//   Auto Enhance + choices (Imagen-style one-click edit), Lightroom-style light/colour sliders,
//   looks + My Looks, reference colour match (Retouch4Me Color Match),
//   portrait retouch (Evoto / Retouch4Me ideas): skin smoothing that keeps pores, blemish removal,
//   even skin tone, plus brushes — spot heal, whiten teeth & eyes, smooth, brighten eyes.
//   Batch: apply the edit to every photo (each auto-balanced first), saved at full resolution.
const base = (f) => String(f || '').split(/[\\/]/).pop();
const RET = { smooth: 0, blemish: 0, evenTone: 0 };
const BRUSHES = [['heal', '🩹 Spot heal', 'Click a spot, pimple or stray hair'], ['whiten', '🦷 Whiten', 'Paint over teeth or eye whites'], ['smooth', '✨ Smooth', 'Paint over skin to soften'], ['brighten', '👁 Brighten', 'Paint over eyes to make them pop']];

export default function PandoraPhoto() {
  const { db, update } = useStore();
  const [photos, setPhotos] = useState([]); // { file, params, strokes }
  const [idx, setIdx] = useState(-1);
  const [orig, setOrig] = useState(null);
  const [stats, setStats] = useState(null);
  const [panel, setPanel] = useState('auto');
  const [active, setActive] = useState('none');
  const [brush, setBrush] = useState(null);
  const [size, setSize] = useState(0.03);
  const [strength, setStrength] = useState(0.8);
  const [busySave, setBusySave] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [ref, setRef] = useState(null);
  const myLooks = db.settings?.myLooks || [];

  const cur = photos[idx] || null;
  const params = cur?.params || { ...DEFAULTS, ...RET };
  const strokes = cur?.strokes || [];
  const patchCur = (fn) => setPhotos((list) => list.map((p, i) => (i === idx ? fn(p) : p)));
  const set = (patch) => { patchCur((p) => ({ ...p, params: { ...p.params, ...patch } })); setActive('custom'); };

  const openAt = async (i, list = photos) => {
    setIdx(i); setError(''); setMsg('');
    try {
      const url = await window.api.dataUrl(list[i].file);
      const img = await loadImageData(url, 1200); // preview size — saving always uses full resolution
      setOrig(img); setStats(sampleStats(img));
    } catch (e) { setError(friendlyError(e) || 'Could not open this photo.'); }
  };
  const add = async () => {
    const files = await window.api.pickImages(); if (!files?.length) return;
    const list = [...photos, ...files.map((f) => ({ file: f, params: { ...DEFAULTS, ...RET }, strokes: [] }))];
    setPhotos(list); if (idx < 0) openAt(photos.length, list);
  };

  const thumb = useMemo(() => (orig ? downscale(orig, 200) : null), [orig]);
  const [out, busy] = useProcessed(orig, params, strokes);
  const autoList = useMemo(() => (stats ? autoChoices(stats).map((c) => ({ ...c, p: { ...c.p, ...RET } })) : []), [stats]);
  const looks = useMemo(() => lookChoices(params, myLooks.map((m) => ({ id: 'my-' + m.id, name: '★ ' + m.name, p: m.p }))).map((c) => ({ ...c, p: { ...c.p, smooth: params.smooth, blemish: params.blemish, evenTone: params.evenTone } })), [params.wb, params.levels, params.match, params.exposure, params.smooth, params.blemish, params.evenTone, myLooks]);

  const onPoint = (p) => {
    if (!brush) return;
    patchCur((c) => ({ ...c, strokes: [...c.strokes, { tool: brush, x: p.x, y: p.y, r: size, strength }] }));
  };

  const pickRef = async () => {
    const f = await window.api.pickImages(); if (!f?.[0]) return;
    const img = await loadImageData(await window.api.dataUrl(f[0]), 640);
    const st = sampleStats(img); setRef({ file: f[0], lab: st.lab });
    if (stats) set({ wb: null, levels: null, match: { src: stats.lab, ref: st.lab, amount: 85 } });
  };

  async function saveOne(i, ps = photos[i].params, st = photos[i].strokes) {
    const url = await window.api.dataUrl(photos[i].file);
    const full = await loadImageData(url, 8000);
    const outImg = render(full, ps, { strokes: st });
    const file = await window.api.savePhoto(imgToDataUrl(outImg, 'image/jpeg', 0.95), base(photos[i].file));
    update((d) => { d.generations.unshift({ id: uid(), file, kind: 'image', prompt: `[Pandora Photo] ${base(photos[i].file)}`, model: 'Pandora Photo', at: new Date().toISOString() }); return d; });
    return file;
  }
  const save = async () => {
    setBusySave('Saving full resolution…'); setError('');
    try { await saveOne(idx); setMsg('✓ Saved to your Gallery (full resolution).'); } catch (e) { setError(friendlyError(e)); }
    setBusySave('');
  };
  // Batch: same look + retouch on every photo, each one auto-balanced on its own first (Imagen-style profile)
  const saveAll = async () => {
    setError(''); setMsg('');
    const look = params;
    for (let i = 0; i < photos.length; i++) {
      setBusySave(`Editing ${i + 1} of ${photos.length}…`);
      try {
        let ps = look;
        if (i !== idx) {
          const st = sampleStats(await loadImageData(await window.api.dataUrl(photos[i].file), 640));
          ps = { ...look };
          if (look.wb || look.levels) Object.assign(ps, autoParams(st), { vibrance: look.vibrance });
          if (look.match) ps.match = { ...look.match, src: st.lab };
        }
        await saveOne(i, ps, i === idx ? strokes : []);
      } catch (e) { setError(friendlyError(e)); break; }
    }
    setBusySave(''); setMsg(`✓ ${photos.length} photos edited and saved to your Gallery.`);
  };

  return (
    <div>
      <h1 style={{ marginBottom: 2 }}>📷 Pandora Photo</h1>
      <p className="sub" style={{ margin: 0 }}>One-click photo edits and natural portrait retouching — auto enhance, looks, colour match, skin, blemishes, teeth and eyes. Free, offline, full resolution.</p>

      <div className="g-layout">
        <div className="card g-bin">
          <div className="row" style={{ justifyContent: 'space-between' }}><strong>Photos</strong><button className="btn ghost small" onClick={add}>+ Add</button></div>
          <div className="g-clips">
            {photos.map((p, i) => (
              <button key={p.file + i} className={'g-clip' + (i === idx ? ' on' : '')} onClick={() => openAt(i)} title={p.file}>
                <span>🖼</span><span className="g-clip-n">{base(p.file)}</span>
                <i onClick={(e) => { e.stopPropagation(); const list = photos.filter((_, j) => j !== i); setPhotos(list); if (i === idx) { setIdx(-1); setOrig(null); } else if (i < idx) setIdx(idx - 1); }}>✕</i>
              </button>
            ))}
            {!photos.length && <p className="sub" style={{ fontSize: 12 }}>Add one photo or a whole shoot.</p>}
          </div>
          {photos.length > 0 && (
            <div className="g-ref">
              <button className="btn small" disabled={!!busySave || !orig} onClick={save}>💾 Save this photo</button>
              {photos.length > 1 && <button className="btn ghost small" disabled={!!busySave || !orig} onClick={saveAll}>Apply & save all {photos.length}</button>}
              {busySave && <span className="sub" style={{ fontSize: 11 }}><span className="spinner" /> {busySave}</span>}
              {msg && <span className="ok" style={{ fontSize: 11 }}>{msg}</span>}
            </div>
          )}
        </div>

        <div className="card g-view">
          <Viewer before={orig} after={out} busy={busy} brush={brush ? { r: size, drag: brush !== 'heal' } : null} onPoint={onPoint} />
          <div className="row" style={{ alignItems: 'flex-end', marginTop: 8 }}>
            <Histogram img={out || orig} />
            <div style={{ flex: 1 }}>
              <Slider label="Edit strength" value={(params.mix ?? 100) / 100} min={0} max={1} onChange={(v) => set({ mix: Math.round(v * 100) })} fmt={(v) => Math.round(v * 100) + '%'} />
              {strokes.length > 0 && <div className="row"><span className="sub" style={{ fontSize: 11 }}>{strokes.length} brush touch(es)</span><button className="btn ghost small" onClick={() => patchCur((c) => ({ ...c, strokes: c.strokes.slice(0, -1) }))}>↶ Undo brush</button><button className="btn ghost small" onClick={() => patchCur((c) => ({ ...c, strokes: [] }))}>Clear brushes</button></div>}
            </div>
          </div>
          <ErrorBox error={error} />
        </div>

        <div className="card g-panel">
          <Tabs value={panel} onChange={(v) => { setPanel(v); if (v !== 'retouch') setBrush(null); }} tabs={[['auto', 'Auto'], ['looks', 'Looks'], ['light', 'Light & Colour'], ['retouch', 'Retouch'], ['match', 'Match'], ['effects', 'Effects']]} />
          {!orig && <p className="sub" style={{ marginTop: 10 }}>Add a photo to start editing.</p>}
          {orig && panel === 'auto' && (<>
            <p className="sub" style={{ fontSize: 12 }}>Auto Enhance balances colour and exposure. Pick the edit you like:</p>
            <ChoiceGallery thumb={thumb} choices={autoList} active={active} onPick={(c) => { patchCur((p) => ({ ...p, params: { ...c.p, smooth: params.smooth, blemish: params.blemish, evenTone: params.evenTone } })); setActive(c.id); }} />
            <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => { set({ ...autoParams(stats), smooth: Math.max(params.smooth, 0.35), blemish: Math.max(params.blemish, 0.5), evenTone: Math.max(params.evenTone, 0.25), clarity: 0.08 }); }}>✨ Auto portrait (enhance + gentle retouch)</button>
          </>)}
          {orig && panel === 'looks' && <ChoiceGallery thumb={thumb} choices={looks} active={active} onPick={(c) => { patchCur((p) => ({ ...p, params: { ...c.p, mix: params.mix } })); setActive(c.id); }} />}
          {orig && panel === 'light' && (<>
            <h4 className="g-h">Light</h4><SliderGroup group="light" params={params} set={set} />
            <h4 className="g-h">Colour</h4><SliderGroup group="color" params={params} set={set} />
            <h4 className="g-h">Split-toning</h4><SliderGroup group="split" params={params} set={set} />
          </>)}
          {orig && panel === 'retouch' && (<>
            <h4 className="g-h">Skin (automatic — skin areas only)</h4>
            <SliderGroup group="retouch" params={params} set={set} />
            <h4 className="g-h">Brushes</h4>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {BRUSHES.map(([id, label, hint]) => <button key={id} title={hint} className={'chip mini' + (brush === id ? ' on' : '')} onClick={() => setBrush(brush === id ? null : id)}>{label}</button>)}
            </div>
            {brush && (<>
              <p className="sub" style={{ fontSize: 11 }}>{BRUSHES.find((b) => b[0] === brush)[2]} on the photo.</p>
              <Slider label="Brush size" value={size} min={0.005} max={0.12} step={0.001} onChange={setSize} fmt={(v) => Math.round(v * 1000) / 10 + '%'} />
              <Slider label="Brush strength" value={strength} min={0.1} max={1} onChange={setStrength} fmt={(v) => Math.round(v * 100) + '%'} />
            </>)}
          </>)}
          {orig && panel === 'match' && (<>
            <p className="sub" style={{ fontSize: 12 }}>Copy the colours of any photo you love onto this one.</p>
            <button className="btn small" onClick={pickRef}>{ref ? 'Change reference' : 'Pick reference photo'}</button>
            {params.match && <Slider label="Match strength" value={(params.match.amount ?? 100) / 100} min={0} max={1} onChange={(v) => set({ match: { ...params.match, amount: Math.round(v * 100) } })} fmt={(v) => Math.round(v * 100) + '%'} />}
          </>)}
          {orig && panel === 'effects' && (<><h4 className="g-h">Detail</h4><SliderGroup group="finish" params={params} set={set} /><h4 className="g-h">Effects</h4><FxStack value={params.fx} onChange={(v) => set({ fx: v })} video={false} /></>)}
          {orig && <div className="row" style={{ marginTop: 12 }}><button className="btn ghost small" onClick={() => { patchCur((p) => ({ ...p, params: { ...DEFAULTS, ...RET }, strokes: [] })); setActive('none'); }}>↺ Reset photo</button></div>}
        </div>
      </div>
    </div>
  );
}
