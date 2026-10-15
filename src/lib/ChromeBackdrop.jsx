import React from 'react';

// Minimal animated chrome 3D shapes behind each section (pure CSS, GPU-friendly, no images).
// Each scene gets its own composition so every page feels distinct.
const SCENES = {
  home:          ['sphere r1 big', 'torus s l1'],
  create:        ['sphere r1', 'torus l1'],
  canvas:        ['cube r2', 'sphere s l2'],
  film:          ['torus r1 big', 'capsule l1'],
  fashion:       ['blob r1', 'sphere s l1'],
  product:       ['cube r1', 'torus s l2'],
  marketing:     ['diamond r1', 'sphere s l1'],
  shorts:        ['capsule r1 tall', 'sphere s l2'],
  explainer:     ['torus r2', 'cube s l1'],
  influencer:    ['sphere r1 big', 'blob s l2'],
  voice:         ['rings r1', 'capsule s l1'],
  apps:          ['cube r1', 'cube s l2'],
  appbuild:      ['diamond r2', 'cube s l1'],
  designdocs:    ['torus r1', 'diamond s l2'],
  digiproduct:   ['blob r2', 'diamond s l1'],
  forge:         ['diamond r1 big', 'rings s l2'],
  spatial:       ['cube r1 big', 'torus s l1'],
  touchdesigner: ['rings r1', 'sphere s l2'],
  aimarket:      ['sphere r2', 'rings s l1'],
  styles:        ['blob r1', 'torus s l2'],
  characters:    ['sphere r1', 'capsule s l2'],
  locations:     ['torus r1 big', 'sphere s l1'],
  products:      ['diamond r1', 'cube s l2'],
  genjutsu:      ['rings r1', 'blob s l2'],
  admulti:       ['capsule r1 tall', 'diamond s l2'],
  library:       ['capsule r1', 'cube s l2'],
  models:        ['rings r1', 'cube s l1'],
  market:        ['diamond r2', 'sphere s l1'],
  update:        ['sphere r1', 'rings s l2'],
  settings:      ['cube r2', 'torus s l1'],
};

function Shape({ spec }) {
  const [kind, ...mods] = spec.split(' ');
  const cls = 'cb-shape cb-' + kind + ' ' + mods.map((m) => 'cb-' + m).join(' ');
  if (kind === 'cube') {
    return (
      <div className={cls}>
        <div className="cb-cube-inner">
          {['f', 'b', 'l', 'r', 't', 'd'].map((f) => <i key={f} className={'cb-face cb-' + f} />)}
        </div>
      </div>
    );
  }
  if (kind === 'rings') {
    return <div className={cls}><i /><i /><i /></div>;
  }
  return <div className={cls} />;
}

export default function ChromeBackdrop({ scene }) {
  const specs = SCENES[scene] || SCENES.create;
  return (
    <div className="chrome-backdrop" aria-hidden="true" key={scene}>
      {specs.map((s, i) => <Shape key={i} spec={s} />)}
    </div>
  );
}
