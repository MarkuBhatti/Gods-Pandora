import React, { useEffect, useMemo, useRef, useState } from 'react';

// A compact, click-to-open option list (behaves like the resolution dropdown, but each option can
// carry a hint and options are grouped + searchable). Closed it shows only the current choice.
//   options: [{ id, name, hint?, group? }]   value: id | ''   onChange(id)
export default function OptionPicker({ icon, label, value, options, onChange, noneLabel = 'None', search = true, multi = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const sel = multi ? (Array.isArray(value) ? value : []) : value;
  const isOn = (id) => (multi ? sel.includes(id) : sel === id);
  const pick = (id) => {
    if (multi) onChange(id === '' ? [] : sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
    else { onChange(id); setOpen(false); }
  };
  const current = multi
    ? (sel.length ? options.filter((o) => sel.includes(o.id)).map((o) => o.name).join(', ') : noneLabel)
    : (options.find((o) => o.id === value)?.name || noneLabel);

  const groups = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = options.filter((o) => !t || (o.name + ' ' + (o.hint || '') + ' ' + (o.group || '')).toLowerCase().includes(t));
    const m = new Map();
    for (const o of list) { const g = o.group || ''; if (!m.has(g)) m.set(g, []); m.get(g).push(o); }
    return [...m.entries()];
  }, [options, q]);

  return (
    <div className="opick" ref={ref}>
      <label>{label}</label>
      <button type="button" className={'opick-btn' + (open ? ' open' : '')} onClick={() => setOpen((v) => !v)}>
        {icon && <span className="opick-ic">{icon}</span>}
        <span className="opick-cur">{current}</span>
        <span className="opick-car">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="opick-pop">
          {search && options.length > 8 && <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="opick-q" />}
          <div className="opick-list">
            {!q && <button type="button" className={'chip mini' + ((multi ? !sel.length : !value) ? ' on' : '')} onClick={() => pick('')}>{noneLabel}</button>}
            {groups.map(([g, list]) => (
              <div key={g || '_'} className="opick-group">
                {g && <div className="opick-g">{g}</div>}
                <div className="row" style={{ gap: 5 }}>
                  {list.map((o) => (
                    <button type="button" key={o.id} title={o.hint || ''} className={'chip mini' + (isOn(o.id) ? ' on' : '')} onClick={() => pick(o.id)}>{o.name}</button>
                  ))}
                </div>
              </div>
            ))}
            {!groups.length && <div className="sub" style={{ fontSize: 11 }}>Nothing matches “{q}”.</div>}
          </div>
          {multi && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 6 }}><button type="button" className="btn small" onClick={() => setOpen(false)}>Done</button></div>}
        </div>
      )}
    </div>
  );
}
