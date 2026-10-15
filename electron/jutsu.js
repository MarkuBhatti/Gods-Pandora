// God's Pandora "skilled tools" — our own identity-training, video-transform and ad-remix tools (inspired by cloud studios like Higgsfield).
// Each tool runs on Higgsfield's API when you have a Higgsfield key, or on open models via FAL / Claude.
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const { upload, zipFiles } = require('./uploads');
const { poll } = require('./net');

const HF = 'https://api.higgsfield.ai';
const hfAuth = (key) => {
  if (!key || !key.includes(':')) throw new Error('Higgsfield key must be "KEY_ID:KEY_SECRET" (Settings → API Keys → Higgsfield).');
  return { Authorization: `Key ${key}` };
};
const need = (key, label) => { if (!key) throw new Error('Add your ' + label + ' key in Settings → API Keys.'); return key; };

/* ───────────────────────── Identity Lock — identity training ───────────────────────── */
// provider 'higgsfield' → POST /v1/custom-references (SOUL v1/v2/cinema), returns custom_reference_id
// provider 'fal'        → fal-ai/flux-lora-fast-training on a zip of the photos, returns a LoRA URL + trigger word
async function trainSoul({ provider, name, files, modelVersion = 'v2', steps = 1000, base, localSteps = 800 }, keys, onProgress = () => {}, local = {}) {
  const imgs = (files || []).filter(Boolean);
  if (imgs.length < 1) throw new Error('Add reference photos of this character first (10–20 varied photos work best).');

  if (provider === 'local') {
    // Fully offline: LoRA on your GPU with the built-in engine (free the engine's GPU memory first)
    const trigger = 'gx' + String(name).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) + 'id';
    if (local.unload) await local.unload();
    onProgress({ stage: 'preparing' });
    const r = await local.engine.trainLora(local.userData, { base: base || 'stabilityai/stable-diffusion-xl-base-1.0', files: imgs, trigger, steps: localSteps, token: keys.huggingface },
      (ev) => onProgress(ev.event === 'progress' ? { stage: 'training', done: ev.step, total: ev.total, loss: ev.loss } : { stage: ev.message || ev.event }));
    return { provider: 'local', loraPath: r.loraPath, base: r.base, xl: r.xl, trigger, trainedAt: new Date().toISOString(), images: imgs.length };
  }

  if (provider === 'higgsfield') {
    const key = need(keys.higgsfield, 'Higgsfield');
    onProgress({ stage: 'uploading', done: 0, total: imgs.length });
    const urls = [];
    for (let i = 0; i < imgs.length && i < 100; i++) {
      urls.push(await upload('higgsfield', imgs[i], key));
      onProgress({ stage: 'uploading', done: i + 1, total: imgs.length });
    }
    const r = await fetch(`${HF}/v1/custom-references`, {
      method: 'POST', headers: { ...hfAuth(key), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: String(name).slice(0, 100), model_version: modelVersion, input_images: urls.map((u) => ({ type: 'image_url', image_url: u })) }),
    });
    const ref = await r.json().catch(() => ({}));
    if (!r.ok || !ref.id) throw new Error('Higgsfield identity training error ' + r.status + ': ' + JSON.stringify(ref).slice(0, 300));
    onProgress({ stage: 'training', status: ref.status });
    const done = await poll(async () => {
      const s = await fetch(`${HF}/v1/custom-references/${ref.id}`, { headers: hfAuth(key) });
      const j = await s.json().catch(() => ({}));
      onProgress({ stage: 'training', status: j.status });
      if (j.status === 'completed') return j;
      if (j.status === 'failed') throw new Error('Identity Lock training failed' + (j.fail_reason ? ': ' + j.fail_reason : ''));
      return undefined;
    }, { intervalMs: 5000, maxMs: 40 * 60 * 1000 });
    return { provider: 'higgsfield', id: done.id, modelVersion, thumbnail: done.thumbnail_url || null, trainedAt: new Date().toISOString(), images: urls.length };
  }

  if (provider === 'fal') {
    const key = need(keys.fal, 'FAL');
    const trigger = 'gx' + String(name).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) + 'id';
    onProgress({ stage: 'packing', total: imgs.length });
    const entries = imgs.slice(0, 50).map((f, i) => {
      const data = /^data:/.test(f) ? Buffer.from(f.split(',')[1], 'base64') : fs.readFileSync(f);
      const ext = /^data:image\/(\w+)/.exec(f)?.[1] || path.extname(f).slice(1) || 'jpg';
      return { name: `img_${String(i + 1).padStart(3, '0')}.${ext === 'jpeg' ? 'jpg' : ext}`, data };
    });
    const zip = zipFiles(entries);
    onProgress({ stage: 'uploading', bytes: zip.length });
    const zipUrl = await upload('fal', 'data:application/zip;base64,' + zip.toString('base64'), key);
    onProgress({ stage: 'training' });
    const out = await falQueue('fal-ai/flux-lora-fast-training', { images_data_url: zipUrl, trigger_word: trigger, create_masks: true, steps }, key,
      (st) => onProgress({ stage: 'training', status: st }), 60 * 60 * 1000);
    const lora = out.diffusers_lora_file?.url;
    if (!lora) throw new Error('Training finished but returned no LoRA file.');
    return { provider: 'fal', loraUrl: lora, trigger, trainedAt: new Date().toISOString(), images: entries.length };
  }
  throw new Error('Unknown Identity Lock provider: ' + provider);
}

