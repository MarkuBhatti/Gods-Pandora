import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError } from '../lib/job.jsx';
import { useStore, uid } from '../lib/store.jsx';
import { usePersist } from '../lib/qol.jsx';
import { useNav } from '../lib/nav.jsx';
import Media from '../lib/Media.jsx';
import { TEMPLATES, TPL_CATS, tplById, PALETTES, BACKGROUNDS, drawFrame, totalDur, sceneAt, autoStoryboard, AI_SYSTEM, parseAiStoryboard, loadImages, prepareFrame, CODE_SYSTEM, REMAKE_SYSTEM, CODE_LAST } from '../lib/motion.js';
import { sampleFrames } from '../lib/videoFrames.js';
import { OpenButtons } from '../lib/Viewer.jsx';
import { FONTS } from '../lib/textRender.js';

// Pandora Motion — motion design inside the app: 29 animated templates (kinetic type, lower thirds, logo
// reveals, data, social), a scene sequencer, and three ways to auto-design: built-in (offline), an AI model
// (your Claude key or a local LLM) writing the storyboard, or a video model in Create. Rendered frame-by-frame
// to MP4, or to ProRes 4444 with transparency for overlays in the editor / Resolve.

const ASPECTS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const DEFAULT_BOARD = autoStoryboard('"Pandora" Create anything. Edit everything. Free.', 1);
const FIELD_LABEL = { t1: 'Main text', t2: 'Second line', t3: 'Third line', data: 'Chart data (Label:value, …)', logo: 'Logo', img: 'Image', img2: 'Image 2', img3: 'Image 3', code: 'Scene code' };
const stripCode = (raw) => { let x = typeof raw === 'string' ? raw : raw?.text || raw?.content || ''; const m = x.match(/```(?:js|javascript)?\s*([\s\S]*?)```/); return (m ? m[1] : x).trim(); };

