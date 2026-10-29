import React, { useEffect, useMemo, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError, runKeys } from '../lib/job.jsx';
import { useStore, uid } from '../lib/store.jsx';
import { allEntities } from '../lib/mentions.jsx';
import { useAllModels, modelLabel, ModelStatus, useModelGate, useReadiness, useDownloaded } from '../lib/models.jsx';

const WAN_REPO = 'Wan-AI/Wan2.2-Animate-2-14B-Distilled-Diffusers';
import { videoInfo, frameAt } from '../lib/videoFrames.js';
import Media from '../lib/Media.jsx';
import AssetActions from '../lib/AssetActions.jsx';
import { takeIntent } from '../lib/nav.jsx';
import HardwareHint from '../lib/HardwareHint.jsx';

// Shapeshift — transform an existing video: put your character into its motion, swap a person/object, or restyle it.
const MODES = [
  ['motion', '🕺 Motion transfer', 'Your character performs the exact motion, timing and camera of the source video.'],
  ['swap', '🔁 Object swap', 'Replace a person (or object) in the video with your reference while keeping the scene and lighting.'],
  ['restyle', '🎨 Restyle', 'Redraw the whole video in a new visual style, keeping motion and composition.'],
  ['blocking', '🎥 Blocking → Film', 'Turn a grey 3D blocking render (Blender, phone-camera move) into the finished photoreal shot — same camera move and layout.'],
];
const OPEN_STYLES = ['Cel-shaded anime', 'Studio Ghibli watercolor', 'Pixar-style 3D', 'Claymation', 'LEGO bricks', 'Comic-book ink', 'Oil painting', 'Pencil sketch',
  'Cyberpunk neon', 'Vintage 16mm film', 'Low-poly 3D', 'Paper cut-out', 'Pixel art', 'Ukiyo-e woodblock', 'Chrome sculpture', 'Stained glass', 'Felt puppet', 'Noir black-and-white', 'Vaporwave', 'Marble statue'];

