# Code signing God's Pandora (removing "Windows protected your PC")

The build is already wired for signing (`build-assets/sign.js`). The moment a certificate is
configured, `BUILD.bat` signs `God's Pandora.exe`, the installer and the uninstaller automatically.

## The honest truth about the warning

The blue **"Windows protected your PC"** screen is Microsoft SmartScreen. Two things make it go away:

1. **A code-signing certificate** issued to you by a trusted authority (proves who published the app).
2. **Reputation** — SmartScreen keeps warning on a new certificate until enough people have downloaded
   and run the signed app without problems. This usually takes from a few days to a few weeks of downloads.
   Since 2024, even expensive EV certificates no longer skip this step.

There is no setting, code change or free trick that removes the warning without a real certificate.
A self-signed certificate does **not** help (Windows treats it as unknown).

## Which certificate to get

| Option | Who can get it | Cost (check current price) | Notes |
| --- | --- | --- | --- |
| **Certum Open Source Code Signing** (recommended) | Individuals worldwide, for open-source projects | about $50–$70 / year | Cloud certificate via **SimplySign** app — works with Option A below. Identity check with your ID. https://shop.certum.eu/code-signing.html |
| Certum Standard Code Signing | Individuals or companies worldwide | about $90–$120 / year | Use if the app gets closed-source paid parts. |
| **SignPath Foundation** | Free for OSI-licensed projects with **no** proprietary parts, built by GitHub Actions | Free | SignPath becomes the listed publisher. Not allowed once you add a closed "Pro" module. https://signpath.org |
| Azure Artifact Signing | Individuals in USA/Canada; companies in USA, Canada, EU, UK | $9.99 / month | Not available to individuals in Pakistan right now. |

## Step by step (Certum + SimplySign, Option A)

1. Buy the certificate at the Certum shop and complete the identity check (passport / CNIC + a selfie video).
2. Install **SimplySign Desktop** and the mobile **SimplySign** app; log in so the certificate shows in
   Windows (`certmgr.msc` → Personal → Certificates).
3. Install **Windows SDK → Signing Tools for Desktop Apps** (gives `signtool.exe`).
4. In the project folder, copy `signing.env.example.bat` to `signing.env.bat` and set:

   ```bat
   set WIN_CERT_SUBJECT=Your Name As On The Certificate
   ```

5. Double-click `BUILD.bat`. The log shows `code signing  God's Pandora.exe via store`.
6. Check: right-click the installer → Properties → **Digital Signatures** shows your name.

## Speeding up SmartScreen reputation

- Always sign with the **same** certificate; every new certificate starts from zero.
- Publish downloads from one stable place (GitHub Releases).
- Submit each new installer to Microsoft for analysis: https://www.microsoft.com/wdsi/filesubmission
  (choose "Software developer", "incorrectly detected / SmartScreen").
- Ask early users to choose **More info → Run anyway**; each clean run builds reputation.

## macOS

macOS needs an **Apple Developer ID** ($99/year) for signing and notarization; until then users run
`xattr -cr "/Applications/God's Pandora.app"` once (see README).
