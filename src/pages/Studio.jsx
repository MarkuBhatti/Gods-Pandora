import ToolArt from '../lib/ToolArt.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError, runKeys } from '../lib/job.jsx';
import { PromptTools, DropZone } from '../lib/qol.jsx';
import { useAllModels, modelLabel, ModelStatus, useModelGate, useReadiness } from '../lib/models.jsx';
import { MentionBar, resolveMentions, insertMention } from '../lib/mentions.jsx';
import AssetActions from '../lib/AssetActions.jsx';
import GenSettings, { DEFAULT_GEN, genParams } from '../lib/GenSettings.jsx';
import studios from '../../data/studios.json';
import catalog from '../../data/modelCatalog.json';
import styles from '../../data/stylePresets.json';
import fashion from '../../data/fashionStudio.json';
import cine from '../../data/filmStudio.json';
import directory from '../../data/modelDirectory.json';
import colorTheory from '../../data/colorTheory.json';
import { useStore, uid } from '../lib/store.jsx';
import Media from '../lib/Media.jsx';
import GuideBook from './GuideBook.jsx';

// Per-section contextual reference slots
const SECTION_REFS = {
  fashion: [
    { id: 'clothing', label: '👗 Clothing / Outfit',  hint: 'Garments, fabrics, style' },
    { id: 'shoes',    label: '👠 Shoes & Footwear',   hint: 'Heels, boots, sneakers, sandals' },
    { id: 'hair',     label: '💇 Hair & Makeup',       hint: 'Hairstyle, color, makeup look' },
    { id: 'look',     label: '✨ Overall Inspiration', hint: 'Full look, editorial, mood board' },
  ],
  product: [
    { id: 'product',   label: '📦 Product Photo',     hint: 'The actual product to feature' },
    { id: 'lifestyle', label: '🌿 Lifestyle Context',  hint: 'Product in use or in setting' },
    { id: 'bg',        label: '🎨 Background / Scene', hint: 'Environment or backdrop' },
  ],
  marketing: [
    { id: 'brand',  label: '🏷 Brand Visual',         hint: 'Logo, colors, existing assets' },
    { id: 'inspo',  label: '🔍 Inspiration / Comps',  hint: 'Reference ads or campaigns' },
    { id: 'mood',   label: '🌟 Mood Board',            hint: 'Feeling, aesthetic, vibe' },
  ],
  influencer: [
    { id: 'outfit',  label: '👔 Outfit Reference',    hint: 'Clothing, accessories, style' },
    { id: 'pose',    label: '🧍 Pose / Expression',   hint: 'Body language, face, energy' },
    { id: 'setting', label: '📍 Setting / BG',         hint: 'Location, background, environment' },
  ],
  shorts: [
    { id: 'style', label: '🎥 Visual Style Ref',      hint: 'Aesthetic, editing style' },
    { id: 'hook',  label: '🪝 Hook / Opening Frame',   hint: 'First-frame or thumbnail inspo' },
    { id: 'color', label: '🎨 Color Reference',        hint: 'Palette, grade, tone' },
  ],
  explainer: [
    { id: 'artstyle',  label: '🎨 Art / Animation Style', hint: 'Illustration or motion reference' },
    { id: 'character', label: '🧑 Character Design',       hint: 'Presenter or mascot look' },
    { id: 'slide',     label: '📊 Slide Style',            hint: 'Layout, typography reference' },
  ],
  appbuild: [
    { id: 'ui',    label: '📱 UI Screenshot',          hint: 'App design or layout reference' },
    { id: 'brand', label: '🎨 Brand / Color Scheme',   hint: 'Colors, logo, fonts' },
    { id: 'ux',    label: '🗂 UX Flow Reference',      hint: 'Navigation or interaction pattern' },
  ],
  designdocs: [
    { id: 'design', label: '📐 Design Reference',     hint: 'Wireframe, mockup, inspo' },
    { id: 'brand',  label: '🎨 Brand Assets',          hint: 'Style guide, colors, typography' },
  ],
  digiproduct: [
    { id: 'product', label: '💎 Product Visual',       hint: 'Screenshots, artwork, cover' },
    { id: 'mockup',  label: '🖥 Mockup / Context',     hint: 'Device frame, usage scene' },
    { id: 'brand',   label: '🏷 Brand Reference',      hint: 'Colors, logo, style' },
  ],
  voice: [],
  canvas: [],
};

