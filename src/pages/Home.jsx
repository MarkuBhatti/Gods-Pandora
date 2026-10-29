import React, { useEffect, useState } from 'react';
import { useNav } from '../lib/nav.jsx';
import { useStore } from '../lib/store.jsx';
import PandoraBox from '../lib/PandoraBox.jsx';
import Media from '../lib/Media.jsx';
import { Icon, bg , show, pageBg, PAGEPOS, NAV, TABS } from '../lib/ui.jsx';

// ⌂ Home — cinematic start screen: video hero + big prompt, studios, made-in-Pandora reel,
// an end-to-end workflow strip (every step labelled with its model) and your recent work.
// Images/videos here are placeholders until the final showcase media is supplied.
const SHOWCASE = [
  ['ai-night-ufo', 'Visitors', 'Made in Pandora'], ['ph-braided-river', 'Braided River', 'Photo · Haider Bhatti'], ['ai-billboards', 'Neon Rain', 'Made in Pandora'],
  ['ph-veil', 'Veil', 'Photo · Haider Bhatti'], ['ai-greenhouse', 'Overgrown', 'Made in Pandora'], ['ph-mountains', 'High Valley', 'Photo · Haider Bhatti'],
  ['ai-box-smoke', 'The Box', 'Made in Pandora'], ['ph-boat-sunset', 'Last Light', 'Photo · Haider Bhatti'], ['ai-mirrors', 'Mirror Hall', 'Made in Pandora'],
  ['ph-glacier', 'Glacier Veins', 'Photo · Haider Bhatti'], ['ai-cabin-fire', 'Ember Night', 'Made in Pandora'], ['ph-musicians', 'Courtyard Song', 'Photo · Haider Bhatti'],
  ['ai-umbrellas', 'Crowd in Red', 'Made in Pandora'], ['ph-terraces', 'Terraces', 'Photo · Haider Bhatti'], ['ai-hand-flame', 'Ignite', 'Made in Pandora'], ['ph-fort', 'Old Fort', 'Photo · Haider Bhatti'],
];
const VID = {};
const CARDS = [
  ['create', 'Studio', 'Image & video from one prompt', 'ai-night-ufo', null, 'Free on GPU'],
  ['film', 'Film', 'Cameras, film stocks, director styles', 'ai-rain-lot', null, 'Free on GPU'],
  ['fx', 'Effects', '51 real-time looks, AI subject mask', 'fx-split', null, 'New'],
  ['influencer', 'AI Influencer', 'Lock a face, post forever', 'ph-sea-girl', null, ''],
];
// One idea carried end to end: the same frame moves through every step (still → shot → cut → grade).
const FLOW = [['Hero still', 'FLUX.2 klein', 'ph-fire-portrait', 'local', { backgroundPosition: '50% 30%' }],
  ['Shot', 'Wan 2.2 5B', 'ph-fire-portrait', 'local', { backgroundSize: '170%', backgroundPosition: '52% 24%' }],
  ['Cut to music', 'AutoEdit', 'ph-fire-portrait', 'free', { backgroundSize: '150%', backgroundPosition: '28% 40%' }],
  ['Grade', 'Color · Teal & Orange', 'ph-fire-portrait', 'free', { backgroundPosition: '50% 30%', filter: 'saturate(1.25) contrast(1.08) hue-rotate(-8deg)' }]];

function HoverVideo({ src, poster }) {
  const ref = React.useRef(null);
  return (
    <div className="h-media" onMouseEnter={() => ref.current?.play?.().catch(() => {})} onMouseLeave={() => ref.current?.pause?.()}>
      <div className="h-im" style={{ backgroundImage: `url("${poster}")` }} />
      {src && <video ref={ref} className="h-im" src={src} muted loop playsInline preload="none" />}
    </div>
  );
}

