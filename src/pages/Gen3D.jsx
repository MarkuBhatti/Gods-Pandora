import React, { useEffect, useMemo, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError } from '../lib/job.jsx';
import { useStore, uid } from '../lib/store.jsx';
import { useAllModels, modelLabel } from '../lib/models.jsx';
import Media from '../lib/Media.jsx';
import GlbViewer from '../lib/GlbViewer.jsx';
import { OpenButtons } from '../lib/Viewer.jsx';

// Generate 3D: text or image → GLB, free on your GPU (Hunyuan3D-2 mini, Shap-E) or in the cloud (FAL Hunyuan3D v2, TRELLIS).
export const ENGINES = [
  { id: 'hunyuan3d-2mini', provider: 'local', label: 'Hunyuan3D-2 mini', note: 'free · your GPU · best quality · ~6 GB VRAM · ~5 GB first download', image: true },
  { id: 'shap-e', provider: 'local', label: 'Shap-E', note: 'free · your GPU · light & fast · any GPU · ~1 GB', image: false },
  { id: 'hunyuan3d-v2', provider: 'fal', label: 'Hunyuan3D v2 (cloud)', note: 'FAL key · textured mesh', image: true },
  { id: 'trellis', provider: 'fal', label: 'TRELLIS (cloud)', note: 'FAL key · textured mesh', image: true },
];
const isReady = (id) => { try { return localStorage.getItem('pandora.3dready.' + id) === '1'; } catch { return false; } };

