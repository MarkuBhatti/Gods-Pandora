import React from 'react';

// Visual thumbnail for every tool card: a colour-coded mini scene with an illustrated glyph,
// floating sparkles and an "input → result" strip so each tool explains itself at a glance.
// Icons are simple 24×24 line drawings (our own), picked by keywords in the tool's id/name/description.

const P = {
  face: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  swap: 'M7 7h11l-3-3M17 17H6l3 3M18 7l-3 3M6 17l3-3',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01',
  video: 'M4 6h12v12H4zM16 10l5-3v10l-5-3',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3',
  music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  wand: 'M4 20 15 9M14 4v3M19 9h-3M17.5 5.5l-2 2M11 6l1 1M18 12l1 1',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 9h6v6H9z',
  eraser: 'M16 4l5 5-10 10H6l-3-3zM9 9l6 6M6 19h15',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  cube: 'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10',
  grid: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4zM10 10h4v4h-4z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  book: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7',
  pencil: 'M15 4l5 5L9 20H4v-5zM13 6l5 5',
  brush: 'M20 4 10 14M10 14a3 3 0 0 0-4 1c-1 1-.5 3-2 5 3 0 5-1 6-2a3 3 0 0 0 0-4Z',
  palette: 'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-2 0-3 2-1 3-1a4 4 0 0 0 4-4c0-4.4-4-8-9-8ZM7.5 11h.01M10 7h.01M15 7h.01',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 7.5 20 19M8.5 16.5 20 5',
  shirt: 'M8 3 3 6l2 5 3-1v11h8V10l3 1 2-5-5-3a4 4 0 0 1-8 0Z',
  camera: 'M4 7h4l2-3h4l2 3h4v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  home: 'M3 11 12 3l9 8M5 9v12h14V9M10 21v-6h4v6',
  leaf: 'M5 19C5 9 11 4 20 4c0 9-5 15-15 15ZM5 19l8-8',
  car: 'M3 15l2-5a3 3 0 0 1 3-2h8a3 3 0 0 1 3 2l2 5v4H3zM7 19v1M17 19v1M6.5 15h.01M17.5 15h.01',
  id: 'M3 5h18v14H3zM8 11a2 2 0 1 0 0-.01M5.5 16a3 3 0 0 1 5 0M14 9h4M14 13h4',
  paw: 'M12 20c-3 0-5-2-5-4s2-4 5-4 5 2 5 4-2 4-5 4ZM6 10a2 2 0 1 0 0-.01M18 10a2 2 0 1 0 0-.01M9 6a2 2 0 1 0 0-.01M15 6a2 2 0 1 0 0-.01',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 14a5 5 0 0 0 8 0M9 9.5h.01M15 9.5h.01',
  disc: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  poster: 'M6 3h12v18H6zM9 15h6M9 18h4M9 6h6v6H9z',
  play: 'M3 6h18v12H3zM10 9l5 3-5 3z',
  hex: 'M12 2l9 5v10l-9 5-9-5V7zM9 12l2 2 4-4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  drop: 'M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12Z',
  feather: 'M20 4C12 4 6 10 6 18M14 10H8M17 7h-5M6 18l-2 2',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  game: 'M6 9h12a4 4 0 0 1 0 8c-1.5 0-2-1-3-2H9c-1 1-1.5 2-3 2a4 4 0 0 1 0-8ZM7 13h3M8.5 11.5v3M16 12h.01M17.5 14h.01',
  layout: 'M3 4h18v16H3zM3 9h18M9 9v11',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
  puzzle: 'M10 3h4v3a2 2 0 1 0 4 0h3v5h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H4v-6h3a2 2 0 1 0 0-4H4V6h6z',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  bot: 'M5 8h14v11H5zM12 4v4M9 13h.01M15 13h.01M9 16h6M2 12v3M22 12v3',
  crop: 'M6 2v16h16M2 6h16v16',
  doc: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8',
  megaphone: 'M3 10v4h4l7 5V5L7 10zM17 9a4 4 0 0 1 0 6M20 6a8 8 0 0 1 0 12',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h.01',
  chat: 'M4 5h16v11H9l-5 4z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  ruler: 'M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  cap: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12ZM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  cart: 'M3 4h3l2 12h11l2-8H7M10 20h.01M17 20h.01',
  rotate: 'M20 12a8 8 0 1 1-3-6.3M20 4v5h-5',
};

