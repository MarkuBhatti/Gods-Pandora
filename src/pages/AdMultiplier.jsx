import React, { useMemo, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError } from '../lib/job.jsx';
import { useStore, uid } from '../lib/store.jsx';
import { useAllModels, modelLabel, ModelStatus, useModelGate, useReadiness } from '../lib/models.jsx';
import { sampleFrames, videoInfo } from '../lib/videoFrames.js';
import { resolveMentions } from '../lib/mentions.jsx';
import Media from '../lib/Media.jsx';

// Ad Multiplier — recreate a reference video ad with your own product, cast, location, script, hooks and CTAs.
// 1) break the reference into shots (Claude vision, or manual)  2) swap assets  3) per shot: edit the keyframe
// with your assets (image-edit model) → animate it (video model)  4) stitch every hook × CTA variant.

const clampDur = (d) => Math.max(3, Math.min(10, Math.round(d)));

export default function AdMultiplier() {
  const { db, update } = useStore();
  const allModels = useAllModels();
  const [video, setVideo] = useState(null);
  const [aspect, setAspect] = useState('9:16');
  const [frames, setFrames] = useState([]);
  const [duration, setDuration] = useState(0);
  const [plan, setPlan] = useState(null);
  const [notes, setNotes] = useState('');
  const [brain, setBrain] = useState(() => db.settings?.adBrain || 'claude');
  const [llmUrl, setLlmUrl] = useState(() => db.settings?.localLlmUrl || 'http://localhost:11434/v1');
  const [llmModels, setLlmModels] = useState([]);
  const [llm, setLlm] = useState(() => db.settings?.localLlmModel || '');
  const [productId, setProductId] = useState('');
  const [castId, setCastId] = useState('');
  const [locId, setLocId] = useState('');
  const [brief, setBrief] = useState('');
  const [hooks, setHooks] = useState('');
  const [ctas, setCtas] = useState('');
  const [faithful, setFaithful] = useState(true);
  const [videoId, setVideoId] = useState('');
  const [editId, setEditId] = useState('');
  const [stitch, setStitch] = useState(true);
  const [busy, setBusy] = useState('');
  const job = useJob();
  const ajob = useJob();
  const [log, setLog] = useState([]);
  const [error, setError] = useState('');
  const [variants, setVariants] = useState([]);

  const videoModels = useMemo(() => allModels.filter((m) => m.kind === 'video' && m.refInput), [allModels]);
  const editModels = useMemo(() => allModels.filter((m) => m.kind === 'image' && m.refInput), [allModels]);
  const vModel = videoModels.find((m) => m.id === videoId) || videoModels[0];
  const eModel = editModels.find((m) => m.id === editId) || editModels[0];
  const rdy = useReadiness();
  const gate = useModelGate(vModel, faithful ? eModel : null);
  const product = (db.products || []).find((x) => x.id === productId);
  const cast = db.characters.find((x) => x.id === castId);
  const loc = db.locations.find((x) => x.id === locId);
  const say = (m) => setLog((l) => [...l, m]);

  async function loadRef(file) {
    if (!file) return;
    setError(''); setPlan(null); setVariants([]); setVideo(file); setBusy('Reading video…');
    try {
      const i = await videoInfo(file);
      if (i.duration < 4 || i.duration > 30.5) throw new Error('Use a reference ad between 4 and 30 seconds.');
      setAspect(['9:16', '16:9', '1:1', '4:5'].includes(i.aspect) ? i.aspect : '9:16');
      const s = await sampleFrames(file, Math.min(10, Math.max(4, Math.round(i.duration / 2.5))));
      setFrames(s.frames); setDuration(s.duration);
    } catch (e) { setError(String(e.message || e)); setVideo(null); }
    setBusy('');
  }

  async function loadLocalModels() {
    setError('');
    try {
      const list = await window.api.jutsu.listLocalLLMs(llmUrl);
      setLlmModels(list);
      const vision = list.find((m) => /vl|vision|gemma|llava|qwen.*v|minicpm|pixtral|moondream/i.test(m)) || list[0];
      if (!llm && vision) setLlm(vision);
    } catch (e) { setError(String(e.message || e)); }
  }

  async function analyze() {
    setBusy(brain === 'local' ? 'Your local vision model is breaking down the ad…' : 'Claude is breaking down the ad…'); setError('');
    update((d) => { d.settings.adBrain = brain; d.settings.localLlmUrl = llmUrl; d.settings.localLlmModel = llm; return d; });
    await ajob.start(async (jobId) => {
      try { setPlan(await window.api.jutsu.analyzeAd({ jobId, frames, duration, notes, engine: brain, baseUrl: llmUrl, model: llm })); }
      catch (e) { const m = friendlyError(e); if (m) setError(m + ' — you can use “Manual breakdown” instead.'); }
    });
    setBusy('');
  }

  function manual() {
    const n = frames.length;
    setPlan({
      summary: '', format: '', aspect, hook: '', cta: '',
      shots: frames.map((f, i) => ({
        start: f.t, end: i + 1 < n ? frames[i + 1].t : duration, frame: i,
        role: i === 0 ? 'hook' : i === n - 1 ? 'cta' : 'body', visual: '', camera: '', onscreen_text: '', voiceover: '',
      })),
    });
  }

  const setShot = (i, patch) => setPlan((p) => ({ ...p, shots: p.shots.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const delShot = (i) => setPlan((p) => ({ ...p, shots: p.shots.filter((_, j) => j !== i) }));

  const hookList = hooks.split('\n').map((s) => s.trim()).filter(Boolean);
  const ctaList = ctas.split('\n').map((s) => s.trim()).filter(Boolean);
  const combos = [];
  (hookList.length ? hookList : [null]).forEach((h) => (ctaList.length ? ctaList : [null]).forEach((c) => combos.push({ hook: h, cta: c })));
  const combosCapped = combos.slice(0, 8);

  function shotPrompt(shot, combo) {
    const swaps = [];
    if (product) swaps.push(`the product is now "${product.name}" (${product.description || 'see product references'}) — exact shape, colors, label and logo from the product reference images`);
    if (cast) swaps.push(`the person on screen is now ${cast.name} (${cast.description || 'see character references'}) — keep this exact identity`);
    if (loc) swaps.push(`the setting is now ${loc.name} (${loc.description || 'see location references'})`);
    let text = shot.onscreen_text || '';
    let vo = shot.voiceover || '';
    if (shot.role === 'hook' && combo.hook) { text = combo.hook; vo = combo.hook; }
    if (shot.role === 'cta' && combo.cta) { text = combo.cta; vo = combo.cta; }
    return [
      `${plan.format ? plan.format + ' ad shot' : 'Ad shot'}: ${shot.visual || 'recreate the reference frame'}.`,
      shot.camera && `Camera: ${shot.camera}.`,
      swaps.length && 'Changes: ' + swaps.join('; ') + '.',
      text && `On-screen text: "${text}".`,
      vo && `The person says: "${vo}".`,
      brief && `Brief: ${brief}`,
      'Keep the original ad\'s structure, pacing, framing and energy.',
    ].filter(Boolean).join(' ');
  }

  const assetRefs = () => [...(product?.refs || []).slice(0, 3), ...(cast?.refs || []).slice(0, 3), ...(loc?.refs || []).slice(0, 2)];

  async function generateAll() {
    if (!plan?.shots?.length || !vModel) return;
    setError(''); setLog([]); setVariants([]);
    await job.start(async (_id, isCancelled) => {
    const mentions = resolveMentions(brief, db);
    const cache = {}; // body shots are shared by every variant
    const keyframeFiles = {};
    const results = [];
    try {
      for (let v = 0; v < combosCapped.length; v++) {
        const combo = combosCapped[v];
        const clips = [];
        for (let i = 0; i < plan.shots.length; i++) {
          const shot = plan.shots[i];
          const variantSpecific = (shot.role === 'hook' && combo.hook) || (shot.role === 'cta' && combo.cta);
          const cacheKey = variantSpecific ? `${i}|${combo.hook}|${combo.cta}` : `${i}`;
          if (!cache[cacheKey]) {
            const prompt = shotPrompt(shot, combo);
            let start = null;
            if (faithful && eModel && frames[shot.frame ?? 0]) {
              if (!keyframeFiles[i]) keyframeFiles[i] = await window.api.saveDataUrl(frames[shot.frame ?? 0].dataUrl, `ad-ref-shot-${i + 1}`);
              say(`Variant ${v + 1} · shot ${i + 1}: restaging the keyframe with your assets…`);
              if (isCancelled()) throw new Error('Cancelled.');
              const still = await window.api.generate({
                jobId: job.step(),
                provider: eModel.provider, model: eModel, kind: 'image',
                prompt: 'Recreate this exact ad frame — same composition, framing, pose and lighting. ' + prompt,
                params: { aspectRatio: aspect }, toolRefs: [keyframeFiles[i], ...assetRefs()], mentions,
              });
              start = still.file;
            }
            say(`Variant ${v + 1} · shot ${i + 1}: animating (${clampDur(shot.end - shot.start)} s)…`);
            if (isCancelled()) throw new Error('Cancelled.');
            const clip = await window.api.generate({
              jobId: job.step(),
              provider: vModel.provider, model: vModel, kind: 'video', prompt,
              params: { aspectRatio: aspect, duration: clampDur(shot.end - shot.start), resolution: '720p' },
              toolRefs: start ? [start] : assetRefs(), mentions,
            });
            cache[cacheKey] = clip.file;
            update((d) => { d.generations.unshift({ id: uid(), file: clip.file, kind: 'video', prompt: `[Ad Multiplier v${v + 1} · shot ${i + 1}] ${prompt}`, model: vModel.name, at: new Date().toISOString() }); return d; });
          }
          clips.push(cache[cacheKey]);
        }
        let final = null;
        if (stitch && clips.length > 1) {
          try { say(`Variant ${v + 1}: stitching ${clips.length} clips…`); final = await window.api.concat(clips, aspect); }
          catch (e) { say('⚠ ' + (e.message || e)); }
        } else if (clips.length === 1) final = clips[0];
        if (final && final !== clips[0]) {
          update((d) => { d.generations.unshift({ id: uid(), file: final, kind: 'video', prompt: `[Ad Multiplier] variant ${v + 1}${combo.hook ? ' · hook: ' + combo.hook : ''}${combo.cta ? ' · CTA: ' + combo.cta : ''}`, model: vModel.name, at: new Date().toISOString() }); return d; });
        }
        results.push({ combo, clips, final });
        setVariants([...results]);
      }
      say('✓ Done — all clips are saved in your Library.');
    } catch (e) {
      const m = friendlyError(e);
      if (m) setError(m); else say('■ Cancelled — finished clips are kept in your Library.');
    }
    });
  }

  const totalJobs = plan ? plan.shots.reduce((n, s) => n + (((s.role === 'hook' && hookList.length) || (s.role === 'cta' && ctaList.length)) ? combosCapped.length : 1), 0) * (faithful ? 2 : 1) : 0;

  return (
    <div>
      <h1>📈 Pandora Ad Multiplier</h1>
      <p className="sub">Recreate any video ad with your own product, cast and location — keep its structure, swap what you want, and test as many hooks and CTAs as you like.</p>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>1 · Reference ad (4–30 s)</h3>
        <div className="row">
          <button className="btn ghost small" onClick={async () => loadRef(await window.api.pickVideo())}>+ Upload reference video</button>
          {busy && !plan && <span className="sub">{busy}</span>}
        </div>
        {video && <div className="two-col" style={{ marginTop: 10 }}>
          <div className="result-box"><Media file={video} kind="video" controls /></div>
          <div>
            <div className="frame-strip">{frames.map((f, i) => <div key={i}><img src={f.dataUrl} alt="" /><span>{i} · {f.t.toFixed(1)}s</span></div>)}</div>
            <label>Notes for the breakdown (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. it's a skincare UGC ad, the woman talks to camera" />
            <label>Breakdown engine</label>
            <div className="row">
              <button className={'chip' + (brain === 'claude' ? ' on' : '')} onClick={() => setBrain('claude')}>☁ Claude (Anthropic key)</button>
              <button className={'chip' + (brain === 'local' ? ' on' : '')} onClick={() => { setBrain('local'); if (!llmModels.length) loadLocalModels(); }}>💻 Local vision model (Ollama / LM Studio)</button>
            </div>
            {brain === 'local' && (
              <div className="row" style={{ marginTop: 6 }}>
                <input style={{ flex: 2 }} value={llmUrl} onChange={(e) => setLlmUrl(e.target.value)} title="OpenAI-compatible endpoint: Ollama http://localhost:11434/v1 · LM Studio http://localhost:1234/v1" />
                <select style={{ flex: 2 }} value={llm} onChange={(e) => setLlm(e.target.value)}>
                  <option value="">— model —</option>
                  {llmModels.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button className="btn ghost small" onClick={loadLocalModels}>↻</button>
              </div>
            )}
            {brain === 'local' && <p className="sub" style={{ fontSize: 11 }}>Free and offline. Needs a vision model, e.g. <code>ollama pull qwen2.5vl</code> or <code>ollama pull gemma3</code>.</p>}
            <div className="row" style={{ marginTop: 8 }}>
              <RunButton small job={ajob} label="🧠 Analyze ad" busyLabel="Analyzing…" onRun={analyze} disabled={!frames.length || job.running || (brain === 'local' && !llm)} />
              <button className="btn ghost small" disabled={!frames.length} onClick={manual}>✍ Manual breakdown</button>
            </div>
          </div>
        </div>}
      </div>

      {plan && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>2 · Shot breakdown {plan.format && <span className="badge">{plan.format}</span>}</h3>
          {plan.summary && <p className="sub">{plan.summary}</p>}
          {plan.shots.map((s, i) => (
            <div key={i} className="shot-row">
              {frames[s.frame ?? 0] && <img src={frames[s.frame ?? 0].dataUrl} alt="" />}
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 6 }}>
                  <strong>Shot {i + 1}</strong>
                  <select style={{ width: 100 }} value={s.role} onChange={(e) => setShot(i, { role: e.target.value })}><option value="hook">hook</option><option value="body">body</option><option value="cta">cta</option></select>
                  <span className="sub">{Number(s.start).toFixed(1)}–{Number(s.end).toFixed(1)} s → {clampDur(s.end - s.start)} s clip</span>
                  <button className="btn danger small" onClick={() => delShot(i)}>✕</button>
                </div>
                <textarea rows={2} value={s.visual} onChange={(e) => setShot(i, { visual: e.target.value })} placeholder="What's on screen (framing, action, lighting)" />
                <div className="row" style={{ gap: 6 }}>
                  <input style={{ flex: 1 }} value={s.camera} onChange={(e) => setShot(i, { camera: e.target.value })} placeholder="Camera move" />
                  <input style={{ flex: 1 }} value={s.onscreen_text} onChange={(e) => setShot(i, { onscreen_text: e.target.value })} placeholder="On-screen text" />
                  <input style={{ flex: 1 }} value={s.voiceover} onChange={(e) => setShot(i, { voiceover: e.target.value })} placeholder="Voiceover / dialogue" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {plan && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>3 · What to change</h3>
          <div className="builder-grid">
            <div><label>Product</label><select value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">keep original</option>{(db.products || []).map((p) => <option key={p.id} value={p.id}>📦 {p.name}</option>)}</select></div>
            <div><label>Cast</label><select value={castId} onChange={(e) => setCastId(e.target.value)}><option value="">keep original</option>{db.characters.map((c) => <option key={c.id} value={c.id}>{c.kind === 'influencer' ? '🌟' : '☺'} {c.name}</option>)}</select></div>
            <div><label>Location</label><select value={locId} onChange={(e) => setLocId(e.target.value)}><option value="">keep original</option>{db.locations.map((l) => <option key={l.id} value={l.id}>⌖ {l.name}</option>)}</select></div>
          </div>
          {!(db.products || []).length && <p className="sub" style={{ fontSize: 11 }}>Save your product in Products & Brand first to swap it in.</p>}
          <label>Script / scene changes (optional — @Name works here)</label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Pakistani market, Urdu-English voiceover, summer launch, 20% off" />
          <div className="two-col">
            <div><label>Hooks — one per line (each becomes a variant)</label><textarea value={hooks} onChange={(e) => setHooks(e.target.value)} placeholder={'POV: you finally found the serum that works\nStop scrolling if your skin feels dull'} /></div>
            <div><label>CTAs — one per line</label><textarea value={ctas} onChange={(e) => setCtas(e.target.value)} placeholder={'Tap to shop — 20% off today\nLink in bio'} /></div>
          </div>
        </div>
      )}

      {plan && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>4 · Generate {combosCapped.length} variant{combosCapped.length === 1 ? '' : 's'}</h3>
          {combos.length > 8 && <p className="err" style={{ fontSize: 11 }}>Only the first 8 hook × CTA combinations are generated per run.</p>}
          <p className="sub" style={{ fontSize: 11 }}>Every model works here — cloud ones with your keys, or ⬇ local ones on your GPU (e.g. FLUX.2 [klein] for restaging, Wan 2.2 TI2V 5B for animation) for a fully offline run.</p>
          <div className="row">
            <button className={'chip' + (faithful ? ' on' : '')} onClick={() => setFaithful(true)}>Faithful — restage each reference frame, then animate</button>
            <button className={'chip' + (!faithful ? ' on' : '')} onClick={() => setFaithful(false)}>Fast — generate shots directly</button>
          </div>
          <div className="builder-grid">
            {faithful && <div><label>Image-edit model</label><select value={eModel?.id || ''} onChange={(e) => setEditId(e.target.value)}>{editModels.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, rdy)}</option>)}</select><ModelStatus model={eModel} compact /></div>}
            <div><label>Video model (image→video)</label><select value={vModel?.id || ''} onChange={(e) => setVideoId(e.target.value)}>{videoModels.map((m) => <option key={m.id} value={m.id}>{modelLabel(m, rdy)}</option>)}</select><ModelStatus model={vModel} compact /></div>
            <div><label>Aspect</label><select value={aspect} onChange={(e) => setAspect(e.target.value)}>{['9:16', '16:9', '1:1', '4:5'].map((a) => <option key={a}>{a}</option>)}</select></div>
          </div>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={stitch} onChange={(e) => setStitch(e.target.checked)} /> Stitch each variant into one video (uses ffmpeg from the local engine or your PATH)</label>
          <p className="sub" style={{ fontSize: 11 }}>≈ {totalJobs} generations. Body shots are generated once and reused across variants; only hook and CTA shots change.</p>
          <RunButton job={job} label="📈 Multiply ad" busyLabel="Multiplying…" onRun={generateAll} disabled={ajob.running || !vModel || (faithful && !eModel) || !gate.ok} />
          {!gate.ok && !job.running && <span className="sub" style={{ fontSize: 11, marginLeft: 8 }}>🔒 {gate.reason}</span>}
          <ErrorBox error={error} />
          {log.length > 0 && <div className="log" style={{ marginTop: 10, maxHeight: 160 }}>{log.join('\n')}</div>}
          {variants.map((v, i) => (
            <div key={i} className="card" style={{ marginTop: 10, padding: 10 }}>
              <strong>Variant {i + 1}</strong> <span className="sub">{v.combo.hook ? 'Hook: ' + v.combo.hook : ''} {v.combo.cta ? '· CTA: ' + v.combo.cta : ''}</span>
              {v.final && <div className="result-box"><Media file={v.final} kind="video" controls /></div>}
              <div className="row" style={{ marginTop: 6 }}>
                <span className="sub">{v.clips.length} clip(s)</span>
                <button className="btn ghost small" onClick={() => window.api.resolveSend(v.final ? [v.final] : v.clips)}>→ Resolve</button>
                {v.final && <button className="btn ghost small" onClick={() => window.api.reveal(v.final)}>Open</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
