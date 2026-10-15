// Pinokio app catalog (pinokio.co) — 1-click launchers for open-source AI apps:
// music (ACE-Step, YuE, DiffRhythm, Stable Audio 3, SongGeneration…), voice/TTS (F5, XTTS,
// Chatterbox, Qwen3-TTS, Applio/RVC…), audio (MMAudio, AudioSep), video, image, 3D.
// We read the public search pages (server-rendered HTML) and parse the app cards.
// Falls back to a curated snapshot (verified 2026-10-13) if the site is unreachable.

const BASE = 'https://pinokio.co';
const CAT_TAG = { music: 'music', voice: 'tts', audio: 'audio', video: 'video-generation', image: 'image-generation', '3d': '3d', llm: 'llm', all: 'ai' };

const decode = (s) => String(s || '')
  .replace(/<!-- -->/g, '').replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

function categorize(tags, fallback) {
  const t = tags.map((x) => x.toLowerCase());
  const has = (...k) => k.some((x) => t.includes(x));
  if (has('music', 'song-generation', 'music-generation', 'song', 'musicgen')) return 'music';
  if (has('tts', 'voice', 'voice-clone', 'voice-cloning', 'rvc', 'speech', 'text-to-speech')) return 'voice';
  if (has('audio', 'audio-generation', 'sound', 'sfx')) return 'audio';
  if (has('video-generation', 'video', 'lipsync')) return 'video';
  if (has('image-generation', 'image', 'upscale', 'upscaler')) return 'image';
  if (has('3d', '3dgen', 'gaussian', 'mesh')) return '3d';
  if (has('llm', 'chat', 'agent')) return 'llm';
  return fallback || 'other';
}

