import React, { useEffect, useRef, useState } from 'react';

// Small self-contained GLB viewer (WebGL2): textures, vertex colours, node transforms, orbit + zoom, auto-rotate.
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const mul = (a, b) => { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; };
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function trs(n) {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1]; const [sx, sy, sz] = n.scale || [1, 1, 1]; const [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, (2 * (x * y + z * w)) * sx, (2 * (x * z - y * w)) * sx, 0, (2 * (x * y - z * w)) * sy, (1 - 2 * (x * x + z * z)) * sy, (2 * (y * z + x * w)) * sy, 0, (2 * (x * z + y * w)) * sz, (2 * (y * z - x * w)) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
async function parseGlb(buf) {
  const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('Not a GLB file');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) { const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true); const body = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)); else if (type === 0x004e4942) bin = body; off += 8 + len; }
  const acc = (i) => { const a = json.accessors[i]; const bv = json.bufferViews[a.bufferView]; const T = COMP[a.componentType]; const n = NUM[a.type];
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0); const stride = bv.byteStride || 0; const es = T.BYTES_PER_ELEMENT * n;
    let arr; if (!stride || stride === es) arr = new T(bin, start, a.count * n); else { arr = new T(a.count * n); const src = new DataView(bin); for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const p = start + k * stride + c * T.BYTES_PER_ELEMENT; arr[k * n + c] = T === Float32Array ? src.getFloat32(p, true) : T === Uint16Array ? src.getUint16(p, true) : T === Uint8Array ? src.getUint8(p) : src.getUint32(p, true); } }
    if (a.normalized && T !== Float32Array) { const max = T === Uint8Array ? 255 : T === Uint16Array ? 65535 : 1; arr = Float32Array.from(arr, (v) => v / max); }
    return { arr, n, count: a.count }; };
  const images = {}; const img = async (ti) => { const tex = json.textures?.[ti]; if (!tex) return null; const im = json.images[tex.source]; if (images[tex.source] !== undefined) return images[tex.source];
    const bv = json.bufferViews[im.bufferView]; const blob = new Blob([new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength)], { type: im.mimeType || 'image/png' }); return (images[tex.source] = await createImageBitmap(blob, { imageOrientation: 'none' })); };
  const prims = [];
  const visit = async (ni, parent) => { const n = json.nodes[ni]; const m = mul(parent, trs(n));
    if (n.mesh != null) for (const p of json.meshes[n.mesh].primitives) { if (p.mode != null && p.mode !== 4) continue;
      const pos = acc(p.attributes.POSITION); const mat = json.materials?.[p.material]?.pbrMetallicRoughness || {};
      prims.push({ m, pos, nrm: p.attributes.NORMAL != null ? acc(p.attributes.NORMAL) : null, uv: p.attributes.TEXCOORD_0 != null ? acc(p.attributes.TEXCOORD_0) : null, col: p.attributes.COLOR_0 != null ? acc(p.attributes.COLOR_0) : null,
        idx: p.indices != null ? acc(p.indices) : null, color: mat.baseColorFactor || [0.82, 0.8, 0.78, 1], tex: mat.baseColorTexture ? await img(mat.baseColorTexture.index) : null }); }
    for (const c of n.children || []) await visit(c, m); };
  const scene = json.scenes?.[json.scene || 0]; for (const r of scene ? scene.nodes : json.nodes.map((_, i) => i)) await visit(r, I4);
  return prims;
}
const VS = `#version 300 es
in vec3 p; in vec3 n; in vec2 t; in vec4 c; uniform mat4 M, VP; out vec3 vn; out vec2 vt; out vec4 vc; void main(){ vn=mat3(M)*n; vt=t; vc=c; gl_Position=VP*M*vec4(p,1.); }`;
const FS = `#version 300 es
precision highp float; in vec3 vn; in vec2 vt; in vec4 vc; uniform sampler2D T; uniform float HT; uniform vec4 BC; out vec4 o;
void main(){ vec3 N=normalize(vn); if(!gl_FrontFacing) N=-N; vec4 base=BC*vc*(HT>.5?texture(T,vt):vec4(1)); vec3 L=normalize(vec3(.5,.8,.6));
  float d=max(dot(N,L),0.); float hemi=.5+.5*N.y; vec3 col=base.rgb*(.25+.55*d+.35*hemi)+pow(max(dot(reflect(-L,N),vec3(0,0,1)),0.),24.)*.08; o=vec4(pow(col,vec3(1./1.1)),1.); }`;

