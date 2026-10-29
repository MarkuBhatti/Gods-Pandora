import React, { useState } from 'react';
import { EFFECTS, FX_CATS, fxById } from './effects.js';

// Effect stack editor: the applied effects (toggle, strength, reorder, remove) + the searchable library.
export default function FxStack({ value, onChange, video = true }) {
  const fx = value || [];
  const [q, setQ] = useState(''); const [cat, setCat] = useState('');
  const set = (i, patch) => onChange(fx.map((y, j) => (j === i ? { ...y, ...patch } : y)));
  const list = EFFECTS.filter((e) => (video || e.kind !== 'time') && (!cat || e.cat === cat) && (!q || (e.name + ' ' + e.cat).toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      {fx.map((x, i) => { const e = fxById(x.id); return e && (
        <div key={i} className="ed-fxrow">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <label className="row" style={{ gap: 6, margin: 0, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={x.on !== false} onChange={(ev) => set(i, { on: ev.target.checked })} /><span className={'ed-fxk ' + e.kind} />{e.name}</label>
            <span className="row" style={{ gap: 2 }}>
              <button className="ed-mini" disabled={!i} onClick={() => { const f = [...fx]; [f[i - 1], f[i]] = [f[i], f[i - 1]]; onChange(f); }}>▲</button>
              <button className="ed-mini" onClick={() => onChange(fx.filter((_, j) => j !== i))}>✕</button>
            </span>
          </div>
          <input type="range" min="0" max="1" step="0.01" value={x.amt ?? 1} onChange={(ev) => set(i, { amt: +ev.target.value })} />
        </div>); })}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${list.length} effects…`} style={{ marginTop: 6 }} />
      <div className="row" style={{ gap: 3, margin: '6px 0' }}>
        <button className={'chip mini' + (!cat ? ' on' : '')} onClick={() => setCat('')}>All</button>
        {FX_CATS.filter((c) => video || EFFECTS.some((e) => e.cat === c && e.kind !== 'time')).map((c) => <button key={c} className={'chip mini' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="ed-fxlist" style={{ maxHeight: 280, overflow: 'auto' }}>
        {list.map((e) => <button key={e.id} className="ed-fx" onClick={() => onChange([...fx, { id: e.id, amt: e.kind === 'color' ? 1 : 0.6 }])}><span className={'ed-fxk ' + e.kind} />{e.name}<small>{e.cat}</small></button>)}
      </div>
    </div>
  );
}
