import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import Media from '../lib/Media.jsx';
import AssetActions from '../lib/AssetActions.jsx';

export default function Library() {
  const { db, update } = useStore();
  const [kind, setKind] = useState('all');
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [view, setView] = useState(-1); // lightbox index into list

  const people = useMemo(() => {
    const s = new Set();
    db.generations.forEach((g) => { if (g.character) s.add('☺ ' + g.character); if (g.location) s.add('⌖ ' + g.location); (g.mentions || []).forEach((m) => s.add('@' + m)); });
    return [...s].sort();
  }, [db.generations]);

  const list = db.generations.filter((g) => {
    if (kind !== 'all' && g.kind !== kind) return false;
    if (favOnly && !g.fav) return false;
    if (q && !(g.prompt || '').toLowerCase().includes(q.toLowerCase()) && !(g.model || '').toLowerCase().includes(q.toLowerCase())) return false;
    if (who) {
      const tag = who.slice(2);
      if (who.startsWith('☺') && g.character !== tag) return false;
      if (who.startsWith('⌖') && g.location !== tag) return false;
      if (who.startsWith('@') && !(g.mentions || []).includes(who.slice(1))) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between' }}><h1>Pandora Gallery</h1><button className="btn ghost small" title="Images, Videos, Audio, 3D… each in its own folder" onClick={() => window.api.libraryFolder()}>📁 Open library folder</button></div>
      <p className="sub">Everything you've generated, saved locally. Remix, animate, extend, or save any result into a character, location or product so it stays connected everywhere.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        {['all', 'image', 'video', 'audio', '3d'].map((k) => (
          <button key={k} className={'chip' + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>{k}</button>
        ))}
        <select style={{ width: 220 }} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">All characters / locations</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input style={{ flex: 1, minWidth: 160 }} placeholder="Search prompts or models…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={'chip' + (favOnly ? ' on' : '')} onClick={() => setFavOnly((v) => !v)}>★ Favorites</button>
        <span className="sub">{list.length} / {db.generations.length}</span>
      </div>
      <div className="grid">
        {list.map((g) => (
          <div key={g.id} className="card" style={{ padding: 10 }}>
            <div className="lib-thumb" onClick={() => setView(list.indexOf(g))} title="Open large (← → to browse)">
              <Media file={g.file} kind={g.kind} />
              <button className={'fav' + (g.fav ? ' on' : '')} title="Favorite" onClick={(e) => { e.stopPropagation(); update((d) => { const x = d.generations.find((y) => y.id === g.id); if (x) x.fav = !x.fav; return d; }); }}>★</button>
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="row" style={{ gap: 4 }}>
                <span className="badge">{g.kind}</span>
                {g.location && <span className="badge" style={{ color: 'var(--accent2)' }}>⌖ {g.location}</span>}
                {g.character && <span className="badge">☺ {g.character}</span>}
                {(g.mentions || []).map((m) => <span key={m} className="badge">@{m}</span>)}
                {g.camera && <span className="badge">🎥 {g.camera}</span>}
              </div>
              <p className="sub" style={{ margin: '6px 0' }} title={g.prompt}>{(g.prompt || '').slice(0, 80)}</p>
              <AssetActions file={g.file} kind={g.kind} prompt={g.prompt} />
              <div className="row" style={{ marginTop: 4 }}>
                <button className="btn ghost small" title="Import into DaVinci Resolve media pool" onClick={() => window.api.resolveSend([g.file])}>→ Resolve</button>
                <button className="btn ghost small" title="Copy prompt" onClick={() => navigator.clipboard?.writeText(g.prompt || '')}>⧉ Prompt</button>
                <button className="btn danger small" title="Remove from Library (the file stays on disk)" onClick={() => { if (window.confirm('Remove this from your Library? (The file stays on disk.)')) update((d) => { d.generations = d.generations.filter((x) => x.id !== g.id); return d; }); }}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {db.generations.length === 0 && <p className="sub">Nothing yet — go create something.</p>}
      {view >= 0 && list[view] && <Lightbox items={list} index={view} onIndex={setView} onClose={() => setView(-1)} />}
    </div>
  );
}

function Lightbox({ items, index, onIndex, onClose }) {
  const g = items[index];
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex(Math.min(items.length - 1, index + 1));
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [index, items.length]);
  return (
    <div className="lightbox" onClick={onClose}>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <Media file={g.file} kind={g.kind} controls />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <span className="sub" style={{ maxWidth: '70%' }}>{g.prompt}</span>
          <span className="row" style={{ gap: 6 }}>
            <span className="sub">{index + 1} / {items.length}</span>
            <button className="btn ghost small" disabled={index === 0} onClick={() => onIndex(index - 1)}>←</button>
            <button className="btn ghost small" disabled={index === items.length - 1} onClick={() => onIndex(index + 1)}>→</button>
            <button className="btn ghost small" onClick={() => window.api.reveal(g.file)}>📁 File location</button>
            <button className="btn small" onClick={onClose}>✕ Close</button>
          </span>
        </div>
        <div style={{ marginTop: 6 }}><AssetActions file={g.file} kind={g.kind} prompt={g.prompt} compact /></div>
      </div>
    </div>
  );
}
