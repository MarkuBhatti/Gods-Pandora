import React, { useLayoutEffect, useRef, useState } from 'react';
import art from '../assets/pandora/art.webp';
import a160 from '../assets/pandora/art-160.webp';
import a256 from '../assets/pandora/art-256.webp';
import a384 from '../assets/pandora/art-384.webp';
import a512 from '../assets/pandora/art-512.webp';
import a640 from '../assets/pandora/art-640.webp';
import a768 from '../assets/pandora/art-768.webp';

// The living Pandora box — the original painted artwork at full detail.
// Detail-safe motion: the art is never rotated, skewed or overlaid (those resample and soften it).
// It only drifts in a slow circle, and the browser is handed a pre-sharpened copy at the exact
// on-screen size (srcset), so every ribbon and star stays crisp while it moves.
const SRCSET = `${a160} 160w, ${a256} 256w, ${a384} 384w, ${a512} 512w, ${a640} 640w, ${a768} 768w, ${art} 1024w`;
const SPARKS = Array.from({ length: 16 }, (_, i) => ({ x: 30 + ((i * 37) % 42), d: 3.2 + ((i * 7) % 5) * 0.6, delay: -((i * 13) % 9) * 0.5, s: 1.5 + (i % 3) }));

export default function PandoraBox({ size = 140, still = false, sparks = true, className = '' }) {
  const ref = useRef(null);
  const [w, setW] = useState(Math.round(size * 2.6));
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const m = () => { const x = Math.round(el.offsetWidth); if (x) setW(x); };
    m();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(m); ro.observe(el); return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={'pbox pbox-art' + (still ? ' still' : '') + (className ? ' ' + className : '')} style={{ '--s': size + 'px' }} role="img" aria-label="God's Pandora — the living Pandora box">
      <span className="pa-aura" />
      <span className="pa-float">
        <img className="pa-img" src={art} srcSet={SRCSET} sizes={w + 'px'} alt="" draggable="false" decoding="async" />
      </span>
      <span className="pa-shadow" />
      {sparks && !still && <span className="pa-sparks">{SPARKS.map((p, i) => <i key={i} style={{ left: p.x + '%', animationDuration: p.d + 's', animationDelay: p.delay + 's', width: p.s, height: p.s }} />)}</span>}
    </div>
  );
}
