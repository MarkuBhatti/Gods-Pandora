import React, { useEffect, useState } from 'react';
import { useStore, uid } from '../lib/store.jsx';
import { useNav } from '../lib/nav.jsx';
import SoulTrainer from '../lib/SoulTrainer.jsx';

const MAX_REFS = 14; // modern edit models take up to 10–14 references

const COPY = {
  characters: { one: 'character', namePh: 'e.g. Maya', descPh: 'Face, hair, age, build, signature clothing…' },
  locations: { one: 'location', namePh: 'e.g. Neon Alley, Grandma’s Kitchen', descPh: 'Be exhaustive: architecture, layout, furniture, props, materials, colors, era, lighting mood…' },
  products: { one: 'product', namePh: 'e.g. Aurora Serum 30ml', descPh: 'Shape, materials, colors, logo placement, label text, size, packaging…' },
};

// Shared CRUD for Characters, Locations (Location Lock) and Products — all usable everywhere via @Name.
export default function EntityLibrary({ kind, title, subtitle }) {
  const { db, update } = useStore();
  const items = db[kind] || [];
  const c = COPY[kind] || COPY.characters;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [refs, setRefs] = useState([]);
  const [signatureColor, setSignatureColor] = useState('');
  const [libPick, setLibPick] = useState(false);

  async function addRefs() {
    const picked = await window.api.pickImages();
    setRefs((r) => [...r, ...picked].slice(0, MAX_REFS));
  }

  function save() {
    if (!name.trim()) return;
    update((d) => {
      d[kind] = d[kind] || [];
      d[kind].push({ id: uid(), name: name.trim(), description: description.trim(), refs, signatureColor: signatureColor.trim(), createdAt: new Date().toISOString() });
      return d;
    });
    setName(''); setDescription(''); setRefs([]); setSignatureColor('');
  }

  const patch = (id, fn) => update((d) => { const e = (d[kind] || []).find((x) => x.id === id); if (e) fn(e); return d; });
  const remove = (id) => update((d) => { d[kind] = d[kind].filter((x) => x.id !== id); return d; });

  return (
    <div>
      <h1>{title}</h1>
      <p className="sub">{subtitle} Type <code>@Name</code> in any prompt (Create, Studios, Film) to pull it in with its reference images.</p>

      <div className="card" style={{ maxWidth: 680 }}>
        <h3 style={{ marginTop: 0 }}>New {c.one}</h3>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={c.namePh} />
        <label>Description (used to lock consistency in prompts)</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={c.descPh} />
        {kind !== 'products' && (
          <>
            <label>Signature color (optional — follows this {c.one} through every frame, like the Bride's yellow in Kill Bill)</label>
            <input value={signatureColor} onChange={(e) => setSignatureColor(e.target.value)} placeholder="e.g. canary yellow, Joker purple, oxblood red" />
          </>
        )}
        <label>Reference images (up to {MAX_REFS} — sent to models that accept image refs)</label>
        <div className="row">
          <button className="btn ghost small" onClick={addRefs}>+ From computer</button>
          <button className="btn ghost small" onClick={() => setLibPick((v) => !v)}>+ From Library</button>
          <span className="sub" style={{ margin: 0 }}>{refs.length} selected</span>
        </div>
        {refs.length > 0 && <Thumbs files={refs} onRemove={(i) => setRefs((r) => r.filter((_, j) => j !== i))} />}
        {libPick && <LibraryPicker db={db} selected={refs} onPick={(f) => setRefs((r) => (r.includes(f) ? r.filter((x) => x !== f) : [...r, f].slice(0, MAX_REFS)))} />}
        <div style={{ marginTop: 14 }}>
          <button className="btn" onClick={save} disabled={!name.trim()}>Save</button>
        </div>
      </div>

      <h3>Saved ({items.length})</h3>
      <div className="grid">
        {items.map((it) => <EntityCard key={it.id} kind={kind} item={it} db={db} patch={patch} onRemove={() => remove(it.id)} />)}
      </div>
    </div>
  );
}

function Thumb({ file, onRemove, onClick, selected }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { let ok = true; window.api.dataUrl(file).then((d) => ok && setSrc(d)).catch(() => {}); return () => { ok = false; }; }, [file]);
  return (
    <div className={'ref-thumb' + (selected ? ' sel' : '')} onClick={onClick}>
      {src ? <img src={src} alt="" /> : <div className="thumb" />}
      {onRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(); }}>×</button>}
    </div>
  );
}

