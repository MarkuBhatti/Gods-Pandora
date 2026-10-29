// Sort generated content on disk by type: library/Images, Videos, Audio, 3D, Documents, Other.
const fs = require('fs'); const path = require('path');
const MAP = { Images: 'png jpg jpeg webp gif bmp avif tif tiff heic exr', Videos: 'mp4 mov webm mkv avi m4v gif-video', Audio: 'mp3 wav ogg flac m4a aac opus', '3D': 'glb gltf obj fbx ply usdz stl splat', Documents: 'pdf txt md json html csv docx' };
const EXT = {}; for (const [k, v] of Object.entries(MAP)) v.split(' ').forEach((e) => { EXT[e] = k; });
const folderFor = (file) => EXT[path.extname(String(file)).slice(1).toLowerCase()] || 'Other';
// typed('/lib/123.png') → '/lib/Images/123.png' (folder created). Leaves paths already inside a type folder alone.
function typed(file) {
  const dir = path.dirname(file), base = path.basename(file), f = folderFor(file);
  if (path.basename(dir) === f) return file;
  const d = path.join(dir, f); fs.mkdirSync(d, { recursive: true }); return path.join(d, base);
}
module.exports = { typed, folderFor, TYPES: [...Object.keys(MAP), 'Other'] };
