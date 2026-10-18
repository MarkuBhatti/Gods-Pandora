# Changelog

## 0.4.0 — 2026-10-16 · Pandora Cut + "never a problem" update

### Added
- **Pandora Connect** (new tab): an MCP connector so **Claude Desktop, Claude Code, ChatGPT (via tunnel), Cursor,
  VS Code / Copilot, Windsurf** or any MCP app can use God's Pandora from chat — generate images, video shots,
  voice-overs, documents, decks, auto-edit, colour-grade, build a launch package or hand a whole job to the agent.
  One-click "Add to Claude Desktop", copy-paste setup for every other app, token-protected and local-only
  (127.0.0.1), Free / Hybrid / Cloud routing and per-session limits that protect your API credits.
- **Pandora Agent** (new tab): tell it the job ("launch my clothing brand…") and it plans, then uses every tool —
  writes the brand bible, scripts and captions, generates images and video shots with the models you've connected,
  records a voice-over, auto-edits and colour-grades the promo video, builds a presentation (HTML + PDF) and
  hands back a complete launch package folder (index page + README). Claude (your key) or a free local model,
  plan approval before any paid generation, hard budgets for images / videos / voice-overs, live progress, stop anytime.
  - **Free / Hybrid / Cloud modes**: every step can run on open-source models on your PC at zero cost — the agent
    picks the best local model your GPU can handle (FLUX.2 klein / SDXL / SD 1.5 for images, Wan 2.2 for video on
    16 GB+ GPUs), installs the engine and downloads models on first use, falls back to free animated stills for
    video and the built-in system voice for voice-overs, and uses a local LLM (Ollama / LM Studio) as the brain.
    Hybrid uses free local models first and cloud APIs only when needed; Cloud does the opposite.
- **Pandora Color** (new tab) — a colourist's toolkit inspired by DaVinci Resolve, Colourlab AI and Retouch4Me:
  Auto Balance with six "auto grade" directions shown as real previews, 16 film looks + **My Looks**
  (save your own, Imagen-style), reference **colour match** with strength, primaries (exposure, contrast,
  highlights, shadows, whites, blacks, fade, temperature, tint, vibrance, saturation), split-toning, clarity,
  sharpen, vignette, grain, RGB histogram, before/after split, frame scrubber, batch "grade all" with shot
  matching, and **.cube LUT export** for Resolve / Premiere / Final Cut / Photoshop. Preview and render use the
  same LUT, so what you see is exactly what you get.
- **Pandora Photo** (new tab) — auto photo edit & portrait retouch inspired by Imagen, Evoto and Retouch4Me:
  Auto Enhance choices, Auto portrait, looks, colour match, skin smoothing that keeps pores, blemish removal,
  even skin tone, brushes (spot heal, whiten teeth & eyes, smooth, brighten eyes), batch apply & save at full
  resolution.
- **Pandora AutoEdit** (was Cut) — CapCut AutoCut-style **style templates** (Vlog, Travel, Hype, Cinematic,
  Wedding, Product Promo, TikTok Trend, Documentary, Moody Night), **best-moment detection**, punch-in zooms,
  white-flash transitions, cinematic bars, opening title, looks, and a new **Talking video** mode that removes
  pauses automatically (jump cuts).
- **Pandora Cut** (new tab): DaVinci-Resolve-inspired, free and offline (ffmpeg).
  - *Auto Edit*: beat detection on your music (cuts land on the beat), scene detection (each shot starts
    on a fresh moment), smart reframe to 9:16 / 1:1 / 4:5 / 16:9 / 21:9, transitions, Ken-Burns on photos.
  - *Auto Color*: Auto Balance (white balance + levels), Shot Match to a reference clip, 10 film looks,
    your own `.cube` LUTs, vignette and grain, before/after preview.
  - One-click free ffmpeg install if it's missing.
- **Model status in every model picker**: Ready (downloaded) · Downloading xx% · Not downloaded ·
  Download incomplete · API key connected · Key missing, with a one-click fix (Download / Resume / Add key /
  Install engine). Generate stays disabled until the model can really run. Create, Studio tools, Film,
  Influencer, Shapeshift and Ad Multiplier.
