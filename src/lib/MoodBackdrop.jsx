import React from 'react';
import { Skyline, Car, Trails, Interior, Spots, Neon, Billboard, StringLights, Bridge, Moon, Pines, Cabin, Campfire, Stalactites, Crystals, Ruins, Shelves, Racks, Stalls, Furnace, Canopy, Office, Plinth } from './SceneProps.jsx';

// Cinematic mood lighting behind every page — fog, volumetric lamps, neon glow, wet reflective ground,
// rain / embers / dust and film grain. Everything is drawn procedurally (no photos), in moods inspired by
// night photography and game-cinematic lighting: neon fog, teal night, dystopia, firelight, candle cave,
// jade ruins and jungle rain.
//
// A mood = palette + lamp positions + particle type. Each page picks one (PAGE_MOOD below).

const MOODS = {
  // green fog washing a building, warm neon sign
  neonfog: { sky: ['#030806', '#06140d', '#0a1a12'], fog: ['rgba(60,220,140,.30)', 'rgba(40,160,110,.22)', 'rgba(20,90,60,.25)'],
    ground: '#060a07', lamps: [{ x: 12, y: 30, c: '#7dffb2', s: 1.6, cone: true }, { x: 74, y: 38, c: '#ff9d4a', s: .9, neon: true }, { x: 58, y: 44, c: '#fff1c9', s: .35 }, { x: 64, y: 44, c: '#fff1c9', s: .35 }, { x: 70, y: 44, c: '#fff1c9', s: .35 }],
    particles: 'dust', horizon: 'rgba(80,255,170,.10)' },
  // deep teal night, rows of cold street lamps, glassy wet asphalt
  tealnight: { sky: ['#02070b', '#04121a', '#061a22'], fog: ['rgba(40,140,170,.22)', 'rgba(20,90,120,.25)', 'rgba(10,60,80,.25)'],
    ground: '#03090c', lamps: [{ x: 8, y: 46, c: '#d8f3ff', s: .5, cone: true }, { x: 22, y: 47, c: '#d8f3ff', s: .45, cone: true }, { x: 36, y: 48, c: '#d8f3ff', s: .4 }, { x: 64, y: 48, c: '#ffd9a8', s: .4 }, { x: 78, y: 47, c: '#d8f3ff', s: .45, cone: true }, { x: 92, y: 46, c: '#ff5a4f', s: .55, neon: true }],
    particles: 'rain', horizon: 'rgba(120,220,255,.14)', city: true },
  // teal haze, sodium lamps, a warm glow floating overhead
  dystopia: { sky: ['#03080a', '#071418', '#0b1d20'], fog: ['rgba(70,150,150,.24)', 'rgba(255,170,90,.10)', 'rgba(30,90,100,.25)'],
    ground: '#050a0b', lamps: [{ x: 18, y: 40, c: '#fff4dc', s: 1.1, cone: true }, { x: 70, y: 36, c: '#fff4dc', s: 1, cone: true }, { x: 92, y: 42, c: '#fff4dc', s: .7, cone: true }, { x: 56, y: 14, c: '#ffb560', s: 1.3 }, { x: 6, y: 48, c: '#ffcf8a', s: .45 }],
    particles: 'rain', horizon: 'rgba(255,190,120,.10)', city: true },
  // firelight in a dark forest
  firelight: { sky: ['#06070c', '#0b0b14', '#130d0a'], fog: ['rgba(255,120,40,.16)', 'rgba(70,80,120,.18)', 'rgba(120,60,30,.18)'],
    ground: '#0b0805', lamps: [{ x: 50, y: 40, c: '#ffb04a', s: 1.6, fire: true }, { x: 20, y: 56, c: '#ff9d3a', s: .6, fire: true }, { x: 84, y: 34, c: '#ffc061', s: .7, fire: true }, { x: 90, y: 52, c: '#ff8a2a', s: .45, fire: true }],
    particles: 'embers', horizon: 'rgba(255,140,60,.10)', trees: true },
  // candle-lit cave, amber stone
  cave: { sky: ['#0a0603', '#160d06', '#22140a'], fog: ['rgba(255,170,90,.18)', 'rgba(140,80,40,.22)', 'rgba(60,35,20,.30)'],
    ground: '#120a05', lamps: [{ x: 16, y: 62, c: '#ffbf6b', s: .55, fire: true }, { x: 68, y: 70, c: '#ffbf6b', s: .45, fire: true }, { x: 42, y: 30, c: '#ffd9a0', s: 1.5 }, { x: 88, y: 58, c: '#ffae55', s: .5, fire: true }],
    particles: 'dust', horizon: 'rgba(255,190,120,.08)', arch: true },
  // overgrown temple, jade glow and god rays
  jade: { sky: ['#030806', '#071410', '#0c1c14'], fog: ['rgba(90,220,180,.20)', 'rgba(220,190,110,.12)', 'rgba(30,90,70,.24)'],
    ground: '#06100b', lamps: [{ x: 60, y: 26, c: '#7ff7ff', s: 1.4 }, { x: 24, y: 52, c: '#ffcb7a', s: .45, fire: true }, { x: 80, y: 56, c: '#ffcb7a', s: .4, fire: true }],
    particles: 'dust', horizon: 'rgba(120,255,220,.08)', rays: true, vines: true },
  // ruined warehouse, jungle rain falling through a hole, fires
  jungle: { sky: ['#040805', '#0a120a', '#0f160c'], fog: ['rgba(140,220,140,.16)', 'rgba(255,140,60,.12)', 'rgba(40,80,40,.25)'],
    ground: '#070a06', lamps: [{ x: 50, y: 18, c: '#e9ffe0', s: 1.5 }, { x: 12, y: 58, c: '#ff8e3a', s: .55, fire: true }, { x: 90, y: 58, c: '#ff8e3a', s: .55, fire: true }],
    particles: 'rain', horizon: 'rgba(160,255,160,.08)', rays: true, vines: true },
};