// FAL queue helper with status callback
async function falQueue(endpoint, input, key, onStatus = () => {}, maxMs = 30 * 60 * 1000) {
  const auth = { Authorization: `Key ${key}`, 'Content-Type': 'application/json' };
  const sub = await fetch(`https://queue.fal.run/${endpoint}`, { method: 'POST', headers: auth, body: JSON.stringify(input) });
  const job = await sub.json().catch(() => ({}));
  if (!sub.ok) throw new Error(`FAL error ${sub.status}: ${JSON.stringify(job).slice(0, 400)}`);
  if (!job.status_url) return job;
  if (job.request_id) {
    require('./jobs').onCancel(() => {
      const url = job.cancel_url || `https://queue.fal.run/${endpoint}/requests/${job.request_id}/cancel`;
      fetch(url, { method: 'PUT', headers: auth, signal: AbortSignal.timeout(10000) }).catch(() => {});
    });
  }
  await poll(async () => {
    const s = await fetch(job.status_url, { headers: auth });
    const st = await s.json().catch(() => ({}));
    onStatus(st.status);
    if (st.status === 'COMPLETED') return true;
    if (st.status === 'FAILED' || st.status === 'ERROR') throw new Error('FAL job failed: ' + JSON.stringify(st).slice(0, 300));
    return undefined;
  }, { intervalMs: 4000, maxMs });
  const r = await fetch(job.response_url, { headers: auth });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`FAL error ${r.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

/* ───────────────────────── Shapeshift — video transformations ───────────────────────── */
// modes: 'motion' (put character into the video's motion), 'swap' (replace a person/object), 'restyle'
async function genjutsuPresets(keys) {
  const key = need(keys.higgsfield, 'Higgsfield');
  const r = await fetch(`${HF}/models/higgsfield/genjutsu/restyle/v1.0/presets`, { headers: hfAuth(key) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Could not load Restyle styles (' + r.status + ').');
  return j.items || [];
}

async function genjutsu({ mode, provider, video, refs = [], prompt = '', resolution = '720p', presetId, styleText, editModel, localModel }, keys, onProgress = () => {}, generateImage, local = {}) {
  if (!video) throw new Error('Choose a source video (4–30 seconds).');

  if (provider === 'local') {
    // Offline Shapeshift on your GPU with Wan-Animate-2 (drives a reference image with the video's motion).
    // Motion transfer: your character image. Swap / Restyle: the first frame edited by a local image model.
    let image = refs[0];
    if (mode !== 'motion') {
      const firstFrame = refs[0];
      if (!firstFrame) throw new Error('Could not read the first frame of the video.');
      if (!editModel) throw new Error('Pick a local image-edit model (e.g. FLUX.2 [klein] or Qwen-Image) for ' + mode + '.');
      onProgress({ stage: mode === 'swap' ? 'swapping in your reference (first frame)' : 'restyling first frame' });
      const instr = mode === 'swap'
        ? `Replace the main subject in the first image with the person/object from the other reference image(s). Keep the exact pose, framing, background and lighting. ${prompt}`
        : `Redraw this exact frame in ${styleText} style. Keep the same people, poses, composition, camera angle and background layout. ${prompt}`;
      image = await generateImage(firstFrame, instr.trim(), refs.slice(1), editModel);
    }
    if (!image) throw new Error('Add a character reference image.');
    await local.ensureEngine();
    onProgress({ stage: 'animating on your GPU (first run downloads ~40 GB and can take a long time)' });
    const area = { '480p': [640, 480], '580p': [800, 576], '720p': [1024, 720], '1080p': [1280, 960] }[resolution] || [800, 640];
    const { requestJSON } = require('./net');
    require('./jobs').onCancel(() => { fetch('http://127.0.0.1:8756/cancel', { method: 'POST', signal: AbortSignal.timeout(5000) }).catch(() => {}); });
    const imagePath = /^data:/.test(image) ? local.saveDataUrl(image) : image;
    const { status, json } = await requestJSON('http://127.0.0.1:8756/animate', {
      method: 'POST', timeoutMs: 3 * 60 * 60 * 1000,
      body: { model_id: localModel || 'Wan-AI/Wan2.2-Animate-2-14B-Distilled-Diffusers', image_path: imagePath, video_path: video,
              prompt: mode === 'restyle' ? `${styleText} style. ${prompt}` : prompt, width: area[0], height: area[1] },
    });
    if (status !== 200 || !json || json.error) throw new Error('Local Shapeshift: ' + ((json && json.error) || 'HTTP ' + status));
    return { dataUrl: json.video };
  }

  if (provider === 'higgsfield') {
    const key = need(keys.higgsfield, 'Higgsfield');
    const endpoint = { motion: 'motion-transfer', swap: 'object-swap', restyle: 'restyle' }[mode];
    if (!endpoint) throw new Error('Unknown Shapeshift mode.');
    if (mode !== 'restyle' && !refs.length) throw new Error('Add at least one character / object reference image.');
    if (mode === 'restyle' && !presetId) throw new Error('Pick a style.');
    onProgress({ stage: 'uploading' });
    const videoUrl = await upload('higgsfield', video, key);
    const imageUrls = [];
    for (const r of refs.slice(0, mode === 'restyle' ? 5 : 8)) imageUrls.push(await upload('higgsfield', r, key));
    const body = { video_url: videoUrl, image_urls: imageUrls, prompt: prompt || '', resolution };
    if (mode === 'restyle') body.preset_id = presetId;
    onProgress({ stage: 'generating' });
    const res = await fetch(`${HF}/higgsfield/genjutsu/${endpoint}/v1.0`, {
      method: 'POST', headers: { ...hfAuth(key), 'Content-Type': 'application/json', 'Idempotency-Key': require('crypto').randomUUID() },
      body: JSON.stringify(body),
    });
    const job = await res.json().catch(() => ({}));
    require('./jobs').onCancel(() => {
      fetch(job.cancel_url || `${HF}/requests/${job.request_id}/cancel`, { method: 'POST', headers: hfAuth(key), signal: AbortSignal.timeout(10000) }).catch(() => {});
    });
    if (!res.ok) throw new Error('Shapeshift error ' + res.status + ': ' + JSON.stringify(job).slice(0, 300));
    const done = await poll(async () => {
      const s = await fetch(job.status_url || `${HF}/requests/${job.request_id}/status`, { headers: hfAuth(key) });
      const st = await s.json().catch(() => ({}));
      onProgress({ stage: 'generating', status: st.status });
      if (st.status === 'completed') return st;
      if (['failed', 'nsfw', 'canceled'].includes(st.status)) throw new Error('Shapeshift ' + st.status + (st.error ? ': ' + st.error : ''));
      return undefined;
    }, { intervalMs: 4000, maxMs: 45 * 60 * 1000 });
    return { url: done.video?.url };
  }

  if (provider === 'fal') {
    // Open-model Shapeshift on Wan 2.2 Animate (Apache-2.0): Move = motion transfer, Replace = swap.
    // Restyle = restyle the first frame with an image-edit model, then drive it with the source motion.
    const key = need(keys.fal, 'FAL');
    const res = ['480p', '580p', '720p'].includes(resolution) ? resolution : '720p';
    let image = refs[0];
    if (mode === 'restyle') {
      if (!styleText) throw new Error('Describe the style (e.g. "cel-shaded anime", "claymation").');
      if (!generateImage) throw new Error('Restyle needs an image model.');
      onProgress({ stage: 'restyling first frame' });
      const firstFrame = refs[0]; // renderer sends the video's first frame as refs[0] for restyle
      if (!firstFrame) throw new Error('Could not read the first frame of the video.');
      image = await generateImage(firstFrame, `Redraw this exact frame in ${styleText} style. Keep the same people, poses, composition, camera angle and background layout. ${prompt}`.trim(), refs.slice(1), editModel);
    }
    if (!image) throw new Error('Add a character / object reference image.');
    onProgress({ stage: 'uploading' });
    const videoUrl = await upload('fal', video, key);
    const imageUrl = await upload('fal', image, key);
    onProgress({ stage: 'generating' });
    const endpoint = mode === 'swap' ? 'fal-ai/wan/v2.2-14b/animate/replace' : 'fal-ai/wan/v2.2-14b/animate/move';
    const out = await falQueue(endpoint, { video_url: videoUrl, image_url: imageUrl, resolution: res, use_turbo: true }, key,
      (st) => onProgress({ stage: 'generating', status: st }), 45 * 60 * 1000);
    if (!out.video?.url) throw new Error('No video returned.');
    return { url: out.video.url };
  }
  throw new Error('Unknown Shapeshift provider: ' + provider);
}

/* ───────────────────────── Ad Multiplier — reference-ad analysis ───────────────────────── */
// frames: [{ t, dataUrl }] sampled from the reference ad. Claude breaks the ad into shots + script.
const AD_INSTRUCTIONS = (duration, notes) => `These are frames sampled from a ${Number(duration).toFixed(1)}-second video ad. ${notes ? 'Creator notes: ' + notes : ''}
Break it down so it can be recreated with different products, cast and locations.
Return ONLY JSON:
{"summary": "...", "format": "UGC / cinematic / demo / ...", "aspect": "9:16|16:9|1:1",
 "shots": [{"start": 0, "end": 2.5, "role": "hook|body|cta", "frame": <index of the closest frame above, 0-based>,
   "visual": "what is on screen, framing, action, lighting", "camera": "camera move", "onscreen_text": "", "voiceover": ""}],
 "hook": "the opening hook line", "cta": "the closing call to action"}`;

function parsePlan(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Could not read the ad breakdown from the model.');
  const plan = JSON.parse(m[0]);
  if (!Array.isArray(plan.shots) || !plan.shots.length) throw new Error('The model returned no shots — try again or use Manual breakdown.');
  return plan;
}

// Any OpenAI-compatible local server with a vision model: Ollama (http://localhost:11434/v1), LM Studio (http://localhost:1234/v1)…
async function listLocalLLMs(baseUrl) {
  const base = String(baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
  const r = await fetch(base + '/models').catch(() => null);
  if (!r || !r.ok) throw new Error('No local model server at ' + base + '. Start Ollama or LM Studio (with a vision model such as qwen2.5vl, gemma3 or llama3.2-vision).');
  const j = await r.json();
  return (j.data || j.models || []).map((m) => m.id || m.name);
}

async function analyzeAdLocal({ frames, duration, notes, baseUrl, model }) {
  const base = String(baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
  if (!model) throw new Error('Pick a local vision model.');
  const content = [];
  frames.slice(0, 8).forEach((f) => {
    content.push({ type: 'text', text: `Frame ${content.filter((c) => c.type === 'image_url').length} at ${Number(f.t).toFixed(1)}s:` });
    content.push({ type: 'image_url', image_url: { url: f.dataUrl } });
  });
  content.push({ type: 'text', text: AD_INSTRUCTIONS(duration, notes) });
  const { requestJSON } = require('./net');
  const { status, json } = await requestJSON(base + '/chat/completions', {
    method: 'POST', timeoutMs: 20 * 60 * 1000,
    body: { model, temperature: 0.2, messages: [{ role: 'user', content }] },
  });
  if (status !== 200) throw new Error('Local model error ' + status + ': ' + JSON.stringify(json).slice(0, 300));
  return parsePlan(json.choices?.[0]?.message?.content || '');
}

async function analyzeAd({ frames, duration, notes, engine, baseUrl, model }, keys) {
  if (engine === 'local') return analyzeAdLocal({ frames, duration, notes, baseUrl, model });
  const key = need(keys.anthropic, 'Anthropic (Claude)');
  const content = [];
  frames.slice(0, 12).forEach((f) => {
    const m = String(f.dataUrl).match(/^data:(image\/\w+);base64,(.*)$/s);
    if (!m) return;
    content.push({ type: 'text', text: `Frame at ${Number(f.t).toFixed(1)}s:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  });
  content.push({ type: 'text', text: AD_INSTRUCTIONS(duration, notes) });
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 4000, messages: [{ role: 'user', content }] }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  return parsePlan((json.content || []).map((c) => c.text || '').join(''));
}

