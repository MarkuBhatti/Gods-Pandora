import React, { useRef, useState } from 'react';
import { useJob, friendlyError, fmtTime } from '../lib/job.jsx';
import catalog from '../../data/modelCatalog.json';
import directory from '../../data/modelDirectory.json';
import { uid } from '../lib/store.jsx';
import Media from '../lib/Media.jsx';

// ⚛ Node Canvas — ComfyUI-style pipeline editor. Chain ANY models (cloud APIs + local
// open-source) in one graph. Every node type below is independently wirable.
const NODE_TYPES = {
  // ── Input / text ──
  prompt:     { name: 'Prompt',           color: '#f2c200', out: 'text',  group: 'Input' },
  story:      { name: 'Story (Claude)',   color: '#ff8a95', in: 'text',   out: 'text',  group: 'Text' },
  caption:    { name: 'Caption (Claude)', color: '#ffb84d', in: 'any',    out: 'text',  group: 'Text' },
  translate:  { name: 'Translate',        color: '#e8a020', in: 'text',   out: 'text',  group: 'Text' },
  marketing:  { name: 'Marketing Copy',   color: '#4ad8a8', in: 'any',    out: 'text',  group: 'Text' },
  // ── Image ──
  image:      { name: 'Image Gen',        color: '#e8192c', in: 'any',    out: 'image', group: 'Image' },
  upscale:    { name: 'Upscale',          color: '#c78f2c', in: 'image',  out: 'image', group: 'Image' },
  inpaint:    { name: 'Inpaint / Edit',   color: '#d45c00', in: 'image',  out: 'image', group: 'Image' },
  face:       { name: 'Face Restore',     color: '#c43080', in: 'image',  out: 'image', group: 'Image' },
  removebg:   { name: 'Remove BG',        color: '#a020e0', in: 'image',  out: 'image', group: 'Image' },
  style:      { name: 'Style Transfer',   color: '#e060ff', in: 'image',  out: 'image', group: 'Image' },
  depth:      { name: 'Depth Map',        color: '#5060c8', in: 'image',  out: 'image', group: 'Image' },
  // ── Video ──
  video:      { name: 'Video Gen',        color: '#b3121f', in: 'any',    out: 'video', group: 'Video' },
  img2vid:    { name: 'Image → Video',    color: '#cc2040', in: 'image',  out: 'video', group: 'Video' },
  lipsync:    { name: 'Lip Sync',         color: '#e83060', in: 'video',  out: 'video', group: 'Video' },
  // ── Audio ──
  audio:      { name: 'Audio Gen',        color: '#8a5cff', in: 'text',   out: 'audio', group: 'Audio' },
  tts:        { name: 'Text-to-Speech',   color: '#7040e0', in: 'text',   out: 'audio', group: 'Audio' },
  music:      { name: 'Music Gen',        color: '#5030c8', in: 'text',   out: 'audio', group: 'Audio' },
  // ── Output ──
  output:     { name: 'Output',           color: '#3a8888', in: 'any',    group: 'Output' },
};

const GROUP_ORDER = ['Input', 'Text', 'Image', 'Video', 'Audio', 'Output'];

// Every generative node offers ☁ API and ⬇ local open-source models.
const osFor = (t) => (t === 'image' ? directory.openSource.filter((m) => m.type === 'image') : [])
  .map((m) => ({ id: 'os-' + m.repo, name: '⬇ ' + m.name, provider: 'local', kind: 'image', endpoint: m.repo, refInput: 'reference_images', maxRefs: 2 }));

const modelsFor = (t) => {
  if (t === 'upscale') return catalog.models.filter((m) => (m.tags || []).includes('upscale'));
  if (['caption', 'translate', 'marketing', 'story', 'inpaint', 'face', 'removebg', 'style', 'depth', 'img2vid', 'lipsync', 'tts', 'music'].includes(t)) return [];
  return [
    ...catalog.models.filter((m) => m.kind === t && !(m.tags || []).includes('upscale')).map((m) => ({ ...m, name: (m.provider === 'local' ? '⬇ ' : '☁ ') + m.name })),
    ...osFor(t),
  ];
};

