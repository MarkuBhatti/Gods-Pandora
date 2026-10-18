// Pandora Connect — a Model Context Protocol (MCP) server inside God's Pandora.
// Lets Claude (Desktop / Code), ChatGPT, Cursor, VS Code, Windsurf or any MCP client drive the studio:
// generate images / video / voice-overs, auto-edit, colour-grade, build decks, write docs, run the full agent.
//
// • Streamable HTTP transport on 127.0.0.1 only (JSON responses), protected by a bearer token.
// • A tiny stdio bridge (written to the user's data folder) for clients that launch local servers (Claude Desktop).
// • Uses the same free/paid routing as Pandora Agent (Free / Hybrid / Cloud) and session budgets.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROTOCOL = '2025-06-18';
let server = null;
let cfgPath = null;
let deps = null;
const sessions = new Map(); // sessionId -> { toolbox, created }
const jobs = new Map();     // jobId -> { status, result, error, label, started }

function loadCfg() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (_) {}
  const def = { enabled: false, port: 8765, token: crypto.randomBytes(24).toString('base64url'), mode: 'hybrid', images: 40, videos: 12, audio: 6 };
  const out = { ...def, ...c };
  if (!c.token) saveCfg(out);
  return out;
}
function saveCfg(c) { fs.mkdirSync(path.dirname(cfgPath), { recursive: true }); fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2)); }

const text = (t) => ({ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) });

// ── tool catalogue exposed to external assistants ──
function toolList() {
  const { TOOLS } = require('./agent');
  const pick = TOOLS.filter((t) => !['propose_plan'].includes(t.name)).map((t) => ({
    name: t.name === 'finish' ? 'finish_package' : t.name,
    description: t.name === 'finish' ? 'Assemble everything made in this session into a launch package (index page + README) and return its folder.' : t.description + (['generate_video', 'auto_edit'].includes(t.name) ? ' Long-running: returns a job_id — call check_job to get the result.' : ''),
    inputSchema: t.input_schema,
  }));
  return [
    { name: 'pandora_status', description: "What God's Pandora can do right now: production mode (free/hybrid/cloud), which model each step will use, session budgets and the project folder.", inputSchema: { type: 'object', properties: {} } },
    ...pick,
    { name: 'run_agent', description: "Hand a whole job to Pandora Agent (it plans and uses every tool itself) — e.g. 'launch my clothing brand: images, promo video, deck'. Returns a job_id; call check_job until done.", inputSchema: { type: 'object', properties: { goal: { type: 'string' }, images: { type: 'number' }, videos: { type: 'number' } }, required: ['goal'] } },
    { name: 'check_job', description: 'Wait up to ~45 s for a long-running job (video, auto edit, agent) and return its status or result.', inputSchema: { type: 'object', properties: { job_id: { type: 'string' } }, required: ['job_id'] } },
  ];
}

async function sessionFor(id) {
  let s = sessions.get(id);
  if (!s) {
    const c = loadCfg();
    s = { toolbox: await require('./agent').createToolbox(deps, { mode: c.mode, label: 'mcp', images: c.images, videos: c.videos, audio: c.audio, brain: 'local' }), created: Date.now() };
    sessions.set(id, s);
  }
  return s;
}

function startJob(label, fn) {
  const id = 'job_' + crypto.randomBytes(6).toString('hex');
  const j = { status: 'running', label, started: Date.now() };
  jobs.set(id, j);
  fn().then((r) => { j.status = 'done'; j.result = r; }).catch((e) => { j.status = 'error'; j.error = String(e.message || e); });
  return id;
}

async function withPreview(result) {
  const content = [text(result)];
  const f = result && result.file;
  if (f && /\.(png|jpe?g|webp)$/i.test(f) && deps.thumb) {
    try { const b64 = await deps.thumb(f); if (b64) content.push({ type: 'image', data: b64, mimeType: 'image/jpeg' }); } catch (_) {}
  }
  return content;
}

