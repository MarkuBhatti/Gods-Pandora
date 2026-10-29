import React, { useEffect, useMemo, useState } from 'react';
import catalog from '../../data/modelCatalog.json';
import directory from '../../data/modelDirectory.json';
import { useStore } from './store.jsx';

// Every runnable model in one list: built-in catalog + your custom models (any FAL / Replicate /
// Higgsfield / Hugging Face endpoint) + every model you downloaded (auto-detected image or video)
// + engine-compatible directory models (download automatically on first use).
export function useDownloaded() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let ok = true;
    const load = () => (window.api.engine.listModelsDetailed
      ? window.api.engine.listModelsDetailed()
      : window.api.engine.listModels().then((l) => l.map((repo) => ({ repo, kind: 'image', runnable: true }))))
      .then((l) => ok && setList(l || [])).catch(() => {});
    load(); const t = setInterval(load, 8000);
    return () => { ok = false; clearInterval(t); };
  }, []);
  return list;
}

// Files installed from Civitai / URLs (checkpoints, LoRAs…)
export function useMarketFiles() {
  const [files, setFiles] = useState([]);
  useEffect(() => {
    let ok = true;
    const load = () => window.api.market?.files().then((l) => ok && setFiles(l || [])).catch(() => {});
    load(); const t = setInterval(load, 8000);
    return () => { ok = false; clearInterval(t); };
  }, []);
  return files;
}

// Base models the local engine can load from a single .safetensors / .ckpt file
export const LOCAL_FILE_BASES = ['SD 1.5', 'SD 1.4', 'SDXL 1.0', 'SDXL Turbo', 'SDXL Lightning', 'Pony', 'Illustrious', 'NoobAI'];
export const isXL = (b) => /SDXL|Pony|Illustrious|NoobAI/i.test(b || '');
export const loraFits = (loraBase, modelBase) => !loraBase || !modelBase || isXL(loraBase) === isXL(modelBase);

export function useAllModels() {
  const { db } = useStore();
  const downloaded = useDownloaded();
  const marketFiles = useMarketFiles();
  return useMemo(() => {
    // complete === undefined → older main process without the flag: trust presence
    const dlSet = new Set(downloaded.filter((d) => d.complete !== false).map((d) => d.repo));
    const partSet = new Set(downloaded.filter((d) => d.complete === false && !d.downloading).map((d) => d.repo));
    const custom = (db.customModels || []).map((m) => ({ ...m, custom: true }));
    const onPC = (m) => m.provider === 'local' || m.provider === 'localaudio';
    const base = [...catalog.models, ...custom].map((m) => (onPC(m) ? { ...m, downloaded: dlSet.has(m.endpoint), partial: partSet.has(m.endpoint) } : m));
    const known = new Set(base.filter(onPC).map((m) => m.endpoint));
    const dl = downloaded
      .filter((d) => (d.runnable || d.className || d.kind === 'audio') && !known.has(d.repo))
      .map((d) => (d.kind === 'audio'
        // music / voice / sound models run in the built-in audio engine
        ? { id: 'dl-' + d.repo, name: d.repo.split('/').pop() + ' (downloaded · ' + (d.audioType || 'audio') + ')', provider: 'localaudio', kind: 'audio',
            endpoint: d.repo, family: d.family, audioType: d.audioType, supported: d.supported !== false, refInput: null,
            downloaded: dlSet.has(d.repo), partial: partSet.has(d.repo) }
        : { id: 'dl-' + d.repo, name: d.repo.split('/').pop() + ' (downloaded · ' + d.kind + ')', provider: 'local', kind: d.kind,
            endpoint: d.repo, refInput: 'reference_images', maxRefs: d.kind === 'video' ? 1 : 4,
            downloaded: dlSet.has(d.repo), partial: partSet.has(d.repo) }));
    dl.forEach((m) => known.add(m.endpoint));
    // open-source audio models the built-in audio engine runs — listed even before they are downloaded
    const dirAudio = directory.openSource
      .filter((m) => m.type === 'audio' && m.audioEngine && !known.has(m.repo))
      .map((m) => ({
        id: 'os-' + m.repo, name: m.name + ' (free download · ' + (m.audioType || 'audio') + ')', provider: 'localaudio', kind: 'audio',
        endpoint: m.repo, family: m.family, audioType: m.audioType, vram: m.vram, refInput: null, downloaded: false,
      }));
    dirAudio.forEach((m) => known.add(m.endpoint));
    const dir = directory.openSource
      .filter((m) => m.engine && !known.has(m.repo))
      .map((m) => ({
        id: 'os-' + m.repo, name: m.name + ' (free download)', provider: 'local', kind: 'image',
        endpoint: m.repo, refInput: 'reference_images', maxRefs: 4, downloaded: false,
      }));
    const ckpts = marketFiles
      .filter((f) => /checkpoint/i.test(f.type) && /\.(safetensors|ckpt)$/i.test(f.file) && (!f.baseModel || LOCAL_FILE_BASES.includes(f.baseModel)))
      .map((f) => ({
        id: 'file-' + f.file, name: f.name + ' (' + (f.baseModel || 'checkpoint') + ')', provider: 'local', kind: 'image',
        endpoint: f.file, base: f.baseModel || '', refInput: 'reference_images', maxRefs: 4, downloaded: true, fromMarket: true,
      }));
    return [...base, ...ckpts, ...dl, ...dir, ...dirAudio];
  }, [db.customModels, downloaded, marketFiles]);
}

