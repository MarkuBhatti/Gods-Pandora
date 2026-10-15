import React, { useState } from 'react';
import market from '../../data/aiMarket.json';

// 🌐 The AI Market — every major AI model category on earth, API and open-source.
export default function AiMarket() {
  const [access, setAccess] = useState('all');
  const [q, setQ] = useState('');
  const total = market.categories.reduce((n, c) => n + c.entries.length, 0);
  return (
    <div>
      <h1>🌐 Pandora AI Market</h1>
      <p className="sub">The whole landscape in one place — {total} models across {market.categories.length} categories, from chat to robotics to protein folding. Filter by access, click through to docs or weights. This is the eye that sees everything.</p>
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
                  <a href={e.link} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--gold)' }}>open ↗</a>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
