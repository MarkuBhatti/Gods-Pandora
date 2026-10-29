import React, { useEffect, useState } from 'react';
import PandoraBox from '../lib/PandoraBox.jsx';

// Pandora Connect — let Claude, ChatGPT, Cursor, VS Code… use God's Pandora as a tool (Model Context Protocol).
const copy = (t) => { try { navigator.clipboard.writeText(typeof t === 'string' ? t : JSON.stringify(t, null, 2)); return true; } catch { return false; } };

function Snip({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  const txt = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <div className="cn-snip">
      <pre>{txt}</pre>
      <button className="btn ghost small" onClick={() => { copy(txt); setDone(true); setTimeout(() => setDone(false), 1500); }}>{done ? '✓ Copied' : label}</button>
    </div>
  );
}

const EXAMPLES = [
  'Use God\'s Pandora to create 4 product photos of a black leather backpack on marble, then a 10-slide pitch deck about it.',
  'With God\'s Pandora: make a 15-second vertical promo for my coffee brand "Ember" — images, two video shots, auto edit in hype style, then colour grade it.',
  'Ask God\'s Pandora to run its agent: launch my clothing brand NOIR LANE with a full launch package.',
];

export default function PandoraConnect() {
  const [st, setSt] = useState(null);
  const [cfgs, setCfgs] = useState(null);
  const [show, setShow] = useState(false);
  const [client, setClient] = useState('claude');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const refresh = async () => {
    try { setSt(await window.api.connect.status()); setCfgs(await window.api.connect.configs()); } catch (e) { setErr(String(e.message || e)); }
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, []);
  const conf = async (patch) => { setErr(''); try { setSt(await window.api.connect.configure(patch)); setCfgs(await window.api.connect.configs()); } catch (e) { setErr(String(e.message || e)); } };
  const addClaude = async () => {
    setErr(''); setMsg('');
    if (!window.confirm('Add God\'s Pandora to Claude Desktop?\n\nThis adds a "gods-pandora" entry to Claude Desktop\'s config file (a backup of the old file is kept). Restart Claude Desktop afterwards.')) return;
    try { const r = await window.api.connect.addClaude(); setMsg('✓ Added to Claude Desktop. ' + r.restart); } catch (e) { setErr(String(e.message || e)); }
  };

  const tok = st && st.token ? (show ? st.token : st.token.slice(0, 4) + '••••••••••••' + st.token.slice(-4)) : '';
  const CLIENTS = [['claude', 'Claude Desktop'], ['claudeweb', 'Claude (connector URL)'], ['claudecode', 'Claude Code'], ['chatgpt', 'ChatGPT'], ['cursor', 'Cursor'], ['vscode', 'VS Code / Copilot'], ['windsurf', 'Windsurf'], ['any', 'Any MCP app']];

  return (
    <div>
      <div className="row" style={{ alignItems: 'center', gap: 16, flexWrap: 'nowrap' }}>
        <PandoraBox size={64} sparks={false} />
        <div>
          <h1 style={{ margin: 0 }}>🔌 Pandora Connect</h1>
          <p className="sub" style={{ margin: '4px 0 0' }}>Connect Claude, ChatGPT, Cursor or any AI assistant to God's Pandora. Ask them in chat — they use your studio to make images, videos, voice-overs, edits, grades and decks, free on your PC or with your API keys.</p>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>Connector</h3>
            <button className={'cn-toggle' + (st?.enabled ? ' on' : '')} onClick={() => conf({ enabled: !st?.enabled })} aria-label="Turn the connector on or off"><i /></button>
          </div>
          <p className="sub" style={{ fontSize: 12 }}>
            {st?.running ? <>🟢 Running at <code>{st.url}</code> · {st.sessions} active session(s)</> : st?.enabled ? '🟠 Starting… (if it stays orange, change the port)' : '⚪ Off — turn it on to let assistants use God\'s Pandora.'}
          </p>
          <label>Access token (keep it private)</label>
          <div className="row"><code className="cn-tok">{tok}</code>
            <button className="btn ghost small" onClick={() => setShow((v) => !v)}>{show ? 'Hide' : 'Show'}</button>
            <button className="btn ghost small" onClick={() => copy(st?.token || '')}>Copy</button>
            <button className="btn ghost small" onClick={() => window.confirm('Create a new token? Connected apps must be set up again.') && conf({ newToken: true })}>New token</button>
          </div>
          <label>How assistants run each step</label>
          <div className="row">
            {[['free', '🆓 Free (your PC)'], ['hybrid', '⚖ Hybrid'], ['cloud', '☁ Cloud APIs']].map(([id, l]) => <button key={id} className={'chip' + (st?.mode === id ? ' on' : '')} onClick={() => conf({ mode: id })}>{l}</button>)}
          </div>
          <label className="row" style={{ gap: 8, marginTop: 10 }}><input type="checkbox" checked={st?.fullAccess !== false} onChange={(e) => conf({ fullAccess: e.target.checked })} /><b>Full access</b><span className="sub">— Claude can generate, edit, grade, cut, browse your Gallery, open results in Pandora and use connected apps, with no per-chat limits. Results also land in your Gallery.</span></label>
          {st?.fullAccess === false && <><label>Limits per chat session (protects your API credits)</label>
          <div className="cinerow">
            <div><label>Images: {st?.images}</label><input type="range" min="1" max="100" value={st?.images || 40} onChange={(e) => setSt((s) => ({ ...s, images: +e.target.value }))} onMouseUp={(e) => conf({ images: +e.target.value })} /></div>
            <div><label>Video shots: {st?.videos}</label><input type="range" min="0" max="40" value={st?.videos || 12} onChange={(e) => setSt((s) => ({ ...s, videos: +e.target.value }))} onMouseUp={(e) => conf({ videos: +e.target.value })} /></div>
            <div><label>Voice-overs: {st?.audio}</label><input type="range" min="0" max="20" value={st?.audio || 6} onChange={(e) => setSt((s) => ({ ...s, audio: +e.target.value }))} onMouseUp={(e) => conf({ audio: +e.target.value })} /></div>
          </div></>}
          <label>Port</label>
          <input type="number" min="1024" max="65000" defaultValue={st?.port} key={st?.port} onBlur={(e) => +e.target.value !== st?.port && conf({ port: +e.target.value })} style={{ maxWidth: 140 }} />
          <p className="sub" style={{ fontSize: 11 }}>Only apps on this computer can reach it (127.0.0.1) and every request needs the token. Files land in your Pandora projects folder and Gallery.</p>
          {msg && <div className="ok">{msg}</div>}
          {err && <div className="err">{err}</div>}

          <h3>Try asking your assistant</h3>
          {EXAMPLES.map((e) => <div key={e} className="cn-ex" onClick={() => copy(e)} title="Click to copy">💬 {e}</div>)}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Set up your app</h3>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {CLIENTS.map(([id, l]) => <button key={id} className={'chip mini' + (client === id ? ' on' : '')} onClick={() => setClient(id)}>{l}</button>)}
          </div>
          {!st?.enabled && <div className="mstat mstat-missing"><span className="mstat-dot" /><span className="mstat-txt">Turn the connector on first.</span><button className="btn small" onClick={() => conf({ enabled: true })}>Turn on</button></div>}
          {cfgs && client === 'claude' && (<>
            <p className="sub">One click adds God's Pandora to Claude Desktop. Then restart Claude Desktop and look for <b>gods-pandora</b> in the tools menu.</p>
            <button className="btn" onClick={addClaude}>＋ Add to Claude Desktop</button>
            <p className="sub" style={{ fontSize: 11, marginTop: 10 }}>Or paste this into Claude Desktop → Settings → Developer → Edit Config:</p>
            <Snip value={cfgs.claudeDesktop} />
          </>)}
          {cfgs && client === 'claudeweb' && (<>
            <p className="sub"><b>Recommended:</b> use the <a style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => setClient('claude')}>Claude Desktop</a> one-click setup — it works locally with no tunnel.</p>
            <p className="sub">Claude's <b>Settings → Connectors → Add custom connector</b> connects from Anthropic's servers, so it needs a <b>public HTTPS</b> address (it can't see <code>127.0.0.1</code>). If you see a "metadata" or "couldn't connect" error there, that's why. To use it anyway:</p>
            <Snip value={`cloudflared tunnel --url http://127.0.0.1:${st?.port || 8765}`} />
            <p className="sub">Then add a custom connector with this URL (replace the address with the one cloudflared prints) and leave OAuth settings empty:</p>
            <Snip value={cfgs.tunnelUrl.replace(`http://127.0.0.1:${st?.port || 8765}`, 'https://YOUR-TUNNEL.trycloudflare.com')} />
            <p className="sub" style={{ fontSize: 11, color: '#ffb86b' }}>⚠ Anyone with the full link can use your studio while the tunnel runs. Stop it when done and create a new token if the link was shared.</p>
          </>)}
          {cfgs && client === 'claudecode' && (<><p className="sub">Run this once in a terminal:</p><Snip value={cfgs.claudeCode} /></>)}
          {cfgs && client === 'cursor' && (<><p className="sub">Cursor → Settings → MCP → Add new global MCP server, or paste into <code>~/.cursor/mcp.json</code>:</p><Snip value={cfgs.cursor} /></>)}
          {cfgs && client === 'vscode' && (<><p className="sub">VS Code (Copilot agent mode): add to <code>.vscode/mcp.json</code> or your user MCP settings:</p><Snip value={cfgs.vscode} /></>)}
          {cfgs && client === 'windsurf' && (<><p className="sub">Windsurf → Settings → Cascade → MCP servers → View raw config:</p><Snip value={cfgs.windsurf} /></>)}
          {cfgs && client === 'chatgpt' && (<>
            <p className="sub">ChatGPT runs in the cloud, so it can only reach a <b>public HTTPS</b> address — it cannot see <code>127.0.0.1</code> on your PC. To connect it:</p>
            <ol className="sub" style={{ lineHeight: 1.6 }}>
              <li>Install Cloudflare's free tunnel tool (<code>cloudflared</code>) and run:</li>
            </ol>
            <Snip value={`cloudflared tunnel --url http://127.0.0.1:${st?.port || 8765}`} />
            <ol className="sub" start={2} style={{ lineHeight: 1.6 }}>
              <li>It prints an address like <code>https://xxxx.trycloudflare.com</code>.</li>
              <li>In ChatGPT: Settings → Apps & Connectors → Advanced → turn on <b>Developer mode</b> → Create connector (menu names can differ slightly by plan and version).</li>
              <li>Use this URL (replace the address with yours) and choose no authentication — the token is inside the URL:</li>
            </ol>
            <Snip value={cfgs.tunnelUrl.replace(`http://127.0.0.1:${st?.port || 8765}`, 'https://YOUR-TUNNEL.trycloudflare.com')} />
            <p className="sub" style={{ fontSize: 11, color: '#ffb86b' }}>⚠ While the tunnel runs, anyone with that full link can use your studio and your API credits. Stop the tunnel (Ctrl+C) when you're done, and create a new token if the link was shared.</p>
          </>)}
          {cfgs && client === 'any' && (<>
            <p className="sub">Any app that supports MCP over Streamable HTTP:</p>
            <Snip value={`URL:    ${st?.url}\nHeader: Authorization: Bearer ${st?.token}`} />
            <p className="sub" style={{ fontSize: 11 }}>For apps that only launch local commands (stdio), use the Claude Desktop JSON — it works in most of them.</p>
          </>)}

          <h3>Tools your assistant gets</h3>
          <div className="cn-tools">
            {[['pandora_status', 'what can run now (free or paid)'], ['generate_image', 'images & product shots'], ['generate_video', 'video shots'], ['generate_voiceover', 'voice-overs'], ['write_document', 'scripts, copy, plans'], ['make_presentation', 'slide decks (PDF)'], ['auto_edit', 'edit shots into a promo'], ['color_grade', 'colour grading'], ['finish_package', 'launch package folder'], ['run_agent', 'hand over a whole job'], ['edit_image', 'edit any image'], ['gallery', 'browse your work'], ['show_file', 'previews in chat'], ['open_in_pandora', 'open on your screen'], ['app_call', 'drive Blender / Resolve / Premiere']].map(([t, d]) => <span key={t} className="badge"><code>{t}</code> · {d}</span>)}
          </div>
        </div>
      </div>
      <Bridges />
    </div>
  );
}

