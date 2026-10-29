// Pandora Phone Camera — move your phone to drive the Blender camera live (handheld moves recorded as keyframes).
// Phone  ── HTTPS + WebSocket (LAN, self-signed cert, token) ──▶ Pandora ◀── HTTP 127.0.0.1 poll ── Blender add-on
// Motion sensors on phones only work on secure pages, hence the per-install self-signed certificate.
'use strict';
const fs = require('fs'); const path = require('path'); const os = require('os'); const crypto = require('crypto');
const https = require('https'); const http = require('http');
const { WebSocketServer } = require('ws');
const qr = require('./qr');

const PHONE_PORT = 8790, BLENDER_PORT = 8791;
let dir = null, srvPhone = null, srvLocal = null, wss = null, token = null;
let pose = { q: [1, 0, 0, 0], mv: [0, 0], up: 0, lens: 35, rec: false, recenter: 0, t: 0 };
let phoneSeen = 0, blenderSeen = 0, phones = 0;

function lanIPs() { const out = []; for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address); return out; }
// pick the most likely home-Wi-Fi address (192.168.x / 10.x / 172.16-31.x), avoiding virtual adapters when possible
function bestIP() { const ips = lanIPs(); return ips.find((i) => i.startsWith('192.168.')) || ips.find((i) => i.startsWith('10.')) || ips.find((i) => /^172\.(1[6-9]|2\d|3[01])\./.test(i)) || ips[0] || '127.0.0.1'; }

// ── self-signed certificate (tiny DER writer; RSA-2048 / SHA-256, SAN = LAN IPs + localhost) ──
const L = (n) => n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]);
const der = (tag, ...p) => { const b = Buffer.concat(p); return Buffer.concat([Buffer.from([tag]), L(b.length), b]); };
const seq = (...p) => der(0x30, ...p);
const int = (b) => der(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b);
const oid = (s) => { const a = s.split('.').map(Number); const o = [40 * a[0] + a[1]]; for (const v of a.slice(2)) { const t = [v & 127]; let x = v; while ((x = Math.floor(x / 128))) t.unshift((x & 127) | 128); o.push(...t); } return der(0x06, Buffer.from(o)); };
const utc = (d) => der(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
function makeCert(ips) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const name = seq(der(0x31, seq(oid('2.5.4.3'), der(0x0c, Buffer.from('Pandora Phone Camera')))));
  const alg = seq(oid('1.2.840.113549.1.1.11'), der(0x05));
  const san = seq(oid('2.5.29.17'), der(0x04, seq(...ips.map((ip) => der(0x87, Buffer.from(ip.split('.').map(Number)))), der(0x82, Buffer.from('localhost')))));
  const serial = crypto.randomBytes(16); serial[0] &= 0x7f;
  const now = Date.now();
  const tbs = seq(der(0xa0, int(Buffer.from([2]))), int(serial), alg, name, seq(utc(new Date(now - 864e5)), utc(new Date(now + 5 * 365 * 864e5))), name,
    publicKey.export({ type: 'spki', format: 'der' }), der(0xa3, seq(san)));
  const sig = crypto.sign('sha256', tbs, privateKey);
  const cert = seq(tbs, alg, der(0x03, Buffer.concat([Buffer.from([0]), sig])));
  const pem = (b, t) => `-----BEGIN ${t}-----\n${b.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${t}-----\n`;
  return { cert: pem(cert, 'CERTIFICATE'), key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}
function certFor(ips) {
  const f = path.join(dir, 'cert.json'); let c = null; try { c = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) {}
  if (!c || c.ips.join() !== ips.join()) { c = { ips, ...makeCert(ips) }; fs.writeFileSync(f, JSON.stringify(c)); }
  return c;
}

function urlFor() { return `https://${bestIP()}:${PHONE_PORT}/?k=${token}`; }

function start(userData) {
  dir = path.join(userData, 'camrig'); fs.mkdirSync(dir, { recursive: true });
  if (srvPhone) return status();
  const tf = path.join(dir, 'token'); try { token = fs.readFileSync(tf, 'utf8').trim(); } catch (_) {} if (!token) { token = crypto.randomBytes(9).toString('base64url'); fs.writeFileSync(tf, token); }
  const c = certFor(lanIPs().concat(['127.0.0.1']));
  srvPhone = https.createServer({ cert: c.cert, key: c.key }, (req, res) => {
    const u = new URL(req.url, 'https://x');
    if (u.pathname === '/' && u.searchParams.get('k') === token) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(PHONE_PAGE); }
    res.writeHead(403); res.end('Open the link shown in God\'s Pandora (Phone Camera tab).');
  });
  wss = new WebSocketServer({ server: srvPhone });
  wss.on('connection', (ws, req) => {
    const u = new URL(req.url, 'https://x'); if (u.searchParams.get('k') !== token) return ws.close();
    phones++;
    const tick = setInterval(() => { try { ws.send(JSON.stringify({ blender: Date.now() - blenderSeen < 1500 })); } catch (_) {} }, 1000);
    ws.on('message', (m) => { try { const d = JSON.parse(m); if (Array.isArray(d.q) && d.q.length === 4) { pose = { ...pose, ...d, t: Date.now() }; phoneSeen = Date.now(); } } catch (_) {} });
    ws.on('close', () => { phones = Math.max(0, phones - 1); clearInterval(tick); });
  });
  srvPhone.on('error', (e) => { lastError = e.message; });
  srvPhone.listen(PHONE_PORT, '0.0.0.0');
  srvLocal = http.createServer((req, res) => {
    if (req.url.startsWith('/pose')) { blenderSeen = Date.now(); res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ...pose, live: Date.now() - phoneSeen < 1000 })); }
    res.writeHead(404); res.end();
  });
  srvLocal.on('error', (e) => { lastError = e.message; });
  srvLocal.listen(BLENDER_PORT, '127.0.0.1');
  return status();
}
let lastError = '';
function stop() { try { wss && wss.close(); } catch (_) {} try { srvPhone && srvPhone.close(); } catch (_) {} try { srvLocal && srvLocal.close(); } catch (_) {} srvPhone = srvLocal = wss = null; phones = 0; return status(); }
function status() {
  const on = !!srvPhone; const url = on ? urlFor() : '';
  return { on, url, qr: on ? qr.svg(url, { px: 6 }) : '', ips: lanIPs(), phones, phoneLive: Date.now() - phoneSeen < 1000, blender: Date.now() - blenderSeen < 1500, pose, error: lastError };
}
function writeAddon(userData) { const d = path.join(userData, 'camrig'); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, 'pandora_phone_camera.py'); fs.writeFileSync(f, ADDON); return f; }

