import React, { useState } from 'react';
import stylesData from '../../data/stylePresets.json';
import colorTheory from '../../data/colorTheory.json';
import { useStore, uid } from '../lib/store.jsx';

// Visual style library: curated presets + your own saved styles (name + style language).
export default function Styles() {
  const { db, update } = useStore();
  const custom = db.styles || [];
  const [name, setName] = useState('');
  const [promptText, setPromptText] = useState('');
  const cats = [...new Set(stylesData.presets.map((s) => s.category))];

  function save() {
    if (!name.trim() || !promptText.trim()) return;
    update((d) => { d.styles = [...(d.styles || []), { id: uid(), name: name.trim(), promptText: promptText.trim(), category: 'Custom' }]; return d; });
    setName(''); setPromptText('');
  }

  return (
    <div>
      <h1>Pandora Styles</h1>
      <p className="sub">Curated style samples plus your own. A style is a locked visual language — pick it in Create, any Studio, or as a Film Studio project style.</p>

      <div className="card" style={{ maxWidth: 640, marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>New custom style</h3>
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Brand Look" />
        <label>Style language (appended to every prompt that uses it)</label>
        <textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} placeholder="e.g. soft pastel palette, grainy 16mm, centered composition, brand colors #FF5A00 and cream…" />
        <div style={{ marginTop: 12 }}><button className="btn" onClick={save} disabled={!name.trim() || !promptText.trim()}>Save style</button></div>
      </div>

      {custom.length > 0 && (<>
        <h3>Your styles ({custom.length})</h3>
        <div className="grid">
          {custom.map((s) => (
            <div key={s.id} className="card">
              <strong>{s.name}</strong>
              <p className="sub" style={{ margin: '6px 0' }}>{s.promptText.slice(0, 100)}</p>
              <button className="btn danger small" onClick={() => update((d) => { d.styles = d.styles.filter((x) => x.id !== s.id); return d; })}>Delete</button>
            </div>
          ))}
        </div>
      </>)}

      <h3>🎨 Color schemes in film ({colorTheory.schemes.length}) — usable in every studio</h3>
      <div className="grid">
        {colorTheory.schemes.map((c) => (
          <div key={c.id} className="card">
            <strong>{c.name}</strong>
            <p className="sub" style={{ margin: '6px 0' }}>{c.desc}</p>
            <p className="sub" style={{ margin: 0, color: 'var(--gold)' }}>{c.examples}</p>
          </div>
        ))}
      </div>

      <h3>Psychology of color ({colorTheory.psychology.length})</h3>
      <div className="grid">
        {colorTheory.psychology.map((c) => (
          <div key={c.color} className="card">
            <div className="row"><span className="swatch" style={{ background: c.hex, width: 22, height: 22 }} /><strong>{c.color}</strong></div>
            <p className="sub" style={{ margin: '8px 0 0' }}>{c.emotions.join(' · ')}</p>
          </div>
        ))}
      </div>

      {cats.map((cat) => (
        <div key={cat}>
          <h3>{cat}</h3>
          <div className="grid">
            {stylesData.presets.filter((s) => s.category === cat).map((s) => (
              <div key={s.id} className="card">
                <strong>{s.name}</strong>
                <p className="sub" style={{ margin: '6px 0 0' }}>{s.promptText}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
