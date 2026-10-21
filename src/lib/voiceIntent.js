// Turns a spoken command (already in English) into an action — no LLM needed for the common cases.
//   "open studio" / "go to the agent"                       → { type: 'open', page }
//   "generate an image of X using open source flux, then
//    auto colour grade it teal and orange"                  → { type: 'do', steps: [generate_image, color_grade], mode, prefer }
//   "colour grade it warm"                                  → { type: 'do', steps: [color_grade($recent)] }
//   anything bigger ("make a promo video for my brand")     → { type: 'agent', goal }

export const PAGES = [
  [/\b(studio|create)\b/, 'create'], [/\bagent\b/, 'agent'], [/\bnode|canvas\b/, 'canvas'], [/\bfilm\b/, 'film'], [/auto ?edit|\bcut\b|\bedit(or|ing)?\b/, 'cut'],
  [/\bcolou?r|grad(e|ing)\b/, 'color'], [/\bphoto|retouch\b/, 'photo'], [/\bfashion\b/, 'fashion'], [/\bproducts? ?(and|&) ?brand\b/, 'products'], [/\bproduct\b/, 'product'],
  [/\bmarketing\b/, 'marketing'], [/ad multiplier|\bads?\b/, 'admulti'], [/shape ?shift/, 'genjutsu'], [/\bshorts?\b/, 'shorts'], [/\bexplainer\b/, 'explainer'],
  [/\binfluencer\b/, 'influencer'], [/\bvoice|audio|music\b/, 'voice'], [/app build/, 'appbuild'], [/\bapps?\b/, 'apps'], [/design docs?/, 'designdocs'],
  [/digital products?/, 'digiproduct'], [/\bforge\b/, 'forge'], [/\b3d|spatial\b/, 'spatial'], [/touch ?designer/, 'touchdesigner'], [/\bhome\b/, 'home'],
  [/ai market|\bmarketplace\b/, 'aimarket'], [/\bstyles?\b/, 'styles'], [/\bcharacters?\b/, 'characters'], [/\blocations?\b/, 'locations'],
  [/\bgallery|library\b/, 'library'], [/\bmodels?\b/, 'market'], [/\bcore|engine|cloud\b/, 'models'], [/\bupdates?\b/, 'update'], [/\bconnect(or|ion)?\b/, 'connect'], [/\bsettings?|keys?\b/, 'settings'],
];

const LOOKS = [
  [/teal|orange|blockbuster|hollywood/, 'Teal & Orange'], [/black (and|&) white|\bb ?& ?w\b|mono(chrome)?|grayscale|greyscale/, 'Black & white'],
  [/golden|sunset/, 'Golden hour'], [/warm|film look|kodak/, 'Warm film'], [/cool|cold|night|blue/, 'Cool night'], [/bleach/, 'Bleach bypass'],
  [/vintage|retro|old/, 'Vintage'], [/moody|matte|dark/, 'Moody matte'],
];
const lookOf = (t) => (LOOKS.find(([re]) => re.test(t)) || [null, 'Natural pop'])[1];

const GRADE_CLAUSE = /[,.]?\s*(?:\b(?:and then|then|after that|afterwards|and also|and)\b\s*)?(?:please\s+)?(?:auto(?:matically)?\s*)?(?:colou?r[\s-]*grad(?:e|ing)|grad(?:e|ing)|colou?r[\s-]*correct(?:ion)?)\b(.*)$/i;
const MODEL_CLAUSE = /\b(?:using|with|in|on|via|by)\s+(?:the\s+)?(?:open[\s-]?source\s+|free\s+|local\s+|offline\s+)*(?:flux(?:\.?\s?2)?(?:\s*\[?klein\]?)?(?:\s*4\s*b)?|sdxl|stable diffusion(?:\s*xl)?|sd\s*1\.?5)(?:\s+model)?\b/gi;