- **New installer** in a dark, cinematic style (inspired by DaVinci Resolve): launch splash card, dark pages with
  the living Pandora box artwork, component choices (desktop / Start menu / start at sign-in), clear install
  steps, and an uninstaller that can keep or remove your library, keys and models.
- **Launch card**: a Resolve-style loading card shows while the studio starts.
- **Lite mode** (sidebar): freezes animated scenes and blur; Auto turns it on for low-end PCs and low battery.

### Fixed / improved
- AutoEdit could hang forever when the last cut was shorter than the transition — fixed, plus a render safety timeout.
- Claude model id updated to `claude-sonnet-5-5` (App Forge, prompt enhance, ad analysis).
- **Download progress is now real**: the % and bar follow the actual bytes downloaded (no more stuck at 99 %),
  the confirm dialog shows the real download size, and the Setup Wizard / first-run screen show a live bar.
  Re-syncing a model counts files you already have; partially downloaded models are never shown as installed.
- Last "God's Eye" leftovers renamed (TouchDesigner OSC addresses are now `/pandora/...`, bridge `pandoraBridge`,
  setup steps, update messages, AI Market text).
- App Forge and Studio text/code tools can now use a **free local model** (Ollama / LM Studio) — the "local runtime"
  choice really runs locally instead of falling back to Claude.
- Only one God's Pandora runs at a time (a second launch focuses the open window); quitting stops the engine,
  downloads and renders cleanly.
- Moons in the backgrounds no longer sit on top of page titles; sidebar footer no longer hides the last tab.
- Influencer page has its proper title; Guide Book button stays on the right; Cut has its own icon.
- Setup no longer reinstalls the engine every time you download a model.
- Model downloads fetch only one fp16 copy of the weights + configs (SD 1.5 ≈ 2 GB instead of ≈ 10 GB;
  SDXL ≈ 7 GB instead of ≈ 20 GB) and report honest progress. Partial downloads are detected and resumable.
- Harmless library warnings (symlinks, deprecations, telemetry, "unauthenticated") are silenced.
- Low-VRAM engine (ComfyUI-style): SD 1.5 stays fully on the GPU on 6 GB+, big models offload,
  VAE tiling/slicing and attention slicing on ≤ 8 GB, automatic retry in low-memory mode on out-of-memory.
- Resolution auto-fits each model's native size (SD 1.5 → ~512², SDXL → ~1024²) for sharper results.
- Engine watchdog restarts the local engine automatically if it stops; helper processes never open
  console windows; renders run at below-normal priority so the app stays responsive.
- Clear, friendly messages for gated models, no internet and full disks.

## 0.3.0 — 2026-10-16 · God's Pandora

**Every model. Every medium. One creative universe.**

### Changed — new name and look
- God's Eye is now **God's Pandora**: Pandora Core (open-source core), Pandora Cloud (API services),
  Pandora Models (model library), Pandora Studio (creative workspace), Pandora Plugins (extensions),
  Pandora Gallery (creations); every tab carries the Pandora name.
- New logo: the **living Pandora box** — the painted faces of the logo revolve as a real 3D box, the
  energy burst rises from the lid and the cosmic aura breathes underneath (Home and sidebar). New app icon.
- New friendly, colourful iOS-style interface: glass navigation, colourful app-icon tabs that pop on hover,
  pill buttons with springy press, rounded cards, sheets and dialogs that spring in, soft page transitions,
  one swipeable top tab row.
- **Cinematic mood lighting** behind every page: drifting fog, volumetric street lamps with light cones,
  neon glow, firelight and candle flicker, god rays, distant city bokeh, rain / embers / dust, wet ground and
  film grain — seven moods (neon fog, teal night, dystopia, firelight, candle cave, jade ruins, jungle rain).
