import React, { useEffect, useState } from 'react';
import { useNav } from '../lib/nav.jsx';

// Phone Camera: your phone becomes a handheld camera for Blender (real hand motion → camera keyframes).
// Then the grey blocking render goes to Shapeshift → Blocking → Film for the finished shot.
export default function CamRig() {
  const { go } = useNav();
  const [st, setSt] = useState(null); const [err, setErr] = useState(''); const [addon, setAddon] = useState('');
  useEffect(() => { let t; const poll = () => window.api.camrig.status().then(setSt).catch(() => {}); poll(); t = setInterval(poll, 1000); return () => clearInterval(t); }, []);
  const toggle = async () => { setErr(''); try { setSt(await (st?.on ? window.api.camrig.stop() : window.api.camrig.start())); } catch (e) { setErr(String(e.message || e)); } };
  const dot = (ok) => <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 8, marginRight: 6, background: ok ? '#45d68a' : '#5e5c6e' }} />;
  const q = st?.pose?.q || [1, 0, 0, 0];
  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(300px,1fr) minmax(300px,1fr)', gap: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>1 · Start the phone link</h3>
          <button className={'btn' + (st?.on ? '' : ' primary')} onClick={toggle}>{st?.on ? 'Stop' : 'Start phone camera'}</button>
          {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
          {st?.error && <div className="err" style={{ marginTop: 8 }}>{st.error}</div>}
          {st?.on && (<>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 210, borderRadius: 12, overflow: 'hidden', background: '#fff' }} dangerouslySetInnerHTML={{ __html: st.qr.replace(/width="\d+" height="\d+"/, 'width="210" height="210"') }} />
              <div className="sub" style={{ flex: 1, minWidth: 200 }}>
                Scan with your phone camera (same Wi-Fi as this PC).<br />
                <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{st.url}</code>
                <p style={{ marginTop: 8 }}>Your phone will warn that the connection is <b>not private</b> — it's your own PC's certificate. Tap <i>Show details → visit this website</i> (iPhone) or <i>Advanced → Proceed</i> (Android), then <b>Start camera</b>.</p>
                <p>If Windows asks, allow God's Pandora on <b>private networks</b>.</p>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10, gap: 16 }}>
              <span className="sub">{dot(st.phoneLive)}Phone {st.phoneLive ? 'live' : st.phones ? 'connected' : 'waiting'}</span>
              <span className="sub">{dot(st.blender)}Blender {st.blender ? 'connected' : 'waiting'}</span>
              {st.phoneLive && <span className="sub" style={{ fontFamily: 'var(--mono)' }}>q {q.map((v) => v.toFixed(2)).join(' ')} · {st.pose.lens}mm{st.pose.rec ? ' · ● REC' : ''}</span>}
            </div>
          </>)}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>2 · Blender add-on (one time)</h3>
          <button className="btn" onClick={async () => setAddon(await window.api.camrig.addon())}>Save Blender add-on</button>
          {addon && <p className="sub" style={{ fontSize: 11 }}>Saved: {addon}</p>}
          <ol className="sub" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Blender → Edit → Preferences → Add-ons → <b>Install from disk</b> → pick <code>pandora_phone_camera.py</code> → enable it.</li>
            <li>Block your scene with simple shapes and add a camera.</li>
            <li>3D view → press <b>N</b> → <b>Pandora</b> tab → <b>Connect</b>.</li>
            <li>Move the phone to aim, left pad to walk, right pad to crane / slide, slider for lens.</li>
            <li>Tap <b>● REC</b> on the phone — your real hand move is recorded as keyframes from the start frame.</li>
          </ol>
        </div>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>3 · Turn the blocking into the finished shot</h3>
        <p className="sub">In Blender: <b>View → Viewport Render Animation</b> (4–10 s). Then send that clip to Shapeshift → <b>Blocking → Film</b> with a look reference and a prompt describing the real scene — the AI keeps your exact camera move and layout.</p>
        <button className="btn primary" onClick={() => go('genjutsu', { mode: 'blocking' })}>Open Blocking → Film</button>
      </div>
    </div>
  );
}
