// System voice — free, offline text-to-speech with the voices built into Windows / macOS.
const fs = require('fs');
const os = require('os');
const path = require('path');

async function generate({ prompt, params = {} }) {
  const out = path.join(os.tmpdir(), `pandora-voice-${Date.now()}.wav`);
  await require('../tts').speak(prompt, out, { voiceHint: params.voiceId === 'male' ? 'male' : 'female', rate: +params.rate || 0 });
  const buf = fs.readFileSync(out); try { fs.unlinkSync(out); } catch (_) {}
  return { dataUrl: 'data:audio/wav;base64,' + buf.toString('base64'), mime: 'audio/wav', note: 'Spoken by your system voice (free, offline).' };
}

module.exports = { generate };
