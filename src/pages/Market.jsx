import React, { useEffect, useState } from 'react';
import { DownloadButton, fmtBytes } from '../lib/downloads.jsx';
import { friendlyError } from '../lib/job.jsx';
import { usePersist } from '../lib/qol.jsx';

// 🛒 Model Market — search the newest open models across the web and install them in one click.
const SOURCES = [
  ['everywhere', '🌍 Search everywhere'],
  ['huggingface', '🤗 Hugging Face'],
  ['civitai', '🎨 Civitai'],
  ['pinokio', '🧩 Pandora Plugins · Pinokio apps'],
  ['openmodeldb', '🔍 OpenModelDB (upscalers)'],
  ['ollama', '🦙 Ollama (local LLMs)'],
  ['url', '🔗 Any URL'],
  ['more', '🌐 More hubs'],
];
const HF_CATS = [['all', 'All'], ['image', '🖼 Image'], ['video', '🎬 Video'], ['audio', '🎧 Audio (voice · music · speech)'], ['3d', '🧊 3D'], ['llm', '💬 LLM / multimodal']];
const CIVITAI_TYPES = ['Checkpoint', 'LORA', 'TextualInversion', 'Controlnet', 'Hypernetwork', 'Poses'];
const CIVITAI_BASES = ['', 'SD 1.5', 'SDXL 1.0', 'Pony', 'Illustrious', 'Flux.1 D', 'Flux.1 S', 'SD 3.5', 'Wan Video', 'Hunyuan Video', 'LTXV'];
const OLLAMA_POPULAR = ['llama3.2', 'llama3.2-vision', 'qwen2.5vl', 'gemma3', 'qwen3', 'deepseek-r1', 'mistral', 'phi4', 'llava', 'nomic-embed-text'];
const MORE_HUBS = [
  ['ModelScope', 'https://modelscope.cn/models', 'Alibaba’s hub — huge catalog incl. Qwen, Wan and Chinese-language models. Copy a model id and use the Hugging Face tab if it is mirrored, or the URL tab for direct files.'],
  ['Tensor.Art', 'https://tensor.art/models', 'Community checkpoints & LoRAs (SD / SDXL / Flux). Download, then drop the file in via the URL tab.'],
  ['LiblibAI', 'https://www.liblib.art/', 'Large LoRA and checkpoint community.'],
  ['SeaArt', 'https://www.seaart.ai/models', 'Community models and LoRAs.'],
  ['Ollama library', 'https://ollama.com/library', 'Every local LLM Ollama can run — install from the Ollama tab.'],
  ['LM Studio models', 'https://lmstudio.ai/models', 'GGUF / MLX LLMs for local chat.'],
  ['Kaggle Models', 'https://www.kaggle.com/models', 'Google and community models (Gemma, etc.).'],
  ['Replicate explore', 'https://replicate.com/explore', 'Cloud models — add any of them in Models → Add any model (Replicate).'],
  ['FAL model gallery', 'https://fal.ai/models', 'Cloud models — add any endpoint in Models → Add any model (FAL).'],
  ['OpenModelDB', 'https://openmodeldb.info', 'Upscaling / restoration models (also searchable in its own tab).'],
  ['GitHub', 'https://github.com/topics/generative-ai', 'Research code and weights — use the URL tab for direct file links.'],
  ['Pinokio', 'https://pinokio.co/search?type=apps&tag=music', '1-click installers for whole AI apps — 30+ music, 60+ TTS/voice apps (also searchable in its own tab).'],
  ['CivArchive', 'https://civarchive.com/', 'Search engine for models removed from Civitai — points to mirrors.'],
  ['Shakker AI', 'https://www.shakker.ai/', 'Checkpoints & LoRAs community (LiblibAI international).'],
  ['Voice-Models.com', 'https://voice-models.com/', 'Searchable database of RVC voice-conversion models (.pth + .index).'],
  ['RVC resources (HF)', 'https://huggingface.co/Politrees/RVC_resources', 'Pretrained RVC voice models and HuBERT bases.'],
  ['Sketchfab (CC models)', 'https://sketchfab.com/search?features=downloadable&licenses=7c23a1ba438d4306920229c12afcb5f9&type=models', 'Downloadable CC-BY 3D assets — references for image-to-3D.'],
  ['Kaggle / TF Hub', 'https://www.kaggle.com/models?framework=pyTorch', 'PyTorch / TensorFlow model zoo.'],
];

