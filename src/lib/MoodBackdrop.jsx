import React from 'react';
import { pageBg } from './ui.jsx';

// Brand backdrop (v1.0): Obsidian stage, the page's showcase image as a far-away, softly blurred light source,
// a warm Solar-Sand glow from above and fine film grain. Calm on purpose — the work in front is the hero.
export default function MoodBackdrop({ scene }) {
  const im = pageBg(scene);
  return (
    <div className="bd" aria-hidden="true">
      <div className="bd-img" style={{ backgroundImage: `url("${im}")` }} />
      <div className="bd-glow" />
      <div className="bd-vig" />
      <div className="bd-grain" />
    </div>
  );
}
