// Creative app bridges: open-source MCP servers that let Claude (and other MCP clients) drive Blender,
// DaVinci Resolve and Premiere Pro next to God's Pandora. Claude Desktop is the hub; Pandora detects the apps,
// writes the Blender entry automatically and guides the Resolve / Premiere installs (they ship their own installers).
const fs = require('fs'); const path = require('path'); const { execFile } = require('child_process');
const which = (cmd) => new Promise((res) => execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], { windowsHide: true }, (e, out) => res(e ? '' : String(out).split(/\r?\n/)[0].trim())));
const exists = (...p) => p.some((x) => x && fs.existsSync(x));
const PF = process.env.ProgramFiles || 'C:\\Program Files', PD = process.env.ProgramData || 'C:\\ProgramData';
const BRIDGES = [
  { id: 'blender', name: 'Blender', repo: 'https://github.com/ahujasid/blender-mcp', server: { command: 'uvx', args: ['blender-mcp'] },
    steps: ['Install uv (Python runner) — click "Get uv" and run the one-line command it shows.', 'In Blender: Edit → Preferences → Add-ons → Install, pick addon.py from the repo, enable "Blender MCP".', 'Blender sidebar (N) → BlenderMCP → Connect.', 'Click "Add to Claude Desktop" here, then restart Claude Desktop.'] },
  { id: 'resolve', name: 'DaVinci Resolve', repo: 'https://github.com/samuelgursky/davinci-resolve-mcp',
    steps: ['Download the repo (Code → Download ZIP) and unzip it.', 'Run its installer: python install.py — it adds itself to Claude Desktop / Cursor.', 'Resolve Studio exposes scripting directly; the free edition needs the repo\'s in-app bridge script.', 'God\'s Pandora also sends files straight to Resolve\'s media pool from the Gallery (→ Resolve).'] },
  { id: 'premiere', name: 'Adobe Premiere Pro', repo: 'https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP', alt: 'https://github.com/morim3/mcp_adobe_premiere',
    steps: ['Download the repo and follow its README to install the Premiere panel (CEP/UXP) and the MCP server.', 'Open Premiere, open the panel so the bridge is listening.', 'Add the server to Claude Desktop as the README shows, then restart Claude Desktop.', 'These are community projects — expect rough edges.'] },
];
async function detect() {
  const uvx = await which('uvx'); const python = (await which('python')) || (await which('py'));
  const blender = exists(path.join(PF, 'Blender Foundation')) || !!(await which('blender'));
  const resolve = exists(path.join(PF, 'Blackmagic Design', 'DaVinci Resolve'), path.join(PD, 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Developer', 'Scripting'));
  const premiere = exists(path.join(PF, 'Adobe')) && fs.existsSync(path.join(PF, 'Adobe')) && fs.readdirSync(path.join(PF, 'Adobe')).some((d) => /Premiere Pro/i.test(d));
  return { uvx: !!uvx, python: !!python, apps: { blender, resolve, premiere } };
}
function claudeCfg(appData) { const f = path.join(appData, 'Claude', 'claude_desktop_config.json'); let c = {}; if (fs.existsSync(f)) { try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { throw new Error('Claude Desktop config is not valid JSON — fix it first: ' + f); } } return { f, c }; }
function inClaude(appData) { try { const { c } = claudeCfg(appData); const s = Object.keys(c.mcpServers || {}).join(' ').toLowerCase(); return { blender: /blender/.test(s), resolve: /resolve|davinci/.test(s), premiere: /premiere/.test(s), pandora: /pandora/.test(s) }; } catch (_) { return {}; } }
function addToClaude(appData, id) {
  const b = BRIDGES.find((x) => x.id === id); if (!b || !b.server) throw new Error('This bridge installs itself — follow the steps.');
  const { f, c } = claudeCfg(appData); if (fs.existsSync(f)) fs.copyFileSync(f, f + '.pandora-backup');
  c.mcpServers = { ...(c.mcpServers || {}), [id]: b.server }; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(c, null, 2));
  return { file: f };
}
module.exports = { BRIDGES, detect, inClaude, addToClaude };
