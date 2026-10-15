import React, { useEffect, useRef, useState } from 'react';
import { useNav } from './nav.jsx';

// ── Cancellable jobs in the UI ──────────────────────────────────────────────
// useJob(): start(fn) runs fn(jobId) — pass jobId to window.api.generate / jutsu calls —
// cancel() aborts it. Tracks elapsed time for a live "Generating… 0:42" label.
const newId = () => 'job-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function friendlyError(e) {
  let m = String((e && e.message) || e || '');
  m = m.replace(/^Error invoking remote method '[^']+':\s*/i, '').replace(/^(Error|CancelledError):\s*/i, '');
  if (/^Cancelled\.?$/i.test(m.trim()) || /CancelledError|AbortError|aborted/i.test(m)) return null; // user cancelled
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(m) && !/127\.0\.0\.1|localhost/.test(m)) return 'Network problem — check your internet connection and try again.';
  if (/401|unauthori[sz]ed|invalid api key|invalid key/i.test(m)) return 'Your API key was rejected (401). Check it in Settings → API Keys.\n' + m.slice(0, 200);
  if (/402|insufficient|credit|balance|quota/i.test(m)) return 'The provider says you are out of credits or quota.\n' + m.slice(0, 200);
  if (/429|rate.?limit/i.test(m)) return 'Too many requests right now (rate limit). Wait a minute and try again.';
  return m;
}

export const needsKey = (msg) => /No API key saved|Add your .* key|key in Settings|Settings → API Keys/i.test(msg || '');

export function useJob() {
  const [jobId, setJobId] = useState(null);
  const [startedAt, setStartedAt] = useState(0);
  const [, tick] = useState(0);
  const cancelled = useRef(false);
  const runRef = useRef(null);  // the run started by start()
  const idRef = useRef(null);   // the job id currently in flight (changes per step)

  useEffect(() => {
    if (!jobId) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [jobId]);

  const start = async (fn) => {
    const id = newId();
    cancelled.current = false;
    runRef.current = id; idRef.current = id;
    setJobId(id); setStartedAt(Date.now());
    try { return await fn(id, () => cancelled.current); }
    finally { if (runRef.current === id) { runRef.current = null; idRef.current = null; setJobId(null); } }
  };
  const cancel = () => {
    cancelled.current = true;
    if (idRef.current) window.api.jobs?.cancel(idRef.current);
  };
  // multi-step flows (Ad Multiplier): each step gets a fresh id but shares the cancel flag
  const step = () => { const id = newId(); idRef.current = id; return id; };
  const elapsed = jobId ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  return { running: !!jobId, jobId, start, cancel, step, elapsed, isCancelled: () => cancelled.current };
}

export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Generate / Cancel pair with live timer
export function RunButton({ job, label, busyLabel = 'Generating…', onRun, disabled, small }) {
  if (job.running) {
    return (
      <span className="run-bar">
        <button className={'btn' + (small ? ' small' : '')} disabled><span className="spinner" /> {busyLabel} {fmtTime(job.elapsed)}</button>
        <button className={'btn danger' + (small ? ' small' : '')} onClick={job.cancel} title="Stop this generation (Esc)">✕ Cancel</button>
      </span>
    );
  }
  return <button className={'btn' + (small ? ' small' : '')} disabled={disabled} onClick={onRun} title="Ctrl+Enter">{label}</button>;
}

// Error box with a shortcut to Settings when a key is missing
export function ErrorBox({ error }) {
  const { go } = useNav();
  if (!error) return null;
  return (
    <div className="err">
      {error}
      {needsKey(error) && <div><button className="btn small" style={{ marginTop: 6 }} onClick={() => go('settings')}>🔑 Open API Keys</button></div>}
    </div>
  );
}

// Ctrl/Cmd+Enter to run, Esc to cancel — attach to a container's onKeyDown
export const runKeys = (job, run, canRun) => (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !job.running && canRun) { e.preventDefault(); run(); }
  if (e.key === 'Escape' && job.running) { e.preventDefault(); job.cancel(); }
};

// Sidebar indicator: everything running right now, with Cancel all
export function JobsIndicator() {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!window.api?.jobs) return undefined;
    let ok = true;
    const load = () => window.api.jobs.list().then((l) => ok && setList(l || [])).catch(() => {});
    load(); const t = setInterval(load, 1500);
    return () => { ok = false; clearInterval(t); };
  }, []);
  if (!list.length) return null;
  return (
    <div className="jobs-pill">
      <div><span className="spinner" /> {list.length} running</div>
      {list.slice(0, 3).map((j) => (
        <div key={j.id} className="sub" style={{ fontSize: 10.5 }}>
          {j.label} · {fmtTime(Math.floor((Date.now() - j.startedAt) / 1000))}
          <button className="x" title="Cancel" onClick={() => window.api.jobs.cancel(j.id)}>✕</button>
        </div>
      ))}
      {list.length > 1 && <button className="btn danger small" style={{ marginTop: 4 }} onClick={() => window.api.jobs.cancelAll()}>Cancel all</button>}
    </div>
  );
}
