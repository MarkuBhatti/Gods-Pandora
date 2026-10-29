// Pandora Agent — tell it the job, it plans, uses every tool in God's Pandora and hands back a finished package.
//
// Brain: Claude (your Anthropic key, tool use) or a free local model (Ollama / LM Studio, OpenAI-compatible
// tool calling). Tools: write documents & scripts, generate images / videos / voice-overs with whatever models
// are ready (keys connected or downloaded), auto-edit, colour-grade, build a presentation (HTML + PDF) and
// assemble a launch package (index.html + README + every asset in one folder).
// Safety rails: a plan you approve first (optional), hard budgets for paid generations, step limit, cancel.
const fs = require('fs');
const path = require('path');

const MAX_STEPS = 60;
let current = null; // one agent run at a time

const slug = (s) => String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function mdToHtml(md) {
  const lines = String(md || '').split(/\r?\n/); const out = []; let list = false;
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  for (const l of lines) {
    const h = l.match(/^(#{1,4})\s+(.*)/); const li = l.match(/^\s*[-*•]\s+(.*)/) || l.match(/^\s*\d+[.)]\s+(.*)/);
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(li[1]) + '</li>'); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (h) out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if (l.trim()) out.push('<p>' + inline(l) + '</p>');
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

const PAGE_CSS = `body{margin:0;font-family:"Segoe UI",system-ui,sans-serif;background:#0d0c14;color:#ece9f6;line-height:1.55}
.wrap{max-width:1100px;margin:0 auto;padding:40px 28px}h1{font-size:40px;margin:0 0 6px;background:linear-gradient(90deg,#b9a8ff,#ffb86b);-webkit-background-clip:text;color:transparent}
h2{margin-top:36px;color:#ffb86b;font-size:14px;letter-spacing:.12em;text-transform:uppercase}a{color:#b9a8ff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.card{background:#17151f;border:1px solid #2a2738;border-radius:18px;overflow:hidden}
.card img,.card video{width:100%;display:block}.card p{margin:0;padding:10px 12px;font-size:13px;color:#b8b4cc}code{background:#221f2e;padding:1px 5px;border-radius:5px}
.doc{background:#17151f;border:1px solid #2a2738;border-radius:18px;padding:18px 22px;margin:10px 0}`;

// ── models the agent may use: keys connected or downloaded locally ──
function readyModels({ catalog, keys, downloaded, engineInstalled }) {
  const skip = /soul|upscale|identity/i;
  return (catalog.models || []).filter((m) => !skip.test(m.id + ' ' + m.name) && (m.provider === 'local' ? engineInstalled && downloaded.includes(m.endpoint) : !!keys[m.provider]))
    .map((m) => ({ id: m.id, name: m.name, kind: m.kind, provider: m.provider, acceptsImage: !!m.refInput, model: m }));
}

// ── Free vs paid routing ──
// mode: 'free'  → only open-source models on this PC (+ free fallbacks: animated stills, system voice)
//       'hybrid'→ open-source first, cloud API only when no local option works
//       'cloud' → cloud APIs first, open-source as fallback
const LOCAL_IMAGE = [ // best first, with rough VRAM need and first-time download size
  { id: 'local-flux2-klein', vram: 6, gb: 16, label: 'FLUX.2 [klein] 4B' },
  { id: 'local-sdxl', vram: 6, gb: 7, label: 'SDXL' },
  { id: 'local-sd15', vram: 0, gb: 2, label: 'SD 1.5' },
];
const LOCAL_VIDEO = [{ id: 'local-wan22-5b', vram: 16, gb: 22, label: 'Wan 2.2 5B' }, { id: 'local-ltx23', vram: 16, gb: 30, label: 'LTX-2.3' }];

async function planRoutes(deps, opts = {}) {
  const mode = ['free', 'hybrid', 'cloud'].includes(opts.mode) ? opts.mode : 'hybrid';
  const allowDl = opts.allowDownloads !== false;
  const keys = deps.keys(); const catalog = deps.catalog(); const downloaded = await deps.downloaded();
  const engineInstalled = deps.engineInstalled();
  let hw = {}; try { hw = (await deps.hardware()) || {}; } catch (_) {}
  const vram = hw.cuda ? hw.vram_gb || 0 : (hw.mps ? 12 : 0);
  const byId = Object.fromEntries((catalog.models || []).map((m) => [m.id, m]));
  const cloud = readyModels({ catalog, keys, downloaded: [], engineInstalled: false });
  const localReady = readyModels({ catalog, keys: {}, downloaded, engineInstalled });
  const pickLocal = (list, kind) => {
    const have = list.find((c) => byId[c.id] && downloaded.includes(byId[c.id].endpoint) && (vram >= c.vram || !hw.cuda && c.vram === 0));
    if (have) return { type: 'local', model: byId[have.id], label: have.label + ' (on this PC · free)', download: 0 };
    if (!allowDl || !hw.cuda && kind === 'video') return null;
    const fit = list.find((c) => byId[c.id] && (hw.cuda ? vram >= c.vram : c.vram === 0));
    return fit ? { type: 'local', model: byId[fit.id], label: `${fit.label} (free · first use downloads ≈${fit.gb} GB${engineInstalled ? '' : ' + installs the engine'})`, download: fit.gb, needsEngine: !engineInstalled } : null;
  };
  const cloudPick = (kind, re) => { const m = cloud.find((x) => x.kind === kind && (!re || re.test(x.id + x.name))); return m ? { type: 'cloud', model: m.model, label: m.name + ' (API · paid)' } : null; };
  const order = (local, cl, free) => (mode === 'free' ? [local, free] : mode === 'hybrid' ? [local, cl, free] : [cl, local, free]).filter(Boolean);
  const anyLocalImage = localReady.find((m) => m.kind === 'image');
  // a model asked for by name (e.g. "use flux") goes first
  const imgList = opts.preferImage ? [...LOCAL_IMAGE].sort((a, b) => (opts.preferImage.test(b.id + b.label) ? 1 : 0) - (opts.preferImage.test(a.id + a.label) ? 1 : 0)) : LOCAL_IMAGE;
  const imgLocal = pickLocal(imgList, 'image') || (anyLocalImage ? { type: 'local', model: anyLocalImage.model, label: anyLocalImage.name + ' (on this PC · free)' } : null);
  return {
    mode, vram, gpu: hw.gpu || null,
    image: order(imgLocal, cloudPick('image'), null),
    video: order(pickLocal(LOCAL_VIDEO, 'video'), cloudPick('video'), { type: 'still', label: 'Animated stills (free on any PC — slow cinematic push-ins)' }),
    voice: order({ type: 'system', label: 'System voice (free, offline)' }, cloudPick('audio', /tts|voice|eleven/i), null),
    brain: opts.brain === 'local' || mode === 'free' ? 'local' : 'claude',
  };
}
const routeText = (r) => (r && r.length ? r.map((x) => x.label).join('  →  fallback: ') : 'not available');

const TOOLS = [
  { name: 'propose_plan', description: 'Propose the production plan before doing paid work. List the concrete steps and the final deliverables.', input_schema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'string' } }, deliverables: { type: 'array', items: { type: 'string' } } }, required: ['steps', 'deliverables'] } },
  { name: 'write_document', description: 'Write a text deliverable (brand strategy, video script, shot list, captions, ad copy, press release, prompts…) as Markdown. Saved as .md and .html in the package.', input_schema: { type: 'object', properties: { filename: { type: 'string', description: 'short-file-name without extension' }, title: { type: 'string' }, content: { type: 'string', description: 'Markdown' } }, required: ['filename', 'title', 'content'] } },
  { name: 'generate_image', description: 'Generate one image (product shot, campaign key visual, social post, storyboard frame, slide visual…). Write a rich, specific prompt.', input_schema: { type: 'object', properties: { prompt: { type: 'string' }, aspect_ratio: { type: 'string', enum: ['1:1', '16:9', '9:16', '4:5', '3:2', '21:9'] }, purpose: { type: 'string' }, reference_file: { type: 'string', description: 'optional path of an earlier image to keep the same product/character' } }, required: ['prompt'] } },
  { name: 'generate_video', description: 'Generate one short video shot (about 5 s). Give a cinematic prompt with camera movement. Optionally animate an earlier image (start_image).', input_schema: { type: 'object', properties: { prompt: { type: 'string' }, start_image: { type: 'string' }, aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'] } }, required: ['prompt'] } },
  { name: 'generate_voiceover', description: 'Turn a script into a spoken voice-over audio file.', input_schema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] } },
  { name: 'auto_edit', description: 'Edit video shots and images into one finished promo video, cut to the music or voice-over, with a style.', input_schema: { type: 'object', properties: { clips: { type: 'array', items: { type: 'string' } }, audio_file: { type: 'string' }, style: { type: 'string', enum: ['vlog', 'cinematic', 'hype', 'luxury', 'product', 'documentary'] }, aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1', '4:5'] }, title: { type: 'string' }, length_seconds: { type: 'number' } }, required: ['clips'] } },
  { name: 'color_grade', description: 'Colour-grade a finished video or image with auto balance and a look.', input_schema: { type: 'object', properties: { file: { type: 'string' }, look: { type: 'string', enum: ['Natural pop', 'Teal & Orange', 'Warm film', 'Cool night', 'Golden hour', 'Bleach bypass', 'Vintage', 'Black & white', 'Moody matte'] } }, required: ['file'] } },
  { name: 'make_presentation', description: 'Build a polished slide deck (HTML + PDF). Use generated images as slide visuals.', input_schema: { type: 'object', properties: { title: { type: 'string' }, accent_color: { type: 'string', description: 'hex like #8b6bff' }, slides: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, subtitle: { type: 'string' }, bullets: { type: 'array', items: { type: 'string' } }, image_file: { type: 'string' }, notes: { type: 'string' } }, required: ['title'] } } }, required: ['title', 'slides'] } },
  { name: 'list_assets', description: 'List every file created so far in this project.', input_schema: { type: 'object', properties: {} } },
  { name: 'finish', description: 'Finish: assemble the final launch package (index page + README) and stop. Call this last.', input_schema: { type: 'object', properties: { summary: { type: 'string' }, next_steps: { type: 'array', items: { type: 'string' } } }, required: ['summary'] } },
];

