import React, { useEffect, useRef, useState } from 'react';
import { useJob, RunButton, ErrorBox, friendlyError } from '../lib/job.jsx';
import Media from '../lib/Media.jsx';

// Pandora Agent — describe the job, it plans, uses every tool in God's Pandora and delivers a launch package.
const TEMPLATES = [
  ['👗 Clothing brand launch', 'Launch my new streetwear clothing brand "NOIR LANE" for 18–30 year olds in Lahore and Dubai. Create a brand bible (name story, palette, tone), 5 campaign images (lookbook, lifestyle, product flat-lay, social posts), a 30-second promo video script, 3 cinematic video shots, an auto-edited and colour-graded promo video, Instagram/TikTok captions with hashtags, and a 10-slide investor & marketing presentation.'],
  ['📱 App launch kit', 'Launch my productivity app "FocusFlow". Create positioning & messaging, App Store description, 4 hero visuals and social graphics, a 20-second promo video (script, shots, edit, colour), launch-day social posts, a press release and a 10-slide pitch deck.'],
  ['🛍 Product ad pack', 'Create an ad campaign for my handmade skincare product "Rose & Clay". 6 product images (studio packshot, lifestyle, ingredients, model use), 3 short vertical video ads (9:16) with hooks, captions and CTAs, a voice-over script, and a short brand presentation.'],
  ['🍔 Restaurant opening', 'Promote the grand opening of my burger restaurant "Smash Theory". Menu hero images, a 15-second vertical teaser, opening-week social calendar, captions, flyer copy and a one-page brand board presentation.'],
  ['🎵 Music release', 'Create a release campaign for my new single "Midnight Static" (synthwave). Cover art, 3 promo visuals, a 15-second visualiser video, release announcement copy, a TikTok content plan and a press kit presentation.'],
];

const ICON = { start: '🚀', thinking: '…', say: '💬', tool: '🛠', plan: '🗺', asset: '✅', progress: '⏳', warn: '⚠', done: '🎉', error: '❌', cancelled: '⏹' };
const TOOL_LABEL = { propose_plan: 'Planning the production', write_document: 'Writing', generate_image: 'Generating image', generate_video: 'Generating video shot', generate_voiceover: 'Recording voice-over', auto_edit: 'Auto-editing the video', color_grade: 'Colour grading', make_presentation: 'Building the presentation', list_assets: 'Checking assets', finish: 'Packaging deliverables' };