// One query → search links for every major model site (each opens in your browser)
const q_ = encodeURIComponent;
const SITE_SEARCH = [
  // [name, category, url(q)]
  ['Hugging Face', 'All', (q) => `https://huggingface.co/models?search=${q_(q)}&sort=trending`],
  ['Civitai', 'Image · Video', (q) => `https://civitai.com/search/models?query=${q_(q)}`],
  ['Pinokio', 'All · Audio apps', (q) => (q ? `https://pinokio.co/search?type=apps&q=${q_(q)}` : 'https://pinokio.co/search?type=apps&tag=music')],
  ['Tensor.Art', 'Image', (q) => `https://tensor.art/search?q=${q_(q)}`],
  ['SeaArt', 'Image', (q) => `https://www.seaart.ai/search?keyword=${q_(q)}`],
  ['LiblibAI', 'Image', (q) => `https://www.liblib.art/search?keyword=${q_(q)}`],
  ['Shakker AI', 'Image', (q) => `https://www.shakker.ai/search?keyword=${q_(q)}`],
  ['CivArchive', 'Image (archived)', (q) => `https://civarchive.com/search?q=${q_(q)}`],
  ['ModelScope', 'All', (q) => `https://modelscope.cn/search?search=${q_(q)}`],
  ['OpenModelDB', 'Upscalers', (q) => `https://openmodeldb.info/?q=${q_(q)}`],
  ['Voice-Models.com', 'Audio · voices', (q) => `https://voice-models.com/search?q=${q_(q)}`],
  ['HF audio (TTS)', 'Audio', (q) => `https://huggingface.co/models?pipeline_tag=text-to-speech&search=${q_(q)}&sort=trending`],
  ['HF music / SFX', 'Audio', (q) => `https://huggingface.co/models?pipeline_tag=text-to-audio&search=${q_(q)}&sort=trending`],
  ['HF image-to-3D', '3D', (q) => `https://huggingface.co/models?pipeline_tag=image-to-3d&search=${q_(q)}&sort=trending`],
  ['HF video', 'Video', (q) => `https://huggingface.co/models?pipeline_tag=text-to-video&search=${q_(q)}&sort=trending`],
  ['Sketchfab', '3D assets', (q) => `https://sketchfab.com/search?features=downloadable&q=${q_(q)}&type=models`],
  ['Ollama library', 'LLM', (q) => `https://ollama.com/search?q=${q_(q)}`],
  ['LM Studio', 'LLM', (q) => `https://lmstudio.ai/models?q=${q_(q)}`],
  ['Kaggle Models', 'All', (q) => `https://www.kaggle.com/models?query=${q_(q)}`],
  ['Replicate', 'Cloud', (q) => `https://replicate.com/explore?query=${q_(q)}`],
  ['FAL', 'Cloud', (q) => `https://fal.ai/models?keywords=${q_(q)}`],
  ['GitHub', 'Code + weights', (q) => `https://github.com/search?q=${q_(q)}+model&type=repositories&s=updated`],
];

export default function Market() {
  const [source, setSource] = usePersist('market.source', 'everywhere');
  return (
    <div>
      <h1>🛒 Pandora Models</h1>
      <p className="sub">Search the newest open-source image, video, audio, 3D and language models across the web and install them straight into God's Pandora.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        {SOURCES.map(([id, label]) => <button key={id} className={'chip' + (source === id ? ' on' : '')} onClick={() => setSource(id)}>{label}</button>)}
      </div>
      {source === 'everywhere' && <EverywhereTab go={setSource} />}
      {source === 'huggingface' && <HfTab />}
      {source === 'civitai' && <CivitaiTab />}
      {source === 'pinokio' && <PinokioTab />}
      {source === 'openmodeldb' && <OmdbTab />}
      {source === 'ollama' && <OllamaTab />}
      {source === 'url' && <UrlTab />}
      {source === 'more' && <MoreTab />}
      <InstalledFiles />
    </div>
  );
}

function SearchRow({ q, setQ, onSearch, busy, placeholder, children }) {
  return (
    <div className="row" style={{ marginBottom: 10 }}>
      <input style={{ flex: 1, minWidth: 200 }} value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSearch()} />
      {children}
      <button className="btn small" disabled={busy} onClick={onSearch}>{busy ? 'Searching…' : '⌕ Search'}</button>
    </div>
  );
}

