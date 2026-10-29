import ToolArt from '../lib/ToolArt.jsx';
import React, { useState } from 'react';
import Gen3D from './Gen3D.jsx';

const TOOLS = [
  // ── API / Cloud ──
  {
    id: 'tripo',
    name: 'Tripo AI',
    org: 'Tripo3D',
    access: 'api',
    free: true,
    freeNote: '200 credits free on signup',
    desc: 'Text or image → production-ready 3D mesh in seconds. Best speed/quality ratio.',
    keyUrl: 'https://platform.tripo3d.ai',
    docsUrl: 'https://platform.tripo3d.ai/docs',
    outputs: ['GLB', 'OBJ', 'FBX', 'STL'],
    tags: ['text-to-3d', 'image-to-3d', 'mesh'],
  },
  {
    id: 'meshy',
    name: 'Meshy',
    org: 'Meshy AI',
    access: 'api',
    free: true,
    freeNote: '200 credits/month free',
    desc: 'Text-to-3D and image-to-3D with texture generation. Great for game assets.',
    keyUrl: 'https://www.meshy.ai/api',
    docsUrl: 'https://docs.meshy.ai',
    outputs: ['GLB', 'FBX', 'OBJ', 'USDZ'],
    tags: ['text-to-3d', 'image-to-3d', 'textures', 'game-assets'],
  },
  {
    id: 'rodin',
    name: 'Hyper3D Rodin',
    org: 'Deemos',
    access: 'api',
    free: true,
    freeNote: 'Free tier available',
    desc: 'High-fidelity text/image → 3D with detailed textures. Used in AAA game pipelines.',
    keyUrl: 'https://hyperhuman.deemos.com/rodin',
    docsUrl: 'https://hyperhuman.deemos.com/docs',
    outputs: ['GLB', 'OBJ', 'FBX'],
    tags: ['text-to-3d', 'image-to-3d', 'high-fidelity'],
  },
  {
    id: 'csm',
    name: 'Common Sense Machines',
    org: 'CSM AI',
    access: 'api',
    free: true,
    freeNote: 'Free credits on signup',
    desc: 'Image/video → 3D reconstruction. Excellent for real-world object capture.',
    keyUrl: 'https://3d.csm.ai',
    docsUrl: 'https://3d.csm.ai/docs',
    outputs: ['GLB', 'OBJ', 'PLY'],
    tags: ['image-to-3d', 'video-to-3d', 'reconstruction'],
  },
  {
    id: 'luma3d',
    name: 'Luma AI (3D / NeRF)',
    org: 'Luma AI',
    access: 'api',
    free: true,
    freeNote: 'Free NeRF captures, Genie 3D API',
    desc: 'Photorealistic NeRF scene capture + Genie text-to-3D generation API.',
    keyUrl: 'https://lumalabs.ai/api',
    docsUrl: 'https://docs.lumalabs.ai',
    outputs: ['NeRF', 'SPLAT', 'MP4 turntable'],
    tags: ['nerf', 'gaussian-splat', 'scene-capture', 'text-to-3d'],
  },
  {
    id: 'spline',
    name: 'Spline AI',
    org: 'Spline Design',
    access: 'api',
    free: true,
    freeNote: 'Free tier in editor',
    desc: 'Browser-based 3D design + AI generation. Embeddable scenes, React export.',
    keyUrl: 'https://spline.design',
    docsUrl: 'https://docs.spline.design',
    outputs: ['GLTF', 'OBJ', 'React component', 'embed'],
    tags: ['web-3d', 'interactive', 'design'],
  },
  {
    id: 'kaedim',
    name: 'Kaedim',
    org: 'Kaedim',
    access: 'api',
    free: false,
    freeNote: 'Trial on request',
    desc: '2D concept art → game-ready 3D model with clean topology and UVs.',
    keyUrl: 'https://www.kaedim3d.com',
    docsUrl: 'https://docs.kaedim3d.com',
    outputs: ['FBX', 'OBJ', 'GLB'],
    tags: ['concept-to-3d', 'game-assets', 'topology'],
  },
  {
    id: 'alpha3d',
    name: 'Alpha3D',
    org: 'Alpha3D',
    access: 'api',
    free: true,
    freeNote: '10 free models on signup',
    desc: 'Product image → e-commerce ready 3D model. Built for retail & AR try-on.',
    keyUrl: 'https://www.alpha3d.io/api',
    docsUrl: 'https://docs.alpha3d.io',
    outputs: ['GLB', 'USDZ', 'FBX'],
    tags: ['product', 'ecommerce', 'ar', 'image-to-3d'],
  },
  {
    id: 'avatar3d',
    name: 'Ready Player Me',
    org: 'Ready Player Me',
    access: 'api',
    free: true,
    freeNote: 'Free for developers',
    desc: 'Selfie → game-ready avatar. Used in 10,000+ apps. Full SDK.',
    keyUrl: 'https://readyplayer.me/developers',
    docsUrl: 'https://docs.readyplayer.me',
    outputs: ['GLB', 'VRM'],
    tags: ['avatars', 'characters', 'metaverse'],
  },
  {
    id: 'masterpiece',
    name: 'Masterpiece X',
    org: 'Masterpiece Studio',
    access: 'api',
    free: true,
    freeNote: 'Free tier available',
    desc: 'Generative 3D in VR & desktop. API for text-to-3D characters.',
    keyUrl: 'https://www.masterpiecex.com',
    docsUrl: 'https://docs.masterpiecex.com',
    outputs: ['GLB', 'FBX'],
    tags: ['characters', 'vr', 'text-to-3d'],
  },
  {
    id: 'imagine3d',
    name: 'Imagine3D (Leiapix)',
    org: 'Leia Inc',
    access: 'api',
    free: true,
    freeNote: 'Free tier',
    desc: '2D image → depth map → 3D parallax animation. Great for motion graphics.',
    keyUrl: 'https://www.leiapix.com',
    docsUrl: 'https://developer.leiainc.com',
    outputs: ['MP4', 'GIF', 'depth map'],
    tags: ['depth', 'parallax', '2d-to-3d'],
  },
  {
    id: 'skybox',
    name: 'Skybox AI (Blockade Labs)',
    org: 'Blockade Labs',
    access: 'api',
    free: true,
    freeNote: 'Free 20 skyboxes/month',
    desc: 'Text → 360° panoramic skybox / HDRI environment. Perfect for 3D scene backgrounds.',
    keyUrl: 'https://api.blockadelabs.com',
    docsUrl: 'https://api.blockadelabs.com/docs',
    outputs: ['PNG equirectangular', 'HDRI', 'Cubemap'],
    tags: ['environment', 'hdri', 'skybox', '360'],
  },

  // ── Open Source / Local ──
  {
    id: 'blender',
    name: 'Blender + AI add-ons',
    org: 'Blender Foundation',
    access: 'open',
    free: true,
    freeNote: 'Completely free & open source',
    desc: 'Industry-standard 3D suite. AI integrations: Dream Textures, BlenderGPT, Generative AI add-on.',
    keyUrl: 'https://www.blender.org/download',
    docsUrl: 'https://docs.blender.org',
    outputs: ['All formats'],
    tags: ['local', 'full-pipeline', 'animation', 'rendering'],
  },
  {
    id: 'hunyuan3d', name: 'Hunyuan3D-2 mini', org: 'Tencent', access: 'open', free: true, freeNote: 'Runs inside Pandora — one click',
    desc: 'Image or text → detailed 3D mesh. Best open-source quality on a ~6 GB GPU.', keyUrl: '', docsUrl: 'https://github.com/Tencent-Hunyuan/Hunyuan3D-2',
    outputs: ['GLB'], tags: ['open-source', 'image-to-3d', 'text-to-3d', 'mesh'], run: 'hunyuan3d-2mini',
  },
  {
    id: 'openshape',
    name: 'OpenShape',
    org: 'OpenShape',
    access: 'open',
    free: true,
    freeNote: 'Open source / HuggingFace',
    desc: 'Large-scale 3D-language model. Text-guided 3D shape retrieval & generation.',
    keyUrl: 'https://huggingface.co/OpenShape',
    docsUrl: 'https://github.com/Colin97/OpenShape_code',
    outputs: ['Point cloud', 'mesh'],
    tags: ['open-source', 'language-guided'],
  },
  {
    id: 'shap-e', run: 'shap-e',
    name: 'Shap-E (OpenAI)',
    org: 'OpenAI',
    access: 'open',
    free: true,
    freeNote: 'Open source weights',
    desc: 'Text/image → 3D implicit function. Generates NeRF or textured mesh. Run locally.',
    keyUrl: 'https://github.com/openai/shap-e',
    docsUrl: 'https://github.com/openai/shap-e',
    outputs: ['NeRF', 'PLY', 'STL'],
    tags: ['open-source', 'local', 'text-to-3d'],
  },
  {
    id: 'point-e',
    name: 'Point-E (OpenAI)',
    org: 'OpenAI',
    access: 'open',
    free: true,
    freeNote: 'Open source weights',
    desc: 'Text/image → 3D point cloud. Fast generation. Run locally via HuggingFace.',
    keyUrl: 'https://huggingface.co/openai/point-e',
    docsUrl: 'https://github.com/openai/point-e',
    outputs: ['PLY point cloud'],
    tags: ['open-source', 'local', 'point-cloud'],
  },
  {
    id: 'zero123',
    name: 'Zero-1-to-3',
    org: 'Columbia University',
    access: 'open',
    free: true,
    freeNote: 'Open source / HuggingFace',
    desc: 'Single image → 3D novel view synthesis. Rotate any object from one photo.',
    keyUrl: 'https://huggingface.co/spaces/cvlab/zero123-live',
    docsUrl: 'https://github.com/cvlab-columbia/zero123',
    outputs: ['Novel views', 'mesh'],
    tags: ['open-source', 'novel-view', 'image-to-3d'],
  },
  {
    id: 'dreamgaussian',
    name: 'DreamGaussian',
    org: 'NUS / Research',
    access: 'open',
    free: true,
    freeNote: 'Open source',
    desc: 'Image → 3D Gaussian splatting in ~2 minutes. Fast textured mesh export.',
    keyUrl: 'https://dreamgaussian.github.io',
    docsUrl: 'https://github.com/dreamgaussian/dreamgaussian',
    outputs: ['3DGS', 'OBJ + texture'],
    tags: ['open-source', 'gaussian-splatting', 'fast'],
  },
  {
    id: 'threestudio',
    name: 'threestudio',
    org: 'Open source',
    access: 'open',
    free: true,
    freeNote: 'Open source',
    desc: 'Unified framework for text-to-3D: SDS, ProlificDreamer, MVDream. GPU required.',
    keyUrl: 'https://github.com/threestudio-project/threestudio',
    docsUrl: 'https://github.com/threestudio-project/threestudio',
    outputs: ['NeRF', 'mesh', 'video'],
    tags: ['open-source', 'research', 'sds', 'text-to-3d'],
  },
  {
    id: 'instant3d',
    name: 'InstantMesh',
    org: 'InstantX Team',
    access: 'open',
    free: true,
    freeNote: 'Open source / HuggingFace',
    desc: 'Image → 3D mesh in <10 seconds via multi-view diffusion + sparse-view recon.',
    keyUrl: 'https://huggingface.co/spaces/TencentARC/InstantMesh',
    docsUrl: 'https://github.com/TencentARC/InstantMesh',
    outputs: ['OBJ', 'GLB'],
    tags: ['open-source', 'fast', 'image-to-3d'],
  },
  {
    id: 'gaussian-splatting',
    name: '3D Gaussian Splatting',
    org: 'Inria / Research',
    access: 'open',
    free: true,
    freeNote: 'Open source',
    desc: 'Real-time novel view synthesis from photos. Revolutionary NeRF replacement.',
    keyUrl: 'https://github.com/graphdeco-inria/gaussian-splatting',
    docsUrl: 'https://github.com/graphdeco-inria/gaussian-splatting',
    outputs: ['.splat', 'PLY'],
    tags: ['open-source', 'gaussian-splatting', 'nerf', 'reconstruction'],
  },
  {
    id: 'nerfstudio',
    name: 'Nerfstudio',
    org: 'Berkeley / Open source',
    access: 'open',
    free: true,
    freeNote: 'Open source',
    desc: 'Modular NeRF framework — Nerfacto, Splatfacto, Instant-NGP. Easy training pipeline.',
    keyUrl: 'https://docs.nerf.studio',
    docsUrl: 'https://docs.nerf.studio',
    outputs: ['NeRF', 'Gaussian splat', 'mesh'],
    tags: ['open-source', 'nerf', 'training', 'reconstruction'],
  },
];

