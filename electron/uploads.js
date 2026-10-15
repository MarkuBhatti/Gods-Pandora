// Upload local files (images, videos, zips) to a provider's storage so cloud models can read them.
//  • FAL:        POST https://rest.fal.ai/storage/upload/initiate → PUT bytes → public file_url
//  • Higgsfield: POST https://api.higgsfield.ai/files/generate-upload-url → PUT bytes → public_url
const fs = require('fs');
const path = require('path');

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', wav: 'audio/wav', mp3: 'audio/mpeg', zip: 'application/zip',
};
const mimeOf = (file) => MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream';

function readInput(input) {
  // accepts a local path or a data URL
  const m = String(input).match(/^data:([^;]+);base64,(.*)$/s);
  if (m) return { buf: Buffer.from(m[2], 'base64'), type: m[1] === 'image/jpg' ? 'image/jpeg' : m[1], name: 'upload.' + (m[1].split('/')[1] || 'bin') };
  if (/^https?:\/\//.test(input)) return { url: input };
  if (!fs.existsSync(input)) throw new Error('File not found: ' + input);
  return { buf: fs.readFileSync(input), type: mimeOf(input), name: path.basename(input) };
}

async function uploadFal(input, key) {
  const f = readInput(input);
  if (f.url) return f.url;
  const init = await fetch('https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: f.name.replace(/[^\w.-]+/g, '_'), content_type: f.type }),
  });
  const j = await init.json().catch(() => ({}));
  if (!init.ok || !j.upload_url) throw new Error('FAL upload failed (' + init.status + '): ' + JSON.stringify(j).slice(0, 200));
  const put = await fetch(j.upload_url, { method: 'PUT', headers: { 'Content-Type': f.type }, body: f.buf });
  if (!put.ok) throw new Error('FAL upload PUT failed: ' + put.status);
  return j.file_url;
}

async function uploadHiggsfield(input, key) {
  const f = readInput(input);
  if (f.url) return f.url;
  const okTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'audio/wav'];
  if (!okTypes.includes(f.type)) throw new Error('Higgsfield accepts JPEG/PNG/WEBP images and MP4 video — convert ' + f.name + ' first.');
  const r = await fetch('https://api.higgsfield.ai/files/generate-upload-url', {
    method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: f.type }),
  });
  const up = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Higgsfield upload error ' + r.status + ': ' + JSON.stringify(up).slice(0, 200));
  const put = await fetch(up.upload_url, { method: 'PUT', headers: up.upload_headers || { 'Content-Type': f.type }, body: f.buf });
  if (!put.ok) throw new Error('Higgsfield upload failed: ' + put.status);
  return up.public_url;
}

async function upload(provider, input, key) {
  if (provider === 'fal') return uploadFal(input, key);
  if (provider === 'higgsfield') return uploadHiggsfield(input, key);
  throw new Error('No upload support for provider ' + provider);
}

// ── Minimal ZIP writer (stored, no compression) for LoRA training datasets ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zipFiles(entries) { // [{ name, data: Buffer }]
  const locals = []; const centrals = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'); const crc = crc32(e.data); const size = e.data.length;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(size, 18); lh.writeUInt32LE(size, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, e.data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(size, 20); ch.writeUInt32LE(size, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(0, 30); ch.writeUInt32LE(0, 34); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + size;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

module.exports = { upload, uploadFal, uploadHiggsfield, zipFiles, mimeOf, crc32 };
