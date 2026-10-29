import React, { useEffect, useState, lazy, Suspense } from 'react';
const GlbViewer = lazy(() => import('./GlbViewer.jsx'));

// Renders a library file (image/video/audio) via data URL fetched from the main process.
export default function Media({ file, kind, controls }) {
  if (kind === '3d' || /\.glb$/i.test(String(file || ''))) return controls ? <Suspense fallback={<div className="thumb" />}><GlbViewer file={file} height={460} /></Suspense> : <div className="thumb" style={{ display: 'grid', placeItems: 'center', fontSize: 34, background: 'radial-gradient(#2a2540,#0c0c12)' }}>🧊</div>;
  const [src, setSrc] = useState(null);
  // videos & audio stream straight from disk (no giant base64 over IPC → the window never freezes); images use a file URL too
  useEffect(() => { let ok = true; const viaData = () => window.api.dataUrl(file).then((d) => ok && setSrc(d)).catch(() => {});
    if (location.protocol === 'file:' && window.api.fileUrl) window.api.fileUrl(file).then((u) => ok && setSrc(u)).catch(viaData); else viaData();
    return () => { ok = false; }; }, [file]);
  if (!src) return <div className="thumb" />;
  if (kind === 'video') return <video src={src} controls={controls} className={controls ? '' : 'thumb'} />;
  if (kind === 'audio') return <audio src={src} controls style={{ width: '100%' }} />;
  return <img src={src} className={controls ? '' : 'thumb'} alt="" />;
}