// first match wins: [regex on "id name desc", icon]
const RULES = [
  [/hair/, 'scissors'],
  [/tattoo/, 'feather'],
  [/makeup|cosmetic/, 'drop'],
  [/headshot|selfie|portrait\b|avatar|spokes|persona|influencer|character|creature/, 'face'],
  [/face ?swap|swap the face|outfit swap|background swap|\bswap\b/, 'swap'],
  [/lipsync|lip ?sync|talking|speak|podcast|voiceover|narrat|voice/, 'mic'],
  [/music|beat|song|jingle|sound|audio|sfx/, 'music'],
  [/uncrop|expand|extend|outpaint/, 'expand'],
  [/remov|eras/, 'eraser'],
  [/relight|lighting|light\b|glow/, 'bulb'],
  [/layer|decompos/, 'layers'],
  [/3d|parallax|diorama|turntable|360|exploded|spatial/, 'cube'],
  [/pixel|sprite|retro.?game/, 'grid'],
  [/anime|manga|caricature|cartoon/, 'star'],
  [/storybook|ebook|book|course|curriculum|newsletter/, 'book'],
  [/coloring|line.?art|sketch|doodle|whiteboard|illustrat/, 'pencil'],
  [/inpaint|retouch|skin|enhanc|restor|repair/, 'brush'],
  [/coloriz|colorway|palette|color/, 'palette'],
  [/storyboard/, 'film'],
  [/moodboard/, 'layers'],
  [/before \/ after|cutout|macro|detail/, 'crop'],
  [/pattern|knit|denim|capsule|trend|tech-pack/, 'shirt'],
  [/fashion|outfit|lookbook|runway|street style|fabric|flat lay|garment|wear/, 'shirt'],
  [/photo ?dump|photoshoot|camera|shot/, 'camera'],
  [/interior|room|home|real estate/, 'home'],
  [/garden|landscape|yard|plant/, 'leaf'],
  [/car\b|wrap|vehicle/, 'car'],
  [/passport|id photo|\bid\b/, 'id'],
  [/pet\b|dog|cat\b|animal/, 'paw'],
  [/sticker|emoji/, 'smile'],
  [/album|cover art|vinyl/, 'disc'],
  [/poster|editorial cover|magazine|billboard|flyer/, 'poster'],
  [/youtube|thumbnail/, 'play'],
  [/logo|brand/, 'hex'],
  [/\bage\b|older|younger|aging|timeline/, 'clock'],
  [/makeup|cosmetic/, 'drop'],
  [/game/, 'game'],
  [/landing|website|web app|page/, 'layout'],
  [/dashboard|chart|analytics|data/, 'chart'],
  [/extension|plugin|manifest/, 'puzzle'],
  [/api|server|backend/, 'server'],
  [/automation|script|bot\b|agent/, 'bot'],
  [/screenshot|wireframe|mockup|ui\b/, 'crop'],
  [/prd|spec|docs?\b|guide|journey|design system|deck|prompt pack|template/, 'doc'],
  [/ugc|hook|tiktok|ad\b|ads\b|commercial|campaign|click/, 'megaphone'],
  [/a\/b|batch|conversion/, 'target'],
  [/chat/, 'chat'],
  [/packshot|product|package|placement|unbox/, 'box'],
  [/angle|measure|size/, 'ruler'],
  [/email|mail/, 'mail'],
  [/explainer|lesson|teach|edu/, 'cap'],
  [/location|place|scene/, 'pin'],
  [/preset|restyle|style|filter|look\b|mood/, 'wand'],
  [/clay|paper|figure|toy|collectible/, 'box'],
  [/video|clip|reel|motion|animate|film/, 'video'],
  [/store|shop|sell/, 'cart'],
];
const BY_KIND = { image: 'image', video: 'video', audio: 'music', llm: 'code', '3d': 'cube', td: 'sparkle' };
const KIND_HUE = { image: 265, video: 330, audio: 28, llm: 190, '3d': 160, td: 200 };

export function toolIcon(t) {
  const s = `${t.id || ''} ${t.name || ''} ${t.desc || ''}`.toLowerCase();
  for (const [re, icon] of RULES) if (re.test(s)) return icon;
  return BY_KIND[t.kind] || 'sparkle';
}

function hashHue(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360; return h; }

export function Glyph({ name, size = 24, stroke = 1.7 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.sparkle} />
    </svg>
  );
}

const KIND_LABEL = { image: 'Image', video: 'Video', audio: 'Audio', llm: 'Code / text', '3d': '3D model', td: 'Live visuals' };

export default function ToolArt({ tool }) {
  const icon = toolIcon(tool);
  const base = KIND_HUE[tool.kind] ?? 260;
  const hue = (base + hashHue(tool.id || tool.name || '') * 7) % 360; // colourful, stable per tool
  const inputs = (tool.imageInputs || []).map((i) => i.label).slice(0, 2);
  return (
    <div className="tool-art" style={{ '--th': hue }} aria-hidden="true">
      <span className="ta-orb" />
      <span className="ta-grid" />
      <span className="ta-spark s1" /><span className="ta-spark s2" /><span className="ta-spark s3" />
      <span className="ta-glyph"><Glyph name={icon} size={30} stroke={1.6} /></span>
      <span className="ta-flow">
        {inputs.length ? inputs.map((l) => <i key={l}>{l}</i>) : <i>{tool.kind === 'llm' ? 'Your idea' : tool.kind === 'td' ? 'Audio / OSC' : tool.kind === '3d' ? 'Text or image' : 'Your prompt'}</i>}
        <b>→</b>
        <i className="out">{KIND_LABEL[tool.kind] || 'Result'}</i>
      </span>
    </div>
  );
}
