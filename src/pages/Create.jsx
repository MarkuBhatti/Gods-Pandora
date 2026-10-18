import React, { useEffect, useMemo, useState } from 'react';
import presets from '../../data/cameraPresets.json';
import stylesData from '../../data/stylePresets.json';
import { useStore, uid } from '../lib/store.jsx';
import Media from '../lib/Media.jsx';
import GuideBook from './GuideBook.jsx';
import GenSettings, { DEFAULT_GEN, genParams } from '../lib/GenSettings.jsx';
import { useAllModels, modelLabel, useMarketFiles, ModelStatus, useModelGate, useReadiness, isFree, VOICES, readiness } from '../lib/models.jsx';
import LoraPicker, { loraParams, triggerText } from '../lib/LoraPicker.jsx';
import { takeIntent, useNav } from '../lib/nav.jsx';
import { MentionBar, resolveMentions, insertMention } from '../lib/mentions.jsx';
import AssetActions from '../lib/AssetActions.jsx';
import { useJob, RunButton, ErrorBox, friendlyError, runKeys } from '../lib/job.jsx';
import { usePersist, PromptTools, DropZone, addPromptHistory } from '../lib/qol.jsx';

const KINDS = ['image', 'video', 'audio'];

// Reference slot definition for the Create page
const GENERAL_REFS = [
  { id: 'style',     label: '🎨 Style Reference',      hint: 'Aesthetic, mood, or visual style to match' },
  { id: 'subject',   label: '🖼 Subject / Content',    hint: 'What should appear — person, object, scene' },
  { id: 'color',     label: '🌈 Color / Palette',      hint: 'Color mood, palette, or grade to follow' },
  { id: 'compose',   label: '📐 Composition / Layout', hint: 'Shot framing, perspective, or layout guide' },
];

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