// Pre-built starter graph showing a full creative pipeline
const STARTER_NODES = [
  { id: 's1',  type: 'prompt',    x: 20,   y: 30,   prompt: 'A lone rider crosses a neon desert at dusk — cyberpunk, golden hour', modelId: '', out: null },
  { id: 's2',  type: 'story',     x: 270,  y: 20,   prompt: '', modelId: '', out: null },
  { id: 's3',  type: 'image',     x: 530,  y: 10,   prompt: '', modelId: '', out: null },
  { id: 's4',  type: 'upscale',   x: 790,  y: 10,   prompt: '', modelId: '', out: null },
  { id: 's5',  type: 'face',      x: 1050, y: 10,   prompt: '', modelId: '', out: null },
  { id: 's6',  type: 'img2vid',   x: 1310, y: 10,   prompt: 'slow dolly-in, cinematic motion blur', modelId: '', out: null },
  { id: 's7',  type: 'caption',   x: 530,  y: 280,  prompt: '', modelId: '', out: null },
  { id: 's8',  type: 'marketing', x: 790,  y: 280,  prompt: '', modelId: '', out: null },
  { id: 's9',  type: 'tts',       x: 1050, y: 280,  prompt: '', modelId: '', out: null },
  { id: 's10', type: 'music',     x: 270,  y: 420,  prompt: 'epic cinematic orchestral score, building tension', modelId: '', out: null },
  { id: 's11', type: 'style',     x: 530,  y: 420,  prompt: 'film noir, high contrast, desaturated', modelId: '', out: null },
  { id: 's12', type: 'removebg',  x: 790,  y: 420,  prompt: '', modelId: '', out: null },
  { id: 's13', type: 'depth',     x: 1050, y: 420,  prompt: '', modelId: '', out: null },
  { id: 's14', type: 'translate', x: 20,   y: 420,  prompt: 'Target language: Spanish', modelId: '', out: null },
  { id: 's15', type: 'output',    x: 1310, y: 280,  prompt: '', modelId: '', out: null },
  { id: 's16', type: 'inpaint',   x: 1310, y: 420,  prompt: 'Replace background with starfield', modelId: '', out: null },
  { id: 's17', type: 'lipsync',   x: 1050, y: 550,  prompt: '', modelId: '', out: null },
  { id: 's18', type: 'audio',     x: 270,  y: 560,  prompt: 'Ambient desert wind with distant thunder', modelId: '', out: null },
];
const STARTER_LINKS = [
  ['s1','s2'], ['s2','s3'], ['s3','s4'], ['s4','s5'], ['s5','s6'],
  ['s3','s7'], ['s7','s8'], ['s8','s9'], ['s8','s15'],
  ['s1','s14'], ['s3','s11'], ['s11','s12'], ['s12','s13'],
  ['s6','s17'], ['s9','s17'],
  ['s4','s16'],
];

