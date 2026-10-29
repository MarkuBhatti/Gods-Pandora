import React, { useEffect, useState } from 'react';
import { useStore } from './store.jsx';

// After the first install (and the setup wizards), ask to install the free local engine right away.
// Shows on each launch until the engine is installed, unless the user ticks "don't ask again".
let dismissed = false;
export default function EnginePrompt() {
  const { db, update, loaded } = useStore();
  const [st, setSt] = useState(null); const [busy, setBusy] = useState(false); const [line, setLine] = useState(''); const [err, setErr] = useState(''); const [never, setNever] = useState(false); const [done, setDone] = useState(false); const [hide, setHide] = useState(dismissed);
  useEffect(() => { window.api.engine.status().then(setSt).catch(() => setSt({ installed: true })); }, []);
  useEffect(() => { if (!busy) return; const t = setInterval(() => window.api.engine.status().then((s) => { const l = (s.log || []).join('').trim().split('\n').filter(Boolean).pop(); if (l) setLine(l.slice(-140)); }).catch(() => {}), 1500); return () => clearInterval(t); }, [busy]);
  const s = db?.settings || {};
  if (hide || !loaded || !st || st.installed || !s.setupDone || !s.onboarded || s.engineNeverAsk) return null;
  const close = () => { dismissed = true; if (never) update((d) => { d.settings.engineNeverAsk = true; return d; }); setHide(true); };
  const install = async () => {
    setBusy(true); setErr(''); setLine('Preparing…');
    try { const r = await window.api.engine.install(); if (r && r.ok === false) throw new Error(r.error || 'Install failed'); setDone(true); window.api.engine.start().catch(() => {}); }
    catch (e) { setErr(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    setBusy(false);
  };
  return (
    <div className="modal-bg" style={{ zIndex: 9000 }}>
      <div className="card modal" style={{ maxWidth: 520 }}>
        <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 30 }}>{done ? 'Engine ready ✓' : <>Install the <i style={{ color: 'var(--gold)' }}>engine</i> to continue</>}</h2>
        {!done && <p className="sub">God's Pandora's free local engine runs image, video, audio, Shapeshift and effects AI on your own PC — no API keys or credits. It's a one-time install (about 3–6 GB, 5–15 minutes depending on your internet). You can keep using the app while it installs.</p>}
        {done && <p className="sub">The local engine is installed and starting. Download models anytime from <b>Library → Models</b>.</p>}
        {busy && <div style={{ margin: '12px 0' }}><div className="dl-progress"><div className="bar"><div style={{ width: '100%', animation: 'pulse 1.4s ease-in-out infinite', opacity: .7 }} /></div></div><div className="sub" style={{ fontFamily: 'var(--mono)', fontSize: 11, marginTop: 6, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{line || 'Installing…'}</div></div>}
        {err && <div className="err" style={{ margin: '10px 0' }}>⚠ {err}<br /><span className="sub">You can retry here or later from System → Core & Cloud.</span></div>}
        <div className="row" style={{ marginTop: 14, gap: 8, justifyContent: 'flex-end' }}>
          {!done && !busy && <label className="row sub" style={{ gap: 6, marginRight: 'auto', fontSize: 12 }}><input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />Don't ask again</label>}
          {!done && <button className="btn ghost" onClick={close}>{busy ? 'Continue in background' : 'Later'}</button>}
          {!done && <button className="btn primary" disabled={busy} onClick={install}>{busy ? 'Installing…' : err ? 'Retry' : 'Install engine now'}</button>}
          {done && <button className="btn primary" onClick={close}>Start creating</button>}
        </div>
      </div>
    </div>
  );
}
