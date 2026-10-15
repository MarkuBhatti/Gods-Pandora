import React, { useEffect, useState } from 'react';

// Shows the user's GPU and whether it meets a tool's local requirement.
let cache = null;
export function useHardware() {
  const [hw, setHw] = useState(cache);
  useEffect(() => {
    if (cache || !window.api?.jutsu?.hardware) return;
    window.api.jutsu.hardware().then((h) => { cache = h; setHw(h); }).catch(() => setHw({ error: true }));
  }, []);
  return hw;
}

export default function HardwareHint({ needGb, label }) {
  const hw = useHardware();
  if (!hw) return <p className="sub" style={{ fontSize: 11 }}>Checking your GPU…</p>;
  if (!hw.installed) return <p className="err" style={{ fontSize: 11 }}>Local mode needs the built-in engine: Models → Install engine (Python 3.10+).</p>;
  if (hw.cuda) {
    const ok = hw.vram_gb >= needGb;
    return (
      <p className={ok ? 'ok' : 'err'} style={{ fontSize: 11, margin: '4px 0' }}>
        {ok ? '✓' : '⚠'} Your GPU: {hw.gpu} · {hw.vram_gb} GB VRAM — {label} needs about {needGb} GB{ok ? '.' : '. It may fail or run very slowly; the cloud engine is recommended.'}
      </p>
    );
  }
  if (hw.mps) return <p className="sub" style={{ fontSize: 11 }}>Apple Silicon detected — {label} may be slow; NVIDIA GPUs are recommended.</p>;
  return <p className="err" style={{ fontSize: 11 }}>⚠ No compatible GPU found — {label} needs an NVIDIA GPU. Use a cloud engine instead.</p>;
}
