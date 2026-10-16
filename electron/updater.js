// App self-update via electron-updater + GitHub Releases.
// The GitHub owner/repo comes from package.json → build.publish, and can be overridden
// from the Update page (stored in <userData>/update-config.json).
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');

let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch (_) { /* dev without deps */ }

const PLACEHOLDER = 'YOUR_GITHUB_USERNAME';
let send = () => {};
let state = { status: 'idle', info: null, progress: null, error: null };

function defaults() {
  const pub = [].concat((pkg.build && pkg.build.publish) || [])[0] || {};
  return { owner: pub.owner || PLACEHOLDER, repo: pub.repo || 'gods-pandora', channel: 'stable', autoCheck: true };
}
const cfgPath = () => path.join(app.getPath('userData'), 'update-config.json');

function getConfig() {
  try { return { ...defaults(), ...JSON.parse(fs.readFileSync(cfgPath(), 'utf8')) }; }
  catch (_) { return defaults(); }
}
function setConfig(patch) {
  const next = { ...getConfig(), ...(patch || {}) };
  fs.writeFileSync(cfgPath(), JSON.stringify(next, null, 2));
  return next;
}

function emit(patch) {
  state = { ...state, ...patch };
  send({ ...state, version: app.getVersion() });
}

function configure() {
  if (!autoUpdater) throw new Error('electron-updater is not installed. Run "npm install" and rebuild.');
  const cfg = getConfig();
  if (!cfg.owner || cfg.owner === PLACEHOLDER) {
    throw new Error('Set your GitHub username / repo below (where you publish God\'s Pandora releases), then check again.');
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = cfg.channel === 'beta';
  autoUpdater.setFeedURL({ provider: 'github', owner: cfg.owner, repo: cfg.repo });
  return cfg;
}

function init(sender) {
  send = sender;
  if (!autoUpdater) return;
  autoUpdater.logger = null;
  autoUpdater.on('checking-for-update', () => emit({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (info) => emit({ status: 'available', info: slim(info) }));
  autoUpdater.on('update-not-available', (info) => emit({ status: 'latest', info: slim(info) }));
  autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', progress: { percent: p.percent, transferred: p.transferred, total: p.total, bps: p.bytesPerSecond } }));
  autoUpdater.on('update-downloaded', (info) => emit({ status: 'downloaded', info: slim(info), progress: null }));
  autoUpdater.on('error', (err) => emit({ status: 'error', error: friendly(err) }));

  // Quiet background check shortly after launch (installed builds only)
  const cfg = getConfig();
  if (app.isPackaged && cfg.autoCheck && cfg.owner !== PLACEHOLDER) {
    setTimeout(() => { check().catch(() => {}); }, 8000);
  }
}

function slim(info) {
  if (!info) return null;
  const notes = Array.isArray(info.releaseNotes)
    ? info.releaseNotes.map((n) => n.note || '').join('\n')
    : (info.releaseNotes || '');
  return { version: info.version, releaseName: info.releaseName || '', releaseDate: info.releaseDate || '', notes: String(notes).replace(/<[^>]+>/g, '').slice(0, 4000) };
}

function friendly(err) {
  const m = String((err && err.message) || err);
  if (/404|Cannot find latest\.yml|No published versions/i.test(m)) {
    return 'No release with update files found on GitHub yet. Publish a release that includes "latest.yml" and the Setup .exe (the GitHub Action does this when you push a v* tag).';
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|net::/i.test(m)) return 'Could not reach GitHub — check your internet connection.';
  return m.split('\n')[0].slice(0, 300);
}

async function check() {
  if (!app.isPackaged) {
    const e = 'Self-update only works in the installed app (not when running "npm run dev").';
    emit({ status: 'error', error: e });
    return { ok: false, error: e };
  }
  try {
    configure();
    const r = await autoUpdater.checkForUpdates();
    return { ok: true, info: slim(r && r.updateInfo) };
  } catch (err) {
    const e = friendly(err);
    emit({ status: 'error', error: e });
    return { ok: false, error: e };
  }
}

async function download() {
  try { configure(); await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (err) { const e = friendly(err); emit({ status: 'error', error: e }); return { ok: false, error: e }; }
}

function install() {
  if (state.status !== 'downloaded') return { ok: false, error: 'Download the update first.' };
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return { ok: true };
}

function status() {
  return { ...state, version: app.getVersion(), packaged: app.isPackaged, config: getConfig() };
}

module.exports = { init, check, download, install, status, getConfig, setConfig };
