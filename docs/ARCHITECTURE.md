# God's Pandora — Architecture

```
┌────────────────────────── Electron app ──────────────────────────┐
│  Renderer (React + Vite)                                         │
│   Create · Library · Models · Characters · Locations · Settings  │
│        │  IPC (contextBridge, no node in renderer)               │
│  Main process                                                    │
│   ├─ keys: safeStorage-encrypted at rest (keys.enc.json)         │
│   ├─ generate.js  ← prompt composer (camera + character +        │
│   │                 LOCATION LOCK) + ref-image collector         │
│   ├─ providers/: fal · replicate · openai · google ·             │
│   │              elevenlabs · stability · local                  │
│   ├─ media: library/asset storage in userData, media:// protocol │
│   └─ engineManager: venv install, spawn, HF model downloads      │
└──────────────┬───────────────────────────────┬───────────────────┘
               │ HTTPS (user's own keys)       │ http://127.0.0.1:8756
        Cloud model APIs                 engine/server.py
   (FAL, Replicate, OpenAI,          (FastAPI + diffusers,
    Google, ElevenLabs,               models in userData/models,
    Stability)                        CUDA / MPS / CPU)
```

Design decisions

- **All API calls in the main process** — keys never enter the renderer; no CORS problems; responses stream to disk.
- **Reference images as data URIs** — FAL and Replicate accept them, so no upload server is needed.
- **Catalog-driven** — models are rows in `data/modelCatalog.json` with a `refInput` field; adding a model is a JSON edit. `refInput` is what powers Character + Location Lock per model.
- **One pipeline in VRAM** at a time in the local engine (LRU of 1) to survive consumer GPUs.
- **DB is a single JSON** (`userData/db.json`) — characters, locations, generation metadata. Media lives as plain files in `userData/library`.

Consistency stack (what makes it "Higgsfield + more")

| Axis      | Mechanism v1                                            | Roadmap |
|-----------|---------------------------------------------------------|---------|
| Camera    | 24 curated DP-vocabulary presets injected into prompt   | motion-control model params (Kling camera_control, etc.) |
| Character | refs → model ref inputs + identity directive            | per-character LoRA training in local engine |
| **Location (new)** | refs → model ref inputs + strict environment directive | per-location LoRA; multi-angle location capture; depth-map anchoring |
