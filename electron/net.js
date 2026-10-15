// Small HTTP helpers. Long generations (video, first-time model loads) can exceed fetch's
// default 5-minute header timeout, so the local engine uses node:http with a long timeout,
// and cloud providers use submit-then-poll queues.
const http = require('http');
const jobs = require('./jobs');
const https = require('https');

function requestRaw(url, { method = 'GET', headers = {}, body = null, timeoutMs = 30 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const data = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    const req = lib.request(u, { method, headers: { ...(data ? { 'Content-Length': data.length } : {}), ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.concat(chunks) }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Request timed out after ' + Math.round(timeoutMs / 60000) + ' min')));
    const sig = jobs.signal();
    if (sig) {
      if (sig.aborted) { req.destroy(new jobs.CancelledError()); }
      else sig.addEventListener('abort', () => req.destroy(new jobs.CancelledError()), { once: true });
    }
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function requestJSON(url, opts = {}) {
  const r = await requestRaw(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  let json = null;
  try { json = JSON.parse(r.buffer.toString('utf8') || 'null'); } catch (_) { json = { raw: r.buffer.toString('utf8').slice(0, 500) }; }
  return { status: r.status, json };
}

// abortable sleep: resolves early (and throws) when the current job is cancelled
const sleep = (ms) => new Promise((resolve, reject) => {
  const sig = jobs.signal();
  const t = setTimeout(resolve, ms);
  if (sig) sig.addEventListener('abort', () => { clearTimeout(t); reject(new jobs.CancelledError()); }, { once: true });
});

// Poll fn() until it returns a non-undefined value; gentle backoff, hard cap.
async function poll(fn, { intervalMs = 2500, maxMs = 30 * 60 * 1000 } = {}) {
  const t0 = Date.now();
  let wait = intervalMs;
  for (;;) {
    jobs.throwIfCancelled();
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() - t0 > maxMs) throw new Error('Generation took too long (gave up after ' + Math.round(maxMs / 60000) + ' min).');
    await sleep(wait);
    wait = Math.min(wait * 1.3, 10000);
  }
}

module.exports = { requestRaw, requestJSON, poll, sleep };
