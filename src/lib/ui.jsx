import React from 'react';

// Design system bits shared by the new shell: line icons, grouped navigation and each tab's banner.
const BGS = import.meta.glob('../assets/bg/*.jpg', { eager: true, import: 'default' });
export const SHOW = import.meta.glob('../assets/showcase/*.jpg', { eager: true, import: 'default' });
export const show = (k) => SHOW[`../assets/showcase/${k}.jpg`];
// tab banners use the creator's own showcase (Made in Pandora + photography); older art is the fallback
const SHOWBG = { create: 'ai-floating-house', film: 'ai-rain-lot', shorts: 'ai-umbrellas', marketing: 'ai-billboards', influencer: 'ai-portrait-window', fashion: 'ph-veil',
  product: 'ai-box-smoke', voice: 'ph-fire-portrait', styles: 'ai-gallery-room', chars: 'ai-portrait', locs: 'ph-aerial-river', library: 'ai-tv-wall', models: 'ai-corridor',
  apps: 'ai-greenhouse', appbuild: 'ai-desk', forge: 'ai-hand-flame', canvas: 'ai-hall', designdocs: 'ph-ruin-aerial', digiproduct: 'ai-chair-light', explainer: 'ai-mirrors',
  aimarket: 'ai-night-ufo', plugins: 'ai-cabin-night', mcp: 'ph-braided-river', settings: 'ph-peaks' };
// banner + backdrop visual per tab, chosen to match what the tab does
export const PAGEBG = { create: 'ai-floating-house', film: 'ai-rain-lot', photo: 'ph-beach-portrait', voice: 'ph-musicians', spatial: 'ph-mountains', camrig: 'bh-window-man',
  touchdesigner: 'ai-tv-wall', edit: 'bh-blue-room', cut: 'ai-desk', color: 'ph-boat-sunset', motion: 'ai-hall', fx: 'ph-veil', canvas: 'ph-light-dancer', genjutsu: 'ai-mirrors',
  marketing: 'ai-billboards', admulti: 'ai-runway', influencer: 'ai-portrait-window', fashion: 'ph-fire-portrait', product: 'ai-box-smoke', shorts: 'ai-umbrellas',
  explainer: 'ai-chair-light', apps: 'ai-greenhouse', appbuild: 'ai-corridor', forge: 'ai-hand-flame', designdocs: 'ph-ruin-aerial', digiproduct: 'ph-dusk-rooftop',
  styles: 'ph-red-gate', characters: 'ph-boy', locations: 'ph-aerial-river', products: 'ph-dune-room', library: 'ai-gallery-room', market: 'bh-ice-river',
  aimarket: 'ph-glacier', models: 'ai-cabin-night', connect: 'ph-braided-river', update: 'ph-ice', settings: 'ph-peaks', agent: 'bh-hands', home: 'ai-night-ufo',
  gen3d: 'ph-ruin-water', studio3d: 'ph-snow-valley' };
// focal point for banners whose subject isn't centred (faces sit high in portraits)
export const PAGEPOS = { fashion: '50% 24%', photo: '50% 30%', influencer: '50% 30%', characters: '50% 30%', canvas: '50% 35%', camrig: '50% 40%', agent: '50% 50%' };
export const pageBg = (id, fallbackKey) => show(PAGEBG[id]) || bg(fallbackKey || id);
export const bg = (k) => show(SHOWBG[k]) || BGS[`../assets/bg/${k}.jpg`] || BGS['../assets/bg/create.jpg'];

const P = {
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  timeline: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M8 4v6M14 10v5M10 15v5"/><path d="M16 2v6" stroke-width="2.4"/>',
  motion: '<path d="M4 17c3-9 6-9 8-5s5 4 8-5"/><circle cx="4" cy="17" r="1.6"/><circle cx="20" cy="7" r="1.6"/><path d="M3 21h18"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20M8.1 15.9 20 4"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-2 0-1.4-1.2-1.6-1.2-3 0-1 .8-2 2-2H17a4 4 0 0 0 4-4c0-4-4-7-9-7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  mega: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 8a5 5 0 0 1 0 8"/>',
  shirt: '<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  box: '<path d="M3 8 12 3l9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  swirl: '<path d="M12 12a3 3 0 1 1 3-3M12 12a6 6 0 1 0 6-6M12 12a9 9 0 1 1 0-9"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  anvil: '<path d="M4 9h12c0 3 2 4 4 4v2H8a4 4 0 0 1-4-4zM9 15v4M15 15v4M6 19h12"/>',
  hex: '<path d="m12 2 8.7 5v10L12 22l-8.7-5V7z"/>',
  node: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 12h4l5-5M11.5 12l5 5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  img: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  cart: '<path d="M3 4h2l2.4 11h10.2L20 8H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  brush: '<path d="M18 3 9 12l3 3 9-9zM9 12c-3 0-5 2-5 5 0 1-1 2-2 2 2 2 7 2 9-1 1-1.5 1-3 1-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
};
export function Icon({ name, size = 14 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: P[name] || P.spark }} />;
}

