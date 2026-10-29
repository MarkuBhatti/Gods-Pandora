// Open-source audio models God's Pandora runs itself (built-in audio engine — no ComfyUI / Ollama / other apps).
// Mirrors engine/audio_families.py. Used by the main process (listing, download info, generation).
//   runtime 'engine'   → runs in the app's engine Python
//   runtime 'isolated' → needs its own library versions → the app builds a private runtime once (Set up)
const FAMILIES = [
  { id: 'acestep',     rx: /ace-?step/i,                                         runtime: 'isolated', audioType: 'music',  label: 'ACE-Step', setupGB: 7, lyrics: true },
  { id: 'kokoro',      rx: /kokoro/i,                                            runtime: 'engine',   audioType: 'speech', label: 'Kokoro', setupGB: 0.5 },
  { id: 'chatterbox',  rx: /chatterbox/i,                                        runtime: 'isolated', audioType: 'speech', label: 'Chatterbox', setupGB: 5 },
  { id: 'f5',          rx: /f5-?tts/i,                                           runtime: 'isolated', audioType: 'speech', label: 'F5-TTS', setupGB: 5 },
  { id: 'xtts',        rx: /(^|\/)xtts/i,                                             runtime: 'isolated', audioType: 'speech', label: 'XTTS', setupGB: 5 },
  { id: 'parler',      rx: /parler/i,                                            runtime: 'isolated', audioType: 'speech', label: 'Parler-TTS', setupGB: 5 },
  { id: 'musicgen',    rx: /musicgen/i,                                          runtime: 'engine',   audioType: 'music',  label: 'MusicGen' },
  { id: 'bark',        rx: /(^|\/)bark/i,                                        runtime: 'engine',   audioType: 'speech', label: 'Bark' },
  { id: 'stableaudio', rx: /stable-audio-open/i,                                 runtime: 'engine',   audioType: 'music',  label: 'Stable Audio Open' },
  { id: 'audioldm',    rx: /audioldm|musicldm/i,                                 runtime: 'engine',   audioType: 'sfx',    label: 'AudioLDM' },
  { id: 'tts',         rx: /mms-tts|(^|\/)vits|speecht5|seamless|(^|\/)fastspeech/i, runtime: 'engine', audioType: 'speech', label: 'Speech' },
];

// families that need a one-time "Set up" before first use (engine extras + private runtimes)
const NEEDS_SETUP = new Set(['acestep', 'kokoro', 'chatterbox', 'f5', 'xtts', 'parler']);

// generative audio only (speech-to-text models like Whisper are used elsewhere, not in Create)
const AUDIO_PIPELINES = /^(text-to-speech|text-to-audio)$/;

function detect(repo) {
  const r = String(repo || '');
  return FAMILIES.find((f) => f.rx.test(r)) || null;
}

// Is this repo an audio model at all? (pipeline tag from the Hub / saved meta, or a known family)
function isAudio(repo, pipelineTag) {
  return AUDIO_PIPELINES.test(pipelineTag || '') || !!detect(repo);
}

module.exports = { FAMILIES, NEEDS_SETUP, detect, isAudio };
