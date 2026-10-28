<p align="center"><img src="https://peach.video/assets/peach-logo-192.webp" alt="Peach" width="88"></p>

# Peach Userscript

Send video codes from supported pages to your self-hosted Peach instance.

[Peach](https://github.com/peach-mitao/peach) · [Site rules](https://github.com/peach-mitao/peach-userscript/blob/main/docs/SITES.md) · [Report a problem](https://github.com/peach-mitao/peach-userscript/issues)

## Features

- **Recognize and add**: detect codes on supported detail pages, or scan the current page and add selected titles or all titles.
- **Track status**: check your library, see performers, and follow queue, search, download and import progress as it refreshes. Peach continues after the source page closes.
- **Recover from failures**: see whether the magnet or the cloud drive failed, and switch to another magnet when the magnet is at fault.
- **Keep the page tidy**: move the Peach icon, choose where it appears, or hide it completely. Open settings and check updates from the userscript menu.
- **Match Peach**: sync light or dark mode and the accent color with your paired Peach instance.

## Setup

1. Install [Tampermonkey](https://www.tampermonkey.net/) and use **Install this script** above. In Chrome, Edge and other Chromium browsers, turn on **Allow User Scripts** or developer mode in Tampermonkey's extension details; see the [Tampermonkey permission guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q209).
2. Configure a download channel, target folder and mount path in Peach.
3. Enable browser integration in Peach's download settings and generate a dedicated token.
4. Enter your Peach address and token in the script settings, then allow the connection.

The browser must trust Peach's HTTPS certificate; HTTP is supported only on loopback addresses. Supported sites include FANZA / DMM, MGS, JavDB, JavBus and MissAV. Page candidates are validated by Peach before submission.

## Updates

**Check for updates** compares the Sleazy release with the script bundled in your paired Peach instance and opens the newer source. Sleazy is preferred when versions match. Updates are installed through your userscript manager; open pages may need a refresh.

Page-wide submission and local performer data require the corresponding Peach interfaces. An older packaged Peach build may need an update; installing the script does not upgrade Peach itself. See the [bilingual version history](https://github.com/peach-mitao/peach-userscript/blob/main/CHANGELOG.md), starting with **0.3.0 — Initial release**, for changes and compatibility notes.

## Privacy

The dedicated token stays in userscript-manager storage. The script submits the code and a filtered source URL, not source-site cookies, player URLs or page contents. Peach manages cloud-drive credentials. Update requests to Sleazy do not carry your Peach token or browsing-page identity.

## License

[AGPL-3.0-or-later](https://github.com/peach-mitao/peach-userscript/blob/main/LICENSE). See [NOTICE](https://github.com/peach-mitao/peach-userscript/blob/main/NOTICE.md) for origins and dependencies.