const TAGS = [...new Set(TOOLS.flatMap((t) => t.tags))].sort();

export default function Studio3D() {
  const [access, setAccess] = useState('all');
  const [freeOnly, setFreeOnly] = useState(false);
  const [tag, setTag] = useState('');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);

  const filtered = TOOLS.filter((t) => {
    if (access !== 'all' && t.access !== access) return false;
    if (freeOnly && !t.free) return false;
    if (tag && !t.tags.includes(tag)) return false;
    if (q && !(t.name + t.org + t.desc).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const apiTools  = filtered.filter((t) => t.access === 'api');
  const openTools = filtered.filter((t) => t.access === 'open');

  const ToolCard = ({ t, i }) => (
    <div className="card tool-card-lite" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <ToolArt tool={{ id: t.name, name: t.name, desc: (t.desc || t.description || '') + ' 3d', kind: '3d', imageInputs: [] }} i={i} page="spatial" />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 13 }}>{t.name}</strong>
        <div className="row" style={{ gap: 4 }}>
          {t.free && <span className="badge" style={{ color: '#4adc8a' }}>🆓 free</span>}
          <span className="badge" style={{ color: t.access === 'open' ? 'var(--gold)' : '#ff8a95' }}>
            {t.access === 'open' ? '⬇ open' : '☁ api'}
          </span>
        </div>
      </div>
      <p className="sub" style={{ margin: 0, fontSize: 11.5, opacity: .85 }}>{t.org}</p>
      <p className="sub" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>{t.desc}</p>
      {t.free && t.freeNote && (
        <p style={{ margin: 0, fontSize: 11, color: '#4adc8a' }}>✓ {t.freeNote}</p>
      )}
      <div className="row" style={{ gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
        {t.outputs.map((o) => (
          <span key={o} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(139,107,255,.1)', color: 'var(--accent)', border: '1px solid rgba(139,107,255,.2)' }}>{o}</span>
        ))}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 4 }}>
        {t.access === 'open' && t.run && <button className="btn small" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setPick({ id: t.run, prepare: true, at: Date.now() })}>⬇ Download &amp; run in Pandora</button>}
        {t.access === 'open' && !t.run && t.id !== 'blender' && <button className="btn small" style={{ fontSize: 11, padding: '4px 10px' }} title="This project needs its own install; Pandora's built-in Hunyuan3D-2 does the same job" onClick={() => setPick({ id: 'hunyuan3d-2mini', at: Date.now() })}>▶ Run similar in Pandora</button>}
        {t.access !== 'open' && <a href={t.keyUrl} target="_blank" rel="noreferrer" className="btn small" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>🔑 Get API Key ↗</a>}
        {t.id === 'blender' && <a href={t.keyUrl} target="_blank" rel="noreferrer" className="btn small" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>Get Blender ↗</a>}
        {t.docsUrl && <a href={t.docsUrl} target="_blank" rel="noreferrer" className="btn ghost small" style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}>
          Docs ↗
        </a>}
      </div>
    </div>
  );

  return (
    <div>
      <h1>🧊 Pandora 3D &amp; Spatial</h1>
      <p className="sub">
        {TOOLS.length} tools · {TOOLS.filter((t) => t.free).length} with free tiers · {TOOLS.filter((t) => t.access === 'open').length} open-source / local.
        Text → mesh, image → 3D, NeRF capture, Gaussian splatting, avatars, environments.
      </p>

      <Gen3D pick={pick} />

      {/* Filters */}
      <div className="row" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
        {[['all','All'],['api','☁ API'],['open','⬇ Open-source']].map(([v,l]) => (
          <button key={v} className={'chip' + (access === v ? ' on' : '')} onClick={() => setAccess(v)}>{l}</button>
        ))}
        <button className={'chip' + (freeOnly ? ' on' : '')} onClick={() => setFreeOnly((x) => !x)}>🆓 Free only</button>
        <select value={tag} onChange={(e) => setTag(e.target.value)} style={{ maxWidth: 180, fontSize: 12 }}>
          <option value="">All tags</option>
          {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input style={{ maxWidth: 200, fontSize: 12 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {/* API section */}
      {(access === 'all' || access === 'api') && apiTools.length > 0 && (
        <>
          <h3>☁ Cloud API ({apiTools.length})</h3>
          <div className="grid" style={{ marginBottom: 20 }}>
            {apiTools.map((t, i) => <ToolCard key={t.id} t={t} i={i} />)}
          </div>
        </>
      )}

      {/* Open source section */}
      {(access === 'all' || access === 'open') && openTools.length > 0 && (
        <>
          <h3>⬇ Open-Source / Local ({openTools.length})</h3>
          <div className="grid" style={{ marginBottom: 20 }}>
            {openTools.map((t, i) => <ToolCard key={t.id} t={t} i={apiTools.length + i} />)}
          </div>
        </>
      )}

      {filtered.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p className="sub">No tools match your filters.</p>
        </div>
      )}

      {/* Quick start guide */}
      <h3>⚡ Quick Start — which tool to use?</h3>
      <div className="grid">
        {[
          ['Text prompt → fast mesh', 'Tripo AI or Meshy — best speed, solid quality, free tier'],
          ['Photo of object → 3D', 'CSM AI or Zero-1-to-3 — single image reconstruction'],
          ['Game character', 'Meshy (clean topo) or Kaedim (concept art)'],
          ['Product for e-commerce / AR', 'Alpha3D → GLB + USDZ for AR Quick Look'],
          ['360° scene / HDRI', 'Skybox AI — 20 free/month, instant environments'],
          ['Avatar from selfie', 'Ready Player Me — free SDK, works in 10k+ apps'],
          ['Photorealistic NeRF', 'Nerfstudio / Gaussian Splatting — run locally'],
          ['Full 3D pipeline (free)', 'Blender + Dream Textures + BlenderGPT add-ons'],
        ].map(([title, tip]) => (
          <div key={title} className="card" style={{ padding: 12 }}>
            <strong style={{ fontSize: 12 }}>{title}</strong>
            <p className="sub" style={{ margin: '4px 0 0', fontSize: 11.5 }}>{tip}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