// Creative app bridges — Claude Desktop becomes the hub that drives Pandora + Blender + Resolve + Premiere together.
function Bridges() {
  const [d, setD] = useState(null); const [msg, setMsg] = useState({}); const [open, setOpen] = useState('');
  const load = () => window.api.bridges.list().then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!d || !Array.isArray(d.list)) return null;
  const add = async (id) => { try { await window.api.bridges.addClaude(id); setMsg((m) => ({ ...m, [id]: '✓ Added — restart Claude Desktop.' })); load(); } catch (e) { setMsg((m) => ({ ...m, [id]: '⚠ ' + (e.message || e) })); } };
  const chip = (ok, yes, no) => <span className="badge" style={{ color: ok ? 'var(--green)' : 'var(--muted)' }}>{ok ? '● ' + yes : '○ ' + no}</span>;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Creative app bridges</h3>
      <p className="sub">Connect Claude to your other creative apps with open-source MCP servers. With God's Pandora + these bridges in Claude Desktop, one request can generate a shot in Pandora, build the scene in Blender and cut it in Resolve or Premiere. Blender also has Pandora's own <b>Phone Camera</b> link (Create → Phone Camera).</p>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>{chip(d.claude?.pandora, 'Pandora in Claude Desktop', 'Pandora not in Claude Desktop yet (add it above)')}{chip(d.uvx, 'uv installed', 'uv not found')}{chip(d.python, 'Python found', 'Python not found')}</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
        {d.list.map((b) => (
          <div key={b.id} className="card" style={{ padding: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><b>{b.name}</b>{chip(d.apps?.[b.id], 'installed', 'not detected')}</div>
            <div style={{ margin: '6px 0' }}>{chip(d.claude?.[b.id], 'in Claude Desktop', 'not connected')}</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {b.server && <button className="btn small" disabled={!d.uvx} title={d.uvx ? '' : 'Install uv first'} onClick={() => add(b.id)}>＋ Add to Claude Desktop</button>}
              {b.id === 'blender' && !d.uvx && <button className="btn ghost small" onClick={() => window.api.bridges.open('https://docs.astral.sh/uv/getting-started/installation/')}>Get uv</button>}
              <button className="btn ghost small" onClick={() => window.api.bridges.open(b.repo)}>Open project</button>
              <button className="btn ghost small" onClick={() => setOpen(open === b.id ? '' : b.id)}>{open === b.id ? 'Hide steps' : 'Setup steps'}</button>
            </div>
            {open === b.id && <ol className="sub" style={{ paddingLeft: 18, fontSize: 12, lineHeight: 1.6 }}>{b.steps.map((t) => <li key={t}>{t}</li>)}</ol>}
            {msg[b.id] && <div className={msg[b.id].startsWith('⚠') ? 'err' : 'ok'} style={{ fontSize: 11, marginTop: 6 }}>{msg[b.id]}</div>}
          </div>
        ))}
      </div>
      <button className="btn ghost small" style={{ marginTop: 10 }} onClick={load}>Re-check</button>
      <AgentApps />
    </div>
  );
}

