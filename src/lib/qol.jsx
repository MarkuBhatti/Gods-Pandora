import React, { useEffect, useState } from 'react';
import MicButton from './Voice.jsx';

// ── Quality-of-life helpers ─────────────────────────────────────────────────

// useState that survives restarts (remembers your last model, settings, counts…)
export function usePersist(key, initial) {
  const [v, setV] = useState(() => {
    try { const raw = localStorage.getItem('ge.' + key); return raw == null ? initial : JSON.parse(raw); }
    catch (_) { return initial; }
  });
  useEffect(() => { try { localStorage.setItem('ge.' + key, JSON.stringify(v)); } catch (_) { /* storage full */ } }, [key, v]);
  return [v, setV];
}

const HIST = 'ge.promptHistory';
export function addPromptHistory(p) {
  const t = String(p || '').trim();
  if (!t) return;
  try {
    const list = JSON.parse(localStorage.getItem(HIST) || '[]').filter((x) => x !== t);
    localStorage.setItem(HIST, JSON.stringify([t, ...list].slice(0, 25)));
  } catch (_) { /* ignore */ }
}
const getHistory = () => { try { return JSON.parse(localStorage.getItem(HIST) || '[]'); } catch (_) { return []; } };

// ✨ Enhance (Claude or your local LLM) · 🕘 recent prompts · ⧉ copy · clear
export function PromptTools({ value, onChange, kind = 'image' }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [hist, setHist] = useState(false);
  const enhance = async () => {
    if (!value.trim()) return;
    setBusy(true); setMsg('');
    try {
      const out = await window.api.enhancePrompt({ prompt: value, kind });
      if (out) { onChange(out); setMsg('✓ Enhanced — Ctrl+Z in the box to undo'); }
    } catch (e) {
      setMsg('⚠ ' + String(e.message || e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''));
    }
    setBusy(false);
  };
  const list = hist ? getHistory() : [];
  return (
    <div className="prompt-tools">
      <MicButton promptMode small onText={(t) => onChange(value && value.trim() ? value.trim() + ' ' + t : t)} title="Speak your prompt in any language" />
      <button className="chip mini" disabled={busy || !value.trim()} onClick={enhance} title="Rewrite into a detailed, model-friendly prompt (Claude key, or a local model in Ollama / LM Studio)">
        {busy ? '✨ Enhancing…' : '✨ Enhance'}
      </button>
      <button className={'chip mini' + (hist ? ' on' : '')} onClick={() => setHist((h) => !h)} title="Your recent prompts">🕘 Recent</button>
      <button className="chip mini" disabled={!value} onClick={() => navigator.clipboard?.writeText(value)} title="Copy prompt">⧉ Copy</button>
      <button className="chip mini" disabled={!value} onClick={() => onChange('')} title="Clear prompt">✕ Clear</button>
      <span className="sub" style={{ fontSize: 10.5 }}>{value.length} chars</span>
      {msg && <span className={msg.startsWith('⚠') ? 'err' : 'ok'} style={{ fontSize: 11, margin: 0 }}>{msg}</span>}
      {hist && (
        <div className="hist-list">
          {list.length === 0 && <div className="sub">No prompts yet.</div>}
          {list.map((p) => <button key={p} onClick={() => { onChange(p); setHist(false); }} title={p}>{p}</button>)}
        </div>
      )}
    </div>
  );
}

// Drop images (or videos with accept="video") from Explorer onto any reference slot
export function DropZone({ onFiles, accept = 'image', children }) {
  const [over, setOver] = useState(false);
  const ok = (f) => (accept === 'video' ? /^video\//.test(f.type) || /\.(mp4|mov|webm)$/i.test(f.name) : /^image\//.test(f.type));
  return (
    <div className={'dropzone' + (over ? ' over' : '')}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        e.preventDefault(); setOver(false);
        const files = [...(e.dataTransfer?.files || [])].filter(ok);
        const paths = files.map((f) => (window.api.pathForFile ? window.api.pathForFile(f) : f.path)).filter(Boolean);
        if (!paths.length) return;
        const copied = await window.api.importFiles(paths).catch(() => paths);
        onFiles(copied);
      }}>
      {children}
    </div>
  );
}
