import React, { useEffect, useState } from 'react';
import { useNav } from '../lib/nav.jsx';
import { useStore } from '../lib/store.jsx';
import PandoraBox from '../lib/PandoraBox.jsx';
import Media from '../lib/Media.jsx';
import { Icon, bg } from '../lib/ui.jsx';
import vFilm from '../assets/home/film.mp4';
import vShorts from '../assets/home/shorts.mp4';
import vMarketing from '../assets/home/marketing.mp4';
import vInfluencer from '../assets/home/influencer.mp4';

// ⌂ Home — cinematic start screen: video hero + big prompt, studios, made-in-Pandora reel,
// an end-to-end workflow strip (every step labelled with its model) and your recent work.
// Images/videos here are placeholders until the final showcase media is supplied.
const VID = { film: vFilm, shorts: vShorts, marketing: vMarketing, influencer: vInfluencer };
const CARDS = [
  ['create', 'Studio', 'Image & video from one prompt', 'create', null, 'FREE ON GPU'],
  ['cut', 'AutoEdit', 'Clips + music → finished cut', 'shorts', 'shorts', 'NEW'],
  ['film', 'Film', 'Film stocks, cameras, director styles', 'film', 'film', 'FREE ON GPU'],
  ['influencer', 'AI Influencer', 'Lock a face, post forever', 'influencer', 'influencer', ''],
];
const FLOW = [['Hero still', 'FLUX.2 klein', 'create', 'local'], ['Shot', 'Wan 2.2 5B', 'film', 'local'], ['Cut to music', 'AutoEdit', 'shorts', 'free'], ['Grade', 'Color · Teal & Orange', 'marketing', 'free']];

function HoverVideo({ src, poster }) {
  const ref = React.useRef(null);
  return (
    <div className="h-media" onMouseEnter={() => ref.current?.play?.().catch(() => {})} onMouseLeave={() => ref.current?.pause?.()}>
      <div className="h-im" style={{ backgroundImage: `url(${poster})` }} />
      {src && <video ref={ref} className="h-im" src={src} muted loop playsInline preload="none" />}
    </div>
  );
}

export default function Home() {
  const { go } = useNav();
  const store = useStore() || {};
  const db = store.db || {};
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState('image');
  const [engine, setEngine] = useState(null);
  useEffect(() => { window.api?.engine?.status?.().then(setEngine).catch(() => setEngine({})); }, []);
  const recent = (db.generations || []).filter((g) => g && g.file && g.kind !== 'audio').slice(0, 8);
  const start = () => go('create', { kind, prompt: prompt.trim() });

  return (
    <div className="h-page">
      <section className="h-hero">
        <video className="h-hero-bg" src={VID.film} poster={bg('film')} autoPlay muted loop playsInline />
        <div className="h-hero-box"><PandoraBox size={112} /></div>
        <div className="h-eyebrow">Every model · Every medium · No credits</div>
        <h1 className="h-display">Make anything.<br /><em>Own everything.</em></h1>
        <p className="h-lede">Image, video, audio, 3D and live visuals — on your own keys or free on your GPU. Same face, same place, same product, every shot.</p>
        <div className="h-composer">
          <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A lone figure walking through a neon-lit alley in the rain, anamorphic, 35mm grain…"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start(); } }} />
          <div className="h-crow">
            <div className="h-tabs">
              {[['image', 'img', 'Image'], ['video', 'film', 'Video'], ['audio', 'mic', 'Audio']].map(([k, ic, l]) => (
                <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}><Icon name={ic} />{l}</button>
              ))}
            </div>
            <button className="h-chip" onClick={() => go('market')}><span className={'h-dot' + (engine?.installed ? '' : ' off')} />{engine == null ? '…' : engine.installed ? 'Local engine ready' : 'Set up free local engine'}</button>
            <button className="h-chip" onClick={() => go('characters')}>@ Character</button>
            <button className="h-chip" onClick={() => go('locations')}>@ Location</button>
            <button className="h-gen" onClick={start}>Generate <small>{kind === 'audio' ? 'voice & music' : 'free on GPU'}</small></button>
          </div>
        </div>
      </section>

      <section className="h-sec">
        <div className="h-sec-h"><h2>Start <em>creating</em></h2><p>Pick a studio, or ask Pandy on the right.</p></div>
        <div className="h-cards">
          {CARDS.map(([id, t, s, im, vid, tag]) => (
            <button key={id} className="h-card" onClick={() => go(id)}>
              <HoverVideo src={vid && VID[vid]} poster={bg(im)} />
              {tag && <span className={'h-tag' + (tag === 'NEW' ? ' new' : '')}>{tag}</span>}
              <span className="h-ov"><b>{t}</b><span>{s}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className="h-sec">
        <div className="h-sec-h"><h2>Made in <em>Pandora</em></h2><p>Every piece shows the model that made it.</p><a onClick={() => go('library')}>See all →</a></div>
        <div className="h-reel">
          <div className="h-rv big"><video src={VID.marketing} autoPlay muted loop playsInline /><span className="h-rl"><b>Night Shift</b><span>Wan 2.2 5B · local</span></span><i className="h-play">▶</i></div>
          <div className="h-rv"><video src={VID.shorts} autoPlay muted loop playsInline /><span className="h-rl"><b>Alley Run</b><span>LTX · cloud</span></span><i className="h-play">▶</i></div>
          <div className="h-rv"><video src={VID.influencer} autoPlay muted loop playsInline /><span className="h-rl"><b>Mara, Day 12</b><span>Identity Lock · Wan</span></span><i className="h-play">▶</i></div>
          <div className="h-rv"><img src={bg('fashion')} alt="" /><span className="h-rl"><b>Atelier</b><span>FLUX.2 klein · local</span></span></div>
          <div className="h-rv"><img src={bg('product')} alt="" /><span className="h-rl"><b>Amber No. 5</b><span>Product Lock · SDXL</span></span></div>
        </div>
      </section>

      <section className="h-sec">
        <div className="h-sec-h"><h2>One idea, <em>end to end</em></h2><p>Every step shows the model that made it.</p><a onClick={() => window.dispatchEvent(new Event('pandora:pandy'))}>Ask Pandy to run it →</a></div>
        <div className="h-flow">
          {FLOW.map(([n, m, im, f], i) => (
            <React.Fragment key={n}>
              {i > 0 && <div className="h-edge"><i /></div>}
              <div className="h-node"><div className="h-nh">{n}<span>{m}</span></div><div className="h-nim" style={{ backgroundImage: `url(${bg(im)})` }} /><div className="h-nf"><span>{f}</span><b>✓ ready</b></div></div>
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className="h-sec">
        <div className="h-sec-h"><h2>Recent <em>creations</em></h2><a onClick={() => go('library')}>Open gallery →</a></div>
        {recent.length ? (
          <div className="h-gal">{recent.map((g) => <button key={g.id || g.file} className="h-gi" title={g.prompt || ''} onClick={() => go('library')}><Media file={g.file} kind={g.kind} /><span>{g.model || g.provider || g.kind}</span></button>)}</div>
        ) : (
          <div className="h-empty">Nothing here yet — your images and videos will appear here. <button className="h-chip" onClick={() => go('create')}>Make your first one →</button></div>
        )}
      </section>
    </div>
  );
}
