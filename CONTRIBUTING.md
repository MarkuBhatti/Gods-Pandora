# Contributing to God's Pandora

Thanks for helping build the open creative universe.

## Run it from source
```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/gods-pandora.git
cd gods-pandora
npm install
npm run dev          # Vite + Electron with hot reload
```
The optional local engine (Python 3.10+) installs from **Pandora Core & Cloud → Install engine**.

## Where things live
| Folder | What |
| --- | --- |
| `src/pages` | Every page / studio (React) |
| `src/lib` | Shared UI: PandoraBox (3D logo), MoodBackdrop + SceneProps (page scenes), ToolArt (tool card visuals), jobs, store |
| `data/studios.json` | Tools of every studio — add a tool here and it appears with its own card |
| `electron` | Main process: providers, model market, Pinokio, local engine manager, updater |
| `engine` | Python FastAPI engine (diffusers) for offline generation and LoRA training |

## Adding a tool
Add an entry to a studio in `data/studios.json` (`id`, `name`, `desc`, `kind`, `imageInputs`, `template`).
Its icon is picked automatically from its name/description (`src/lib/ToolArt.jsx` → `RULES`).

## Guidelines
- Keep keys on the user's machine; never send them anywhere but the provider.
- Respect model licenses; SFW-only defaults in the Model Market.
- Small, focused pull requests with a screenshot for UI changes.