/* ───────────────────────── Video stitching (ffmpeg) ───────────────────────── */
function findFfmpeg(userData) {
  const tryCmd = (c) => { try { return spawnSync(c, ['-version']).status === 0 ? c : null; } catch (_) { return null; } };
  const onPath = tryCmd('ffmpeg');
  if (onPath) return onPath;
  const venvPy = process.platform === 'win32' ? path.join(userData, 'engine-venv', 'Scripts', 'python.exe') : path.join(userData, 'engine-venv', 'bin', 'python');
  if (fs.existsSync(venvPy)) {
    const r = spawnSync(venvPy, ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']);
    const exe = String(r.stdout || '').trim();
    if (r.status === 0 && exe && fs.existsSync(exe)) return exe;
  }
  return null;
}

function concatVideos(files, outFile, userData, aspect = '9:16') {
  const [W, H] = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] }[aspect] || [1080, 1920];
  return new Promise((resolve, reject) => {
    const ff = findFfmpeg(userData);
    if (!ff) return reject(new Error('Stitching needs ffmpeg. Install the local engine (Models → Install engine) or install ffmpeg, then try again. The individual clips are in your Library.'));
    const args = ['-y'];
    files.forEach((f) => args.push('-i', f));
    // normalize every clip to the first clip's size, 30 fps, then concat (video only — AI clips often have no audio)
    const scale = files.map((_, i) => `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`);
    const chain = files.map((_, i) => `[v${i}]`).join('') + `concat=n=${files.length}:v=1:a=0[out]`;
    args.push('-filter_complex', scale.join(';') + ';' + chain, '-map', '[out]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile);
    const p = spawn(ff, args);
    let err = '';
    p.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
    p.on('close', (code) => (code === 0 ? resolve(outFile) : reject(new Error('ffmpeg failed: ' + err.split('\n').slice(-3).join(' ')))));
  });
}

module.exports = { trainSoul, genjutsu, genjutsuPresets, analyzeAd, listLocalLLMs, concatVideos, findFfmpeg, falQueue };