export default function NodeCanvas() {
  const [nodes, setNodes] = useState(STARTER_NODES);
  const [links, setLinks] = useState(STARTER_LINKS);
  const [pendingFrom, setPendingFrom] = useState(null);
  const [running, setRunning] = useState('');
  const job = useJob();
  const [error, setError] = useState('');
  const [activeGroup, setActiveGroup] = useState(null);
  const drag = useRef(null);
  const canvasRef = useRef(null);

  const patch = (id, f) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, ...f } : n)));

  function addNode(type) {
    const r = canvasRef.current?.getBoundingClientRect();
    const cx = r ? r.width / 2 - 112 : 60;
    const cy = r ? r.height / 2 - 60 : 260;
    setNodes((ns) => [...ns, { id: uid(), type, x: cx + (ns.length % 5) * 15, y: cy + (Math.floor(ns.length / 5) % 3) * 20, prompt: '', modelId: '', out: null }]);
  }
  function removeNode(id) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setLinks((ls) => ls.filter(([a, b]) => a !== id && b !== id));
  }
  function removeLink(a, b) { setLinks((ls) => ls.filter(([x, y]) => !(x === a && y === b))); }
  function port(id, isOut) {
    if (isOut) { setPendingFrom(id); return; }
    if (pendingFrom && pendingFrom !== id) {
      setLinks((ls) => [...ls.filter(([a, b]) => !(a === pendingFrom && b === id)), [pendingFrom, id]]);
      setPendingFrom(null);
    }
  }
  function onMouseDown(e, n) {
    e.stopPropagation();
    const r = canvasRef.current.getBoundingClientRect();
    drag.current = { id: n.id, dx: e.clientX - r.left - n.x, dy: e.clientY - r.top - n.y };
  }
  function onMouseMove(e) {
    if (!drag.current) return;
    const r = canvasRef.current.getBoundingClientRect();
    patch(drag.current.id, { x: Math.max(0, e.clientX - r.left - drag.current.dx), y: Math.max(0, e.clientY - r.top - drag.current.dy) });
  }

  // Claude-powered node execution helper
  async function runClaude(system, prompt) {
    return window.api.claude({ jobId: job.step(), system, prompt, maxTokens: 800 });
  }

  // Pipeline: topological walk
  async function run() {
    setError(''); setRunning('…');
    const byId = Object.fromEntries(nodes.map((n) => [n.id, { ...n, out: null }]));
    const inputsOf = (id) => links.filter(([, b]) => b === id).map(([a]) => byId[a]);
    const order = [];
    const visit = (id, seen = new Set()) => {
      if (order.includes(id)) return;
      if (seen.has(id)) throw new Error('Cycle in graph');
      seen.add(id); inputsOf(id).forEach((u) => visit(u.id, seen)); order.push(id);
    };
    await job.start(async (_jid, isCancelled) => {
    try {
      nodes.forEach((n) => visit(n.id));
      for (const id of order) {
        if (isCancelled()) throw new Error('Cancelled.');
        const n = byId[id];
        const cfg = NODE_TYPES[n.type];
        setRunning(cfg.name);
        const ups = inputsOf(id);
        const upTexts = ups.map((u) => u.out?.text).filter(Boolean);
        const upFiles = ups.map((u) => u.out?.file).filter(Boolean);
        const text = [n.prompt, ...upTexts].filter(Boolean).join('\n');

        if (n.type === 'prompt')    n.out = { text: n.prompt };
        else if (n.type === 'story')     n.out = { text: await runClaude('You are a film writer. Expand the idea into a vivid single-paragraph scene description usable as an image/video prompt.', text) };
        else if (n.type === 'caption')   n.out = { text: await runClaude('Describe the uploaded image in one precise, evocative sentence suitable as a generation prompt.', text || 'Describe this image.') };
        else if (n.type === 'translate') n.out = { text: await runClaude('Translate the following text. ' + (n.prompt || 'Target language: Spanish') + '. Return only the translation.', upTexts.join('\n')) };
        else if (n.type === 'marketing') n.out = { text: await runClaude('You are a performance marketer. Write a viral hook, 3 captions (Instagram, Twitter, LinkedIn) and a CTA for the described creative.', text) };
        else if (['image','video','audio','upscale','inpaint','face','removebg','style','depth','img2vid','lipsync','tts','music'].includes(n.type)) {
          const genKind = ['upscale','inpaint','face','removebg','style','depth'].includes(n.type) ? 'image'
                        : ['img2vid','lipsync'].includes(n.type) ? 'video'
                        : ['tts','music','audio'].includes(n.type) ? 'audio' : n.type;
          const list = modelsFor(n.type);
          const fallbackList = catalog.models.filter((m) => m.kind === genKind && m.provider !== 'local');
          const model = (list.find((m) => m.id === n.modelId) || list[0]) || (fallbackList.find((m) => m.id === n.modelId) || fallbackList[0]);
          if (!model) { n.out = { file: upFiles[0], text }; continue; }
          const res = await window.api.generate({
            jobId: job.step(), provider: model.provider, model, kind: genKind,
            prompt: ['upscale','face','removebg','depth','img2vid','lipsync'].includes(n.type) ? (text || cfg.name) : text,
            params: {}, toolRefs: upFiles.slice(0, model.maxRefs || 1),
            cameraPreset: null, character: null, location: null, style: null,
          });
          n.out = { file: res.file, text };
        } else n.out = { file: upFiles[0], text: upTexts.join('\n') };

        setNodes((ns) => ns.map((x) => (x.id === id ? { ...x, out: n.out } : x)));
      }
      setRunning('');
    } catch (e) { const m = friendlyError(e); if (m) setError(m); setRunning(''); }
    });
  }

  const NODE_W = 234;
  const center = (n, out) => ({ x: n.x + (out ? NODE_W : 0), y: n.y + 14 });
  const grouped = GROUP_ORDER.map((g) => ({ group: g, types: Object.entries(NODE_TYPES).filter(([, v]) => v.group === g) }));
  const visibleNodes = activeGroup ? nodes.filter((n) => NODE_TYPES[n.type]?.group === activeGroup) : nodes;

  return (
    <div>
      <h1>⚛ Pandora Node Canvas</h1>
      <p className="sub">
        ComfyUI-style pipeline across every model — {Object.keys(NODE_TYPES).length} node types, cloud APIs + local open-source in one graph.
        Click <strong style={{ color: 'var(--accent)' }}>●</strong> output then <strong style={{ color: 'var(--accent)' }}>○</strong> input to wire.
        Drag nodes to reposition.
      </p>

      {/* Node palette by group */}
      <div style={{ marginBottom: 10 }}>
        {grouped.map(({ group, types }) => (
          <div key={group} style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 9, letterSpacing: 2, color: 'var(--muted)', textTransform: 'uppercase', marginRight: 8 }}>{group}</span>
            {types.map(([t, cfg]) => (
              <button key={t} className="chip" style={{ borderColor: cfg.color + 'aa', marginRight: 4, marginBottom: 4, fontSize: 11 }} onClick={() => addNode(t)}>
                + {cfg.name}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 10, gap: 8 }}>
        <button className="btn ghost small" onClick={() => { setNodes(STARTER_NODES); setLinks(STARTER_LINKS); }}>↺ Reset to starter</button>
        <button className="btn ghost small" onClick={() => { setNodes([]); setLinks([]); }}>✕ Clear canvas</button>
        <span style={{ flex: 1 }} />
        {running
          ? <div className="ok" style={{ fontSize: 12 }}>⟳ Running: {running}…</div>
          : null}
        {job.running
          ? <span className="run-bar"><button className="btn" disabled><span className="spinner" /> Running… {fmtTime(job.elapsed)}</button><button className="btn danger" onClick={job.cancel}>✕ Cancel</button></span>
          : <button className="btn" onClick={run}>▶ Run pipeline</button>}
      </div>

      {error && <div className="err">{error}</div>}
      {pendingFrom && <div className="ok" style={{ marginBottom: 6 }}>🔗 Click a ○ input on any other node to complete the wire — or click the same node to cancel.</div>}

      {/* Canvas */}
      <div
        ref={canvasRef}
        onMouseMove={onMouseMove}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
        onClick={() => { if (pendingFrom) setPendingFrom(null); }}
        style={{
          position: 'relative', height: 900,
          border: '1px solid var(--border)', borderRadius: 14,
          overflow: 'auto', scrollbarWidth: 'none',
          background: `
            radial-gradient(circle at 1px 1px, rgba(139,107,255,.09) 1px, transparent 0) 0 0/28px 28px,
            rgba(4,9,18,.95)
          `,
        }}
      >
        <style>{`.node-canvas::-webkit-scrollbar{display:none}`}</style>
        {/* Wire SVG */}
        <svg style={{ position: 'absolute', inset: 0, width: 2200, height: 1600, pointerEvents: 'none' }}>
          <defs>
            <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          {links.map(([a, b], i) => {
            const na = nodes.find((n) => n.id === a), nb = nodes.find((n) => n.id === b);
            if (!na || !nb) return null;
            const p1 = center(na, true), p2 = center(nb, false);
            const col = NODE_TYPES[na.type]?.color || '#8b6bff';
            return (
              <g key={i}>
                <path d={`M${p1.x},${p1.y} C${p1.x + 80},${p1.y} ${p2.x - 80},${p2.y} ${p2.x},${p2.y}`}
                  stroke={col} strokeWidth="2.5" fill="none" opacity=".65" filter="url(#glow)" />
                {/* Invisible thick hit-area for removal */}
                <path d={`M${p1.x},${p1.y} C${p1.x + 80},${p1.y} ${p2.x - 80},${p2.y} ${p2.x},${p2.y}`}
                  stroke="transparent" strokeWidth="12" fill="none" style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                  onClick={(e) => { e.stopPropagation(); removeLink(a, b); }} />
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {nodes.map((n) => {
          const cfg = NODE_TYPES[n.type] || { name: n.type, color: '#888' };
          const list = modelsFor(n.type);
          return (
            <div key={n.id} className="card" style={{
              position: 'absolute', left: n.x, top: n.y, width: NODE_W, padding: 0,
              borderColor: cfg.color + '66', boxShadow: `0 0 18px ${cfg.color}22, 0 8px 24px rgba(0,0,0,.7)`,
              userSelect: 'none',
            }}>
              {/* Header */}
              <div
                onMouseDown={(e) => onMouseDown(e, n)}
                style={{
                  cursor: 'grab', padding: '5px 9px',
                  borderBottom: `1px solid ${cfg.color}33`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: `linear-gradient(135deg, ${cfg.color}28, ${cfg.color}12)`,
                  borderRadius: '7px 7px 0 0',
                }}
              >
                <span title="Input port" onClick={(e) => { e.stopPropagation(); port(n.id, false); }}
                  style={{ cursor: 'crosshair', color: cfg.in ? cfg.color : 'transparent', fontSize: 14, lineHeight: 1 }}>○</span>
                <strong style={{ fontSize: 11.5, color: 'var(--text)', flex: 1, textAlign: 'center' }}>{cfg.name}</strong>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {cfg.out && (
                    <span title="Output port" onClick={(e) => { e.stopPropagation(); port(n.id, true); }}
                      style={{ cursor: 'crosshair', color: cfg.color, fontSize: 14, lineHeight: 1 }}>●</span>
                  )}
                  <span onClick={(e) => { e.stopPropagation(); removeNode(n.id); }}
                    style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 13, lineHeight: 1 }}>✕</span>
                </span>
              </div>

              {/* Body */}
              <div style={{ padding: 7 }}>
                {list.length > 0 && (
                  <select style={{ fontSize: 10.5, marginBottom: 5, padding: '4px 6px' }} value={n.modelId} onChange={(e) => patch(n.id, { modelId: e.target.value })}>
                    <option value="">Auto-select model</option>
                    {list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                )}
                {n.type !== 'output' && (
                  <textarea
                    style={{ minHeight: 38, fontSize: 10.5, resize: 'vertical' }}
                    placeholder={
                      n.type === 'prompt' ? 'Your idea or concept…'
                      : n.type === 'translate' ? 'Target language: Spanish'
                      : n.type === 'music' ? 'Music genre, mood, tempo…'
                      : n.type === 'tts' ? 'Text to speak aloud…'
                      : 'Extra instructions (optional)'
                    }
                    value={n.prompt}
                    onChange={(e) => patch(n.id, { prompt: e.target.value })}
                  />
                )}
                {/* Output display */}
                {n.out?.file && (
                  <div style={{ marginTop: 5 }}>
                    <Media file={n.out.file} kind={NODE_TYPES[n.type]?.out || 'image'} controls />
                  </div>
                )}
                {n.out?.text && !n.out?.file && (
                  <div className="log" style={{ maxHeight: 80, marginTop: 5, fontSize: 10 }}>{n.out.text.slice(0, 350)}</div>
                )}
                {/* Type badge */}
                <div style={{ marginTop: 5, display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 9, color: cfg.color, opacity: .7, letterSpacing: .5, textTransform: 'uppercase' }}>
                    {cfg.group} · {cfg.out || 'sink'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {GROUP_ORDER.map((g) => (
          <span key={g} style={{ fontSize: 10.5, color: 'var(--muted)' }}>
            <span style={{ color: Object.values(NODE_TYPES).find((t) => t.group === g)?.color }}>{g === 'Input' ? '⬛' : '⬛'} </span>
            {g} ({Object.values(NODE_TYPES).filter((t) => t.group === g).length})
          </span>
        ))}
        <span style={{ fontSize: 10.5, color: 'var(--muted)', marginLeft: 'auto' }}>Click wire to remove it · Drag node header to move</span>
      </div>
    </div>
  );
}
