import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import Create from './pages/Create.jsx';
import FilmStudio from './pages/FilmStudio.jsx';
import PandoraCut from './pages/PandoraCut.jsx';
import PandoraColor from './pages/PandoraColor.jsx';
import PandoraAgent from './pages/PandoraAgent.jsx';
import PandoraConnect from './pages/PandoraConnect.jsx';
import PandoraPhoto from './pages/PandoraPhoto.jsx';
import Studio from './pages/Studio.jsx';
import Styles from './pages/Styles.jsx';
import Library from './pages/Library.jsx';
import Models from './pages/Models.jsx';
import EntityLibrary from './pages/EntityLibrary.jsx';
import Settings from './pages/Settings.jsx';
import Forge from './pages/Forge.jsx';
import NodeCanvas from './pages/NodeCanvas.jsx';
import AiMarket from './pages/AiMarket.jsx';
import Studio3D from './pages/Studio3D.jsx';
import StudioTD from './pages/StudioTD.jsx';
import Onboarding from './pages/Onboarding.jsx';
import EnginePrompt from './lib/EnginePrompt.jsx';
import SetupWizard from './pages/SetupWizard.jsx';
import InstallWelcome from './lib/InstallWelcome.jsx';
import Updates from './pages/Updates.jsx';
import MoodBackdrop from './lib/MoodBackdrop.jsx';
import PandoraBox from './lib/PandoraBox.jsx';
import { NavProvider } from './lib/nav.jsx';
import InfluencerBuilder from './pages/InfluencerBuilder.jsx';
import CommandPalette from './lib/CommandPalette.jsx';
import { JobsIndicator } from './lib/job.jsx';
import Shapeshift from './pages/Genjutsu.jsx';
import Market from './pages/Market.jsx';
import AdMultiplier from './pages/AdMultiplier.jsx';
import { StoreProvider } from './lib/store.jsx';
import Home from './pages/Home.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { NAV, ALL, TABS, Icon, Em, bg, pageBg, PAGEPOS } from './lib/ui.jsx';
import Viewer from './lib/Viewer.jsx';
import Pandy from './lib/Pandy.jsx';
// heavy tools load only when opened (keeps start-up fast and memory low)
const PandoraEdit = lazy(() => import('./pages/PandoraEdit.jsx'));
const PandoraMotion = lazy(() => import('./pages/PandoraMotion.jsx'));
const Effects = lazy(() => import('./pages/Effects.jsx'));
const CamRig = lazy(() => import('./pages/CamRig.jsx'));

// Tab banner (title with an italic accent, one line, cinematic background) shown above each tool page
function Banner({ page }) {
  const t = TABS[page]; const meta = ALL.find((x) => x.id === page);
  if (!t || !meta) return null;
  return (
    <section className="pg-banner">
      <div className="pg-banner-bg" style={{ backgroundImage: `url("${pageBg(page, t[2])}")`, backgroundPosition: PAGEPOS[page] || undefined }} />
      <div className="pg-eyebrow">{meta.g ? meta.g + ' · ' : ''}{meta.label}</div>
      <h1 className="pg-title"><Em text={t[0]} /></h1>
      <p className="pg-line">{t[1]}</p>
    </section>
  );
}
const NO_BANNER = new Set(['home', 'create', 'canvas', 'edit', 'fx']);