/* ── Search everywhere: one query across all in-app sources + every model website ── */
function EverywhereTab({ go }) {
  const [q, setQ] = usePersist('market.everyq', '');
  const [cat, setCat] = usePersist('market.everycat', 'all');
  const [res, setRes] = useState(null); // {hf, civ, omdb, errors}
  const [busy, setBusy] = useState(false);
  const [installed, setInstalled] = useState([]);
  const search = async () => {
    setBusy(true);
    const errors = {};
    const safe = (k, p) => p.catch((e) => { errors[k] = friendlyError(e) || 'failed'; return null; });
    const wantCiv = cat === 'all' || cat === 'image' || cat === 'video';
    const pkCat = cat === 'audio' ? 'music' : cat;
    const [hf, civ, omdb, pk] = await Promise.all([
      safe('Hugging Face', window.api.market.hf({ q, category: cat, sort: q ? 'downloads' : 'trending', limit: 12 })),
      wantCiv ? safe('Civitai', window.api.market.civitai({ q, types: cat === 'video' ? ['Checkpoint', 'LORA'] : ['Checkpoint', 'LORA'], sort: 'Most Downloaded', period: q ? 'AllTime' : 'Month', baseModel: cat === 'video' ? 'Wan Video' : '' })) : Promise.resolve(null),
      cat === 'all' || cat === 'image' ? safe('OpenModelDB', window.api.market.omdb({ q, scale: 0 })) : Promise.resolve(null),
      safe('Pinokio', window.api.market.pinokio({ q, category: pkCat, page: 1 })),
    ]);
    setRes({ hf: Array.isArray(hf) ? hf : [], civ: Array.isArray(civ?.items) ? civ.items : [], omdb: Array.isArray(omdb) ? omdb.slice(0, 6) : [], pk: Array.isArray(pk?.items) ? pk.items.slice(0, 12) : [], errors });
    setBusy(false);
  };
  useEffect(() => { search(); window.api.engine.listModels().then(setInstalled).catch(() => {}); }, [cat]);
  const sites = SITE_SEARCH.filter(([, c]) => cat === 'all' || new RegExp(cat === 'llm' ? 'LLM|All|Cloud' : cat === '3d' ? '3D|All' : cat === 'audio' ? 'Audio|All' : cat === 'video' ? 'Video|All|Cloud' : 'Image|All|Upscal|Cloud', 'i').test(c));
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>{HF_CATS.map(([id, l]) => <button key={id} className={'chip' + (cat === id ? ' on' : '')} onClick={() => setCat(id)}>{l}</button>)}</div>
      <SearchRow q={q} setQ={setQ} onSearch={search} busy={busy} placeholder="One search across Hugging Face, Civitai, OpenModelDB + 20 model websites (e.g. voice clone, wan, flux, 3d)…" />
      <label>Search this on other websites</label>
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        {sites.map(([name, c, url]) => (
          <a key={name} href={url(q)} target="_blank" rel="noreferrer" className="chip mini" style={{ textDecoration: 'none' }} title={c}>{name} ↗</a>
        ))}
      </div>
      {res && Object.keys(res.errors).length > 0 && <div className="sub" style={{ fontSize: 11, color: '#f0a000' }}>{Object.entries(res.errors).map(([k, v]) => k + ': ' + v).join(' · ')}</div>}
      {res && res.hf.length > 0 && (<>
        <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '8px 0' }}>🤗 Hugging Face</h3><button className="btn ghost small" onClick={() => go('huggingface')}>More →</button></div>
        <div className="market-grid">
          {res.hf.map((m) => (
            <div key={m.id} className="card market-card">
              <div className="row" style={{ justifyContent: 'space-between' }}><strong title={m.id}>{m.name}</strong><span className="badge">{m.type}</span></div>
              <div className="sub" style={{ fontSize: 11 }}>{m.author} · {m.task} · ⬇ {m.downloads.toLocaleString()}</div>
              <div className="row" style={{ marginTop: 4 }}>
                <DownloadButton repo={m.id} installed={installed.includes(m.id)} onDone={() => window.api.engine.listModels().then(setInstalled)} />
                <a href={m.link} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--gold)' }}>HF ↗</a>
              </div>
            </div>
          ))}
        </div>
      </>)}
      {res && res.pk.length > 0 && (<>
        <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '12px 0 8px' }}>🧩 Pinokio apps</h3><button className="btn ghost small" onClick={() => go('pinokio')}>More →</button></div>
        <div className="market-grid">{res.pk.map((a) => <PinokioCard key={a.id} a={a} />)}</div>
      </>)}
      {res && res.civ.length > 0 && (<>
        <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '12px 0 8px' }}>🎨 Civitai</h3><button className="btn ghost small" onClick={() => go('civitai')}>More →</button></div>
        <div className="market-grid">{res.civ.slice(0, 12).map((m) => <CivitaiCard key={m.id} m={m} />)}</div>
      </>)}
      {res && res.omdb.length > 0 && (<>
        <div className="row" style={{ justifyContent: 'space-between' }}><h3 style={{ margin: '12px 0 8px' }}>🔍 Upscalers (OpenModelDB)</h3><button className="btn ghost small" onClick={() => go('openmodeldb')}>More →</button></div>
        <div className="market-grid">
          {res.omdb.map((m) => (
            <div key={m.id} className="card market-card">
              <div className="row" style={{ justifyContent: 'space-between' }}><strong>{m.name}</strong><span className="badge">{m.scale}×</span></div>
              <div className="sub" style={{ fontSize: 11 }}>{m.author} · {m.arch}</div>
              {m.url ? <FileDownload id={'omdb:' + m.id} url={m.url} source="openmodeldb" type="upscaler" meta={{ name: m.name, sizeBytes: m.size, scale: m.scale, arch: m.arch }} /> : <a href={m.link} target="_blank" rel="noreferrer" className="badge">OpenModelDB ↗</a>}
            </div>
          ))}
        </div>
      </>)}
      {cat === 'llm' && <p className="sub">For local chat models, use the <button className="btn ghost small" onClick={() => go('ollama')}>🦙 Ollama tab</button> to install with one click.</p>}
      {res && !busy && !res.hf.length && !res.civ.length && !res.omdb.length && !res.pk.length &&<p className="sub">No in-app results — try the website buttons above.</p>}
      <p className="sub" style={{ fontSize: 11 }}>Found a file on another site? Copy its download link into <button className="btn ghost small" onClick={() => go('url')}>🔗 Any URL</button> to install it here.</p>
    </div>
  );
}

