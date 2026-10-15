import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { DownloadButton, fmtBytes } from '../lib/downloads.jsx';

const TYPES = [['all', 'All'], ['image', 'Image'], ['video', 'Video'], ['llm', 'LLM / multimodal'], ['audio', 'Audio'], ['3d', '3D']];

export default function Updates() {
  return (
    <div>
      <h1>⬆ Pandora Update Center</h1>
      <p className="sub">Keep God's Pandora and your open-source models current. Everything here is live: app updates come from GitHub Releases, model releases from the Hugging Face Hub.</p>
      <AppUpdate />
      <InstalledModels />
      <ModelFeed />
    </div>
  );
}

/* ───────────────────────── App self-update ───────────────────────── */
function AppUpdate() {
  const [st, setSt] = useState(null);
  const [cfg, setCfg] = useState({ owner: '', repo: '', channel: 'stable', autoCheck: true });
  const [saved, setSaved] = useState('');

  useEffect(() => {
    window.api.updates.status().then((s) => { setSt(s || {}); if (s && s.config) setCfg((c) => ({ ...c, ...s.config })); }).catch(() => setSt({}));
    return window.api.updates.onEvent((s) => setSt((prev) => ({ ...prev, ...s })));
  }, []);

  const saveCfg = async () => {
    const c = await window.api.updates.setConfig({ owner: cfg.owner.trim(), repo: cfg.repo.trim(), channel: cfg.channel, autoCheck: cfg.autoCheck });
    if (c) setCfg((p) => ({ ...p, ...c })); setSaved('✓ Saved'); setTimeout(() => setSaved(''), 2000);
  };

  if (!st) return <div className="card">Loading…</div>;
  const s = st.status;
  const pct = st.progress ? Math.round(st.progress.percent) : 0;
  const placeholder = !cfg.owner || cfg.owner === 'YOUR_GITHUB_USERNAME';

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>God's Pandora application</h3>
          <span className="sub">Installed version <b style={{ color: 'var(--accent)' }}>v{st.version}</b>{!st.packaged && ' · development mode'}</span>
        </div>
        <div className="row">
          {(s === 'idle' || s === 'latest' || s === 'error') && (
            <button className="btn small" onClick={() => window.api.updates.check()}>Check for updates</button>
          )}
          {s === 'checking' && <button className="btn small" disabled>Checking…</button>}
          {s === 'available' && (
            <button className="btn small" onClick={() => window.api.updates.download()}>⬇ Download v{st.info?.version}</button>
          )}
          {s === 'downloaded' && (
            <button className="btn small" onClick={() => window.api.updates.install()}>↻ Restart & install v{st.info?.version}</button>
          )}
        </div>
      </div>

      {s === 'latest' && <div className="ok">✓ You're on the latest version.</div>}
      {s === 'available' && <div className="ok">New version v{st.info?.version} is available{st.info?.releaseDate ? ' (' + st.info.releaseDate.slice(0, 10) + ')' : ''}.</div>}
      {s === 'downloading' && (
        <div className="dl-progress" style={{ marginTop: 10 }}>
          <div className="bar"><div style={{ width: pct + '%' }} /></div>
          <span className="sub" style={{ fontSize: 11 }}>{pct}% · {fmtBytes(st.progress?.transferred)} / {fmtBytes(st.progress?.total)}</span>
        </div>
      )}
      {s === 'downloaded' && <div className="ok">Update downloaded — it installs when you restart (or automatically next time you quit).</div>}
      {s === 'error' && <div className="err">{st.error}</div>}
      {st.info?.notes && (s === 'available' || s === 'downloaded') && (
        <div className="log" style={{ marginTop: 10, maxHeight: 160 }}>{st.info.notes}</div>
      )}

      <details style={{ marginTop: 12 }} open={placeholder}>
        <summary className="sub" style={{ cursor: 'pointer' }}>Update source settings</summary>
        <p className="sub" style={{ fontSize: 11.5 }}>
          Updates are read from the GitHub repository where you publish God's Pandora releases
          (github.com/<b>owner</b>/<b>repo</b>/releases). Each release must contain <code>latest.yml</code> and the Setup <code>.exe</code> — the included GitHub Action uploads both when you push a <code>v*</code> tag.
        </p>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>GitHub owner (username)</label>
            <input value={cfg.owner === 'YOUR_GITHUB_USERNAME' ? '' : cfg.owner} placeholder="your-github-username" onChange={(e) => setCfg({ ...cfg, owner: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label>Repository</label>
            <input value={cfg.repo} onChange={(e) => setCfg({ ...cfg, repo: e.target.value })} />
          </div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className={'chip' + (cfg.channel === 'stable' ? ' on' : '')} onClick={() => setCfg({ ...cfg, channel: 'stable' })}>Stable releases</button>
          <button className={'chip' + (cfg.channel === 'beta' ? ' on' : '')} onClick={() => setCfg({ ...cfg, channel: 'beta' })}>Include pre-releases (beta)</button>
          <button className={'chip' + (cfg.autoCheck ? ' on' : '')} onClick={() => setCfg({ ...cfg, autoCheck: !cfg.autoCheck })}>
            {cfg.autoCheck ? '✓ ' : ''}Check automatically at startup
          </button>
          <button className="btn small" onClick={saveCfg}>Save</button>
          {saved && <span className="ok" style={{ margin: 0 }}>{saved}</span>}
        </div>
      </details>
    </div>
  );
}

/* ─────────────────────── Installed model updates ─────────────────────── */
function InstalledModels() {
  const [installed, setInstalled] = useState([]);
  const [checks, setChecks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState(null);
  const [engMsg, setEngMsg] = useState('');
  const [hfKey, setHfKey] = useState(false);

  const refresh = () => {
    window.api.engine.listModels().then(setInstalled);
    window.api.engine.status().then(setEngine);
    window.api.keysList().then((k) => setHfKey(!!k.huggingface));
  };
  useEffect(() => { refresh(); }, []);

  const check = async () => {
    setBusy(true);
    try { setChecks(await window.api.models.checkInstalled()); } catch (e) { setChecks([{ repo: '—', error: String(e.message || e) }]); }
    setBusy(false);
  };

  const installEngine = async () => {
    setEngMsg('Installing the local engine (Python packages, several GB on first install)…');
    const r = await window.api.engine.install();
    setEngMsg(r.ok ? '✓ Engine installed' : '⚠ ' + r.error); refresh();
  };

  const updates = (checks || []).filter((c) => c.updateAvailable);

  return (
    <div className="card" style={{ marginBottom: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Your downloaded models ({installed.length})</h3>
        <div className="row">
          <button className="btn ghost small" onClick={() => window.api.models.openFolder()}>Open models folder</button>
          <button className="btn small" disabled={busy || installed.length === 0} onClick={check}>{busy ? 'Checking…' : 'Check for model updates'}</button>
        </div>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <span className="badge">python: {engine?.python ? 'found' : 'missing'}</span>
        <span className="badge">engine: {engine?.installed ? 'installed' : 'not installed this session'}</span>
        <span className="badge" style={{ color: hfKey ? 'var(--accent)' : 'var(--muted)' }}>HF token: {hfKey ? 'saved' : 'none (needed for gated models)'}</span>
        <button className="btn ghost small" onClick={installEngine}>Install / repair engine</button>
      </div>
      {engMsg && <div className={engMsg.startsWith('⚠') ? 'err' : 'ok'}>{engMsg}</div>}

      {installed.length === 0 && <p className="sub" style={{ marginBottom: 0 }}>No models in storage yet — install one from the feed below or the Models page.</p>}
      {installed.length > 0 && (
        <table style={{ marginTop: 10 }}>
          <tbody>
            <tr><th>Model</th><th>Local revision</th><th>Status</th><th></th></tr>
            {installed.map((repo) => {
              const c = (checks || []).find((x) => x.repo === repo);
              return (
                <tr key={repo}>
                  <td><a href={'https://huggingface.co/' + repo} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>{repo}</a></td>
                  <td className="sub">{c?.local ? c.local.slice(0, 8) : '—'}</td>
                  <td>
                    {!c && <span className="sub">not checked</span>}
                    {c?.error && <span className="err" style={{ margin: 0 }}>{c.error}</span>}
                    {c && !c.error && (c.updateAvailable
                      ? <span className="ok" style={{ margin: 0 }}>Update available ({c.remote?.slice(0, 8)}, {String(c.lastModified || '').slice(0, 10)})</span>
                      : <span className="sub">✓ up to date</span>)}
                  </td>
                  <td>
                    {c?.updateAvailable
                      ? <DownloadButton repo={repo} label="⬆ Update" onDone={() => { refresh(); check(); }} />
                      : <button className="btn ghost small" onClick={async () => {
                          if (!window.confirm('Delete ' + repo + ' from app storage?')) return;
                          const r = await window.api.engine.deleteModel(repo);
                          if (!r.ok) alert(r.error); refresh();
                        }}>Delete</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {checks && updates.length === 0 && !checks.some((c) => c.error) && <div className="ok">✓ All downloaded models match their latest Hugging Face revision.</div>}
    </div>
  );
}

/* ─────────────────────── Live release feed ─────────────────────── */
function ModelFeed() {
  const { db, update } = useStore();
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState('all');
  const [engineOnly, setEngineOnly] = useState(false);
  const [installed, setInstalled] = useState([]);
  const lastSeen = db.settings?.modelFeedSeenAt || null;

  const load = async () => {
    setBusy(true); setError('');
    try {
      const f = await window.api.models.feed();
      setFeed(f);
      if (f.failedLabs) setError(`${f.failedLabs} lab(s) could not be reached — showing the rest.`);
    } catch (e) { setError('Could not reach Hugging Face: ' + String(e.message || e)); }
    setBusy(false);
    window.api.engine.listModels().then(setInstalled);
  };
  useEffect(() => { load(); }, []);

  const markSeen = () => update((d) => { d.settings.modelFeedSeenAt = new Date().toISOString(); return d; });

  const items = useMemo(() => (feed?.items || [])
    .filter((m) => type === 'all' || m.type === type)
    .filter((m) => !engineOnly || m.engine), [feed, type, engineOnly]);
  const newCount = (feed?.items || []).filter((m) => lastSeen && m.createdAt > lastSeen).length;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>🔬 Newest open-source releases {newCount > 0 && <span className="badge" style={{ marginLeft: 6 }}>{newCount} new since last visit</span>}</h3>
        <div className="row">
          {feed && <span className="sub" style={{ fontSize: 11 }}>fetched {new Date(feed.fetchedAt).toLocaleString()}</span>}
          <button className="btn ghost small" onClick={markSeen}>Mark all seen</button>
          <button className="btn small" disabled={busy} onClick={load}>{busy ? 'Loading…' : '↻ Refresh'}</button>
        </div>
      </div>
      <p className="sub" style={{ fontSize: 11.5 }}>
        Pulled live from the Hugging Face Hub for {''}
        Black Forest Labs, Stability, Qwen, Wan, Lightricks, Tencent, Meta, DeepSeek, Google, Zhipu, Moonshot, Mistral and more.
        Quantized and adapter variants are hidden. “Runs in God's Pandora” = diffusers image model the built-in engine can load; the rest download for use in ComfyUI / Ollama / LM Studio.
      </p>
      <div className="row" style={{ marginBottom: 10 }}>
        {TYPES.map(([id, label]) => (
          <button key={id} className={'chip' + (type === id ? ' on' : '')} onClick={() => setType(id)}>{label}</button>
        ))}
        <button className={'chip' + (engineOnly ? ' on' : '')} onClick={() => setEngineOnly((v) => !v)}>Runs in God's Pandora only</button>
      </div>
      {error && <div className="err">{error}</div>}
      {!feed && busy && <div className="sub">Loading latest releases…</div>}
      {feed && (
        <div style={{ maxHeight: 560, overflowY: 'auto' }}>
          <table>
            <tbody>
              <tr><th>Model</th><th>Type</th><th>Released</th><th>License</th><th>Downloads</th><th></th></tr>
              {items.map((m) => (
                <tr key={m.id}>
                  <td>
                    <a href={m.link} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>{m.id}</a>
                    {lastSeen && m.createdAt > lastSeen && <span className="badge" style={{ marginLeft: 6 }}>new</span>}
                    {m.engine && <span className="badge" style={{ marginLeft: 6, color: '#00ff88' }}>runs in God's Pandora</span>}
                  </td>
                  <td><span className="badge">{m.type}</span></td>
                  <td className="sub">{String(m.createdAt).slice(0, 10)}</td>
                  <td className="sub">{m.license}</td>
                  <td className="sub">{m.downloads.toLocaleString()}</td>
                  <td><DownloadButton repo={m.id} installed={installed.includes(m.id)} onDone={() => window.api.engine.listModels().then(setInstalled)} /></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="sub">Nothing matches this filter.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
