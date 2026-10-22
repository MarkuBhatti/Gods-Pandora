import React, { useEffect, useRef, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError } from '../lib/job.jsx';
import Media from '../lib/Media.jsx';
import { takeIntent } from '../lib/nav.jsx';
import MicButton, { speak, voicePrefs } from '../lib/Voice.jsx';

// spoken "yes" in many languages → approve the plan
const YES = /^(yes|yeah|yep|ok(ay)?|sure|go( ahead)?|approve[d]?|start|do it|haan|han|ji|jee|theek( hai)?|bilkul|chalo|si|sí|oui|ja|da|sim|evet|naam|na'am|نعم|ہاں|جی|ٹھیک|हाँ|हां|ठीक|好的?|是|はい|네|예|да|так|tak|ναι)\b/i;

// Pandora Agent — describe the job, it plans, uses every tool in God's Pandora and delivers a launch package.
const TEMPLATES = [
  ['👗 Clothing brand launch', 'Launch my new streetwear clothing brand "NOIR LANE" for 18–30 year olds in Lahore and Dubai. Create a brand bible (name story, palette, tone), 5 campaign images (lookbook, lifestyle, product flat-lay, social posts), a 30-second promo video script, 3 cinematic video shots, an auto-edited and colour-graded promo video, Instagram/TikTok captions with hashtags, and a 10-slide investor & marketing presentation.'],
  ['📱 App launch kit', 'Launch my productivity app "FocusFlow". Create positioning & messaging, App Store description, 4 hero visuals and social graphics, a 20-second promo video (script, shots, edit, colour), launch-day social posts, a press release and a 10-slide pitch deck.'],
  ['🛍 Product ad pack', 'Create an ad campaign for my handmade skincare product "Rose & Clay". 6 product images (studio packshot, lifestyle, ingredients, model use), 3 short vertical video ads (9:16) with hooks, captions and CTAs, a voice-over script, and a short brand presentation.'],
  ['🍔 Restaurant opening', 'Promote the grand opening of my burger restaurant "Smash Theory". Menu hero images, a 15-second vertical teaser, opening-week social calendar, captions, flyer copy and a one-page brand board presentation.'],
  ['🎵 Music release', 'Create a release campaign for my new single "Midnight Static" (synthwave). Cover art, 3 promo visuals, a 15-second visualiser video, release announcement copy, a TikTok content plan and a press kit presentation.'],
];

const ICON = { you: '🗣', heard: '👂', start: '🚀', thinking: '…', say: '💬', tool: '🛠', plan: '🗺', asset: '✅', progress: '⏳', warn: '⚠', done: '🎉', error: '❌', cancelled: '⏹' };
const TOOL_LABEL = { propose_plan: 'Planning the production', write_document: 'Writing', generate_image: 'Generating image', generate_video: 'Generating video shot', generate_voiceover: 'Recording voice-over', auto_edit: 'Auto-editing the video', color_grade: 'Colour grading', make_presentation: 'Building the presentation', list_assets: 'Checking assets', finish: 'Packaging deliverables' };

export default function PandoraAgent({ compact = false }) {
  const [goal, setGoal] = useState('');
  const [brain, setBrain] = useState('claude');
  const [hasClaude, setHasClaude] = useState(null);
  const [models, setModels] = useState([]);
  const [images, setImages] = useState(8);
  const [videos, setVideos] = useState(3);
  const [audio, setAudio] = useState(1);
  const [review, setReview] = useState(true);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('pandora.mode') || 'free'; } catch { return 'free'; } });
  useEffect(() => { const f = (e) => e.detail && setMode(e.detail); window.addEventListener('pandora:mode', f); return () => window.removeEventListener('pandora:mode', f); }, []);
  const [allowDl, setAllowDl] = useState(true);
  const [routes, setRoutes] = useState(null);
  const [events, setEvents] = useState([]);
  const [plan, setPlan] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [assets, setAssets] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const job = useJob();
  const logRef = useRef(null);
  const [talkBack, setTalkBack] = useState(false); // voice control removed
  const talkRef = useRef(talkBack); talkRef.current = talkBack;

  useEffect(() => {
    window.api.keysList?.().then((k) => setHasClaude(!!(k && k.anthropic))).catch(() => setHasClaude(false));
    window.api.agent?.models?.().then((m) => setModels(Array.isArray(m) ? m : [])).catch(() => {});
    const off = window.api.agent?.onEvent?.((ev) => {
      if (ev.type === 'progress') { setProgress(ev); return; }
      if (ev.type === 'plan') { setPlan(ev); if (talkRef.current) speak(`I have a plan with ${ev.steps.length} steps. Say yes to start, or tell me what to change.`); }
      if (talkRef.current && ev.type === 'say' && ev.text) speak(ev.text);
      if (talkRef.current && ev.type === 'done') speak('Your launch package is ready.');
      if (ev.type === 'asset') setAssets((a) => [...a, ev]);
      setEvents((e) => [...e.slice(-300), ev]);
    });
    return typeof off === 'function' ? off : undefined;
  }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [events]);
  // "Hey Pandora, …" — voice commands land here first
  const live = useRef({}); live.current = { plan, running: job.running, goal, start: () => start() };
  useEffect(() => { const it = takeIntent('agent'); if (it?.goal) { setGoal(it.goal); if (it.mode) setMode(it.mode); if (it.autorun) setTimeout(() => { if (live.current.goal.trim().length >= 10 && !live.current.running) live.current.start(); }, 500); else if (talkRef.current) speak('Say start when you are ready, or add more details.'); } }, []);
  useEffect(() => {
    const onVoice = (e) => {
      const t = String(e.detail?.text || '').trim(); const L = live.current;
      if (L.plan) { e.preventDefault(); if (YES.test(t)) { window.api.agent.approve(true, ''); setPlan(null); speak('Starting now.'); } else { window.api.agent.approve(false, t); setPlan(null); speak('Okay, revising the plan.'); } return; }
      if (L.running) { e.preventDefault(); if (/^(stop|cancel|ruk(o|jao)|bas)\b/i.test(t)) { window.api.agent.cancel(); speak('Stopping.'); } else { window.api.agent.tell(t); setEvents((x) => [...x, { type: 'you', text: t }]); speak('Noted.'); } return; }
      if (/^(start|go|begin|shuru|chalo|start the job)\b/i.test(t) && L.goal.trim().length >= 10) { e.preventDefault(); L.start(); speak('Starting the job.'); return; }
      if (!/^(open|go to|show|switch to|create|generate|make|draw)\b/i.test(t)) { e.preventDefault(); setGoal((g) => (g ? g + ' ' + t : t)); speak('Added. Say start when you are ready.'); }
    };
    void onVoice; // voice control removed
    return undefined;
  }, []);
  useEffect(() => { if (hasClaude === false) setBrain('local'); }, [hasClaude]);
  const brainUsed = mode === 'free' ? 'local' : brain;
  useEffect(() => {
    let ok = true;
    window.api.agent?.routes?.({ mode, allowDownloads: allowDl, brain: brainUsed }).then((r) => ok && setRoutes(r)).catch(() => ok && setRoutes(null));
    return () => { ok = false; };
  }, [mode, allowDl, brainUsed]);

  const kinds = (k) => models.filter((m) => m.kind === k);
  async function start() {
    setError(''); setEvents([]); setAssets([]); setResult(null); setPlan(null); setProgress(null);
    await job.start(async (jobId) => {
      try {
        const r = await window.api.agent.run({ jobId, goal: goal.trim(), brain: brainUsed, mode, allowDownloads: allowDl, images, videos, audio, reviewPlan: review });
        if (r && !r.cancelled) {
          setResult(r);
        }
      } catch (e) { const m = friendlyError(e); if (m && m !== 'cancelled') setError(m); }
    });
    setPlan(null); setProgress(null);
  }
  const decide = async (ok) => { await window.api.agent.approve(ok, feedback); setPlan(null); setFeedback(''); };
  const stop = async () => { await window.api.agent.cancel(); job.cancel && job.cancel(); };

  const shown = events.filter((e) => e.type !== 'thinking');
  const mediaAssets = assets.filter((a) => a.kind === 'image' || a.kind === 'video');

  return (
    <div className={compact ? 'agent-compact' : ''}>
      {!compact && <h1 style={{ marginBottom: 2 }}>🤖 Pandora Agent</h1>}
      <p className="sub" style={{ marginTop: 0 }}>Prefer chatting in Claude or ChatGPT? Connect them in <a style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => window.dispatchEvent(new CustomEvent('pandora:go', { detail: 'connect' }))}>Pandora Connect</a>. Tell it the job. It plans, writes, generates images and video, edits, colour-grades, builds the presentation and hands you a complete launch package — using the models you've connected.</p>

      <div className="two-col">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ margin: 0 }}>What should the agent make? <span className="sub" style={{ fontSize: 11 }}>— type or speak, in any language</span></label>
            {null}
          </div>
          <div className="row" style={{ margin: '6px 0' }}><MicButton onText={(t) => setGoal((g) => (g ? g + ' ' + t : t))} title="Tell the agent the job by voice" /></div>
          <textarea style={{ minHeight: 130 }} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Launch my clothing brand: brand bible, campaign images, promo video (script → shots → edit → colour), captions and a pitch deck." />
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {TEMPLATES.map(([t, g]) => <button key={t} className="chip mini" onClick={() => setGoal(g)}>{t}</button>)}
          </div>

          <label>How should it run?</label>
          <div className="ag-modes">
            {[['free', '🆓 Free', 'Open-source models on your PC — no API costs. Downloads free models on first use.'],
              ['hybrid', '⚖ Hybrid', 'Free local models first, cloud APIs only when your PC can\'t do a step.'],
              ['cloud', '☁ Cloud', 'Your API keys first (fastest, best quality), local models as backup.']].map(([id, t, d]) => (
              <button key={id} type="button" className={'ag-mode' + (mode === id ? ' on' : '')} onClick={() => setMode(id)}><b>{t}</b><small>{d}</small></button>
            ))}
          </div>
          <label className="row" style={{ gap: 8, cursor: 'pointer', marginTop: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={allowDl} onChange={(e) => setAllowDl(e.target.checked)} /><span>Allow downloading free models when needed (one time, several GB)</span></label>

          <label>Brain (plans & writes)</label>
          <div className="row">
            <button className={'chip' + (brainUsed === 'claude' ? ' on' : '')} disabled={hasClaude === false || mode === 'free'} onClick={() => setBrain('claude')}>Claude {hasClaude === false ? '(add key in Settings)' : mode === 'free' ? '(paid — off in Free mode)' : '· best'}</button>
            <button className={'chip' + (brainUsed === 'local' ? ' on' : '')} onClick={() => setBrain('local')}>Local model · free (Ollama / LM Studio)</button>
          </div>
          {brainUsed === 'local' && <p className="sub" style={{ fontSize: 11 }}>Install <b>Ollama</b> (ollama.com) and run <code>ollama pull qwen2.5</code> (or <code>qwen2.5:14b</code> on a strong PC). Claude plans and writes better, but this is completely free.</p>}

          <label>Each step will run with</label>
          <div className="ag-routes">
            {routes ? [['🖼 Images', routes.image], ['🎬 Video shots', routes.video], ['🎙 Voice-over', routes.voice]].map(([l, r]) => (
              <div key={l} className={'ag-route ' + (r.length ? 'ok' : 'no')}>
                <b>{l}</b>
                <span>{r.length ? r[0] : 'Not available — connect an API key or allow free downloads'}</span>
                {r.length > 1 && <small>fallback: {r.slice(1).join(' → ')}</small>}
              </div>
            )) : <span className="sub">Checking your PC…</span>}
            <div className="ag-route ok"><b>✂ Edit · 🎨 Colour · 📊 Slides · 📝 Docs</b><span>Built in · free</span></div>
            {routes?.gpu && <small className="sub">Detected GPU: {routes.gpu}{routes.vram ? ` · ${routes.vram} GB VRAM` : ''}</small>}
          </div>

          <label>{mode === 'free' ? 'Amount (local generation takes time)' : 'Budget (protects your API credits)'}</label>
          <div className="cinerow">
            <div><label>Max images: {images}</label><input type="range" min="0" max="20" value={images} onChange={(e) => setImages(+e.target.value)} /></div>
            <div><label>Max video shots: {videos}</label><input type="range" min="0" max="8" value={videos} onChange={(e) => setVideos(+e.target.value)} /></div>
            <div><label>Max voice-overs: {audio}</label><input type="range" min="0" max="3" value={audio} onChange={(e) => setAudio(+e.target.value)} /></div>
          </div>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={review} onChange={(e) => setReview(e.target.checked)} /><span>Show me the plan before it starts generating</span></label>

          <div className="row" style={{ marginTop: 14 }}>
            <RunButton job={job} label="🤖 Start the job" busyLabel={progress ? `${progress.stage} ${progress.pct ?? ''}%` : 'Working…'} onRun={start} disabled={goal.trim().length < 10 || (brainUsed === 'claude' && !hasClaude)} />
            {job.running && <button className="btn ghost" onClick={stop}>Stop</button>}
          </div>
          <ErrorBox error={error} />
        </div>

        <div className="card ag-right">
          {plan && (
            <div className="ag-plan">
              <h3 style={{ marginTop: 0 }}>🗺 The plan</h3>
              <ol>{plan.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
              <p className="sub" style={{ margin: '6px 0' }}><b>Deliverables:</b> {plan.deliverables.join(' · ')}</p>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input style={{ flex: 1 }} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Optional: changes you want (e.g. more vertical videos, add Urdu captions)" />
                <MicButton small onText={async (t) => {
                  if (YES.test(t.trim())) { await window.api.agent.approve(true, ''); setPlan(null); if (talkRef.current) speak('Starting now.'); }
                  else setFeedback((f) => (f ? f + ' ' + t : t));
                }} title='Say "yes" to approve, or say what to change' />
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => decide(true)}>✓ Approve & start</button>
                <button className="btn ghost" onClick={() => decide(false)} disabled={!feedback.trim()}>↻ Revise with my notes</button>
              </div>
            </div>
          )}

          {result && (
            <div className="ag-done">
              <h3 style={{ marginTop: 0 }}>🎉 Your launch package is ready</h3>
              <p className="sub">{result.summary}</p>
              {result.counts && <p className="sub" style={{ fontSize: 12 }}>{result.counts.images} images · {result.counts.videos} videos · {result.counts.decks} presentation · {result.counts.docs} documents{result.counts.audio ? ` · ${result.counts.audio} voice-over` : ''}</p>}
              <div className="row">
                <button className="btn" onClick={() => window.api.agent.open(result.index)}>Open package</button>
                <button className="btn ghost" onClick={() => window.api.agent.open(result.dir)}>Open folder</button>
              </div>
              {result.next_steps?.length > 0 && <ul className="sub">{result.next_steps.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            </div>
          )}

          {mediaAssets.length > 0 && (
            <div className="ag-assets">
              {mediaAssets.slice(-12).map((a, i) => <div key={i} className="ag-asset"><Media file={a.file} kind={a.kind} controls={a.kind === 'video'} /><span>{a.label}</span></div>)}
            </div>
          )}

          {job.running && !plan && (
            <div className="ag-talk">
              <MicButton small onText={(t) => { window.api.agent.tell(t); setEvents((e) => [...e, { type: 'you', text: t }]); }} title="Tell the agent something while it works" />
              <input placeholder="Say or type a note for the agent while it works (e.g. use warmer colours)…" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { window.api.agent.tell(e.target.value.trim()); setEvents((x) => [...x, { type: 'you', text: e.target.value.trim() }]); e.target.value = ''; } }} />
            </div>
          )}
          <div className="ag-log" ref={logRef}>
            {!shown.length && <p className="sub">The agent's progress appears here: plan, every tool it uses, and each file it creates.</p>}
            {shown.map((e, i) => (
              <div key={i} className={'ag-ev ag-' + e.type}>
                <span className="ag-i">{ICON[e.type] || '•'}</span>
                <span>
                  {e.type === 'tool' && <><b>{TOOL_LABEL[e.name] || e.name}</b>{e.input?.title || e.input?.purpose || e.input?.prompt ? <span className="sub"> — {String(e.input.title || e.input.purpose || e.input.prompt).slice(0, 120)}</span> : null}</>}
                  {e.type === 'say' && e.text}
                  {e.type === 'you' && <><b>You:</b> {e.text}</>}
                  {e.type === 'heard' && <span className="sub">{e.text}</span>}
                  {e.type === 'asset' && <>Created <b>{e.label}</b> <span className="sub">({e.kind})</span></>}
                  {e.type === 'plan' && <>Plan ready — {e.steps.length} steps</>}
                  {e.type === 'start' && <>Started · {e.models.length} models available</>}
                  {(e.type === 'warn' || e.type === 'error') && e.text}
                  {e.type === 'done' && <>Finished</>}
                  {e.type === 'cancelled' && <>Stopped</>}
                </span>
              </div>
            ))}
            {progress && job.running && <div className="mstat-bar" style={{ marginTop: 6 }}><i style={{ width: (progress.pct || 2) + '%' }} /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
