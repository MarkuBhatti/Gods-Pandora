# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

*(Applies once the project is accepted into the SignPath Foundation programme. Until then, Windows releases are unsigned.)*

## What gets signed

Only binaries built from this repository's source code by the GitHub Actions workflow [`.github/workflows/windows.yml`](.github/workflows/windows.yml):

- the Windows installer `Gods-Pandora-Setup-<version>.exe`
- the application executables it contains

Nothing built on a personal machine and nothing from third parties is signed with this certificate.

Every signing request is approved manually for each release.

## Team roles

| Role | Members |
|---|---|
| Committers and reviewers | [Haider Bhatti (@MarkuBhatti)](https://github.com/MarkuBhatti) |
| Approvers | [Haider Bhatti (@MarkuBhatti)](https://github.com/MarkuBhatti), repository owner |

- Changes proposed by anyone outside the team (pull requests) are reviewed by a committer before merging.
- All team members use multi-factor authentication on GitHub and SignPath.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

The full details are in [PRIVACY.md](PRIVACY.md):

- **Update checks:** the app checks GitHub Releases for new versions. No personal data is sent.
- **Model downloads:** models are downloaded from Hugging Face or Civitai only when you click Download.
- **Cloud models:** your prompts and media go only to the cloud AI provider you choose, using your own API key.

## Reporting

If you believe a file signed for this project violates this policy, please open an issue or email haiderbhattinerd@gmail.com.
