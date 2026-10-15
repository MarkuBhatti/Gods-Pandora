import React, { useEffect, useState } from 'react';

// Renders a library file (image/video/audio) via data URL fetched from the main process.
export default function Media({ file, kind, controls }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { let ok = true; window.api.dataUrl(file).then((d) => ok && setSrc(d)); return () => { ok = false; }; }, [file]);
  if (!src) return <div className="thumb" />;
  if (kind === 'video') return <video src={src} controls={controls} className={controls ? '' : 'thumb'} />;
  if (kind === 'audio') return <audio src={src} controls style={{ width: '100%' }} />;
  return <img src={src} className={controls ? '' : 'thumb'} alt="" />;
}