function systemPrompt(ctx) {
  return `You are Pandora Agent, an autonomous creative director and producer inside the God's Pandora desktop studio.
The user gives you a job; you deliver a complete, launch-ready package by calling tools. Work like a top agency team:
strategy → copy & scripts → visuals → video → edit → colour → presentation → package.

Rules:
- First call propose_plan with concrete steps and deliverables${ctx.reviewPlan ? ' (the user will approve it before you continue)' : ''}.
- Keep brand consistency: define the brand name, palette, tone and visual style in a brand document early and reuse it in every prompt.
- Image prompts: specific subject, setting, composition, lens, lighting, mood, palette, "photorealistic commercial photography" when relevant. No text in images unless needed.
- Budgets (hard limits): at most ${ctx.budget.images} images and ${ctx.budget.videos} video shots and ${ctx.budget.audio} voice-overs. Plan within them.
- If a tool reports that a capability is unavailable, skip it gracefully and explain in the summary how to enable it.
- Use file paths returned by tools when referencing assets (reference_file, start_image, clips, image_file).
- Always end by calling finish with a short summary and next steps.

Production mode: ${ctx.routes.mode.toUpperCase()}${ctx.routes.mode === 'free' ? ' — everything runs free on the user\'s PC; never suggest paid APIs as required' : ''}.
How each process will run (the tools choose automatically, you just call them) —
images: ${routeText(ctx.routes.image)}
video shots: ${routeText(ctx.routes.video)}
voice-over: ${routeText(ctx.routes.voice)}
Local open-source generation is slower than cloud APIs; prefer fewer, stronger shots. Animated stills are made from images, so write image prompts that work as cinematic frames.
Today is ${new Date().toISOString().slice(0, 10)}.${ctx.bridges && ctx.bridges.length ? `

Connected creative apps (tools prefixed with the app id, e.g. blender__…): ${ctx.bridges.join('; ')}.
Use them when the job involves that app: inspect the scene/project first (read-only tools), then make changes step by step. Images returned by app tools are saved into the project; pass their paths to other tools.` : ''}`;
}

