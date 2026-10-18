import React, { useEffect, useRef, useState } from 'react';

// Voice input for any text field: speak in almost any language (Whisper ~99 languages), optionally
// translated to English for image/video prompts. Free & offline (local Whisper) or OpenAI (cloud).
export const LANGS = [
  ['auto', '🌐 Auto-detect'], ['en', 'English'], ['ur', 'اردو Urdu'], ['hi', 'हिन्दी Hindi'], ['pa', 'ਪੰਜਾਬੀ Punjabi'], ['ar', 'العربية Arabic'],
  ['fa', 'فارسی Persian'], ['bn', 'বাংলা Bengali'], ['ta', 'தமிழ் Tamil'], ['te', 'తెలుగు Telugu'], ['mr', 'मराठी Marathi'], ['gu', 'ગુજરાતી Gujarati'],
  ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'], ['nl', 'Nederlands'], ['ru', 'Русский'],
  ['uk', 'Українська'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['el', 'Ελληνικά'], ['he', 'עברית Hebrew'], ['zh', '中文 Chinese'], ['ja', '日本語 Japanese'],
  ['ko', '한국어 Korean'], ['th', 'ไทย Thai'], ['vi', 'Tiếng Việt'], ['id', 'Bahasa Indonesia'], ['ms', 'Bahasa Melayu'], ['tl', 'Filipino'],
  ['sw', 'Kiswahili'], ['am', 'አማርኛ Amharic'], ['ha', 'Hausa'], ['yo', 'Yorùbá'], ['so', 'Soomaali'], ['ps', 'پښتو Pashto'], ['sd', 'سنڌي Sindhi'],
  ['ne', 'नेपाली Nepali'], ['si', 'සිංහල Sinhala'], ['my', 'Burmese'], ['km', 'Khmer'], ['lo', 'Lao'], ['kk', 'Қазақ Kazakh'], ['uz', 'Oʻzbek'],
  ['az', 'Azərbaycan'], ['ka', 'ქართული Georgian'], ['hy', 'Հայերեն Armenian'], ['ro', 'Română'], ['hu', 'Magyar'], ['cs', 'Čeština'], ['sk', 'Slovenčina'],
  ['bg', 'Български'], ['sr', 'Српски'], ['hr', 'Hrvatski'], ['sl', 'Slovenščina'], ['sv', 'Svenska'], ['no', 'Norsk'], ['da', 'Dansk'], ['fi', 'Suomi'],
  ['et', 'Eesti'], ['lv', 'Latviešu'], ['lt', 'Lietuvių'], ['is', 'Íslenska'], ['ga', 'Gaeilge'], ['cy', 'Cymraeg'], ['ca', 'Català'], ['eu', 'Euskara'],
  ['gl', 'Galego'], ['af', 'Afrikaans'], ['zu', 'isiZulu'], ['ml', 'മലയാളം Malayalam'], ['kn', 'ಕನ್ನಡ Kannada'], ['mn', 'Монгол'], ['bo', 'Tibetan'],
];

const load = () => { try { return JSON.parse(localStorage.getItem('pandora.voice') || '{}'); } catch { return {}; } };
const save = (v) => { try { localStorage.setItem('pandora.voice', JSON.stringify(v)); } catch { /* ignore */ } };
export const voicePrefs = () => ({ language: 'auto', translate: false, engine: 'auto', model: 'small', speak: false, ...load() });

const blobToB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });

// Speak text aloud with the operating system's voices (free, offline)
export function speak(text, lang) {
  try {
    const synth = window.speechSynthesis; if (!synth || !text) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 600));
    if (lang && lang !== 'auto') { const v = synth.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(lang)); if (v) u.voice = v; }
    synth.speak(u);
  } catch { /* no voices */ }
}

