import { useEffect, useMemo, useState } from 'react';
import catalog from '../../data/modelCatalog.json';
import directory from '../../data/modelDirectory.json';
import { useStore } from './store.jsx';

// Every runnable model in one list: built-in catalog + your custom models (any FAL / Replicate /
// Higgsfield / Hugging Face endpoint) + every model you downloaded (auto-detected image or video)
// + engine-compatible directory models (download automatically on first use).
export function useDownloaded() {
  const [list, setList] = useState([]);
  useEffect(() => {
    let ok = true;
    const load = () => (window.api.engine.listModelsDetailed
      ? window.api.engine.listModelsDetailed()
      : window.api.engine.listModels().then((l) => l.map((repo) => ({ repo, kind: 'image', runnable: true }))))
      .then((l) => ok && setList(l || [])).catch(() => {});
    load(); const t = setInterval(load, 8000);
    return () => { ok = false; clearInterval(t); };
  }, []);
  return list;
}

// Files installed from Civitai / URLs (checkpoints, LoRAs…)
export function useMarketFiles() {
  const [files, setFiles] = useState([]);
  useEffect(() => {
    let ok = true;
    const load = () => window.api.market?.files().then((l) => ok && setFiles(l || [])).catch(() => {});
    load(); const t = setInterval(load, 8000);
    return () => { ok = false; clearInterval(t); };
  }, []);
  return files;
}

// Base models the local engine can load from a single .safetensors / .ckpt file
export const LOCAL_FILE_BASES = ['SD 1.5', 'SD 1.4', 'SDXL 1.0', 'SDXL Turbo', 'SDXL Lightning', 'Pony', 'Illustrious', 'NoobAI'];
export const isXL = (b) => /SDXL|Pony|Illustrious|NoobAI/i.test(b || '');
export const loraFits = (loraBase, modelBase) => !loraBase || !modelBase || isXL(loraBase) === isXL(modelBase);

export function useAllModels() {
  const { db } = useStore();
  const downloaded = useDownloaded();
  const marketFiles = useMarketFiles();
  return useMemo(() => {
    const dlSet = new Set(downloaded.map((d) => d.repo));
    const custom = (db.customModels || []).map((m) => ({ ...m, custom: true }));
    const base = [...catalog.models, ...custom].map((m) => (m.provider === 'local' ? { ...m, downloaded: dlSet.has(m.endpoint) } : m));
    const known = new Set(base.filter((m) => m.provider === 'local').map((m) => m.endpoint));
    const dl = downloaded
      .filter((d) => d.runnable && !known.has(d.repo))
      .map((d) => ({
        id: 'dl-' + d.repo, name: d.repo.split('/').pop() + ' (downloaded · ' + d.kind + ')', provider: 'local', kind: d.kind,
        endpoint: d.repo, refInput: 'reference_images', maxRefs: d.kind === 'video' ? 1 : 4, downloaded: true,
      }));
    dl.forEach((m) => known.add(m.endpoint));
    const dir = directory.openSource
      .filter((m) => m.engine && !known.has(m.repo))
      .map((m) => ({
        id: 'os-' + m.repo, name: m.name + ' (downloads on first use)', provider: 'local', kind: 'image',
        endpoint: m.repo, refInput: 'reference_images', maxRefs: 4, downloaded: false,
      }));
    const ckpts = marketFiles
      .filter((f) => /checkpoint/i.test(f.type) && /\.(safetensors|ckpt)$/i.test(f.file) && (!f.baseModel || LOCAL_FILE_BASES.includes(f.baseModel)))
      .map((f) => ({
        id: 'file-' + f.file, name: f.name + ' (' + (f.baseModel || 'checkpoint') + ')', provider: 'local', kind: 'image',
        endpoint: f.file, base: f.baseModel || '', refInput: 'reference_images', maxRefs: 4, downloaded: true, fromMarket: true,
      }));
    return [...base, ...ckpts, ...dl, ...dir];
  }, [db.customModels, downloaded, marketFiles]);
}

export const PROVIDER_NAMES = {
  fal: 'FAL.ai', replicate: 'Replicate', higgsfield: 'Higgsfield', huggingface: 'Hugging Face',
  openai: 'OpenAI', google: 'Google', stability: 'Stability', elevenlabs: 'ElevenLabs', local: 'Local engine',
};

export function modelLabel(m) {
  if (m.provider === 'local') return (m.downloaded ? '⬇ ' : '◌ ') + m.name;
  return m.name + ' — ' + (PROVIDER_NAMES[m.provider] || m.provider) + (m.custom ? ' · custom' : '');
}
