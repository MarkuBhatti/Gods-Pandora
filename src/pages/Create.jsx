import React, { useEffect, useMemo, useState } from 'react';
import presets from '../../data/cameraPresets.json';
import stylesData from '../../data/stylePresets.json';
import { useStore, uid } from '../lib/store.jsx';
import Media from '../lib/Media.jsx';
import GuideBook from './GuideBook.jsx';
import GenSettings, { DEFAULT_GEN, genParams } from '../lib/GenSettings.jsx';
import { useAllModels, modelLabel, useMarketFiles, ModelStatus, useModelGate, useReadiness, isFree, VOICES, AUDIO_VOICES, audioTypeOf, readiness } from '../lib/models.jsx';
import LoraPicker, { loraParams, triggerText } from '../lib/LoraPicker.jsx';
import { takeIntent, useNav } from '../lib/nav.jsx';
import { MentionBar, resolveMentions, insertMention } from '../lib/mentions.jsx';
import AssetActions from '../lib/AssetActions.jsx';
import { useJob, RunButton, ErrorBox, friendlyError, runKeys } from '../lib/job.jsx';
import { usePersist, PromptTools, DropZone, addPromptHistory } from '../lib/qol.jsx';
import OptionPicker from '../lib/OptionPicker.jsx';

const KINDS = ['image', 'video', 'audio'];

// Reference slot definition for the Create page
const GENERAL_REFS = [
  { id: 'style',     label: '🎨 Style Reference',      hint: 'Aesthetic, mood, or visual style to match' },
  { id: 'subject',   label: '🖼 Subject / Content',    hint: 'What should appear — person, object, scene' },
  { id: 'color',     label: '🌈 Color / Palette',      hint: 'Color mood, palette, or grade to follow' },
  { id: 'compose',   label: '📐 Composition / Layout', hint: 'Shot framing, perspective, or layout guide' },
];

