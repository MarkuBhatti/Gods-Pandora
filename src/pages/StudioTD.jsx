import ToolArt from '../lib/ToolArt.jsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import templates from '../../data/tdTemplates.json';
import { uid } from '../lib/store.jsx';
import Media from '../lib/Media.jsx';
import GuideBook from './GuideBook.jsx';

const CATEGORIES = ['All', ...Array.from(new Set(templates.templates.map((t) => t.category)))];

// ── Connection status pill ──────────────────────────────────────────────────
function StatusPill({ osc, ws }) {
  const both = osc && ws;
  const none = !osc && !ws;
  const col = both ? '#2ecc71' : none ? '#e74c3c' : '#e67e22';
  const label = both ? '● OSC + WS Connected' : none ? '○ Disconnected' : osc ? '◑ OSC only' : '◑ WS only';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: col, background: col + '18', border: '1px solid ' + col + '44', borderRadius: 20, padding: '3px 10px', letterSpacing: 1 }}>
      {label}
    </span>
  );
}

// ── Parameter slider row ────────────────────────────────────────────────────
function ParamRow({ param, value, onChange, onSend }) {
  if (param.type === 'int' && param.options) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11.5, color: '#dff0f8', fontWeight: 600 }}>{param.label}</span>
          <span style={{ fontSize: 10, color: '#b7b2dc' }}>{param.address}</span>
        </div>
        <select
          value={value ?? param.default}
          onChange={(e) => { onChange(Number(e.target.value)); onSend(param.address, Number(e.target.value)); }}
          style={{ width: '100%', background: '#0a1a24', border: '1px solid rgba(139,107,255,.2)', color: '#dff0f8', borderRadius: 5, padding: '4px 8px', fontSize: 12 }}
        >
          {param.options.map((o, i) => <option key={i} value={i}>{o}</option>)}
        </select>
      </div>
    );
  }
  const v = value ?? param.default;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11.5, color: '#dff0f8', fontWeight: 600 }}>{param.label}</span>
        <span style={{ fontSize: 10.5, color: '#8b6bff', minWidth: 36, textAlign: 'right' }}>{v.toFixed(2)}</span>
      </div>
      <input
        type="range" min={0} max={1} step={0.01} value={v}
        onChange={(e) => { const n = parseFloat(e.target.value); onChange(n); onSend(param.address, n); }}
        style={{ width: '100%', accentColor: '#8b6bff', height: 4, cursor: 'pointer' }}
      />
      <div style={{ fontSize: 9, color: '#2a4a5a', marginTop: 1 }}>{param.address}</div>
    </div>
  );
}

// ── Template card ────────────────────────────────────────────────────────────
function TemplateCard({ tmpl, onSelect, onLaunch }) {
  const catColors = {
    'Generative': '#9b59b6', 'Audio-Visual': '#e67e22', 'Shader Art': '#3498db',
    'AI Generative': '#e74c3c', 'Simulation': '#1abc9c', '3D': '#8b6bff', 'Data Visual': '#2ecc71'
  };
  const col = catColors[tmpl.category] || '#8b6bff';
  return (
    <div className="card tool-card-lite" style={{ cursor: 'pointer', padding: 14, transition: 'border-color .2s' }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = col}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = ''}
    >
      <ToolArt tool={{ id: tmpl.name || tmpl.title || tmpl.id, name: tmpl.name || tmpl.title, desc: (tmpl.description || tmpl.desc || '') + ' ' + (tmpl.category || ''), kind: 'td', imageInputs: [] }} />
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{tmpl.icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: col, background: col + '18', border: '1px solid ' + col + '44', borderRadius: 10, padding: '2px 8px' }}>{tmpl.category}</span>
      </div>
      <div style={{ fontWeight: 700, color: '#dff0f8', fontSize: 14, marginBottom: 4 }}>{tmpl.name}</div>
      <div style={{ fontSize: 11.5, color: '#b7b2dc', lineHeight: 1.5, marginBottom: 10 }}>{tmpl.desc.slice(0, 100)}…</div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {tmpl.tags.slice(0, 4).map((t) => (
          <span key={t} style={{ fontSize: 9, color: '#b7b2dc', background: 'rgba(139,107,255,.05)', border: '1px solid rgba(139,107,255,.1)', borderRadius: 8, padding: '1px 6px' }}>{t}</span>
        ))}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn small" style={{ flex: 1, fontSize: 11 }} onClick={() => onSelect(tmpl)}>🎛 Control</button>
        <button className="btn ghost small" style={{ flex: 1, fontSize: 11 }} onClick={() => onLaunch(tmpl)}>▶ Launch TD</button>
      </div>
    </div>
  );
}