export default function PandoraMotion() {
  const { db, update } = useStore();
  const { go: nav } = useNav();
  const [ff, setFf] = useState(null);
  const [scenes, setScenes] = usePersist('motion.scenes', DEFAULT_BOARD.scenes);
  const [look, setLook] = usePersist('motion.look', { ...PALETTES[0], palette: PALETTES[0].id, bg: 'blobs', font: 'Segoe UI' });
  const [aspect, setAspect] = usePersist('motion.aspect', '16:9');
  const [fps, setFps] = usePersist('motion.fps', 30);
  const [cur, setCur] = useState(0);
  const [T, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [brief, setBrief] = usePersist('motion.brief', '');
  const [seed, setSeed] = useState(1);
  const [aiSrc, setAiSrc] = usePersist('motion.ai', 'auto');
  const [tplCat, setTplCat] = useState('');
  const [logoFile, setLogoFile] = usePersist('motion.logo', '');
  const [logoImg, setLogoImg] = useState(null);
  const [music, setMusic] = useState('');
  const [alpha, setAlpha] = useState(false);
  const [error, setError] = useState('');
  const [thinking, setThinking] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [refVideo, setRefVideo] = useState('');
  const [media, setMedia] = usePersist('motion.media', []); // [{file, label}]
  const [imgTick, setImgTick] = useState(0);
  const job = useJob();
  const cvs = useRef(null);
  const [W, H] = ASPECTS[aspect] || ASPECTS['16:9'];
  const PW = 960, PH = Math.round((960 * H) / W);
  const total = totalDur(scenes);
  const sc = scenes[Math.min(cur, scenes.length - 1)];
  const lookP = useMemo(() => ({ ...look, logo: logoImg }), [look, logoImg]);

  useEffect(() => { window.api.cut?.status().then((s) => setFf(!!s.ffmpeg)).catch(() => setFf(false)); }, []);
  useEffect(() => { if (!logoFile) { setLogoImg(null); return; } window.api.dataUrl(logoFile).then((u) => { const i = new Image(); i.onload = () => setLogoImg(i); i.src = u; }).catch(() => setLogoImg(null)); }, [logoFile]);

  // preview loop
  useEffect(() => {
    let raf = 0; let last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000; last = now;
      setT((x) => { const nx = playing ? x + dt : x; return total > 0 ? nx % total : 0; });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);
  useEffect(() => { loadImages(scenes.flatMap((x) => [x.props?.img, x.props?.img2, x.props?.img3])).then(() => setImgTick((n) => n + 1)); }, [scenes]);
  const codeBusy = useRef(false);
  useEffect(() => { const c = cvs.current; if (!c) return; const ctx = c.getContext('2d'); try { drawFrame(ctx, PW, PH, scenes, T, lookP); } catch (e) { console.error(e); }
    if (!codeBusy.current && scenes.some((x) => x.tpl === 'code')) { codeBusy.current = true; prepareFrame(scenes, T, PW, PH, lookP).finally(() => { codeBusy.current = false; }); } });

  const setScene = (i, patch) => setScenes((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch, props: { ...s.props, ...(patch.props || {}) } } : s)));
  const jumpTo = (i) => { setCur(i); let acc = 0; for (let k = 0; k < i; k++) acc += scenes[k].dur; setT(acc + 0.01); };
  const addScene = (tpl) => { const tp = tplById(tpl); setScenes((ss) => [...ss, { id: uid(), tpl, dur: tp.dur, transition: 'fade', props: { t1: tp.name, t2: '', t3: '', data: '' } }]); setTimeout(() => jumpTo(scenes.length), 0); };
  const useBoard = (b) => { setScenes(b.scenes); setLook((l) => ({ ...l, ...b.look })); setCur(0); setT(0); setPlaying(true); };

  async function autoDesign(next = false) {
    setError('');
    const s = next ? seed + 1 : seed; if (next) setSeed(s);
    if (aiSrc === 'auto') { useBoard(autoStoryboard(brief || 'Your brand. Your story.', s)); return; }
    if (aiSrc === 'remake-claude' || aiSrc === 'remake-local') { await remake(aiSrc === 'remake-claude' ? 'claude' : 'local', s); return; }
    if (aiSrc === 'video') { nav('create', { kind: 'video', prompt: `Motion graphics animation: ${brief}. Clean modern typography, smooth camera, vibrant colours, 2D motion design style, no people` }); return; }
    setThinking(true);
    try {
      const prompt = `Brief: ${brief || 'a short promo'}\nAspect ratio: ${aspect}. Variation #${s}.`;
      const raw = aiSrc === 'claude' ? await window.api.claude({ system: AI_SYSTEM, prompt, maxTokens: 2000 }) : await window.api.llmLocal({ system: AI_SYSTEM, prompt, maxTokens: 2000 });
      useBoard(parseAiStoryboard(raw));
    } catch (e) { setError(friendlyError(e) || e.message); }
    setThinking(false);
  }

  const ask = (brain, system, prompt, maxTokens = 2500) => (brain === 'claude' ? window.api.claude({ system, prompt, maxTokens }) : window.api.llmLocal({ system, prompt, maxTokens }));
  // AI writes the code for one scene (runs isolated in a worker)
  async function writeCode(i, brain = aiSrc.includes('local') || aiSrc === 'local' ? 'local' : 'claude') {
    const scn = scenes[i]; const brief0 = scn.props?.code_brief || scn.props?.t1 || brief;
    setThinking(true); setError('');
    try { const raw = await ask(brain, CODE_SYSTEM, `Scene (${scn.dur}s, ${aspect}): ${brief0}\nTexts: t1="${scn.props?.t1 || ''}" t2="${scn.props?.t2 || ''}"`, 3500); setScene(i, { props: { code: stripCode(raw) } }); CODE_LAST.delete(scn.id + ':' + PW + ':err'); }
    catch (e) { setError(friendlyError(e) || e.message); }
    setThinking(false);
  }
  // Katana-style remake: read the reference edit, rebuild its rhythm and layout with your text + media
  async function remake(brain, s) {
    if (!refVideo) { setError('Choose a reference video first (an ad, launch video or motion piece you like).'); return; }
    setThinking(true);
    try {
      const { duration, frames } = await sampleFrames(refVideo, 10);
      const plan = await window.api.jutsu.analyzeAd({ frames, duration, notes: 'Motion-design / edit reference. Note every beat, on-screen text style, layout and transition.', engine: brain });
      const raw = await ask(brain, REMAKE_SYSTEM(media), `Reference breakdown (${duration.toFixed(1)} s): ${JSON.stringify(plan).slice(0, 6000)}\n\nNew brand / brief: ${brief || 'my brand'}\nAspect: ${aspect}. Variation #${s}.`, 3000);
      const b = parseAiStoryboard(raw);
      const mid = (v) => { const m = /^m(\d+)$/.exec(String(v || '').trim()); return m && media[+m[1] - 1] ? media[+m[1] - 1].file : ''; };
      b.scenes = b.scenes.map((x) => ({ ...x, props: { ...x.props, img: mid(x.props.img), img2: mid(x.props.img2), img3: mid(x.props.img3) } }));
      let n = 0;
      for (const x of b.scenes) { if (x.tpl === 'code' && n < 3) { n++; try { x.props.code = stripCode(await ask(brain, CODE_SYSTEM, `Scene (${x.dur}s, ${aspect}): ${x.props.code_brief || x.props.t1}\nTexts: t1="${x.props.t1}" t2="${x.props.t2}"`, 3500)); } catch (_) { /* leave placeholder */ } } }
      useBoard(b);
    } catch (e) { setError(friendlyError(e) || e.message); }
    setThinking(false);
  }

  async function render() {
    setError(''); setResult(null); setPlaying(false);
    if (!scenes.length) return;
    await job.start(async (_jobId, isCancelled) => {
      let sid = null;
      try {
        const fpsN = +fps || 30; const N = Math.max(1, Math.round(total * fpsN));
        const s = await window.api.cut.motionBegin({ fps: fpsN, W, H, alpha, name: 'motion-' + (scenes[0]?.props?.t1 || 'design').slice(0, 20), audio: alpha ? null : music || null });
        sid = s.id;
        const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
        for (let f = 0; f < N; f++) {
          if (isCancelled && isCancelled()) { await window.api.cut.motionEnd(sid, true); sid = null; return; }
          await prepareFrame(scenes, f / fpsN, W, H, lookP);
          drawFrame(ctx, W, H, alpha ? scenes.map((x) => ({ ...x, bg: 'transparent' })) : scenes, f / fpsN, { ...lookP, bg: alpha ? 'transparent' : lookP.bg });
          const blob = await new Promise((res) => c.toBlob(res, alpha ? 'image/png' : 'image/jpeg', 0.93));
          await window.api.cut.motionFrame(sid, new Uint8Array(await blob.arrayBuffer()));
          if (f % 5 === 0) setProgress({ stage: `Frame ${f + 1} / ${N}`, pct: Math.round((f / N) * 100) });
        }
        setProgress({ stage: 'Encoding', pct: 99 });
        const r = await window.api.cut.motionEnd(sid); sid = null;
        setResult(r.file);
        update((d) => { d.generations.unshift({ id: uid(), file: r.file, kind: 'video', prompt: `[Pandora Motion] ${scenes.map((x) => x.props.t1).filter(Boolean).join(' · ').slice(0, 80)}`, model: 'Pandora Motion', at: new Date().toISOString() }); return d; });
      } catch (e) {
        if (sid) window.api.cut.motionEnd(sid, true).catch(() => {});
        if (/FFMPEG_MISSING/.test(String(e.message))) setFf(false); else setError(friendlyError(e) || e.message);
      }
    });
    setProgress(null);
  }

  if (ff === false) {
    return (
      <div><h1>✦ Pandora Motion</h1>
        <div className="card" style={{ maxWidth: 620 }}><h3 style={{ marginTop: 0 }}>One small free add-on first</h3><p className="sub">Motion designs are encoded with <b>ffmpeg</b> (free, ~30 MB).</p>
          <button className="btn" onClick={async () => { const r = await window.api.cut.ensure().catch((e) => ({ ok: false, error: e.message })); if (r.ok) setFf(true); else setError(r.error); }}>⬇ Install ffmpeg (free)</button><ErrorBox error={error} /></div>
      </div>
    );
  }

  const tp = sc ? tplById(sc.tpl) : null;
  const { i: playingScene } = sceneAt(scenes, T);
  return (
    <div>
      <div className="card mo-brief">
        <div className="row" style={{ gap: 6, alignItems: 'stretch', flexWrap: 'nowrap' }}>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder={'Describe it: "Brew & Co" coffee shop grand opening, 50% off this weekend, warm and fun'} style={{ flex: 1, minHeight: 54 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 230 }}>
            <select value={aiSrc} onChange={(e) => setAiSrc(e.target.value)}>
              <option value="auto">⚡ Auto (built-in · offline)</option>
              <option value="claude">✦ AI storyboard · Claude API</option>
              <option value="local">✦ AI storyboard · local model</option>
              <option value="remake-claude">🗡 Remake a reference video · Claude</option>
              <option value="remake-local">🗡 Remake a reference video · local model</option>
              <option value="video">🎞 Generate with a video model (Create)</option>
            </select>
            <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <button className="btn small" style={{ flex: 1 }} onClick={() => autoDesign(false)} disabled={thinking}>{thinking ? 'Designing…' : '✨ Auto design'}</button>
              {aiSrc !== 'video' && <button className="btn ghost small" onClick={() => autoDesign(true)} disabled={thinking} title="Another variation">🎲</button>}
            </div>
          </div>
        </div>
        {aiSrc.startsWith('remake') && (
          <div className="mo-remake" style={{ marginTop: 10, padding: 10, borderRadius: 12, border: '1px solid var(--line2)' }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <b>🗡 Remake</b><span className="sub" style={{ fontSize: 12 }}>Drop a reference edit — Pandora reads its beats, timing, layouts and transitions and rebuilds it with your brief and media. Every frame is drawn as code; no video generation.</span>
            </div>
            <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn small" onClick={async () => { const f = await window.api.pickVideo(); if (f) setRefVideo(typeof f === 'string' ? f : f[0]); }}>{refVideo ? '🎞 ' + String(refVideo).split(/[\\/]/).pop().slice(0, 26) : '＋ Reference video'}</button>
              <button className="btn ghost small" onClick={async () => { const f = await window.api.pickImages(); if (f?.length) setMedia((m) => [...m, ...f.map((x) => ({ file: x, label: String(x).split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/^\d+-/, '').slice(0, 30) }))].slice(0, 12)); }}>＋ Your images (products, logo, screens)</button>
              {db.generations.filter((g) => g.kind === 'image').slice(0, 6).map((g) => <button key={g.id} className="chip mini" title={g.prompt} onClick={() => setMedia((m) => (m.some((x) => x.file === g.file) ? m : [...m, { file: g.file, label: (g.prompt || 'image').slice(0, 30) }]))}>＋ {(g.prompt || 'image').slice(0, 14)}</button>)}
            </div>
            {media.length > 0 && <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>{media.map((m, i) => (
              <div key={m.file} style={{ width: 120 }}><div style={{ height: 68, borderRadius: 8, overflow: 'hidden' }}><Media file={m.file} kind="image" /></div>
                <input value={m.label} onChange={(e) => setMedia((ms) => ms.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} style={{ fontSize: 11, marginTop: 3 }} title="Describe it so the AI places it well" />
                <button className="btn ghost small" style={{ fontSize: 10 }} onClick={() => setMedia((ms) => ms.filter((_, j) => j !== i))}>✕ m{i + 1}</button></div>))}</div>}
          </div>
        )}
        <ErrorBox error={error} />
      </div>

      <div className="mo-layout">
        <div className="card mo-stage">
          <canvas ref={cvs} width={PW} height={PH} className="mo-canvas" style={{ aspectRatio: `${W} / ${H}` }} />
          <div className="ed-transport">
            <button className="play" onClick={() => setPlaying((v) => !v)}>{playing ? '❚❚' : '▶'}</button>
            <input type="range" min="0" max={Math.max(0.01, total)} step="0.01" value={T} onChange={(e) => { setPlaying(false); setT(+e.target.value); }} style={{ flex: 1 }} />
            <span className="ed-tc" style={{ fontSize: 12 }}>{T.toFixed(1)} / {total.toFixed(1)} s</span>
          </div>
          <div className="mo-scenes">
            {scenes.map((s, i) => (
              <div key={s.id} className={'mo-scene' + (i === cur ? ' on' : '') + (i === playingScene ? ' live' : '')} style={{ flex: `${s.dur} 1 0` }} onClick={() => jumpTo(i)}>
                <b>{i + 1}</b> {tplById(s.tpl).name}<small>{s.dur.toFixed(1)}s</small>
                <span className="row" style={{ gap: 2 }}>
                  <button disabled={!i} onClick={(e) => { e.stopPropagation(); setScenes((ss) => { const n = [...ss]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; }); }}>◂</button>
                  <button disabled={i === scenes.length - 1} onClick={(e) => { e.stopPropagation(); setScenes((ss) => { const n = [...ss]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; }); }}>▸</button>
                  <button onClick={(e) => { e.stopPropagation(); setScenes((ss) => ss.filter((_, j) => j !== i)); setCur(0); }}>✕</button>
                </span>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10, alignItems: 'center' }}>
            <select value={aspect} onChange={(e) => setAspect(e.target.value)} style={{ width: 150 }}>{Object.entries(ASPECTS).map(([k, [w, h]]) => <option key={k} value={k}>{k} · {w}×{h}</option>)}</select>
            <select value={fps} onChange={(e) => setFps(+e.target.value)} style={{ width: 90 }}>{[24, 30, 60].map((f) => <option key={f} value={f}>{f} fps</option>)}</select>
            <label className="row" style={{ gap: 4, cursor: 'pointer', fontSize: 12 }} title="ProRes 4444 .mov with transparency — drop it on V2 in the editor or in Resolve / Premiere"><input type="checkbox" style={{ width: 'auto' }} checked={alpha} onChange={(e) => setAlpha(e.target.checked)} /> Transparent overlay</label>
            {!alpha && <button className="btn ghost small" onClick={async () => { const f = await window.api.pickAudio(); if (f?.[0] || typeof f === 'string') setMusic(f?.[0] || f); }}>{music ? '🎵 ' + String(music).split(/[\\/]/).pop().slice(0, 18) : '＋ Music'}</button>}
            {music && !alpha && <button className="btn ghost small" onClick={() => setMusic('')}>✕</button>}
            <span style={{ flex: 1 }} />
            <RunButton job={job} label="⬆ Render motion" busyLabel={progress ? `${progress.stage}` : 'Rendering…'} onRun={render} disabled={!scenes.length} />
          </div>
          {progress && job.running && <div className="mstat-bar" style={{ marginTop: 8 }}><i style={{ width: (progress.pct || 2) + '%' }} /></div>}
          {result && (
            <div className="result-box" style={{ marginTop: 10 }}>
              {!alpha && <Media file={result} kind="video" controls />}
              <p className="sub" style={{ fontSize: 12 }}>✓ Saved to your Gallery{alpha ? ' as a transparent ProRes .mov' : ''}. Add it to the timeline in Pandora Edit.</p>
              <div className="row"><OpenButtons file={result} /><button className="btn ghost small" onClick={() => nav('edit')}>Open Pandora Edit</button></div>
            </div>
          )}
        </div>

        <div className="card mo-side">
          {sc && tp && (<>
            <h4 className="g-h" style={{ marginTop: 0 }}>Scene {Math.min(cur, scenes.length - 1) + 1} · {tp.name}</h4>
            <label>Template</label>
            <select value={sc.tpl} onChange={(e) => setScene(cur, { tpl: e.target.value })}>{TPL_CATS.map((c) => <optgroup key={c} label={c}>{TEMPLATES.filter((x) => x.cat === c).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}</select>
            {tp.fields.filter((f) => f !== 'logo').map((f) => (/^img/.test(f) ? (
              <div key={f}><label>{FIELD_LABEL[f]}</label><div className="row" style={{ gap: 4, alignItems: 'center' }}>
                {sc.props?.[f] && <div style={{ width: 54, height: 34, borderRadius: 6, overflow: 'hidden' }}><Media file={sc.props[f]} kind="image" /></div>}
                <button className="btn ghost small" onClick={async () => { const x = await window.api.pickImages(); if (x?.[0]) setScene(cur, { props: { [f]: x[0] } }); }}>{sc.props?.[f] ? 'Change' : '＋ Choose'}</button>
                {media.slice(0, 4).map((m) => <button key={m.file} className="chip mini" onClick={() => setScene(cur, { props: { [f]: m.file } })}>{m.label.slice(0, 10)}</button>)}
              </div></div>
            ) : f === 'code' ? (
              <div key={f}><label>Describe the animation</label><input value={sc.props?.code_brief || ''} placeholder="e.g. orbiting glowing rings that collapse into the logo text" onChange={(e) => setScene(cur, { props: { code_brief: e.target.value } })} />
                <div className="row" style={{ gap: 4, margin: '4px 0' }}><button className="btn small" disabled={thinking} onClick={() => writeCode(cur, 'claude')}>{thinking ? 'Writing…' : '✦ Write with Claude'}</button><button className="btn ghost small" disabled={thinking} onClick={() => writeCode(cur, 'local')}>local model</button></div>
                <label>Scene code (runs isolated — no files or internet)</label><textarea value={sc.props?.code || ''} onChange={(e) => setScene(cur, { props: { code: e.target.value } })} style={{ fontFamily: 'var(--mono)', fontSize: 11, minHeight: 110 }} /></div>
            ) : (<div key={f}><label>{FIELD_LABEL[f]}</label><input value={sc.props?.[f] || ''} onChange={(e) => setScene(cur, { props: { [f]: e.target.value } })} /></div>)))}
            {tp.fields.includes('logo') && (<><label>Logo (PNG with transparency works best)</label><div className="row"><button className="btn ghost small" onClick={async () => { const f = await window.api.pickImages(); if (f?.[0]) setLogoFile(f[0]); }}>{logoFile ? 'Change logo' : '＋ Add logo'}</button>{logoFile && <button className="btn ghost small" onClick={() => setLogoFile('')}>Remove</button>}</div></>)}
            <div className="row" style={{ gap: 6 }}>
              <div style={{ flex: 1 }}><label>Length</label><input type="number" min="1" max="20" step="0.5" value={sc.dur} onChange={(e) => setScene(cur, { dur: Math.max(1, Math.min(20, +e.target.value || 1)) })} /></div>
              <div style={{ flex: 1 }}><label>Transition in</label><select value={sc.transition || 'fade'} onChange={(e) => setScene(cur, { transition: e.target.value })}>{['fade', 'wipe', 'slide', 'zoom', 'cut'].map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
            </div>
            <label>Scene background</label>
            <select value={sc.bg || ''} onChange={(e) => setScene(cur, { bg: e.target.value || undefined })}><option value="">Same as project</option>{BACKGROUNDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </>)}

          <h4 className="g-h">Look</h4>
          <div className="mo-pals">{PALETTES.map((p) => <button key={p.id} title={p.name} className={'mo-pal' + (look.palette === p.id ? ' on' : '')} onClick={() => setLook((l) => ({ ...l, ...p, palette: p.id }))} style={{ background: `linear-gradient(135deg, ${p.c1} 0 50%, ${p.c2} 50% 75%, ${p.accent} 75%)` }} />)}</div>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            {[['c1', 'Bg'], ['c2', 'Bg 2'], ['accent', 'Accent'], ['ink', 'Text']].map(([k, l]) => <label key={k} className="mo-col">{l}<input type="color" value={look[k]} onChange={(e) => setLook((x) => ({ ...x, [k]: e.target.value, palette: 'custom' }))} /></label>)}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <div style={{ flex: 1 }}><label>Background</label><select value={look.bg} onChange={(e) => setLook((x) => ({ ...x, bg: e.target.value }))}>{BACKGROUNDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div style={{ flex: 1 }}><label>Font</label><select value={look.font} onChange={(e) => setLook((x) => ({ ...x, font: e.target.value }))}>{FONTS.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>
          </div>

          <h4 className="g-h">Add a scene ({TEMPLATES.length} templates)</h4>
          <div className="row" style={{ gap: 3, marginBottom: 6 }}><button className={'chip mini' + (!tplCat ? ' on' : '')} onClick={() => setTplCat('')}>All</button>{TPL_CATS.map((c) => <button key={c} className={'chip mini' + (tplCat === c ? ' on' : '')} onClick={() => setTplCat(c)}>{c}</button>)}</div>
          <div className="mo-tpls">{TEMPLATES.filter((x) => !tplCat || x.cat === tplCat).map((x) => <TplThumb key={x.id} tpl={x} look={lookP} onClick={() => addScene(x.id)} />)}</div>
        </div>
      </div>
    </div>
  );
}

// small animated thumbnail of a template (animates on hover)
function TplThumb({ tpl, look, onClick }) {
  const ref = useRef(null); const [hover, setHover] = useState(false);
  useEffect(() => {
    const c = ref.current; if (!c) return; const ctx = c.getContext('2d'); let raf = 0; const t0 = performance.now();
    const sc = [{ tpl: tpl.id, dur: tpl.dur, props: { t1: tpl.id === 'ticker' ? '2,500+' : tpl.id === 'subscribe' ? 'Subscribe' : tpl.name.split(' ')[0], t2: tpl.id === 'progress' ? '70' : 'Pandora', t3: 'Motion' } }];
    const draw = () => { const t = hover ? ((performance.now() - t0) / 1000) % tpl.dur : tpl.dur * 0.5; try { drawFrame(ctx, 192, 108, sc, t, look); } catch (_) { /* never break the grid */ } if (hover) raf = requestAnimationFrame(draw); };
    draw(); return () => cancelAnimationFrame(raf);
  }, [hover, tpl, look]);
  return <button className="mo-tpl" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} title={'Add “' + tpl.name + '”'}><canvas ref={ref} width={192} height={108} /><span>{tpl.name}</span></button>;
}