// 37 tabs → calm groups (the Agent lives in the Pandy widget on the right)
export const NAV = [
  ['', [['home', 'Home', 'home', '#E7C08A']]],
  ['Create', [['create', 'Studio', 'spark', '#E7C08A'], ['film', 'Film', 'film', '#ff8a5c'], ['photo', 'Photo', 'camera', '#5fd4ff'], ['voice', 'Voice & Music', 'mic', '#45d68a'], ['spatial', '3D & Spatial', 'cube', '#8b6bff'], ['camrig', 'Phone Camera', 'camera', '#F3DDB7', 'new'], ['touchdesigner', 'TouchDesigner', 'hex', '#ff6b9d']]],
  ['Edit', [['edit', 'Edit', 'timeline', '#00d4ff', 'new'], ['cut', 'AutoEdit', 'scissors', '#ffb86b', 'free'], ['color', 'Color', 'palette', '#ff6b9d', 'free'], ['motion', 'Motion Design', 'motion', '#b98bff', 'new'], ['fx', 'Effects', 'spark', '#F3DDB7', 'new'], ['genjutsu', 'Shapeshift', 'swirl', '#b98bff']]],
  ['Campaigns', [['marketing', 'Marketing', 'mega', '#ffb86b'], ['admulti', 'Ad Multiplier', 'layers', '#45d68a'], ['influencer', 'AI Influencer', 'star', '#ff6b9d'], ['fashion', 'Fashion', 'shirt', '#E7C08A'], ['product', 'Product', 'box', '#5fd4ff'], ['shorts', 'Shorts', 'phone', '#ff8a5c'], ['explainer', 'Explainer', 'cap', '#8b6bff']]],
  ['Build', [['apps', 'Apps', 'grid', '#5fd4ff'], ['appbuild', 'App Building', 'wrench', '#ffb86b'], ['forge', 'Forge', 'anvil', '#ff8a5c'], ['canvas', 'Node Canvas', 'node', '#8b6bff'], ['designdocs', 'Design Docs', 'ruler', '#45d68a'], ['digiproduct', 'Digital Products', 'box', '#E7C08A']]],
  ['World', [['styles', 'Styles', 'brush', '#ff6b9d'], ['characters', 'Characters', 'user', '#E7C08A'], ['locations', 'Locations', 'pin', '#5fd4ff'], ['products', 'Products & Brand', 'box', '#45d68a']]],
  ['Library', [['library', 'Gallery', 'img', '#E7C08A'], ['market', 'Models', 'cart', '#8b6bff', 'new'], ['aimarket', 'AI Market', 'globe', '#5fd4ff']]],
  ['System', [['models', 'Core & Cloud', 'chip', '#45d68a'], ['connect', 'Connect', 'plug', '#ff8a5c'], ['update', 'Update', 'up', '#5fd4ff'], ['settings', 'Settings', 'cog', '#8e8c9e']]],
];
export const ALL = NAV.flatMap(([g, items]) => items.map(([id, label, icon, c, badge]) => ({ id, label, icon, c, g, badge })));
ALL.push({ id: 'agent', label: 'Pandora Agent', icon: 'star', c: '#E7C08A', g: 'Agent' });

