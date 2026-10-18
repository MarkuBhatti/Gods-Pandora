// Free local audio (MusicGen music, Bark voices) via engine/audio_gen.py in the local engine's Python.
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function paths() {
  const { app } = require('electron');
  const ud = app.getPath('userData');
  const py = process.platform === 'win32' ? path.join(ud, 'engine-venv', 'Scripts', 'python.exe') : path.join(ud, 'engine-venv', 'bin', 'python');
  const engine = path.join(__dirname, '..', '..', 'engine').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  return { ud, py, script: path.join(engine, 'audio_gen.py') };
}

async function generate({ model, prompt, params = {} }) {
  const { ud, py, script } = paths();
  if (!fs.existsSync(py)) throw new Error('Free local audio needs the local engine — open Pandora Core & Cloud → Install engine.');
  const task = model.audioType === 'music' || model.audioType === 'sfx' ? 'music' : 'speech';
  const out = path.join(os.tmpdir(), `pandora-audio-${Date.now()}.wav`);
  const seconds = String(Math.max(2, Math.min(30, +params.seconds || 10)));
  const preset = params.voiceId || (task === 'speech' ? 'v2/en_speaker_6' : '');
  const res = await new Promise((resolve) => {
    const p = cp.spawn(py, [script, task, model.endpoint, out, seconds, preset], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONWARNINGS: 'ignore', HF_HOME: path.join(ud, 'models'), HF_HUB_DISABLE_SYMLINKS_WARNING: '1' },
    });
    require('../jobs').onCancel(() => { try { p.kill(); } catch (_) {} });
    let so = '', se = '';
    p.stdout.on('data', (d) => { so += d; });
    p.stderr.on('data', (d) => { se = (se + d).slice(-2000); });
    p.on('error', (e) => resolve({ error: e.message }));
    p.on('close', () => {
      const line = so.trim().split('\n').filter(Boolean).pop() || '';
      try { resolve(JSON.parse(line)); } catch (_) { resolve({ error: (se.split('\n').filter(Boolean).slice(-2).join(' ') || 'Local audio failed') }); }
    });
    p.stdin.end(String(prompt || ''));
  });
  if (res.error) throw new Error('Local audio: ' + res.error);
  const buf = fs.readFileSync(res.file); try { fs.unlinkSync(res.file); } catch (_) {}
  return { dataUrl: 'data:audio/wav;base64,' + buf.toString('base64'), mime: 'audio/wav', note: 'Generated free on your PC (' + (res.device || 'cpu') + ').' };
}

module.exports = { generate };
