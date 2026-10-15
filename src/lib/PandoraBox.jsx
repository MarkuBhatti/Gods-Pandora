import React from 'react';
import left from '../assets/pandora/face_left.jpg';
import right from '../assets/pandora/face_right.jpg';
import back from '../assets/pandora/face_back.jpg';
import side from '../assets/pandora/face_side.jpg';
import top from '../assets/pandora/face_top.jpg';
import burst from '../assets/pandora/burst.webp';
import aura from '../assets/pandora/aura.webp';

// The living Pandora box: the four painted faces of the logo are mapped onto a real 3D box that
// revolves; the energy burst rises out of the open lid and the cosmic aura breathes underneath.
// Every texture is cut straight from the original artwork, so its detail is untouched.
// `size` = edge length of the box in px. `still` = no motion (accessibility / thumbnails).
const SPARKS = Array.from({ length: 18 }, (_, i) => ({
  x: ((i * 37) % 100), d: 3 + ((i * 7) % 5), delay: -((i * 13) % 9), s: 2 + (i % 3),
}));

export default function PandoraBox({ size = 140, still = false, sparks = true, className = '' }) {
  return (
    <div className={'pbox' + (still ? ' still' : '') + (className ? ' ' + className : '')} style={{ '--s': size + 'px' }} role="img" aria-label="God's Pandora — the living Pandora box">
      <img className="pbox-aura" src={aura} alt="" draggable="false" />
      <div className="pbox-ring" />
      <div className="pbox-tilt">
        <div className="pbox-spin">
          <div className="pbox-face f-front" style={{ backgroundImage: `url(${left})` }} />
          <div className="pbox-face f-right" style={{ backgroundImage: `url(${right})` }} />
          <div className="pbox-face f-back" style={{ backgroundImage: `url(${back})` }} />
          <div className="pbox-face f-left" style={{ backgroundImage: `url(${side})` }} />
          <div className="pbox-face f-top" style={{ backgroundImage: `url(${top})` }} />
          <div className="pbox-face f-bottom" />
          <div className="pbox-core" />
        </div>
      </div>
      <img className="pbox-burst" src={burst} alt="" draggable="false" />
      {sparks && !still && (
        <div className="pbox-sparks">
          {SPARKS.map((p, i) => (
            <i key={i} style={{ left: p.x + '%', width: p.s, height: p.s, animationDuration: p.d + 's', animationDelay: p.delay + 's' }} />
          ))}
        </div>
      )}
      <div className="pbox-scan" />
    </div>
  );
}