// Banner per tab: [title with one *italic* word, one line, background]
export const TABS = {
  create: ['Create *anything*', 'Image, video and audio from one prompt — every model, on your keys or free on your GPU.', 'create'],
  film: ['Make a *film*', 'Shot by shot: film stocks, cameras, lenses and director styles. Storyboard to final cut.', 'film'],
  photo: ['Retouch, *beautifully*', 'Auto retouch and colour match. Batch a whole shoot in one go.', 'fashion'],
  voice: ['Give it a *voice*', 'Voice-overs, music beds and sound effects — free on your PC or with your own keys.', 'voice'],
  spatial: ['Into the *third* dimension', 'Image to 3D, Gaussian splats and 22 linked 3D tools.', 'models'],
  touchdesigner: ['Live, *reactive* visuals', 'Drive TouchDesigner over OSC and WebSocket. AI writes the parameters.', 'canvas'],
  cut: ['Edit at the *speed of thought*', 'Drop clips and music, get a finished cut — on the beat, highlights first. Free on any PC.', 'shorts'],
  color: ['Grade like *Resolve*', 'Nodes, colour wheels, curves, qualifiers, LUTs and scopes — the preview is exactly what renders.', 'film'],
  edit: ['Cut like *Resolve*', 'A real multi-track timeline — trim, blade, ripple, transitions, titles and 145 effects. Or let it edit for you.', 'film'],
  camrig: ['Your phone is the *camera*', 'Move your phone to fly the Blender camera — real handheld moves, recorded as keyframes, then turned into the finished shot.', 'film'],
  motion: ['Make it *move*', 'Kinetic titles, lower thirds, logo reveals and charts — designed from one sentence, rendered on your PC.', 'explainer'],
  genjutsu: ['Become *anyone*', 'Motion transfer, swaps and restyles. One clip in, endless versions out.', 'influencer'],
  marketing: ['Ads that *convert*', 'URL to ad, UGC, hooks, avatar spokespeople and A/B batches.', 'marketing'],
  admulti: ['One ad, *a hundred* versions', 'Turn your winning ad into many variants — new hooks, faces, places and formats.', 'marketing'],
  influencer: ['Build an *icon*', 'A locked face, wardrobe and places — post forever, never drift.', 'influencer'],
  fashion: ['Dress the *future*', 'Try-ons, lookbooks, poses and campaigns.', 'fashion'],
  product: ['Products, *perfected*', 'Packshots, 360° turntables, exploded views and lifestyle scenes.', 'product'],
  shorts: ['Shorts that *travel*', 'Vertical videos with captions and hooks — ready for TikTok, Reels and Shorts.', 'shorts'],
  explainer: ['Explain *anything*', 'Animated explainers with a narrator, from whiteboard to 3D.', 'explainer'],
  apps: ['One click, *done*', 'Ready apps — headshots, face swap, uncrop, lipsync and more.', 'apps'],
  appbuild: ['Build an *app*', 'Describe it and Pandora builds it — pages, tools and prototypes.', 'appbuild'],
  forge: ['Forge *tools*', 'Describe a tool and it runs inside Pandora.', 'forge'],
  canvas: ['Wire *anything*', 'Chain any cloud or local model — image to video to voice to edit.', 'canvas'],
  designdocs: ['Design, *documented*', 'Briefs, specs, moodboards and brand docs, written and laid out.', 'designdocs'],
  digiproduct: ['Make it, *sell it*', 'eBooks, courses, templates and audiobooks you can sell.', 'digiproduct'],
  styles: ['Find your *style*', 'Curated looks and your own saved styles — use them anywhere.', 'styles'],
  characters: ['Your *cast*', 'Characters you can drop into any tool — same face every time.', 'chars'],
  locations: ['Every *place*', 'Location Lock keeps the exact same set across a whole campaign.', 'locs'],
  products: ['Your *brand*', 'Products, logos and brand kits that stay consistent everywhere.', 'product'],
  library: ['Everything you\'ve *made*', 'Your gallery — favourites, collections and a lightbox for every creation.', 'library'],
  market: ['Every *model*', 'One search across Hugging Face, Civitai, OpenModelDB, Ollama and Pinokio.', 'models'],
  aimarket: ['The AI *map*', 'AI tools and providers, mapped so you can find the right one.', 'aimarket'],
  models: ['Your *engine*', 'Run open models on your GPU, or use your own API keys. Mix both.', 'models'],
  connect: ['Plug in your *assistant*', 'Let Claude, ChatGPT and Cursor drive Pandora through a private connector.', 'mcp'],
  update: ['Always *new*', 'App updates and the latest open models, delivered automatically.', 'plugins'],
  settings: ['Make it *yours*', 'Keys, folders, performance and appearance.', 'settings'],
  agent: ['Your creative *agent*', 'Give one goal — Pandy plans and makes the whole package.', 'create'],
};
export const Em = ({ text }) => <>{String(text).split('*').map((p, i) => (i % 2 ? <em key={i}>{p}</em> : <React.Fragment key={i}>{p}</React.Fragment>))}</>;
