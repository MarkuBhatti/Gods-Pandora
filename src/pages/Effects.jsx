// Pandora FX — 51 real-time photo & video effects (GPU, AI subject mask, offline). Runs as a self-contained page.
export default function Effects() {
  return (
    <div style={{ height: 'calc(100vh - 64px)', margin: '-8px -8px 0', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,.07)', background: '#060609' }}>
      <iframe title="Pandora FX" src="./fx/index.html" style={{ width: '100%', height: '100%', border: 0, display: 'block' }} allow="autoplay" />
    </div>
  );
}
