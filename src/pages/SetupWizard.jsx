import PandoraBox from '../lib/PandoraBox.jsx';
import React, { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';

// First-run setup wizard — detects hardware, recommends models, saves keys, offers downloads
// Shows automatically on first launch until dismissed or completed.
export default function SetupWizard() {
  const { db, update, loaded } = useStore();
  const [step, setStep] = useState(0);        // 0=welcome 1=detect 2=models 3=keys 4=done
  const [sysInfo, setSysInfo] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [keys, setKeys] = useState({ fal: '', replicate: '', anthropic: '' });
  const [savingKeys, setSavingKeys] = useState(false);
  const [downloading, setDownloading] = useState('');
  const [dlStatus, setDlStatus] = useState('');
  const [selectedModels, setSelectedModels] = useState([]);

  // Only show if not already set up AND store loaded
  if (!loaded || db.settings?.setupDone) return null;

  const finish = () => update((d) => { d.settings = { ...d.settings, setupDone: true, onboarded: true }; return d; });

  async function detect() {
    setDetecting(true);
    try {
      const info = await window.api.systemInfo();
      if (!info || !Array.isArray(info.recommendations)) throw new Error('No hardware info');
      setSysInfo(info);
      setStep(2);
    } catch (e) {
      console.error('system:info failed', e);
      // Fall back gracefully — show generic mid-tier recs
      setSysInfo({ platformLabel: 'Unknown', totalRam: 16, cpu: 'Unknown', tier: 'mid',
        recommendations: [
          { name: 'SDXL Base 1.0', repo: 'stabilityai/stable-diffusion-xl-base-1.0', size: '~7 GB', note: 'Best balance of quality and speed' },
          { name: 'SDXL Lightning', repo: 'ByteDance/SDXL-Lightning', size: '~7 GB', note: '4-step SDXL-quality generation' },
          { name: 'Realistic Vision v5', repo: 'SG161222/Realistic_Vision_V5.1_noVAE', size: '~4 GB', note: 'Stunning photorealistic images' },
        ]
      });
      setStep(2);
    }
    setDetecting(false);
  }

  async function downloadModel(repo, name) {
    setDownloading(repo);
    setDlStatus('Installing local engine…');
    try {
      const inst = await window.api.engine.install();
      if (!inst.ok) { setDlStatus('⚠ Engine install failed: ' + inst.error); setDownloading(''); return; }
      setDlStatus('Downloading ' + name + '… (this may take several minutes)');
      const dl = await window.api.engine.downloadModel(repo);
      if (dl.ok) {
        setDlStatus('✓ ' + name + ' downloaded successfully!');
        setSelectedModels((prev) => [...prev, repo]);
      } else {
        setDlStatus('⚠ Download failed: ' + dl.error);
      }
    } catch (e) {
      setDlStatus('⚠ ' + (e.message || String(e)));
    }
    setDownloading('');
  }

  async function saveKeys() {
    setSavingKeys(true);
    for (const [k, v] of Object.entries(keys)) {
      if (v.trim()) await window.api.keysSet(k, v.trim());
    }
    setSavingKeys(false);
    setStep(4);
  }

  const tierColor = { low: '#e67e22', mid: '#2ecc71', high: '#8b6bff' }[sysInfo?.tier] || '#8b6bff';
  const tierLabel = { low: 'Entry', mid: 'Mid', high: 'High-end' }[sysInfo?.tier] || 'Mid';

  return (
    <div className="modal-bg">
      <div className="card modal" style={{ width: 680, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', padding: 32 }}>

        {/* Progress dots */}
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginBottom: 28 }}>
          {[0,1,2,3,4].map((s) => (
            <div key={s} style={{
              width: s === step ? 22 : 8, height: 8, borderRadius: 4,
              background: s <= step ? 'var(--accent)' : 'rgba(139,107,255,.18)',
              transition: 'all .3s',
            }} />
          ))}
        </div>

        {/* ── Step 0: Welcome ── */}
        {step === 0 && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'center', margin: '-10px 0 0' }}><PandoraBox size={74} /></div>
              <div className="wordmark" style={{ fontSize: 26 }}><b>GOD'S</b> <span className="eye">PANDORA</span></div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Every model. Every medium. One creative universe.</div>
            </div>
            <p style={{ textAlign: 'center', fontSize: 14, lineHeight: 1.7, color: 'var(--text)', marginBottom: 24 }}>
              Welcome. This wizard will detect your hardware, recommend the best open-source AI models for your machine, and connect your API keys — so you can start creating in minutes.
            </p>
            <div style={{ background: 'rgba(139,107,255,.05)', border: '1px solid rgba(139,107,255,.15)', borderRadius: 10, padding: 16, marginBottom: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>What this wizard does</div>
              {[
                ['🖥', 'Detects your OS, RAM, and CPU to find what runs best on your machine'],
                ['⬇', 'Recommends and optionally downloads open-source models (free, offline, no limits)'],
                ['🔑', 'Connects cloud API keys for FAL.ai, Replicate, and Anthropic (optional, pay per use)'],
              ].map(([icon, text]) => (
                <div key={icon} className="row" style={{ gap: 10, marginBottom: 8, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                  <span style={{ fontSize: 18, lineHeight: 1.2 }}>{icon}</span>
                  <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, flex: 1 }}>{text}</span>
                </div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 12 }}>
              <button className="btn" style={{ minWidth: 180 }} onClick={() => { setStep(1); detect(); }}>
                Let's set up God's Pandora
              </button>
              <button className="btn ghost small" onClick={finish}>Skip — I'll do it later</button>
            </div>
          </>
        )}

        {/* ── Step 1: Detecting ── */}
        {step === 1 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 16, animation: 'spin 1.2s linear infinite', display: 'inline-block' }}>⬡</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>Scanning your hardware…</div>
            <p className="sub" style={{ marginTop: 8 }}>Detecting OS, RAM, CPU, and recommending the best models for your machine.</p>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ── Step 2: Model Recommendations ── */}
        {step === 2 && sysInfo && (
          <>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>Your Hardware</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
              {[
                ['OS', sysInfo.platformLabel],
                ['RAM', sysInfo.totalRam + ' GB'],
                ['Tier', <span style={{ color: tierColor, fontWeight: 800 }}>{tierLabel}</span>],
              ].map(([label, val]) => (
                <div key={label} style={{ background: 'rgba(139,107,255,.06)', border: '1px solid rgba(139,107,255,.15)', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{val}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4, lineHeight: 1.5 }}>
              CPU: {sysInfo.cpu}
            </p>

            <h3 style={{ marginBottom: 10 }}>Recommended Open-Source Models for Your Machine</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 14, lineHeight: 1.6, opacity: .8 }}>
              These models run fully offline on your machine — free, unlimited, private. Download takes a few minutes depending on your connection.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
              {(sysInfo.recommendations || []).map((m) => {
                const done = selectedModels.includes(m.repo);
                const busy = downloading === m.repo;
                return (
                  <div key={m.repo} style={{ background: 'rgba(139,107,255,.04)', border: done ? '1px solid rgba(139,107,255,.45)' : '1px solid rgba(139,107,255,.12)', borderRadius: 8, padding: '12px 14px' }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: done ? 'var(--accent)' : 'var(--text)', marginBottom: 3 }}>
                          {done ? '✓ ' : ''}{m.name}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 3 }}>{m.note}</div>
                        <span className="badge">{m.size}</span>
                      </div>
                      <button
                        className={'btn small' + (done ? ' ghost' : '')}
                        style={{ marginLeft: 12, flexShrink: 0 }}
                        disabled={busy || done}
                        onClick={() => downloadModel(m.repo, m.name)}
                      >
                        {busy ? 'Downloading…' : done ? '✓ Done' : '⬇ Download'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {dlStatus && (
              <div style={{ fontSize: 12, color: dlStatus.startsWith('⚠') ? 'var(--danger)' : 'var(--accent)', marginBottom: 14, padding: '8px 12px', background: 'rgba(139,107,255,.05)', borderRadius: 6 }}>
                {dlStatus}
              </div>
            )}
            <div className="row" style={{ gap: 10 }}>
              <button className="btn" onClick={() => setStep(3)}>
                {selectedModels.length > 0 ? 'Next — Connect API Keys' : 'Skip downloads — Next'}
              </button>
              <button className="btn ghost small" onClick={finish}>Skip setup</button>
            </div>
          </>
        )}

        {/* ── Step 3: API Keys ── */}
        {step === 3 && (
          <>
            <h3 style={{ marginTop: 0 }}>Connect API Keys (Optional)</h3>
            <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65, marginBottom: 20, opacity: .85 }}>
              Cloud API keys unlock the most powerful models — Flux Pro, Kling video, Seedance, WAN, and thousands more on Replicate. You pay providers directly at pennies per image. Keys are stored encrypted on your machine only and never shared.
            </p>
            {[
              { id: 'fal', label: 'FAL.ai', hint: 'Flux, Kling, Seedance, WAN, Nano Banana + audio models', url: 'https://fal.ai/dashboard/keys', icon: '⚡' },
              { id: 'replicate', label: 'Replicate', hint: 'Thousands of open and closed AI models', url: 'https://replicate.com/account/api-tokens', icon: '♻' },
              { id: 'anthropic', label: 'Anthropic', hint: 'Powers App Forge, AI scripting, and Guide Book AI features', url: 'https://console.anthropic.com/account/keys', icon: '🧠' },
            ].map(({ id, label, hint, url, icon }) => (
              <div key={id} style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                  <span style={{ fontSize: 16 }}>{icon}</span>
                  <strong style={{ fontSize: 13, color: 'var(--text)' }}>{label}</strong>
                  <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, color: 'var(--accent)', marginLeft: 4, textDecoration: 'none', opacity: .8 }}>
                    Get key →
                  </a>
                </label>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>{hint}</div>
                <input
                  type="password"
                  placeholder="Paste API key or leave empty to skip"
                  value={keys[id]}
                  onChange={(e) => setKeys((x) => ({ ...x, [id]: e.target.value }))}
                />
              </div>
            ))}
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: '12px 0 20px', lineHeight: 1.55 }}>
              Keys are encrypted with your OS keychain and never leave your machine except to call the provider. You can add or change keys anytime in Settings → API Keys.
            </p>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn" disabled={savingKeys} onClick={saveKeys}>
                {savingKeys ? 'Saving…' : 'Save keys & finish'}
              </button>
              <button className="btn ghost small" onClick={() => setStep(4)}>Skip — I'll add keys later</button>
            </div>
          </>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><PandoraBox size={64} /></div>
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Orbitron, sans-serif', letterSpacing: 3, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 8 }}>
              You're Ready
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text)', marginBottom: 24, maxWidth: 480, margin: '0 auto 28px' }}>
              God's Pandora is set up and ready. Start creating in the <strong style={{ color: 'var(--accent)' }}>Create</strong> tab, build a film sequence in <strong style={{ color: 'var(--accent)' }}>Film Studio</strong>, or explore any section — every one has a <strong>📖 Guide Book</strong> to help you get the most out of it.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 28 }}>
              {['✦ Create', '🎬 Film', '✂ Fashion', '📣 Marketing', '📱 Shorts', '⬡ TouchDesigner'].map((s) => (
                <span key={s} className="chip on" style={{ fontSize: 12 }}>{s}</span>
              ))}
            </div>
            <button className="btn" style={{ minWidth: 200, fontSize: 15 }} onClick={finish}>
              Open God's Pandora
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
