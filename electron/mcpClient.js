// MCP client hub: lets Pandora Agent drive other apps (Blender, DaVinci Resolve, Premiere Pro, …) through their
// open-source MCP servers (stdio transport, newline-delimited JSON-RPC). Servers start on demand and stay warm.
// Bridge list lives in <userData>/bridges.json: [{ id, name, command, args, env, enabled }].
'use strict';
const fs = require('fs'); const path = require('path'); const os = require('os');
const { spawn, execFileSync } = require('child_process');

let cfgFile = null; const live = new Map(); // id -> { proc, tools, pending, nextId, buf, error, ready }
const PROTO = '2025-06-18';
const DEFAULTS = [
  { id: 'blender', name: 'Blender', command: 'uvx', args: ['blender-mcp'], enabled: false },
  { id: 'resolve', name: 'DaVinci Resolve', command: '', args: [], enabled: false },
  { id: 'premiere', name: 'Premiere Pro', command: '', args: [], enabled: false },
];

function init(userData) { cfgFile = path.join(userData, 'bridges.json'); }
function load() { let c = []; try { c = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch (_) {} const out = DEFAULTS.map((d) => ({ ...d, ...(c.find((x) => x.id === d.id) || {}) })); c.filter((x) => !DEFAULTS.some((d) => d.id === x.id)).forEach((x) => out.push(x)); return out; }
function save(list) { fs.mkdirSync(path.dirname(cfgFile), { recursive: true }); fs.writeFileSync(cfgFile, JSON.stringify(list, null, 2)); }
function update(id, patch) { const list = load(); const i = list.findIndex((x) => x.id === id); if (i < 0) list.push({ id, ...patch }); else list[i] = { ...list[i], ...patch }; save(list); stopOne(id); return list; }

// pick up servers the Resolve / Premiere installers wrote into Claude Desktop's config
function importFromClaude(appData) {
  const f = path.join(appData, 'Claude', 'claude_desktop_config.json'); let c = {}; try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return { imported: [] }; }
  const list = load(); const imported = [];
  for (const [name, s] of Object.entries(c.mcpServers || {})) {
    if (!s || !s.command || /pandora/i.test(name)) continue;
    const id = /blender/i.test(name) ? 'blender' : /resolve|davinci/i.test(name) ? 'resolve' : /premiere/i.test(name) ? 'premiere' : name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
    const i = list.findIndex((x) => x.id === id); const e = { id, name: list[i]?.name || name, command: s.command, args: s.args || [], env: s.env || {}, enabled: true };
    if (i < 0) list.push(e); else list[i] = { ...list[i], ...e }; imported.push(id); stopOne(id);
  }
  save(list); return { imported };
}

