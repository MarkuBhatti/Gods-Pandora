# Publish God's Pandora to GitHub (step by step)

The project is already a git repository with a first commit. You only need to connect it to GitHub.

## 1 · Set your GitHub username (once)
Double-click **SET-GITHUB-USER.bat** and type your GitHub username. It fills it into `package.json`
(auto-updates) and the README badges/links.

## 2 · Create the empty repo on GitHub
github.com → **New repository** → name: `gods-pandora` → Public → **don't** add a README/licence → Create.

## 3 · Push (pick one)
**GitHub Desktop (easiest):** File → Add local repository → choose this folder → **Publish repository**
(untick "Keep this code private" for open source).

**Command line:**
```bash
git add -A
git commit -m "Set GitHub username"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/gods-pandora.git
git branch -M main
git push -u origin main
```

## 4 · Make the first release (builds Windows + macOS installers automatically)
```bash
git tag v0.6.0
git push origin v0.6.0
```
GitHub Actions (`.github/workflows/build.yml`) builds `Gods-Pandora-Setup-0.6.0.exe` and the macOS `.dmg`
files and publishes them as a release. Paste `RELEASE_NOTES_v0.6.0.md` into the release description.

Prefer to upload your own installer? GitHub → Releases → **Draft a new release** → tag `v0.6.0` →
drag in `release\Gods-Pandora-Setup-0.6.0.exe`, `latest.yml` and the `.blockmap` (the last two let the
in-app updater find new versions).

## 5 · Polish the repo page
- **About** (gear icon): description *"Every model. Every medium. One creative universe. Free AI creative studio — cloud APIs + open-source models."*
- **Topics:** `ai` `generative-ai` `stable-diffusion` `flux` `comfyui` `ollama` `electron` `ai-video` `ai-art` `text-to-speech` `open-source` `desktop-app`
- **Social preview:** Settings → Social preview → upload `marketing-kit/linkedin-feed_1200x627/01-hero.png`.

## Never commit
`signing.env.bat`, `*.pfx`, API keys — they are already in `.gitignore`.
