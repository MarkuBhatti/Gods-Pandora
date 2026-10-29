import React, { useState } from 'react';
import market from '../../data/aiMarket.json';
import { useNav } from '../lib/nav.jsx';

// open-source entries install inside Pandora: jump to Models with the search pre-filled (3D models: Generate 3D in 3D & Spatial)
const HFCAT = { llm: 'llm', vision: 'llm', image: 'image', video: 'video', audio: 'audio', music: 'audio', speech: 'audio', voice: 'audio', '3d': '3d', threed: '3d', code: 'llm', avatar: 'video', embed: 'llm', translate: 'llm', docs: 'llm' };
function getInPandora(go, e, cat) {
  const q = String(e.name).split(/[\/(]/)[0].trim();
  try { localStorage.setItem('ge.market.source', JSON.stringify('everywhere')); localStorage.setItem('ge.market.everyq', JSON.stringify(q)); localStorage.setItem('ge.market.everycat', JSON.stringify(HFCAT[cat] || 'all')); } catch (_) { /* */ }
  go('market');
}

// 🌐 The AI Market — every major AI model category on earth, API and open-source.
export default function AiMarket() {
  const { go } = useNav();
  const [access, setAccess] = useState('all');
  const [q, setQ] = useState('');
  const total = market.categories.reduce((n, c) => n + c.entries.length, 0);
  return (
    <div>
      <h1>🌐 Pandora AI Market</h1>
      <p className="sub">The whole landscape in one place — {total} models across {market.categories.length} categories, from chat to robotics to protein folding. Filter by access, click through to docs or weights. Every model. Every medium. One creative universe.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        {[['all', 'All'], ['api', '☁ API'], ['open', '⬇ Open-source']].map(([v, l]) => (
          <button key={v} className={'chip' + (access === v ? ' on' : '')} onClick={() => setAccess(v)}>{l}</button>
        ))}
        <input style={{ maxWidth: 260 }} placeholder="Search models…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {market.categories.map((c) => {
        const items = c.entries.filter((e) => (access === 'all' || e.access === access) && (!q || (e.name + e.org).toLowerCase().includes(q.toLowerCase())));
        if (!items.length) return null;
        return (
          <div key={c.id}>
            <h3>{c.icon} {c.name} ({items.length})</h3>
            <div className="grid" style={{ marginBottom: 8 }}>
              {items.map((e) => (
                <div key={e.name} className="card" style={{ padding: 12 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 13 }}>{e.name}</strong>
                    <span className="badge" style={{ color: e.access === 'open' ? 'var(--gold)' : '#ff8a95' }}>{e.access === 'open' ? '⬇ open' : '☁ api'}</span>
                  </div>
                  <p className="sub" style={{ margin: '4px 0', fontSize: 11.5 }}>{e.org}</p>
                  <div className="row" style={{ gap: 6 }}>
                    {e.access === 'open' && <button className="btn small" style={{ fontSize: 11, padding: '3px 9px' }} onClick={() => getInPandora(go, e, c.id)}>⬇ Get in Pandora</button>}
                    <a href={e.link} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--gold)' }}>{e.access === 'open' ? 'page ↗' : 'open ↗'}</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
