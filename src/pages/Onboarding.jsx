import React, { useState } from 'react';
import { useDownloads, fmtBytes } from '../lib/downloads.jsx';
import { useStore } from '../lib/store.jsx';

// First-run wizard: asks once, then auto-installs the open-source engine + starter model
// and connects your API keys.
export default function Onboarding() {
  const { db, update, loaded } = useStore();
  const [step, setStep] = useState(0);
  const [keys, setKeys] = useState({ fal: '', replicate: '', anthropic: '' });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const dl = useDownloads()['stable-diffusion-v1-5/stable-diffusion-v1-5'];
  if (!loaded || db.settings?.onboarded || !db.settings?.setupDone) return null; // the Setup Wizard runs first
  const finish = () => update((d) => { d.settings.onboarded = true; return d; });

  async function saveKeys() {
    for (const [k, v] of Object.entries(keys)) if (v.trim()) await window.api.keysSet(k, v.trim());
    setStep(2);
  }

  async function setupLocal() {
    setBusy(true);
    const st = await window.api.engine.status().catch(() => ({}));
    if (!st.installed) {
      setStatus('Installing local engine (Python venv + PyTorch + diffusers)… this can take several minutes.');
      const inst = await window.api.engine.install();
      if (!inst.ok) { setStatus('⚠ ' + inst.error + ' — you can retry later from Pandora Core & Cloud.'); setBusy(false); return; }
    }
    setStatus('Downloading the starter open-source model (SD 1.5, about 2 GB)…');
    const dl = await window.api.engine.downloadModel('stable-diffusion-v1-5/stable-diffusion-v1-5');
    setStatus(dl.ok ? '✓ Local engine ready. Starting it…' : '⚠ ' + dl.error);
    if (dl.ok) await window.api.engine.start();
    setBusy(false);
    setStep(3);
  }

  return (
    <div className="modal-bg">
      <div className="card modal">
        <div className="wordmark" style={{ fontSize: 30 }}><b>GOD'S</b> <span className="eye">PANDORA</span></div>
        <div className="tagline" style={{ marginBottom: 16 }}>first-run setup — every model · every medium · one creative universe</div>

        {busy && dl?.total > 0 && (
          <div className="dl-progress" style={{ margin: '8px 0' }}><div className="bar"><div style={{ width: Math.min(100, Math.floor(dl.bytes / dl.total * 100)) + '%' }} /></div>
            <span className="sub" style={{ fontSize: 11 }}>{Math.min(100, Math.floor(dl.bytes / dl.total * 100))}% · {fmtBytes(dl.bytes)} / {fmtBytes(dl.total)}</span></div>
        )}
        {step === 0 && (<>
          <p>God's Pandora can set itself up automatically. It will (with your permission):</p>
          <p className="sub" style={{ margin: '10px 0' }}>1 — Connect your API keys for cloud models (you pay providers directly).<br />2 — Install the local open-source engine and download a starter model so you can also generate fully offline, free.</p>
          <div className="row">
            <button className="btn" onClick={() => setStep(1)}>Set me up</button>
            <button className="btn ghost" onClick={finish}>Skip — I'll do it later</button>
          </div>
        </>)}

        {step === 1 && (<>
          <h3 style={{ marginTop: 0 }}>Step 1 · Connect API keys (all optional)</h3>
          {[['fal', 'FAL.ai — one key unlocks Flux, Kling, Seedance, Nano Banana + audio'], ['replicate', 'Replicate — thousands of open & closed models'], ['anthropic', 'Anthropic — powers ⚒ App Forge & AI features']].map(([k, hint]) => (
            <div key={k}>
              <label>{hint}</label>
              <input type="password" placeholder="Paste key or leave empty" value={keys[k]} onChange={(e) => setKeys((x) => ({ ...x, [k]: e.target.value }))} />
            </div>
          ))}
          <p className="sub" style={{ margin: '8px 0' }}>Keys are encrypted with your OS keychain and never leave this machine except to call the provider. More providers in Settings.</p>
          <div className="row"><button className="btn" onClick={saveKeys}>Save & continue</button><button className="btn ghost" onClick={() => setStep(2)}>Skip</button></div>
        </>)}

        {step === 2 && (<>
          <h3 style={{ marginTop: 0 }}>Step 2 · Local open-source engine</h3>
          <p className="sub">Installs a private Python environment and downloads Stable Diffusion 1.5 into app storage (~4 GB) so you can generate offline at zero cost. Needs Python 3.10+ and disk space; a GPU or Apple Silicon makes it fast.</p>
          {status && <p className="sub" style={{ color: 'var(--text)' }}>{status}</p>}
          <div className="row">
            <button className="btn" disabled={busy} onClick={setupLocal}>{busy ? 'Working…' : 'Install automatically'}</button>
            <button className="btn ghost" disabled={busy} onClick={() => setStep(3)}>Skip</button>
          </div>
        </>)}

        {step === 3 && (<>
          <h3 style={{ marginTop: 0 }}>You're set.</h3>
          <p className="sub">{status || ''} Everything can be changed later in Settings and Models. Welcome to God's Pandora.</p>
          <button className="btn" onClick={finish}>Enter the studio</button>
        </>)}
      </div>
    </div>
  );
}
