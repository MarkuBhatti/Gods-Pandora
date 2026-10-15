// Cancellable jobs. Every generation runs inside a job context (AsyncLocalStorage), so every
// fetch() / poll() / local-engine request made by any provider automatically gets the job's
// AbortSignal — Cancel stops waiting immediately, tells the remote service to drop the job where
// it can, and interrupts local GPU work between denoising steps.
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();
const jobs = new Map(); // jobId -> { ctrl, label, startedAt, onCancel: Set<fn> }

class CancelledError extends Error {
  constructor() { super('Cancelled.'); this.name = 'CancelledError'; this.cancelled = true; }
}

// Patch global fetch once: inject the current job's signal when the caller didn't pass one.
if (!global.__godseyeFetchPatched && typeof global.fetch === 'function') {
  const orig = global.fetch;
  global.fetch = (url, opts = {}) => {
    const job = als.getStore();
    if (job && !opts.signal) opts = { ...opts, signal: job.ctrl.signal };
    return orig(url, opts).catch((e) => { if (job && job.ctrl.signal.aborted) throw new CancelledError(); throw e; });
  };
  global.__godseyeFetchPatched = true;
}

function current() { return als.getStore() || null; }
function signal() { const j = current(); return j ? j.ctrl.signal : null; }
function throwIfCancelled() { const s = signal(); if (s && s.aborted) throw new CancelledError(); }

// Register cleanup for the current job (e.g. cancel a remote request, kill a process)
function onCancel(fn) {
  const j = current();
  if (!j) return () => {};
  if (j.ctrl.signal.aborted) { try { fn(); } catch (_) {} return () => {}; }
  j.onCancel.add(fn);
  return () => j.onCancel.delete(fn);
}

async function run(jobId, label, fn) {
  if (!jobId) return fn();
  const job = { id: jobId, ctrl: new AbortController(), label: label || 'job', startedAt: Date.now(), onCancel: new Set() };
  jobs.set(jobId, job);
  try {
    return await als.run(job, fn);
  } catch (e) {
    if (job.ctrl.signal.aborted) throw new CancelledError();
    throw e;
  } finally {
    jobs.delete(jobId);
  }
}

function cancel(jobId) {
  const job = jobs.get(jobId);
  if (!job) return { ok: false };
  job.ctrl.abort();
  for (const fn of job.onCancel) { try { fn(); } catch (_) {} }
  return { ok: true };
}

function cancelAll() { [...jobs.keys()].forEach(cancel); return { ok: true }; }

function list() { return [...jobs.values()].map((j) => ({ id: j.id, label: j.label, startedAt: j.startedAt })); }

module.exports = { run, cancel, cancelAll, list, current, signal, throwIfCancelled, onCancel, CancelledError };
