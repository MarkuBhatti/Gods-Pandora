import React, { useEffect, useRef, useState } from 'react';
import PandoraAgent from '../pages/PandoraAgent.jsx';

// Pandy — the Pandora Agent as a friendly widget docked on the right edge.
// Eyes follow the cursor, it bobs and blinks, you can drag it up/down the edge, and a click
// slides the full agent out in a drawer (plans, approvals, live progress, results).
export function PandyFace({ className = '', mood = 'happy' }) {
  return (
    <svg className={'pandy-face ' + className} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="pdy-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F3DDB7" /><stop offset=".55" stopColor="#f3a84b" /><stop offset="1" stopColor="#c46a2a" /></linearGradient>
        <linearGradient id="pdy-l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe7bd" /><stop offset="1" stopColor="#f0b45e" /></linearGradient>
        <radialGradient id="pdy-g" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#b9a3ff" stopOpacity=".9" /><stop offset="1" stopColor="#8b6bff" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx="50" cy="93" rx="26" ry="4" fill="#000" opacity=".35" />
      <circle cx="50" cy="30" r="22" fill="url(#pdy-g)" className="pdy-spark" />
      <circle cx="36" cy="18" r="2" fill="#fff" className="pdy-spark" /><circle cx="66" cy="14" r="1.6" fill="#F3DDB7" className="pdy-spark" style={{ animationDelay: '.8s' }} /><circle cx="58" cy="22" r="1.2" fill="#9fe8ff" className="pdy-spark" style={{ animationDelay: '1.4s' }} />
      <rect x="18" y="38" width="64" height="50" rx="16" fill="url(#pdy-b)" />
      <rect x="18" y="38" width="64" height="50" rx="16" fill="none" stroke="#fff" strokeOpacity=".25" />
      <path d="M24 46 Q50 41 76 46" stroke="#fff" strokeOpacity=".35" strokeWidth="2" fill="none" strokeLinecap="round" />
      <g className="pdy-lid"><rect x="14" y="28" width="72" height="16" rx="8" fill="url(#pdy-l)" /><rect x="44" y="26" width="12" height="5" rx="2.5" fill="#c46a2a" /></g>
      <g className="pdy-blink"><ellipse cx="38" cy="62" rx="7" ry="8.5" fill="#1a1020" /><circle className="pdy-eye" cx="40" cy="59.5" r="2.6" fill="#fff" /></g>
      <g className="pdy-blink"><ellipse cx="62" cy="62" rx="7" ry="8.5" fill="#1a1020" /><circle className="pdy-eye" cx="64" cy="59.5" r="2.6" fill="#fff" /></g>
      <ellipse cx="29" cy="72" rx="4.5" ry="2.6" fill="#ff7a8a" opacity=".55" /><ellipse cx="71" cy="72" rx="4.5" ry="2.6" fill="#ff7a8a" opacity=".55" />
      <path d={mood === 'open' ? 'M44 72 Q50 82 56 72 Q50 76 44 72' : mood === 'busy' ? 'M45 75 Q50 73 55 75' : 'M44 73 Q50 79 56 73'} stroke="#1a1020" strokeWidth="2.6" fill={mood === 'open' ? '#1a1020' : 'none'} strokeLinecap="round" />
    </svg>
  );
}

const TIPS = ['Hi! I\'m Pandy. Need a hand?', 'Try: "Make a 20s promo for my brand"', 'I can plan, generate, edit and grade — free on your GPU.'];

export default function Pandy({ page, go }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState(0);
  const [hideTip, setHideTip] = useState(() => { try { return localStorage.getItem('pandora.pandyTip') === '0'; } catch { return false; } });
  const [bottom, setBottom] = useState(() => { try { return +localStorage.getItem('pandora.pandyY') || 28; } catch { return 28; } });
  const ref = useRef(null); const drag = useRef(null);

  // eyes follow the cursor
  useEffect(() => {
    const onMove = (e) => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height * 0.62;
      const a = Math.atan2(e.clientY - cy, e.clientX - cx), d = Math.min(1, Math.hypot(e.clientX - cx, e.clientY - cy) / 300);
      el.querySelectorAll('.pdy-eye').forEach((n) => { n.style.transform = `translate(${Math.cos(a) * 3 * d}px,${Math.sin(a) * 3.4 * d}px)`; });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  useEffect(() => { const t = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 9000); return () => clearInterval(t); }, []);
  // knows when the agent is working (face changes)
  useEffect(() => {
    const off = window.api?.agent?.onEvent?.((ev) => { if (!ev || ev.source === 'connector') return; if (ev.type === 'progress' || ev.type === 'tool') setBusy(true); if (ev.type === 'done' || ev.type === 'error') setBusy(false); });
    return typeof off === 'function' ? off : undefined;
  }, []);
  useEffect(() => { if (page === 'agent') setOpen(false); }, [page]);
  useEffect(() => { const onOpen = () => setOpen(true); window.addEventListener('pandora:pandy', onOpen); return () => window.removeEventListener('pandora:pandy', onOpen); }, []);

  const down = (e) => { drag.current = { y: e.clientY, b: bottom, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => {
    const d = drag.current; if (!d) return; const dy = d.y - e.clientY;
    if (Math.abs(dy) > 4) d.moved = true;
    setBottom(Math.max(12, Math.min(window.innerHeight - 150, d.b + dy)));
  };
  const up = () => {
    const d = drag.current; drag.current = null; if (!d) return;
    if (!d.moved) setOpen((o) => !o); else { try { localStorage.setItem('pandora.pandyY', String(bottom)); } catch { /* ignore */ } }
  };
  if (page === 'agent') return null;
  return (
    <>
      <div className={'pandy' + (open ? ' is-open' : '')} style={{ bottom }}>
        {!open && !hideTip && <div className="pandy-bubble" key={tip}>{busy ? 'Working on it…' : TIPS[tip]}<button onClick={() => { setHideTip(true); try { localStorage.setItem('pandora.pandyTip', '0'); } catch { /* */ } }} title="Hide tips">×</button></div>}
        <div ref={ref} className="pandy-btn" role="button" tabIndex={0} title="Pandy — Pandora Agent (drag to move)" onPointerDown={down} onPointerMove={move} onPointerUp={up}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}>
          <PandyFace mood={open ? 'open' : busy ? 'busy' : 'happy'} />
          {busy && <span className="pandy-busy" />}
        </div>
      </div>
      <aside className={'pandy-drawer' + (open ? ' open' : '')} aria-hidden={!open}>
        <div className="pandy-head">
          <PandyFace className="sm" mood="happy" />
          <div><b>Pandy</b><small>{busy ? '● working…' : '● Pandora Agent'}</small></div>
          <button className="pandy-x" onClick={() => go('agent')} title="Open full view">⤢</button>
          <button className="pandy-x" onClick={() => setOpen(false)} title="Close">✕</button>
        </div>
        <div className="pandy-body">{open || busy ? <PandoraAgent compact /> : null}</div>
      </aside>
    </>
  );
}
