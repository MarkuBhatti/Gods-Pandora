import React from 'react';

// Shared, app-wide model download tracker (real progress from the main process).
const listeners = new Set();
let state = {}; // repo -> { bytes, total, done, error, active }
let wired = false;

function emit() { listeners.forEach((l) => l(state)); }
function patch(repo, p) { state = { ...state, [repo]: { ...(state[repo] || {}), ...p } }; emit(); }

function wire() {
  if (wired || !window.api?.engine?.onProgress) return;
  wired = true;
  window.api.engine.onProgress((p) => {
    patch(p.repo, { bytes: p.bytes, total: p.total || state[p.repo]?.total || 0, done: !!p.done, error: p.error || null, active: !p.done });
  });
  window.api.engine.activeDownloads?.().then((list) => (list || []).forEach((r) => patch(r, { active: true })));
}

export function fmtBytes(n) {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return (n / 1024 ** i).toFixed(i >= 3 ? 1 : 0) + ' ' + u[i];
}

export function useDownloads() {
  const [s, setS] = React.useState(state);
  React.useEffect(() => { wire(); listeners.add(setS); return () => listeners.delete(setS); }, []);
  return s;
}

// Checks size + gating on Hugging Face, asks for confirmation, then downloads with progress.
export async function startDownload(repo) {
  wire();
  if (state[repo]?.active) return { ok: false, error: 'Already downloading.' };
  let info = null;
  try { info = await window.api.models.info(repo); } catch (e) {
    const msg = String(e.message || e);
    if (/404/.test(msg)) return { ok: false, error: 'Model not found on Hugging Face: ' + repo };
    // offline or API hiccup: still allow the download attempt
  }
  if (info) {
    const size = info.sizeBytes ? fmtBytes(info.sizeBytes) : 'unknown size';
    const saved = info.repoBytes && info.repoBytes > info.sizeBytes * 1.2 ? ` (the full repository is ${fmtBytes(info.repoBytes)} — only the files the engine needs are downloaded)` : '';
    const gated = info.gated ? '\n\n⚠ This model is GATED: accept its license on huggingface.co and add your Hugging Face token in Settings → API Keys ("huggingface") first.' : '';
    const engineNote = info.engine ? '' : '\n\nNote: this model downloads into app storage but runs in external tools (ComfyUI, Ollama, LM Studio…), not in God\'s Pandora\'s built-in image engine.';
    const big = info.sizeBytes > 200 * 1024 ** 3 ? '\n\n⚠ This is a very large model meant for multi-GPU servers.' : '';
    if (!window.confirm(`Download ${repo}?\n\nDownload size: ${size}${saved}${gated}${engineNote}${big}`)) return { ok: false, cancelled: true };
  }
  patch(repo, { active: true, done: false, error: null, bytes: 0, total: info?.sizeBytes || 0 });
  const r = await window.api.engine.downloadModel(repo, info?.sizeBytes || 0);
  patch(repo, { active: false, done: true, error: r.ok ? null : r.error });
  return r;
}

export function cancelDownload(repo) { return window.api.engine.cancelDownload(repo); }

export function DownloadButton({ repo, installed, small = true, label = '⬇ Install', onDone }) {
  const all = useDownloads();
  const d = all[repo];
  const [msg, setMsg] = React.useState('');
  if (d?.active) {
    const pct = d.total ? Math.min(100, Math.floor((d.bytes / d.total) * 100)) : null;
    return (
      <div className="dl-progress">
        <div className="bar"><div style={{ width: (pct ?? 5) + '%' }} /></div>
        <span className="sub" style={{ fontSize: 11 }}>{pct != null ? pct + '% · ' : ''}{fmtBytes(d.bytes)}{d.total ? ' / ' + fmtBytes(d.total) : ''}</span>
        <button className="btn ghost small" onClick={() => cancelDownload(repo)}>✕</button>
      </div>
    );
  }
  return (
    <span className="row" style={{ gap: 6 }}>
      <button className={'btn' + (small ? ' small' : '') + (installed ? ' ghost' : '')}
        onClick={async () => {
          setMsg('');
          const r = await startDownload(repo);
          if (r.ok) { setMsg('✓ Installed'); onDone && onDone(); }
          else if (!r.cancelled) setMsg('⚠ ' + r.error);
        }}>
        {installed ? '✓ Installed · re-sync' : label}
      </button>
      {msg && <span className={msg.startsWith('⚠') ? 'err' : 'ok'} style={{ fontSize: 11, margin: 0 }}>{msg}</span>}
    </span>
  );
}
