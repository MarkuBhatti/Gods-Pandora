import React, { useEffect, useRef, useState } from 'react';
import Create from './pages/Create.jsx';
import FilmStudio from './pages/FilmStudio.jsx';
import PandoraCut from './pages/PandoraCut.jsx';
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

const TOPNAV = [
  ['create',     'Pandora Studio',      '✦'],
  ['canvas',     'Pandora Node Canvas', '⚛'],
  ['film',       'Pandora Film',        '🎬'],
  ['cut',        'Pandora Cut',         '🎞'],
  ['fashion',    'Pandora Fashion',     '✂'],
  ['product',    'Pandora Product',     '◍'],
  ['marketing',  'Pandora Marketing',   '📣'],
  ['admulti',    'Pandora Ad Multiplier','📈'],
  ['genjutsu',   'Pandora Shapeshift',    '🌀'],
  ['shorts',     'Pandora Shorts',      '📱'],
  ['explainer',  'Pandora Explainer',   '🎓'],
  ['influencer', 'Pandora Influencer',  '🌟'],
  ['voice',      'Pandora Voice',       '🎙'],
  ['apps',       'Pandora Apps',        '⊞'],
  ['appbuild',   'Pandora App Building','🛠'],
  ['designdocs', 'Pandora Design Docs', '📐'],
  ['digiproduct','Pandora Digital Products',    '📦'],
  ['forge',      'Pandora Forge',       '⚒'],
  ['spatial',    'Pandora 3D & Spatial','🧊'],
  ['touchdesigner', 'Pandora TouchDesigner', '⬡'],
];

const SIDENAV = [
  ['home',       'Pandora Home',         '⌂'],
  ['— MARKET —'],
  ['aimarket',   'Pandora AI Market',    '🌐'],
  ['— WORLD —'],
  ['styles',     'Pandora Styles','❖'],
  ['characters', 'Pandora Characters',   '☺'],
  ['locations',  'Pandora Locations',    '⌖'],
  ['products',   'Pandora Products & Brand', '📦'],
  ['— SYSTEM —'],
  ['library',    'Pandora Gallery',      '▦'],
  ['market',     'Pandora Models', '🛒'],
  ['models',     'Pandora Core & Cloud',       '⬢'],
  ['update',     'Pandora Update',       '⬆'],
  ['settings',   'Pandora Cloud & Settings',     '⚙'],
];

// "Pandora Film" → small PANDORA tag + "Film" so the long names stay compact in the bars
// every tab gets its own colour for its app-icon squircle
const HUE = Object.fromEntries([...TOPNAV, ...SIDENAV.filter((x) => x[1])].map(([id], i) => [id, (i * 47 + 200) % 360]));

function NavLabel({ label }) {
  if (!label.startsWith('Pandora ')) return label;
  return <span className="nl"><span className="pfx">Pandora</span><span>{label.slice(8)}</span></span>;
}

function Page({ page }) {
  return (
    <ErrorBoundary key={page}>
      {page === 'home'        && <Home />}
      {page === 'create'      && <Create />}
      {page === 'film'        && <FilmStudio />}
      {page === 'cut'         && <PandoraCut />}
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
        <CommandPalette pages={[...TOPNAV, ...SIDENAV.filter((x) => x[1])]} onGo={setPage} />
        <Onboarding />
        <nav className="sidebar">
          <div className="logo">
            <div className="side-box"><PandoraBox size={54} sparks={false} /></div>
            <div className="wordmark"><span><b>GOD'S</b> <span className="eye">PANDORA</span></span></div>
            <div className="tagline">Every model. Every medium. One creative universe.</div>
          </div>
          <div className="navscroll">
            {SIDENAV.map(([id, label, icon]) =>
              label === undefined
                ? <div key={id} className="navhead">{id.replace(/—/g, '').trim()}</div>
                : (
                  <button
                    key={id}
                    className={'navbtn' + (page === id ? ' active' : '')} style={{ '--h': HUE[id] }}
                    onClick={() => setPage(id)}
                  >
                    <span>{icon}</span> <NavLabel label={label} />
                    {id === 'update' && updReady && <span className="upd-dot" title="Update available" />}
                  </button>
                )
            )}
          </div>
          {updReady && (
            <button className="upd-pill" onClick={() => setPage('update')}>
              ⬆ v{upd.info?.version} {upd.status === 'downloaded' ? 'ready — restart' : 'available'}
            </button>
          )}
          <JobsIndicator />
          <div className="side-foot">
            <button className={"perf-pill" + (lite ? " on" : "")} onClick={cyclePerf} title="Lite mode freezes the animated backgrounds and blur so the app stays fast on any PC. Auto = on for low-end PCs and low battery.">
              ⚡ Lite · {perf === 'auto' ? 'Auto' : perf === 'on' ? 'On' : 'Off'}
            </button>
            <button className="mode-pill kbd-hint" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))} title="Quick jump (Ctrl K)">⌕ Jump <kbd>Ctrl K</kbd></button>
          </div>
        </nav>
        <div className="wrap">
          <header className="topbar">
            <span className="histnav">
              <button className="navbtn hist" disabled={!canBack} onClick={back} title="Back (Alt+←)">←</button>
              <button className="navbtn hist" disabled={!canFwd} onClick={forward} title="Forward (Alt+→)">→</button>
              <button className={'navbtn hist' + (page === 'home' ? ' active' : '')} onClick={() => setPage('home')} title="Home (Alt+H)">⌂</button>
            </span>
            {TOPNAV.map(([id, label, icon]) => (
              <button
                key={id}
                className={'navbtn' + (page === id ? ' active' : '')} style={{ '--h': HUE[id] }}
                onClick={() => setPage(id)}
              >
                <span>{icon}</span> <NavLabel label={label} />
              </button>
            ))}
          </header>
          <div className="stage">
            <MoodBackdrop scene={page} />
            <main className="main">
              <div className="page-in" key={page}><Page page={page} /></div>
            </main>
          </div>
        </div>
       </NavProvider>
      </StoreProvider>
    </ErrorBoundary>
  );
}