/* ── Pinokio: 1-click launchers for open-source AI apps ── */
const PK_CATS = [['music', '🎵 Music'], ['voice', '🎙 Voice · TTS · cloning'], ['audio', '🔊 Audio · SFX'], ['video', '🎬 Video'], ['image', '🖼 Image'], ['3d', '🧊 3D'], ['llm', '💬 LLM'], ['all', 'All AI apps']];
const PK_LABEL = Object.fromEntries(PK_CATS);

export function PinokioCard({ a }) {
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');
  const copy = async () => { try { await navigator.clipboard.writeText(a.installUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ } };
  const install = async () => {
    setMsg('');
    try { await window.api.market.pinokioInstall(a.installUrl); setMsg('✓ Sent to Pinokio — finish the install there'); }
    catch (e) { setMsg('⚠ ' + (friendlyError(e) || 'failed')); }
  };
  return (
    <div className="card market-card">
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        {a.icon && <img src={a.icon} alt="" loading="lazy" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong title={a.name}>{a.name}</strong>
          <div className="sub" style={{ fontSize: 10.5 }}>{a.repo}{a.version ? ' · v' + a.version : ''}{a.updated ? ' · ' + a.updated : ''}</div>
        </div>
      </div>
      <p className="sub" style={{ fontSize: 11.5, margin: '4px 0' }}>{a.desc || '—'}</p>
      <div className="row" style={{ gap: 4 }}>
        <span className="badge">{(PK_LABEL[a.cat] || a.cat).replace(/ ·.*/, '')}</span>
        {a.featured && <span className="badge" style={{ color: 'var(--gold)' }}>★ Featured</span>}
        {(a.gpu || []).map((g) => <span key={g} className="badge">{g}</span>)}
      </div>
      <div className="row" style={{ marginTop: 6, gap: 6 }}>
        {a.installUrl && <button className="btn small" onClick={install} title="One-click install through the Pinokio app running on this PC">⬇ Install in Pinokio</button>}
        {a.installUrl && <button className="btn ghost small" onClick={copy} title="Pinokio → Discover → Download from URL → paste">{copied ? '✓ Copied' : '📋 URL'}</button>}
        <a href={a.link} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--gold)' }}>Page ↗</a>
        {a.github && <a href={a.github} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--gold)' }}>GitHub ↗</a>}
      </div>
      {msg && <div className={msg.startsWith('⚠') ? 'err' : 'ok'} style={{ fontSize: 11, marginTop: 4 }}>{msg}</div>}
    </div>
  );
}

function PinokioTab() {
  const [cat, setCat] = usePersist('market.pkcat', 'music');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [st, setSt] = useState(null);
  const search = async (pg = 1) => {
    setBusy(true); setNote('');
    try {
      const r = await window.api.market.pinokio({ q, category: cat, page: pg });
      setItems((it) => (pg > 1 ? [...it, ...r.items.filter((x) => !it.some((y) => y.id === x.id))] : r.items));
      setPage(pg); setMore(!!r.hasMore);
      if (!r.live) setNote('Showing the built-in list — pinokio.co could not be reached (' + (r.error || 'offline') + ').');
    } catch (e) { setNote(friendlyError(e)); }
    setBusy(false);
  };
  useEffect(() => { search(1); }, [cat]);
  useEffect(() => { window.api.market.pinokioStatus?.().then(setSt).catch(() => {}); }, []);
  return (
    <div className="card">
      <p className="sub">
        <a href="https://pinokio.co" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Pinokio</a> installs complete open-source AI apps with one click —
        music generators (ACE-Step, YuE, DiffRhythm, Stable Audio 3, SongGeneration), voice cloning and TTS (F5, XTTS, Chatterbox, Qwen3-TTS, Applio / RVC),
        sound effects (MMAudio), video, image and 3D tools. They run in Pinokio; save the audio or video they make and drop it into God's Pandora (Library → Import, Film Studio, Ad Multiplier).
      </p>
      <div className="row" style={{ marginBottom: 8 }}>
        <span className={st?.running ? 'ok' : 'sub'} style={{ margin: 0, fontSize: 12 }}>{st == null ? '' : st.running ? '● Pinokio is running — Install buttons work in one click' : st.installed ? '○ Pinokio is installed but not running' : '○ Pinokio not found on this PC'}</span>
        {!st?.running && <button className="btn ghost small" onClick={async () => { await window.api.market.openPinokio?.(); setTimeout(() => window.api.market.pinokioStatus().then(setSt), 6000); }}>{st?.installed ? '🧩 Start Pinokio' : '⬇ Get Pinokio (free)'}</button>}
        <button className="btn ghost small" title="Check again" onClick={() => window.api.market.pinokioStatus().then(setSt)}>↻</button>
      </div>
      <div className="row" style={{ marginBottom: 8 }}>{PK_CATS.map(([id, l]) => <button key={id} className={'chip' + (cat === id ? ' on' : '')} onClick={() => setCat(id)}>{l}</button>)}</div>
      <SearchRow q={q} setQ={setQ} onSearch={() => search(1)} busy={busy} placeholder="Search Pinokio apps (e.g. song, voice clone, sfx, lipsync, upscale)…" />
      {note && <div className="sub" style={{ fontSize: 11, color: '#f0a000' }}>{note}</div>}
      <div className="market-grid">{items.map((a) => <PinokioCard key={a.id} a={a} />)}</div>
      {more && <button className="btn ghost small" disabled={busy} onClick={() => search(page + 1)}>{busy ? 'Loading…' : 'Load more'}</button>}
      {!busy && !items.length && <p className="sub">No apps found.</p>}
      <p className="sub" style={{ fontSize: 11 }}>
        How to install: start Pinokio, then click <b>⬇ Install in Pinokio</b> — Pinokio opens the app's installer. Or copy the URL and paste it in Pinokio → Discover → <i>Download from URL</i>.
        Apps are community-made — check GPU requirements and each model's license.
      </p>
    </div>
  );
}

/* ── Hugging Face ── */
function HfTab() {
  const [cat, setCat] = usePersist('market.hfcat', 'audio');
  const [sort, setSort] = usePersist('market.hfsort', 'trending');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [installed, setInstalled] = useState([]);
  const search = async () => {
    setBusy(true); setError('');
    try { setItems(await window.api.market.hf({ q, category: cat, sort, limit: 48 })); } catch (e) { setError(friendlyError(e)); }
    setBusy(false);
  };
  useEffect(() => { search(); window.api.engine.listModels().then(setInstalled).catch(() => {}); }, [cat, sort]);
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>{HF_CATS.map(([id, l]) => <button key={id} className={'chip' + (cat === id ? ' on' : '')} onClick={() => setCat(id)}>{l}</button>)}</div>
      <SearchRow q={q} setQ={setQ} onSearch={search} busy={busy} placeholder="Search Hugging Face (e.g. tts, music, flux, 3d, whisper)…">
        <select style={{ width: 150 }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="trending">🔥 Trending</option><option value="newest">🆕 Newest</option><option value="downloads">⬇ Most downloaded</option><option value="likes">♥ Most liked</option>
        </select>
      </SearchRow>
      {error && <div className="err">{error}</div>}
      <div className="market-grid">
        {items.map((m) => (
          <div key={m.id} className="card market-card">
            <div className="row" style={{ justifyContent: 'space-between' }}><strong title={m.id}>{m.name}</strong><span className="badge">{m.type}</span></div>
            <div className="sub" style={{ fontSize: 11 }}>{m.author} · {m.task}</div>
            <div className="row" style={{ gap: 4, margin: '4px 0' }}>
              <span className="badge">⬇ {m.downloads.toLocaleString()}</span><span className="badge">♥ {m.likes.toLocaleString()}</span>
              <span className="badge">{String(m.createdAt).slice(0, 10)}</span><span className="badge">{m.license}</span>
              {(m.engine || m.audioEngine) && <span className="badge" style={{ color: '#00ff88' }}>runs in God's Pandora</span>}
            </div>
            <div className="row">
              <DownloadButton repo={m.id} installed={installed.includes(m.id)} onDone={() => window.api.engine.listModels().then(setInstalled)} />
              <a href={m.link} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--gold)' }}>HF ↗</a>
            </div>
          </div>
        ))}
      </div>
      {!busy && items.length === 0 && !error && <p className="sub">No results.</p>}
      <p className="sub" style={{ fontSize: 11 }}>“Runs in God's Pandora” = models the built-in engines run directly: diffusers image and video models (FLUX, SDXL, Wan, LTX…) and music / voice / sound models (ACE-Step, Kokoro, Chatterbox, MusicGen, Bark, Stable Audio Open, XTTS, F5-TTS, Parler…). Pick them in Create → Local.</p>
    </div>
  );
}

/* ── Civitai ── */
function CivitaiTab() {
  const [types, setTypes] = usePersist('market.civtypes', ['Checkpoint', 'LORA']);
  const [base, setBase] = usePersist('market.civbase', '');
  const [sort, setSort] = usePersist('market.civsort', 'Most Downloaded');
  const [period, setPeriod] = usePersist('market.civperiod', 'Month');
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const search = async (more = false) => {
    setBusy(true); setError('');
    try {
      const r = await window.api.market.civitai({ q, types, sort, period, baseModel: base, nextUrl: more ? next : '' });
      setItems((it) => (more ? [...it, ...r.items] : r.items)); setNext(r.nextPage || '');
    } catch (e) { setError(friendlyError(e) + ' — Civitai may be busy or blocked on your network.'); }
    setBusy(false);
  };
  useEffect(() => { search(); }, [types.join(), base, sort, period]);
  const toggle = (t) => setTypes((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]));
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        {CIVITAI_TYPES.map((t) => <button key={t} className={'chip' + (types.includes(t) ? ' on' : '')} onClick={() => toggle(t)}>{t === 'LORA' ? 'LoRA' : t === 'TextualInversion' ? 'Embedding' : t}</button>)}
      </div>
      <SearchRow q={q} setQ={setQ} onSearch={() => search()} busy={busy} placeholder="Search Civitai (e.g. realistic, anime, cinematic lighting)…">
        <select style={{ width: 130 }} value={base} onChange={(e) => setBase(e.target.value)}>{CIVITAI_BASES.map((b) => <option key={b} value={b}>{b || 'Any base model'}</option>)}</select>
        <select style={{ width: 150 }} value={sort} onChange={(e) => setSort(e.target.value)}><option>Most Downloaded</option><option>Highest Rated</option><option>Newest</option></select>
        <select style={{ width: 100 }} value={period} onChange={(e) => setPeriod(e.target.value)}>{['Day', 'Week', 'Month', 'Year', 'AllTime'].map((p) => <option key={p}>{p}</option>)}</select>
      </SearchRow>
      {error && <div className="err">{error}</div>}
      <div className="market-grid">
        {items.map((m) => <CivitaiCard key={m.id} m={m} />)}
      </div>
      {next && <button className="btn ghost small" disabled={busy} onClick={() => search(true)}>{busy ? 'Loading…' : 'Load more'}</button>}
      <p className="sub" style={{ fontSize: 11 }}>
        Safe-for-work results only. SD 1.5 / SDXL / Pony / Illustrious checkpoints and LoRAs run in God's Pandora's local engine (pick them in Create → Local); others download for ComfyUI.
        Some models need a free Civitai API key (Settings → API Keys → Civitai). Always check each model's license.
      </p>
    </div>
  );
}