// Audio-only options (replace Visual style / Camera when generating sound). Picked tags are added to the
// prompt for music and sound-effect models (speech models read the prompt aloud, so they get none).
const opt = (group, names) => names.map((n) => ({ id: n.toLowerCase(), name: n, group }));
const AUDIO_PRESETS = {
  music: [
    ['genre', '🎼 Genre', [...opt('Popular', ['Pop', 'Hip-hop', 'Trap', 'R&B', 'Rock', 'Indie', 'EDM', 'House', 'Techno', 'Lo-fi', 'Synthwave', 'Phonk', 'Drill', 'Afrobeats', 'Reggaeton', 'K-pop']),
      ...opt('Cinematic', ['Epic orchestral', 'Cinematic trailer', 'Ambient', 'Piano score', 'Dark tension', 'Documentary', 'Fantasy']),
      ...opt('Regional', ['Qawwali', 'Bollywood', 'Punjabi bhangra', 'Arabic', 'Latin', 'Flamenco', 'Celtic', 'J-pop', 'Anime OST']),
      ...opt('Other', ['Jazz', 'Blues', 'Classical', 'Country', 'Folk', 'Metal', 'Funk', 'Gospel', 'Children', 'Corporate'])]],
    ['mood', '🌗 Mood', opt('', ['Uplifting', 'Happy', 'Energetic', 'Hype', 'Romantic', 'Chill', 'Calm', 'Dreamy', 'Nostalgic', 'Sad', 'Melancholic', 'Dark', 'Tense', 'Mysterious', 'Heroic', 'Inspirational', 'Funny', 'Spooky'])],
    ['inst', '🎹 Instruments', opt('', ['Piano', 'Acoustic guitar', 'Electric guitar', '808 bass', 'Synth pads', 'Strings', 'Brass', 'Choir', 'Drums', 'Tabla', 'Sitar', 'Flute', 'Violin', 'Cello', 'Saxophone', 'Harmonium', 'Bells', 'Plucks'])],
    ['vocal', '🎤 Vocals', opt('', ['Instrumental', 'Male vocals', 'Female vocals', 'Duet', 'Choir vocals', 'Rap', 'Humming', 'Whisper vocals'])],
    ['tempo', '⏱ Tempo', opt('', ['Slow 70 BPM', 'Mid 95 BPM', 'Groovy 110 BPM', 'Upbeat 124 BPM', 'Fast 140 BPM', 'Very fast 170 BPM'])],
  ],
  sfx: [
    ['env', '🌍 Environment', opt('', ['Indoor room', 'Big hall', 'Outdoor', 'City street', 'Forest', 'Ocean', 'Rain', 'Wind', 'Space', 'Underwater', 'Cave', 'Crowd', 'Office', 'Kitchen'])],
    ['char', '🔊 Character', opt('', ['Close-up', 'Distant', 'Loud impact', 'Soft', 'Whoosh', 'Riser', 'Glitch', 'Cinematic hit', 'Foley', 'UI click', 'Retro 8-bit', 'Looping ambience'])],
  ],
  speech: [],
};

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
  // audio: length, voice and (for song models) lyrics
  const [audioSecs, setAudioSecs] = usePersist('create.audioSecs', 30);
  const [voices, setVoices] = usePersist('create.voices', {}); // voice per model family
  const [lyrics, setLyrics] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [styleId, setStyleId] = useState('');
  const [charId, setCharId] = useState('');
  const [locId, setLocId] = useState('');
  const [refs, setRefs] = useState({});  // { style: [file, ...], subject: [...], ... }
  const [audioTags, setAudioTags] = usePersist('create.audioTags', {}); // { genre: [...], mood: [...] }
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
  const audioFam = model?.provider === 'localaudio' ? (model.family || (/bark/i.test(model.endpoint || '') ? 'bark' : '')) : '';
  const voiceList = kind !== 'audio' || !model ? [] : model.provider === 'localaudio' ? (AUDIO_VOICES[audioFam] || []) : (VOICES[model.provider] || []);
  const voiceKey = audioFam || model?.provider || '';
  const audioPresets = kind === 'audio' && model ? (AUDIO_PRESETS[audioTypeOf(model)] || []) : [];
  const voiceId = voices[voiceKey] && voiceList.some(([v]) => v === voices[voiceKey]) ? voices[voiceKey] : (voiceList[0] || [''])[0];

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
          if (kind === 'audio') {
            if (audioTypeOf(model) !== 'speech') p.seconds = +audioSecs || 30;
            if (voiceList.length) p.voiceId = voiceId;
            if (model.family === 'acestep' && lyrics.trim()) p.lyrics = lyrics;
          }
          const useLoras = model.provider === 'local' ? loraParams(loras, marketFiles).filter((x) => marketFiles.some((f) => f.file === x.path)) : [];
          if (useLoras.length) p.loras = useLoras;
          let sendPrompt = useLoras.length && addTriggers ? triggerText(loras, marketFiles) + prompt : prompt;
          if (kind === 'audio' && audioPresets.length) {
            const tags = audioPresets.flatMap(([k, , list]) => (audioTags[k] || []).map((id) => (list.find((o) => o.id === id) || {}).name).filter(Boolean));
            if (tags.length) sendPrompt = sendPrompt.trim().replace(/[.,;\s]+$/, '') + ', ' + tags.join(', ');
          }
          if (n > 1 && p.seed != null) p.seed = p.seed + i; // fixed seed → consecutive variations
          const res = await window.api.generate({
            jobId: job.step(), provider: model.provider, model, kind, prompt: sendPrompt, mentions,
            params: p, toolRefs: kind === 'audio' ? [] : allRefFiles, cameraPreset: kind === 'audio' ? null : camera, character: kind === 'audio' ? null : character, location: kind === 'audio' ? null : location, style: kind === 'audio' ? null : style,
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

          {kind !== 'audio' && (
            <div className="ref-strip">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: 13 }}>📎 Reference images</strong>
                <span className="sub" style={{ fontSize: 11 }}>
                  {allRefFiles.length ? `✓ ${allRefFiles.length} will be sent to the model` : refsSupported || !model ? 'optional — guide style, subject, colour or layout' : 'this model ignores image refs — pick a “refs” model'}
                </span>
              </div>
              <div className="ref-slots">
                {GENERAL_REFS.map((slot) => (
                  <DropZone key={slot.id} onFiles={(files) => setRefs((prev) => ({ ...prev, [slot.id]: [...(prev[slot.id] || []), ...files] }))}>
                    <div className="ref-slot" title={slot.hint}>
                      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                        <span className="ref-slot-l">{slot.label}</span>
                        <button className="btn ghost small" style={{ padding: '2px 8px' }} onClick={() => pickRef(slot.id)}>+</button>
                      </div>
                      {(refs[slot.id] || []).length ? <RefThumbs files={refs[slot.id]} onRemove={(i) => removeRef(slot.id, i)} /> : <div className="sub" style={{ fontSize: 10 }}>drop or click +</div>}
                    </div>
                  </DropZone>
                ))}
              </div>
            </div>
          )}

          {kind !== 'audio' && (
            <div className="opick-grid">
              <OptionPicker icon="🎥" label="Camera move" value={cameraId} onChange={setCameraId}
                options={presets.presets.map((p) => ({ id: p.id, name: p.name, hint: p.promptText, group: p.category }))} />
              <OptionPicker icon="❖" label="Visual style" value={styleId} onChange={setStyleId}
                options={allStyles.map((s) => ({ id: s.id, name: s.name, hint: s.promptText, group: s.category || 'My styles' }))} />
              <OptionPicker icon="☺" label="Character" value={charId} onChange={setCharId} noneLabel={db.characters.length ? 'None' : 'None (make one in Characters)'}
                options={db.characters.map((c) => ({ id: c.id, name: c.name }))} />
              <OptionPicker icon="⌖" label="Location lock" value={locId} onChange={setLocId} noneLabel={db.locations.length ? 'None' : 'None (save one in Locations)'}
                options={db.locations.map((l) => ({ id: l.id, name: l.name }))} />
            </div>
          )}
          {kind !== 'audio' && model && !refsSupported && (charId || locId) && <p className="sub" style={{ fontSize: 11, margin: '4px 0 0' }}>This model has no image-reference input, so character/location consistency uses their descriptions only — pick a “refs” model for the strongest lock.</p>}

          {kind === 'audio' && model && (<>
            {audioPresets.length > 0 && (
              <div className="opick-grid">
                {audioPresets.map(([k, label, list]) => (
                  <OptionPicker key={k} label={label} value={audioTags[k] || []} multi noneLabel="Any" options={list}
                    onChange={(v) => setAudioTags({ ...audioTags, [k]: v })} />
                ))}
              </div>
            )}
            {audioTypeOf(model) === 'speech' && <p className="sub" style={{ fontSize: 11, margin: '6px 0 0' }}>🗣 Speech models read your prompt aloud — type exactly what should be said. Use commas and “…” for pauses.</p>}
            {audioTypeOf(model) !== 'speech' && (<>
              <label>Length</label>
              <div className="row" style={{ gap: 4 }}>
                {[10, 30, 60, 120, 180, 240].map((n) => (
                  <button key={n} className={'chip mini' + (+audioSecs === n ? ' on' : '')} onClick={() => setAudioSecs(n)}>{n < 60 ? n + ' s' : n / 60 + ' min'}</button>
                ))}
              </div>
              {model.family === 'musicgen' && +audioSecs > 60 && <div className="sub" style={{ fontSize: 11 }}>MusicGen makes up to 60 s per clip.</div>}
              {model.family === 'stableaudio' && +audioSecs > 47 && <div className="sub" style={{ fontSize: 11 }}>Stable Audio Open makes up to 47 s per clip.</div>}
            </>)}
            {voiceList.length > 0 && (<>
              <label>Voice</label>
              <select value={voiceId} onChange={(e) => setVoices({ ...voices, [voiceKey]: e.target.value })}>
                {voiceList.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </>)}
            {model.family === 'acestep' && (<>
              <label>Lyrics (optional — leave empty for an instrumental)</label>
              <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} placeholder={'[verse]\nWrite your lyrics here…\n\n[chorus]\n…'} style={{ minHeight: 110 }} />
              <div className="sub" style={{ fontSize: 11 }}>Pick the sound above (genre, mood, instruments, vocals, tempo) and put the words here with [verse] / [chorus] tags.</div>
            </>)}
          </>)}

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
        </div>

        <div>
          <div className="card create-out">
            <h3 style={{ marginTop: 0 }}>{kind === 'audio' ? '🎧 Output' : kind === 'video' ? '🎞 Output' : '🖼 Output'}</h3>
            {results.length > 0 ? (
              <div className={results.length > 1 ? 'result-grid' : ''}>
                {results.map((f) => (
                  <div key={f} className="result-box">
                    <Media file={f} kind={kind} controls />
                    {note && results.length === 1 && <div className="sub" style={{ fontSize: 11, marginTop: 6 }}>ℹ {note}</div>}
                    <div style={{ marginTop: 8 }}><AssetActions file={f} kind={kind} prompt={prompt} /></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="create-empty">
                <div style={{ fontSize: 34, opacity: 0.5 }}>{kind === 'audio' ? '♫' : kind === 'video' ? '▶' : '✦'}</div>
                <p className="sub" style={{ margin: 0 }}>{busy ? 'Generating…' : 'Your ' + kind + ' appears here.'}</p>
                {kind !== 'audio' && (camera || style || character || location || allRefFiles.length > 0) && (
                  <div className="row" style={{ justifyContent: 'center', gap: 5, marginTop: 10 }}>
                    {camera && <span className="badge">🎥 {camera.name}</span>}
                    {style && <span className="badge">❖ {style.name}</span>}
                    {character && <span className="badge">☺ {character.name}</span>}
                    {location && <span className="badge">⌖ {location.name}</span>}
                    {allRefFiles.length > 0 && <span className="badge">📎 {allRefFiles.length} refs</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