// Every page gets its own set: same moody light language, different place.
const L = (x, y, c, s, o = {}) => ({ x, y, c, s, ...o });
const SETS = {
  home: { lamps: [L(16, 40, '#fff4dc', 1, { cone: true }), L(84, 38, '#fff4dc', .9, { cone: true }), L(58, 12, '#ffb560', 1.2)],
    props: () => <><Moon x={70} y={9} size={6} /><Skyline seed={11} top={30} h={31} warm={.55} /><Car x={58} y={71} scale={1.05} dir="l" /><Car x={-12} y={77} scale={1.25} moving dur={38} /></> },
  create: { lamps: [L(10, 28, '#7dffb2', 1.7, { cone: true }), L(54, 47, '#fff1c9', .3), L(60, 47, '#fff1c9', .3), L(66, 47, '#fff1c9', .3)],
    props: () => <><Skyline seed={3} top={22} h={40} warm={.2} density={.12} tint="#06100b" /><Neon text="STUDIO" color="#ff9d4a" x={72} y={36} size={2.6} /><Car x={34} y={72} scale={1.1} body="#0c1410" /></> },
  canvas: { lamps: [L(30, 50, '#d8f3ff', .45), L(70, 50, '#d8f3ff', .45)], props: () => <><Skyline seed={21} top={26} h={30} warm={.35} /><Bridge y={44} /><Trails y={60} /></> },
  film: { lamps: [L(8, 44, '#d8f3ff', .55, { cone: true }), L(24, 46, '#d8f3ff', .5, { cone: true }), L(44, 47, '#d8f3ff', .45, { cone: true }), L(90, 45, '#d8f3ff', .55, { cone: true })],
    props: () => <><Billboard x={70} y={42} color="#ff4d4d" text="CINEMA" /><Car x={36} y={70} scale={1.15} /><Car x={66} y={72} scale={.95} dir="l" body="#0e1218" /></> },
  // a colourist's grading suite at night: dim room, bias-lit monitors, city through the window
  cut: { lamps: [L(30, 50, '#7ab8ff', .5), L(50, 50, '#ffb36b', .5), L(70, 50, '#7ab8ff', .5)],
    props: () => <><Interior pendants={[50]} windows={[{ x: 4, w: 30, y: 12, h: 34 }]} desk={66} warm="#ff9d5c" /><Neon text="EDIT" color="#4fd1ff" x={78} y={22} size={2.1} /><Neon text="● REC" color="#ff4d4d" x={20} y={56} size={1.4} box={false} /></> },
  agent: { lamps: [L(50, 26, '#b98bff', 1.1), L(20, 60, '#4fd1ff', .5), L(80, 60, '#ffb36b', .5)],
    props: () => <><Skyline seed={77} top={34} h={30} warm={.35} density={.3} /><Neon text="AGENT" color="#b98bff" x={74} y={30} size={2.2} /><Trails y={62} /></> },
  color: { lamps: [L(24, 50, '#4fd1ff', .45), L(50, 50, '#b98bff', .5), L(76, 50, '#ffb36b', .45)],
    props: () => <><Interior pendants={[]} windows={[{ x: 68, w: 26, y: 12, h: 30 }]} desk={66} warm="#7aa2ff" /><Neon text="COLOR" color="#b98bff" x={22} y={22} size={2} /></> },
  photo: { lamps: [L(18, 30, '#fff4dc', 1, { cone: true }), L(82, 30, '#fff4dc', 1, { cone: true })],
    props: () => <><Interior pendants={[]} windows={[]} warm="#fff0d6" /><Spots xs={[22, 50, 78]} color="#fff6e6" /><Plinth x={50} color="#ffe2c4" /></> },
  fashion: { lamps: [], props: () => <Interior pendants={[24, 50, 76]} windows={[{ x: 6, w: 18 }, { x: 78, w: 16 }]} warm="#ffd7a1" /> },
  product: { lamps: [], props: () => <><Interior pendants={[]} windows={[]} warm="#fff0d6" /><Spots xs={[18, 38, 62, 82]} /><Plinth x={38} /><Plinth x={62} color="#ffd2a8" /></> },
  marketing: { lamps: [L(12, 42, '#fff1c9', .6, { cone: true })], props: () => <><Skyline seed={5} top={24} h={38} warm={.7} density={.32} /><Neon text="OPEN 24H" color="#ff4fa3" x={30} y={44} size={2.2} /><Neon text="NOODLES" color="#57ffcf" x={78} y={30} size={2} tilt={-4} /><Car x={-14} y={76} scale={1.2} moving dur={30} /><Car x={110} y={73} scale={1} dir="l" moving dur={42} delay={-12} /></> },
  admulti: { lamps: Array.from({ length: 6 }, (_, i) => L(6 + i * 18, 44 + (i % 2), '#ffcf8a', .5, { cone: true })), props: () => <><Trails y={58} /><Billboard x={60} y={28} color="#ffb347" text="NEW" /></> },
  genjutsu: { lamps: [L(52, 30, '#7ff7ff', 1.3)], props: () => <Ruins glow="#7ff7ff" /> },
  shorts: { lamps: [], props: () => <><Moon x={20} y={12} size={8} /><Skyline seed={33} top={40} h={22} warm={.5} density={.34} /><StringLights y={18} sag={8} /><StringLights y={26} sag={6} color="#ffe2a8" x1={8} x2={92} n={18} /></> },
  explainer: { lamps: [L(16, 62, '#ffbf6b', .55, { fire: true }), L(70, 70, '#ffbf6b', .45, { fire: true }), L(88, 58, '#ffae55', .5, { fire: true })], props: () => <Stalactites seed={5} /> },
  influencer: { lamps: [L(58, 52, '#ffb45a', .9, { fire: true })], props: () => <><Moon x={82} y={10} size={5} color="#ffe9c9" /><Pines seed={7} top={26} h={36} /><Cabin x={58} y={48} /><StringLights y={46} sag={4} x1={44} x2={74} n={12} /></> },
  voice: { lamps: [], props: () => <><Interior pendants={[50]} floor={14} windows={[{ x: 70, w: 22, y: 16, h: 30 }]} warm="#ffb36b" /><Neon text="ON AIR" color="#ff3b3b" x={50} y={26} size={2.4} /></> },
  apps: { lamps: [L(50, 16, '#e9ffe0', 1.5), L(12, 58, '#ff8e3a', .55, { fire: true }), L(90, 58, '#ff8e3a', .55, { fire: true })], props: () => <Stalls seed={2} /> },
  appbuild: { lamps: [], props: () => <><Interior pendants={[]} windows={[{ x: 4, w: 92, y: 10, h: 44 }]} desk={70} warm="#cfe8ff" /><Office /></> },
  designdocs: { lamps: [], props: () => <Interior pendants={[]} windows={[{ x: 10, w: 30, y: 14, h: 40 }]} desk={64} floor={88} warm="#ffd59a" /> },
  digiproduct: { lamps: [L(20, 52, '#ffb04a', .5, { fire: true }), L(80, 50, '#ffb04a', .5, { fire: true })], props: () => <><StringLights y={14} sag={10} /><StringLights y={22} sag={8} color="#ff9d6a" /><Stalls seed={8} /></> },
  forge: { lamps: [], props: () => <Furnace x={50} /> },
  spatial: { lamps: [L(40, 28, '#9ff4ff', 1.2)], props: () => <><Stalactites seed={13} color="#07090d" lit="#2c5a6a" /><Crystals seed={9} color="#5be7ff" /></> },
  touchdesigner: { lamps: [L(50, 20, '#b77bff', 1)], props: () => <><Spots xs={[15, 35, 65, 85]} color="#9a7bff" sweep /><StringLights y={30} sag={5} color="#7affd9" /></> },
  aimarket: { lamps: [], props: () => <><Moon x={14} y={10} size={5} /><Skyline seed={44} top={24} h={36} warm={.45} density={.36} /><Bridge y={50} /><Trails y={63} /></> },
  styles: { lamps: [L(30, 14, '#e9ffe0', 1.2), L(72, 14, '#e9ffe0', 1)], props: () => <StringLights y={36} sag={5} color="#ffcb7a" n={16} /> },
  characters: { lamps: [L(50, 66, '#ffb04a', 1.1, { fire: true })], props: () => <><Moon x={18} y={12} size={6} color="#fff1d6" /><Pines seed={19} top={24} h={42} /><Campfire x={50} y={70} /></> },
  locations: { lamps: [L(30, 54, '#ffcb7a', .45, { fire: true }), L(70, 54, '#ffcb7a', .45, { fire: true })], props: () => <Ruins glow="#9dffb0" /> },
  products: { lamps: [L(20, 34, '#fff4dc', .9, { cone: true }), L(80, 34, '#fff4dc', .9, { cone: true })], props: () => <><Car x={40} y={68} scale={1.5} body="#0d1114" /><Billboard x={82} y={50} color="#5ab8ff" text="DOCK 3" /></> },
  library: { lamps: [L(50, 26, '#7ff7ff', 1)], props: () => <><Shelves /><Interior pendants={[30, 70]} windows={[]} warm="#ffcf86" /></> },
  market: { lamps: [], props: () => <><StringLights y={12} sag={9} color="#ff9d4a" /><StringLights y={20} sag={7} color="#7affb2" /><Stalls seed={4} /></> },
  models: { lamps: [], props: () => <Racks seed={4} /> },
  update: { lamps: [L(12, 40, '#7dffb2', .9, { cone: true })], props: () => <><Canopy x={58} w={44} /><Neon text="OPEN" color="#ff9d4a" x={22} y={46} size={2.2} /><Car x={48} y={70} scale={1.1} /></> },
  settings: { lamps: [L(70, 40, '#d8f3ff', .8, { cone: true })], props: () => <><Skyline seed={55} top={30} h={30} warm={.4} density={.18} /><Car x={58} y={71} scale={1.05} dir="l" body="#0a0e12" /></> },
};