async function callTool(sessionId, name, args = {}) {
  const s = await sessionFor(sessionId);
  const tb = s.toolbox;
  deps.emit({ type: 'tool', source: 'connector', name, input: Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 160) : v])) });
  if (name === 'pandora_status') {
    const r = tb.routes; const rt = require('./agent').routeText;
    return [text({ mode: r.mode, gpu: r.gpu, vram_gb: r.vram, images: rt(r.image), video: rt(r.video), voice: rt(r.voice), budgets: tb.ctx.budget, used: tb.ctx.used, project_folder: tb.ctx.dir, tips: 'Use returned file paths in later calls (reference_file, start_image, clips, image_file). Call finish_package at the end.' })];
  }
  if (name === 'check_job') {
    const j = jobs.get(args.job_id);
    if (!j) return [text({ error: 'Unknown job_id' })];
    const until = Date.now() + 45000;
    while (j.status === 'running' && Date.now() < until) await new Promise((r) => setTimeout(r, 1000));
    if (j.status === 'running') return [text({ status: 'running', label: j.label, elapsed_s: Math.round((Date.now() - j.started) / 1000), hint: 'Still working — call check_job again.' })];
    if (j.status === 'error') return [text({ status: 'error', error: j.error })];
    return withPreview({ status: 'done', ...j.result });
  }
  if (name === 'run_agent') {
    const c = loadCfg();
    const id = startJob('Pandora Agent: ' + String(args.goal).slice(0, 60), () => require('./agent').run(deps, { goal: String(args.goal || ''), mode: c.mode, brain: deps.keys().anthropic && c.mode !== 'free' ? 'claude' : 'local', images: args.images ?? 8, videos: args.videos ?? 3, audio: 1, reviewPlan: false }));
    return [text({ job_id: id, status: 'running', note: 'The agent is working inside God\'s Pandora. Call check_job with this id.' })];
  }
  const map = { finish_package: 'finish' };
  const fnName = map[name] || name;
  const fn = tb.tools[fnName];
  if (!fn || fnName === 'propose_plan') return [text({ error: 'Unknown tool: ' + name })];
  if (['generate_video', 'auto_edit'].includes(fnName)) {
    const id = startJob(name, () => fn(args));
    return [text({ job_id: id, status: 'running', note: 'Call check_job with this id to get the file.' })];
  }
  return withPreview(await fn(args));
}

async function handleRpc(msg, sessionId) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  try {
    if (method === 'initialize') return ok({ protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "God's Pandora", version: deps.version || '0.4.0' }, instructions: "God's Pandora is a creative studio. Start with pandora_status, then use generate_image / generate_video / generate_voiceover / write_document / make_presentation / auto_edit / color_grade, and finish_package at the end. For a whole campaign, call run_agent." });
    if (method === 'ping') return ok({});
    if (method === 'tools/list') return ok({ tools: toolList() });
    if (method === 'tools/call') {
      try { return ok({ content: await callTool(sessionId, params && params.name, (params && params.arguments) || {}) }); }
      catch (e) { return ok({ content: [text('Error: ' + String(e.message || e))], isError: true }); }
    }
    if (method && method.startsWith('notifications/')) return null;
    if (method === 'resources/list') return ok({ resources: [] });
    if (method === 'prompts/list') return ok({ prompts: [] });
    return fail(-32601, 'Method not found: ' + method);
  } catch (e) { return fail(-32603, String(e.message || e)); }
}

function start(d) {
  deps = d; cfgPath = path.join(d.userData(), 'connector', 'mcp.json');
  const c = loadCfg();
  writeBridge();
  if (!c.enabled || server) return status();
  server = http.createServer(async (req, res) => {
    const cors = { 'Access-Control-Allow-Origin': 'null', 'Cache-Control': 'no-store' };
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) { res.writeHead(403, cors); return res.end('Forbidden origin'); } // DNS-rebinding guard
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/mcp') { res.writeHead(404, cors); return res.end('Not found'); }
    const tok = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
    const want = loadCfg().token;
    if (!tok || tok.length !== want.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(want))) { res.writeHead(401, { ...cors, 'WWW-Authenticate': 'Bearer' }); return res.end('Unauthorized — use the token shown in God\'s Pandora → Pandora Connect'); }
    if (req.method === 'GET') { res.writeHead(405, { ...cors, Allow: 'POST' }); return res.end(); }
    if (req.method === 'DELETE') { sessions.delete(req.headers['mcp-session-id']); res.writeHead(200, cors); return res.end(); }
    if (req.method !== 'POST') { res.writeHead(405, cors); return res.end(); }
    let body = '';
    req.on('data', (ch) => { body += ch; if (body.length > 5e6) req.destroy(); });
    req.on('end', async () => {
      let msg; try { msg = JSON.parse(body); } catch (_) { res.writeHead(400, cors); return res.end('Bad JSON'); }
      let sid = req.headers['mcp-session-id'];
      const isInit = (Array.isArray(msg) ? msg : [msg]).some((m) => m && m.method === 'initialize');
      if (isInit || !sid) sid = crypto.randomUUID();
      const list = Array.isArray(msg) ? msg : [msg];
      const out = (await Promise.all(list.map((m) => handleRpc(m, sid)))).filter(Boolean);
      const headers = { ...cors, 'Content-Type': 'application/json', 'Mcp-Session-Id': sid };
      if (!out.length) { res.writeHead(202, headers); return res.end(); }
      res.writeHead(200, headers);
      res.end(JSON.stringify(Array.isArray(msg) ? out : out[0]));
    });
  });
  server.on('error', (e) => { deps.emit({ type: 'warn', source: 'connector', text: 'Pandora Connect could not start: ' + e.message }); server = null; });
  server.listen(c.port, '127.0.0.1');
  return status();
}
function stop() { if (server) { server.close(); server = null; } sessions.clear(); return status(); }

