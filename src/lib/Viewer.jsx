import React, { useEffect, useState } from 'react';
import Media from './Media.jsx';
import { useStore, uid } from './store.jsx';

// In-app viewer: "Open" shows any generated file inside Pandora; "File location" reveals it in Explorer.
const kindOf = (f) => { const e = String(f || '').split('.').pop().toLowerCase(); if (/^(mp4|mov|webm|mkv|avi|m4v)$/.test(e)) return 'video'; if (/^(mp3|wav|ogg|flac|m4a|aac|opus)$/.test(e)) return 'audio'; if (e === 'glb') return '3d'; return 'image'; };
export const openInApp = (file, kind) => window.dispatchEvent(new CustomEvent('pandora:view', { detail: { file, kind: kind || kindOf(file) } }));

export function OpenButtons({ file, kind, open = true }) {
  if (!file) return null;
  return (<>
    {open && <button className="btn ghost small" title="Open inside God's Pandora" onClick={() => openInApp(file, kind)}>Open</button>}
    <button className="btn ghost small" title="Show the file in its folder" onClick={() => window.api.reveal(file)}>📁 File location</button>
  </>);
}

export default function Viewer() {
  const [v, setV] = useState(null);
  const { update } = useStore();
  // Claude (via Pandora Connect) can open files here and its results land in the Gallery
  useEffect(() => { const a = window.api.onView?.((f) => setV({ file: f, kind: kindOf(f) }));
    const b = window.api.onGallery?.((g) => update((d) => { if (!d.generations.some((x) => x.file === g.file)) d.generations.unshift({ id: uid(), file: g.file, kind: g.kind, prompt: g.prompt, model: g.model, at: new Date().toISOString() }); return d; }));
    return () => { a && a(); b && b(); }; }, []);
  useEffect(() => { const h = (e) => setV(e.detail); window.addEventListener('pandora:view', h); return () => window.removeEventListener('pandora:view', h); }, []);
  useEffect(() => { if (!v) return; const k = (e) => e.key === 'Escape' && setV(null); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [v]);
  if (!v) return null;
  const name = String(v.file).split(/[\\/]/).pop();
  return (
    <div className="lightbox" style={{ zIndex: 9999 }} onClick={() => setV(null)}>
      <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <Media file={v.file} kind={v.kind} controls />
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
          <span className="sub" title={v.file} style={{ maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span className="row" style={{ gap: 6 }}>
            <button className="btn ghost small" onClick={() => window.api.reveal(v.file)}>📁 File location</button>
            <button className="btn ghost small" title="Open with your default Windows app" onClick={() => window.api.openDefault(v.file).catch(() => {})}>Open with…</button>
            <button className="btn small" onClick={() => setV(null)}>✕ Close</button>
          </span>
        </div>
      </div>
    </div>
  );
}