const PAGE_MOOD = {
  home: 'dystopia', create: 'neonfog', canvas: 'tealnight', film: 'tealnight', cut: 'neonfog', agent: 'neonfog', color: 'tealnight', photo: 'dystopia', fashion: 'neonfog', product: 'dystopia',
  marketing: 'neonfog', admulti: 'dystopia', genjutsu: 'jade', shorts: 'tealnight', explainer: 'cave', influencer: 'firelight',
  voice: 'cave', apps: 'jungle', appbuild: 'tealnight', designdocs: 'dystopia', digiproduct: 'firelight', forge: 'firelight',
  spatial: 'cave', touchdesigner: 'jade', aimarket: 'tealnight', styles: 'jungle', characters: 'firelight', locations: 'jungle',
  products: 'dystopia', library: 'jade', market: 'jungle', models: 'tealnight', update: 'neonfog', settings: 'tealnight',
};

// deterministic pseudo-random so every page looks the same each visit
const rnd = (i, s = 1) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

function Lamp({ l, i }) {
  const size = 34 * l.s;
  return (
    <div className={'mb-lamp' + (l.fire ? ' fire' : '') + (l.neon ? ' neon' : '')} style={{ left: l.x + '%', top: l.y + '%', '--lc': l.c, '--ls': size + 'vmin', animationDelay: -(i * 1.7) + 's' }}>
      <span className="mb-bloom" />
      {l.cone && <span className="mb-cone" />}
      <span className="mb-core" />
      <span className="mb-reflect" />
    </div>
  );
}

