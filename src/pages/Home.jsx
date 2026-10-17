import React, { useEffect, useState } from 'react';
import { useNav } from '../lib/nav.jsx';
import { useStore } from '../lib/store.jsx';
import PandoraBox from '../lib/PandoraBox.jsx';
import Media from '../lib/Media.jsx';

// ⌂ Home — the start screen: everything God's Pandora can make, grouped by what you want to create.
const GROUPS = [
  ['🖼 Image', [
    ['agent', '🤖', 'Pandora Agent', 'Tell it the job — it delivers the whole launch package'],
    ['create', '✦', 'Create', 'Any image model — cloud keys or your own GPU'],
    ['styles', '❖', 'Visual Styles', 'Looks you can apply to anything'],
    ['fashion', '✂', 'Fashion', 'Outfit swap, lookbooks, flat lays'],
    ['product', '◍', 'Product', 'Packshots, lifestyle, 360 turntables'],
    ['photo', '📷', 'Photo Retouch', 'Auto enhance, skin, blemishes, teeth, colour match'],
  ]],
  ['🎬 Video', [
    ['film', '🎬', 'Film Studio', 'Multi-shot films with cameras, lenses, grain'],
    ['cut', '🎞', 'AutoEdit', 'Style templates, beat-synced cuts, best moments, jump cuts (free)'],
    ['color', '🎨', 'Color', 'Auto balance, looks, reference match, LUT export (free)'],
    ['genjutsu', '🌀', 'Shapeshift', 'Motion transfer, swap, restyle any video'],
    ['shorts', '📱', 'Shorts', 'Talking-head vertical videos'],
    ['explainer', '🎓', 'Explainer', 'Topic → captioned explainer video'],
  ]],
  ['🎧 Audio', [
    ['voice', '🎙', 'Voice & Audio', 'Voiceover, character voices, music, SFX'],
    ['market', '🧩', 'Music & voice apps', 'ACE-Step, YuE, Applio, F5-TTS via Pinokio'],
  ]],
  ['🧊 3D & real-time', [
    ['spatial', '🧊', '3D & Spatial', 'Image-to-3D, scenes, spatial media'],
    ['touchdesigner', '⬡', 'TouchDesigner', 'Live AI visuals over OSC / WebSocket'],
    ['canvas', '⚛', 'Node Canvas', 'Chain cloud + local models in one graph'],
  ]],
  ['📣 Marketing & people', [
    ['marketing', '📣', 'Marketing', 'URL to ad, UGC, hooks, A/B batches'],
    ['admulti', '📈', 'Ad Multiplier', 'One winning ad → many variants'],
    ['influencer', '🌟', 'AI Influencer', 'Persistent personas with Identity Lock'],
    ['characters', '☺', 'Characters', 'Same face everywhere'],
    ['locations', '⌖', 'Locations', 'Location Lock — same place every shot'],
    ['products', '📦', 'Products & Brand', 'Same product in every ad'],
  ]],
  ['🛠 Build', [
    ['forge', '⚒', 'App Forge', 'Describe an app → it runs'],
    ['appbuild', '🛠', 'App Building', 'Screens, flows, assets'],
    ['designdocs', '📐', 'Design Docs', 'Specs and design systems'],
    ['digiproduct', '📦', 'Digital Products', 'Templates, packs, printables'],
    ['apps', '⊞', 'Apps', '41 one-click AI apps'],
  ]],
  ['⬢ Models', [
    ['market', '🛒', 'Model Market', 'Hugging Face, Civitai, Pinokio, Ollama — one search'],
    ['models', '⬢', 'Models', 'Cloud roster + local engine'],
    ['aimarket', '🌐', 'AI Market', 'Discover AI tools and services'],
    ['library', '▦', 'Library', 'Everything you have made'],
  ]],
];

export default function Home() {
  const { go } = useNav();
  const store = useStore() || {};
  const db = store.db || {};
  const [keys, setKeys] = useState(null);
  const [engine, setEngine] = useState(null);
  useEffect(() => {
    window.api?.keysList?.().then((k) => setKeys(Object.values(k || {}).filter(Boolean).length)).catch(() => setKeys(0));
    window.api?.engine?.status?.().then(setEngine).catch(() => setEngine({}));
  }, []);
  const recent = (db.generations || []).filter((g) => g && g.file && g.kind !== 'audio').slice(0, 8);
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState('image');
  const start = () => go('create', { kind, prompt: prompt.trim() });

  return (
    <div className="home">
      <div className="home-hero">
        <PandoraBox size={118} />
        <div className="home-hero-text">
          <div className="home-eyebrow">GOD'S PANDORA</div>
          <h1 className="home-title">What will you create today?</h1>
          <p className="sub" style={{ margin: '6px 0 14px' }}>Every model. Every medium. One creative universe.</p>
          <div className="prompt-dock">
            <div className="seg">
              {[['image', '🖼 Image'], ['video', '🎬 Video'], ['audio', '🎧 Audio']].map(([k, l]) => (
                <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>
              ))}
            </div>
            <input value={prompt} placeholder="Describe anything… a neon city at dawn, a lo-fi beat, a product ad" onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} />
            <button className="btn go" onClick={start}>Create ✦</button>
          </div>
          <div className="quick-row">
            <button className="chip" onClick={() => go('admulti')}>📈 Remix a winning ad</button>
            <button className="chip" onClick={() => go('genjutsu')}>🌀 Shapeshift a video</button>
            <button className="chip" onClick={() => go('influencer')}>🌟 Build an AI influencer</button>
            <button className="chip" onClick={() => go('market')}>🧩 Get music &amp; voice apps</button>
          </div>
        </div>
      </div>

      <div className="home-status">
        <button className="chip" onClick={() => go('settings')}>{keys == null ? '…' : keys ? `🔑 ${keys} API key${keys > 1 ? 's' : ''} connected` : '🔑 Add an API key'}</button>
        <button className="chip" onClick={() => go('models')}>{engine == null ? '…' : engine.running ? '💻 Local engine running' : engine.installed ? '💻 Local engine installed' : '💻 Set up the free local engine'}</button>
        <button className="chip" onClick={() => go('library')}>▦ {(db.generations || []).length} creations</button>
        <button className="chip" onClick={() => go('characters')}>☺ {(db.characters || []).length} characters · ⌖ {(db.locations || []).length} locations · 📦 {(db.products || []).length} products</button>
      </div>

      {recent.length > 0 && (
        <div className="home-group">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>Recent</h3>
            <button className="btn ghost small" onClick={() => go('library')}>Open Library →</button>
          </div>
          <div className="home-recent">
            {recent.map((g) => (
              <button key={g.id || g.file} className="home-thumb" title={g.prompt || ''} onClick={() => go('library')}>
                <Media file={g.file} kind={g.kind} />
              </button>
            ))}
          </div>
        </div>
      )}

      {GROUPS.map(([title, items], gi) => (
        <div key={title} className={'home-group hue-' + gi}>
          <h3>{title}</h3>
          <div className="home-grid">
            {items.map(([id, icon, label, desc]) => (
              <button key={id + label} className="home-tile" onClick={() => go(id)}>
                <span className="app-icon">{icon}</span>
                <span className="home-label"><span className="pfx">Pandora</span>{label}</span>
                <span className="home-desc">{desc}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