// Pandora Agent ↔ apps: the agent starts these MCP servers itself and gets their tools (no Claude Desktop needed).
function AgentApps() {
  const [list, setList] = useState([]); const [msg, setMsg] = useState({}); const [busy, setBusy] = useState('');
  const load = () => window.api.agentApps.status().then((l) => setList(Array.isArray(l) ? l : [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const set = async (id, patch) => { await window.api.agentApps.update(id, patch); load(); };
  const test = async (id) => { setBusy(id); setMsg((m) => ({ ...m, [id]: 'Starting… (first run can take a minute)' }));
    try { const r = await window.api.agentApps.test(id); setMsg((m) => ({ ...m, [id]: `✓ Connected — ${r.tools.length} tools: ${r.tools.slice(0, 8).join(', ')}${r.tools.length > 8 ? '…' : ''}` })); }
    catch (e) { setMsg((m) => ({ ...m, [id]: '⚠ ' + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })); }
    setBusy(''); load(); };
  const imp = async () => { const r = await window.api.agentApps.import(); setMsg((m) => ({ ...m, _: r.imported.length ? '✓ Imported: ' + r.imported.join(', ') : 'Nothing to import — install the Resolve / Premiere MCP server first (it adds itself to Claude Desktop).' })); load(); };
  return (
    <div style={{ marginTop: 18 }}>
      <h3>Pandora Agent can use</h3>
      <p className="sub">Switch an app on and the Pandora Agent starts its MCP server itself and gets its tools — e.g. “block a desert scene in Blender with a camera dolly, render the viewport, then turn it into a cinematic shot and cut a 15 s teaser in Resolve”. Keep the app open (and its MCP panel connected) while the agent works.</p>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}><button className="btn small" onClick={imp}>Import from Claude Desktop</button>{msg._ && <span className="sub" style={{ fontSize: 12 }}>{msg._}</span>}</div>
      {list.map((b) => (
        <div key={b.id} className="row" style={{ gap: 8, padding: '8px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 6, minWidth: 170 }}><input type="checkbox" checked={!!b.enabled} disabled={!b.command} onChange={(e) => set(b.id, { enabled: e.target.checked })} /><b>{b.name}</b></label>
          <input style={{ flex: 1, minWidth: 220, fontFamily: 'var(--mono)', fontSize: 11 }} placeholder="command (e.g. uvx blender-mcp)" defaultValue={[b.command, ...(b.args || [])].filter(Boolean).join(' ')}
            onBlur={(e) => { const parts = (e.target.value.match(/"[^"]*"|\S+/g) || []).map((x) => x.replace(/^"|"$/g, '')); set(b.id, { command: parts[0] || '', args: parts.slice(1) }); }} />
          <span className="badge" style={{ color: b.running ? 'var(--green)' : 'var(--muted)' }}>{b.running ? `● running · ${b.tools} tools` : '○ idle'}</span>
          <button className="btn ghost small" disabled={!b.command || busy === b.id} onClick={() => test(b.id)}>{busy === b.id ? 'Testing…' : 'Test'}</button>
          {msg[b.id] && <div className={msg[b.id].startsWith('⚠') ? 'err' : 'ok'} style={{ width: '100%', fontSize: 11 }}>{msg[b.id]}</div>}
        </div>
      ))}
    </div>
  );
}