// providers that run on this PC for free
export const FREE_PROVIDERS = new Set(['local', 'localaudio', 'system']);
export const isFree = (m) => !!m && FREE_PROVIDERS.has(m.provider);
export const audioTypeOf = (x) => x?.audioType || (/music/i.test(x?.name || '') ? 'music' : /sound|sfx|ambien/i.test(x?.name || '') ? 'sfx' : 'speech');

// voices per provider (Voice tab / audio tools)
export const VOICES = {
  elevenlabs: [['21m00Tcm4TlvDq8ikWAM', 'Rachel — calm female'], ['EXAVITQu4vr4xnSDxMaL', 'Bella — soft female'], ['MF3mGyEYCl7XYWbV9V6O', 'Elli — young female'], ['AZnzlk1XvdvUeBnXmlld', 'Domi — strong female'], ['pNInz6obpgDQGcFmaJgB', 'Adam — deep male'], ['ErXwobaYiN019PkySvjV', 'Antoni — warm male'], ['TxGEqnHWrfWFTfGW9XjX', 'Josh — young male'], ['VR6AewLTigWG4xSOukaG', 'Arnold — bold male'], ['yoZ06aMxZJJ28mfd3POQ', 'Sam — raspy male']],
  system: [['female', 'Female (Windows voice)'], ['male', 'Male (Windows voice)']],
  localaudio: [['v2/en_speaker_6', 'English · male narrator'], ['v2/en_speaker_9', 'English · female'], ['v2/en_speaker_3', 'English · male casual'], ['v2/hi_speaker_2', 'Hindi / Urdu · female'], ['v2/hi_speaker_5', 'Hindi / Urdu · male'], ['v2/es_speaker_1', 'Spanish'], ['v2/fr_speaker_1', 'French'], ['v2/de_speaker_1', 'German'], ['v2/it_speaker_1', 'Italian'], ['v2/pt_speaker_1', 'Portuguese'], ['v2/ru_speaker_1', 'Russian'], ['v2/tr_speaker_1', 'Turkish'], ['v2/zh_speaker_1', 'Chinese'], ['v2/ja_speaker_1', 'Japanese'], ['v2/ko_speaker_1', 'Korean'], ['v2/pl_speaker_1', 'Polish']],
};