function CivitaiCard({ m }) {
  const [vid, setVid] = useState(m.versions[0]?.id);
  const v = m.versions.find((x) => x.id === vid) || m.versions[0];
  return (
    <div className="card market-card">
      {(v?.image || m.image) && <img className="market-thumb" src={v?.image || m.image} alt="" loading="lazy" />}
      <div className="row" style={{ justifyContent: 'space-between' }}><strong title={m.name}>{m.name}</strong><span className="badge">{m.type === 'LORA' ? 'LoRA' : m.type}</span></div>
      <div className="sub" style={{ fontSize: 11 }}>by {m.author} · ⬇ {m.downloads.toLocaleString()} · ★ {m.rating ? m.rating.toFixed(1) : '–'}</div>
      {m.versions.length > 1 && (
        <select value={vid} onChange={(e) => setVid(+e.target.value)}>{m.versions.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.baseModel}</option>)}</select>
      )}
      {v && (
        <>
          <div className="row" style={{ gap: 4, margin: '4px 0' }}>
            <span className="badge">{v.baseModel || '—'}</span>
            {v.sizeKB > 0 && <span className="badge">{fmtBytes(v.sizeKB * 1024)}</span>}
            {v.format && <span className="badge">{v.format}</span>}
            {v.scan && v.scan !== 'Success' && <span className="badge" style={{ color: '#f0a000' }}>scan: {v.scan}</span>}
          </div>
          {v.trainedWords.length > 0 && <div className="sub" style={{ fontSize: 11 }}>Trigger words: <code>{v.trainedWords.slice(0, 4).join(', ')}</code></div>}
          <div className="row" style={{ marginTop: 4 }}>
            <FileDownload id={'civitai:' + v.id} url={v.downloadUrl} source="civitai" type={m.type}
              meta={{ name: m.name + ' · ' + v.name, baseModel: v.baseModel, trainedWords: v.trainedWords, image: v.image, sizeBytes: v.sizeKB * 1024, civitaiModel: m.id, civitaiVersion: v.id }}
              warn={v.format === 'PickleTensor' ? 'This file is a PickleTensor (.ckpt/.pt), which can contain code. Prefer SafeTensor versions. Download anyway?' : null} />
            <a href={m.link} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--gold)' }}>Civitai ↗</a>
          </div>
        </>
      )}
    </div>
  );
}

