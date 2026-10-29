# Privacy policy: God's Pandora

God's Pandora is a desktop app that runs on your computer.

- **No telemetry:** it contains no analytics, tracking or telemetry. It also switches off Hugging Face library telemetry for the local engine.
- **No account:** you don't need to sign up for anything.

## What stays on your computer

- Your projects, gallery, characters, locations and settings.
- Your API keys, encrypted with your operating system's secure storage (Electron `safeStorage`).
- Everything you make with local, open-source models. These run entirely offline once downloaded.

## When the app connects to the internet, and only then

| When | Where | What is sent |
|---|---|---|
| You generate with a **cloud model** | The provider *you* picked (e.g. FAL, Replicate, OpenAI, Google, ElevenLabs, Stability, Higgsfield, Hugging Face) | Your prompt, any media you attach, and your own API key for that provider. That provider's privacy policy applies. |
| You click **Download** on a model or install the local engine | Hugging Face, Civitai, PyPI, GitHub, python.org (for the engine) | Standard download requests |
| **Update check** (at startup, and when you open the Update tab) | GitHub Releases for this repository | A standard request for the latest release information. No personal data. |
| You browse the **Model Market** or the **Newest releases** feed | Hugging Face, Civitai, OpenModelDB, Ollama, Pinokio listings | Your search text |
| You connect **Claude or another MCP app** | A local server on `127.0.0.1`, protected by a token | Nothing leaves your computer |
| **Phone Camera** | Your phone, over your local Wi-Fi only | Camera orientation data |

God's Pandora never sends your data anywhere else, and the developer receives nothing.

## Contact

haiderbhattinerd@gmail.com · https://github.com/MarkuBhatti/Gods-Pandora/issues