// voices for the built-in audio engine, per model family (value is passed to engine/audio_gen.py as "voice")
export const AUDIO_VOICES = {
  bark: VOICES.localaudio,
  kokoro: [['af_heart', 'US English · female (Heart)'], ['af_bella', 'US English · female (Bella)'], ['af_nicole', 'US English · soft female (Nicole)'],
    ['am_michael', 'US English · male (Michael)'], ['am_fenrir', 'US English · deep male (Fenrir)'], ['am_puck', 'US English · lively male (Puck)'],
    ['bf_emma', 'British English · female (Emma)'], ['bm_george', 'British English · male (George)'], ['bm_fable', 'British English · male (Fable)'],
    ['hf_alpha', 'Hindi · female'], ['hm_omega', 'Hindi · male'], ['ef_dora', 'Spanish · female'], ['em_alex', 'Spanish · male'],
    ['ff_siwis', 'French · female'], ['if_sara', 'Italian · female'], ['im_nicola', 'Italian · male'], ['pf_dora', 'Portuguese · female'], ['pm_alex', 'Portuguese · male']],
  chatterbox: [['en', 'English'], ['hi', 'Hindi'], ['ar', 'Arabic'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'],
    ['ru', 'Russian'], ['tr', 'Turkish'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['ko', 'Korean'], ['nl', 'Dutch'], ['pl', 'Polish'], ['sv', 'Swedish'],
    ['da', 'Danish'], ['fi', 'Finnish'], ['no', 'Norwegian'], ['el', 'Greek'], ['he', 'Hebrew'], ['ms', 'Malay'], ['sw', 'Swahili']],
  xtts: [['en:Ana Florence', 'English · female (Ana)'], ['en:Claribel Dervla', 'English · female (Claribel)'], ['en:Damien Black', 'English · male (Damien)'],
    ['en:Craig Gutsy', 'English · male (Craig)'], ['hi:Ana Florence', 'Hindi · female'], ['hi:Damien Black', 'Hindi · male'], ['ar:Ana Florence', 'Arabic · female'],
    ['es:Ana Florence', 'Spanish · female'], ['fr:Ana Florence', 'French · female'], ['de:Damien Black', 'German · male'], ['tr:Ana Florence', 'Turkish · female'],
    ['ru:Damien Black', 'Russian · male'], ['pt:Ana Florence', 'Portuguese · female'], ['it:Ana Florence', 'Italian · female'], ['zh-cn:Ana Florence', 'Chinese · female'],
    ['ja:Ana Florence', 'Japanese · female'], ['ko:Ana Florence', 'Korean · female']],
  parler: [['A clear, expressive female voice with a moderate pace, recorded in a quiet room with very high quality.', 'Clear female narrator'],
    ['A calm, deep male voice speaking slowly and warmly, very close-sounding and high quality.', 'Deep calm male'],
    ['An energetic young female voice speaking quickly with lots of excitement, high quality.', 'Energetic female'],
    ['A confident male news presenter voice with a steady pace and clear articulation, studio quality.', 'News presenter (male)']],
};

export const PROVIDER_NAMES = {
  fal: 'FAL.ai', replicate: 'Replicate', higgsfield: 'Higgsfield', huggingface: 'Hugging Face',
  openai: 'OpenAI', google: 'Google', stability: 'Stability', elevenlabs: 'ElevenLabs', local: 'Local engine', system: 'System voice', localaudio: 'Built-in audio engine',
};

// ── Model readiness ──────────────────────────────────────────────────────────
// One shared store (polled once for the whole app) that knows which API keys are saved, which local
// models are fully downloaded / still downloading, and whether the local engine is installed.
// Every model picker shows the status and Generate stays disabled until the model is ready.
const rd = { keys: {}, progress: {}, active: [], engine: null, files: null, audio: null, audioProg: {}, subs: new Set(), started: false };
const emit = () => rd.subs.forEach((f) => f({ ...rd }));
if (typeof window !== 'undefined') window.__pandoraRd = rd; // handy for support/debugging
function startReadiness() {
  if (rd.started || typeof window === 'undefined' || !window.api) return;
  rd.started = true;
  const poll = async () => {
    try { const k = await window.api.keysList?.(); rd.keys = k && typeof k === 'object' ? k : {}; } catch (_) {}
    try { const a = await window.api.engine?.activeDownloads?.(); rd.active = Array.isArray(a) ? a : []; } catch (_) {}
    try { rd.engine = (await window.api.engine?.status?.()) || null; } catch (_) {}
    emit();
  };
  poll(); setInterval(poll, 4000);
  window.addEventListener('focus', poll);
  // built-in audio engine: which model families are set up (checked less often — it starts a small process)
  const pollAudio = async () => { try { rd.audio = (await window.api.audio?.backends?.()) || rd.audio; emit(); } catch (_) {} };
  rd.pollAudio = pollAudio;
  pollAudio();
  if (rd.audioWired) return;
  rd.audioWired = true;
  setInterval(pollAudio, 60000);
  try {
    window.api.audio?.onSetupProgress?.((p) => {
      if (!p || !p.family) return;
      rd.audioProg = { ...rd.audioProg, [p.family]: p.done ? { done: true } : { ...(rd.audioProg[p.family] || {}), ...p } };
      emit();
      if (p.done && rd.pollAudio) rd.pollAudio();
    });
  } catch (_) {}
  try {
    window.api.engine?.onProgress?.((p) => {
      if (!p || !p.repo) return;
      if (p.done) { delete rd.progress[p.repo]; rd.active = rd.active.filter((r) => r !== p.repo); poll(); }
      else { rd.progress[p.repo] = p; if (!rd.active.includes(p.repo)) rd.active = [...rd.active, p.repo]; }
      emit();
    });
  } catch (_) {}
}
export function refreshReadiness() { rd.started = false; startReadiness(); }

export function useReadiness() {
  const [s, set] = useState(() => ({ ...rd }));
  useEffect(() => { startReadiness(); rd.subs.add(set); set({ ...rd }); return () => rd.subs.delete(set); }, []);
  return s;
}

const NO_KEY_PROVIDERS = new Set(['local', 'ollama', 'comfyui', 'touchdesigner', 'system']);
const keyFor = (m) => m.keyName || m.provider;

// → { state, ok, label, short, fix: {label, action} }
export function readiness(m, r = rd) {
  if (!m) return { state: 'none', ok: false, label: 'Choose a model', short: '' };
  if (m.provider === 'localaudio') return audioReadiness(m, r);
  if (m.provider === 'system') return { state: 'ready', ok: true, label: 'Free · offline system voice', short: '🆓' };
  if (m.provider === 'local') {
    if (m.fromMarket) return { state: 'ready', ok: true, label: 'Ready · installed on this PC', short: '✅' };
    if (!m.endpoint) return { state: 'ready', ok: true, label: 'Runs in your local runtime (Ollama / LM Studio)', short: '' };
    const repo = m.endpoint;
    const downloading = (Array.isArray(r.active) && r.active.includes(repo)) || !!r.progress?.[repo];
    if (downloading) {
      const p = r.progress?.[repo];
      const pct = p && p.total ? Math.min(100, Math.floor((p.bytes / p.total) * 100)) : null;
      return { state: 'downloading', ok: false, pct, label: 'Downloading' + (pct != null ? ` ${pct}%` : '…') + ' — you can generate once it finishes', short: '⏳' + (pct != null ? pct + '%' : '') };
    }
    if (r.engine && r.engine.installed === false) {
      return { state: 'engine', ok: false, label: 'Local engine not installed yet', short: '⚙', fix: { label: 'Install engine', go: 'models' } };
    }
    if (m.downloaded) return { state: 'ready', ok: true, label: 'Ready · downloaded, runs offline & free', short: '✅' };
    if (m.partial) return { state: 'partial', ok: false, label: 'Download incomplete — resume it to use this model', short: '⚠', fix: { label: 'Resume download', download: repo } };
    return { state: 'missing', ok: false, label: 'Not downloaded yet (free)', short: '⬇', fix: { label: 'Download', download: repo } };
  }
  if (NO_KEY_PROVIDERS.has(m.provider)) return { state: 'ready', ok: true, label: 'Ready', short: '✅' };
  const has = !!(r.keys && r.keys[keyFor(m)]);
  const prov = PROVIDER_NAMES[m.provider] || m.provider;
  return has
    ? { state: 'key', ok: true, label: `Ready · ${prov} key connected`, short: '🔑' }
    : { state: 'nokey', ok: false, label: `${prov} API key not connected`, short: '🔒', fix: { label: 'Add key', go: 'settings' } };
}

// families whose engine is set up once before first use (see electron/audioFamilies.js)
export const AUDIO_SETUP = { acestep: 'ACE-Step', kokoro: 'Kokoro', chatterbox: 'Chatterbox', f5: 'F5-TTS', xtts: 'XTTS', parler: 'Parler-TTS' };
const SETUP_GB = { acestep: 7, kokoro: 0.5, chatterbox: 5, f5: 5, xtts: 5, parler: 5 };

// Built-in audio engine models: engine → download → one-time engine setup → ready
function audioReadiness(m, r) {
  if (r.engine && r.engine.installed === false) return { state: 'engine', ok: false, label: "The built-in audio engine needs the local engine", short: '⚙', fix: { label: 'Install engine', go: 'models' } };
  if (m.supported === false) return { state: 'unsupported', ok: false, label: "This model family isn't supported by the built-in audio engine yet", short: '⛔' };
  const repo = m.endpoint;
  const downloading = (Array.isArray(r.active) && r.active.includes(repo)) || !!r.progress?.[repo];
  if (downloading) {
    const p = r.progress?.[repo];
    const pct = p && p.total ? Math.min(100, Math.floor((p.bytes / p.total) * 100)) : null;
    return { state: 'downloading', ok: false, pct, label: 'Downloading' + (pct != null ? ` ${pct}%` : '…') + ' — you can generate once it finishes', short: '⏳' + (pct != null ? pct + '%' : '') };
  }
  if (!m.downloaded && !m.autoDownload) {
    if (m.partial) return { state: 'partial', ok: false, label: 'Download incomplete — resume it to use this model', short: '⚠', fix: { label: 'Resume download', download: repo } };
    return { state: 'missing', ok: false, label: 'Not downloaded yet (free' + (m.vram ? ' · needs ' + m.vram + ' GPU' : '') + ')', short: '⬇', fix: { label: 'Download', download: repo } };
  }
  const fam = m.family;
  if (fam && AUDIO_SETUP[fam]) {
    const prog = r.audioProg?.[fam];
    if (prog && !prog.done) {
      const pct = prog.pct != null ? prog.pct : null;
      return { state: 'settingup', ok: false, pct, label: `Setting up the ${AUDIO_SETUP[fam]} engine — ${prog.step || 'working'}${pct != null ? ` ${pct}%` : '…'}`, short: '⏳' };
    }
    if (r.audio && r.audio.families && r.audio.families[fam] === false) {
      return { state: 'setup', ok: false, label: `One-time setup of the ${AUDIO_SETUP[fam]} engine inside God's Pandora (~${SETUP_GB[fam]} GB)`, short: '⚙', fix: { label: 'Set up', setup: fam } };
    }
  }
  return { state: 'ready', ok: true, label: m.downloaded ? 'Ready · runs free on your PC (built-in audio engine)' : 'Free on your PC · first use downloads the model', short: m.downloaded ? '✅' : '🆓' };
}

export function modelLabel(m, r = rd) {
  const s = readiness(m, r).short;
  if (m.provider === 'local' || m.provider === 'localaudio') return (s ? s + ' ' : '') + m.name;
  return (s ? s + ' ' : '') + m.name + ' — ' + (PROVIDER_NAMES[m.provider] || m.provider) + (m.custom ? ' · custom' : '');
}

// Small status chip + one-click fix, shown under every model picker.
export function ModelStatus({ model, compact = false }) {
  const r = useReadiness();
  const s = readiness(model, r);
  const [msg, setMsg] = useState('');
  if (!model) return null;
  const doFix = async () => {
    if (!s.fix) return;
    if (s.fix.go) { window.dispatchEvent(new CustomEvent('pandora:go', { detail: s.fix.go })); return; }
    if (s.fix.setup) {
      setMsg('');
      const fam = s.fix.setup;
      rd.audioProg = { ...rd.audioProg, [fam]: { family: fam, step: 'Starting' } }; emit();
      const res = await window.api.audio.setup(fam).catch((e) => ({ ok: false, error: e.message }));
      rd.audioProg = { ...rd.audioProg, [fam]: { done: true } };
      if (res && !res.ok) setMsg(res.error || 'Setup failed');
      else if (rd.audio && rd.audio.families) rd.audio = { ...rd.audio, families: { ...rd.audio.families, [fam]: true } };
      emit(); rd.pollAudio && rd.pollAudio();
      return;
    }
    if (s.fix.download) {
      setMsg('');
      rd.active = [...new Set([...(rd.active || []), s.fix.download])]; emit();
      const res = await window.api.engine.downloadModel(s.fix.download).catch((e) => ({ ok: false, error: e.message }));
      if (res && !res.ok && res.error) setMsg(res.error);
      refreshReadiness();
    }
  };
  const cancel = () => window.api.engine.cancelDownload?.(model.endpoint).then(refreshReadiness);
  return (
    <div className={'mstat mstat-' + s.state + (compact ? ' compact' : '')} role="status">
      <span className="mstat-dot" />
      <span className="mstat-txt">{s.label}</span>
      {(s.state === 'downloading' || s.state === 'settingup') && s.pct != null && <span className="mstat-bar"><i style={{ width: s.pct + '%' }} /></span>}
      {s.fix && <button type="button" className="btn small" onClick={doFix}>{s.fix.label}</button>}
      {s.state === 'downloading' && <button type="button" className="btn ghost small" onClick={cancel}>Pause</button>}
      {msg && <span className="mstat-err">{msg}</span>}
    </div>
  );
}

// For Generate buttons: { ok, reason } — blocks generation when the model can't run yet.
export function useModelGate(...models) {
  const r = useReadiness();
  for (const m of models.filter(Boolean)) {
    const s = readiness(m, r);
    if (!s.ok) return { ok: false, reason: (m.name ? m.name + ': ' : '') + s.label };
  }
  return { ok: true, reason: '' };
}