// ── the run ──
async function run(deps, opts) {
  if (current && !current.done) throw new Error('The agent is already working on a job. Cancel it first.');
  const keys = deps.keys();
  const routes = await planRoutes(deps, opts);
  const brain = routes.brain;
  if (brain === 'claude' && !keys.anthropic) throw new Error('Add your Anthropic (Claude) API key in Settings → API Keys, or choose the free local brain (Ollama / LM Studio).');
  const dir = path.join(deps.userData(), 'agent-projects', new Date().toISOString().slice(0, 10) + '-' + slug(opts.goal.split(/[.\n]/)[0]) + '-' + Date.now().toString(36));
  for (const d of ['images', 'video', 'audio', 'docs', 'deck']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const ctx = {
    dir, assets: [], docs: [], budget: { images: opts.images ?? 8, videos: opts.videos ?? 3, audio: opts.audio ?? 1 },
    used: { images: 0, videos: 0, audio: 0 }, reviewPlan: opts.reviewPlan !== false,
    models: readyModels({ catalog: deps.catalog(), keys, downloaded: await deps.downloaded(), engineInstalled: deps.engineInstalled() }),
    routes,
  };
  const state = current = { done: false, cancelled: false, approve: null, dir, inbox: [] };
  const emit = (ev) => deps.emit({ ...ev, at: Date.now() });
  emit({ type: 'start', dir, mode: routes.mode, routes: { image: routeText(routes.image), video: routeText(routes.video), voice: routeText(routes.voice) }, models: ctx.models.map((x) => ({ id: x.id, name: x.name, kind: x.kind })) });

  const tools = makeTools(deps, ctx, state, emit);
  // other apps (Blender, Resolve, Premiere…) through their MCP servers
  let ext = { tools: [], notes: [] };
  if (deps.bridgeTools) { try { ext = await deps.bridgeTools(); } catch (_) {} }
  if (ext.notes.length) emit({ type: 'say', text: 'Connected apps — ' + ext.notes.join(' · ') });
  ctx.bridges = ext.notes; const extBy = Object.fromEntries(ext.tools.map((t) => [t.name, t]));
  for (const t of ext.tools) tools[t.name] = async (input) => { const r = await deps.bridgeCall(t, input, path.join(dir, 'images')); r.files.forEach((f) => ctx.assets.push({ kind: 'image', file: f, label: t.name })); return r; };
  const toolList = [...TOOLS, ...ext.tools.map(({ name, description, input_schema }) => ({ name, description, input_schema }))];
  const messages = [{ role: 'user', content: `Job: ${opts.goal}\n\nProject folder: ${dir}` }];
  const sys = systemPrompt(ctx);
  let finished = null;
  try {
    for (let step = 0; step < MAX_STEPS && !finished; step++) {
      if (state.cancelled) throw new Error('cancelled');
      emit({ type: 'thinking', step });
      const reply = brain === 'claude' ? await claudeTurn(keys.anthropic, sys, messages, toolList) : await localTurn(opts.localModel, sys, messages, toolList);
      if (reply.text) emit({ type: 'say', text: reply.text });
      if (!reply.calls.length) {
        // the model answered in text only — nudge it back to work (never send an empty tool_result turn)
        messages.push(reply.assistant.content ? reply.assistant : { role: 'assistant', content: reply.text || '…' });
        messages.push({ role: 'user', content: 'Continue the job using the tools. When every deliverable is done, call finish.' });
        if (step > 3 && !reply.text) break;
        continue;
      }
      messages.push(reply.assistant);
      const results = [];
      for (const call of reply.calls) {
        if (state.cancelled) throw new Error('cancelled');
        emit({ type: 'tool', name: call.name, input: summarize(call.input) });
        let out;
        try { if (!tools[call.name]) throw new Error('Unknown tool ' + call.name); out = await tools[call.name](call.input || {}); }
        catch (e) { out = { error: String(e.message || e).slice(0, 500) }; emit({ type: 'warn', text: `${call.name}: ${out.error}` }); }
        if (call.name === 'finish' && !out.error) finished = out;
        results.push({ id: call.id, name: call.name, content: JSON.stringify(out).slice(0, 4000) });
      }
      // messages the user said / typed while the agent works (voice or text) ride along with the tool results
      const notes = state.inbox.splice(0).map((t) => 'The user just said: "' + t + '" — take it into account from now on.');
      messages.push(brain === 'claude'
        ? { role: 'user', content: [...results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content })), ...notes.map((t) => ({ type: 'text', text: t }))] }
        : results.map((r) => ({ role: 'tool', tool_call_id: r.id, content: r.content })));
      if (brain !== 'claude') { const last = messages.pop(); messages.push(...last); if (notes.length) messages.push({ role: 'user', content: notes.join('\n') }); }
      if (notes.length) emit({ type: 'heard', text: notes.length + ' note(s) from you passed to the agent' });
    }
    if (!finished) finished = await tools.finish({ summary: 'The agent reached its step limit. Everything created so far is in the package.' });
    state.done = true;
    emit({ type: 'done', ...finished });
    return finished;
  } catch (e) {
    state.done = true;
    if (String(e.message) === 'cancelled') { emit({ type: 'cancelled', dir }); return { cancelled: true, dir }; }
    emit({ type: 'error', text: String(e.message || e) });
    throw e;
  }
}

