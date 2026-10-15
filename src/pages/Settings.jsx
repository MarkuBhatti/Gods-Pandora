import React, { useEffect, useState } from 'react';
import registry from '../../data/providers.json';

const FREE_COUNT = registry.providers.filter((p) => p.hint?.includes('🆓')).length;

export default function Settings() {
  const [saved, setSaved]   = useState({});
  const [draft, setDraft]   = useState({});
  const [msg, setMsg]       = useState('');
  const [filter, setFilter] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);

  const refresh = () => window.api.keysList().then(setSaved);
  useEffect(() => { refresh(); }, []);

  async function save(p) {
    await window.api.keysSet(p, draft[p] || '');
    setDraft((d) => ({ ...d, [p]: '' }));
    setMsg(`✓ Saved ${p} key — encrypted in your OS keychain.`);
    refresh();
  }

  const provs = registry.providers.filter((p) => {
    const matchText = !filter || (p.name + p.hint + p.category).toLowerCase().includes(filter.toLowerCase());
    const matchFree = !freeOnly || p.hint?.includes('🆓');
    return matchText && matchFree;
  });

  const categories = [...new Set(provs.map((p) => p.category))].sort();

  return (
    <div>
      <h1>Pandora Cloud — API Keys</h1>
      <p className="sub">
        {registry.providers.length} providers · {FREE_COUNT} with free tiers · Bring your own keys — you pay each provider directly, zero markup.
        Keys are encrypted with your OS keychain and never leave your machine.
        🆓 = has a free tier you can start with right now.
      </p>

      <div className="row" style={{ marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <input
          style={{ flex: 1, minWidth: 200, maxWidth: 440 }}
          placeholder="Search providers…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          className={'btn small' + (freeOnly ? '' : ' ghost')}
          onClick={() => setFreeOnly((v) => !v)}
        >
          🆓 Free tier only
        </button>
        <button className="btn ghost small" onClick={() => { setFilter(''); setFreeOnly(false); }}>
          Clear
        </button>
      </div>

      {categories.map((cat) => {
        const catProvs = provs.filter((x) => x.category === cat);
        return (
          <div key={cat}>
            <h3>{cat} <span style={{ opacity: .5, fontWeight: 400 }}>({catProvs.length})</span></h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 10, marginBottom: 8 }}>
              {catProvs.map((p) => (
                <div key={p.id} className="card" style={{ marginBottom: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong style={{ fontSize: 13 }}>
                      {p.name}
                      {p.active && <span className="badge" style={{ color: 'var(--gold)', marginLeft: 6 }}>active</span>}
                    </strong>
                    {saved[p.id] && <span className="badge" style={{ color: 'var(--accent)' }}>✓ saved</span>}
                  </div>
                  <p className="sub" style={{ margin: '0 0 8px', fontSize: 11.5, lineHeight: 1.45 }}>
                    {p.hint}
                    {' · '}
                    <a href={p.keyUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                      get key ↗
                    </a>
                  </p>
                  <div className="row" style={{ gap: 6 }}>
                    <input
                      style={{ flex: 1, fontSize: 12 }}
                      type="password"
                      placeholder="Paste API key…"
                      value={draft[p.id] || ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                    />
                    <button className="btn small" onClick={() => save(p.id)} disabled={!draft[p.id]}>Save</button>
                    {saved[p.id] && (
                      <button className="btn danger small" onClick={async () => { await window.api.keysSet(p.id, ''); refresh(); }}>×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {msg && <div className="ok" style={{ marginTop: 12 }}>{msg}</div>}

      <div className="card" style={{ marginTop: 16, maxWidth: 640 }}>
        <strong>🎞 DaVinci Resolve</strong>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          No key needed — keep Resolve running and use "Send to Resolve" on any generation to drop it straight into your project's media pool via Resolve's scripting API.
        </p>
      </div>
    </div>
  );
}
