// Maps God's Pandora's generic generation settings onto the fields a given cloud API accepts.
// Only fields declared in the model's catalog "params" block are sent, so APIs never receive unknown keys.
const RES_ORDER = ['480p', '512p', '580p', '720p', '768p', '1080p', '1440p', '4k'];

function pickResolution(requested, allowed) {
  if (!requested || !allowed || !allowed.length) return null;
  const want = RES_ORDER.indexOf(String(requested).toLowerCase());
  const sorted = [...allowed].sort((a, b) => RES_ORDER.indexOf(a.toLowerCase()) - RES_ORDER.indexOf(b.toLowerCase()));
  let best = sorted[0];
  for (const r of sorted) if (RES_ORDER.indexOf(r.toLowerCase()) <= want) best = r;
  return best;
}

function closest(n, list) {
  return list.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), list[0]);
}

function optionalParams(model, params) {
  const spec = model.params || {};
  const out = {};
  if (spec.seed && params.seed != null) out.seed = params.seed;
  if (spec.stepsKey && params.steps) out[spec.stepsKey] = params.steps;
  if (spec.guidanceKey && params.guidance != null) out[spec.guidanceKey] = params.guidance;
  if (spec.size && params.width && params.height) { out.width = params.width; out.height = params.height; }
  if (spec.resolutions && params.resolution) {
    const r = pickResolution(params.resolution, spec.resolutions);
    if (r) out.resolution = r;
  }
  if (params.duration && spec.duration !== false) {
    if (spec.durations) {
      const d = closest(+params.duration, spec.durations);
      out.duration = spec.durationAsString ? String(d) : d;
    } else if (model.kind === 'video') {
      out.duration = params.duration;
    }
  }
  return out;
}

module.exports = { optionalParams, pickResolution };
