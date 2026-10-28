<p align="center"><img src="https://peach.video/assets/peach-logo-192.webp" alt="Peach" width="88"></p>

# Peach Userscript

Send video codes from supported pages to your self-hosted Peach instance.

[Install script](https://raw.githubusercontent.com/peach-mitao/peach-userscript/main/dist/peach-jav.user.js) · [Peach](https://github.com/peach-mitao/peach) · [Site rules](docs/SITES.md) · [简体中文](README.zh-CN.md)

[![CI](https://img.shields.io/github/actions/workflow/status/peach-mitao/peach-userscript/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white)](https://github.com/peach-mitao/peach-userscript/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue?logo=gnu&logoColor=white)](LICENSE)

## Features

- **Recognize and add**: detect a code on supported detail pages, or scan a page and add selected titles or all titles.
- **Track status**: check whether a title is already in your library, see performers, and follow search, download and import progress as it refreshes.
- **Recover from failures**: see whether the magnet or the cloud drive failed, and switch to another magnet when the magnet is at fault.
- **Continue in Peach**: Peach saves the task and handles cloud download and library import after the source page closes.
- **Match Peach**: sync the theme and accent, move the launcher and choose where it appears; settings and update checks remain available from the script menu.

## Setup

1. Install [Tampermonkey](https://www.tampermonkey.net/) and the [userscript](https://raw.githubusercontent.com/peach-mitao/peach-userscript/main/dist/peach-jav.user.js). In Chrome, Edge and other Chromium browsers, turn on **Allow User Scripts** or developer mode in Tampermonkey's extension details; see the [Tampermonkey permission guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q209).
2. Configure a download channel, target folder and mount path in Peach.
3. Enable browser integration in Peach's download settings and generate a dedicated token.
4. Enter your Peach address and token in the script menu, then allow the connection.

The browser must trust Peach's HTTPS certificate; HTTP is supported only on loopback addresses. Supported sites are maintained in [site rules](docs/SITES.md); registration does not establish live-site or end-to-end verification.

## Privacy

The dedicated token stays in userscript-manager storage. The script submits the code and a filtered source URL, not source-site cookies, player URLs or page contents. Peach manages cloud-drive credentials.

## Development

[Build and release](docs/DEVELOPMENT.md) · [API protocol](docs/PROTOCOL.md) · [Reuse](docs/REUSE.md) · [Report a problem](https://github.com/peach-mitao/peach-userscript/issues)

## License

[AGPL-3.0-or-later](LICENSE). See [NOTICE](NOTICE.md) for origins and dependencies.
