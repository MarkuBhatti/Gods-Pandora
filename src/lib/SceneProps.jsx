import React from 'react';

// Set pieces for the cinematic page backgrounds: skylines with lit windows, cars with headlights and
// tail-lights, practical interior lamps, neon signs, string lights, bridges, forests, caves, ruins…
// All drawn with SVG/CSS (no photos). Every piece is seeded so each page gets its own layout.

export const rnd = (i, s = 1) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

/* City skyline: buildings, lit windows (a few flicker), red rooftop beacons */
export function Skyline({ seed = 1, top = 30, h = 32, warm = 0.6, density = 0.28, tint = '#070b10' }) {
  const W = 1600, H = 400; const bld = []; let x = -20, i = 0;
  while (x < W) {
    const w = 50 + rnd(i, seed) * 110, bh = 90 + rnd(i, seed + 1) * 290; bld.push({ x, w, h: bh, i }); x += w + 4 + rnd(i, seed + 2) * 14; i++;
  }
  return (
    <svg className="sp-skyline" style={{ top: top + '%', height: h + '%' }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {bld.map((b) => {
        const wins = []; const cols = Math.floor((b.w - 12) / 14), rows = Math.floor((b.h - 20) / 18);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const k = b.i * 997 + r * 31 + c;
          if (rnd(k, seed + 3) < density) wins.push(<rect key={k} className={rnd(k, seed + 4) < 0.04 ? 'sp-flick' : undefined} x={b.x + 8 + c * 14} y={H - b.h + 12 + r * 18} width="7" height="9" fill={rnd(k, seed + 5) < warm ? '#ffcf86' : '#a9dcff'} opacity={0.35 + rnd(k, seed + 6) * 0.6} />);
        }
        return (
          <g key={b.i}>
            <rect x={b.x} y={H - b.h} width={b.w} height={b.h} fill={tint} />
            {wins}
            {rnd(b.i, seed + 7) < 0.22 && <circle className="sp-beacon" cx={b.x + b.w / 2} cy={H - b.h - 6} r="3" fill="#ff3b3b" />}
          </g>
        );
      })}
    </svg>
  );
}

/* A car silhouette with headlights, beams, tail-lights and a wet-ground reflection */
export function Car({ x = 50, y = 74, scale = 1, dir = 'r', moving = false, dur = 46, delay = 0, body = '#0b0f14', beam = '#fff4d8' }) {
  const flip = dir === 'l';
  return (
    <div className={'sp-car' + (moving ? ' moving ' + (flip ? 'to-l' : 'to-r') : '')} style={{ left: x + '%', top: y + '%', '--sc': scale, '--dur': dur + 's', animationDelay: delay + 's', '--beam': beam }}>
      <svg viewBox="0 0 220 70" style={{ transform: flip ? 'scaleX(-1)' : undefined }} aria-hidden="true">
        <defs>
          <linearGradient id="spbeam" x1="0" x2="1"><stop offset="0" stopColor="var(--beam)" stopOpacity=".55" /><stop offset="1" stopColor="var(--beam)" stopOpacity="0" /></linearGradient>
        </defs>
        <path d="M14 50 C16 38 30 34 52 32 L78 16 C84 12 92 10 104 10 L140 10 C152 10 160 14 168 22 L180 32 C196 34 206 38 208 48 L208 54 L14 54 Z" fill={body} />
        <path d="M84 18 L102 14 L138 14 L150 18 L164 30 L84 30 Z" fill="rgba(140,180,220,.10)" />
        <circle cx="54" cy="55" r="11" fill="#030405" /><circle cx="168" cy="55" r="11" fill="#030405" />
        <rect x="200" y="38" width="9" height="6" rx="2" fill="#fff8e6" className="sp-head" />
        <rect x="12" y="38" width="7" height="6" rx="2" fill="#ff2a2a" className="sp-tail" />
      </svg>
      <span className="sp-beamcone" style={flip ? { left: 'auto', right: '92%', transform: 'scaleX(-1)' } : undefined} />
      <span className={'sp-headglow' + (flip ? ' l' : '')} />
      <span className={'sp-tailglow' + (flip ? ' l' : '')} />
      <span className="sp-carreflect" />
    </div>
  );
}

/* Long-exposure traffic trails on a far road */
export function Trails({ y = 60 }) {
  return (
    <svg className="sp-trails" style={{ top: y + '%' }} viewBox="0 0 1600 40" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 14 C400 8 1200 8 1600 14" stroke="#fff2d0" strokeWidth="2" fill="none" strokeDasharray="60 40" className="sp-trail a" />
      <path d="M0 24 C400 18 1200 18 1600 24" stroke="#ff3a2a" strokeWidth="2.4" fill="none" strokeDasharray="80 50" className="sp-trail b" />
    </svg>
  );
}