/* Generic file download with progress + cancel */
export function FileDownload({ id, url, source, type, meta, label = '⬇ Install', warn, onDone }) {
  const [state, setState] = useState(null); // {bytes,total}
  const [jobId, setJobId] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { const off = window.api.market?.onProgress?.((p) => { if (p.id === id) setState(p); }); return typeof off === 'function' ? off : undefined; }, [id]);
  const go = async () => {
    if (warn && !window.confirm(warn)) return;
    const j = 'job-dl-' + Date.now().toString(36);
    setJobId(j); setMsg(''); setState({ bytes: 0, total: meta?.sizeBytes || 0 });
    try {
      const r = await window.api.market.download({ jobId: j, id, url, source, type, meta });
      setMsg('✓ Installed'); onDone && onDone(r);
    } catch (e) { const m = friendlyError(e); setMsg(m ? '⚠ ' + m : 'Cancelled'); }
    setJobId(null); setState(null);
  };
  if (jobId) {
    const pct = state?.total ? Math.min(100, Math.floor((state.bytes / state.total) * 100)) : null;
    return (
      <div className="dl-progress">
        <div className="bar"><div style={{ width: (pct ?? 5) + '%' }} /></div>
        <span className="sub" style={{ fontSize: 11 }}>{pct != null ? pct + '% · ' : ''}{fmtBytes(state?.bytes || 0)}{state?.total ? ' / ' + fmtBytes(state.total) : ''}</span>
        <button className="btn ghost small" onClick={() => window.api.jobs.cancel(jobId)}>✕</button>
      </div>
    );
  }
  return (
    <span className="row" style={{ gap: 6 }}>
      <button className="btn small" disabled={!url} onClick={go}>{label}</button>
      {msg && <span className={msg.startsWith('⚠') ? 'err' : 'ok'} style={{ fontSize: 11, margin: 0 }}>{msg}</span>}
    </span>
  );
}

