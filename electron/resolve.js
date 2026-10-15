// DaVinci Resolve bridge — imports generated media into the current Resolve project's media pool
// via Resolve's official Python scripting API. Resolve must be running (Studio or free with scripting enabled).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveEnv() {
  const env = { ...process.env };
  if (process.platform === 'darwin') {
    env.RESOLVE_SCRIPT_API = env.RESOLVE_SCRIPT_API || '/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting';
    env.RESOLVE_SCRIPT_LIB = env.RESOLVE_SCRIPT_LIB || '/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so';
  } else if (process.platform === 'win32') {
    const pd = env.PROGRAMDATA || 'C:\\ProgramData';
    env.RESOLVE_SCRIPT_API = env.RESOLVE_SCRIPT_API || path.join(pd, 'Blackmagic Design', 'DaVinci Resolve', 'Support', 'Developer', 'Scripting');
    env.RESOLVE_SCRIPT_LIB = env.RESOLVE_SCRIPT_LIB || 'C:\\Program Files\\Blackmagic Design\\DaVinci Resolve\\fusionscript.dll';
  }
  env.PYTHONPATH = [env.PYTHONPATH, env.RESOLVE_SCRIPT_API ? path.join(env.RESOLVE_SCRIPT_API, 'Modules') : ''].filter(Boolean).join(path.delimiter);
  return env;
}

function sendToResolve(pythonCmd, files) {
  return new Promise((resolve) => {
    const script = `
import sys, json
try:
    import DaVinciResolveScript as dvr
    r = dvr.scriptapp("Resolve")
    if not r: raise RuntimeError("Resolve is not running")
    pm = r.GetProjectManager()
    proj = pm.GetCurrentProject() or pm.CreateProject("Gods Pandora")
    mp = proj.GetMediaPool()
    items = mp.ImportMedia(json.loads(sys.argv[1]))
    print("OK imported", len(items or []))
except Exception as e:
    print("ERR", e); sys.exit(1)
`;
    const tmp = path.join(os.tmpdir(), 'gods_eye_resolve.py');
    fs.writeFileSync(tmp, script);
    const p = spawn(pythonCmd, [tmp, JSON.stringify(files)], { env: resolveEnv() });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve(code === 0
      ? { ok: true, message: out.trim() }
      : { ok: false, error: 'Resolve import failed — is DaVinci Resolve running with scripting enabled? ' + out.trim().slice(0, 300) }));
    p.on('error', () => resolve({ ok: false, error: 'Python not found for Resolve bridge.' }));
  });
}
module.exports = { sendToResolve };
