import React, { useEffect, useState } from 'react';
import catalog from '../../data/modelCatalog.json';
import directory from '../../data/modelDirectory.json';
import { DownloadButton, useDownloads, fmtBytes } from '../lib/downloads.jsx';
import { useStore, uid } from '../lib/store.jsx';

export default function Models() {
  const cloud = catalog.models.filter((m) => m.provider !== 'local');
  const local = catalog.models.filter((m) => m.provider === 'local');
  return (
    <div>
      <h1>Pandora Core &amp; Cloud</h1>
      <p className="sub">Every cloud model API in one roster, plus the local open-source engine on your own GPU.</p>

      <CustomModels />

      <LocalEngine localModels={local} />

      <Directory />

      <h3>Cloud roster ({cloud.length})</h3>
      <div className="grid">
        {cloud.map((m) => (
          <div key={m.id} className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="badge">{m.kind}</span>
              <span className="badge">{m.provider}</span>
            </div>
            <strong style={{ display: 'block', margin: '8px 0 2px' }}>{m.name}</strong>
            <p className="sub" style={{ margin: 0, fontSize: 11 }}>{m.endpoint}</p>
            {m.refInput && <span className="badge" style={{ color: 'var(--accent)', marginTop: 6, display: 'inline-block' }}>supports refs → Character + Location Lock</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function LocalEngine({ localModels }) {
  const [status, setStatus] = useState(null);
  const [installed, setInstalled] = useState([]);
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  const refresh = async () => {
    setStatus(await window.api.engine.status());
    setInstalled(await (window.api.engine.listModelsDetailed ? window.api.engine.listModelsDetailed() : window.api.engine.listModels().then((l) => l.map((r) => ({ repo: r, complete: true })))));
  };
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, []);

  const act = async (label, fn) => {
    setBusy(label); setMsg('');
    const r = await fn();
    setMsg(r?.error ? '⚠ ' + r.error : '✓ ' + label + ' done');
    setBusy(''); refresh();
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>⬇ Local open-source engine</h3>
      <p className="sub">Downloads models into app storage and runs them offline on your GPU (CUDA) / Apple Silicon (MPS). Requires Python 3.10+ once for setup.</p>
      <div className="row">
        <span className="badge">python: {status?.python ? 'found' : 'missing'}</span>
        <span className="badge">engine: {status?.running ? 'running :' + status.port : 'stopped'}</span>
        <button className="btn ghost small" disabled={!!busy} onClick={() => act('install', window.api.engine.install)}>{busy === 'install' ? 'Installing…' : 'Install engine'}</button>
        <button className="btn ghost small" disabled={!!busy} onClick={() => act('start', window.api.engine.start)}>Start</button>
        <button className="btn ghost small" disabled={!!busy} onClick={() => act('stop', window.api.engine.stop)}>Stop</button>
      </div>

      <label>Download an open-source model (Hugging Face repo id)</label>
      <div className="row">
        <input style={{ flex: 1 }} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="e.g. stabilityai/stable-diffusion-xl-base-1.0" />
        {/^[\w.-]+\/[\w.-]+$/.test(repo.trim())
          ? <DownloadButton repo={repo.trim()} label="⬇ Download" small onDone={refresh} />
          : <button className="btn small" disabled>⬇ Download</button>}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        {localModels.map((m) => (
          <button key={m.id} className="chip" onClick={() => setRepo(m.endpoint)}>{m.name}</button>
        ))}
      </div>

      {installed.length > 0 && (<><label>In storage</label><div className="row" style={{ flexWrap: 'wrap' }}>{installed.map((m) => (
        <span key={m.repo} className="badge" title={m.downloading ? 'Downloading' : m.complete === false ? 'Download incomplete — press Download to resume' : 'Ready'}>
          {m.downloading ? '⏳ ' : m.complete === false ? '⚠ ' : '✅ '}{m.repo}
        </span>))}</div></>)}
      {msg && <div className={msg.startsWith('⚠') ? 'err' : 'ok'}>{msg}</div>}
      {status?.log?.length > 0 && <div className="log" style={{ marginTop: 10 }}>{status.log.slice(-30).join('')}</div>}
    </div>
  );
}

function Directory() {
  const [type, setType] = React.useState('all');
  const [installed, setInstalled] = React.useState([]);
  // only fully downloaded models count as installed (partial downloads show the Install button to resume)
  const reload = () => (window.api.engine.listModelsDetailed
    ? window.api.engine.listModelsDetailed().then((l) => setInstalled((l || []).filter((m) => m.complete !== false).map((m) => m.repo)))
    : window.api.engine.listModels().then(setInstalled)).catch(() => {});
  React.useEffect(() => { reload(); }, []);
  const types = ['all', ...new Set(directory.openSource.map((m) => m.type))];
  const list = directory.openSource.filter((m) => type === 'all' || m.type === type);
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ marginTop: 0 }}>📚 Model Directory — curated open-source models ({directory.openSource.length})</h3>
      <p className="sub">
        Repo IDs verified against the Hugging Face API ({directory.verified || 'recently'}). Install shows the real download size first and tracks progress.
        For brand-new releases see the <b>⬆ Update</b> page (live feed).
      </p>
      <div className="row" style={{ marginBottom: 10 }}>
        {types.map((t) => <button key={t} className={'chip' + (type === t ? ' on' : '')} onClick={() => setType(t)}>{t}</button>)}
      </div>
      <div className="grid">
        {list.map((m) => (
          <div key={m.repo} className="card" style={{ padding: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13 }}>{m.name}</strong><span className="badge">{m.type}</span>
            </div>
            <div className="row" style={{ gap: 4, margin: '4px 0' }}>
              {m.added && m.added >= '2026-01' && <span className="badge">new {m.added}</span>}
              {m.engine && <span className="badge" style={{ color: '#00ff88' }}>runs in God's Pandora</span>}
              {m.gated && <span className="badge" style={{ color: '#f0a000' }}>gated · HF token</span>}
            </div>
            <p className="sub" style={{ margin: '4px 0', fontSize: 11.5 }}>{m.note} · VRAM {m.vram}{m.license ? ' · ' + m.license : ''}</p>
            <div className="row">
              <DownloadButton repo={m.repo} installed={installed.includes(m.repo)} onDone={reload} />
              <a href={m.link} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--gold)' }}>HF ↗</a>
            </div>
          </div>
        ))}
      </div>
      <h3>🔑 Top API models ({directory.api.length}) — add the matching key in Settings</h3>
      <div className="grid">
        {directory.api.map((m) => (
          <div key={m.name} className="card" style={{ padding: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 13 }}>{m.name}</strong><span className="badge">{m.type}</span>
            </div>
            <p className="sub" style={{ margin: '4px 0', fontSize: 11.5 }}>{m.provider}</p>
            <a href={m.link} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--gold)' }}>docs ↗</a>
          </div>
        ))}
      </div>
    </div>
  );
}


const PROVIDER_HELP = {
  fal: { ex: 'fal-ai/flux-pro/v1.1-ultra', note: 'Any endpoint id from fal.ai/models. Uses your FAL key.' },
  replicate: { ex: 'black-forest-labs/flux-1.1-pro', note: 'Any "owner/model" from replicate.com. Uses your Replicate key.' },
  higgsfield: { ex: 'higgsfield-ai/soul/standard', note: 'Any model path from console.higgsfield.ai (docs.higgsfield.ai). Key = KEY_ID:KEY_SECRET.' },
  huggingface: { ex: 'black-forest-labs/FLUX.1-dev', note: 'Any Hub repo served by Inference Providers (look for "Inference Providers" on the model page). Uses your HF token.' },
  local: { ex: 'stabilityai/stable-diffusion-xl-base-1.0', note: 'Any diffusers image or video repo — runs on your GPU in the built-in engine (downloads on first use).' },
};

function CustomModels() {
  const { db, update } = useStore();
  const blank = { name: '', provider: 'fal', kind: 'image', endpoint: '', refInput: '', maxRefs: 1, requiresImage: false };
  const [f, setF] = useState(blank);
  const [open, setOpen] = useState(false);
  const help = PROVIDER_HELP[f.provider];
  const add = () => {
    if (!f.endpoint.trim()) return;
    const refInput = f.provider === 'local' ? 'reference_images' : (f.refInput.trim() || null);
    update((d) => {
      d.customModels = d.customModels || [];
      d.customModels.push({ id: 'custom-' + uid(), name: f.name.trim() || f.endpoint.trim(), provider: f.provider, kind: f.kind, endpoint: f.endpoint.trim(), refInput, maxRefs: +f.maxRefs || 1, requiresImage: !!f.requiresImage, params: f.provider === 'fal' || f.provider === 'replicate' ? { seed: true } : undefined });
      return d;
    });
    setF(blank);
  };
  const list = db.customModels || [];
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>＋ Add any model ({list.length} custom)</h3>
        <button className="btn ghost small" onClick={() => setOpen((v) => !v)}>{open ? 'Close' : 'Add model'}</button>
      </div>
      <p className="sub" style={{ fontSize: 12 }}>
        Run <b>any</b> model inside God's Pandora: a FAL, Replicate or Higgsfield endpoint, any Hugging Face–hosted open model, or any diffusers repo on your own GPU.
        Custom models appear in Create, every Studio and Film, and work with characters, locations, products and @mentions.
      </p>
      {open && (
        <>
          <div className="custom-model-form">
            <div><label>Provider</label>
              <select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>
                <option value="fal">FAL.ai</option><option value="replicate">Replicate</option><option value="higgsfield">Higgsfield</option>
                <option value="huggingface">Hugging Face (hosted)</option><option value="local">Local engine (your GPU)</option>
              </select></div>
            <div><label>Type</label>
              <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                <option value="image">image</option><option value="video">video</option>{f.provider !== 'local' && f.provider !== 'huggingface' && <option value="audio">audio</option>}
              </select></div>
            <div style={{ gridColumn: 'span 2' }}><label>Endpoint / repo id</label>
              <input value={f.endpoint} placeholder={help.ex} onChange={(e) => setF({ ...f, endpoint: e.target.value })} /></div>
            <div><label>Display name</label><input value={f.name} placeholder="optional" onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            {f.provider !== 'local' && f.provider !== 'huggingface' && (
              <div><label>Reference-image field</label>
                <input list="ref-fields" value={f.refInput} placeholder="none (text-only)" onChange={(e) => setF({ ...f, refInput: e.target.value })} />
                <datalist id="ref-fields"><option value="image_url" /><option value="image_urls" /><option value="image" /><option value="input_image" /><option value="reference_images" /></datalist>
              </div>
            )}
            <div><label>Max refs</label><input type="number" min="1" max="14" value={f.maxRefs} onChange={(e) => setF({ ...f, maxRefs: e.target.value })} /></div>
            <div><label>&nbsp;</label>
              <label className="row" style={{ gap: 6, margin: 0 }}><input type="checkbox" style={{ width: 'auto' }} checked={f.requiresImage} onChange={(e) => setF({ ...f, requiresImage: e.target.checked })} /> needs an input image</label>
            </div>
          </div>
          <p className="sub" style={{ fontSize: 11 }}>{help.note}</p>
          <button className="btn small" disabled={!f.endpoint.trim()} onClick={add}>Add model</button>
        </>
      )}
      {list.length > 0 && (
        <table style={{ marginTop: 10 }}><tbody>
          <tr><th>Name</th><th>Provider</th><th>Type</th><th>Endpoint</th><th>Refs</th><th></th></tr>
          {list.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td><td className="sub">{m.provider}</td><td><span className="badge">{m.kind}</span></td>
              <td className="sub">{m.endpoint}</td><td className="sub">{m.refInput ? m.refInput + ' ×' + (m.maxRefs || 1) : '—'}</td>
              <td><button className="btn danger small" onClick={() => update((d) => { d.customModels = d.customModels.filter((x) => x.id !== m.id); return d; })}>✕</button></td>
            </tr>
          ))}
        </tbody></table>
      )}
    </div>
  );
}
