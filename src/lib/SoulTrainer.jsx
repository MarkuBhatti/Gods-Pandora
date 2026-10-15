import React, { useEffect, useState } from 'react';
import HardwareHint from './HardwareHint.jsx';
import { useJob, RunButton, friendlyError } from './job.jsx';

const LOCAL_BASES = [
  ['stabilityai/stable-diffusion-xl-base-1.0', 'SDXL (best quality · ~12–16 GB VRAM)', 14],
  ['stable-diffusion-v1-5/stable-diffusion-v1-5', 'SD 1.5 (lighter · ~8 GB VRAM)', 8],
];

// Identity Lock — train a persistent identity from a character's reference photos.
// Higgsfield: SOUL custom reference (custom_reference_id). FAL: FLUX LoRA (trigger word + LoRA file).
export default function SoulTrainer({ item, onSaved }) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState('fal');
  const [version, setVersion] = useState('v2');
  const [base, setBase] = useState(LOCAL_BASES[0][0]);
  const [steps, setSteps] = useState(800);
  const job = useJob();
  const busy = job.running;
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const refs = item.refs || [];
  const soul = item.soulId;

  useEffect(() => {
    if (!busy || !window.api.jutsu?.onProgress) return undefined;
    return window.api.jutsu.onProgress((p) => {
      if (p.tool !== 'soul') return;
      const label = p.total && p.done != null ? `${p.stage} ${p.done}/${p.total}${p.loss != null ? ' · loss ' + p.loss : ''}` : p.stage + (p.status ? ' · ' + String(p.status).toLowerCase() : '');
      setStatus(label);
    });
  }, [busy]);

  const train = async () => {
    setError(''); setStatus('starting…');
    await job.start(async (jobId) => {
    try {
      const r = await window.api.jutsu.trainSoul({ jobId, provider, name: item.name, files: refs, modelVersion: version, base, localSteps: steps });
      onSaved(r); setOpen(false); setStatus('');
    } catch (e) { const m = friendlyError(e); if (m) setError(m); }
    });
    setStatus('');
  };

  return (
    <div className="soul-box">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="sub" style={{ fontSize: 11 }}>
          🧬 Identity Lock: {soul ? <b style={{ color: '#00ff88' }}>trained · {soul.provider === 'fal' ? 'FLUX LoRA (FAL)' : soul.provider === 'local' ? 'local ' + (soul.xl ? 'SDXL' : 'SD 1.5') + ' LoRA' : 'Higgsfield SOUL ' + soul.modelVersion}</b> : 'not trained'}
        </span>
        <button className="btn ghost small" onClick={() => setOpen((v) => !v)}>{soul ? 'Retrain' : 'Train Identity Lock'}</button>
      </div>
      {open && (
        <div style={{ marginTop: 6 }}>
          <p className="sub" style={{ fontSize: 11 }}>
            Trains a reusable identity from this character's {refs.length} reference photo{refs.length === 1 ? '' : 's'}
            {refs.length < 10 ? ' — 10–20 varied photos (angles, expressions, lighting) give the best likeness.' : '.'}
            {' '}Then select this character (or type @{item.name.replace(/\s+/g, '_')}) with an “Identity Lock” model — or, for a local Identity Lock, the same local base model it was trained on.
          </p>
          <div className="row">
            <button className={'chip' + (provider === 'local' ? ' on' : '')} onClick={() => setProvider('local')}>💻 Local GPU (offline · free)</button>
            <button className={'chip' + (provider === 'fal' ? ' on' : '')} onClick={() => setProvider('fal')}>FLUX LoRA (FAL key · ~2–5 min)</button>
            <button className={'chip' + (provider === 'higgsfield' ? ' on' : '')} onClick={() => setProvider('higgsfield')}>Higgsfield SOUL (Higgsfield key)</button>
            {provider === 'higgsfield' && (
              <select style={{ width: 130 }} value={version} onChange={(e) => setVersion(e.target.value)}>
                <option value="v2">SOUL V2</option><option value="v1">SOUL</option><option value="cinema">SOUL Cinema</option>
              </select>
            )}
          </div>
          {provider === 'local' && (
            <>
              <div className="row" style={{ marginTop: 6 }}>
                <select style={{ flex: 2 }} value={base} onChange={(e) => setBase(e.target.value)}>{LOCAL_BASES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
                <select style={{ flex: 1 }} value={steps} onChange={(e) => setSteps(+e.target.value)}>{[400, 800, 1200, 1600].map((n) => <option key={n} value={n}>{n} steps</option>)}</select>
              </div>
              <HardwareHint needGb={LOCAL_BASES.find((b) => b[0] === base)[2]} label="local Identity Lock training" />
              <p className="sub" style={{ fontSize: 11, margin: 0 }}>Runs on your GPU (about 15–60 min). The base model downloads automatically the first time.</p>
            </>
          )}
          <div style={{ marginTop: 6 }}><RunButton small job={job} label="🧬 Train now" busyLabel={'Training… ' + status} onRun={train} disabled={refs.length < 1} /></div>
          {error && <div className="err" style={{ fontSize: 11 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}
