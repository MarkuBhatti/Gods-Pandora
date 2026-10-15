import React, { useEffect, useState } from 'react';

// ⚒ App Forge — describe an app or game, God's Pandora writes it (Claude API or a local
// code model) as a runnable single-file HTML app with live preview.
export default function Forge() {
  const [desc, setDesc] = useState('');
  const [name, setName] = useState('');
  const [engine, setEngine] = useState('claude');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [html, setHtml] = useState('');
  const [saved, setSaved] = useState([]);

  const refresh = () => window.api.forge.list().then(setSaved);
  useEffect(() => { refresh(); }, []);

  async function build() {
    setBusy(true); setError(''); setHtml('');
    try {
      const out = await window.api.claude({
        system: 'You are an expert app and game developer. Return ONLY a complete, self-contained single-file HTML document (inline CSS + JS, no external dependencies except public CDNs). No explanations, no markdown fences — just the raw HTML starting with <!doctype html>.',
        prompt: `Build this ${desc.length < 200 ? 'app/game' : 'application'}:\n\n${desc}\n\nPolished dark UI, fully working, keyboard + mouse support where relevant.`,
        maxTokens: 32000
      });
      const clean = out.replace(/^```html?\s*/i, '').replace(/```\s*$/, '').trim();
      if (!/^<!doctype html>/i.test(clean) && !/^<html/i.test(clean)) throw new Error('Model did not return an HTML document — try again or refine the description.');
      setHtml(clean);
    } catch (e) { setError(String(e.message || e)); }
    setBusy(false);
  }

  async function save() {
    const file = await window.api.forge.save(name || desc.slice(0, 30), html);
    refresh();
    window.api.reveal(file);
  }

  async function load(file) {
    setHtml(await window.api.forge.read(file));
  }

  return (
    <div>
      <h1>⚒ Pandora App Forge</h1>
      <p className="sub">Describe an app or game — God's Pandora builds it as a runnable single-file app using Claude (your Anthropic key) with live preview. Games, tools, calculators, dashboards, prototypes.</p>

      <div className="two-col">
        <div className="card">
          <label>What should it build?</label>
          <textarea style={{ minHeight: 120 }} value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. A neon-styled Snake game with touch controls and a high-score board… or a mortgage calculator with charts… or a Pomodoro timer with sounds" />
          <label>App name (for saving)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-snake-game" />
          <label>Engine</label>
          <div className="row">
            <button className={'chip' + (engine === 'claude' ? ' on' : '')} onClick={() => setEngine('claude')}>Claude API</button>
            <button className="chip" title="Roadmap: local code models (Ollama / llama.cpp)" disabled>Local model (soon)</button>
          </div>
          <div style={{ marginTop: 14 }} className="row">
            <button className="btn" disabled={busy || !desc.trim()} onClick={build}>{busy ? 'Forging…' : 'Forge it'}</button>
            {html && <button className="btn ghost" onClick={save}>Save app</button>}
          </div>
          {error && <div className="err">{error}</div>}

          {saved.length > 0 && (<>
            <h3>Saved apps ({saved.length})</h3>
            <div className="row">
              {saved.map((s) => (
                <button key={s.file} className="chip" onClick={() => load(s.file)}>{s.name.replace(/\.html$/, '')}</button>
              ))}
            </div>
          </>)}
        </div>

        <div className="card" style={{ padding: 8 }}>
          <h3 style={{ margin: '6px 8px' }}>Live preview</h3>
          {html
            ? <iframe title="forge-preview" srcDoc={html} sandbox="allow-scripts allow-pointer-lock" style={{ width: '100%', height: 560, border: '1px solid var(--border)', borderRadius: 8, background: '#000' }} />
            : <div className="sub" style={{ padding: 20 }}>{busy ? 'Claude is writing your app…' : 'Your app appears here.'}</div>}
        </div>
      </div>
    </div>
  );
}
