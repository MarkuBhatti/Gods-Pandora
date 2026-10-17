// Free, offline text-to-speech using the voice built into the operating system
// (Windows SAPI / macOS "say" / Linux espeak). No key, no cost — used by Pandora Agent in Free mode.
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = cp.spawn(cmd, args, { windowsHide: true, ...opts });
    let err = '';
    p.stderr && p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-300) || cmd + ' failed'))));
  });
}

// returns the path of a .wav file
async function speak(text, outWav, { voiceHint = 'female', rate = 0 } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 6000);
  if (!clean) throw new Error('Nothing to say.');
  fs.mkdirSync(path.dirname(outWav), { recursive: true });
  if (process.platform === 'win32') {
    const txt = outWav.replace(/\.wav$/i, '.txt');
    fs.writeFileSync(txt, clean, 'utf8');
    const ps = [
      'Add-Type -AssemblyName System.Speech;',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;',
      `try { $s.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::${voiceHint === 'male' ? 'Male' : 'Female'}) } catch {};`,
      `$s.Rate = ${Math.max(-10, Math.min(10, rate | 0))};`,
      `$s.SetOutputToWaveFile('${outWav.replace(/'/g, "''")}');`,
      `$s.Speak([IO.File]::ReadAllText('${txt.replace(/'/g, "''")}'));`,
      '$s.Dispose();',
    ].join(' ');
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
    try { fs.unlinkSync(txt); } catch (_) {}
  } else if (process.platform === 'darwin') {
    await run('say', ['-o', outWav, '--data-format=LEI16@22050', clean]);
  } else {
    await run('espeak', ['-w', outWav, clean]);
  }
  if (!fs.existsSync(outWav)) throw new Error('The system voice could not be recorded.');
  return outWav;
}

module.exports = { speak };