// ── Output gallery item ──────────────────────────────────────────────────────
function OutputThumb({ file, onReveal }) {
  const ext = (file.split('.').pop() || '').toLowerCase();
  const isVideo = ['mp4', 'webm', 'mov'].includes(ext);
  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(139,107,255,.15)' }}>
      {isVideo
        ? <video src={'media://' + file} style={{ width: '100%', height: 90, objectFit: 'cover' }} muted autoPlay loop />
        : <img src={'media://' + file} alt="" style={{ width: '100%', height: 90, objectFit: 'cover' }} onError={(e) => { e.target.style.opacity = 0.2; }} />
      }
      <button onClick={() => onReveal(file)} style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,.7)', border: 'none', color: '#8b6bff', borderRadius: 4, fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}>↗</button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function StudioTD() {
  // Connection state
  const [status, setStatus]   = useState({ osc: false, ws: false, outputFolder: null });
  const [config, setConfig]   = useState({
    oscHost: '127.0.0.1', oscSendPort: 7000, oscRecvPort: 7001,
    wsPort: 9980, tdExePath: 'C:\\Program Files\\Derivative\\TouchDesigner\\bin\\TouchDesigner.exe'
  });
  const [showConfig, setShowConfig] = useState(false);
  const [showGuide, setShowGuide]   = useState(false);
  const [connBusy, setConnBusy]     = useState(false);

  // Template browsing
  const [category, setCategory]     = useState('All');
  const [search, setSearch]         = useState('');
  const [activeTmpl, setActiveTmpl] = useState(null);

  // Parameters — per template, per param address
  const [params, setParams]         = useState({});

  // AI control
  const [aiPrompt, setAiPrompt]     = useState('');
  const [aiBusy, setAiBusy]         = useState(false);
  const [aiLog, setAiLog]           = useState('');

  // WS prompt for AI Diffusion
  const [sdPrompt, setSdPrompt]     = useState('');
  const [sdNeg, setSdNeg]           = useState('');

  // Output renders from TD
  const [renders, setRenders]       = useState([]);
  const [outputFolder, setOutputFolder] = useState('');

  // OSC activity log
  const [oscLog, setOscLog]         = useState([]);
  const oscLogRef = useRef([]);

  // ── Connect / disconnect ──
  async function connect() {
    setConnBusy(true);
    try {
      const r = await window.api.td.connect(config);
      setStatus(r.status || { osc: false, ws: false });
    } catch (e) { console.error(e); }
    setConnBusy(false);
  }
  async function disconnect() {
    try { await window.api.td.disconnect(); setStatus({ osc: false, ws: false }); } catch (_) {}
  }

  // Poll status every 3s
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const s = await window.api.td.status();
        setStatus(s);
      } catch (_) {}
    }, 3000);
    return () => clearInterval(t);
  }, []);

  // Listen for output files from watched folder
  useEffect(() => {
    if (!window.api.td.onRender) return;
    const unsub = window.api.td.onRender((file) => {
      setRenders((r) => [file, ...r].slice(0, 40));
    });
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, []);

  // ── Set output folder ──
  async function pickOutputFolder() {
    try {
      const folder = await window.api.td.pickOutputFolder();
      if (folder) setOutputFolder(folder);
    } catch (_) {}
  }
  async function watchFolder() {
    if (!outputFolder) return;
    await window.api.td.watchOutput(outputFolder);
    setStatus((s) => ({ ...s, outputFolder }));
  }

  // ── OSC send ──
  function sendOSC(address, value) {
    window.api.td.sendOSC(address, value).catch(() => {});
    const entry = '[' + new Date().toLocaleTimeString() + '] ' + address + ' → ' + (typeof value === 'number' ? value.toFixed(3) : value);
    oscLogRef.current = [entry, ...oscLogRef.current].slice(0, 60);
    setOscLog([...oscLogRef.current]);
  }

  function sendTrigger(address) {
    sendOSC(address, 1);
    setTimeout(() => sendOSC(address, 0), 100);
  }

  // ── WS prompt send ──
  function sendSDPrompt() {
    window.api.td.sendWS({ type: 'setPrompt', prompt: sdPrompt, negative: sdNeg });
  }

  // ── Launch TD with template ──
  async function launchTD(tmpl) {
    try {
      const r = await window.api.td.launch(null, config.tdExePath);
      if (!r.ok) alert('Could not launch TouchDesigner:\n' + r.error);
    } catch (e) { alert('Launch failed: ' + e.message); }
  }

  // ── AI control: Claude generates params ──
  async function runAI() {
    if (!activeTmpl || !aiPrompt.trim()) return;
    setAiBusy(true); setAiLog('');
    const paramList = activeTmpl.oscParams.map((p) => p.address + ' [' + p.min + '–' + p.max + '] ' + p.label).join('\n');
    const system = 'You are a TouchDesigner parameter expert. Given a creative description, output ONLY a JSON object mapping OSC addresses to float values (0.0–1.0 unless stated otherwise). No explanation, no markdown, just valid JSON.';
    const prompt = 'Template: ' + activeTmpl.name + '\n\nAvailable OSC parameters:\n' + paramList + '\n\nCreative description: ' + aiPrompt + '\n\nReturn ONLY the JSON parameter map.';
    try {
      const raw = await window.api.claude({ system, prompt, maxTokens: 1000 });
      const json = JSON.parse(raw.replace(/```json|```/g, '').trim());
      // Apply params + send via OSC
      const newParams = { ...(params[activeTmpl.id] || {}) };
      for (const [addr, val] of Object.entries(json)) {
        const p = activeTmpl.oscParams.find((p) => p.address === addr);
        if (p) { newParams[addr] = val; sendOSC(addr, val); }
      }
      setParams((prev) => ({ ...prev, [activeTmpl.id]: newParams }));
      setAiLog('✓ Applied ' + Object.keys(json).length + ' parameters:\n' + JSON.stringify(json, null, 2));
    } catch (e) {
      setAiLog('⚠ ' + e.message);
    }
    setAiBusy(false);
  }

  // ── Filtered template list ──
  const filtered = templates.templates.filter((t) => {
    const matchCat = category === 'All' || t.category === category;
    const q = search.toLowerCase();
    const matchQ = !q || t.name.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q)) || t.desc.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  // ── Config panel ──
  function ConfigPanel() {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>⚙ Bridge Configuration</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            ['TD Host', 'oscHost', 'text', '127.0.0.1'],
            ['OSC Send Port (TD receives)', 'oscSendPort', 'number', '7000'],
            ['OSC Recv Port (TD sends)', 'oscRecvPort', 'number', '7001'],
            ['WebSocket Port (TD WS DAT)', 'wsPort', 'number', '9980'],
          ].map(([lbl, key, type, ph]) => (
            <div key={key}>
              <label style={{ fontSize: 11 }}>{lbl}</label>
              <input type={type} value={config[key]} placeholder={ph}
                onChange={(e) => setConfig((c) => ({ ...c, [key]: type === 'number' ? +e.target.value : e.target.value }))}
                style={{ background: '#0a1a24', border: '1px solid rgba(139,107,255,.2)', color: '#dff0f8', borderRadius: 5, padding: '5px 8px', width: '100%', fontSize: 12 }}
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <label style={{ fontSize: 11 }}>TouchDesigner Executable Path</label>
          <input value={config.tdExePath}
            onChange={(e) => setConfig((c) => ({ ...c, tdExePath: e.target.value }))}
            style={{ background: '#0a1a24', border: '1px solid rgba(139,107,255,.2)', color: '#dff0f8', borderRadius: 5, padding: '5px 8px', width: '100%', fontSize: 11, fontFamily: 'monospace' }}
          />
        </div>
        <div style={{ fontSize: 11, color: '#b7b2dc', marginTop: 6 }}>
          In TouchDesigner, add an <strong style={{ color: '#dff0f8' }}>OSC In CHOP</strong> (port {config.oscSendPort}) and optionally a <strong style={{ color: '#dff0f8' }}>Web Server DAT</strong> (port {config.wsPort}).
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1>⬡ Pandora TouchDesigner Studio</h1>
          <p className="sub">Real-time generative visuals — control TouchDesigner live via OSC + WebSocket, or let AI generate the perfect parameters.</p>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <StatusPill osc={status.osc} ws={status.ws} />
          <button className="btn ghost small" onClick={() => setShowGuide(true)} style={{ fontSize: 12 }}>📖 Guide Book</button>
          <button className="btn ghost small" onClick={() => setShowConfig((s) => !s)}>⚙ Config</button>
          {status.osc
            ? <button className="btn ghost small" style={{ borderColor: '#e74c3c', color: '#e74c3c' }} onClick={disconnect}>Disconnect</button>
            : <button className="btn small" disabled={connBusy} onClick={connect}>{connBusy ? 'Connecting…' : 'Connect'}</button>
          }
        </div>
      </div>

      {showGuide && <GuideBook sectionId="touchdesigner" onClose={() => setShowGuide(false)} />}
      {showConfig && <ConfigPanel />}

      {/* ── How to set up TD ── */}
      {!status.osc && (
        <div className="card" style={{ background: 'rgba(139,107,255,.04)', border: '1px solid rgba(139,107,255,.15)', marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, color: '#8b6bff' }}>🚀 Quick Setup</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {[
              ['1', 'Open TouchDesigner', 'Download free from derivative.ca if needed'],
              ['2', 'Add OSC In CHOP', 'Right-click → Add Operator → CHOP → OSC In. Set port to ' + config.oscSendPort],
              ['3', 'Optional: Web Server DAT', 'Operator → DAT → Web Server DAT. Set port to ' + config.wsPort + ' for bi-directional JSON.'],
              ['4', 'Click Connect', 'Press Connect in God\'s Eye — parameters send to TD instantly.'],
            ].map(([n, title, desc]) => (
              <div key={n} style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(139,107,255,.15)', color: '#8b6bff', fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#dff0f8', marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 11, color: '#b7b2dc' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="two-col">
        <div>
          {/* ── Template browser ── */}
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Template Library</h3>
              <span style={{ fontSize: 11, color: '#b7b2dc' }}>{filtered.length} templates</span>
            </div>
            <input placeholder="Search templates, tags…" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ background: '#0a1a24', border: '1px solid rgba(139,107,255,.2)', color: '#dff0f8', borderRadius: 6, padding: '6px 10px', width: '100%', fontSize: 12, marginBottom: 10 }}
            />
            <div className="row" style={{ flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
              {CATEGORIES.map((c) => (
                <button key={c} className={'chip' + (category === c ? ' on' : '')} onClick={() => setCategory(c)} style={{ fontSize: 10 }}>{c}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {filtered.map((t) => (
                <TemplateCard key={t.id} tmpl={t}
                  onSelect={(tmpl) => { setActiveTmpl(tmpl); setParams((p) => ({ ...p, [tmpl.id]: p[tmpl.id] || {} })); }}
                  onLaunch={launchTD}
                />
              ))}
            </div>
          </div>

          {/* ── OSC Log ── */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>📡 OSC Activity Log</h3>
            <div className="log" style={{ maxHeight: 140, fontSize: 10, fontFamily: 'monospace' }}>
              {oscLog.length === 0
                ? <span style={{ color: '#2a4a5a' }}>No OSC messages sent yet. Connect and adjust parameters.</span>
                : oscLog.map((l, i) => <div key={i} style={{ color: i === 0 ? '#8b6bff' : '#b7b2dc' }}>{l}</div>)
              }
            </div>
          </div>
        </div>

        <div>
          {/* ── Active template controller ── */}
          {activeTmpl ? (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 20, marginRight: 8 }}>{activeTmpl.icon}</span>
                  <strong style={{ fontSize: 15 }}>{activeTmpl.name}</strong>
                </div>
                <button className="btn ghost small" onClick={() => setActiveTmpl(null)}>✕ Close</button>
              </div>

              <div style={{ fontSize: 11.5, color: '#b7b2dc', marginBottom: 14, lineHeight: 1.5 }}>{activeTmpl.desc}</div>

              {/* Triggers */}
              {activeTmpl.triggers?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#b7b2dc', fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>TRIGGERS</div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 7 }}>
                    {activeTmpl.triggers.map((tr) => (
                      <button key={tr.address}
                        onClick={() => sendTrigger(tr.address)}
                        style={{ background: tr.color + '22', border: '1px solid ' + tr.color + '66', color: tr.color, borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        ⚡ {tr.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* OSC Parameters */}
              <div style={{ fontSize: 11, color: '#b7b2dc', fontWeight: 700, marginBottom: 10, letterSpacing: 1 }}>PARAMETERS</div>
              {activeTmpl.oscParams.map((p) => (
                <ParamRow
                  key={p.address}
                  param={p}
                  value={(params[activeTmpl.id] || {})[p.address]}
                  onChange={(v) => setParams((prev) => ({ ...prev, [activeTmpl.id]: { ...(prev[activeTmpl.id] || {}), [p.address]: v } }))}
                  onSend={sendOSC}
                />
              ))}

              {/* SD Prompt for AI Diffusion template */}
              {activeTmpl.id === 'ai-diffusion-loop' && (
                <div style={{ marginTop: 14, borderTop: '1px solid rgba(139,107,255,.1)', paddingTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#b7b2dc', fontWeight: 700, marginBottom: 8, letterSpacing: 1 }}>STABLE DIFFUSION PROMPT</div>
                  <label style={{ fontSize: 11 }}>Positive prompt</label>
                  <textarea value={sdPrompt} onChange={(e) => setSdPrompt(e.target.value)} rows={2}
                    placeholder="cyberpunk cityscape, neon rain, volumetric light…"
                    style={{ background: '#0a1a24', border: '1px solid rgba(139,107,255,.2)', color: '#dff0f8', borderRadius: 5, padding: '6px 9px', width: '100%', fontSize: 12, resize: 'vertical' }}
                  />
                  <label style={{ fontSize: 11, marginTop: 6 }}>Negative prompt</label>
                  <input value={sdNeg} onChange={(e) => setSdNeg(e.target.value)}
                    placeholder="blurry, low quality, watermark…"
                    style={{ background: '#0a1a24', border: '1px solid rgba(139,107,255,.2)', color: '#dff0f8', borderRadius: 5, padding: '5px 9px', width: '100%', fontSize: 12 }}
                  />
                  <button className="btn small" style={{ marginTop: 8 }} onClick={sendSDPrompt}>Send to SD via WebSocket</button>
                </div>
              )}
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 14, textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🎛</div>
              <div style={{ color: '#b7b2dc' }}>Select a template to see live parameter controls</div>
            </div>
          )}

          {/* ── AI Control ── */}
          <div className="card" style={{ marginBottom: 14 }}>
            <h3 style={{ marginTop: 0 }}>🤖 AI Parameter Control</h3>
            <p className="sub" style={{ margin: '0 0 10px', fontSize: 11.5 }}>
              Describe what you want — Claude generates the perfect OSC parameter set and sends it live to TouchDesigner.
            </p>
            <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3}
              placeholder={activeTmpl ? 'e.g. "Make it look like a deep ocean storm, dark blues and greens, heavy turbulence, slow motion"' : 'Select a template first…'}
              style={{ background: '#0a1a24', border: '1px solid rgba(139,107,255,.2)', color: '#dff0f8', borderRadius: 5, padding: '7px 10px', width: '100%', fontSize: 12, resize: 'vertical' }}
              disabled={!activeTmpl}
            />
            <button className="btn" style={{ marginTop: 8 }} disabled={!activeTmpl || !aiPrompt.trim() || aiBusy} onClick={runAI}>
              {aiBusy ? 'Generating parameters…' : '🤖 Generate & Apply Parameters'}
            </button>
            {aiLog && (
              <div className="log" style={{ marginTop: 10, fontSize: 10.5, maxHeight: 160 }}>
                <pre style={{ margin: 0, color: aiLog.startsWith('✓') ? '#2ecc71' : '#e74c3c', whiteSpace: 'pre-wrap' }}>{aiLog}</pre>
              </div>
            )}
          </div>

          {/* ── Output watcher ── */}
          <div className="card">
            <h3 style={{ marginTop: 0 }}>📂 TD Output Watcher</h3>
            <p className="sub" style={{ margin: '0 0 10px', fontSize: 11.5 }}>
              Set this to TouchDesigner's render output folder — God's Pandora auto-imports every new frame or video.
            </p>
            <div className="row" style={{ gap: 6 }}>
              <input value={outputFolder} onChange={(e) => setOutputFolder(e.target.value)} placeholder="C:\Users\...\TD_Output"
                style={{ flex: 1, background: '#0a1a24', border: '1px solid rgba(139,107,255,.2)', color: '#dff0f8', borderRadius: 5, padding: '5px 9px', fontSize: 11, fontFamily: 'monospace' }}
              />
              <button className="btn ghost small" onClick={watchFolder}>Watch</button>
            </div>
            {status.outputFolder && (
              <div style={{ fontSize: 10, color: '#2ecc71', marginTop: 5 }}>● Watching: {status.outputFolder}</div>
            )}
            {renders.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6, marginTop: 12 }}>
                {renders.map((f, i) => (
                  <OutputThumb key={i} file={f} onReveal={(f) => window.api.reveal(f)} />
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#2a4a5a', marginTop: 10 }}>No renders captured yet. Set a folder and run TD.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
