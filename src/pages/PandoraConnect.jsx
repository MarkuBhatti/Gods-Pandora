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

  const tok = st ? (show ? st.token : st.token.slice(0, 4) + '••••••••••••' + st.token.slice(-4)) : '';
  const CLIENTS = [['claude', 'Claude Desktop'], ['claudecode', 'Claude Code'], ['chatgpt', 'ChatGPT'], ['cursor', 'Cursor'], ['vscode', 'VS Code / Copilot'], ['windsurf', 'Windsurf'], ['any', 'Any MCP app']];

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
          <label>Limits per chat session (protects your API credits)</label>
          <div className="cinerow">
            <div><label>Images: {st?.images}</label><input type="range" min="1" max="100" value={st?.images || 40} onChange={(e) => setSt((s) => ({ ...s, images: +e.target.value }))} onMouseUp={(e) => conf({ images: +e.target.value })} /></div>
            <div><label>Video shots: {st?.videos}</label><input type="range" min="0" max="40" value={st?.videos || 12} onChange={(e) => setSt((s) => ({ ...s, videos: +e.target.value }))} onMouseUp={(e) => conf({ videos: +e.target.value })} /></div>
            <div><label>Voice-overs: {st?.audio}</label><input type="range" min="0" max="20" value={st?.audio || 6} onChange={(e) => setSt((s) => ({ ...s, audio: +e.target.value }))} onMouseUp={(e) => conf({ audio: +e.target.value })} /></div>
          </div>
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
            {[['pandora_status', 'what can run now (free or paid)'], ['generate_image', 'images & product shots'], ['generate_video', 'video shots'], ['generate_voiceover', 'voice-overs'], ['write_document', 'scripts, copy, plans'], ['make_presentation', 'slide decks (PDF)'], ['auto_edit', 'edit shots into a promo'], ['color_grade', 'colour grading'], ['finish_package', 'launch package folder'], ['run_agent', 'hand over a whole job']].map(([t, d]) => <span key={t} className="badge"><code>{t}</code> · {d}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}
