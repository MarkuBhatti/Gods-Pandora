// Built-in audio engine: runs open-source music, voice and sound models on this PC (engine/audio_gen.py).
// Families that need their own library versions (ACE-Step, Chatterbox, F5, XTTS, Parler…) get a private
// runtime that God's Pandora sets up once — no ComfyUI, Ollama or other apps involved.
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const audioFamilies = require('../audioFamilies');

function ctx() {
  const { app } = require('electron');
  const ud = app.getPath('userData');
  const engine = require('../engineManager');
  const venv = path.join(ud, 'engine-venv');
  const py = process.platform === 'win32' ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python');
  const dir = path.join(__dirname, '..', '..', 'engine').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  return { ud, engine, py, dir, script: path.join(dir, 'audio_gen.py') };
}

// the default voice for each family when none is picked
const DEFAULT_VOICE = { bark: 'v2/en_speaker_6', kokoro: 'af_heart', chatterbox: 'en', xtts: 'en:Ana Florence' };

async function generate({ model, prompt, params = {}, hfToken, onProgress }) {
  const { ud, engine, py, dir, script } = ctx();
  if (!fs.existsSync(py)) throw new Error('The built-in audio engine needs the local engine — open Pandora Core & Cloud → Install engine.');
  const repo = model.endpoint;
  const fam = model.family || (audioFamilies.detect(repo) || {}).id || null;
  if (!fam) throw new Error(`${repo} is not supported by the built-in audio engine yet.`);

  // python + working folder for this family (sets up its private runtime the first time)
  let python = py; let cwd = dir;
  if (audioFamilies.NEEDS_SETUP.has(fam)) {
    const rt = await engine.setupAudio(ud, fam, onProgress);
    if (!rt.ok) throw new Error('Setting up the ' + fam + ' audio engine failed: ' + rt.error);
    python = rt.python || py; cwd = rt.cwd || dir;
  }

  const out = path.join(os.tmpdir(), `pandora-audio-${Date.now()}.wav`);
  const job = {
    repo, family: fam, prompt: String(prompt || ''),
    seconds: +params.seconds || (model.audioType === 'speech' ? 0 : 30),
    voice: params.voiceId || DEFAULT_VOICE[fam] || '',
    lyrics: params.lyrics || '', seed: params.seed, steps: params.steps,
  };
  const res = await new Promise((resolve) => {
    const p = cp.spawn(python, [script, out], { windowsHide: true, cwd, env: { ...engine.audioEnv(ud, hfToken), PYTHONIOENCODING: 'utf-8', PYTHONWARNINGS: 'ignore' } });
    require('../jobs').onCancel(() => { try { p.kill(); } catch (_) {} });
    let so = ''; let se = '';
    p.stdout.on('data', (d) => { so += d; });
    p.stderr.on('data', (d) => { se = (se + d).slice(-3000); });
    p.on('error', (e) => resolve({ error: e.message }));
    p.on('close', () => {
      const line = so.trim().split('\n').filter((l) => l.startsWith('{')).pop() || '';
      try { resolve(JSON.parse(line)); } catch (_) { resolve({ error: (se.split('\n').filter(Boolean).slice(-2).join(' ') || 'Local audio failed') }); }
    });
    p.stdin.end(JSON.stringify(job));
  });
  if (res.error) throw new Error('Local audio: ' + res.error);
  const buf = fs.readFileSync(res.file); try { fs.unlinkSync(res.file); } catch (_) {}
  return { dataUrl: 'data:audio/wav;base64,' + buf.toString('base64'), mime: 'audio/wav', note: 'Generated free on your PC with the built-in audio engine (' + (res.device || 'cpu') + ').' };
}

module.exports = { generate };