function parseCards(html, fallbackCat) {
  const out = [];
  const parts = String(html).split('<div class="result store-app-result');
  parts.shift();
  for (const c of parts) {
    const t = c.match(/class="title" href="\/apps\/([^"]+)">([^<]+)</);
    if (!t) continue;
    const repo = decode((c.match(/store-app-repo">([^<]+)</) || [])[1]);
    const desc = decode((c.match(/store-app-description">([\s\S]*?)<\/div>/) || [])[1]).slice(0, 260);
    const tags = [...c.matchAll(/store-app-tag" href="[^"]*tag=([^"&]+)"/g)].map((m) => decodeURIComponent(m[1]));
    const gpu = [...c.matchAll(/store-compat-text is-active"[^>]*>([^<]+)</g)].map((m) => m[1]);
    const icon = (c.match(/<div class="icon"><img src="([^"]+)"/) || [])[1] || '';
    const version = decode((c.match(/<span>v(?:<!-- -->)?([^<]+)<\/span>/) || [])[1]);
    const updated = decode((c.match(/<span>(updated [^<]+)<\/span>/) || [])[1]);
    out.push(makeItem({ slug: t[1], name: decode(t[2]), repo, desc, tags, gpu, icon, version, updated, featured: /app-result-featured/.test(c.slice(0, 120)), cat: categorize(tags, fallbackCat) }));
  }
  return out;
}

function makeItem(a) {
  const repo = a.repo || '';
  return {
    ...a,
    id: a.slug,
    link: BASE + '/apps/' + a.slug,
    github: repo ? 'https://github.com/' + repo.replace(/^https?:\/\/github\.com\//, '') : '',
    // Pinokio → Discover → "Download from URL" accepts the launcher's git URL
    installUrl: repo ? 'https://github.com/' + repo.replace(/^https?:\/\/github\.com\//, '') : '',
    // Pinokio desktop listens on localhost:42000 — this is the same link pinokio.co's "Install latest" button uses
    oneClick: repo ? `${LOCAL}/pinokio/download?uri=${encodeURIComponent('https://github.com/' + repo.replace(/^https?:\/\/github\.com\//, ''))}&path=api` : '',
  };
}

const LOCAL = 'http://localhost:42000';
async function pinokioRunning() {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(LOCAL + '/', { signal: ctl.signal }); clearTimeout(t);
    return r.status < 500;
  } catch { return false; }
}

async function pinokioSearch({ q = '', category = 'music', page = 1 } = {}) {
  const tag = CAT_TAG[category] || 'ai';
  const qs = q.trim() ? 'q=' + encodeURIComponent(q.trim()) : 'tag=' + encodeURIComponent(tag);
  const url = `${BASE}/search?type=apps&${qs}&page=${Math.max(1, +page || 1)}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'GodsPandora/0.2 (+desktop)', Accept: 'text/html' } });
    if (!r.ok) throw new Error('Pinokio HTTP ' + r.status);
    let items = parseCards(await r.text(), category === 'all' ? null : category);
    // browsing a tag: everything returned belongs to that tab (cards only show their first 3 tags)
    if (!q.trim() && category !== 'all') items = items.map((x) => ({ ...x, cat: category }));
    if (!items.length && page === 1 && !q.trim()) throw new Error('No apps parsed');
    return { items, hasMore: items.length >= 20 || (q.trim() && items.length > 0), live: true };
  } catch (e) {
    const ql = q.trim().toLowerCase();
    const items = SNAPSHOT.map(([name, repo, slug, cat, desc, gpu]) => makeItem({ name, repo, slug, cat, desc, gpu: gpu.split(',').filter(Boolean), tags: [cat], featured: true }))
      .filter((x) => (category === 'all' || x.cat === category) && (!ql || (x.name + ' ' + x.desc + ' ' + x.repo).toLowerCase().includes(ql)));
    return { items: page === 1 ? items : [], hasMore: false, live: false, error: String(e.message || e) };
  }
}

// Curated offline snapshot of pinokio.co (2026-10-13) — [name, repo, slug, category, description, gpus]
const SNAPSHOT = [
  // 🎵 Music
  ['ACE-Step 1.5', 'cocktailpeanut/ace-step.pinokio', 'github-com-cocktailpeanut-ace-step-pinokio', 'music', 'Powerful local music generation — full songs with vocals.', 'NVIDIA,Apple'],
  ['ACE-Step UI', 'cocktailpeanut/ace-step-ui.pinokio', 'github-com-cocktailpeanut-ace-step-ui-pinokio', 'music', 'Suno-style studio UI for ACE-Step 1.5.', 'NVIDIA,AMD,Apple'],
  ['AceJAM', 'cocktailpeanut/acejam.pinokio', 'github-com-cocktailpeanut-acejam-pinokio', 'music', 'Describe a song in plain English → lyrics with a local Qwen model → ACE-Step audio.', 'NVIDIA,AMD,Apple'],
  ['AceStep.cpp UI', 'audiohacking/acestep-cpp-pinokio', 'github-com-audiohacking-acestep-cpp-pinokio', 'music', 'Native C++ ACE-Step music generation — no Python required.', 'AMD'],
  ['YuE', 'pinokiofactory/yue', 'github-com-pinokiofactory-yue', 'music', 'YuEGP — open full-song generation (10 GB VRAM).', 'NVIDIA'],
  ['YUE2 // GROOVE', 'deadjoe/yue2-groove-pinokio', 'github-com-deadjoe-yue2-groove-pinokio', 'music', 'Full songs from style and lyrics with the open Yue2 model.', 'NVIDIA,AMD,Apple'],
  ['DiffRhythm', 'pinokiofactory/diffrhythm', 'github-com-pinokiofactory-diffrhythm', 'music', 'Songs up to 4:45, with lyrics or instrumental.', 'NVIDIA'],
  ['SongGeneration Studio', '6Morpheus6/SongGeneration-Studio', 'github-com-6morpheus6-songgeneration-studio', 'music', "Tencent SongGeneration (LeVo) — lyrics, vocals and instrumentals.", 'NVIDIA,AMD'],
  ['HeartMuLa Studio', 'cocktailpeanut/heartmula-studio', 'github-com-cocktailpeanut-heartmula-studio', 'music', 'Suno-like music studio for HeartLib.', 'NVIDIA,AMD,Apple'],
  ['Stable Audio 3', 'cocktailpeanut/stable-audio-3-small.pinokio', 'github-com-cocktailpeanut-stable-audio-3-small-pinokio', 'music', 'Stable Audio 3 Small Music / SFX and Medium.', 'NVIDIA,AMD'],
  ['StableDAW', 'cocktailpeanut/stabledaw.pinokio', 'github-com-cocktailpeanut-stabledaw-pinokio', 'music', 'AI audio DAW for Stable Audio 3 — inpainting, LoRA training, sequencer.', 'NVIDIA,AMD,Apple'],
  ['Underfit', 'cocktailpeanut/underfit.pinokio', 'github-com-cocktailpeanut-underfit-pinokio', 'music', 'LoRA fine-tuning dashboard for Stable Audio 3.', 'NVIDIA'],
  ['StableAudio', 'pinokiofactory/stableaudio', 'github-com-pinokiofactory-stableaudio', 'music', 'Stable Audio Open — samples and sound design.', 'NVIDIA'],
  ['audiocraft_plus', 'pinokiofactory/audiocraft_plus', 'github-com-pinokiofactory-audiocraft-plus', 'music', 'All-in-one WebUI for Meta AudioCraft (MusicGen, AudioGen).', 'NVIDIA,AMD'],
  ['MAGNeT', 'cocktailpeanutlabs/magnet', 'github-com-cocktailpeanutlabs-magnet', 'music', 'Text-to-music and text-to-sound.', 'NVIDIA,AMD'],
  ['MiniJam', 'cocktailpeanut/minijam', 'github-com-cocktailpeanut-minijam', 'music', 'Describe a song → caption + lyrics locally → MiniMax Music 3.', 'NVIDIA'],
  ['theDAW', 'gantasmo/theDAW-Pinokio', 'github-com-gantasmo-thedaw-pinokio', 'music', 'Full DAW/DJ/VJ with Stable Audio 3, Magenta RT2, Demucs stems, MIDI.', 'NVIDIA,AMD'],
  ['MuScriptor', 'cocktailpeanut/muscriptor.pinokio', 'github-com-cocktailpeanut-muscriptor-pinokio', 'music', 'Multi-instrument audio-to-MIDI transcription.', 'NVIDIA,AMD,Apple'],
  ['Music Video Cutter', '6Morpheus6/mvc', 'github-com-6morpheus6-mvc', 'music', 'Auto music videos with cuts synced to the beat.', 'NVIDIA'],
  // 🎙 Voice / TTS / voice conversion
  ['Applio', 'pinokiofactory/applio', 'github-com-pinokiofactory-applio', 'voice', 'High-quality RVC voice conversion and training.', 'NVIDIA,AMD,Apple'],
  ['RVC', 'cocktailpeanut/rvc.pinokio', 'github-com-cocktailpeanut-rvc-pinokio', 'voice', 'Retrieval-based Voice Conversion WebUI.', 'NVIDIA,AMD,Apple'],
  ['Seed-VC', 'hoodtronik/seed-vc-pinokio', 'github-com-hoodtronik-seed-vc-pinokio', 'voice', 'Zero-shot, real-time and singing voice conversion.', ''],
  ['Ultimate-TTS-Studio', 'pinokiofactory/Ultimate-TTS-Studio', 'github-com-pinokiofactory-ultimate-tts-studio', 'voice', 'Kokoro, Chatterbox, Fish-Speech, F5, IndexTTS2, VoxCPM, VibeVoice, Higgs in one app.', 'NVIDIA,AMD,Apple'],
  ['e2-f5-tts', 'pinokiofactory/e2-f5-tts', 'github-com-pinokiofactory-e2-f5-tts', 'voice', 'F5-TTS voice cloning.', 'NVIDIA,AMD,Apple'],
  ['XTTS', 'cocktailpeanut/xtts.pinokio', 'github-com-cocktailpeanut-xtts-pinokio', 'voice', 'Clone a voice into other languages from a 3-second clip.', 'NVIDIA,AMD,Apple'],
  ['Qwen3-TTS', 'SUP3RMASS1VE/Qwen3-TTS-Pinokio', 'github-com-sup3rmass1ve-qwen3-tts-pinokio', 'voice', 'Qwen3-TTS — voice design and cloning.', 'NVIDIA,AMD,Apple'],
  ['Voicebox', 'cocktailpeanut/voicebox.pinokio', 'github-com-cocktailpeanut-voicebox-pinokio', 'voice', 'Local voice synthesis studio powered by Qwen3-TTS.', 'NVIDIA,AMD,Apple'],
  ['VoxCPM', 'IAnMove/voxcpm2-pinokio-launcher', 'github-com-ianmove-voxcpm2-pinokio-launcher', 'voice', 'Tokenizer-free multilingual TTS and voice cloning, low VRAM.', 'NVIDIA,AMD'],
  ['DramaBox', 'PierrunoYT/DramaBox-TTS-Pinokio', 'github-com-pierrunoyt-dramabox-tts-pinokio', 'voice', 'Expressive TTS with voice cloning (Resemble AI).', 'NVIDIA,AMD'],
  ['Higgs Audio Studio', 'timoncool/HiggsAudio-Studio-pinokio', 'github-com-timoncool-higgsaudio-studio-pinokio', 'voice', 'Higgs Audio v3 — podcasts, audiobooks, 100+ languages.', 'NVIDIA'],
  ['VibeVoice Realtime', 'pinokiofactory/vibevoice-realtime', 'github-com-pinokiofactory-vibevoice-realtime', 'voice', 'Realtime streaming TTS (Microsoft VibeVoice).', 'NVIDIA,AMD,Apple'],
  ['Chatterbox-Multilingual', 'SUP3RMASS1VE/ChatterBox-Multilingual', 'github-com-sup3rmass1ve-chatterbox-multilingual', 'voice', 'Fast zero-shot multilingual voice cloning.', 'NVIDIA'],
  ['Chattered', '6Morpheus6/Chattered', 'github-com-6morpheus6-chattered', 'voice', 'All-in-one Chatterbox UI for long content.', 'NVIDIA'],
  ['Fish-Speech', 'SUP3RMASS1VE/Fish-Speech', 'github-com-sup3rmass1ve-fish-speech', 'voice', 'Fish-Speech / OpenAudio TTS.', ''],
  ['OpenAudio', 'pinokiofactory/openaudio', 'github-com-pinokiofactory-openaudio', 'voice', 'Multilingual TTS with voice cloning.', 'NVIDIA,AMD'],
  ['zonos', 'pinokiofactory/zonos', 'github-com-pinokiofactory-zonos', 'voice', 'Zonos expressive multilingual TTS.', 'NVIDIA,AMD'],
  ['Dia', 'pinokiofactory/dia', 'github-com-pinokiofactory-dia', 'voice', 'Realistic dialogue from a transcript (Nari Labs).', ''],
  ['Orpheus-TTS-FastAPI', 'pinokiofactory/Orpheus-TTS-FastAPI', 'github-com-pinokiofactory-orpheus-tts-fastapi', 'voice', 'Orpheus emotional TTS (Llama-3B backbone).', ''],
  ['OpenVoice2', 'cocktailpeanutlabs/openvoice2', 'github-com-cocktailpeanutlabs-openvoice2', 'voice', 'Multilingual voice cloning TTS.', 'NVIDIA,AMD'],
  ['StyleTTS2 Studio', 'pinokiofactory/StyleTTS2_Studio', 'github-com-pinokiofactory-styletts2-studio', 'voice', 'Build your own StyleTTS2 voice.', 'NVIDIA'],
  ['AllTalk-TTS v2', '6Morpheus6/alltalk-tts', 'github-com-6morpheus6-alltalk-tts', 'voice', 'XTTS, Piper, Parler, F5 and RVC in one UI with finetuning.', 'NVIDIA,AMD'],
  ['Bark Voice Cloning', 'cocktailpeanutlabs/bark', 'github-com-cocktailpeanutlabs-bark', 'voice', 'Clone a voice from a 20-second WAV with Bark.', 'NVIDIA,AMD'],
  ['MeloTTS', 'cocktailpeanutlabs/melotts', 'github-com-cocktailpeanutlabs-melotts', 'voice', 'Multilingual TTS by MyShell.', 'NVIDIA'],
  ['Whisper-WebUI', 'pinokiofactory/whisper-webui', 'github-com-pinokiofactory-whisper-webui', 'voice', 'Speech-to-text subtitles with Whisper.', 'NVIDIA,AMD'],
  ['Alexandria', 'Finrandojin/alexandria-audiobook', 'github-com-finrandojin-alexandria-audiobook', 'voice', 'Multi-voice audiobook generator on Qwen3-TTS.', 'NVIDIA,AMD,Apple'],
  // 🔊 Audio / SFX
  ['MMAudio', 'pinokiofactory/MMAudio', 'github-com-pinokiofactory-mmaudio', 'audio', 'Synchronized sound effects from video and/or text.', 'NVIDIA'],
  ['AudioSep', 'cocktailpeanut/AudioSep.pinokio', 'github-com-cocktailpeanut-audiosep-pinokio', 'audio', 'Separate any sound you describe.', 'NVIDIA,AMD'],
  ['ZETA', 'cocktailpeanutlabs/zeta', 'github-com-cocktailpeanutlabs-zeta', 'audio', 'Zero-shot text-based audio editing.', 'NVIDIA'],
  ['PulseForge', 'TheAwaken1/PulseForge', 'github-com-theawaken1-pulseforge', 'audio', 'Audio-reactive music video editor with AI lyrics.', ''],
  // 🎬 Video / 🖼 Image / 🧊 3D / tools
  ['Wan2GP', 'pinokiofactory/wan', 'github-com-pinokiofactory-wan', 'video', 'Wan 2.x, Hunyuan, LTX, Flux and Qwen for 6 GB+ GPUs.', 'NVIDIA,AMD,Apple'],
  ['Maestro', 'Blizaine/Maestro', 'github-com-blizaine-maestro', 'video', 'Local AI studio + multi-track editor (MiniMax H3, LTX, Wan, Flux).', 'NVIDIA,AMD,Apple'],
  ['MiniMax H3 ComfyUI', 'ThomasEricB/minimax-h3-pinokio', 'github-com-thomasericb-minimax-h3-pinokio', 'video', 'Omni-modal video with native stereo audio in ComfyUI.', 'NVIDIA'],
  ['ComfyUI', 'pinokiofactory/comfy', 'github-com-pinokiofactory-comfy', 'image', 'Node-based diffusion GUI — runs Flux, SD3, Wan and audio nodes.', 'NVIDIA,AMD,Apple'],
  ['ai-toolkit', 'pinokiofactory/ai-toolkit', 'github-com-pinokiofactory-ai-toolkit', 'image', 'Ostris AI Toolkit — LoRA training for Flux, Wan and more.', 'NVIDIA,AMD,Apple'],
  ['TripoSplat', 'cocktailpeanut/triposplat.pinokio', 'github-com-cocktailpeanut-triposplat-pinokio', '3d', 'Image-to-3D Gaussian splats (VAST).', 'NVIDIA'],
];

// Only ever opens Pinokio's own local install endpoint for a GitHub launcher repo
function oneClickUrl(repoUrl) {
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(String(repoUrl))) throw new Error('Not a GitHub launcher URL');
  return `${LOCAL}/pinokio/download?uri=${encodeURIComponent(repoUrl)}&path=api`;
}

module.exports = { pinokioSearch, pinokioRunning, oneClickUrl, parseCards, categorize, SNAPSHOT };