/* Interior: practical lamps — pendants with warm cones, a floor lamp, windows on the night */
export function Interior({ pendants = [30, 60], floor = null, windows = [], warm = '#ffc979', desk = null }) {
  return (
    <div className="sp-interior" style={{ '--warm': warm }}>
      <div className="sp-wall" />
      {windows.map((w, i) => (
        <div key={i} className="sp-window" style={{ left: w.x + '%', width: w.w + '%', top: (w.y ?? 18) + '%', height: (w.h ?? 34) + '%' }}>
          <i /><i /><i />
        </div>
      ))}
      <div className="sp-floor" />
      {pendants.map((x, i) => (
        <div key={i} className="sp-pendant" style={{ left: x + '%', animationDelay: -i * 1.3 + 's' }}>
          <span className="cord" /><span className="shade" /><span className="bulb" /><span className="cone" /><span className="pool" />
        </div>
      ))}
      {floor != null && (
        <div className="sp-floorlamp" style={{ left: floor + '%' }}><span className="shade" /><span className="pole" /><span className="glow" /></div>
      )}
      {desk != null && (
        <div className="sp-desklamp" style={{ left: desk + '%' }}><span className="arm" /><span className="head" /><span className="cone" /><span className="desk" /></div>
      )}
    </div>
  );
}

/* Ceiling track spotlights (showroom / stage) */
export function Spots({ xs = [20, 40, 60, 80], color = '#fff0d6', sweep = false }) {
  return (
    <div className={'sp-spots' + (sweep ? ' sweep' : '')}>
      {xs.map((x, i) => <span key={i} style={{ left: x + '%', '--c': color, animationDelay: -i * 2.1 + 's', '--rot': (i % 2 ? 14 : -14) + 'deg' }} />)}
    </div>
  );
}

/* Neon sign */
export function Neon({ text = 'OPEN', color = '#ff4fa3', x = 70, y = 30, size = 2.4, tilt = 0, box = true }) {
  return (
    <div className={'sp-neon' + (box ? ' box' : '')} style={{ left: x + '%', top: y + '%', '--nc': color, fontSize: size + 'vmin', transform: `translate(-50%,-50%) rotate(${tilt}deg)` }}>{text}</div>
  );
}

/* Billboard with a soft glowing panel */
export function Billboard({ x = 70, y = 40, color = '#ff5a4f', text = '' }) {
  return (
    <div className="sp-billboard" style={{ left: x + '%', top: y + '%', '--bc': color }}><span>{text}</span><i /></div>
  );
}

/* Hanging string lights (catenary) */
export function StringLights({ y = 22, sag = 7, color = '#ffd28a', x1 = 0, x2 = 100, n = 22 }) {
  const pts = Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return { x: x1 + (x2 - x1) * t, y: y + sag * 4 * t * (1 - t) }; });
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
  return (
    <svg className="sp-strings" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} stroke="rgba(0,0,0,.6)" strokeWidth=".15" fill="none" vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y + 0.6} r=".35" fill={color} className="sp-bulb" style={{ animationDelay: -(i * 0.37) + 's', color }} />)}
    </svg>
  );
}

/* Bridge with a lit deck and reflections */
export function Bridge({ y = 52 }) {
  return (
    <svg className="sp-bridge" style={{ top: y + '%' }} viewBox="0 0 1600 200" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 120 Q400 20 800 120 T1600 120" stroke="#0c1218" strokeWidth="6" fill="none" />
      <rect x="0" y="118" width="1600" height="10" fill="#080c10" />
      {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={20 + i * 40} cy="120" r="2.6" fill={i % 5 === 0 ? '#ff9b5a' : '#e8f6ff'} className="sp-bulb" style={{ color: '#e8f6ff', animationDelay: -(i * 0.21) + 's' }} />)}
      {[400, 1200].map((x) => <rect key={x} x={x - 6} y="30" width="12" height="96" fill="#0a0f14" />)}
    </svg>
  );
}

export function Moon({ x = 80, y = 14, size = 7, color = '#e9f1ff' }) {
  return <div className="sp-moon" style={{ left: x + '%', top: y + '%', width: size + 'vmin', height: size + 'vmin', '--mc': color }} />;
}

/* Pine forest silhouettes */
export function Pines({ seed = 3, top = 34, h = 30, color = '#05070a' }) {
  const trees = Array.from({ length: 34 }, (_, i) => ({ x: rnd(i, seed) * 1600, w: 40 + rnd(i, seed + 1) * 70, hh: 140 + rnd(i, seed + 2) * 220 }));
  return (
    <svg className="sp-pines" style={{ top: top + '%', height: h + '%' }} viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {trees.sort((a, b) => a.hh - b.hh).map((t, i) => <path key={i} d={`M${t.x} ${400 - t.hh} L${t.x + t.w / 2} 400 L${t.x - t.w / 2} 400 Z`} fill={color} opacity={0.75 + (i / trees.length) * 0.25} />)}
    </svg>
  );
}

