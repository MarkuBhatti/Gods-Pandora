import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[God\'s Pandora] Render error:', error, info);
  }

  reset() {
    this.setState({ error: null, info: null });
  }

  render() {
    if (this.state.error && this.props.inline) {
      // a crashed page stays inside its own panel — the sidebar and every other tool keep working
      return (
        <div className="card" style={{ maxWidth: 640, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ fontSize: 36 }}>⚠</div>
          <h3 style={{ margin: '6px 0' }}>This panel hit a problem</h3>
          <p className="sub" style={{ fontSize: 12 }}>{String(this.state.error?.message || this.state.error).slice(0, 300)}</p>
          <p className="sub" style={{ fontSize: 11 }}>Your work is saved. The rest of God's Pandora is still running.</p>
          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            <button className="btn" onClick={() => this.reset()}>↺ Reload this panel</button>
            <button className="btn ghost" onClick={() => window.dispatchEvent(new CustomEvent('pandora:go', { detail: 'home' }))}>Go Home</button>
          </div>
        </div>
      );
    }
    if (this.state.error) {
      return (
        <div style={{
          position: 'fixed', inset: 0, background: '#060c12',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, padding: 40, color: '#dff0f8',
          fontFamily: "'Rajdhani', 'Segoe UI', sans-serif"
        }}>
          <div style={{ fontSize: 48 }}>⚠</div>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, letterSpacing: 2, color: '#8b6bff' }}>
            SECTION CRASHED
          </div>
          <div style={{ fontSize: 13, color: '#b7b2dc', maxWidth: 520, textAlign: 'center', lineHeight: 1.6 }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button
              onClick={() => this.reset()}
              style={{
                background: 'linear-gradient(135deg,#8b6bff,#007aaa)', color: '#fff',
                border: 'none', borderRadius: 6, padding: '9px 20px',
                fontFamily: 'inherit', fontWeight: 700, cursor: 'pointer', fontSize: 13
              }}
            >
              ↺ Reload Section
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'transparent', color: '#b7b2dc',
                border: '1px solid #0d3d54', borderRadius: 6, padding: '9px 20px',
                fontFamily: 'inherit', cursor: 'pointer', fontSize: 13
              }}
            >
              Restart App
            </button>
          </div>
          {this.state.info && (
            <pre style={{
              fontSize: 10, color: '#2a4a5a', maxWidth: 600, maxHeight: 140,
              overflow: 'auto', marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all'
            }}>
              {this.state.info.componentStack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