- **Every tool has its own illustrated card**: a colour-coded thumbnail with a drawn icon (40+ icons matched to
  what the tool does) and an "input → result" strip (e.g. Selfie → Image) — across all studios, 3D, TouchDesigner
  templates and Film templates.
- **A unique scene behind every page** (30 in total): city skylines with lit windows, parked and passing cars
  with headlights and tail-lights, practical interior lamps (pendants, floor and desk lamps), neon signs,
  billboards, string lights, bridges, a gas-station canopy, night-market stalls, a forest cabin, a campfire,
  cave crystals, temple ruins, bookshelves, server racks and a forge.
- Home: big "What will you create today?" prompt bar (Image / Video / Audio) that opens Pandora Studio with
  your prompt, plus quick actions (remix an ad, Shapeshift a video, AI influencer, music & voice apps).
- Your keys, library, characters and installed local engine carry over from God's Eye automatically.
- Installer is now `Gods-Pandora-Setup-0.3.0.exe`; GitHub repo name `gods-pandora`.


## 0.2.0 — 2026-10-13

### Added
- **⌂ Home page** (opens first): every tool grouped by Image, Video, Audio, 3D, Marketing, Build and Models,
  plus recent creations and key / engine status.
- **← Back / → Forward / ⌂ Home** buttons in the top bar; also Alt+← / Alt+→, Alt+H and the mouse side buttons.
- Windows code-signing support built in (`build-assets/sign.js`, `SIGNING.md`): add a certificate and BUILD.bat signs automatically.

### Changed
- Feature names are now our own: **Identity Lock** (train a character's face once) and
  **Shapeshift** (motion transfer / swap / restyle any video). Higgsfield remains a supported cloud provider.

### Added — 🛒 Model Market
- **🧩 Pinokio apps** tab: live search of pinokio.co's catalog (185+ AI apps) — music (ACE-Step, YuE,
  DiffRhythm, Stable Audio 3, SongGeneration, HeartMuLa, AudioCraft…), voice/TTS/cloning (Applio, RVC,
  F5, XTTS, Chatterbox, Qwen3-TTS, VoxCPM, Higgs Audio, Zonos, Dia…), SFX (MMAudio, AudioSep), video,
  image and 3D. One-click **Install in Pinokio** (through the Pinokio app running on your PC),
  detects/starts Pinokio, and falls back to a built-in list of 55 apps when offline.
- **🌍 Search everywhere** tab: one query returns live results from Hugging Face, Civitai and
  OpenModelDB side by side, plus one-click search on 20+ model websites (Tensor.Art, SeaArt,
  LiblibAI, Shakker, CivArchive, ModelScope, Voice-Models.com, Sketchfab, Ollama, LM Studio,
  Kaggle, Replicate, FAL, GitHub…), filtered by Image / Video / Audio / 3D / LLM.
- New **Model Market** page (sidebar): search and install open models from
  - **Hugging Face** by category — Image, Video, **Audio** (TTS, voice cloning, music, speech-to-text), **3D**, LLM — sorted by trending / newest / downloads / likes;
  - **Civitai** — checkpoints, LoRAs, embeddings, ControlNets, filtered by base model (SD 1.5, SDXL, Pony, Illustrious, Flux…), safe-for-work only, optional Civitai API key;
  - **OpenModelDB** upscalers; **Ollama** local LLMs (pull with progress); **any direct URL**; plus links to ModelScope, Tensor.Art, LiblibAI, SeaArt, LM Studio, Kaggle, Replicate, FAL and GitHub.
- Downloads show progress, can be cancelled, and are listed under “Installed from the market” (show / delete).
- **Civitai checkpoints (SD 1.5 / SDXL / Pony / Illustrious) run in the local engine** and appear in Create → Local.
- **LoRA stacking**: pick installed LoRAs with strength sliders in Create → Local; trigger words are added automatically.
- Model Directory: 19 new verified **audio** (Kokoro, IndexTTS 2.5, Qwen3-TTS, OmniVoice, Fish S2 Pro, Chatterbox, Higgs TTS 3, Stable Audio 3, ACE-Step 1.5, YuE2, MiniMax Music 3…) and **3D** models (TRELLIS.2, Hunyuan3D 2.1, Stable Fast 3D, SPAR3D).
- Update Center feed now includes audio and 3D releases.