export default function Gen3D({ pick }) {
  const { db, update } = useStore();
  const all = useAllModels(); const job = useJob();
  const [eng, setEng] = useState('hunyuan3d-2mini'); const [mode, setMode] = useState('text');
  const [prompt, setPrompt] = useState(''); const [image, setImage] = useState(null); const [imgModelId, setImgModelId] = useState('');
  const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [result, setResult] = useState(null); const [ready, setReady] = useState({});
  const E = ENGINES.find((e) => e.id === eng);
  useEffect(() => { if (pick && pick.id) { setEng(pick.id); if (pick.prepare) prepare(pick.id); document.getElementById('gen3d')?.scrollIntoView({ behavior: 'smooth' }); } }, [pick]);
  useEffect(() => { const off = window.api.gen3d?.onProgress?.((p) => setStatus(p.stage + (p.status ? ' · ' + String(p.status).toLowerCase() : ''))); return typeof off === 'function' ? off : undefined; }, []);
  const imgModels = useMemo(() => all.filter((m) => m.kind === 'image' && (E.provider === 'local' ? m.provider === 'local' : m.provider !== 'local')), [all, E.provider]);
  const imgModel = imgModels.find((m) => m.id === imgModelId) || imgModels[0];
  const needsImgModel = mode === 'text' && E.image;
  const libImages = db.generations.filter((g) => g.kind === 'image').slice(0, 10);
  const models3d = db.generations.filter((g) => g.kind === '3d').slice(0, 8);

  async function prepare(id) {
    setError(''); setStatus('starting…');
    await job.start(async (jobId) => { try { await window.api.gen3d.run({ jobId, provider: 'local', model: id, prepareOnly: true }); try { localStorage.setItem('pandora.3dready.' + id, '1'); } catch { /* */ } setReady((r) => ({ ...r, [id]: true })); setStatus('✓ Ready — generate below'); } catch (e) { const m = friendlyError(e); if (m) setError(m); } });
  }
  async function run() {
    setError(''); setResult(null); setStatus('starting…');
    await job.start(async (jobId) => {
      try {
        const res = await window.api.gen3d.run({ jobId, provider: E.provider, model: E.provider === 'fal' ? (eng === 'trellis' ? 'trellis' : 'hunyuan3d-v2') : eng, prompt, image: mode === 'image' ? image : null, imageModel: needsImgModel ? imgModel : null });
        setResult(res); if (E.provider === 'local') { try { localStorage.setItem('pandora.3dready.' + eng, '1'); } catch { /* */ } }
        update((d) => { d.generations.unshift({ id: uid(), file: res.file, kind: '3d', prompt: prompt || '[image → 3D]', model: E.label, at: new Date().toISOString(), ref: res.image || null }); return d; });
      } catch (e) { const m = friendlyError(e); if (m) setError(m); }
    });
    setStatus('');
  }
  const can = (mode === 'text' ? prompt.trim() && (!needsImgModel || imgModel) : !!image);
  return (
    <div className="card" id="gen3d" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>✦ Generate 3D</h3>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {ENGINES.map((e) => <button key={e.id} className={'chip' + (eng === e.id ? ' on' : '')} title={e.note} onClick={() => { setEng(e.id); if (!e.image) setMode((m) => m); }}>{e.provider === 'local' ? '💻 ' : '☁ '}{e.label}</button>)}
      </div>
      <p className="sub" style={{ fontSize: 12, margin: '6px 0' }}>{E.note}{E.provider === 'local' && !(ready[eng] || isReady(eng)) && <> · <button className="btn ghost small" disabled={job.running} onClick={() => prepare(eng)}>⬇ Download &amp; set up now</button> (or just generate — it downloads on first run)</>}</p>
      <div className="row" style={{ gap: 6, margin: '8px 0' }}>
        <button className={'chip' + (mode === 'text' ? ' on' : '')} onClick={() => setMode('text')}>✎ Text → 3D</button>
        <button className={'chip' + (mode === 'image' ? ' on' : '')} onClick={() => setMode('image')}>🖼 Image → 3D</button>
      </div>
      {mode === 'text' && <textarea rows={2} placeholder="e.g. a weathered bronze astronaut helmet with scratches" value={prompt} onChange={(e) => setPrompt(e.target.value)} />}
      {mode === 'text' && needsImgModel && (<>
        <label>Picture model (makes a clean reference image first, then {E.label} builds the mesh)</label>
        {imgModels.length ? <select value={imgModel?.id || ''} onChange={(e) => setImgModelId(e.target.value)}>{imgModels.map((m) => <option key={m.id} value={m.id}>{modelLabel ? modelLabel(m) : m.name}</option>)}</select>
          : <p className="sub" style={{ fontSize: 12 }}>{E.provider === 'local' ? 'No local image model downloaded yet — get FLUX.2 klein or SDXL in Library → Models, or use Shap-E (text works directly).' : 'Add a cloud image model key (FAL) in Settings.'}</p>}
      </>)}
      {mode === 'image' && (<>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn small" onClick={async () => { const f = await window.api.pickImages(); if (f && f[0]) setImage(f[0]); }}>Choose image…</button>
          {libImages.map((g) => <div key={g.id} onClick={() => setImage(g.file)} style={{ width: 54, height: 54, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', outline: image === g.file ? '2px solid var(--gold)' : 'none' }}><Media file={g.file} kind="image" /></div>)}
        </div>
        {image && <div style={{ width: 160, marginTop: 8 }}><Media file={image} kind="image" /></div>}
        <p className="sub" style={{ fontSize: 11 }}>Best results: one object, whole and centred, plain background.</p>
      </>)}
      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <RunButton job={job} label="✦ Generate 3D model" busyLabel={'Working… ' + status} onRun={run} disabled={!can} />
        {!job.running && status && <span className="sub" style={{ fontSize: 12 }}>{status}</span>}
      </div>
      <ErrorBox error={error} />
      {result && (<div style={{ marginTop: 12 }}>
        <GlbViewer file={result.file} height={420} />
        <div className="row" style={{ gap: 6, marginTop: 6 }}><OpenButtons file={result.file} open={false} /><span className="sub" style={{ fontSize: 11 }}>GLB · opens in Blender, Unity, Unreal, Windows 3D Viewer</span></div>
      </div>)}
      {!result && models3d.length > 0 && (<>
        <h4 style={{ margin: '14px 0 6px' }}>Your 3D models</h4>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{models3d.map((g) => <button key={g.id} className="chip" onClick={() => setResult({ file: g.file })}>{(g.prompt || 'model').slice(0, 28)}</button>)}</div>
      </>)}
    </div>
  );
}