/* ── OpenModelDB ── */
function OmdbTab() {
  const [q, setQ] = useState('');
  const [scale, setScale] = useState(0);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const search = async () => {
    setBusy(true); setError('');
    try { setItems(await window.api.market.omdb({ q, scale })); } catch (e) { setError(friendlyError(e)); }
    setBusy(false);
  };
  useEffect(() => { search(); }, [scale]);
  return (
    <div className="card">
      <SearchRow q={q} setQ={setQ} onSearch={search} busy={busy} placeholder="Search upscalers (anime, photo, denoise, jpeg, face…)">
        <select style={{ width: 110 }} value={scale} onChange={(e) => setScale(+e.target.value)}>{[0, 1, 2, 4, 8].map((s) => <option key={s} value={s}>{s ? s + '× scale' : 'Any scale'}</option>)}</select>
      </SearchRow>
      {error && <div className="err">{error}</div>}
      <div className="market-grid">
        {items.map((m) => (
          <div key={m.id} className="card market-card">
            <div className="row" style={{ justifyContent: 'space-between' }}><strong>{m.name}</strong><span className="badge">{m.scale}×</span></div>
            <div className="sub" style={{ fontSize: 11 }}>{m.author} · {m.arch} · {m.license}</div>
            <p className="sub" style={{ fontSize: 11, margin: '4px 0' }}>{m.description}</p>
            <div className="row">
              {m.url ? <FileDownload id={'omdb:' + m.id} url={m.url} source="openmodeldb" type="upscaler" meta={{ name: m.name, sizeBytes: m.size, scale: m.scale, arch: m.arch }} />
                : <span className="sub" style={{ fontSize: 11 }}>Manual download only</span>}
              <a href={m.link} target="_blank" rel="noreferrer" className="badge" style={{ color: 'var(--gold)' }}>OpenModelDB ↗</a>
            </div>
          </div>
        ))}
      </div>
      <p className="sub" style={{ fontSize: 11 }}>Upscalers work in chaiNNer, ComfyUI and other upscaling apps.</p>
    </div>
  );
}