// Thumbnail strip for uploaded reference images
function RefThumbs({ files, onRemove }) {
  if (!files || files.length === 0) return null;
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {files.map((f, i) => (
        <div key={i} style={{ position: 'relative' }}>
          <img
            src={'media://' + f}
            alt=""
            style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(139,107,255,.25)' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <button
            onClick={() => onRemove(i)}
            style={{
              position: 'absolute', top: -5, right: -5,
              width: 16, height: 16, borderRadius: '50%',
              background: '#ff4455', border: 'none', color: '#fff',
              fontSize: 9, cursor: 'pointer', lineHeight: '16px', textAlign: 'center', padding: 0
            }}
          >x</button>
        </div>
      ))}
    </div>
  );
}

// Section-specific reference panel
function RefPanel({ studioId, secRefs, onChange }) {
  const slots = SECTION_REFS[studioId] || [
    { id: 'ref1', label: '📎 Visual Reference 1', hint: 'Style, mood, or composition reference' },
    { id: 'ref2', label: '📎 Visual Reference 2', hint: 'Additional reference image' },
  ];
  if (slots.length === 0) return null;

  async function pick(slotId) {
    try {
      const files = await window.api.pickImages();
      if (files.length) {
        onChange((prev) => ({ ...prev, [slotId]: [...(prev[slotId] || []), ...files] }));
      }
    } catch (err) { console.error('pickImages failed:', err); }
  }

  function remove(slotId, idx) {
    onChange((prev) => {
      const updated = [...(prev[slotId] || [])];
      updated.splice(idx, 1);
      return { ...prev, [slotId]: updated };
    });
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3 style={{ marginTop: 0 }}>📎 Reference Images</h3>
      <p className="sub" style={{ margin: '0 0 10px', fontSize: 11.5 }}>
        Upload references to guide the AI — the model will match style, colors, shapes, and composition from your images.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {slots.map((slot) => (
          <div key={slot.id} style={{ background: 'rgba(139,107,255,.04)', border: '1px solid rgba(139,107,255,.12)', borderRadius: 8, padding: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#dff0f8', marginBottom: 2 }}>{slot.label}</div>
            <div style={{ fontSize: 11, color: '#b7b2dc', marginBottom: 8 }}>{slot.hint}</div>
            <button className="btn ghost small" onClick={() => pick(slot.id)}>+ Add photos</button>
            <RefThumbs
              files={secRefs[slot.id] || []}
              onRemove={(idx) => remove(slot.id, idx)}
            />
            {(secRefs[slot.id] || []).length > 0 && (
              <div style={{ fontSize: 10, color: '#b7b2dc', marginTop: 4 }}>
                {(secRefs[slot.id] || []).length} image{(secRefs[slot.id] || []).length > 1 ? 's' : ''} selected
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Studio({ studioId }) {
  const studio = studios.studios.find((s) => s.id === studioId);
  const [tool, setTool] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => setTool(null), [studioId]);
  if (!studio) return null;
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{studio.icon} Pandora {studio.name}</h1>
          <p className="sub" style={{ marginBottom: 0 }}>{studio.subtitle}</p>
        </div>
        <button
          className="btn ghost small"
          onClick={() => setShowGuide(true)}
          style={{ flexShrink: 0, marginTop: 4, fontSize: 12 }}
        >
          📖 Guide Book
        </button>
      </div>
      {showGuide && <GuideBook sectionId={studioId} onClose={() => setShowGuide(false)} />}
      <div style={{ marginTop: 18 }}>
        {!tool ? (
          <div className="grid">
            {studio.tools.map((t) => (
              <button key={t.id} className="card tool-card" onClick={() => setTool(t)}>
                <ToolArt tool={t} />
                <div className="tool-body">
                  <div className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
                    <strong>{t.name}</strong><span className="badge">{t.kind}</span>
                  </div>
                  <p className="sub" style={{ margin: '5px 0 0' }}>{t.desc}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <ToolRunner tool={tool} studioId={studioId} onBack={() => setTool(null)} />
        )}
      </div>
    </div>
  );
}

function ToolRunner({ tool, studioId, onBack }) {
  const isFashion = studioId === 'fashion';
  const [fashionSel, setFashionSel] = useState({ style: '', pose: '', light: '', palette: '' });
  const [cinSel, setCinSel] = useState({ camera: '', lens: '', palette: '', scheme: '', mood: '' });
  const [gen, setGen] = useState(DEFAULT_GEN);
  const { db, update } = useStore();
  const [images, setImages] = useState({});
  const [secRefs, setSecRefs] = useState({});   // section-specific reference images
  const [notes, setNotes] = useState('');
  const [modelId, setModelId] = useState('');
  const [styleId, setStyleId] = useState('');
  const [charId, setCharId] = useState('');
  const [locId, setLocId] = useState('');
  const job = useJob();
  const busy = job.running;
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [textResult, setTextResult] = useState('');

  const allModels = useAllModels();
  const models = useMemo(() => {
    const api = allModels.filter((m) => m.provider !== 'local' && m.kind === tool.kind && (tool.imageInputs.length === 0 || (m.refInput && (m.maxRefs || 1) >= tool.imageInputs.length)));
    if (tool.kind === 'llm') {
      return { api: [{ id: 'claude', name: 'Claude (Anthropic)', provider: 'anthropic' }], os: directory.openSource.filter((m) => ['llm', 'code'].includes(m.type)).map((m) => ({ id: 'os-' + m.repo, name: m.name + ' (local runtime)', provider: 'local' })), all: [{ id: 'claude', name: 'Claude', provider: 'anthropic' }] };
    }
    const os = allModels.filter((m) => m.provider === 'local' && m.kind === tool.kind);
    return { api, os, all: [...api, ...os] };
  }, [tool, allModels]);
  const model = models.all.find((m) => m.id === modelId) || models.all[0];
  const style = styles.presets.find((s) => s.id === styleId) || (db.styles || []).find((s) => s.id === styleId) || null;
  const character = db.characters.find((c) => c.id === charId) || null;
  const location = db.locations.find((l) => l.id === locId) || null;
  const rdy = useReadiness();
  const gate = useModelGate(model);
  const ready = model && gate.ok && tool.imageInputs.every((inp) => images[inp.id]?.length);
  const visual = tool.kind === 'image' || tool.kind === 'video';

  async function pick(inpId) {
    try {
      const files = await window.api.pickImages();
      if (files.length) setImages((im) => ({ ...im, [inpId]: files }));
    } catch (err) { console.error('pickImages failed:', err); }
  }

  async function go() {
    if (busy) return;
    setError(''); setResult(null); setTextResult('');
    await job.start(async (jobId) => {
    try {
      if (tool.kind === 'llm') {
        const out = await window.api.claude({ jobId, system: 'You are an elite builder. Deliver complete, production-quality output. No preamble.', prompt: tool.template.replace('{notes}', notes || ''), maxTokens: 32000 });
        setTextResult(out); return;
      }
      let prompt = tool.template.replace('{notes}', notes || '').trim();
      if (isFashion) {
        const fp = [];
        if (fashionSel.style) fp.push('fashion style: ' + fashionSel.style);
        if (fashionSel.pose) fp.push('pose: ' + fashionSel.pose);
        if (fashionSel.light) fp.push('lighting: ' + fashionSel.light);
        const pal = fashion.palettes.find((p) => p.name === fashionSel.palette);
        if (pal) fp.push('color palette: ' + pal.name + ' (' + pal.colors.join(', ') + ')');
        if (fp.length) prompt += '\n' + fp.join('; ');
      }
      const cp = [];
      if (cinSel.camera) cp.push('shot on ' + cinSel.camera);
      if (cinSel.lens) cp.push(cinSel.lens + ' lens characteristics');
      const cpal = cine.palettes.find((p) => p.name === cinSel.palette);
      if (cpal) cp.push('color palette: ' + cpal.prompt + ' (' + cpal.colors.join(', ') + ')');
      const sch = colorTheory.schemes.find((c) => c.name === cinSel.scheme);
      if (sch) cp.push(sch.prompt);
      const md = colorTheory.psychology.find((c) => cinSel.mood && cinSel.mood.startsWith(c.color));
      if (md) cp.push(md.prompt);
      if (cp.length) prompt += '\n' + cp.join('; ');

      // Merge tool image inputs + section reference images
      const toolRefs = [
        ...tool.imageInputs.flatMap((inp) => images[inp.id] || []),
        ...Object.values(secRefs).flat(),
      ];
      const mentions = resolveMentions(notes, db);
      const res = await window.api.generate({
        jobId, provider: model.provider, model, kind: tool.kind, prompt, mentions,
        params: genParams(gen, tool.kind), toolRefs, style, character, location, cameraPreset: null
      });
      setResult(res.file);
      update((d) => {
        d.generations.unshift({ id: uid(), file: res.file, kind: tool.kind, prompt: '[' + tool.name + '] ' + notes, model: model.name, character: character?.name || null, characterId: character?.id || null, location: location?.name || null, locationId: location?.id || null, mentions: mentions.map((m) => m.name), at: new Date().toISOString() });
        return d;
      });
    } catch (e) { const m = friendlyError(e); if (m) setError(m); }
    });
  }

  return (
    <div style={{ maxWidth: 760 }} onKeyDown={runKeys(job, go, !!ready)}>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong>{tool.name}</strong>
          <button className="btn ghost small" onClick={onBack}>← All tools</button>
        </div>
        <p className="sub" style={{ margin: '4px 0 0' }}>{tool.desc}</p>

        {tool.imageInputs.map((inp) => (
          <div key={inp.id}>
            <label>{inp.label}</label>
            <div className="row">
              <DropZone onFiles={(files) => setImages((im) => ({ ...im, [inp.id]: [...(im[inp.id] || []), ...files] }))}>
                <button className="btn ghost small" onClick={() => pick(inp.id)}>+ Choose image</button>
                <span className="sub" style={{ fontSize: 10, marginLeft: 6 }}>or drop here</span>
              </DropZone>
              <span className="sub" style={{ margin: 0 }}>{images[inp.id]?.length ? images[inp.id].length + ' selected' : 'none'}</span>
            </div>
            {images[inp.id]?.length > 0 && (
              <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {images[inp.id].map((f, i) => (
                  <img key={i} src={'media://' + f} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(139,107,255,.25)' }} onError={(e) => { e.target.style.display = 'none'; }} />
                ))}
              </div>
            )}
          </div>
        ))}

        <label>Details / instructions</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Colors, mood, angle, script, specific details… type @Name for saved characters, locations, products  (Ctrl+Enter)" />
        {tool.kind !== 'llm' && <PromptTools value={notes} onChange={setNotes} kind={tool.kind} />}
        {tool.kind !== 'llm' && <MentionBar db={db} value={notes} onInsert={(t) => setNotes((n) => insertMention(n, t))} />}

        {visual && (
          <GenSettings value={gen} onChange={setGen} kind={tool.kind} source={model?.provider === 'local' ? 'local' : 'cloud'} />
        )}

        <label>Model</label>
        <select value={model?.id || ''} onChange={(e) => setModelId(e.target.value)}>
          <option value="">— Select model —</option>
          <optgroup label={'☁ API models (' + models.api.length + ')'}>
            {models.api.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, rdy)}</option>)}
          </optgroup>
          <optgroup label={'⬇ Open-source · local (' + models.os.length + ')'}>
            {models.os.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, rdy)}</option>)}
          </optgroup>
        </select>
        <ModelStatus model={model} />

        {visual && (
          <div className="cinerow" style={{ marginTop: 4 }}>
            {[['camera','Camera body (' + cine.cameras.length + ')',cine.cameras],
              ['lens','Lens (' + cine.lenses.length + ')',cine.lenses],
              ['palette','Color palette (' + cine.palettes.length + ')',cine.palettes.map((p) => p.name)],
              ['scheme','Color scheme (' + colorTheory.schemes.length + ')',colorTheory.schemes.map((c) => c.name)],
              ['mood','Mood color',colorTheory.psychology.map((c) => c.color + ' — ' + c.emotions.slice(0,3).join('/'))]].map(([k,lbl,opts]) => (
              <div key={k}>
                <label>{lbl}</label>
                <select value={cinSel[k]} onChange={(e) => setCinSel((f) => ({ ...f, [k]: e.target.value }))}>
                  <option value="">None</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {visual && isFashion && (
          <div className="cinerow" style={{ marginTop: 4 }}>
            {[['style','Fashion style (' + fashion.fashionStyles.length + ')',fashion.fashionStyles],
              ['pose','Pose (' + fashion.poses.length + ')',fashion.poses],
              ['light','Light mood (' + fashion.lightMoods.length + ')',fashion.lightMoods],
              ['palette','Palette (' + fashion.palettes.length + ')',fashion.palettes.map((p) => p.name)]].map(([k,lbl,opts]) => (
              <div key={k}>
                <label>{lbl}</label>
                <select value={fashionSel[k]} onChange={(e) => setFashionSel((f) => ({ ...f, [k]: e.target.value }))}>
                  <option value="">None</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {visual && (
          <>
            <label>Style</label>
            <div className="row">
              <button className={'chip' + (!styleId ? ' on' : '')} onClick={() => setStyleId('')}>None</button>
              {styles.presets.slice(0, 12).map((s) => (
                <button key={s.id} className={'chip' + (styleId === s.id ? ' on' : '')} onClick={() => setStyleId(s.id)}>{s.name}</button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <div style={{ flex: 1 }}>
                <label>Character</label>
                <select value={charId} onChange={(e) => setCharId(e.target.value)}>
                  <option value="">None</option>
                  {db.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label>⌖ Location Lock</label>
                <select value={locId} onChange={(e) => setLocId(e.target.value)}>
                  <option value="">None</option>
                  {db.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {!visual && tool.kind === 'audio' && (
          <div style={{ marginTop: 6 }}>
            <label>Character voice</label>
            <select value={charId} onChange={(e) => setCharId(e.target.value)}>
              <option value="">None</option>
              {db.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <RunButton job={job} label={tool.kind === 'llm' ? '✦ Build' : '✦ Generate'} busyLabel={tool.kind === 'llm' ? 'Building…' : 'Generating…'} onRun={go} disabled={!ready} />
          {model && !gate.ok && !busy && <span className="sub" style={{ fontSize: 11 }}>🔒 {gate.reason}</span>}
        </div>
        <ErrorBox error={error} />
        {textResult && (
          <div className="result-box">
            <div className="log" style={{ maxHeight: 420 }}>{textResult}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn ghost small" onClick={() => navigator.clipboard.writeText(textResult)}>Copy</button>
            </div>
          </div>
        )}
        {result && (
          <div className="result-box">
            <Media file={result} kind={tool.kind} controls />
            <div style={{ marginTop: 8 }}><AssetActions file={result} kind={tool.kind} prompt={notes} /></div>
          </div>
        )}
      </div>

      {/* Section-specific reference image uploader */}
      <RefPanel studioId={studioId} secRefs={secRefs} onChange={setSecRefs} />
    </div>
  );
}