// Windows: resolve "uvx" / "python" / "npx" to a real file; .cmd/.bat need a shell
function resolveCmd(cmd) {
  if (!cmd || path.isAbsolute(cmd) || process.platform !== 'win32') return { file: cmd, shell: false };
  try { const hit = execFileSync('where', [cmd], { windowsHide: true, env: envFor() }).toString().split(/\r?\n/).filter(Boolean); const exe = hit.find((h) => /\.exe$/i.test(h)) || hit[0]; return { file: exe, shell: /\.(cmd|bat)$/i.test(exe) }; } catch (_) { return { file: cmd, shell: true }; }
}
function envFor(extra = {}) { const home = os.homedir(); const add = [path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin'), path.join(process.env.APPDATA || '', 'Python', 'Scripts')].join(path.delimiter); return { ...process.env, PATH: add + path.delimiter + (process.env.PATH || ''), ...extra }; }

function send(b, msg) { b.proc.stdin.write(JSON.stringify(msg) + '\n'); }
function request(b, method, params, ms = 60000) {
  return new Promise((resolve, reject) => { const id = b.nextId++; const t = setTimeout(() => { b.pending.delete(id); reject(new Error(`${b.name}: no answer to ${method} (${Math.round(ms / 1000)} s)`)); }, ms);
    b.pending.set(id, { resolve: (r) => { clearTimeout(t); resolve(r); }, reject: (e) => { clearTimeout(t); reject(e); } }); send(b, { jsonrpc: '2.0', id, method, params }); });
}

async function start(cfg) {
  if (live.has(cfg.id) && live.get(cfg.id).ready) return live.get(cfg.id);
  if (!cfg.command) throw new Error(`${cfg.name}: no command set — install its MCP server, then "Import from Claude Desktop".`);
  const { file, shell } = resolveCmd(cfg.command);
  const args = (cfg.args || []).map((a) => shell && /\s/.test(a) ? `"${a}"` : a);
  const proc = spawn(shell ? `"${file}"` : file, args, { env: envFor(cfg.env), windowsHide: true, shell, stdio: ['pipe', 'pipe', 'pipe'] });
  const b = { id: cfg.id, name: cfg.name || cfg.id, proc, pending: new Map(), nextId: 1, buf: '', err: '', tools: [], ready: false };
  live.set(cfg.id, b);
  proc.stdout.on('data', (d) => { b.buf += d.toString(); let i; while ((i = b.buf.indexOf('\n')) >= 0) { const line = b.buf.slice(0, i).trim(); b.buf = b.buf.slice(i + 1); if (!line) continue;
    let m; try { m = JSON.parse(line); } catch (_) { continue; }
    if (m.id != null && b.pending.has(m.id) && (m.result !== undefined || m.error)) { const p = b.pending.get(m.id); b.pending.delete(m.id); m.error ? p.reject(new Error(`${b.name}: ${m.error.message || JSON.stringify(m.error)}`)) : p.resolve(m.result); }
    else if (m.id != null && m.method) send(b, { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'not supported' } }); } });
  proc.stderr.on('data', (d) => { b.err = (b.err + d.toString()).slice(-2000); });
  const died = new Promise((_, rej) => { proc.on('error', (e) => rej(new Error(`${b.name}: could not start "${cfg.command}" — ${e.message}`))); proc.on('exit', (c) => { b.ready = false; live.delete(cfg.id); for (const p of b.pending.values()) p.reject(new Error(`${b.name} stopped (code ${c}). ${b.err.split('\n').slice(-3).join(' ')}`)); b.pending.clear(); rej(new Error(`${b.name} stopped (code ${c}). ${b.err.split('\n').slice(-3).join(' ')}`)); }); });
  died.catch(() => {});
  const go = (async () => {
    await request(b, 'initialize', { protocolVersion: PROTO, capabilities: {}, clientInfo: { name: 'gods-pandora-agent', version: '0.6' } }, 180000);
    send(b, { jsonrpc: '2.0', method: 'notifications/initialized' });
    const r = await request(b, 'tools/list', {}, 60000); b.tools = r.tools || []; b.ready = true; return b;
  })();
  try { return await Promise.race([go, died]); } catch (e) { stopOne(cfg.id); throw e; }
}
function stopOne(id) { const b = live.get(id); if (b) { try { b.proc.kill(); } catch (_) {} live.delete(id); } }
function stopAll() { for (const id of [...live.keys()]) stopOne(id); }

const safeName = (id, n) => (id + '__' + n).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
// tools for the agent from every enabled bridge (servers that fail are reported, not fatal)
async function agentTools() {
  const tools = [], notes = [];
  for (const cfg of load().filter((c) => c.enabled && c.command)) {
    try { const b = await start(cfg); for (const t of b.tools) tools.push({ name: safeName(cfg.id, t.name), description: `[${b.name}] ${(t.description || t.name).slice(0, 900)}`, input_schema: t.inputSchema && t.inputSchema.type ? t.inputSchema : { type: 'object', properties: {} }, _bridge: cfg.id, _tool: t.name }); notes.push(`${b.name}: ${b.tools.length} tools`); }
    catch (e) { notes.push(`${cfg.name || cfg.id}: unavailable (${String(e.message || e).slice(0, 160)})`); }
  }
  return { tools, notes };
}
async function callTool(def, input, saveDir) {
  const cfg = load().find((c) => c.id === def._bridge); const b = await start(cfg);
  const r = await request(b, 'tools/call', { name: def._tool, arguments: input || {} }, 10 * 60 * 1000);
  const out = { isError: !!r.isError, text: '', files: [] };
  for (const c of r.content || []) {
    if (c.type === 'text') out.text += (out.text ? '\n' : '') + c.text;
    else if (c.type === 'image' && c.data && saveDir) { const f = path.join(saveDir, `${def._bridge}-${Date.now()}.${(c.mimeType || 'image/png').split('/')[1] || 'png'}`); fs.mkdirSync(saveDir, { recursive: true }); fs.writeFileSync(f, Buffer.from(c.data, 'base64')); out.files.push(f); }
    else if (c.type === 'resource' && c.resource?.text) out.text += '\n' + c.resource.text;
  }
  out.text = out.text.slice(0, 6000); return out;
}
async function test(id) { stopOne(id); const cfg = load().find((c) => c.id === id); const b = await start(cfg); return { tools: b.tools.map((t) => t.name) }; }
function status() { return load().map((c) => ({ ...c, running: !!live.get(c.id)?.ready, tools: live.get(c.id)?.tools?.length || 0 })); }

module.exports = { init, load, update, importFromClaude, agentTools, callTool, test, status, stopAll };