/* ── Ollama ── */
function OllamaTab() {
  const [st, setSt] = useState(null);
  const [name, setName] = useState('');
  const [job, setJob] = useState(null);
  const [prog, setProg] = useState(null);
  const [msg, setMsg] = useState('');
  const refresh = () => window.api.market.ollamaList().then(setSt).catch(() => setSt({ running: false, models: [] }));
  useEffect(() => { refresh(); return window.api.market.onProgress((p) => { if (String(p.id).startsWith('ollama:')) setProg(p); }); }, []);
  const pull = async (m) => {
    const j = 'job-ol-' + Date.now().toString(36);
    setJob(j); setMsg(''); setProg(null);
    try { await window.api.market.ollamaPull({ jobId: j, model: m }); setMsg('✓ ' + m + ' installed — pick it in Ad Multiplier, ✨ Enhance and other local-LLM features'); }
    catch (e) { const t = friendlyError(e); setMsg(t ? '⚠ ' + t : 'Cancelled'); }
    setJob(null); refresh();
  };
  return (
    <div className="card">
      <p className="sub">Local LLMs run in <a href="https://ollama.com" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Ollama</a>. God's Pandora uses them for ✨ Enhance, the Ad Multiplier breakdown and other offline text features.</p>
      <div className="row"><span className={st?.running ? 'ok' : 'err'} style={{ margin: 0 }}>{st == null ? 'Checking…' : st.running ? '● Ollama is running' : '○ Ollama is not running — install / start it from ollama.com'}</span></div>
      <div className="row" style={{ marginTop: 8 }}>
        <input style={{ flex: 1 }} value={name} placeholder="Model name from ollama.com/library (e.g. qwen2.5vl:7b)" onChange={(e) => setName(e.target.value)} />
        <button className="btn small" disabled={!name.trim() || !!job || !st?.running} onClick={() => pull(name.trim())}>⬇ Pull</button>
      </div>
      <div className="row" style={{ marginTop: 6 }}>{OLLAMA_POPULAR.map((m) => <button key={m} className="chip mini" disabled={!!job || !st?.running} onClick={() => pull(m)}>{m}</button>)}</div>
      {job && (
        <div className="dl-progress" style={{ marginTop: 8 }}>
          <div className="bar"><div style={{ width: (prog?.total ? Math.round((prog.bytes / prog.total) * 100) : 5) + '%' }} /></div>
          <span className="sub" style={{ fontSize: 11 }}>{prog?.status || 'starting…'} {prog?.total ? fmtBytes(prog.bytes) + ' / ' + fmtBytes(prog.total) : ''}</span>
          <button className="btn ghost small" onClick={() => window.api.jobs.cancel(job)}>✕</button>
        </div>
      )}
      {msg && <div className={msg.startsWith('⚠') ? 'err' : 'ok'}>{msg}</div>}
      {st?.models?.length > 0 && <><label>Installed in Ollama</label><div className="row">{st.models.map((m) => <span key={m.name} className="badge">{m.name} · {fmtBytes(m.size)}</span>)}</div></>}
    </div>
  );
}

/* ── Any URL ── */
function UrlTab() {
  const [url, setUrl] = useState('');
  const [type, setType] = useState('Checkpoint');
  const [base, setBase] = useState('SDXL 1.0');
  const ok = /^https?:\/\/\S+$/.test(url.trim());
  return (
    <div className="card">
      <p className="sub">Paste a direct link to a model file (.safetensors, .ckpt, .pth, .gguf, .onnx…) from any website — Civitai, ModelScope, Tensor.Art, GitHub releases, your own server.</p>
      <input value={url} placeholder="https://…/model.safetensors" onChange={(e) => setUrl(e.target.value)} />
      <div className="row" style={{ marginTop: 6 }}>
        <select style={{ width: 160 }} value={type} onChange={(e) => setType(e.target.value)}>{['Checkpoint', 'LORA', 'TextualInversion', 'Controlnet', 'VAE', 'Upscaler', 'Audio', '3D', 'LLM', 'Other'].map((t) => <option key={t}>{t}</option>)}</select>
        <select style={{ width: 150 }} value={base} onChange={(e) => setBase(e.target.value)}>{CIVITAI_BASES.filter(Boolean).map((b) => <option key={b}>{b}</option>)}<option value="">Other / unknown</option></select>
        <FileDownload id={'url:' + url} url={ok ? url.trim() : ''} source="files" type={type} meta={{ name: decodeURIComponent(url.split('/').pop().split('?')[0] || 'model'), baseModel: base }} label="⬇ Download" />
      </div>
    </div>
  );
}

function MoreTab() {
  return (
    <div className="card">
      <p className="sub">More places to find open models. Links open in your browser; bring files back through the <b>Any URL</b> tab.</p>
      <div className="market-grid">
        {MORE_HUBS.map(([name, url, note]) => (
          <div key={name} className="card market-card">
            <strong>{name}</strong>
            <p className="sub" style={{ fontSize: 11.5, margin: '4px 0' }}>{note}</p>
            <a href={url} target="_blank" rel="noreferrer" className="btn ghost small" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>Open ↗</a>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Installed files (Civitai, OpenModelDB, URLs) ── */
function InstalledFiles() {
  const [files, setFiles] = useState([]);
  const load = () => window.api.market.files().then(setFiles).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  if (!files.length) return null;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>Installed from the market ({files.length})</h3>
      <table><tbody>
        <tr><th>Name</th><th>Type</th><th>Base</th><th>Size</th><th></th></tr>
        {files.map((f) => (
          <tr key={f.file}>
            <td>{f.name}{f.trainedWords.length > 0 && <div className="sub" style={{ fontSize: 10.5 }}>triggers: {f.trainedWords.slice(0, 3).join(', ')}</div>}</td>
            <td><span className="badge">{f.type}</span></td><td className="sub">{f.baseModel || '—'}</td><td className="sub">{fmtBytes(f.sizeBytes)}</td>
            <td className="row" style={{ gap: 4 }}>
              <button className="btn ghost small" onClick={() => window.api.reveal(f.file)}>Show</button>
              <button className="btn danger small" onClick={async () => { if (window.confirm('Delete ' + f.name + ' from disk?')) { await window.api.market.deleteFile(f.file); load(); } }}>Delete</button>
            </td>
          </tr>
        ))}
      </tbody></table>
    </div>
  );
}