export default function Create() {
  const { db, update } = useStore();
  const [showGuide, setShowGuide] = useState(false);
  const [source, setSource] = usePersist('create.source', 'cloud'); // cloud | local
  const [kind, setKind] = usePersist('create.kind', 'image');
  const [modelId, setModelId] = usePersist('create.model', '');
  const [count, setCount] = usePersist('create.count', 1);
  const [loras, setLoras] = usePersist('create.loras', {});
  const [addTriggers, setAddTriggers] = usePersist('create.triggers', true);
  const marketFiles = useMarketFiles();
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNeg] = usePersist('create.neg', '');
  const [gen, setGen] = usePersist('create.gen', DEFAULT_GEN);
  const [cameraId, setCameraId] = useState('');
  const [styleId, setStyleId] = useState('');
  const [charId, setCharId] = useState('');
  const [locId, setLocId] = useState('');
  const [refs, setRefs] = useState({});  // { style: [file, ...], subject: [...], ... }
  const job = useJob();
  const busy = job.running;
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const result = results[0] || null;
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState('');
  const [preferRefs, setPreferRefs] = useState(false);
  const { go: nav } = useNav();
  const allModels = useAllModels();

  // Arrive from Library / Characters / Influencer builder with refs, a character, or video mode
  useEffect(() => {
    const it = takeIntent('create');
    if (!it) return;
    if (it.kind) setKind(it.kind);
    if (it.source) setSource(it.source);
    if (it.prompt) setPrompt(it.prompt);
    if (it.charId) setCharId(it.charId);
    if (it.locId) setLocId(it.locId);
    if (it.refs?.length) { setRefs((prev) => ({ ...prev, subject: [...(prev.subject || []), ...it.refs] })); setPreferRefs(true); }
  }, []);

  const models = useMemo(() => allModels.filter((m) => m.kind === kind && (source === 'local' ? isFree(m) : !isFree(m))), [allModels, kind, source]);
  const rdyEarly = useReadiness();
  const model = models.find((m) => m.id === modelId) || (preferRefs && models.find((m) => m.refInput && readiness(m, rdyEarly).ok)) || (preferRefs && models.find((m) => m.refInput)) || models.find((m) => readiness(m, rdyEarly).ok) || models[0];
  const camera = presets.presets.find((p) => p.id === cameraId) || null;
  const allStyles = [...stylesData.presets, ...(db.styles || [])];
  const style = allStyles.find((s) => s.id === styleId) || null;
  const character = db.characters.find((c) => c.id === charId) || null;
  const location = db.locations.find((l) => l.id === locId) || null;
  const refsSupported = !!model?.refInput;
  const allRefFiles = Object.values(refs).flat();
  const rdy = useReadiness();
  const gate = useModelGate(model);

  async function pickRef(slotId) {
    try {
      const files = await window.api.pickImages();
      if (files.length) {
        setRefs((prev) => ({ ...prev, [slotId]: [...(prev[slotId] || []), ...files] }));
      }
    } catch (err) { console.error('pickImages failed:', err); }
  }

  function removeRef(slotId, idx) {
    setRefs((prev) => {
      const updated = [...(prev[slotId] || [])];
      updated.splice(idx, 1);
      return { ...prev, [slotId]: updated };
    });
  }

  async function go() {
    if (!model || !prompt.trim() || busy) return;
    if (!gate.ok) { setError(gate.reason); return; }
    setError(''); setResults([]); setNote(''); setProgress('');
    addPromptHistory(prompt);
    const mentions = resolveMentions(prompt, db);
    const n = kind === 'audio' ? 1 : Math.max(1, Math.min(4, +count || 1));
    await job.start(async (_id, isCancelled) => {
      for (let i = 0; i < n; i++) {
        if (isCancelled()) break;
        if (n > 1) setProgress(`${i + 1} of ${n}`);
        try {
          const p = { ...genParams(gen, kind), negativePrompt };
          const useLoras = model.provider === 'local' ? loraParams(loras, marketFiles).filter((x) => marketFiles.some((f) => f.file === x.path)) : [];
          if (useLoras.length) p.loras = useLoras;
          const sendPrompt = useLoras.length && addTriggers ? triggerText(loras, marketFiles) + prompt : prompt;
          if (n > 1 && p.seed != null) p.seed = p.seed + i; // fixed seed → consecutive variations
          const res = await window.api.generate({
            jobId: job.step(), provider: model.provider, model, kind, prompt: sendPrompt, mentions,
            params: p, toolRefs: allRefFiles, cameraPreset: camera, character, location, style,
          });
          setResults((r) => [...r, res.file]); setNote(res.note || '');
          update((d) => {
            d.generations.unshift({
              id: uid(), file: res.file, kind, prompt, model: model.name,
              camera: camera?.name || null, character: character?.name || null, characterId: character?.id || null,
              location: location?.name || null, locationId: location?.id || null,
              mentions: mentions.map((m) => m.name), at: new Date().toISOString()
            });
            return d;
          });
        } catch (e) {
          const msg = friendlyError(e);
          if (msg) setError(msg);
          break;
        }
      }
    });
    setProgress('');
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Pandora Studio</h1>
          <p className="sub" style={{ marginBottom: 0 }}>Generate with cloud APIs (your keys, pay per use) or fully offline with local open-source models.</p>
        </div>
        <button className="btn ghost small" onClick={() => setShowGuide(true)} style={{ flexShrink: 0, marginTop: 4, fontSize: 12 }}>
          📖 Guide Book
        </button>
      </div>
      {showGuide && <GuideBook sectionId="create" onClose={() => setShowGuide(false)} />}

      <div className="two-col" style={{ marginTop: 16 }}>
        <div className="card" onKeyDown={runKeys(job, go, !!prompt.trim() && !!model && gate.ok)}>
          <div className="row">
            {['cloud', 'local'].map((s) => (
              <button key={s} className={'chip' + (source === s ? ' on' : '')} onClick={() => { setSource(s); setModelId(''); }}>
                {s === 'cloud' ? '☁ Cloud APIs' : '⬇ Local (open-source)'}
              </button>
            ))}
            <span style={{ width: 14 }} />
            {KINDS.map((k) => (
              <button key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => { setKind(k); setModelId(''); }}>{k}</button>
            ))}
          </div>

          <label>Model</label>
          <select value={model?.id || ''} onChange={(e) => setModelId(e.target.value)}>
            <option value="">— Select model —</option>
            {models.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, rdy)}</option>)}
          </select>
          <ModelStatus model={model} />
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
            <span className="sub" style={{ fontSize: 11 }}>{model?.provider === 'local' && character?.soulId?.provider === 'local' ? (character.soulId.base === model.endpoint ? '🧬 uses ' + character.name + "'s local Identity Lock" : '🧬 ' + character.name + "'s local Identity Lock needs the " + character.soulId.base.split('/').pop() + ' model') : model?.soul ? (character?.soulId ? '🧬 uses ' + character.name + "'s Identity Lock" : '🧬 Identity Lock model — select a character trained in Characters (or @mention one)') : model?.refInput ? '✓ accepts reference images' : 'text-only model'}{model?.requiresImage ? ' · needs a reference image' : ''}</span>
            <button className="btn ghost small" onClick={() => nav('models')}>＋ Add any model</button>
          </div>
          {models.length === 0 && <div className="err">No {kind} models for this source yet — add some in data/modelCatalog.json.</div>}

          <label>Prompt</label>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe your shot… type @Name to use a saved character, location or product  (Ctrl+Enter to generate)" />
          <PromptTools value={prompt} onChange={setPrompt} kind={kind} />
          <MentionBar db={db} value={prompt} onInsert={(t) => setPrompt((p) => insertMention(p, t))} />

          {kind !== 'audio' && (<>
            <label>Negative prompt (optional)</label>
            <input value={negativePrompt} onChange={(e) => setNeg(e.target.value)} placeholder="blurry, low quality…" />
            <GenSettings value={gen} onChange={setGen} kind={kind} source={source} />
            {kind === 'image' && <LoraPicker model={model} value={loras} onChange={setLoras} addTriggers={addTriggers} setAddTriggers={setAddTriggers} />}
          </>)}

          <div className="row" style={{ marginTop: 18, alignItems: 'center' }}>
            <RunButton job={job} label={`✦ Generate ${kind}${count > 1 && kind !== 'audio' ? ' ×' + count : ''}`} busyLabel={progress ? `Generating ${progress}…` : 'Generating…'} onRun={go} disabled={!prompt.trim() || !model || !gate.ok} />
            {!gate.ok && model && !busy && <span className="sub" style={{ fontSize: 11 }}>🔒 {gate.reason}</span>}
            {kind !== 'audio' && !busy && (
              <span className="row" style={{ gap: 4 }} title="How many to generate in one go">
                {[1, 2, 4].map((n) => <button key={n} className={'chip mini' + (count === n ? ' on' : '')} onClick={() => setCount(n)}>×{n}</button>)}
              </span>
            )}
          </div>
          <ErrorBox error={error} />
          {results.length > 0 && (
            <div className={results.length > 1 ? 'result-grid' : ''}>
              {results.map((f) => (
                <div key={f} className="result-box">
                  <Media file={f} kind={kind} controls />
                  {note && results.length === 1 && <div className="sub" style={{ fontSize: 11, marginTop: 6 }}>ℹ {note}</div>}
                  <div style={{ marginTop: 8 }}><AssetActions file={f} kind={kind} prompt={prompt} /></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          {kind !== 'audio' && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>🎥 Camera move</h3>
              <div className="row">
                <button className={'chip' + (!cameraId ? ' on' : '')} onClick={() => setCameraId('')}>None</button>
                {presets.presets.map((p) => (
                  <button key={p.id} className={'chip' + (cameraId === p.id ? ' on' : '')} title={p.promptText} onClick={() => setCameraId(p.id)}>{p.name}</button>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>❖ Visual style</h3>
            <div className="row">
              <button className={'chip' + (!styleId ? ' on' : '')} onClick={() => setStyleId('')}>None</button>
              {allStyles.map((s) => (
                <button key={s.id} className={'chip' + (styleId === s.id ? ' on' : '')} title={s.promptText} onClick={() => setStyleId(s.id)}>{s.name}</button>
              ))}
            </div>
          </div>

          {kind !== 'audio' && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>☺ Character (consistent identity)</h3>
              <div className="row">
                <button className={'chip' + (!charId ? ' on' : '')} onClick={() => setCharId('')}>None</button>
                {db.characters.map((c) => (
                  <button key={c.id} className={'chip' + (charId === c.id ? ' on' : '')} onClick={() => setCharId(c.id)}>{c.name}</button>
                ))}
              </div>
              {db.characters.length === 0 && <p className="sub" style={{ margin: '8px 0 0' }}>Create characters in the Characters tab.</p>}
            </div>
          )}

          {kind !== 'audio' && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>⌖ Location Lock</h3>
              <div className="row">
                <button className={'chip loc' + (!locId ? ' on' : '')} onClick={() => setLocId('')}>None</button>
                {db.locations.map((l) => (
                  <button key={l.id} className={'chip loc' + (locId === l.id ? ' on' : '')} onClick={() => setLocId(l.id)}>{l.name}</button>
                ))}
              </div>
              <p className="sub" style={{ margin: '8px 0 0' }}>
                Locks the scene to a saved virtual location — same environment across every generation.
                {model && !refsSupported && (charId || locId) ? ' This model has no image-reference input, so consistency uses the location/character description only — pick a "refs" model for strongest lock.' : ''}
              </p>
            </div>
          )}

          {/* Reference image upload panel */}
          {kind !== 'audio' && (
            <div className="card" style={{ marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>📎 Reference Images</h3>
              <p className="sub" style={{ margin: '0 0 10px', fontSize: 11.5 }}>
                Upload reference photos to guide style, subject, color, or composition.
                {!refsSupported && model && ' (Selected model may not support image refs — switch to a ref-capable model for full effect.)'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {GENERAL_REFS.map((slot) => (
                  <div key={slot.id} style={{ background: 'rgba(139,107,255,.04)', border: '1px solid rgba(139,107,255,.12)', borderRadius: 8, padding: 9 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#dff0f8', marginBottom: 2 }}>{slot.label}</div>
                    <div style={{ fontSize: 11, color: '#b7b2dc', marginBottom: 7 }}>{slot.hint}</div>
                    <DropZone onFiles={(files) => setRefs((prev) => ({ ...prev, [slot.id]: [...(prev[slot.id] || []), ...files] }))}>
                      <button className="btn ghost small" onClick={() => pickRef(slot.id)}>+ Add</button>
                      <span className="sub" style={{ fontSize: 10, marginLeft: 6 }}>or drop images</span>
                    </DropZone>
                    <RefThumbs files={refs[slot.id] || []} onRemove={(i) => removeRef(slot.id, i)} />
                    {(refs[slot.id] || []).length > 0 && (
                      <div style={{ fontSize: 10, color: '#b7b2dc', marginTop: 4 }}>
                        {(refs[slot.id] || []).length} image{(refs[slot.id] || []).length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {allRefFiles.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#8b6bff' }}>
                  ✓ {allRefFiles.length} reference image{allRefFiles.length > 1 ? 's' : ''} will be sent to the model
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
