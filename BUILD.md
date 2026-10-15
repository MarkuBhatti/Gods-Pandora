# God's Pandora — Build & Release Guide

## Quick start (dev mode)

```bash
cd "gods-eye"   (your project folder)
npm install
npm run dev
```

Opens the app at http://localhost:5173 with hot-reload.

---

## Building the Windows installer (.exe)

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | 18 + | https://nodejs.org |
| npm | ships with Node | - |
| Python | 3.10 + | only needed if using the local AI engine |
| Git | any | optional, for cloning |

### One-command release build

```bash
cd "gods-eye"   (your project folder)
npm install          # first time only
npm run release      # builds Vite UI → packages with electron-builder → outputs to release/
```

The finished installer lands at:

```
release/Gods-Pandora-Setup-0.2.0.exe
```

Double-click to install. Shortcut appears on Desktop + Start Menu.

---

## App icon (optional but recommended before selling)

electron-builder looks for icons in `build-assets/`.
Create that folder and drop in:

- `icon.ico` — Windows (256×256 multi-res ICO)
- `icon.icns` — macOS (only needed if building on Mac)
- `icon.png` — 512×512 PNG fallback

**Free tools to make an .ico:**
- https://www.icoconverter.com  (upload your Logo.jpg → export 256×256 ICO)
- Or in PowerShell: `magick logo.jpg -resize 256x256 icon.ico`  (requires ImageMagick)

Place the .ico at `build-assets/icon.ico` **before** running `npm run release`.
If no icon is found electron-builder uses Electron's default — the build still works.

---

## Versioning

Edit `"version"` in `package.json` before each release:

```json
"version": "1.0.0"
```

The installer filename and Add/Remove Programs entry update automatically.

---

## Installing on your own PC

1. Run `npm run release` (one time, on the same machine or any Windows PC with Node)
2. Copy `release/God's Pandora Setup x.x.x.exe` anywhere
3. Double-click → click Install → Done
4. Launch from Desktop shortcut or Start Menu → "God's Pandora"
5. Go to **Settings** and paste your API keys

---

## Distributing / selling

| Channel | Notes |
|---------|-------|
| **Direct download** | Host the `.exe` on your own site / Gumroad / Lemonsqueezy. Buyer downloads and installs. |
| **Windows Store (MSIX)** | Change `"target"` in package.json to `["appx"]`. Requires a Microsoft Dev account ($19 one-time). |
| **Auto-update** | Add `electron-updater` + an S3/GitHub Releases endpoint. Set `"publish"` in package.json to your update server. |

**No code-signing = SmartScreen warning** on first run.
To remove the warning, buy a code-signing certificate (Sectigo ~$200/yr) and configure it in package.json:

```json
"win": {
  "certificateFile": "cert.pfx",
  "certificatePassword": "YOUR_PASSWORD"
}
```

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Cannot find module 'electron'` | Run `npm install` first |
| `NSIS not found` | Re-run `npm install` — electron-builder downloads NSIS automatically |
| Build hangs on "downloading" | First build downloads Electron binaries (~80 MB). Wait or check proxy settings. |
| App opens blank white screen | Run `npm run dev` and check browser console for JS errors first |
| `engine:install` fails | Python 3.10+ must be on PATH. Run `python --version` to verify. |
