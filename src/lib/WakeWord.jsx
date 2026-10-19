import React, { useEffect, useRef, useState } from 'react';
import { useNav } from './nav.jsx';
import { speak, voicePrefs } from './Voice.jsx';
import { parse as parseCommand } from './voiceIntent.js';

let recentFile = null; // last image/video made by voice → "grade it warm"

// "Hey Pandora" — hands-free voice control (like "Hey Siri" / "OK Google").
// Privacy: listening only happens while the toggle is on, a light shows it, and speech is recognised
// on this PC by free local Whisper (never sent to the cloud for wake-word detection).
// A tiny voice-activity detector only wakes Whisper when someone speaks, so idle CPU use stays near zero.


// Whisper often mishears a name ("Hey, Pandora's", "Hey Bandura", "Hey Pan Dora", "Pandorra").
// Fuzzy match: within the first few words, find a word (or two joined words) close to "pandora".
const GREET = new Set(['hey', 'hi', 'hay', 'hai', 'he', 'hei', 'a', 'okay', 'ok', 'ay', 'ae', 'ei', 'eh', 'yo', 'hello', 'oh', 'o', 'and', 'so', 'ہے', 'ہائے', 'ہیلو', 'हे', 'हाय', '嘿', 'ねえ', '헤이', 'эй']);
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const norm = (w) => w.toLowerCase().replace(/[’']s$/, '').replace(/[^\p{L}\p{N}]/gu, '');
function nameLike(w, greeted) {
  if (!w) return false;
  if (/^(?:pandora|پنڈورا|پینڈورا|پانڈورا|पंडोरा|पेंडोरा|पैंडोरा|潘多拉|パンドラ|판도라|пандора)$/.test(w)) return true;
  if (!/^[pbf]/.test(w) || w.length < 5 || w.length > 10) return false;
  const dist = lev(w, 'pandora');
  return dist <= 1 || (dist === 2 && greeted);
}
export function matchWake(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  let greeted = false;
  for (let i = 0; i < Math.min(words.length, 4); i++) {
    const w = norm(words[i]);
    for (const [cand, used] of [[w, 1], [w + norm(words[i + 1] || ''), 2]]) {
      if (nameLike(cand, greeted)) return { rest: words.slice(i + used).join(' ').replace(/^[\s,.!?:;-]+/, '').trim() };
    }
    if (w && !GREET.has(w)) return null; // the name has to open the sentence
    if (w) greeted = true;
  }
  return null;
}

const PAGES = [
  [/studio|create|image|picture/, 'create'], [/agent/, 'agent'], [/film/, 'film'], [/auto ?edit|edit|cut/, 'cut'], [/colou?r|grad/, 'color'],
  [/photo|retouch/, 'photo'], [/fashion/, 'fashion'], [/product/, 'product'], [/marketing/, 'marketing'], [/gallery|library/, 'library'],
  [/models?|market/, 'market'], [/setting|key/, 'settings'], [/connect/, 'connect'], [/home/, 'home'], [/3d|spatial/, 'spatial'],
  [/touch ?designer/, 'touchdesigner'], [/voice|audio/, 'voice'], [/shorts?/, 'shorts'], [/influencer/, 'influencer'], [/shape ?shift/, 'genjutsu'],
];

// 16-bit mono WAV from float samples
function wav(samples, rate) {
  const b = new ArrayBuffer(44 + samples.length * 2); const v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  let bin = ''; const u8 = new Uint8Array(b); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
function downsample(buf, from, to = 16000) {
  if (from === to) return buf; const r = from / to; const out = new Float32Array(Math.floor(buf.length / r));
  for (let i = 0; i < out.length; i++) { const s = Math.floor(i * r), e = Math.min(buf.length, Math.floor((i + 1) * r)); let a = 0; for (let j = s; j < e; j++) a += buf[j]; out[i] = a / Math.max(1, e - s); }
  return out;
}
function beep(up = true) {
  try { const c = new AudioContext(); const o = c.createOscillator(); const g = c.createGain(); o.frequency.value = up ? 880 : 520; o.frequency.linearRampToValueAtTime(up ? 1320 : 380, c.currentTime + 0.12);
    g.gain.value = 0.08; g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.18); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.2); setTimeout(() => c.close(), 400); } catch { /* ignore */ }
}

const clean = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');

export default function WakeWord() {
  const { go } = useNav();
  const [on, setOn] = useState(() => { try { return localStorage.getItem('pandora.wake') === '1'; } catch { return false; } });
  const [phase, setPhase] = useState('off'); // off | idle | hearing | checking | command | working
  const [hint, setHint] = useState('');
  const [level, setLevel] = useState(0);
  const [sens, setSens] = useState(() => { try { return localStorage.getItem('pandora.wakeSens') || 'normal'; } catch { return 'normal'; } });
  useEffect(() => { try { localStorage.setItem('pandora.wakeSens', sens); } catch { /* ignore */ } }, [sens]);
  const st = useRef({});

  useEffect(() => { try { localStorage.setItem('pandora.wake', on ? '1' : '0'); } catch { /* ignore */ } }, [on]);
  useEffect(() => { const off = window.api?.stt?.onStatus?.((m) => { if (on && m) setHint(m === 'Voice ready' ? 'Say "Hey Pandora…"' : m); }); return typeof off === 'function' ? off : undefined; }, [on]);

  useEffect(() => {
    if (!on) { setPhase('off'); return undefined; }
    let alive = true; let ctx, proc, stream;
    const s = st.current = { mode: 'wake', buf: [], pre: [], speaking: false, silentMs: 0, speechMs: 0, noise: 0.008, busy: false };
    let offHit = null;
    const ready = () => { s.mode = 'wake'; setPhase('idle'); setHint('Say "Hey Pandora…"'); };
    const onHit = () => {
      if (!alive || s.mode !== 'wake' || s.busy) return;
      beep(true); clearTimeout(s.cmdTimer);
      s.mode = 'command'; s.speaking = !!s.lastLoud; s.buf = s.lastLoud ? s.pre.slice(-2) : []; s.pre = []; s.silentMs = 0; s.speechMs = 0; setPhase('command'); setHint('Yes? Say your command…');
      window.api.wake.log?.('wake word → listening for command');
      s.cmdTimer = setTimeout(() => { if (alive && s.mode === 'command' && !s.speaking && !s.busy) ready(); }, 8000);
    };
    (async () => {
      try {
        const status = await window.api.stt.status();
        s.canUnderstand = status.local || status.cloud;
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        try { ctx = new AudioContext({ sampleRate: 16000 }); } catch { ctx = new AudioContext(); }
        const src = ctx.createMediaStreamSource(stream);
        if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
        proc = ctx.createScriptProcessor(4096, 1, 1);
        const mute = ctx.createGain(); mute.gain.value = 0; // keep the processor running without echoing the mic
        src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
        const rate = ctx.sampleRate; const chunkMs = 4096 / rate * 1000;
        s.busy = true; setPhase('checking'); setHint('Starting the "Hey Pandora" detector…');
        // 1) dedicated offline keyword spotter (sherpa-onnx): fast, exact, no engine needed
        s.kws = false;
        if (window.api.wake) {
          try {
            offHit = window.api.wake.onEvent((m) => { if (m.type === 'hit') onHit(); else if (m.type === 'error') setHint('⚠ Detector: ' + m.error); });
            await window.api.wake.start({ sensitivity: sens });
            s.kws = true;
          } catch (e) { setHint('⚠ ' + clean(e) + ' — trying Whisper instead…'); }
        }
        // 2) fallback: Whisper-based check (needs the local engine)
        if (!s.kws) {
          if (!status.local) { setHint('⚠ The "Hey Pandora" detector could not be downloaded and the local engine is not installed. Check your internet and turn it on again.'); setOn(false); return; }
          try { await window.api.stt.warm('base'); } catch (e) { setHint('⚠ ' + clean(e)); setOn(false); return; }
        } else if (status.local) {
          window.api.stt.warm(voicePrefs().model || 'base').catch(() => {}); // get the command model ready in the background (never blocks: cloud is used until it is ready)
        }
        if (!alive) return;
        s.busy = false; s.peak = 0; s.started = Date.now();
        ready();
        if (s.kws && !s.canUnderstand) setHint('Say "Hey Pandora…" (to understand commands, install the free local engine or add an OpenAI key)');
        proc.onaudioprocess = (e) => {
          const d = e.inputBuffer.getChannelData(0); const chunk = new Float32Array(d);
          let rms = 0; for (let i = 0; i < chunk.length; i += 4) rms += chunk[i] * chunk[i]; rms = Math.sqrt(rms / (chunk.length / 4));
          s.peak = Math.max(s.peak || 0, rms);
          if (!s.warned && s.started && Date.now() - s.started > 6000 && s.peak < 0.002) { s.warned = true; setHint('⚠ No sound from your microphone. Check Windows Settings → Privacy & security → Microphone (allow desktop apps) and the input device in Sound settings.'); }
          const now = Date.now(); if (!s.lvlAt || now - s.lvlAt > 120) { s.lvlAt = now; setLevel(Math.min(1, rms * 12)); }
          // the keyword spotter hears everything while waiting for the wake word
          if (!s.speaking) s.noise = s.noise * 0.95 + Math.min(rms, 0.05) * 0.05;
          if (s.kws && s.mode === 'wake' && !s.busy) { s.lastLoud = rms > Math.max(0.005, s.noise * 2.5); s.pre.push(chunk); if (s.pre.length > 3) s.pre.shift(); window.api.wake.feed(downsample(chunk, rate)); return; }
          // quiet laptop mics with noise suppression often speak at ~0.01 RMS, so the floor is low and adaptive
          const loud = rms > Math.max(0.005, s.noise * 2.5);
          if (s.busy) return;
          if (!s.speaking) {
            s.pre.push(chunk); if (s.pre.length > 3) s.pre.shift();
            if (loud) { s.speaking = true; s.buf = [...s.pre]; s.silentMs = 0; s.speechMs = 0; if (s.mode === 'wake') setPhase('hearing'); }
            return;
          }
          s.buf.push(chunk); s.speechMs += chunkMs;
          s.silentMs = loud ? 0 : s.silentMs + chunkMs;
          const maxMs = s.mode === 'wake' ? 6000 : 20000;
          if (s.silentMs > (s.mode === 'wake' ? 650 : 1100) || s.speechMs > maxMs) {
            s.speaking = false; const parts = s.buf; s.buf = [];
            const total = parts.reduce((a, p) => a + p.length, 0);
            if (s.speechMs < 350) { if (s.mode === 'wake') setPhase('idle'); return; }
            const all = new Float32Array(total); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
            handle(wav(downsample(all, rate), 16000));
          }
        };
      } catch (e) { setHint('⚠ Microphone not available: ' + (e.message || e)); setOn(false); }
    })();

    async function handle(b64) {
      s.busy = true;
      const prefs = voicePrefs();
      try {
        if (s.mode === 'wake') {
          setPhase('checking');
          // "Pandora" is an English word in every language, so the wake check is English (auto-detect on a
          // 1-second clip often guesses the wrong language and spells the name differently); then auto as a fallback
          const ask = (language, translate = false) => window.api.stt.transcribe({ audio: b64, mime: 'audio/wav', language, translate, quick: true, model: 'base', engine: 'local' });
          let r = await ask('en'); let t = String(r.text || ''); let m = matchWake(t);
          if (!m && t.trim()) { const r2 = await ask('auto').catch(() => null); const t2 = String(r2?.text || ''); const m2 = matchWake(t2); if (m2) { r = r2; t = t2; m = m2; } }
          if (m) {
            let rest = m.rest;
            if (rest.length > 3 && /[^\x00-\x7F]/.test(rest)) { // spoken in another language → understand it in English
              try { const tr = await ask(r.language, true); const en = String(tr.text || ''); const mm = matchWake(en); rest = (mm ? mm.rest : en).trim() || rest; } catch { /* keep original */ }
            }
            if (rest.length > 3) { await command(rest, r.language); }
            else { beep(true); s.mode = 'command'; setPhase('command'); setHint('Listening — what should I do?'); s.cmdTimer = setTimeout(() => { if (s.mode === 'command' && !s.speaking) { s.mode = 'wake'; setPhase('idle'); setHint('Say "Hey Pandora…"'); } }, 8000); }
          } else { setPhase('idle'); setHint(t.trim() ? 'Heard: "' + t.trim().slice(0, 60) + '" — start with "Hey Pandora"' : 'Heard sound but no words — speak a little closer/louder: "Hey Pandora"'); }
        } else {
          clearTimeout(s.cmdTimer); setPhase('working'); beep(false);
          // commands are understood in English whatever language you speak (Whisper translate)
          setHint('Understanding…');
          const model = prefs.model || 'base';
          const stt = await window.api.stt.status().catch(() => ({}));
          const engine = (stt.warm || []).includes(model) ? 'local' : stt.cloud ? 'cloud' : 'local';
          const r = await window.api.stt.transcribe({ audio: b64, mime: 'audio/wav', language: prefs.language, translate: true, engine, model });
          const said = String(r.text || ''); const mw = matchWake(said);
          window.api.wake.log?.('command heard (' + engine + '): ' + said);
          s.mode = 'wake';
          command(mw ? mw.rest : said, r.language); // runs in the background — you can keep talking
        }
      } catch (e) { setHint('⚠ ' + String(e.message || e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')); s.mode = 'wake'; }
      if (alive) { setPhase(s.mode === 'command' ? 'command' : 'idle'); s.busy = false; }
    }

    async function command(text, lang) {
      const t = text.trim();
      if (!t) { setHint('I didn\'t catch that — say "Hey Pandora" and try again.'); return; }
      setHint('🗣 "' + t.slice(0, 90) + '"');
      // the Agent page (or any page) can take the words first — plan approval, notes while it works…
      const ev = new CustomEvent('pandora:voice', { detail: { text: t, lang }, cancelable: true });
      if (!window.dispatchEvent(ev)) return;
      const c = parseCommand(t);
      window.api.wake.log?.('intent: ' + JSON.stringify(c).slice(0, 250));
      if (c.type === 'open') { go(c.page); speak('Opening ' + (c.page === 'create' ? 'the studio' : c.page)); setHint('✓ Opened ' + c.page); return; }
      if (c.type === 'do') {
        if (c.needsRecent) {
          if (!recentFile) { go('color'); speak('Open an image or video in Color and I will grade it.'); setHint('Nothing made by voice yet — opened Pandora Color.'); return; }
          c.steps[0].args.file = recentFile;
        }
        speak(c.say + (c.mode === 'free' ? ', free on your PC.' : '.'));
        setHint('⏳ ' + c.say + (c.mode === 'free' ? ' · free, on this PC' : '') + '…');
        const off = window.api.agent.onEvent?.((e) => {
          if (e && e.source === 'connector' && e.type === 'progress') setHint('⏳ ' + (e.stage || 'Working') + (e.pct != null ? ' ' + Math.round(e.pct) + '%' : ''));
        });
        try {
          const r = await window.api.wake.act({ steps: c.steps, mode: c.mode, prefer: c.prefer });
          if (r && r.file) { recentFile = r.file; window.api.agent.open?.(r.file); }
          setHint('✓ Done' + (r && r.imageModel ? ' · ' + r.imageModel.replace(/\s*\(.*$/, '') : '') + ' — saved to your Agent projects folder.');
          speak('Done. Here it is.');
          window.api.wake.log?.('done: ' + (r && r.file));
        } catch (e) {
          setHint('⚠ ' + clean(e)); speak('Sorry, that did not work.'); window.api.wake.log?.('action failed: ' + clean(e));
        } finally { try { off && off(); } catch { /* */ } }
        return;
      }
      // bigger jobs go to the agent, which plans and starts on its own
      go('agent', { goal: t, autorun: true, mode: c.mode }); speak('Got it. The agent is on it.'); setHint('✓ Sent to Pandora Agent');
    }

    return () => { alive = false; clearTimeout(st.current.cmdTimer); try { offHit && offHit(); } catch { /* */ } if (s.kws) window.api.wake.stop().catch(() => {}); try { proc && (proc.onaudioprocess = null); } catch { /* */ } stream && stream.getTracks().forEach((x) => x.stop()); ctx && ctx.close().catch(() => {}); };
  }, [on, sens]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = { off: 'Hey Pandora: off', idle: 'Listening for "Hey Pandora"', hearing: 'Hearing…', checking: 'Hmm…', command: 'Yes? Go ahead…', working: 'On it…' }[phase];
  return (
    <div className={'wake ' + phase} title={hint || label}>
      <button type="button" className="wake-btn" onClick={() => setOn((v) => !v)} aria-pressed={on}>
        <span className="wake-dot" />{on ? '👂' : '🎙'} <span className="wake-l">{on ? (phase === 'command' ? 'Yes?' : 'Hey Pandora') : 'Hey Pandora'}</span>
      </button>
      {on && phase !== 'off' && <div className="wake-meter" title="Microphone level — it should jump when you speak"><i style={{ width: Math.round(level * 100) + '%' }} /></div>}
      {on && hint && <div className="wake-hint">{hint}</div>}
      {on && <button type="button" className="wake-sens" title="If it misses you, use High. If it wakes up by itself, use Low." onClick={() => setSens((v) => ({ low: 'normal', normal: 'high', high: 'low' }[v] || 'normal'))}>Sensitivity: {sens}</button>}
      {on && window.api?.wake?.report && <button type="button" className="wake-sens" onClick={async () => { try { const r = await window.api.wake.report(); await navigator.clipboard.writeText(r); setHint('Voice report copied — paste it to support / Claude.'); } catch (e) { setHint('⚠ ' + clean(e)); } }}>Copy voice report</button>}
    </div>
  );
}
