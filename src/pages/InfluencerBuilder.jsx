import React, { useMemo, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError, runKeys } from '../lib/job.jsx';
import { useStore, uid } from '../lib/store.jsx';
import { useNav } from '../lib/nav.jsx';
import { useAllModels, modelLabel, ModelStatus, useModelGate, useReadiness } from '../lib/models.jsx';
import GenSettings, { DEFAULT_GEN, genParams } from '../lib/GenSettings.jsx';
import Media from '../lib/Media.jsx';

// Higgsfield-style AI Influencer Character Builder: 19 menu categories, Shuffle, "add your face",
// generate a character sheet, save it as a permanent influencer (a Character with refs) and use it everywhere.
export const CATEGORIES = [
  ['type', 'Character type', ['Human', 'Elf', 'Android / cyborg', 'Alien', 'Vampire', 'Anime character', 'Mermaid', 'Anthropomorphic animal', 'Fantasy creature']],
  ['gender', 'Gender', ['Woman', 'Man', 'Non-binary', 'Androgynous']],
  ['age', 'Age', ['Early 20s', 'Late 20s', '30s', '40s', '50s', '60+']],
  ['origin', 'Origin / ethnicity', ['South Asian', 'East Asian', 'Southeast Asian', 'Middle Eastern', 'African', 'European', 'Latin American', 'Mixed heritage', 'Pacific Islander']],
  ['skin', 'Skin tone', ['Porcelain', 'Fair', 'Olive', 'Golden tan', 'Brown', 'Deep brown', 'Ebony', 'Freckled', 'Metallic / iridescent']],
  ['face', 'Face shape', ['Oval', 'Heart', 'Round', 'Square jaw', 'Diamond', 'Long', 'Sharp cheekbones']],
  ['eyes', 'Eye color', ['Dark brown', 'Hazel', 'Green', 'Blue', 'Grey', 'Amber', 'Heterochromia', 'Glowing cyan']],
  ['hairStyle', 'Hair style', ['Long waves', 'Sleek straight', 'Curly afro', 'Braids', 'Pixie cut', 'Buzz cut', 'Bob', 'Messy bun', 'Mullet', 'Bald']],
  ['hairColor', 'Hair color', ['Black', 'Dark brown', 'Chestnut', 'Blonde', 'Platinum', 'Copper red', 'Pastel pink', 'Silver', 'Electric blue']],
  ['body', 'Body type', ['Slim', 'Athletic', 'Muscular', 'Curvy', 'Petite', 'Tall and lean', 'Plus-size']],
  ['height', 'Height', ['Petite', 'Average', 'Tall', 'Very tall']],
  ['style', 'Fashion style', ['Streetwear', 'Old money', 'Y2K', 'Minimalist', 'Gothic', 'Techwear', 'Boho', 'Athleisure', 'Haute couture', 'Desi festive']],
  ['outfit', 'Signature outfit', ['Oversized hoodie + cargo', 'Tailored blazer', 'Slip dress', 'Leather jacket', 'Linen co-ord', 'Track suit', 'Saree / kurta', 'Futuristic bodysuit']],
  ['accessories', 'Accessories', ['Gold hoops', 'Chunky silver rings', 'Designer sunglasses', 'Nose ring', 'Pearl necklace', 'Beanie', 'Smartwatch', 'Face tattoos', 'None']],
  ['makeup', 'Makeup / grooming', ['No-makeup natural', 'Glossy glam', 'Bold red lip', 'Graphic liner', 'Freckle filter', 'Groomed beard', 'Clean shaven']],
  ['expression', 'Default expression', ['Warm smile', 'Confident smirk', 'Mysterious', 'Playful', 'Serene', 'Intense gaze']],
  ['vibe', 'Personality / vibe', ['Bubbly', 'Calm & wise', 'Edgy', 'Luxury', 'Nerdy', 'Adventurous', 'Romantic', 'Funny']],
  ['niche', 'Content niche', ['Fashion', 'Beauty', 'Fitness', 'Travel', 'Tech', 'Food', 'Gaming', 'Music', 'Finance', 'Wellness']],
  ['backdrop', 'Signature backdrop', ['Clean studio', 'City rooftop', 'Cozy apartment', 'Beach at golden hour', 'Neon street', 'Luxury hotel', 'Lahore old city', 'Nature trail']],
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function traitsToText(t) {
  const g = (k) => t[k] || '';
  return [
    `${g('age')} ${g('origin')} ${g('gender')}`.trim() + (g('type') && g('type') !== 'Human' ? ` (${g('type')})` : ''),
    g('skin') && `${g('skin').toLowerCase()} skin`, g('face') && `${g('face').toLowerCase()} face`,
    g('eyes') && `${g('eyes').toLowerCase()} eyes`, (g('hairStyle') || g('hairColor')) && `${g('hairColor').toLowerCase()} ${g('hairStyle').toLowerCase()} hair`.trim(),
    g('body') && `${g('body').toLowerCase()} build`, g('height') && `${g('height').toLowerCase()} height`,
    g('style') && `${g('style')} fashion`, g('outfit') && `wearing ${g('outfit').toLowerCase()}`,
    g('accessories') && g('accessories') !== 'None' && `accessories: ${g('accessories').toLowerCase()}`,
    g('makeup') && g('makeup').toLowerCase(), g('expression') && `${g('expression').toLowerCase()} expression`,
    g('vibe') && `${g('vibe').toLowerCase()} personality`, g('niche') && `${g('niche').toLowerCase()} creator`,
  ].filter(Boolean).join(', ');
}

export default function InfluencerBuilder() {
  const { db, update } = useStore();
  const { go } = useNav();
  const allModels = useAllModels();
  const [traits, setTraits] = useState(() => Object.fromEntries(CATEGORIES.map(([k, , opts]) => [k, opts[0]])));
  const [face, setFace] = useState([]);
  const [extra, setExtra] = useState('');
  const [modelId, setModelId] = useState('');
  const [gen, setGen] = useState({ ...DEFAULT_GEN, aspectRatio: '3:4', tier: 'hi' });
  const job = useJob();
  const busy = job.running;
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [name, setName] = useState('');
  const [savedId, setSavedId] = useState(null);

  const models = useMemo(() => {
    const img = allModels.filter((m) => m.kind === 'image');
    return face.length ? [...img.filter((m) => m.refInput), ...img.filter((m) => !m.refInput)] : img;
  }, [allModels, face.length]);
  const model = models.find((m) => m.id === modelId) || models[0];
  const rdy = useReadiness();
  const gate = useModelGate(model);
  const desc = traitsToText(traits) + (extra.trim() ? ', ' + extra.trim() : '');

  const shuffle = () => setTraits(Object.fromEntries(CATEGORIES.map(([k, , opts]) => [k, pick(opts)])));

  async function generate() {
    if (!model || busy) return;
    if (!gate.ok) { setError(gate.reason); return; }
    setError(''); setResult(null); setSavedId(null);
    await job.start(async (jobId) => {
    try {
      const prompt = `AI influencer character sheet: ${desc}. Front portrait, three-quarter view and full-body pose side by side, ` +
        `consistent identity across all views, ${traits.backdrop ? traits.backdrop.toLowerCase() + ' backdrop, ' : ''}` +
        'photorealistic, editorial lighting, sharp detail, memorable distinctive look.' +
        (face.length ? ' Use the exact face from the reference photo.' : '');
      const res = await window.api.generate({ jobId, provider: model.provider, model, kind: 'image', prompt, params: genParams(gen, 'image'), toolRefs: face });
      setResult(res.file);
      update((d) => { d.generations.unshift({ id: uid(), file: res.file, kind: 'image', prompt: '[AI Influencer] ' + desc, model: model.name, at: new Date().toISOString() }); return d; });
    } catch (e) { const m = friendlyError(e); if (m) setError(m); }
    });
  }

  function save() {
    if (!result || !name.trim()) return;
    const id = uid();
    update((d) => {
      d.characters.push({ id, kind: 'influencer', name: name.trim(), description: desc, refs: [result, ...face].slice(0, 14), signatureColor: '', traits, createdAt: new Date().toISOString() });
      return d;
    });
    setSavedId(id);
  }

  const influencers = db.characters.filter((c) => c.kind === 'influencer');

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>🌟 Character Builder</h3>
        <button className="btn ghost small" onClick={shuffle}>🎲 Shuffle</button>
      </div>
      <p className="sub" style={{ fontSize: 12 }}>Pick from {CATEGORIES.length} categories — no prompt writing needed. Add your own face for a personal influencer. Saved influencers appear in Characters and can be tagged anywhere with @Name.</p>
      <div className="builder-grid">
        {CATEGORIES.map(([k, label, opts]) => (
          <div key={k}>
            <label>{label}</label>
            <select value={traits[k]} onChange={(e) => setTraits((t) => ({ ...t, [k]: e.target.value }))}>
              {opts.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>
      <label>Anything else (optional)</label>
      <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. small scar on left eyebrow, always wears a red scarf" />
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn ghost small" onClick={async () => { const picked = await window.api.pickImages(); setFace((f) => [...f, ...picked].slice(0, 6)); }}>🙂 Add your face</button>
        <span className="sub" style={{ margin: 0 }}>{face.length ? face.length + ' face photo(s) — a ref-capable model is preselected' : 'optional'}</span>
        {face.length > 0 && <button className="btn ghost small" onClick={() => setFace([])}>Clear</button>}
      </div>
      <label>Model</label>
      <select value={model?.id || ''} onChange={(e) => setModelId(e.target.value)}>
        {models.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, rdy)}{m.refInput ? ' · refs' : ''}</option>)}
      </select>
      <ModelStatus model={model} />
      <GenSettings value={gen} onChange={setGen} kind="image" source={model?.provider === 'local' ? 'local' : 'cloud'} />
      <p className="sub" style={{ fontSize: 11 }}>Prompt preview: {desc}</p>
      <RunButton job={job} label="✦ Generate influencer" onRun={generate} disabled={!model || !gate.ok} />
      <ErrorBox error={error} />
      {result && (
        <div className="result-box">
          <Media file={result} kind="image" controls />
          {!savedId ? (
            <div className="row" style={{ marginTop: 8 }}>
              <input style={{ flex: 1 }} placeholder="Name your influencer (e.g. Zara)" value={name} onChange={(e) => setName(e.target.value)} />
              <button className="btn small" disabled={!name.trim()} onClick={save}>Save influencer</button>
            </div>
          ) : (
            <div className="row" style={{ marginTop: 8 }}>
              <span className="ok" style={{ margin: 0 }}>✓ Saved — use @{name.trim().replace(/\s+/g, '_')} in any prompt</span>
              <button className="btn small" onClick={() => go('create', { kind: 'image', charId: savedId })}>✦ Create a post</button>
              <button className="btn ghost small" onClick={() => go('create', { kind: 'video', charId: savedId, refs: [result] })}>🎬 Make a reel</button>
              <button className="btn ghost small" title="Put this character into an existing video" onClick={() => go('genjutsu', { refs: [result], mode: 'motion' })}>🌀 Use in Shapeshift</button>
            </div>
          )}
        </div>
      )}
      {influencers.length > 0 && (
        <>
          <h3>Your influencers ({influencers.length})</h3>
          <div className="row">
            {influencers.map((c) => (
              <button key={c.id} className="chip" title={c.description} onClick={() => go('create', { kind: 'image', charId: c.id })}>🌟 {c.name}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
