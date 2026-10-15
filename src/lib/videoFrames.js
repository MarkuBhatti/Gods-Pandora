// Read duration / size and sample still frames from a local video (via data URL so the canvas isn't tainted).
async function loadVideo(file) {
  const src = await window.api.dataUrl(file);
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = src;
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error('Could not read this video (use MP4 / H.264).'));
  });
}

function seek(v, t) {
  return new Promise((resolve) => {
    const done = () => { v.removeEventListener('seeked', done); resolve(); };
    v.addEventListener('seeked', done);
    v.currentTime = Math.min(Math.max(0, t), Math.max(0, (v.duration || 0) - 0.05));
  });
}

function grab(v, maxSide = 1024) {
  const s = Math.min(1, maxSide / Math.max(v.videoWidth || 1, v.videoHeight || 1));
  const c = document.createElement('canvas');
  c.width = Math.round((v.videoWidth || 640) * s); c.height = Math.round((v.videoHeight || 360) * s);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}

export async function videoInfo(file) {
  const v = await loadVideo(file);
  const w = v.videoWidth, h = v.videoHeight;
  const r = w / h;
  const aspect = r > 1.5 ? '16:9' : r < 0.7 ? '9:16' : r < 0.9 ? '4:5' : '1:1';
  return { duration: v.duration, width: w, height: h, aspect };
}

// count frames spread evenly (first frame at 0.1s)
export async function sampleFrames(file, count = 8) {
  const v = await loadVideo(file);
  const d = v.duration || 1;
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.1 : Math.min(d - 0.05, 0.1 + (i * (d - 0.2)) / (count - 1));
    await seek(v, t);
    out.push({ t, dataUrl: grab(v) });
  }
  return { duration: d, frames: out };
}

export async function frameAt(file, t) {
  const v = await loadVideo(file);
  await seek(v, t);
  return grab(v, 1536);
}