### Added — cancel anything + quality of life
- **✕ Cancel** next to every Generate button (Create, all Studios, Film shots, Node Canvas, Influencer, Shapeshift, Ad Multiplier, Identity Lock training) with a live timer; **Esc** cancels too. Cloud jobs are dropped on FAL / Higgsfield where possible, local GPU work stops after the current step, training processes are stopped.
- Sidebar shows everything that's running, with Cancel / Cancel all.
- **Ctrl+Enter** generates; **Ctrl+K** quick-jump to any page.
- **✨ Enhance prompt** (Claude, or a local model in Ollama), **🕘 Recent prompts**, copy / clear.
- Generate **×1 / ×2 / ×4** variations at once.
- Create remembers your last model, settings and count.
- **Drag & drop** images from Explorer onto any reference slot.
- Library: **large viewer** (← → to browse, Esc to close), **★ favorites** filter, copy prompt, confirmation before removing.
- Desktop notification when a long generation finishes while God's Eye is in the background.
- Clearer error messages (bad key, no credits, rate limit, network) with an **Open API Keys** button.

### Fixed
- Local engine install on the installed app (engine files are now unpacked next to app.asar).
- NVIDIA PCs now get the CUDA build of PyTorch (cu130) instead of the CPU-only one.

### Added — every skilled tool runs locally OR in the cloud
- **Local Identity Lock**: trains a LoRA on your GPU (SDXL ≈ 12–16 GB VRAM, SD 1.5 ≈ 8 GB) with `engine/train_lora.py`; generations with the same local base model apply it automatically.
- **Local Shapeshift**: Wan-Animate-2 14B (distilled) in the built-in engine drives your character with any video's motion; Swap / Restyle edit frame one with a local image model first. Needs ~24 GB VRAM + 64 GB RAM.
- **Local Ad Multiplier breakdown**: any OpenAI-compatible local vision model (Ollama, LM Studio). Generation already works with local image/video models.
- GPU check (name + VRAM vs. requirement) shown in each tool; engine frees GPU memory before training.

### Added — skilled tools (our own Identity Lock, Shapeshift, Ad Multiplier)
- **🧬 Identity Lock** (Characters → any card → *Train Identity Lock*): trains a reusable identity from a character's photos — FLUX LoRA via FAL (open) or Higgsfield SOUL custom reference. Pick a “Identity Lock” model and select / @mention the character to generate with it.
- **🌀 Shapeshift** (new page): Motion transfer, Object swap and Restyle for any 4–30 s video. Runs on Higgsfield (cloud), or on open-source Wan 2.2 Animate via FAL (open Restyle = restyle frame one with an image-edit model, then drive it with the source motion). Higgsfield's style presets load live. *Use in Shapeshift* from the Influencer builder and *🌀 Shapeshift* on every video.
- **📈 Ad Multiplier** (new page): upload a reference ad → Claude breaks it into shots (or manual breakdown) → swap product / cast / location / script → every hook × CTA becomes a variant (up to 8). Faithful mode restages each reference keyframe with your assets, then animates it; body shots are reused across variants; variants are stitched with ffmpeg.
- Local files (videos, photos, training zips) upload automatically to FAL / Higgsfield storage.

### Added — run any model, everything connected
- **Run any model inside God's Eye**
  - *＋ Add any model* (Models page): any FAL, Replicate or Higgsfield endpoint, any Hugging Face–hosted open model, or any diffusers repo on your GPU. Custom models show up in Create, every Studio and Film.
  - **Higgsfield API provider** (SOUL, SOUL V2, Kling 2.5 Turbo, MiniMax Hailuo 2.3 built in; any other Higgsfield model via *Add any model*). Reference images are uploaded automatically.
  - **Hugging Face Inference Providers**: run hosted open models (FLUX, Qwen-Image, Wan…) with just your HF token — God's Eye finds a live provider for the repo.
  - **Local engine runs video**: Wan 2.2, LTX, CogVideoX, HunyuanVideo-style diffusers pipelines export MP4 on your GPU; starts automatically when you generate.
  - **Local reference images**: edit/multi-reference input for FLUX.2 / Qwen-Image style models, IP-Adapter for SD 1.5 / SDXL, start frame for image-to-video.
  - Every downloaded model is detected as image or video and appears automatically in the model pickers.
  - FAL now uses its queue API, and long local jobs no longer hit the 5-minute request timeout.