function summarize(input) {
  const o = {}; for (const [k, v] of Object.entries(input || {})) o[k] = typeof v === 'string' ? v.slice(0, 220) : Array.isArray(v) ? `[${v.length}]` : v;
  return o;
}

async function claudeTurn(key, system, messages, toolList = TOOLS) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 8000, system, tools: toolList, messages }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
  const calls = (j.content || []).filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, input: c.input }));
  return { text, calls, stop: j.stop_reason, assistant: { role: 'assistant', content: j.content } };
}

async function localTurn(model, system, messages, toolList = TOOLS) {
  const bases = ['http://localhost:11434/v1', 'http://localhost:1234/v1'];
  const tools = toolList.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  let lastErr = null;
  for (const base of bases) {
    try {
      let pick = model;
      if (!pick) { const r = await fetch(base + '/models'); const j = await r.json(); pick = ((j.data || []).map((m) => m.id).find((m) => /qwen|llama3\.[1-9]|mistral|hermes/i.test(m))) || (j.data || [])[0]?.id; }
      if (!pick) throw new Error('No local model installed. In Ollama run: ollama pull qwen2.5');
      const res = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: pick, temperature: 0.4, tools, messages: [{ role: 'system', content: system }, ...messages] }) });
      const j = await res.json();
      if (!res.ok) throw new Error('Local model error ' + res.status + ': ' + JSON.stringify(j).slice(0, 200));
      const msg = j.choices?.[0]?.message || {};
      const calls = (msg.tool_calls || []).map((c) => { let input = {}; try { input = JSON.parse(c.function.arguments || '{}'); } catch (_) {} return { id: c.id || Math.random().toString(36).slice(2), name: c.function.name, input }; });
      return { text: (msg.content || '').trim(), calls, stop: j.choices?.[0]?.finish_reason, assistant: { role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls } };
    } catch (e) { lastErr = e; }
  }
  throw new Error((lastErr && lastErr.message) || 'No local model server found. Install Ollama (ollama.com) and run: ollama pull qwen2.5');
}