export default function GlbViewer({ file, height = 420 }) {
  const ref = useRef(null); const [err, setErr] = useState(''); const [info, setInfo] = useState('');
  useEffect(() => {
    let stop = false, raf = 0; const cv = ref.current; const gl = cv.getContext('webgl2', { antialias: true }); if (!gl) { setErr('WebGL2 not available'); return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    const U = (n) => gl.getUniformLocation(pr, n); const A = (n) => gl.getAttribLocation(pr, n);
    const cam = { yaw: 0.6, pitch: 0.25, dist: 3, auto: true, cx: 0, cy: 0, cz: 0 }; let draws = [];
    (async () => {
      try {
        const d = await window.api.dataUrl(file); const buf = await (await fetch(d)).arrayBuffer(); if (stop) return;
        const prims = await parseGlb(buf); let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; let tris = 0;
        for (const p of prims) {
          const P = p.pos.arr; const cnt = p.pos.count; for (let i = 0; i < cnt; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; const m = p.m; const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14]; mn = [Math.min(mn[0], wx), Math.min(mn[1], wy), Math.min(mn[2], wz)]; mx = [Math.max(mx[0], wx), Math.max(mx[1], wy), Math.max(mx[2], wz)]; }
          let N = p.nrm?.arr; const idx = p.idx ? Uint32Array.from(p.idx.arr) : Uint32Array.from({ length: cnt }, (_, i) => i);
          if (!N) { N = new Float32Array(cnt * 3); for (let i = 0; i < idx.length; i += 3) { const [a, b, c] = [idx[i], idx[i + 1], idx[i + 2]]; const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]]; const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; for (const v of [a, b, c]) for (let k = 0; k < 3; k++) N[v * 3 + k] += n[k]; } }
          const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
          const attr = (name, data, size) => { const loc = A(name); if (loc < 0) return; if (!data) { gl.disableVertexAttribArray(loc); return; } const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data instanceof Float32Array ? data : Float32Array.from(data), gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
          attr('p', P, 3); attr('n', N, 3); attr('t', p.uv ? p.uv.arr : null, 2);
          if (p.col) attr('c', p.col.arr, p.col.n); else { const l = A('c'); gl.disableVertexAttribArray(l); gl.vertexAttrib4f(l, 1, 1, 1, 1); }
          if (!p.uv) { const l = A('t'); gl.vertexAttrib2f(l, 0, 0); }
          const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
          let tex = null; if (p.tex) { tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, p.tex); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
          draws.push({ vao, n: idx.length, m: p.m, tex, color: p.color }); tris += idx.length / 3;
        }
        cam.cx = (mn[0] + mx[0]) / 2; cam.cy = (mn[1] + mx[1]) / 2; cam.cz = (mn[2] + mx[2]) / 2; const r = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2 || 1; cam.dist = r * 2.6; cam.r = r;
        setInfo(`${Math.round(tris).toLocaleString()} triangles · ${draws.some((d) => d.tex) ? 'textured' : 'vertex colour / clay'}`);
      } catch (e) { setErr(String(e.message || e)); }
    })();
    const persp = (f, a, n, fa) => { const t = 1 / Math.tan(f / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]; };
    const look = (e, c) => { const z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; const zl = Math.hypot(...z); z.forEach((v, i) => { z[i] = v / zl; }); const x = [z[2], 0, -z[0]]; const xl = Math.hypot(...x) || 1; x.forEach((v, i) => { x[i] = v / xl; }); const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]; };
    const frame = () => { if (stop) return; raf = requestAnimationFrame(frame);
      const w = cv.clientWidth * devicePixelRatio, h = cv.clientHeight * devicePixelRatio; if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.viewport(0, 0, w, h); gl.clearColor(0.05, 0.05, 0.07, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST); if (!draws.length) return;
      if (cam.auto) cam.yaw += 0.004;
      const e = [cam.cx + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist, cam.cy + Math.sin(cam.pitch) * cam.dist, cam.cz + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist];
      const VP = mul(persp(0.75, w / h, cam.dist * 0.01, cam.dist * 10), look(e, [cam.cx, cam.cy, cam.cz]));
      gl.useProgram(pr); gl.uniformMatrix4fv(U('VP'), false, VP);
      for (const d of draws) { gl.bindVertexArray(d.vao); gl.uniformMatrix4fv(U('M'), false, d.m); gl.uniform4fv(U('BC'), d.color); gl.uniform1f(U('HT'), d.tex ? 1 : 0); if (d.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, d.tex); gl.uniform1i(U('T'), 0); } gl.drawElements(gl.TRIANGLES, d.n, gl.UNSIGNED_INT, 0); } };
    frame();
    let drag = null; const down = (ev) => { drag = [ev.clientX, ev.clientY]; cam.auto = false; cv.setPointerCapture(ev.pointerId); };
    const move = (ev) => { if (!drag) return; cam.yaw -= (ev.clientX - drag[0]) * 0.01; cam.pitch = Math.max(-1.4, Math.min(1.4, cam.pitch + (ev.clientY - drag[1]) * 0.01)); drag = [ev.clientX, ev.clientY]; };
    const up = () => { drag = null; }; const wheel = (ev) => { ev.preventDefault(); cam.dist *= Math.exp(ev.deltaY * 0.001); };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('wheel', wheel, { passive: false });
    return () => { stop = true; cancelAnimationFrame(raf); cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('wheel', wheel); };
  }, [file]);
  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={ref} style={{ width: '100%', height, display: 'block', borderRadius: 12, cursor: 'grab', background: '#0c0c12' }} />
      <div className="sub" style={{ position: 'absolute', left: 10, bottom: 8, fontSize: 11 }}>{err ? '⚠ ' + err : info || 'Loading model…'} · drag to orbit · scroll to zoom</div>
    </div>
  );
}