- **Everything connected**
  - **@mentions**: type `@Name` in any prompt (Create, Studios, Film) to pull in a saved character, location or product with its reference images.
  - **Products & Brand** library alongside Characters and Locations; all three accept up to 14 reference images, can be edited, and can take images straight from the Library.
  - **Save to…** on every result and Library item: create a character / location / product from it or add it to an existing one.
  - **Remix**, **Animate** (image → video) and **Extend** (continue a video from its last frame) on every result.
  - Library filters by type, character, location and @mention, plus search.
  - Character / location cards open Create (image or video) with that asset preselected and show how often they were used.
  - Film: **🔗 Continue from previous shot** feeds the last frame of the previous shot into the next for continuity.
- **AI Influencer Character Builder** (Higgsfield-style): 19 menu categories, Shuffle, *Add your face*, generates a character sheet, saves it as a permanent influencer, then *Create a post* / *Make a reel*.
- **⬆ Update Center** (sidebar → Update)
  - Real app self-update from GitHub Releases (electron-updater): check, download with progress, restart & install, optional pre-release channel, quiet check at startup, sidebar badge when an update is ready.
  - Model updates: compares each downloaded model's local revision with Hugging Face and re-syncs changed ones.
  - Live feed of the newest open-source releases from the major labs (Hugging Face Hub API), filterable by type, with "new since last visit" markers.
- **Resolution & advanced settings** in Create, every Studio tool and Film Studio projects: aspect ratios, image resolution tiers (SD → ~4 MP) or custom W×H (multiples of 8), video resolution (480p → 4K), duration and FPS, plus steps / CFG / seed / sampler.
- Local engine: seed support, ComfyUI-style sampler selection for SD/SDXL-type models, bf16 + CPU offload for large models, fallback loader for newer pipeline families (e.g. FLUX.2).
- Model installs now show the real download size first, warn about gated / very large models, track progress, can be cancelled and resume later; models can be deleted from storage.
- Hugging Face token support (Settings → API Keys → Hugging Face) for gated models.
- 20 new directory entries, all verified against the Hugging Face API on 2026-10-12 — including FLUX.2 [klein] 4B/9B, FLUX.2 [dev], Qwen-Image 2.1, LTX-2.3, HunyuanVideo 1.5, Wan 2.2 TI2V-5B / Animate-2, Qwen3.8 27B, DeepSeek V4.1 Flash, Gemma 4, GLM-5.3 Flash, Kimi K3, Llama 4 Scout/Maverick.
- Animated chrome 3D backdrops (pure CSS) for every section, replacing the photo backgrounds.
- `SET-GITHUB-USER.bat` helper.

### Fixed
- Renamed/moved Hugging Face repos: `runwayml/stable-diffusion-v1-5` → `stable-diffusion-v1-5/stable-diffusion-v1-5`, `CohereForAI/*` → `CohereLabs/*`, `THUDM/*` → `zai-org/*`.
- Kling / MiniMax video durations are now sent in the format those APIs expect.
- Links open in your normal browser instead of a new app window.
- Square app icons (Windows `.ico` with 16–256 px, 1024 px PNG for macOS).
- CI now uploads `latest.yml` and `.blockmap` files required for auto-update; `npm run build` no longer tries to publish on its own.

### Changed
- Installer is ~50 MB smaller (unused background photos removed from the bundle; originals kept in `assets-src/bg-photos`).

## 0.1.0
- First release.