export default function Shapeshift() {
  const { db, update } = useStore();
  const allModels = useAllModels();
  const dl = useDownloaded();
  const rdy = useReadiness();
  const [mode, setMode] = useState('motion');
  const [provider, setProvider] = useState('fal');
  const [video, setVideo] = useState(null);
  const [info, setInfo] = useState(null);
  const [refs, setRefs] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [resolution, setResolution] = useState('720p');
  const [presets, setPresets] = useState([]);
  const [presetId, setPresetId] = useState('');
  const [styleText, setStyleText] = useState(OPEN_STYLES[0]);
  const [editId, setEditId] = useState('');
  const isRestyle = mode === 'restyle' || mode === 'blocking';
  const job = useJob();
  const busy = job.running;
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const editModels = useMemo(() => allModels.filter((m) => m.kind === 'image' && m.refInput && (provider === 'local' ? m.provider === 'local' : m.provider !== 'local')), [allModels, provider]);
  const editModel = editModels.find((m) => m.id === editId) || editModels[0];
  const ents = allEntities(db).filter((e) => e.type !== 'location' && (e.refs || []).length);
  const libVideos = db.generations.filter((g) => g.kind === 'video').slice(0, 12);

  useEffect(() => {
    const it = takeIntent('genjutsu');
    if (it?.refs?.length) setRefs(it.refs.slice(0, 1));
    if (it?.mode) setMode(it.mode);
    if (it?.video) chooseVideo(it.video);
  }, []);
  useEffect(() => {
    const off = window.api.jutsu?.onProgress?.((p) => { if (p.tool === 'genjutsu') setStatus(p.stage + (p.status ? ' · ' + String(p.status).toLowerCase() : '')); });
    return typeof off === 'function' ? off : undefined;
  }, []);
  useEffect(() => {
    if (!isRestyle || provider !== 'higgsfield' || presets.length) return;
    window.api.jutsu.presets().then((p) => { setPresets(p); if (p[0]) setPresetId(p[0].id); }).catch((e) => setError(String(e.message || e)));
  }, [mode, provider]);

  const chooseVideo = async (file) => {
    if (!file) return;
    setVideo(file); setInfo(null); setError('');
    try {
      const i = await videoInfo(file);
      setInfo(i);
      if (i.duration < 4) setError('The source video must be at least 4 seconds.');
    } catch (e) { setError(String(e.message || e)); }
  };

  const maxRefs = isRestyle ? (provider === 'local' ? 3 : 5) : provider === 'fal' ? 1 : provider === 'local' ? (mode === 'motion' ? 1 : 3) : 8;
  const addRefs = (files) => setRefs((r) => [...new Set([...r, ...files])].slice(0, maxRefs));

  async function run() {
    if (busy) return;
    setError(''); setResult(null); setStatus('starting…');
    await job.start(async (jobId) => {
    try {
      let sendRefs = refs;
      if ((isRestyle && provider === 'fal') || (provider === 'local' && mode !== 'motion')) {
        const first = await window.api.saveDataUrl(await frameAt(video, 0.1), 'genjutsu-first-frame');
        sendRefs = [first, ...refs];
      }
      const res = await window.api.jutsu.genjutsu({
        jobId, mode, provider, video, refs: sendRefs, prompt, resolution,
        presetId, styleText, editModel: mode === 'motion' && provider === 'local' ? null : editModel,
      });
      setResult(res.file);
      const label = MODES.find((m) => m[0] === mode)[1];
      update((d) => { d.generations.unshift({ id: uid(), file: res.file, kind: 'video', prompt: `[Shapeshift ${label}] ${isRestyle ? (provider === 'fal' ? styleText : (presets.find((p) => p.id === presetId)?.name || '')) : ''} ${prompt}`.trim(), model: provider === 'fal' ? 'Wan 2.2 Animate (FAL)' : provider === 'local' ? 'Wan-Animate-2 (local GPU)' : 'Higgsfield (cloud)', at: new Date().toISOString() }); return d; });
    } catch (e) { const m = friendlyError(e); if (m) setError(m); }
    });
    setStatus('');
  }

  // The engine itself is a "model" too: cloud engines need their key, the local one needs Wan-Animate downloaded.
  const engineModel = provider === 'local'
    ? { name: 'Wan-Animate-2 14B', provider: 'local', endpoint: WAN_REPO, downloaded: dl.some((d) => d.repo === WAN_REPO && d.complete !== false), partial: dl.some((d) => d.repo === WAN_REPO && d.complete === false) }
    : { name: provider === 'fal' ? 'Wan 2.2 Animate (FAL)' : 'Higgsfield', provider };
  const gate = useModelGate(engineModel, mode === 'motion' && provider === 'local' ? null : (provider === 'higgsfield' && isRestyle ? null : editModel));
  const ready = gate.ok && video && info && info.duration >= 4 && (
    provider === 'local'
      ? (mode === 'motion' ? refs.length > 0 : !!editModel && (isRestyle ? !!styleText : refs.length > 0))
      : isRestyle ? (provider === 'higgsfield' ? !!presetId : !!styleText && !!editModel) : refs.length > 0);

  return (
    <div>
      <h1>🌀 Pandora Shapeshift</h1>
      <p className="sub">Transform any video. Runs on your own GPU (Wan-Animate-2), on open-source Wan 2.2 Animate through FAL, or on Higgsfield with a Higgsfield key.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        {MODES.map(([id, label]) => <button key={id} className={'chip' + (mode === id ? ' on' : '')} onClick={() => { setMode(id); setRefs((r) => r.slice(0, (id === 'restyle' || id === 'blocking') ? 5 : provider === 'fal' ? 1 : 8)); }}>{label}</button>)}
      </div>
      <p className="sub" style={{ fontSize: 12 }}>{MODES.find((m) => m[0] === mode)[2]}</p>

      <div className="two-col">
        <div className="card">
          <label>Engine</label>
          <div className="row">
            <button className={'chip' + (provider === 'local' ? ' on' : '')} onClick={() => { setProvider('local'); setResolution('720p'); setRefs((r) => r.slice(0, mode === 'motion' ? 1 : 3)); }}>💻 Local GPU · Wan-Animate-2 (offline)</button>
            <button className={'chip' + (provider === 'fal' ? ' on' : '')} onClick={() => { setProvider('fal'); setRefs((r) => r.slice(0, isRestyle ? 5 : 1)); }}>Open · Wan 2.2 Animate (FAL key)</button>
            <button className={'chip' + (provider === 'higgsfield' ? ' on' : '')} onClick={() => setProvider('higgsfield')}>☁ Higgsfield (Higgsfield key)</button>
          </div>
          <ModelStatus model={engineModel} />

          {provider === 'local' && (
            <>
              <HardwareHint needGb={24} label="local Shapeshift (Wan-Animate-2 14B)" />
              <p className="sub" style={{ fontSize: 11, margin: 0 }}>
                Fully offline. Also needs 64 GB+ system RAM; the first run downloads the model (pre-download “Wan-Animate-2 14B Distilled” on the Models page).
                {mode !== 'motion' && ' Swap and Restyle first edit frame one with a local image model, then animate it with the video\'s motion.'}
              </p>
            </>
          )}
          <label>Source video (4–30 s)</label>
          <div className="row">
            <button className="btn ghost small" onClick={async () => chooseVideo(await window.api.pickVideo())}>+ From computer</button>
            {libVideos.length > 0 && (
              <select style={{ flex: 1 }} value="" onChange={(e) => chooseVideo(e.target.value)}>
                <option value="">…or pick from Library</option>
                {libVideos.map((g) => <option key={g.id} value={g.file}>{(g.prompt || 'video').slice(0, 50)}</option>)}
              </select>
            )}
          </div>
          {video && <div className="result-box" style={{ marginTop: 8 }}><Media file={video} kind="video" controls /></div>}
          {info && <p className="sub" style={{ fontSize: 11 }}>{info.width}×{info.height} · {info.duration.toFixed(1)} s{info.duration > 30 ? ' · only the first 30 s are used' : ''}</p>}

          {isRestyle && provider === 'higgsfield' && (
            <>
              <label>Style</label>
              <div className="preset-grid">
                {presets.map((p) => (
                  <button key={p.id} className={'preset' + (presetId === p.id ? ' on' : '')} onClick={() => setPresetId(p.id)} title={p.name}>
                    {p.preview_url && <img src={p.preview_url} alt="" />}<span>{p.name}</span>
                  </button>
                ))}
                {presets.length === 0 && <span className="sub">Loading styles… (needs a Higgsfield key)</span>}
              </div>
            </>
          )}
          {mode === 'swap' && provider === 'local' && (
            <>
              <label>Local image-edit model (puts your reference into frame one)</label>
              <select value={editModel?.id || ''} onChange={(e) => setEditId(e.target.value)}>
                {editModels.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, rdy)}</option>)}
              </select>
              <ModelStatus model={editModel} compact />
              <p className="sub" style={{ fontSize: 11 }}>Best: FLUX.2 [klein] or Qwen-Image (multi-reference editing).</p>
            </>
          )}
          {isRestyle && provider !== 'higgsfield' && (
            <>
              {mode === 'blocking' ? <p className="sub" style={{ margin: '4px 0' }}>Render your Blender viewport (View → Viewport Render Animation, 4–10 s), drop it above, add a look reference image and describe the real scene in the prompt. Tip: plan the camera move with the Phone Camera tab.</p> : <>
              <label>Style</label>
              <div className="row">{OPEN_STYLES.map((s) => <button key={s} className={'chip mini' + (styleText === s ? ' on' : '')} onClick={() => setStyleText(s)}>{s}</button>)}</div>
              <input style={{ marginTop: 6 }} value={styleText} onChange={(e) => setStyleText(e.target.value)} placeholder="or describe your own style" />
              </>}
              <label>Image-edit model (restyles the first frame)</label>
              <select value={editModel?.id || ''} onChange={(e) => setEditId(e.target.value)}>
                {editModels.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, rdy)}</option>)}
              </select>
              <ModelStatus model={editModel} compact />
            </>
          )}

          <label>Prompt (optional)</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. keep the character's red scarf visible; replace the man on the left" />

          <label>Resolution</label>
          <div className="row">
            {(provider === 'fal' ? ['480p', '580p', '720p'] : provider === 'local' ? ['480p', '720p', '1080p'] : ['480p', '720p', '1080p']).map((r) => <button key={r} className={'chip' + (resolution === r ? ' on' : '')} onClick={() => setResolution(r)}>{r}</button>)}
          </div>

          <div style={{ marginTop: 14 }}>
            <RunButton job={job} label="🌀 Shapeshift it" busyLabel={'Working… ' + status} onRun={run} disabled={!ready} />
            {!gate.ok && !busy && <span className="sub" style={{ fontSize: 11, marginLeft: 8 }}>🔒 {gate.reason}</span>}
          </div>
          <ErrorBox error={error} />
          {result && (
            <div className="result-box">
              <Media file={result} kind="video" controls />
              <div style={{ marginTop: 8 }}><AssetActions file={result} kind="video" prompt={prompt} /></div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>{isRestyle ? 'Character references (optional, up to 5)' : provider === 'fal' ? 'Character / object (1 image)' : 'References (1–8 images)'}</h3>
          <p className="sub" style={{ fontSize: 11 }}>Pick a saved character, influencer or product — or add photos.</p>
          <div className="row">
            {ents.map((e) => <button key={e.type + e.id} className="chip mini" onClick={() => addRefs(e.refs.slice(0, maxRefs))}>{e.icon} {e.name}</button>)}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn ghost small" onClick={async () => addRefs(await window.api.pickImages())}>+ From computer</button>
            {refs.length > 0 && <button className="btn ghost small" onClick={() => setRefs([])}>Clear</button>}
            <span className="sub">{refs.length}/{maxRefs}</span>
          </div>
          <div className="ref-thumbs">{refs.map((f) => <RefImg key={f} file={f} onRemove={() => setRefs((r) => r.filter((x) => x !== f))} />)}</div>
          <p className="sub" style={{ fontSize: 11, marginTop: 12 }}>
            Tips: a clear, front-facing, full-body reference works best for motion transfer. Higgsfield Object swap needs a source of at least 640×640-equivalent pixels.
            Open-engine Restyle first redraws frame one in your style, then animates it with the source motion.
          </p>
        </div>
      </div>
    </div>
  );
}

function RefImg({ file, onRemove }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { let ok = true; window.api.dataUrl(file).then((d) => ok && setSrc(d)).catch(() => {}); return () => { ok = false; }; }, [file]);
  return <div className="ref-thumb">{src ? <img src={src} alt="" /> : <div className="thumb" />}<button onClick={onRemove}>×</button></div>;
}