export default function PandoraAgent() {
  const [goal, setGoal] = useState('');
  const [brain, setBrain] = useState('claude');
  const [hasClaude, setHasClaude] = useState(null);
  const [models, setModels] = useState([]);
  const [images, setImages] = useState(8);
  const [videos, setVideos] = useState(3);
  const [audio, setAudio] = useState(1);
  const [review, setReview] = useState(true);
  const [events, setEvents] = useState([]);
  const [plan, setPlan] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [assets, setAssets] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const job = useJob();
  const logRef = useRef(null);

  useEffect(() => {
    window.api.keysList?.().then((k) => setHasClaude(!!(k && k.anthropic))).catch(() => setHasClaude(false));
    window.api.agent?.models?.().then((m) => setModels(Array.isArray(m) ? m : [])).catch(() => {});
    const off = window.api.agent?.onEvent?.((ev) => {
      if (ev.type === 'progress') { setProgress(ev); return; }
      if (ev.type === 'plan') setPlan(ev);
      if (ev.type === 'asset') setAssets((a) => [...a, ev]);
      setEvents((e) => [...e.slice(-300), ev]);
    });
    return typeof off === 'function' ? off : undefined;
  }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [events]);
  useEffect(() => { if (hasClaude === false) setBrain('local'); }, [hasClaude]);

  const kinds = (k) => models.filter((m) => m.kind === k);
  async function start() {
    setError(''); setEvents([]); setAssets([]); setResult(null); setPlan(null); setProgress(null);
    await job.start(async (jobId) => {
      try {
        const r = await window.api.agent.run({ jobId, goal: goal.trim(), brain, images, videos, audio, reviewPlan: review });
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
    <div>
      <h1 style={{ marginBottom: 2 }}>🤖 Pandora Agent</h1>
      <p className="sub" style={{ marginTop: 0 }}>Tell it the job. It plans, writes, generates images and video, edits, colour-grades, builds the presentation and hands you a complete launch package — using the models you've connected.</p>

      <div className="two-col">
        <div className="card">
          <label>What should the agent make?</label>
          <textarea style={{ minHeight: 130 }} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Launch my clothing brand: brand bible, campaign images, promo video (script → shots → edit → colour), captions and a pitch deck." />
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {TEMPLATES.map(([t, g]) => <button key={t} className="chip mini" onClick={() => setGoal(g)}>{t}</button>)}
          </div>

          <label>Brain</label>
          <div className="row">
            <button className={'chip' + (brain === 'claude' ? ' on' : '')} disabled={hasClaude === false} onClick={() => setBrain('claude')}>Claude {hasClaude === false ? '(add key in Settings)' : '· best'}</button>
            <button className={'chip' + (brain === 'local' ? ' on' : '')} onClick={() => setBrain('local')}>Local model · free (Ollama / LM Studio)</button>
          </div>
          {brain === 'local' && <p className="sub" style={{ fontSize: 11 }}>Needs a tool-calling model, e.g. <code>ollama pull qwen2.5</code>. Claude plans and writes noticeably better.</p>}

          <label>What it can use right now</label>
          <div className="ag-caps">
            {[['image', '🖼 Images'], ['video', '🎬 Video'], ['audio', '🎙 Voice']].map(([k, l]) => (
              <span key={k} className={'ag-cap ' + (kinds(k).length ? 'ok' : 'no')} title={kinds(k).map((m) => m.name).join(', ') || 'Connect an API key in Settings or download a local model'}>
                {l}: {kinds(k).length ? kinds(k).length + ' model' + (kinds(k).length > 1 ? 's' : '') : 'not connected'}
              </span>
            ))}
            <span className="ag-cap ok">✂ Edit · 🎨 Colour · 📊 Slides · 📝 Docs: built in</span>
          </div>
          {!kinds('image').length && <p className="sub" style={{ fontSize: 11 }}>Connect an image provider (FAL, OpenAI, Google, Replicate…) in <a style={{ cursor: 'pointer', color: 'var(--accent)' }} onClick={() => window.dispatchEvent(new CustomEvent('pandora:go', { detail: 'settings' }))}>Settings</a> or download a local model so the agent can make visuals.</p>}

          <label>Budget (protects your API credits)</label>
          <div className="cinerow">
            <div><label>Max images: {images}</label><input type="range" min="0" max="20" value={images} onChange={(e) => setImages(+e.target.value)} /></div>
            <div><label>Max video shots: {videos}</label><input type="range" min="0" max="8" value={videos} onChange={(e) => setVideos(+e.target.value)} /></div>
            <div><label>Max voice-overs: {audio}</label><input type="range" min="0" max="3" value={audio} onChange={(e) => setAudio(+e.target.value)} /></div>
          </div>
          <label className="row" style={{ gap: 8, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={review} onChange={(e) => setReview(e.target.checked)} /><span>Show me the plan before it spends any credits</span></label>

          <div className="row" style={{ marginTop: 14 }}>
            <RunButton job={job} label="🤖 Start the job" busyLabel={progress ? `${progress.stage} ${progress.pct ?? ''}%` : 'Working…'} onRun={start} disabled={goal.trim().length < 10 || (brain === 'claude' && !hasClaude)} />
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
              <input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Optional: changes you want (e.g. more vertical videos, add Urdu captions)" />
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

          <div className="ag-log" ref={logRef}>
            {!shown.length && <p className="sub">The agent's progress appears here: plan, every tool it uses, and each file it creates.</p>}
            {shown.map((e, i) => (
              <div key={i} className={'ag-ev ag-' + e.type}>
                <span className="ag-i">{ICON[e.type] || '•'}</span>
                <span>
                  {e.type === 'tool' && <><b>{TOOL_LABEL[e.name] || e.name}</b>{e.input?.title || e.input?.purpose || e.input?.prompt ? <span className="sub"> — {String(e.input.title || e.input.purpose || e.input.prompt).slice(0, 120)}</span> : null}</>}
                  {e.type === 'say' && e.text}
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
