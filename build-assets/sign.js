// Windows code signing hook for electron-builder (package.json → build.win.sign).
// Signs God's Pandora.exe, the installer and the uninstaller with Microsoft signtool.
//
// Pick ONE method by setting environment variables before running BUILD.bat
// (or as GitHub Actions secrets). Nothing set → the build stays unsigned and says so.
//
//  A) Certificate in the Windows certificate store (Certum SimplySign cloud cert, a USB token,
//     or any OV/EV cert installed on this PC):
//        set WIN_CERT_SUBJECT=Haider Bhatti          (the "Issued to" name)   — or —
//        set WIN_CERT_SHA1=<certificate thumbprint>
//  B) A .pfx file (older certificates / self-managed):
//        set WIN_CERT_PFX=C:\path\cert.pfx
//        set WIN_CERT_PASSWORD=...
//  C) Azure Artifact Signing (Trusted Signing) — USA/Canada individuals, or companies in US/CA/EU/UK:
//        set AZURE_SIGN_DLIB=C:\path\Azure.CodeSigning.Dlib.dll
//        set AZURE_SIGN_METADATA=C:\path\metadata.json
//     (Azure login: AZURE_TENANT_ID / AZURE_CLIENT_ID / AZURE_CLIENT_SECRET)
//
// Optional: WIN_TIMESTAMP_URL (default http://time.certum.pl — any RFC 3161 server works).

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findSigntool() {
  if (process.env.SIGNTOOL && fs.existsSync(process.env.SIGNTOOL)) return process.env.SIGNTOOL;
  const candidates = [];
  const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
  try {
    for (const v of fs.readdirSync(kits).filter((d) => /^10\./.test(d)).sort().reverse()) candidates.push(path.join(kits, v, 'x64', 'signtool.exe'));
  } catch { /* no SDK */ }
  candidates.push(path.join(kits, 'x64', 'signtool.exe'));
  const cache = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign');
  try {
    for (const d of fs.readdirSync(cache)) candidates.push(path.join(cache, d, 'windows-10', 'x64', 'signtool.exe'));
  } catch { /* no cache yet */ }
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

let warned = false;

exports.default = async function sign(configuration) {
  const file = configuration.path;
  const e = process.env;
  const method = e.AZURE_SIGN_DLIB ? 'azure' : e.WIN_CERT_PFX ? 'pfx' : (e.WIN_CERT_SUBJECT || e.WIN_CERT_SHA1) ? 'store' : null;
  if (!method) {
    if (!warned) { console.log('  • code signing  SKIPPED — no certificate configured (see SIGNING.md). Windows will show a SmartScreen warning.'); warned = true; }
    return;
  }
  const signtool = findSigntool();
  if (!signtool) throw new Error('signtool.exe not found. Install the Windows SDK (Signing Tools) or set SIGNTOOL=path\\to\\signtool.exe');
  const ts = e.WIN_TIMESTAMP_URL || (method === 'azure' ? 'http://timestamp.acs.microsoft.com' : 'http://time.certum.pl');
  const args = ['sign', '/fd', 'sha256', '/tr', ts, '/td', 'sha256', '/d', "God's Pandora"];
  if (method === 'azure') args.push('/dlib', e.AZURE_SIGN_DLIB, '/dmdf', e.AZURE_SIGN_METADATA);
  if (method === 'pfx') args.push('/f', e.WIN_CERT_PFX, ...(e.WIN_CERT_PASSWORD ? ['/p', e.WIN_CERT_PASSWORD] : []));
  if (method === 'store') {
    if (e.WIN_CERT_SHA1) args.push('/sha1', e.WIN_CERT_SHA1); else args.push('/n', e.WIN_CERT_SUBJECT);
    args.push('/a');
  }
  args.push(file);
  console.log(`  • code signing  ${path.basename(file)} via ${method}`);
  for (let attempt = 1; ; attempt++) {
    try { execFileSync(signtool, args, { stdio: 'inherit' }); break; }
    catch (err) {
      if (attempt >= 3) throw new Error(`Signing failed for ${path.basename(file)}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000 * attempt)); // timestamp servers sometimes time out
    }
  }
};