// ───────────────────────── phone page ─────────────────────────
const PHONE_PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Pandora Camera</title><style>
*{box-sizing:border-box;-webkit-user-select:none;user-select:none;touch-action:none}html,body{margin:0;height:100%;background:#07070a;color:#eee;font:14px -apple-system,system-ui,sans-serif;overflow:hidden}
#start{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;z-index:5;background:#07070a;text-align:center;padding:24px}
#start h1{font:400 34px Georgia,serif;margin:0}#start h1 i{color:#f3c06b}
.big{padding:16px 28px;border-radius:16px;border:0;background:linear-gradient(180deg,#ffd99a,#e9a94c);color:#1a1205;font:600 17px system-ui}
.ui{position:fixed;inset:0;display:grid;grid-template-columns:1fr 120px 1fr;gap:12px;padding:14px}
.pad{position:relative;border-radius:22px;border:1px solid #ffffff22;background:radial-gradient(circle,#ffffff10,#ffffff03)}
.pad span{position:absolute;top:10px;left:12px;font-size:11px;color:#999;letter-spacing:.1em;text-transform:uppercase}
.knob{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:#f3c06b;opacity:.85;left:50%;top:50%;pointer-events:none}
.mid{display:flex;flex-direction:column;gap:10px;align-items:stretch}
.b{border-radius:14px;border:1px solid #ffffff22;background:#ffffff0c;color:#eee;padding:12px 6px;font:600 13px system-ui}
.rec{background:#2a0b0b;border-color:#ff4a4a66;color:#ff8a8a}.rec.on{background:#ff3b3b;color:#fff}
.st{font-size:11px;color:#999;text-align:center;line-height:1.5}
input[type=range]{width:100%;accent-color:#f3c06b}
</style></head><body>
<div id="start"><h1>Pandora <i>Camera</i></h1><div style="color:#aaa;max-width:340px">Hold your phone like a camera (landscape). Move it — the Blender camera follows. Left pad: walk / dolly. Right pad: crane up-down and slide.</div><button class="big" id="go">Start camera</button><div id="err" style="color:#ff8a8a"></div></div>
<div class="ui"><div class="pad" id="padL"><span>Move</span><div class="knob" id="kL"></div></div>
<div class="mid"><button class="b rec" id="rec">● REC</button><button class="b" id="cen">Recenter</button><div class="st">Lens <b id="lv">35</b> mm</div><input type="range" id="lens" min="12" max="135" value="35"><div class="st" id="st">connecting…</div></div>
<div class="pad" id="padR"><span>Crane · Slide</span><div class="knob" id="kR"></div></div></div>
<script>
const k=new URLSearchParams(location.search).get('k'); let ws, q=[1,0,0,0], mv=[0,0], up=0, slide=0, rec=false, recenter=0, blender=false;
function quat(a,b,g){const d=Math.PI/360,x=b*d,y=g*d,z=a*d,cX=Math.cos(x),cY=Math.cos(y),cZ=Math.cos(z),sX=Math.sin(x),sY=Math.sin(y),sZ=Math.sin(z);return[cX*cY*cZ-sX*sY*sZ,sX*cY*cZ-cX*sY*sZ,cX*sY*cZ+sX*cY*sZ,cX*cY*sZ+sX*sY*cZ];}
function qmul(a,b){return[a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3],a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1],a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];}
function screenAngle(){return (screen.orientation&&screen.orientation.angle)||window.orientation||0;}
function onOri(e){ if(e.alpha==null) return; const s=-screenAngle()*Math.PI/360; q=qmul(quat(e.alpha,e.beta,e.gamma),[Math.cos(s),0,0,Math.sin(s)]); }
function connect(){ ws=new WebSocket('wss://'+location.host+'/?k='+k); ws.onopen=()=>st(); ws.onclose=()=>{st('reconnecting…');setTimeout(connect,1000)}; ws.onmessage=(m)=>{try{blender=JSON.parse(m.data).blender;st()}catch(_){}}; }
function st(t){document.getElementById('st').textContent=t||((ws&&ws.readyState===1?'Pandora ✓':'…')+'  ·  '+(blender?'Blender ✓':'Blender: press Connect'));}
setInterval(()=>{ if(ws&&ws.readyState===1) ws.send(JSON.stringify({q,mv:[mv[0]+slide,mv[1]],up,lens:+document.getElementById('lens').value,rec,recenter})); },33);
document.getElementById('go').onclick=async()=>{ try{ if(typeof DeviceOrientationEvent!=='undefined'&&DeviceOrientationEvent.requestPermission){ const r=await DeviceOrientationEvent.requestPermission(); if(r!=='granted') throw new Error('Motion access was not allowed.'); }
  window.addEventListener('deviceorientation',onOri); try{await document.documentElement.requestFullscreen(); await screen.orientation.lock('landscape');}catch(_){}
  document.getElementById('start').style.display='none'; connect(); }catch(e){ document.getElementById('err').textContent=e.message; } };
function pad(el,knob,cb){ let id=null; const r=()=>el.getBoundingClientRect();
  const mvF=(t)=>{const b=r();let x=(t.clientX-b.left)/b.width*2-1,y=(t.clientY-b.top)/b.height*2-1;x=Math.max(-1,Math.min(1,x));y=Math.max(-1,Math.min(1,y));knob.style.left=(x+1)*50+'%';knob.style.top=(y+1)*50+'%';cb(x,-y);};
  el.addEventListener('touchstart',(e)=>{const t=e.changedTouches[0];id=t.identifier;mvF(t);e.preventDefault();});
  el.addEventListener('touchmove',(e)=>{for(const t of e.changedTouches) if(t.identifier===id) mvF(t);e.preventDefault();});
  el.addEventListener('touchend',(e)=>{for(const t of e.changedTouches) if(t.identifier===id){id=null;knob.style.left='50%';knob.style.top='50%';cb(0,0);}});}
const curve=(v)=>Math.sign(v)*v*v;
pad(document.getElementById('padL'),document.getElementById('kL'),(x,y)=>{mv=[curve(x),curve(y)];});
pad(document.getElementById('padR'),document.getElementById('kR'),(x,y)=>{slide=curve(x)*.6;up=curve(y);});
document.getElementById('rec').onclick=(e)=>{rec=!rec;e.target.classList.toggle('on',rec);e.target.textContent=rec?'■ STOP':'● REC';};
document.getElementById('cen').onclick=()=>{recenter++;};
document.getElementById('lens').oninput=(e)=>{document.getElementById('lv').textContent=e.target.value;};
</script></body></html>`;

// ───────────────────────── Blender add-on ─────────────────────────
const ADDON = `bl_info = {
    "name": "Pandora Phone Camera",
    "author": "God's Pandora",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "3D Viewport > Sidebar (N) > Pandora",
    "description": "Drive the active camera with your phone through God's Pandora; record handheld moves as keyframes.",
    "category": "Camera",
}
import bpy, json, math, time, urllib.request
from mathutils import Quaternion, Vector

URL = "http://127.0.0.1:${BLENDER_PORT}/pose"
S = {"on": False, "recenter": None, "base": 0.0, "rec": False, "fail": 0, "status": "Off"}

def _yaw(q):
    v = q @ Vector((0.0, 0.0, -1.0))
    return math.atan2(v.y, v.x)

def _tick():
    if not S["on"]:
        return None
    sc = bpy.context.scene
    p = sc.pandora_cam
    dt = 1.0 / max(1, sc.render.fps)
    try:
        with urllib.request.urlopen(URL, timeout=0.05) as r:
            d = json.loads(r.read().decode())
        S["fail"] = 0
    except Exception:
        S["fail"] += 1
        S["status"] = "Waiting for God's Pandora (Phone Camera tab → Start)"
        return 1.0 if S["fail"] > 5 else dt
    cam = sc.camera
    if cam is None:
        S["status"] = "No active camera in this scene"
        return dt
    if not d.get("live"):
        S["status"] = "Pandora ✓ · open the link on your phone and tap Start"
        return dt
    S["status"] = "Live ✓" + ("  ● REC" if S["rec"] else "")
    qd = Quaternion(d["q"])
    cam.rotation_mode = "QUATERNION"
    cur = cam.matrix_world.to_quaternion()
    if S["recenter"] != d.get("recenter"):
        S["recenter"] = d.get("recenter")
        S["base"] = _yaw(cur) - _yaw(qd)
    target = Quaternion((0.0, 0.0, 1.0), S["base"]) @ qd
    k = 1.0 - p.smooth * 0.9
    q = cur.slerp(target, k)
    fwd = q @ Vector((0.0, 0.0, -1.0)); fwd.z = 0.0
    right = q @ Vector((1.0, 0.0, 0.0)); right.z = 0.0
    if fwd.length > 1e-4: fwd.normalize()
    if right.length > 1e-4: right.normalize()
    mv = d.get("mv", [0, 0]); spd = p.speed
    loc = cam.location + (right * mv[0] + fwd * mv[1]) * spd * dt + Vector((0.0, 0.0, d.get("up", 0) * spd * dt))
    if cam.parent is None:
        cam.rotation_quaternion = q
        cam.location = loc
    if p.use_lens and cam.type == "CAMERA":
        cam.data.lens = cam.data.lens + (float(d.get("lens", 35)) - cam.data.lens) * k
    want = bool(d.get("rec")) and p.allow_rec
    if want and not S["rec"]:
        S["rec"] = True
        sc.frame_set(sc.frame_start)
    if S["rec"]:
        cam.keyframe_insert("location"); cam.keyframe_insert("rotation_quaternion")
        if p.use_lens and cam.type == "CAMERA":
            cam.data.keyframe_insert("lens")
        if not want or sc.frame_current >= sc.frame_end:
            S["rec"] = False
        else:
            sc.frame_set(sc.frame_current + 1)
    return dt

class PandoraCamProps(bpy.types.PropertyGroup):
    speed: bpy.props.FloatProperty(name="Move speed (m/s)", default=1.5, min=0.05, max=50)
    smooth: bpy.props.FloatProperty(name="Smoothing", default=0.35, min=0.0, max=0.95)
    use_lens: bpy.props.BoolProperty(name="Phone controls lens", default=True)
    allow_rec: bpy.props.BoolProperty(name="Phone REC records keyframes", default=True)

class PANDORA_OT_connect(bpy.types.Operator):
    bl_idname = "pandora.cam_connect"; bl_label = "Connect"
    def execute(self, context):
        S["on"] = True; S["recenter"] = None; S["fail"] = 0
        if not bpy.app.timers.is_registered(_tick):
            bpy.app.timers.register(_tick)
        return {"FINISHED"}

class PANDORA_OT_disconnect(bpy.types.Operator):
    bl_idname = "pandora.cam_disconnect"; bl_label = "Disconnect"
    def execute(self, context):
        S["on"] = False; S["rec"] = False; S["status"] = "Off"
        return {"FINISHED"}

class PANDORA_PT_cam(bpy.types.Panel):
    bl_space_type = "VIEW_3D"; bl_region_type = "UI"; bl_category = "Pandora"; bl_label = "Phone Camera"
    def draw(self, context):
        l = self.layout; p = context.scene.pandora_cam
        l.operator("pandora.cam_disconnect" if S["on"] else "pandora.cam_connect", icon="CAMERA_DATA")
        l.label(text=S["status"])
        l.prop(p, "speed"); l.prop(p, "smooth"); l.prop(p, "use_lens"); l.prop(p, "allow_rec")
        l.label(text="REC records from the start frame, one frame per tick.")
        l.label(text="Then: View > Viewport Render Animation → Pandora Shapeshift.")

classes = (PandoraCamProps, PANDORA_OT_connect, PANDORA_OT_disconnect, PANDORA_PT_cam)
def register():
    for c in classes: bpy.utils.register_class(c)
    bpy.types.Scene.pandora_cam = bpy.props.PointerProperty(type=PandoraCamProps)
def unregister():
    S["on"] = False
    del bpy.types.Scene.pandora_cam
    for c in reversed(classes): bpy.utils.unregister_class(c)
`;

module.exports = { start, stop, status, writeAddon, PHONE_PORT, BLENDER_PORT };