function bridgePath() { return path.join(path.dirname(cfgPath), 'pandora-mcp.js'); }
// stdio ⇄ HTTP bridge for Claude Desktop & other clients that launch a local command (runs with the app's own runtime)
function writeBridge() {
  const src = `// God's Pandora MCP bridge (stdio ⇄ http). Generated by the app — safe to delete, it is recreated on start.
const URL_ = process.env.PANDORA_MCP_URL || 'http://127.0.0.1:8765/mcp';
const TOKEN = process.env.PANDORA_MCP_TOKEN || '';
let sid = null, buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) send(line); } });
async function send(line) {
  let msg; try { msg = JSON.parse(line); } catch (_) { return; }
  try {
    const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'Bearer ' + TOKEN, ...(sid ? { 'Mcp-Session-Id': sid } : {}) }, body: line });
    const s = r.headers.get('mcp-session-id'); if (s) sid = s;
    if (r.status === 202) return;
    const t = await r.text();
    if (!r.ok) throw new Error(r.status + ' ' + t);
    process.stdout.write(t.replace(/\\n/g, ' ') + '\\n');
  } catch (e) {
    if (msg && msg.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: "God's Pandora is not reachable — open the app and turn on Pandora Connect. (" + e.message + ")" } }) + '\\n');
  }
}
`;
  try { fs.mkdirSync(path.dirname(bridgePath()), { recursive: true }); fs.writeFileSync(bridgePath(), src); } catch (_) {}
}

function status() {
  const c = loadCfg();
  const url = `http://127.0.0.1:${c.port}/mcp`;
  return { enabled: c.enabled, running: !!server, port: c.port, url, token: c.token, mode: c.mode, images: c.images, videos: c.videos, audio: c.audio, bridge: bridgePath(), exe: process.execPath, sessions: sessions.size };
}
function configure(patch = {}) {
  const c = { ...loadCfg() };
  for (const k of ['enabled', 'port', 'mode', 'images', 'videos', 'audio']) if (patch[k] !== undefined) c[k] = patch[k];
  if (patch.newToken) c.token = crypto.randomBytes(24).toString('base64url');
  c.port = Math.min(65000, Math.max(1024, +c.port || 8765));
  saveCfg(c);
  stop(); sessions.clear();
  return c.enabled ? start(deps) : status();
}

// Snippets / one-click setup for popular clients
function clientConfigs() {
  const s = status();
  const stdio = { command: s.exe, args: [s.bridge], env: { ELECTRON_RUN_AS_NODE: '1', PANDORA_MCP_URL: s.url, PANDORA_MCP_TOKEN: s.token } };
  return {
    claudeDesktop: { mcpServers: { 'gods-pandora': stdio } },
    claudeCode: `claude mcp add --transport http gods-pandora ${s.url} --header "Authorization: Bearer ${s.token}"`,
    cursor: { mcpServers: { 'gods-pandora': { url: s.url, headers: { Authorization: 'Bearer ' + s.token } } } },
    vscode: { servers: { 'gods-pandora': { type: 'http', url: s.url, headers: { Authorization: 'Bearer ' + s.token } } } },
    windsurf: { mcpServers: { 'gods-pandora': { serverUrl: s.url, headers: { Authorization: 'Bearer ' + s.token } } } },
    tunnelUrl: `${s.url}?token=${s.token}`,
  };
}

// One click: add God's Pandora to Claude Desktop's config (keeps a backup of the old file)
function addToClaudeDesktop(appData) {
  const file = path.join(appData, 'Claude', 'claude_desktop_config.json');
  let cfg = {};
  if (fs.existsSync(file)) {
    try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { throw new Error('Claude Desktop config is not valid JSON — fix it first: ' + file); }
    fs.copyFileSync(file, file + '.pandora-backup');
  }
  cfg.mcpServers = { ...(cfg.mcpServers || {}), ...clientConfigs().claudeDesktop.mcpServers };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return { file, restart: 'Quit and reopen Claude Desktop — "gods-pandora" appears under its tools/connectors.' };
}

module.exports = { start, stop, status, configure, clientConfigs, addToClaudeDesktop, handleRpc, jobsCount: () => jobs.size };
