import ToolArt from '../lib/ToolArt.jsx';
import React, { useMemo, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError, runKeys } from '../lib/job.jsx';
import { useAllModels, modelLabel, ModelStatus, useModelGate, useReadiness } from '../lib/models.jsx';
import { MentionBar, resolveMentions, insertMention } from '../lib/mentions.jsx';
import AssetActions, { lastFrame } from '../lib/AssetActions.jsx';
import GenSettings, { DEFAULT_GEN, genParams } from '../lib/GenSettings.jsx';
import catalog from '../../data/modelCatalog.json';
import presets from '../../data/cameraPresets.json';
import stylesData from '../../data/stylePresets.json';
import cine from '../../data/filmStudio.json';
import colorTheory from '../../data/colorTheory.json';
import { useStore, uid } from '../lib/store.jsx';
import Media from '../lib/Media.jsx';
import MicButton from '../lib/Voice.jsx';
import { OpenButtons } from '../lib/Viewer.jsx';
import GuideBook from './GuideBook.jsx';

// Film Studio: multi-shot projects with a full cinematography deck —
// 40 film styles · 70 cameras · 70 lenses · 12 grain/noise looks · 100 directors' styles · 30 film color palettes —
// plus per-shot camera move, character and LOCATION LOCK.
export default function FilmStudio() {
  const { db, update } = useStore();
  const projects = db.projects || [];
  const [openId, setOpenId] = useState(null);
  const [title, setTitle] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const open = projects.find((p) => p.id === openId);

  function createProject() {
    if (!title.trim()) return;
    const proj = { id: uid(), title: title.trim(), filmStyle: '', director: '', palette: '', grain: '', shots: [], at: new Date().toISOString() };
    update((d) => { d.projects = [...(d.projects || []), proj]; return d; });
    setTitle(''); setOpenId(proj.id);
  }

  function createFromTemplate(tpl) {
    const proj = { id: uid(), title: tpl.title, filmStyle: tpl.filmStyle || '', director: tpl.director || '', palette: tpl.palette || '', grain: tpl.grain || '', shots: tpl.shots || [], at: new Date().toISOString() };
    update((d) => { d.projects = [...(d.projects || []), proj]; return d; });
    setOpenId(proj.id);
  }

  if (open) return <Project project={open} onBack={() => setOpenId(null)} />;

  const STATS = [
    { label: 'Film Styles', value: cine.filmStyles.length },
    { label: 'Cameras', value: cine.cameras.length },
    { label: 'Lenses', value: cine.lenses.length },
    { label: 'Directors', value: cine.directors.length },
    { label: 'Color Palettes', value: cine.palettes.length },
    { label: 'Grain Looks', value: cine.grain.length },
  ];

  const TEMPLATES = [
    { title: 'Noir Crime Thriller', filmStyle: cine.filmStyles[3]?.name, director: 'David Fincher', palette: cine.palettes[4]?.name, grain: cine.grain[2]?.name,
      shots: [{ id: uid(), prompt: "Close-up: detective's rain-wet face lit by a single neon sign", kind: 'image', camera: 'ARRI ALEXA Mini LF', lens: 'Leica Summilux-C 35mm', cameraId: '', charId: '', locId: '', file: null },
               { id: uid(), prompt: 'Wide shot: empty warehouse, shadows pooling on the floor', kind: 'image', camera: 'ARRI ALEXA Mini LF', lens: 'Cooke S4/i 21mm', cameraId: '', charId: '', locId: '', file: null },
               { id: uid(), prompt: 'Slow dolly reveal: briefcase open on a table in a dim hotel room', kind: 'video', camera: '', lens: '', cameraId: '', charId: '', locId: '', file: null }] },
    { title: 'Sci-Fi Epic', filmStyle: cine.filmStyles[7]?.name, director: 'Denis Villeneuve', palette: cine.palettes[8]?.name, grain: cine.grain[0]?.name,
      shots: [{ id: uid(), prompt: 'Vast alien desert landscape at golden hour, tiny human figure in foreground', kind: 'image', camera: 'IMAX 65mm', lens: 'Ultra Panavision 70 anamorphic', cameraId: '', charId: '', locId: '', file: null },
               { id: uid(), prompt: 'Interior: circular space station corridor, zero-gravity debris floating', kind: 'image', camera: 'Sony VENICE 2', lens: 'Zeiss Master Anamorphic 50mm', cameraId: '', charId: '', locId: '', file: null },
               { id: uid(), prompt: 'Massive ship descending from orbit in slow motion through clouds', kind: 'video', camera: '', lens: '', cameraId: '', charId: '', locId: '', file: null }] },
    { title: 'Fashion Editorial', filmStyle: cine.filmStyles[12]?.name, director: 'Wong Kar-wai', palette: cine.palettes[14]?.name, grain: cine.grain[5]?.name,
      shots: [{ id: uid(), prompt: 'Model in couture gown, blurred city lights behind, shallow focus', kind: 'image', camera: 'Hasselblad H6D-100c', lens: 'Leica Noctilux 50mm f/0.95', cameraId: '', charId: '', locId: '', file: null },
               { id: uid(), prompt: 'Extreme close-up: fabric texture and embroidery detail', kind: 'image', camera: 'Phase One IQ4 150MP', lens: 'Schneider APO-Digitar 180mm macro', cameraId: '', charId: '', locId: '', file: null }] },
    { title: 'Horror Short', filmStyle: cine.filmStyles[18]?.name, director: 'James Wan', palette: cine.palettes[2]?.name, grain: cine.grain[8]?.name,
      shots: [{ id: uid(), prompt: 'Point-of-view creeping down a dark hallway, flickering light at the end', kind: 'video', camera: '', lens: '', cameraId: '', charId: '', locId: '', file: null },
               { id: uid(), prompt: 'Face in a mirror, door slowly opening behind — no one is there', kind: 'image', camera: 'RED V-RAPTOR XL 8K', lens: 'Canon K35 28mm', cameraId: '', charId: '', locId: '', file: null }] },
    { title: 'Music Video', filmStyle: cine.filmStyles[22]?.name, director: 'Hiro Murai', palette: cine.palettes[19]?.name, grain: cine.grain[3]?.name,
      shots: [{ id: uid(), prompt: 'Artist performing on a glowing stage platform, fog machine haze', kind: 'video', camera: '', lens: '', cameraId: '', charId: '', locId: '', file: null },
               { id: uid(), prompt: 'Abstract: paint exploding in slow motion against black background', kind: 'video', camera: '', lens: '', cameraId: '', charId: '', locId: '', file: null },
               { id: uid(), prompt: 'Crowd shot: thousands of hands raised in unison at a concert', kind: 'image', camera: 'Sony FX9', lens: 'Canon CN-E 14mm Cine Prime', cameraId: '', charId: '', locId: '', file: null }] },
    { title: 'Documentary Portrait', filmStyle: cine.filmStyles[1]?.name, director: 'Errol Morris', palette: cine.palettes[0]?.name, grain: cine.grain[6]?.name,
      shots: [{ id: uid(), prompt: 'Subject sits in natural window light, slightly off-center, thoughtful gaze', kind: 'image', camera: 'ARRI AMIRA', lens: 'Cooke S4/i 85mm', cameraId: '', charId: '', locId: '', file: null },
               { id: uid(), prompt: 'Hands folded on a worn table — establishing intimacy detail shot', kind: 'image', camera: 'Canon EOS C70', lens: 'Canon EF 100mm macro', cameraId: '', charId: '', locId: '', file: null }] },
  ];

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>🎬 Pandora Film Studio</h1>
          <p className="sub" style={{ marginBottom: 0 }}>Direct like a DP — pro cinematography controls on every shot.</p>
        </div>
        <button className="btn ghost small" onClick={() => setShowGuide(true)} style={{ flexShrink: 0, marginTop: 4, fontSize: 12 }}>
          📖 Guide Book
        </button>
      </div>
      {showGuide && <GuideBook sectionId="film" onClose={() => setShowGuide(false)} />}

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 22 }}>
        {STATS.map(({ label, value }) => (
          <div key={label} className="card" style={{ padding: '10px 18px', textAlign: 'center', minWidth: 90 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: 'Orbitron, sans-serif' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* New project */}
      <div className="card" style={{ maxWidth: 560, marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>New project</h3>
        <div className="row">
          <input style={{ flex: 1 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Neon Alley — Episode 1" onKeyDown={(e) => e.key === 'Enter' && createProject()} />
          <button className="btn small" disabled={!title.trim()} onClick={createProject}>Create</button>
        </div>
      </div>

      {/* Quick-start templates */}
      <h3>Quick-start templates</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', marginBottom: 24 }}>
        {TEMPLATES.map((tpl, ti) => (
          <button key={tpl.title} className="card tool-card-lite" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => createFromTemplate(tpl)}>
            <ToolArt tool={{ id: tpl.title, name: tpl.title, desc: 'film storyboard video', kind: 'video', imageInputs: [] }} i={ti} page="film" />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{tpl.title}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{tpl.shots.length} shots pre-configured</div>
            {tpl.director && <div style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: .5 }}>Dir. style: {tpl.director}</div>}
            {tpl.filmStyle && <div style={{ fontSize: 10, color: 'var(--muted)' }}>Look: {tpl.filmStyle}</div>}
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--accent)', opacity: .7 }}>Click to open →</div>
          </button>
        ))}
      </div>

      <h3>Your projects ({projects.length})</h3>
      <div className="grid">
        {projects.map((p) => (
          <button key={p.id} className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpenId(p.id)}>
            <strong>{p.title}</strong>
            <p className="sub" style={{ margin: '6px 0 0' }}>{p.shots.length} shots{p.director ? ` · dir. style: ${p.director}` : ''}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function Sel({ label, value, onChange, options, none = 'None' }) {
  return (
    <div>
      <label>{label}</label>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{none}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Project({ project, onBack }) {
  const { db, update } = useStore();
  const patch = (fn) => update((d) => { d.projects = d.projects.map((p) => (p.id === project.id ? fn(structuredClone(p)) : p)); return d; });
  const set = (fields) => patch((p) => Object.assign(p, fields));
  const pal = cine.palettes.find((x) => x.name === project.palette);

  function addShot() {
    patch((p) => { p.shots.push({ id: uid(), prompt: '', cameraId: '', charId: '', locId: '', kind: 'image', camera: '', lens: '', file: null }); return p; });
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>🎬 {project.title}</h1>
        <div className="row">
          <button className="btn ghost small" onClick={onBack}>← Projects</button>
          <button className="btn danger small" onClick={() => { update((d) => { d.projects = d.projects.filter((p) => p.id !== project.id); return d; }); onBack(); }}>Delete</button>
        </div>
      </div>

      <div className="card" style={{ margin: '14px 0' }}>
        <h3 style={{ marginTop: 0 }}>Project look (applied to every shot)</h3>
        <div className="cinerow">
          <Sel label={`Film style (${cine.filmStyles.length})`} value={project.filmStyle} onChange={(v) => set({ filmStyle: v })} options={cine.filmStyles.map((f) => f.name)} />
          <Sel label={`Director's style (${cine.directors.length})`} value={project.director} onChange={(v) => set({ director: v })} options={cine.directors} />
          <Sel label={`Color palette (${cine.palettes.length})`} value={project.palette} onChange={(v) => set({ palette: v })} options={cine.palettes.map((p) => p.name)} />
          <Sel label={`Grain / noise (${cine.grain.length})`} value={project.grain} onChange={(v) => set({ grain: v })} options={cine.grain.map((g) => g.name)} />
          <Sel label={`Color scheme (${colorTheory.schemes.length})`} value={project.colorScheme} onChange={(v) => set({ colorScheme: v })} options={colorTheory.schemes.map((c) => c.name)} />
        </div>
        {pal && <div style={{ marginTop: 8 }}>{pal.colors.map((c) => <span key={c} className="swatch" style={{ background: c }} />)}<span className="sub" style={{ margin: 0 }}> {pal.prompt}</span></div>}
        <h3>🎬 Project video specs (applied to every shot)</h3>
        <GenSettings value={project.gen || { ...DEFAULT_GEN, aspectRatio: '21:9' }} onChange={(g) => set({ gen: g })} kind="video" source="cloud" />
        {project.colorScheme && <p className="sub" style={{ margin: '6px 0 0' }}>🎨 {colorTheory.schemes.find((c) => c.name === project.colorScheme)?.desc} e.g. {colorTheory.schemes.find((c) => c.name === project.colorScheme)?.examples}</p>}
      </div>

      {project.shots.map((shot, i) => (
        <ShotCard key={shot.id} index={i} shot={shot} prevShot={i > 0 ? project.shots[i - 1] : null} project={project} db={db} patch={patch} />
      ))}
      <button className="btn" onClick={addShot}>+ Add shot</button>
    </div>
  );
}

function ShotCard({ index, shot, prevShot, project, db, patch }) {
  const job = useJob();
  const busy = job.running;
  const [error, setError] = useState('');
  const allModels = useAllModels();
  const models = useMemo(() => allModels.filter((m) => m.kind === shot.kind), [allModels, shot.kind]);
  const model = models.find((m) => m.id === shot.modelId) || models[0];
  const rdy = useReadiness();
  const gate = useModelGate(model);
  const setShot = (fields) => patch((p) => { p.shots = p.shots.map((s) => (s.id === shot.id ? { ...s, ...fields } : s)); return p; });

  // Compose the full cinematography language for this shot.
  function cineStyle() {
    const parts = [];
    const fs = cine.filmStyles.find((f) => f.name === project.filmStyle);
    if (fs) parts.push(fs.prompt);
    if (project.director) parts.push(`in the directorial style of ${project.director}`);
    const pal = cine.palettes.find((x) => x.name === project.palette);
    if (pal) parts.push(`color palette: ${pal.prompt} (${pal.colors.join(', ')})`);
    const gr = cine.grain.find((g) => g.name === project.grain);
    if (gr) parts.push(gr.prompt);
    if (shot.camera) parts.push(`shot on ${shot.camera}`);
    if (shot.lens) parts.push(`${shot.lens} lens characteristics`);
    const scheme = colorTheory.schemes.find((c) => c.name === project.colorScheme);
    if (scheme) parts.push(scheme.prompt);
    // Transitional arc: each shot can carry its own emotional color from the psychology wheel.
    const mood = colorTheory.psychology.find((c) => shot.mood && shot.mood.startsWith(c.color));
    if (mood) parts.push(mood.prompt);
    return parts.length ? { name: 'Cinematography', promptText: parts.join('; ') } : null;
  }

  async function generate() {
    if (busy) return;
    if (!gate.ok) { setError(gate.reason); return; }
    setError('');
    await job.start(async (jobId) => {
    try {
      // Continuity (Popcorn-style): feed the previous shot's final frame in as a reference
      let chainRefs = [];
      if (shot.chain && prevShot?.file) {
        chainRefs = prevShot.kind === 'video'
          ? [await window.api.saveDataUrl(await lastFrame(prevShot.file), 'shot-' + index + '-start')]
          : [prevShot.file];
      }
      const res = await window.api.generate({
        jobId, provider: model.provider, model, kind: shot.kind, prompt: shot.prompt,
        mentions: resolveMentions(shot.prompt, db), toolRefs: chainRefs,
        params: genParams(project.gen || { ...DEFAULT_GEN, aspectRatio: '21:9' }, shot.kind),
        cameraPreset: presets.presets.find((p) => p.id === shot.cameraId) || null,
        character: db.characters.find((c) => c.id === shot.charId) || null,
        location: db.locations.find((l) => l.id === shot.locId) || null,
        style: cineStyle()
      });
      setShot({ file: res.file });
    } catch (e) { const m = friendlyError(e); if (m) setError(m); }
    });
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>Shot {index + 1}</strong>
        <div className="row">
          {['image', 'video'].map((k) => (
            <button key={k} className={'chip' + (shot.kind === k ? ' on' : '')} onClick={() => setShot({ kind: k, modelId: '' })}>{k}</button>
          ))}
          <button className="btn danger small" onClick={() => patch((p) => { p.shots = p.shots.filter((s) => s.id !== shot.id); return p; })}>✕</button>
        </div>
      </div>
      <label>Action / description</label>
      <textarea value={shot.prompt} onChange={(e) => setShot({ prompt: e.target.value })} placeholder="What happens in this shot… @Name pulls in saved characters, locations, products" />
      <div className="row" style={{ gap: 6 }}><MicButton promptMode small onText={(t) => setShot({ prompt: shot.prompt ? shot.prompt + ' ' + t : t })} /></div>
      <MentionBar db={db} value={shot.prompt} onInsert={(t) => setShot({ prompt: insertMention(shot.prompt, t) })} />
      {index > 0 && (
        <label className="row" style={{ gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={!!shot.chain} onChange={(e) => setShot({ chain: e.target.checked })} />
          <span>🔗 Continue from shot {index}'s last frame (keeps character, lighting and set consistent — needs a model that accepts refs)</span>
        </label>
      )}
      <div className="cinerow" style={{ marginTop: 4 }}>
        <div>
          <label>Model</label>
          <select value={model?.id || ''} onChange={(e) => setShot({ modelId: e.target.value })}>
            <option value="">— Select model —</option>
            {models.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, rdy)}</option>)}
          </select>
          <ModelStatus model={model} compact />
        </div>
        <div>
          <label>Camera move</label>
          <select value={shot.cameraId} onChange={(e) => setShot({ cameraId: e.target.value })}>
            <option value="">None</option>
            {presets.presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <Sel label={`Camera body (${cine.cameras.length})`} value={shot.camera} onChange={(v) => setShot({ camera: v })} options={cine.cameras} />
        <Sel label={`Lens (${cine.lenses.length})`} value={shot.lens} onChange={(v) => setShot({ lens: v })} options={cine.lenses} />
        <div>
          <label>Character</label>
          <select value={shot.charId} onChange={(e) => setShot({ charId: e.target.value })}>
            <option value="">None</option>
            {db.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <Sel label="Shot mood color (psychology)" value={shot.mood} onChange={(v) => setShot({ mood: v })} options={colorTheory.psychology.map((c) => c.color + ' — ' + c.emotions.slice(0, 3).join('/'))} />
        <div>
          <label>⌖ Location Lock</label>
          <select value={shot.locId} onChange={(e) => setShot({ locId: e.target.value })}>
            <option value="">None</option>
            {db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <RunButton small job={job} label={shot.file ? '↻ Regenerate' : '✦ Generate shot'} onRun={generate} disabled={!shot.prompt.trim() || !model || !gate.ok} />
        {model && !gate.ok && !busy && <span className="sub" style={{ fontSize: 11 }}>🔒 {gate.reason}</span>}
        {shot.file && <OpenButtons file={shot.file} />}
        {shot.file && <button className="btn ghost small" onClick={() => window.api.resolveSend([shot.file])}>Send to Resolve</button>}
      </div>
      <ErrorBox error={error} />
      {shot.file && <div className="result-box"><Media file={shot.file} kind={shot.kind} controls /><div style={{ marginTop: 8 }}><AssetActions file={shot.file} kind={shot.kind} prompt={shot.prompt} compact /></div></div>}
    </div>
  );
}
