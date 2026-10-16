import React, { useEffect, useState } from 'react';
import PandoraBox from './PandoraBox.jsx';

// Shown once, right after the installer opens the app: the "finish page" of the installer, but big,
// rounded and alive like the rest of God's Pandora. Options apply instantly.
function Toggle({ on, onChange, title, sub }) {
  return (
    <button type="button" className={'iw-row' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <span className="iw-txt"><b>{title}</b><small>{sub}</small></span>
      <span className="iw-switch"><i /></span>
    </button>
  );
}

export default function InstallWelcome() {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    window.api?.installInfo?.().then((i) => {
      if (!i || !i.justInstalled) return;
      if (sessionStorage.getItem('pandora.iw') === i.version) return;
      setInfo(i); setOpen(true);
    }).catch(() => {});
  }, []);
  if (!open || !info) return null;
  const set = (k, v) => {
    setInfo((x) => ({ ...x, [k]: v }));
    if (k === 'desktopShortcut') window.api.desktopShortcut(v).catch(() => {});
    if (k === 'openAtLogin') window.api.setLoginItem(v).catch(() => {});
  };
  const close = () => { try { sessionStorage.setItem('pandora.iw', info.version); } catch { /* ignore */ } setOpen(false); };
  return (
    <div className="iw-scrim" onClick={close}>
      <div className="iw-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="God's Pandora installed">
        <div className="iw-art"><PandoraBox size={150} /></div>
        <div className="iw-body">
          <div className="iw-badge">✓ Installed · v{info.version}</div>
          <h2>Welcome to <span>God's Pandora</span></h2>
          <p>Every model. Every medium. One creative universe. Everything is set up — pick a couple of options and start creating.</p>
          <div className="iw-rows">
            <Toggle on={info.desktopShortcut} onChange={(v) => set('desktopShortcut', v)} title="Desktop shortcut" sub="An icon on your desktop" />
            <Toggle on={info.openAtLogin} onChange={(v) => set('openAtLogin', v)} title="Start when I sign in" sub="Open God's Pandora with Windows" />
          </div>
          <div className="iw-actions">
            <button type="button" className="btn iw-go" onClick={close}>Start creating ✦</button>
          </div>
        </div>
      </div>
    </div>
  );
}