// mode: 'append' (add to the field) | 'replace'. promptMode=true defaults translation to English on.
export default function MicButton({ onText, promptMode = false, small = false, title = 'Speak instead of typing' }) {
  const [prefs, setPrefs] = useState(() => { const p = voicePrefs(); return promptMode && load().translate === undefined ? { ...p, translate: true } : p; });
  const [state, setState] = useState('idle'); // idle | rec | busy
  const [level, setLevel] = useState(0);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(false);
  const rec = useRef(null); const chunks = useRef([]); const raf = useRef(0); const streamRef = useRef(null);

  useEffect(() => { const off = window.api?.stt?.onStatus?.((m) => setMsg(m)); return typeof off === 'function' ? off : undefined; }, []);
  useEffect(() => () => { cancelAnimationFrame(raf.current); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);
  const setP = (patch) => { const n = { ...prefs, ...patch }; setPrefs(n); save(n); };

  async function start() {
    setMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
      const an = ctx.createAnalyser(); an.fftSize = 512; let peak = 0; const t0 = Date.now();
      ctx.createMediaStreamSource(stream).connect(an); const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); setLevel(m / 128); peak = Math.max(peak, m);
        if (peak <= 2 && Date.now() - t0 > 4000) setMsg('⚠ No sound from the microphone — check Windows Settings → Privacy & security → Microphone, and your input device.');
        raf.current = requestAnimationFrame(tick);
      }; tick();
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType: mime }); chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        cancelAnimationFrame(raf.current); setLevel(0); stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => {});
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        if (blob.size < 2000) { setState('idle'); setMsg('Too short — hold on a little longer.'); return; }
        setState('busy'); setMsg('Understanding…');
        const slow = setTimeout(() => setMsg((m) => (m === 'Understanding…' ? 'Still working… the first time downloads the voice model (a few minutes), after that it is quick.' : m)), 8000);
        try {
          const r = await window.api.stt.transcribe({ audio: await blobToB64(blob), mime: 'audio/webm', language: prefs.language, translate: prefs.translate, engine: prefs.engine, model: prefs.model });
          if (r.text) { onText(r.text, r); setMsg(`✓ ${r.engine}${r.language && prefs.language === 'auto' ? ' · heard ' + r.language : ''}`); }
          else setMsg('I didn\'t catch that — try again.');
        } catch (e) { setMsg('⚠ ' + String(e.message || e).replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')); }
        clearTimeout(slow); setState('idle');
      };
      rec.current = mr; mr.start(250); setState('rec');
    } catch (e) { setMsg('⚠ Microphone not available: ' + (e.message || e)); setState('idle'); }
  }
  const stop = () => { try { rec.current && rec.current.state !== 'inactive' && rec.current.stop(); } catch { /* ignore */ } };

  return (
    <span className={'mic-wrap' + (small ? ' small' : '')}>
      <button type="button" className={'mic-btn ' + state} title={state === 'rec' ? 'Stop & transcribe' : title} disabled={state === 'busy'}
        onClick={() => (state === 'rec' ? stop() : start())} style={{ '--lvl': level }}>
        {state === 'busy' ? <span className="spinner" /> : state === 'rec' ? '■' : '🎙'}
      </button>
      <button type="button" className="mic-opt" onClick={() => setOpen((v) => !v)} title="Voice settings">{(LANGS.find((l) => l[0] === prefs.language) || LANGS[0])[0] === 'auto' ? '🌐' : prefs.language.toUpperCase()}{prefs.translate ? '→EN' : ''}</button>
      {state === 'rec' && <span className="mic-live">Listening… click ■ when done</span>}
      {msg && state !== 'rec' && <span className="mic-msg">{msg}</span>}
      {open && (
        <div className="mic-pop" onMouseLeave={() => setOpen(false)}>
          <label>Language you speak</label>
          <select value={prefs.language} onChange={(e) => setP({ language: e.target.value })}>{LANGS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
          <label className="row" style={{ gap: 6, cursor: 'pointer' }}><input type="checkbox" style={{ width: 'auto' }} checked={prefs.translate} onChange={(e) => setP({ translate: e.target.checked })} /><span>Translate to English (best for image & video prompts)</span></label>
          <label>Recognition</label>
          <select value={prefs.engine} onChange={(e) => setP({ engine: e.target.value })}>
            <option value="auto">Auto (free local first)</option><option value="local">Free & offline (Whisper on this PC)</option><option value="cloud">Cloud (OpenAI key)</option>
          </select>
          {prefs.engine !== 'cloud' && (<>
            <label>Accuracy</label>
            <select value={prefs.model} onChange={(e) => setP({ model: e.target.value })}>
              <option value="base">Fast (base · ~150 MB)</option><option value="small">Balanced (small · ~500 MB)</option><option value="large-v3-turbo">Best (large-v3-turbo · ~1.6 GB)</option>
            </select>
          </>)}
        </div>
      )}
    </span>
  );
}