function makeTools(deps, ctx, state, emit) {
  const pickModel = (kind, id, needImage = false) => {
    const list = ctx.models.filter((m) => m.kind === kind && (!needImage || m.acceptsImage));
    return list.find((m) => m.id === id) || list[0] || null;
  };
  const keep = (file, kind, label, sub) => {
    const dest = path.join(ctx.dir, sub, `${String(ctx.assets.length + 1).padStart(2, '0')}-${slug(label)}${path.extname(file)}`);
    try { fs.copyFileSync(file, dest); } catch (_) { return file; }
    const a = { file: dest, kind, label }; ctx.assets.push(a); emit({ type: 'asset', ...a });
    return dest;
  };
  const ensured = new Set();
  // free local models: install the engine and download the model on first use (with live progress)
  async function ensureLocal(r) {
    if (r.type !== 'local' || ensured.has(r.model.endpoint)) return;
    if (!deps.engineInstalled()) {
      emit({ type: 'progress', stage: 'Installing the free local engine (one time, a few minutes)', pct: 5 });
      const inst = await deps.installEngine();
      if (!inst || !inst.ok) throw new Error('Engine install failed: ' + ((inst && inst.error) || 'unknown'));
    }
    const have = (await deps.downloaded()).includes(r.model.endpoint);
    if (!have) {
      emit({ type: 'say', text: `Downloading ${r.model.name} once — after this it runs free and offline.` });
      const res = await deps.downloadModel(r.model.endpoint, (p) => emit({ type: 'progress', stage: 'Downloading ' + r.model.name, pct: p.total ? Math.floor(p.bytes / p.total * 100) : 0 }));
      if (!res || !res.ok) throw new Error((res && res.error) || 'Download failed');
    }
    ensured.add(r.model.endpoint);
  }
  async function runImage(prompt, aspect, reference) {
    let lastErr = null;
    for (const r of ctx.routes.image) {
      try {
        await ensureLocal(r);
        const refs = reference && fs.existsSync(reference) && r.model.refInput ? [reference] : [];
        emit({ type: 'progress', stage: 'Generating image · ' + r.label.split(' (')[0], pct: 30 });
        const f = await deps.generate({ provider: r.model.provider, model: r.model, kind: 'image', prompt, params: { aspectRatio: aspect }, toolRefs: refs });
        return { path: f, via: r.label };
      } catch (e) { lastErr = e; emit({ type: 'warn', text: `${r.label}: ${String(e.message || e).slice(0, 160)} — trying the next option` }); }
    }
    throw lastErr || new Error('No image option worked.');
  }
  return {
    async propose_plan({ steps = [], deliverables = [] }) {
      emit({ type: 'plan', steps, deliverables });
      if (!ctx.reviewPlan) return { approved: true };
      const answer = await new Promise((resolve) => { state.approve = resolve; });
      state.approve = null;
      if (answer && answer.ok) return { approved: true, note: answer.note || '' };
      return { approved: false, feedback: (answer && answer.note) || 'Revise the plan.' };
    },
    async write_document({ filename, title, content }) {
      const base = slug(filename || title);
      const md = path.join(ctx.dir, 'docs', base + '.md');
      fs.writeFileSync(md, `# ${title}\n\n${content}\n`);
      fs.writeFileSync(path.join(ctx.dir, 'docs', base + '.html'), `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>${PAGE_CSS}</style><div class="wrap"><h1>${esc(title)}</h1>${mdToHtml(content)}</div>`);
      ctx.docs.push({ file: md, title }); emit({ type: 'asset', file: md, kind: 'doc', label: title });
      return { saved: md };
    },
    async generate_image({ prompt, aspect_ratio = '1:1', purpose = 'image', reference_file }) {
      if (ctx.used.images >= ctx.budget.images) return { error: `Image budget reached (${ctx.budget.images}). Reuse existing images.` };
      if (!ctx.routes.image.length) return { error: 'No image generator available. Connect an image API key or allow free model downloads.' };
      ctx.used.images++;
      const file = await runImage(prompt, aspect_ratio, reference_file);
      return { file: keep(file.path, 'image', purpose || prompt.slice(0, 30), 'images'), via: file.via };
    },
    async generate_video({ prompt, start_image, aspect_ratio = '16:9' }) {
      if (ctx.used.videos >= ctx.budget.videos) return { error: `Video budget reached (${ctx.budget.videos}).` };
      ctx.used.videos++;
      let lastErr = null;
      for (const r of ctx.routes.video) {
        try {
          if (r.type === 'still') {
            let img = start_image && fs.existsSync(start_image) ? start_image : null;
            if (!img) { const g = await runImage(prompt + ', cinematic film still, wide composition', aspect_ratio); img = keep(g.path, 'image', 'frame ' + prompt.slice(0, 24), 'images'); }
            emit({ type: 'progress', stage: 'Animating still (free)', pct: 50 });
            const moves = ['push', 'pan', 'pull'];
            const out = await deps.cut.animateStill(deps.userData(), { image: img, seconds: 5, aspect: aspect_ratio === '1:1' ? '1:1' : aspect_ratio, move: moves[ctx.used.videos % 3], outFile: path.join(ctx.dir, 'video', `shot-${ctx.used.videos}-${Date.now().toString(36)}.mp4`) });
            const a = { file: out, kind: 'video', label: 'Shot · ' + prompt.slice(0, 30) }; ctx.assets.push(a); emit({ type: 'asset', ...a });
            return { file: out, via: 'animated still (free)' };
          }
          await ensureLocal(r);
          const hasImg = start_image && fs.existsSync(start_image);
          const file = await deps.generate({ provider: r.model.provider, model: r.model, kind: 'video', prompt, params: { aspectRatio: aspect_ratio }, toolRefs: hasImg && r.model.refInput ? [start_image] : [] });
          return { file: keep(file, 'video', prompt.slice(0, 30), 'video'), via: r.label };
        } catch (e) { lastErr = e; emit({ type: 'warn', text: `${r.label}: ${String(e.message || e).slice(0, 160)} — trying the next option` }); }
      }
      throw lastErr || new Error('No video option worked.');
    },
    async generate_voiceover({ script }) {
      if (ctx.used.audio >= ctx.budget.audio) return { error: `Voice-over budget reached (${ctx.budget.audio}).` };
      ctx.used.audio++;
      let lastErr = null;
      for (const r of ctx.routes.voice) {
        try {
          if (r.type === 'system') {
            const out = await deps.tts(script, path.join(ctx.dir, 'audio', `voice-over-${ctx.used.audio}.wav`));
            const a = { file: out, kind: 'audio', label: 'Voice-over (system voice)' }; ctx.assets.push(a); emit({ type: 'asset', ...a });
            return { file: out, via: r.label };
          }
          const file = await deps.generate({ provider: r.model.provider, model: r.model, kind: 'audio', prompt: script, params: {} });
          return { file: keep(file, 'audio', 'voice-over', 'audio'), via: r.label };
        } catch (e) { lastErr = e; emit({ type: 'warn', text: `${r.label}: ${String(e.message || e).slice(0, 160)} — trying the next option` }); }
      }
      throw lastErr || new Error('No voice option worked.');
    },
    async auto_edit({ clips = [], audio_file, style = 'cinematic', aspect_ratio = '16:9', title = '', length_seconds }) {
      const ok = clips.filter((f) => f && fs.existsSync(f));
      if (!ok.length) return { error: 'No valid clips — pass file paths returned by generate_video / generate_image.' };
      const S = { vlog: ['2beats', 'mixed', 'Natural pop', 0.5, false], cinematic: ['8beats', 'fade', 'Teal & Orange', 0, true], hype: ['beat', 'mixed', 'Bleach bypass', 1, false], luxury: ['4beats', 'fadeblack', 'Warm film', 0.3, true], product: ['2beats', 'mixed', 'Natural pop', 0.8, false], documentary: ['8beats', 'fadeblack', 'Warm film', 0.2, false] }[style] || ['4beats', 'fade', 'Natural pop', 0.3, false];
      const r = await deps.cut.autoEdit(deps.userData(), { clips: ok, music: audio_file && fs.existsSync(audio_file) ? audio_file : null, aspect: aspect_ratio, pace: S[0], transition: S[1], mixSet: ['fade', 'smoothleft', 'fadewhite'], auto: true, look: S[2], zoomPulse: S[3], letterbox: S[4], highlights: true, title, length: length_seconds || 0, outDir: path.join(ctx.dir, 'video') }, (p) => emit({ type: 'progress', stage: 'Editing · ' + p.stage, pct: p.pct }));
      const a = { file: r.file, kind: 'video', label: 'Final edit' }; ctx.assets.push(a); emit({ type: 'asset', ...a });
      return { file: r.file, shots: r.shots, duration: r.duration };
    },
    async color_grade({ file, look = 'Natural pop' }) {
      if (!file || !fs.existsSync(file)) return { error: 'File not found.' };
      const r = await deps.cut.autoColor(deps.userData(), { file, auto: true, look, outDir: path.dirname(file) }, (p) => emit({ type: 'progress', stage: 'Colour · ' + p.stage, pct: p.pct }));
      const a = { file: r.file, kind: /\.(png|jpe?g)$/i.test(r.file) ? 'image' : 'video', label: 'Graded · ' + look }; ctx.assets.push(a); emit({ type: 'asset', ...a });
      return { file: r.file };
    },
    async make_presentation({ title, accent_color = '#8b6bff', slides = [] }) {
      const acc = /^#[0-9a-f]{6}$/i.test(accent_color) ? accent_color : '#8b6bff';
      const rel = (f) => (f && fs.existsSync(f) ? path.relative(path.join(ctx.dir, 'deck'), f).split(path.sep).join('/') : '');
      const body = slides.map((s, i) => {
        const img = rel(s.image_file);
        return `<section class="s${img ? ' has-img' : ''}">${img ? `<div class="vis" style="background-image:url('${esc(img)}')"></div>` : ''}<div class="txt"><span class="no">${String(i + 1).padStart(2, '0')}</span><h2>${esc(s.title)}</h2>${s.subtitle ? `<p class="sub">${esc(s.subtitle)}</p>` : ''}${(s.bullets || []).length ? '<ul>' + s.bullets.map((b) => `<li>${esc(b)}</li>`).join('') + '</ul>' : ''}</div>${s.notes ? `<aside>${esc(s.notes)}</aside>` : ''}</section>`;
      }).join('\n');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:13.333in 7.5in;margin:0}*{box-sizing:border-box}body{margin:0;background:#0b0a12;font-family:"Segoe UI",system-ui,sans-serif;color:#f1eefb}
.s{position:relative;width:13.333in;height:7.5in;overflow:hidden;page-break-after:always;display:flex;align-items:center;background:radial-gradient(120% 90% at 0% 0%,${acc}33,transparent 60%),#0f0d18}
.s .txt{position:relative;z-index:2;padding:0.9in;max-width:7.4in}.s.has-img .txt{max-width:6.2in}
.vis{position:absolute;right:0;top:0;width:52%;height:100%;background-size:cover;background-position:center;mask-image:linear-gradient(90deg,transparent,#000 22%);-webkit-mask-image:linear-gradient(90deg,transparent,#000 22%)}
.no{font-size:14px;letter-spacing:.2em;color:${acc}}h2{font-size:46px;line-height:1.05;margin:.1in 0 .18in}.sub{font-size:22px;color:#c9c4dc;margin:0 0 .2in}
ul{padding-left:22px;font-size:21px;line-height:1.5;color:#e6e2f2}li::marker{color:${acc}}aside{display:none}
.s:first-child h2{font-size:64px;background:linear-gradient(90deg,#fff,${acc});-webkit-background-clip:text;color:transparent}
@media screen{body{display:flex;flex-direction:column;align-items:center;gap:24px;padding:24px}.s{border-radius:18px;box-shadow:0 20px 60px #0008}}
</style></head><body>${body}</body></html>`;
      const htmlFile = path.join(ctx.dir, 'deck', slug(title) + '.html');
      fs.writeFileSync(htmlFile, html);
      let pdf = null;
      try { pdf = await deps.toPdf(htmlFile, htmlFile.replace(/\.html$/, '.pdf')); } catch (e) { emit({ type: 'warn', text: 'PDF export failed: ' + e.message }); }
      const a = { file: pdf || htmlFile, kind: 'deck', label: title }; ctx.assets.push(a); emit({ type: 'asset', ...a });
      return { html: htmlFile, pdf, slides: slides.length };
    },
    async list_assets() { return { assets: ctx.assets.map((a) => ({ file: a.file, kind: a.kind, label: a.label })), docs: ctx.docs, used: ctx.used, budget: ctx.budget }; },
    async finish({ summary = '', next_steps = [] }) {
      const rel = (f) => path.relative(ctx.dir, f).split(path.sep).join('/');
      const imgs = ctx.assets.filter((a) => a.kind === 'image'), vids = ctx.assets.filter((a) => a.kind === 'video'), aud = ctx.assets.filter((a) => a.kind === 'audio'), decks = ctx.assets.filter((a) => a.kind === 'deck');
      const sec = (t, inner) => (inner ? `<h2>${t}</h2>${inner}` : '');
      const page = `<!doctype html><meta charset="utf-8"><title>Launch package</title><style>${PAGE_CSS}</style><div class="wrap">
<h1>Launch package</h1><p>${esc(summary)}</p>
${sec('Final video & shots', vids.length ? '<div class="grid">' + vids.map((v) => `<div class="card"><video src="${esc(rel(v.file))}" controls></video><p>${esc(v.label)}</p></div>`).join('') + '</div>' : '')}
${sec('Images', imgs.length ? '<div class="grid">' + imgs.map((v) => `<div class="card"><a href="${esc(rel(v.file))}"><img src="${esc(rel(v.file))}"></a><p>${esc(v.label)}</p></div>`).join('') + '</div>' : '')}
${sec('Presentation', decks.map((d) => `<p><a href="${esc(rel(d.file))}">${esc(d.label)}</a></p>`).join(''))}
${sec('Voice-over', aud.map((a) => `<div class="doc"><audio src="${esc(rel(a.file))}" controls></audio></div>`).join(''))}
${sec('Documents', ctx.docs.map((d) => `<p><a href="${esc(rel(d.file).replace(/\.md$/, '.html'))}">${esc(d.title)}</a></p>`).join(''))}
${sec('Next steps', next_steps.length ? '<ul>' + next_steps.map((n) => `<li>${esc(n)}</li>`).join('') + '</ul>' : '')}
<p style="color:#77738c;font-size:12px;margin-top:40px">Made with God's Pandora · Pandora Agent</p></div>`;
      const index = path.join(ctx.dir, 'index.html');
      fs.writeFileSync(index, page);
      fs.writeFileSync(path.join(ctx.dir, 'README.md'), `# Launch package\n\n${summary}\n\n## Contents\n${ctx.assets.map((a) => `- ${a.kind}: ${rel(a.file)}`).join('\n')}\n${ctx.docs.map((d) => `- doc: ${rel(d.file)}`).join('\n')}\n\n## Next steps\n${next_steps.map((n) => '- ' + n).join('\n')}\n`);
      return { index, dir: ctx.dir, summary, next_steps, counts: { images: imgs.length, videos: vids.length, docs: ctx.docs.length, decks: decks.length, audio: aud.length } };
    },
  };
}

// A long-lived toolbox for external AI assistants (MCP connector): same tools, same free/paid routing,
// one project folder per session, generous but finite budgets.
async function createToolbox(deps, opts = {}) {
  const routes = await planRoutes(deps, opts);
  const dir = path.join(deps.userData(), 'agent-projects', new Date().toISOString().slice(0, 10) + '-connector-' + slug(opts.label || 'session') + '-' + Date.now().toString(36));
  for (const d of ['images', 'video', 'audio', 'docs', 'deck']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const ctx = { dir, assets: [], docs: [], routes, budget: { images: opts.images ?? 40, videos: opts.videos ?? 12, audio: opts.audio ?? 6 }, used: { images: 0, videos: 0, audio: 0 }, reviewPlan: false, models: [] };
  const state = { done: false, cancelled: false, approve: null, dir };
  const tools = makeTools(deps, ctx, state, (ev) => deps.emit({ ...ev, source: 'connector', at: Date.now() }));
  return { ctx, tools, routes };
}

function approve(ok, note) { if (current && current.approve) { current.approve({ ok, note }); return true; } return false; }
function tell(text) { if (current && !current.done && text) { current.inbox.push(String(text).slice(0, 2000)); return true; } return false; }
function cancel() { if (current && !current.done) { current.cancelled = true; if (current.approve) current.approve({ ok: false, note: 'cancelled' }); return true; } return false; }
function status() { return current ? { running: !current.done, dir: current.dir, waiting: !!current.approve } : { running: false }; }

module.exports = { run, approve, tell, cancel, status, readyModels, planRoutes, routeText, createToolbox, TOOLS };