function Thumbs({ files, onRemove }) {
  return <div className="ref-thumbs">{files.map((f, i) => <Thumb key={f + i} file={f} onRemove={onRemove ? () => onRemove(i) : null} />)}</div>;
}

function LibraryPicker({ db, selected, onPick }) {
  const imgs = db.generations.filter((g) => g.kind === 'image').slice(0, 60);
  if (!imgs.length) return <p className="sub">No images in your Library yet.</p>;
  return (
    <div className="ref-thumbs picker">
      {imgs.map((g) => <Thumb key={g.id} file={g.file} selected={selected.includes(g.file)} onClick={() => onPick(g.file)} />)}
    </div>
  );
}

function EntityCard({ kind, item, db, patch, onRemove }) {
  const { go } = useNav();
  const [edit, setEdit] = useState(false);
  const [libPick, setLibPick] = useState(false);
  const uses = db.generations.filter((g) => g.characterId === item.id || g.locationId === item.id || (g.mentions || []).includes(item.name)).length;
  const tag = '@' + String(item.name).trim().replace(/\s+/g, '_');
  const addFromDisk = async () => { const p = await window.api.pickImages(); patch(item.id, (e) => { e.refs = [...(e.refs || []), ...p].slice(0, MAX_REFS); }); };
  const openCreate = (k) => go('create', {
    kind: k,
    ...(kind === 'characters' ? { charId: item.id } : kind === 'locations' ? { locId: item.id } : { prompt: tag + ' ' }),
  });
  return (
    <div className="card entity-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{item.name}</strong>
        <span className="row" style={{ gap: 4 }}>
          {item.kind === 'influencer' && <span className="badge">🌟 influencer</span>}
          {item.soulId && <span className="badge" style={{ color: '#00ff88' }}>🧬 Identity Lock</span>}
          <span className="badge">{(item.refs || []).length} refs</span>
        </span>
      </div>
      {(item.refs || []).length > 0 && <Thumbs files={(item.refs || []).slice(0, edit ? MAX_REFS : 4)} onRemove={edit ? (i) => patch(item.id, (e) => { e.refs.splice(i, 1); }) : null} />}
      {edit ? (
        <>
          <textarea value={item.description || ''} onChange={(e) => patch(item.id, (x) => { x.description = e.target.value; })} />
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn ghost small" onClick={addFromDisk}>+ Images</button>
            <button className="btn ghost small" onClick={() => setLibPick((v) => !v)}>+ From Library</button>
          </div>
          {libPick && <LibraryPicker db={db} selected={item.refs || []} onPick={(f) => patch(item.id, (e) => { e.refs = (e.refs || []).includes(f) ? e.refs.filter((x) => x !== f) : [...(e.refs || []), f].slice(0, MAX_REFS); })} />}
        </>
      ) : (
        <p className="sub" style={{ margin: '8px 0' }}>{(item.description || '').slice(0, 110)}</p>
      )}
      {kind === 'characters' && <SoulTrainer item={item} onSaved={(soul) => patch(item.id, (e) => { e.soulId = soul; })} />}
      <div className="sub" style={{ fontSize: 11 }}><code>{tag}</code> · used in {uses} generation{uses === 1 ? '' : 's'}</div>
      <div className="row" style={{ marginTop: 8, gap: 4 }}>
        <button className="btn small" onClick={() => openCreate('image')}>✦ Image</button>
        <button className="btn ghost small" onClick={() => openCreate('video')}>🎬 Video</button>
        <button className="btn ghost small" onClick={() => setEdit((v) => !v)}>{edit ? 'Done' : 'Edit'}</button>
        <button className="btn danger small" onClick={() => { if (window.confirm('Delete ' + item.name + '?')) onRemove(); }}>Delete</button>
      </div>
    </div>
  );
}
