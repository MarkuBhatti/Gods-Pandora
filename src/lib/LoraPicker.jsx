import React from 'react';
import { useMarketFiles, isXL, loraFits } from './models.jsx';

// LoRAs installed from the Model Market (Civitai / URLs) — stack them on local SD 1.5 / SDXL models.
export function modelBase(model) {
  if (!model) return '';
  if (model.base) return model.base;
  const e = String(model.endpoint || '').toLowerCase();
  if (/xl|pony|illustrious/.test(e)) return 'SDXL 1.0';
  if (/stable-diffusion-v1|sd-?1\.?5|v1-5/.test(e)) return 'SD 1.5';
  if (/flux/.test(e)) return 'Flux.1 D';
  return '';
}

export default function LoraPicker({ model, value, onChange, addTriggers, setAddTriggers }) {
  const files = useMarketFiles().filter((f) => /lora/i.test(f.type) && /\.safetensors$/i.test(f.file));
  if (!model || model.provider !== 'local') return null;
  const base = modelBase(model);
  const fits = files.filter((f) => loraFits(f.baseModel, base) && !(/flux/i.test(f.baseModel) !== /flux/i.test(base) && f.baseModel && base));
  if (!files.length) {
    return <p className="sub" style={{ fontSize: 11 }}>🎛 LoRAs: install some from 🛒 Model Market → Civitai (LoRA) to stack styles and characters here.</p>;
  }
  const sel = value || {};
  return (
    <div className="card" style={{ padding: 10, marginTop: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong style={{ fontSize: 12 }}>🎛 LoRAs {base ? '· fits ' + (isXL(base) ? 'SDXL-family' : base) : ''}</strong>
        <label className="row" style={{ gap: 4, margin: 0, fontSize: 11 }}><input type="checkbox" style={{ width: 'auto' }} checked={addTriggers} onChange={(e) => setAddTriggers(e.target.checked)} /> add trigger words</label>
      </div>
      {fits.length === 0 && <p className="sub" style={{ fontSize: 11, margin: '4px 0 0' }}>None of your {files.length} LoRA(s) match this model's base ({base || 'unknown'}).</p>}
      {fits.map((f) => {
        const on = sel[f.file] != null;
        return (
          <div key={f.file} className="lora-row">
            <button className={'chip mini' + (on ? ' on' : '')} title={f.trainedWords.join(', ')} onClick={() => {
              const n = { ...sel }; if (on) delete n[f.file]; else n[f.file] = 0.8; onChange(n);
            }}>{f.name.slice(0, 40)}</button>
            {on && <>
              <input type="range" min="0" max="1.5" step="0.05" value={sel[f.file]} onChange={(e) => onChange({ ...sel, [f.file]: +e.target.value })} />
              <span className="sub" style={{ fontSize: 11 }}>{sel[f.file].toFixed(2)}</span>
            </>}
          </div>
        );
      })}
    </div>
  );
}

export function loraParams(sel, files) {
  return Object.entries(sel || {}).map(([path, scale]) => ({ path, scale }));
}
export function triggerText(sel, files) {
  const words = files.filter((f) => sel && sel[f.file] != null).flatMap((f) => f.trainedWords.slice(0, 2));
  return words.length ? words.join(', ') + ', ' : '';
}