/* A cabin with glowing windows */
export function Cabin({ x = 50, y = 50, glow = '#ffb45a' }) {
  return (
    <div className="sp-cabin" style={{ left: x + '%', top: y + '%', '--cg': glow }}>
      <svg viewBox="0 0 160 110" aria-hidden="true"><path d="M10 50 L80 8 L150 50 L150 110 L10 110 Z" fill="#07060a" />
        <rect x="34" y="62" width="22" height="20" fill="var(--cg)" className="sp-win" /><rect x="102" y="62" width="22" height="20" fill="var(--cg)" className="sp-win" /><rect x="70" y="72" width="20" height="38" fill="#ff9a40" opacity=".6" />
      </svg>
      <span className="sp-cabin-glow" />
    </div>
  );
}

export function Campfire({ x = 50, y = 74 }) {
  return <div className="sp-fire" style={{ left: x + '%', top: y + '%' }}><span className="f1" /><span className="f2" /><span className="f3" /><span className="pool" /></div>;
}

/* Cave ceiling: stalactites */
export function Stalactites({ seed = 5, color = '#0d0805', lit = '#7a4a22' }) {
  const s = Array.from({ length: 46 }, (_, i) => ({ x: rnd(i, seed) * 1600, w: 10 + rnd(i, seed + 1) * 40, h: 40 + rnd(i, seed + 2) * 200 }));
  return (
    <svg className="sp-stal" viewBox="0 0 1600 300" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
      <defs><linearGradient id={'stal' + seed} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} /><stop offset=".55" stopColor={color} /><stop offset="1" stopColor={lit} /></linearGradient></defs>
      <rect x="0" y="0" width="1600" height="30" fill={color} />
      {s.map((t, i) => <path key={i} d={`M${t.x - t.w / 2} 20 L${t.x + t.w / 2} 20 L${t.x} ${20 + t.h} Z`} fill={`url(#stal${seed})`} />)}
    </svg>
  );
}

/* Glowing crystals growing from the ground */
export function Crystals({ seed = 9, color = '#5be7ff' }) {
  return (
    <div className="sp-crystals" style={{ '--cc': color }}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} style={{ left: (6 + rnd(i, seed) * 88) + '%', height: (6 + rnd(i, seed + 1) * 14) + 'vh', transform: `rotate(${(rnd(i, seed + 2) - 0.5) * 40}deg)`, animationDelay: -i * 0.7 + 's' }} />)}
    </div>
  );
}

/* Temple ruins: pillars and an arch, with hanging vines */
export function Ruins({ glow = '#7ff7ff' }) {
  return (
    <div className="sp-ruins" style={{ '--rg': glow }}>
      <span className="pillar p1" /><span className="pillar p2" /><span className="pillar p3" /><span className="pillar p4" />
      <span className="arch" /><span className="orb" />
    </div>
  );
}

/* Tall bookshelves with warm reading lamps */
export function Shelves() {
  return <div className="sp-shelves"><span /><span /><span /><span /></div>;
}

/* Server racks with blinking status LEDs */
export function Racks({ seed = 4 }) {
  return (
    <div className="sp-racks">
      {Array.from({ length: 7 }, (_, r) => (
        <div key={r} className="rack">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ background: rnd(r * 40 + i, seed) < 0.15 ? '#ff5b5b' : rnd(r * 40 + i, seed + 1) < 0.5 ? '#4dffb5' : '#5ab8ff', animationDelay: -(rnd(r * 40 + i, seed + 2) * 3) + 's' }} />)}</div>
      ))}
    </div>
  );
}

/* Night-market stalls with lanterns */
export function Stalls({ seed = 6 }) {
  return (
    <div className="sp-stalls">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="stall" style={{ left: (4 + i * 16) + '%', '--lc': ['#ff9d4a', '#ff5f6d', '#ffd36a', '#7affb2', '#ff9d4a', '#ff7ac8'][i] }}>
          <span className="roof" /><span className="lantern" style={{ animationDelay: -rnd(i, seed) * 3 + 's' }} /><span className="glow" />
        </div>
      ))}
    </div>
  );
}

/* A furnace mouth glowing from below */
export function Furnace({ x = 50 }) {
  return <div className="sp-furnace" style={{ left: x + '%' }}><span className="mouth" /><span className="heat" /></div>;
}

/* Gas-station canopy with hard white lights */
export function Canopy({ x = 55, w = 40 }) {
  return <div className="sp-canopy" style={{ left: x + '%', width: w + '%' }}><span className="roof" /><span className="light" /><span className="pool" /><span className="pump a" /><span className="pump b" /></div>;
}

/* Office tower interior: a wall of windows and screens */
export function Office() {
  return <div className="sp-office">{Array.from({ length: 5 }, (_, i) => <span key={i} className="screen" style={{ left: (8 + i * 19) + '%', animationDelay: -i * 0.9 + 's' }} />)}</div>;
}

/* A glowing display plinth with a product silhouette */
export function Plinth({ x = 50, color = '#fff0d6' }) {
  return <div className="sp-plinth" style={{ left: x + '%', '--pc': color }}><span className="item" /><span className="top" /><span className="base" /><span className="halo" /></div>;
}
