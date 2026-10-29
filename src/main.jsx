import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './redesign.css';

// Safety net: a stray error in a background promise or event handler is logged, never fatal.
window.addEventListener('unhandledrejection', (e) => { console.error('[God\'s Pandora] unhandled promise:', e.reason); e.preventDefault(); });
window.addEventListener('error', (e) => { console.error('[God\'s Pandora] error:', e.error || e.message); });
// If saved settings ever get too big for storage, drop only the oversized UI caches instead of failing every save.
try { const used = Object.keys(localStorage).reduce((n, k) => n + (localStorage.getItem(k) || '').length, 0); if (used > 4.5e6) for (const k of Object.keys(localStorage)) if (/^ge\.(edit\.pool|motion\.scenes)$/.test(k)) localStorage.removeItem(k); } catch (_) { /* storage unavailable */ }

createRoot(document.getElementById('root')).render(<App />);
