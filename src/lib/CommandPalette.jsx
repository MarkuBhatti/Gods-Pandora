import React, { useEffect, useMemo, useRef, useState } from 'react';

// Ctrl+K (⌘K) quick switcher: jump to any page or tool by typing.
export default function CommandPalette({ pages, onGo }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); setQ(''); setSel(0); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return pages.filter(([, label]) => !t || label.toLowerCase().includes(t)).slice(0, 12);
  }, [q, pages]);

  if (!open) return null;
  const go = (id) => { onGo(id); setOpen(false); };
  return (
    <div className="palette-bg" onMouseDown={() => setOpen(false)}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={input} value={q} placeholder="Go to… (type a page or tool name)"
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, list.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && list[sel]) go(list[sel][0]);
          }} />
        {list.map(([id, label, icon], i) => (
          <button key={id} className={'palette-item' + (i === sel ? ' on' : '')} onMouseEnter={() => setSel(i)} onClick={() => go(id)}>
            <span>{icon}</span> {label}
          </button>
        ))}
        {list.length === 0 && <div className="sub" style={{ padding: 10 }}>No match.</div>}
        <div className="sub" style={{ fontSize: 10.5, padding: '6px 10px' }}>↑↓ to choose · Enter to open · Esc to close · Ctrl+Enter generates · Esc cancels a running generation</div>
      </div>
    </div>
  );
}