export default function MoodBackdrop({ scene = 'home' }) {
  const key = PAGE_MOOD[scene] || 'dystopia';
  const m = MOODS[key];
  const set = SETS[scene] || SETS.home;
  const lamps = set.lamps || m.lamps;
  const n = m.particles === 'rain' ? 70 : m.particles === 'embers' ? 34 : 40;
  return (
    <div className={'mood mood-' + key + ' scene-' + scene} aria-hidden="true" key={scene}
      style={{ '--sky0': m.sky[0], '--sky1': m.sky[1], '--sky2': m.sky[2], '--fog0': m.fog[0], '--fog1': m.fog[1], '--fog2': m.fog[2], '--ground': m.ground, '--hz': m.horizon }}>
      <div className="mb-sky" />
      {m.rays && <div className="mb-rays" />}
      
      
      {m.vines && <div className="mb-vines" />}
      {false && m.city && (
        <div className="mb-city">
          {Array.from({ length: 46 }, (_, i) => (
            <i key={i} style={{ left: (rnd(i) * 100) + '%', bottom: (rnd(i, 2) * 3) + '%', opacity: .35 + rnd(i, 3) * .6, background: rnd(i, 4) > .8 ? '#ffb46a' : rnd(i, 4) > .6 ? '#ff6a5c' : '#bfe9ff' }} />
          ))}
        </div>
      )}
      <div className="mb-fog f0" /><div className="mb-fog f1" />
      <div className="mb-ground" />
      <div className="mb-props">{set.props && set.props()}</div>
      <div className="mb-fog f2" />
      {lamps.map((l, i) => <Lamp key={i} l={l} i={i} />)}
      <div className={'mb-particles p-' + m.particles}>
        {Array.from({ length: n }, (_, i) => (
          <i key={i} style={{ left: (rnd(i, 5) * 100) + '%', animationDuration: (m.particles === 'rain' ? .7 + rnd(i, 6) * .6 : 7 + rnd(i, 6) * 9) + 's', animationDelay: -(rnd(i, 7) * 12) + 's', opacity: .25 + rnd(i, 8) * .55, '--px': (rnd(i, 9) * 60 - 30) + 'px' }} />
        ))}
      </div>
      <div className="mb-haze" />
      <div className="mb-grain" />
      <div className="mb-vignette" />
    </div>
  );
}