function Page({ page }) {
  return (
    <ErrorBoundary key={page} inline>
     <Suspense fallback={<div className="sub" style={{ padding: 40, textAlign: 'center' }}>Loading…</div>}>
      {page === 'home'        && <Home />}
      {page === 'edit'        && <PandoraEdit />}
      {page === 'motion'      && <PandoraMotion />}
      {page === 'fx'          && <Effects />}
      {page === 'camrig'      && <CamRig />}
      {page === 'create'      && <Create />}
      {page === 'film'        && <FilmStudio />}
      {page === 'cut'         && <PandoraCut />}
      {page === 'color'       && <PandoraColor />}
      {page === 'agent'       && <PandoraAgent />}
      {page === 'connect'     && <PandoraConnect />}
      {page === 'photo'       && <PandoraPhoto />}
      {page === 'fashion'     && <Studio studioId="fashion" />}
      {page === 'product'     && <Studio studioId="product" />}
      {page === 'apps'        && <Studio studioId="apps" />}
      {page === 'canvas'      && <NodeCanvas />}
      {page === 'marketing'   && <Studio studioId="marketing" />}
      {page === 'shorts'      && <Studio studioId="shorts" />}
      {page === 'explainer'   && <Studio studioId="explainer" />}
      {page === 'influencer'  && <Studio studioId="influencer" top={<InfluencerBuilder />} />}
      {page === 'voice'       && <Studio studioId="voice" />}
      {page === 'appbuild'    && <Studio studioId="appbuild" />}
      {page === 'designdocs'  && <Studio studioId="designdocs" />}
      {page === 'digiproduct' && <Studio studioId="digiproduct" />}
      {page === 'aimarket'    && <AiMarket />}
      {page === 'styles'      && <Styles />}
      {page === 'forge'       && <Forge />}
      {page === 'library'     && <Library />}
      {page === 'models'      && <Models />}
      {page === 'characters'  && (
        <EntityLibrary
          kind="characters"
          title="Pandora Characters"
          subtitle="Consistent identities. Save reference images once, reuse the same face everywhere."
        />
      )}
      {page === 'locations' && (
        <EntityLibrary
          kind="locations"
          title="Pandora Locations — Location Lock"
          subtitle="Save a virtual location once and keep it perfectly consistent across every image and video."
        />
      )}
      {page === 'products' && (
        <EntityLibrary
          kind="products"
          title="Pandora Products & Brand"
          subtitle="Save products, packaging and brand assets once — they stay identical in every ad, post and video."
        />
      )}
      {page === 'settings' && <Settings />}
      {page === 'genjutsu' && <Shapeshift />}
      {page === 'market'   && <Market />}
      {page === 'admulti'  && <AdMultiplier />}
      {page === 'update'   && <Updates />}
      {page === 'spatial'       && <Studio3D />}
      {page === 'touchdesigner' && <StudioTD />}
     </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  // Page history: Back / Forward like a browser (buttons, Alt+← / Alt+→, mouse back/forward buttons)
  const [hist, setHist] = useState({ stack: ['home'], i: 0 });
  const page = hist.stack[hist.i];
  const setPage = (p) => setHist((h) => {
    if (!p || h.stack[h.i] === p) return h;
    const stack = [...h.stack.slice(0, h.i + 1), p].slice(-50);
    return { stack, i: stack.length - 1 };
  });
  const canBack = hist.i > 0, canFwd = hist.i < hist.stack.length - 1;
  // one press of a mouse side-button can arrive twice (DOM mouseup + Windows app-command) → debounce
  const lastNav = useRef(0);
  const once = () => { const t = Date.now(); if (t - lastNav.current < 250) return false; lastNav.current = t; return true; };
  const back = () => once() && setHist((h) => (h.i > 0 ? { ...h, i: h.i - 1 } : h));
  const forward = () => once() && setHist((h) => (h.i < h.stack.length - 1 ? { ...h, i: h.i + 1 } : h));
  useEffect(() => {
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
    const onKey = (e) => {
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); }
      else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); forward(); }
      else if (e.altKey && (e.key === 'Home' || e.key === 'h') && !typing(e)) { e.preventDefault(); setPage('home'); }
    };
    const onMouse = (e) => { if (e.button === 3) { e.preventDefault(); back(); } if (e.button === 4) { e.preventDefault(); forward(); } };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    const off = window.api?.onNavHistory?.((dir) => (dir === 'back' ? back() : forward()));
    const onGo = (e) => e.detail && setPage(e.detail); // any component: window.dispatchEvent(new CustomEvent('pandora:go', { detail: 'settings' }))
    window.addEventListener('pandora:go', onGo);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mouseup', onMouse); window.removeEventListener('pandora:go', onGo); off && off(); };
  }, []);
  useEffect(() => { document.querySelector('.main')?.scrollTo?.(0, 0); }, [page]);
  const [upd, setUpd] = useState(null);
  useEffect(() => {
    if (!window.api?.updates) return undefined;
    return window.api.updates.onEvent((s) => setUpd(s));
  }, []);
  const updReady = upd && (upd.status === 'available' || upd.status === 'downloaded');

  // Performance mode: 'auto' turns Lite on for low-end PCs (≤4 CPU threads or ≤4 GB RAM) and laptops on battery.
  const [perf, setPerf] = useState(() => { try { return localStorage.getItem('pandora.perf') || 'auto'; } catch { return 'auto'; } });
  const [weak, setWeak] = useState(() => (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4);
  useEffect(() => {
    let bat = null; const upd8 = () => bat && setWeak((w) => w || (!bat.charging && bat.level < 0.3));
    navigator.getBattery?.().then((b) => { bat = b; upd8(); b.addEventListener('chargingchange', upd8); b.addEventListener('levelchange', upd8); }).catch(() => {});
  }, []);
  const lite = perf === 'on' || (perf === 'auto' && weak);
  useEffect(() => { document.body.classList.toggle('perf-lite', lite); }, [lite]);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('pandora.mode') || 'free'; } catch { return 'free'; } });
  const setModeAll = (m) => { setMode(m); try { localStorage.setItem('pandora.mode', m); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent('pandora:mode', { detail: m })); };
  // the tab banner already shows the title → hide the page's own first heading
  useEffect(() => { const h = document.querySelector('.page-in.has-banner .page-body h1'); if (h) h.classList.add('dup-title'); });
  const cyclePerf = () => {
    const next = perf === 'auto' ? 'on' : perf === 'on' ? 'off' : 'auto';
    setPerf(next); try { localStorage.setItem('pandora.perf', next); } catch { /* ignore */ }
  };

  return (
    <ErrorBoundary>
      <StoreProvider>
       <NavProvider setPage={setPage}>
        <SetupWizard />
        <InstallWelcome />
        <CommandPalette pages={ALL.map((x) => [x.id, x.label, '›'])} onGo={setPage} />
        <Onboarding />
        <EnginePrompt />
        <nav className="sidebar sb2">
          <div className="logo">
            <div className="side-box"><PandoraBox size={54} sparks={false} /></div>
            <div className="wordmark"><span><b>God's</b> <span className="eye">Pandora</span></span></div>
            <div className="tagline">Every model · Every medium</div>
          </div>
          <button className="sb-search" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}><Icon name="search" /><span>Search tools</span><kbd>Ctrl K</kbd></button>
          <div className="navscroll">
            {NAV.map(([g, items]) => (
              <div key={g || 'top'} className="sb-grp">
                {g && <div className="sb-h">{g}</div>}
                {items.map(([id, label, icon, c, badge]) => (
                  <button key={id} title={label} className={'sb-item' + (page === id ? ' on' : '')} onClick={() => setPage(id)}>
                    <span className="sb-ic" style={{ '--c': c }}><Icon name={icon} /></span><span className="sb-l">{label}</span>
                    {badge && <span className={'sb-badge ' + badge}>{badge === 'free' ? 'FREE' : 'NEW'}</span>}
                    {id === 'update' && updReady && <span className="upd-dot" title="Update available" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="sb-foot">
            <button className={'perf-pill' + (lite ? ' on' : '')} onClick={cyclePerf} title="Lite mode freezes the animated backgrounds and blur so the app stays fast on any PC. Auto = on for low-end PCs and low battery.">⚡ Lite · {perf === 'auto' ? 'Auto' : perf === 'on' ? 'On' : 'Off'}</button>
          </div>
        </nav>
        <div className="wrap">
          <header className="topbar tb2">
            <span className="histnav">
              <button className="tb-btn" disabled={!canBack} onClick={back} title="Back (Alt+←)"><Icon name="left" /></button>
              <button className="tb-btn" disabled={!canFwd} onClick={forward} title="Forward (Alt+→)"><Icon name="right" /></button>
            </span>
            <span className="tb-crumb">{(() => { const m = ALL.find((x) => x.id === page); return page === 'home' || !m ? <b>Home</b> : <>{m.g} <i>/</i> <b>{m.label}</b></>; })()}</span>
            <span className="tb-gap" />
            <div className="tb-seg" title="Default for the Agent and new jobs: Free = only open-source models on this PC">
              {[['free', 'Free · local'], ['hybrid', 'Hybrid'], ['cloud', 'Cloud']].map(([m, l]) => (
                <button key={m} className={(mode === m ? 'on ' : '') + m} onClick={() => setModeAll(m)}>{l}</button>
              ))}
            </div>
            {updReady && <button className="upd-pill" onClick={() => setPage('update')}>⬆ v{upd.info?.version} {upd.status === 'downloaded' ? 'ready' : 'available'}</button>}
            <JobsIndicator />
          </header>
          <div className="stage">
            <MoodBackdrop scene={page} />
            <main className="main">
              <div className={'page-in' + (NO_BANNER.has(page) ? '' : ' has-banner')} key={page}>
                {!NO_BANNER.has(page) && <Banner page={page} />}
                <div className="page-body"><Page page={page} /></div>
              </div>
            </main>
          </div>
        </div>
        <Pandy page={page} go={setPage} />
        <Viewer />
       </NavProvider>
      </StoreProvider>
    </ErrorBoundary>
  );
}