export function parse(raw) {
  let t = String(raw || '').trim().replace(/^[\s"'“”.,!?-]+|[\s"'“”.!?]+$/g, '');
  t = t.replace(/^(?:(?:hey\s+)?pandora[\s,.!:-]+)?(?:(?:please|can you|could you|would you|i want you to|i'd like you to|i want to|i need you to|kindly)\s+)*/i, '').trim();
  const low = t.toLowerCase();
  if (!low) return { type: 'none' };

  // navigation
  const open = low.match(/^(?:open|go to|go|show(?: me)?|switch to|take me to|navigate to|launch|kholo|khol do)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(?:tab|page|section|screen))?$/);
  const bare = !open && low.split(/\s+/).length <= 3 ? low.replace(/\b(tab|page|the)\b/g, '').trim() : null;
  for (const target of [open && open[1], bare].filter(Boolean)) {
    const hit = PAGES.find(([re]) => re.test(target));
    if (hit && (open || target.split(/\s+/).length <= 2)) return { type: 'open', page: hit[1] };
  }

  // free & local by default (Pandora's promise); paid APIs only when asked for
  const mode = /\b(api|cloud|paid|openai|fal|replicate|runway|kling|veo|midjourney)\b/.test(low) && !/open[\s-]?source|\bfree\b|\blocal\b/.test(low) ? 'hybrid' : 'free';
  const prefer = /\bflux\b/.test(low) ? 'flux' : /\bsdxl\b|stable diffusion xl/.test(low) ? 'sdxl' : /sd ?1\.?5|stable diffusion 1/.test(low) ? 'sd15' : '';

  // grade only (the image/video made last)
  if (/^(?:auto(?:matically)?\s*)?(?:colou?r[\s-]*grade|grade|colou?r[\s-]*correct)\b/.test(low) && !/\b(image|picture|photo)\s+of\b/.test(low)) {
    const m = low.match(/\b(?:it|this|that|the (?:last|latest|previous) (?:one|image|picture|photo|video))\b/);
    return { type: 'do', steps: [{ tool: 'color_grade', args: { file: '$recent', look: lookOf(low) } }], mode, prefer, needsRecent: true, say: 'Grading it ' + lookOf(low), explicit: !!m };
  }

  // image generation (+ optional grade)
  const verb = /\b(generate|create|make|draw|imagine|render|paint|design|produce|banao|bana do)\b/.test(low);
  const isVideo = /\b(video|clip|animation|animate|film|movie|reel)\b/.test(low);
  const isAudio = /\b(song|music|track|sound|voice ?over|audio)\b/.test(low);
  if (verb && !isVideo && !isAudio) {
    let body = t; let look = null;
    const g = body.match(GRADE_CLAUSE);
    if (g && g.index > 0) { look = lookOf(g[0].toLowerCase()); body = body.slice(0, g.index); }
    body = body.replace(MODEL_CLAUSE, ' ');
    const pm = body.match(/\bprompt(?:\s+is)?\s*[:,-]?\s*(.+)$/i);
    let prompt = pm ? pm[1] : body.replace(/^.*?\b(?:generate|create|make|draw|imagine|render|paint|design|produce)\b\s*(?:me\s+|us\s+)?(?:an?\s+|the\s+|some\s+)?(?:(?:new|nice|cool|beautiful|cinematic|realistic|photo-?realistic|high quality)\s+)*(?:images?|pictures?|photos?|pics?|art(?:work)?|posters?|wallpapers?|illustrations?|renders?)?\s*(?:of|showing|with|where|that shows|about)?\s*/i, '');
    prompt = prompt.replace(/\s+(?:with|and)\s*$/i, '').replace(/^\s*(?:of|with|where)\s+/i, '').replace(/\s{2,}/g, ' ').trim().replace(/[,.]+$/, '');
    if (prompt.split(/\s+/).length >= 2) {
      const aspect = /portrait|vertical|story|phone|9 ?: ?16/.test(low) ? '9:16' : /square|1 ?: ?1|instagram post/.test(low) ? '1:1' : '16:9';
      const steps = [{ tool: 'generate_image', args: { prompt, aspect_ratio: aspect, purpose: 'voice request' } }];
      if (look) steps.push({ tool: 'color_grade', args: { file: '$last', look } });
      return { type: 'do', steps, mode, prefer, say: 'Generating your image' + (look ? ' and grading it ' + look : '') };
    }
  }
  return { type: 'agent', goal: t, mode };
}

// The offline recogniser sometimes mishears command words ("open edent" → "open agent").
// Only the first few words (the verb + the tab name) are corrected, so prompts are left alone.
const HEAD = ['open', 'go', 'show', 'switch', 'generate', 'create', 'make', 'draw', 'render', 'imagine', 'studio', 'agent', 'film', 'color', 'colour',
  'photo', 'gallery', 'library', 'settings', 'models', 'home', 'connect', 'update', 'grade', 'voice', 'apps', 'forge', 'shorts', 'fashion', 'product',
  'marketing', 'explainer', 'influencer', 'edit', 'image', 'picture', 'video', 'stop', 'cancel', 'start', 'canvas', 'spatial', 'styles', 'characters', 'locations'];
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const V = /^[aeiou]/;
export function fixHead(text, n = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  for (let i = 0; i < Math.min(n, words.length); i++) {
    const w = words[i].toLowerCase().replace(/[^a-z]/g, '');
    if (w.length < 4 || HEAD.includes(w)) continue;
    const max = w.length >= 5 ? 2 : 1;
    let best = null, bd = 9;
    for (const h of HEAD) { const d = lev(w, h); if (d < bd && (h[0] === w[0] || (V.test(h) && V.test(w)))) { bd = d; best = h; } }
    if (best && bd <= max) words[i] = best;
  }
  return words.join(' ');
}
