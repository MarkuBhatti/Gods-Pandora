import React, { useState } from 'react';
import { useStore, uid } from './store.jsx';
import { useNav } from './nav.jsx';

// Grab the last frame of a video file as a PNG (for "Extend": continue a clip from where it ends)
export async function lastFrame(file) {
  const src = await window.api.dataUrl(file);
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = src;
    v.onloadedmetadata = () => { v.currentTime = Math.max(0, (v.duration || 0) - 0.05); };
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas');
        c.width = v.videoWidth; c.height = v.videoHeight;
        c.getContext('2d').drawImage(v, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };
    v.onerror = () => reject(new Error('Could not read this video.'));
  });
}

const TYPES = [['characters', '☺ Character / influencer'], ['locations', '⌖ Location'], ['products', '📦 Product']];

// Connects any generated or imported file to the rest of the app.
export default function AssetActions({ file, kind, prompt = '', compact = false }) {
  const { db, update } = useStore();
  const { go } = useNav();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('characters');
  const [target, setTarget] = useState('new');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  const save = () => {
    if (target === 'new' && !name.trim()) return;
    update((d) => {
      d[type] = d[type] || [];
      if (target === 'new') {
        d[type].push({ id: uid(), name: name.trim(), description: prompt ? prompt.slice(0, 400) : '', refs: [file], signatureColor: '', createdAt: new Date().toISOString() });
      } else {
        const e = d[type].find((x) => x.id === target);
        if (e) e.refs = [...new Set([...(e.refs || []), file])].slice(0, 14);
      }
      return d;
    });
    setMsg('✓ Saved'); setOpen(false); setName(''); setTimeout(() => setMsg(''), 2500);
  };

  const extend = async () => {
    try {
      setMsg('Grabbing last frame…');
      const frame = await window.api.saveDataUrl(await lastFrame(file), 'last-frame');
      setMsg('');
      go('create', { kind: 'video', refs: [frame], prompt: prompt ? 'Continue this shot seamlessly: ' + prompt : 'Continue this shot seamlessly from the reference frame.' });
    } catch (e) { setMsg('⚠ ' + (e.message || e)); }
  };

  const visual = kind === 'image' || kind === 'video';
  return (
    <div className="asset-actions">
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {kind === 'image' && <button className="btn ghost small" title="Use this image as a reference in Create" onClick={() => go('create', { kind: 'image', refs: [file], prompt })}>↺ Remix</button>}
        {kind === 'image' && <button className="btn ghost small" title="Turn this image into a video" onClick={() => go('create', { kind: 'video', refs: [file], prompt })}>🎬 Animate</button>}
        {kind === 'video' && <button className="btn ghost small" title="Continue the clip from its last frame" onClick={extend}>⏭ Extend</button>}
        {kind === 'video' && <button className="btn ghost small" title="Motion transfer / swap / restyle this video" onClick={() => go('genjutsu', { video: file })}>🌀 Shapeshift</button>}
        {visual && <button className="btn ghost small" onClick={() => setOpen((o) => !o)}>＋ Save to…</button>}
        {!compact && <button className="btn ghost small" onClick={() => window.api.reveal(file)}>Open</button>}
      </div>
      {open && (
        <div className="save-to">
          <select value={type} onChange={(e) => { setType(e.target.value); setTarget('new'); }}>
            {TYPES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </select>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">+ New…</option>
            {(db[type] || []).map((e) => <option key={e.id} value={e.id}>Add to “{e.name}”</option>)}
          </select>
          {target === 'new' && <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />}
          <button className="btn small" onClick={save} disabled={target === 'new' && !name.trim()}>Save</button>
        </div>
      )}
      {msg && <div className={msg.startsWith('⚠') ? 'err' : 'ok'} style={{ fontSize: 11, marginTop: 4 }}>{msg}</div>}
    </div>
  );
}