// "Inside the box" — a guided overview of every section, each with the visual used on its own tab
const GROUP_LINE = { Create: 'Make images, film, photos, voice, music and 3D.', Edit: 'Cut, grade, animate and transform what you made.', Campaigns: 'Ads, influencers, fashion and product content that sells.',
  Build: 'Ready-made AI apps, tools you build from a sentence, and node pipelines.', World: 'Characters, places and products that stay the same in every shot.', Library: 'Your gallery, thousands of open models and the whole AI landscape.', System: 'Engine, connections, updates and settings.' };
function InsideTheBox({ go }) {
  const groups = NAV.filter(([g]) => g && g !== 'System');
  return (<>
    {groups.map(([g, items], gi) => (
      <section key={g} className="h-sec h-ib-sec">
        <div className="h-sec-h"><h2>{gi === 0 ? <>Inside the <em>box</em> · </> : null}{g}</h2><p>{items.length} studios — {GROUP_LINE[g]}</p></div>
        <div className="h-ib-grid">
          {items.map(([id, label, icon, , badge], i) => {
            const t = TABS[id] || [];
            const title = String(t[0] || label).replace(/\*/g, '');
            return (
              <button key={id} className={'h-ib' + (i === 0 ? ' big' : '')} onClick={() => go(id)}>
                <span className="h-ib-im" style={{ backgroundImage: `url("${pageBg(id, t[2])}")`, backgroundPosition: PAGEPOS[id] || undefined }} />
                <span className="h-ib-ov">
                  <span className="h-ib-k"><Icon name={icon} /> {label}{badge ? <i>{badge}</i> : null}</span>
                  <b>{title}</b>
                  <span className="h-ib-d">{t[1] || ''}</span>
                  <span className="h-ib-go">Open {label} →</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    ))}
  </>);
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
        <img className="h-hero-bg kb" src={show('ai-night-ufo')} alt="" />
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
              <HoverVideo src={null} poster={show(im) || bg(im)} />
              {tag && <span className={'h-tag' + (tag === 'New' ? ' new' : '')}>{tag}</span>}
              <span className="h-ov"><b>{t}</b><span>{s}</span></span>
            </button>
          ))}
        </div>
      </section>

      <section className="h-sec">
        <div className="h-sec-h"><h2>Made in <em>Pandora</em></h2><p>Every frame below was created inside God's Pandora.</p><a onClick={() => go('library')}>Your gallery →</a></div>
        <div className="h-reel">
          <div className="h-rv big"><img className="kb" src={show('ai-cabin-fire')} alt="" /><span className="h-rl"><b>Ember Night</b><span>Made in Pandora</span></span></div>
          <div className="h-rv"><img src={show('ai-hand-flame')} alt="" /><span className="h-rl"><b>Ignite</b><span>Made in Pandora</span></span></div>
          <div className="h-rv"><img src={show('ai-portrait')} alt="" /><span className="h-rl"><b>Window Light</b><span>Made in Pandora</span></span></div>
          <div className="h-rv"><img src={show('ai-greenhouse')} alt="" /><span className="h-rl"><b>Overgrown</b><span>Made in Pandora</span></span></div>
          <div className="h-rv"><img src={show('ai-box-smoke')} alt="" /><span className="h-rl"><b>The Box</b><span>Made in Pandora</span></span></div>
        </div>
      </section>

      <InsideTheBox go={go} />

      <section className="h-sec">
        <div className="h-sec-h"><h2>One idea, <em>end to end</em></h2><p>Every step shows the model that made it.</p><a onClick={() => window.dispatchEvent(new Event('pandora:pandy'))}>Ask Pandy to run it →</a></div>
        <div className="h-flow">
          {FLOW.map(([n, m, im, f, st], i) => (
            <React.Fragment key={n}>
              {i > 0 && <div className="h-edge"><i /></div>}
              <div className="h-node"><div className="h-nh">{n}<span>{m}</span></div><div className="h-nim" style={{ backgroundImage: `url("${show(im) || bg(im)}")`, ...(st || {}) }} /><div className="h-nf"><span>{f}</span><b>✓ ready</b></div></div>
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
