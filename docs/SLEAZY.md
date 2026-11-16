<p align="center"><img src="https://peach.video/assets/peach-logo-192.webp" alt="Peach" width="88"></p>

# Peach Userscript

Send video codes from supported pages to your self-hosted Peach instance.

[Peach](https://github.com/peach-mitao/peach) · [Site rules](https://github.com/peach-mitao/peach-userscript/blob/main/docs/SITES.md) · [Report a problem](https://github.com/peach-mitao/peach-userscript/issues)

## Features

- **Recognize and add**: detect codes on supported detail pages, or scan the current page and add selected titles or all titles.
- **Track status**: check your library, see performers, and follow queue, search, download, import and organization status. Peach continues after the source page closes.
- **Recover from failures**: follow Peach's automatic retries for temporary errors, retry failed organization, or switch to another magnet when needed.
- **Keep the page tidy**: remember the icon's position across windows, choose where it appears, or hide it completely. Open settings and check updates from the script menu.
- **Match Peach**: sync light or dark mode and the accent color with your paired Peach instance.

## Setup

1. Install [Tampermonkey](https://www.tampermonkey.net/) and use **Install this script** above. In Chrome, Edge and other Chromium browsers, turn on **Allow User Scripts** or developer mode in Tampermonkey's extension details; see the [Tampermonkey permission guide](https://www.tampermonkey.net/faq.php?locale=en&q=Q209).
2. Configure a download channel, target folder and mount path in Peach.
3. Enable browser integration in Peach's download settings and generate a dedicated token.
4. Enter your Peach address and token in the script settings, then allow the connection.

The browser must trust Peach's HTTPS certificate; HTTP is supported only on loopback addresses. Supported sites include FANZA / DMM, MGS, JavDB, JavBus and MissAV. Page candidates are validated by Peach before submission.

## Updates

**Check for updates** compares the Sleazy release with the script bundled in your paired Peach instance and opens the newer source. Sleazy is preferred when versions match. Updates are installed through your userscript manager; open pages may need a refresh.

Automatic retries, page-wide submission and local performer data require the corresponding Peach interfaces. An older packaged Peach build may need an update; installing the script does not upgrade Peach itself. See the [bilingual version history](https://github.com/peach-mitao/peach-userscript/blob/main/CHANGELOG.md), starting with **0.3.0 — Initial release**, for changes and compatibility notes.

## Privacy

The dedicated token stays in userscript-manager storage. The script submits the code and a filtered source URL, not source-site cookies, player URLs or page contents. Peach manages cloud-drive credentials. Update requests to Sleazy do not carry your Peach token or browsing-page identity.

## License

[AGPL-3.0-or-later](https://github.com/peach-mitao/peach-userscript/blob/main/LICENSE). See [NOTICE](https://github.com/peach-mitao/peach-userscript/blob/main/NOTICE.md) for origins and dependencies.

<!-- generated:version-history -->

## Version history

### 0.7.19 — 2026-11-16

#### Fixed

- **Floating panels** keep their position and appearance on pages with sidebar styles, and keep their controls separate from page event handlers.

### 0.7.18 — 2026-11-16

#### Changed

- **Automatic retries** for searches show Peach's own reason, naming the source that is down, and say the time as "tonight 21:39" or "tomorrow 09:00".

### 0.7.17 — 2026-11-15

#### Added

- **Settings** add Browsing history: when checked, work and performer pages you open are noted in your Peach for recommendations.

### 0.7.16 — 2026-11-15

#### Changed

- **Panels** keep one main button per row, put other actions with icons two to a row, and make Scan page codes an icon key; Check status only shows when needed.

### 0.7.15 — 2026-11-15

#### Changed

- **Panels** show update and paused-channel notices at the top, then status, then Other tasks, with every button at the bottom.

### 0.7.14 — 2026-11-14

#### Fixed

- **Video pages** recognize TMA codes whose label includes digits, such as T28-612 and T38-076 on JAVtiful, with newer Peach.

### 0.7.13 — 2026-11-14

#### Fixed

- **Video pages** no longer report a false code conflict for a word plus number later in the title, such as File05, or uncensored date codes on MissAV and Jable.
- **Panels** scroll long codes, actress names and Other tasks counts back and forth on one line, and stack at most three avatars, fewer when space is tight.
- **Other tasks** rows no longer have the left edge of their hover highlight cut off.

### 0.7.12 — 2026-11-14

#### Added

- **Add to wants** appears on the title panel and on no-match task progress for titles not yet in the library, with newer Peach.
- **Panel titles** copy the video code when you click them or press Enter, briefly showing Copied.

#### Changed

- **Panels** keep every button at the bottom below Other tasks, and a subscribed actress shows a pressed Subscribed button that offers Unsubscribe on hover.
- **Buttons** highlight the main action on task progress, such as Retry, and Settings hide Check for updates while an update is shown.

### 0.7.11 — 2026-11-14

#### Added

- **Page codes** list sorts by code when you click the code column header, cycling A–Z, Z–A and back to page order, and remembers your choice.
- **Task progress** for an imported title shows Open in library, which opens it in Peach and marks the task as read.

#### Changed

- **Task progress** shows its only button, such as Prioritize, as the primary button.

#### Fixed

- **Script updates** no longer show the update and download addresses as changed each time; one last change appears when updating to this version.

### 0.7.10 — 2026-11-13

#### Changed

- **Open JAV pages** no longer poll Peach while no task is in progress or the tab is in the background, and retry less often while Peach is unreachable.

### 0.7.9 — 2026-11-13

Includes the changes recorded below for source-only versions 0.7.6–0.7.8.

#### Changed

- **Other tasks** lists every task with failures first, with notices above it when Peach is unreachable, the token stops working or adds are paused.
- **Update reminders** for the script and Peach now appear as blue notices with the install button inside.

#### Fixed

- **Retry failed** retries every failed task instead of only the first 20.

### 0.7.8 — 2026-11-09

Source only; release assets are not published yet.

#### Added

- **Queued tasks** can be moved to the front of the search queue from their progress page or the panel, which also shows how many are ahead.

#### Changed

- **Other tasks** count failures separately from completed ones, and the heading and collapsed icon badge turn red while any task has failed.

### 0.7.7 — 2026-11-09

Source only; release assets are not published yet.

#### Added

- **DMM titles with a bonus edition** show two add buttons, the edition of the current page first, so you choose which one Peach downloads.

### 0.7.6 — 2026-11-09

Source only; release assets are not published yet.

#### Added

- **FANZA clip pages** (`clip.fanza.jp/moment`) recognize the title code from the address, for example SABA-978.

#### Fixed

- **DMM and MGS pages** identify titles from the address alone, so other codes on the page no longer block the button as a conflict.

### 0.7.5 — 2026-11-06

Includes the changes recorded below for source-only versions 0.7.2–0.7.4.

#### Fixed

- **Temporary failures** show the next automatic retry and attempt count; exhausted retries keep their failure status and manual recovery.
- **Task lists** show a red **Organization failed** status when post-import processing fails, instead of showing the title as successfully imported.
- **Panel positions** keep the same distance from the bottom-right corner across different window sizes, including when collapsed to an icon.
- **Progress pages** stay separate from the task list when the panel refreshes or you switch back and forth.

### 0.7.4 — 2026-11-05

Source only; release assets are not published yet.

#### Fixed

- **Other tasks** scroll with Peach's overlay scrollbar instead of the browser's native one.

### 0.7.3 — 2026-11-05

Source only; release assets are not published yet.

#### Added

- **Performer pages** on JavDB, DMM and MISSAV let you subscribe to her new releases from the Peach panel.
- **Open in Peach**: when Peach already has the title, the panel's main button opens its page in Peach.

#### Changed

- **Top-right buttons** for settings, fold and hide now also appear on list and performer pages and on progress pages.

#### Fixed

- **Title pages** on FC2 Contents Market and DMM amateur titles are recognized right away, without selecting the code first.

### 0.7.2 — 2026-11-04

Source only; release assets are not published yet.

#### Added

- **Other tasks** keep finished titles until you mark them as read, and the minimized icon counts the unread ones.
- **Retry failed tasks** from the bottom of 其他任务 or from a failed title's progress page.

#### Changed

- **Resubmitting**: titles whose cloud download Peach is resubmitting by itself show 等待自动重新提交.
- **Other tasks** fold, unfold and open progress pages with Peach's transitions.

### 0.7.1 — 2026-11-04

#### Added

- **Retry organizing** from the panel or another title's progress page when organizing fails after import.

### 0.7.0 — 2026-11-04

Not published separately; included in 0.7.1.

#### Added

- **Shared progress**: open pages show the same task progress, tracking no longer stops after an hour, and the success chime plays once.
- **Other tasks** on the panel list other titles, each with its own progress page, and the minimized icon counts running ones.

### 0.6.12 — 2026-11-04

Not published separately; included in 0.7.1.

#### Changed

- **Panel** can be dragged by any empty area, not only as the minimized icon.

### 0.6.11 — 2026-11-03

Not published separately; included in 0.7.1.

#### Fixed

- **Page list** no longer reads reviewer names such as `qwert-02さん` as codes, and padded codes match local performer data.
- **Switching** to Settings or the page list no longer flashes.
- **Sound**: the success chime waits until organizing has finished.

### 0.6.10 — 2026-11-01

Not published separately; included in 0.7.1.

#### Fixed

- **MGS** SOD pages such as `107STZY-019` show owned titles as owned and search magnets without the store prefix.

### 0.6.9 — 2026-10-30

Not published separately; included in 0.7.1.

#### Changed

- **Updates** offer a page refresh after opening the installer and show 已更新 only once the newer version is installed.

### 0.6.8 — 2026-10-30

Not published separately; included in 0.7.1.

#### Fixed

- **Page list** no longer counts owned titles or running tasks as pending or toward **Add all**.

### 0.6.7 — 2026-10-28

#### Changed

- **Launcher** on pages without a single title, such as the JavDB home page, opens a small panel instead of the page list.
- **Card** drops the “可以加入 Peach 馆藏” line, since the button already says it.
- **Settings** and the page list scroll with the same overlay scrollbar as the table.

#### Fixed

- **Settings** no longer leave a blank strip below the footer on pages rendered in quirks mode, such as FANZA.
- **Page list** avatars no longer scroll over the sticky header.

### 0.6.6 — 2026-10-28

#### Changed

- **Update** opens the Sleazy install file directly, so the userscript manager shows the update prompt.
- **Settings** keep only the hints needed to pair and to turn the icon back on.

#### Fixed

- **Magnet switching** searches every source instead of stopping at the first high-definition result.
- **Performer avatars** are framed on the face, like Peach's own.

### 0.6.5 — 2026-10-28

#### Added

- **Statuses** refresh automatically for up to an hour after submission, with download progress in the page list.
- **Failures** say whether the magnet or the cloud drive is at fault, and a failed magnet can be switched for the next one.
- **Performer avatars** appear on the card title, including for titles outside the library.
- **Sounds**: adding plays Peach's start tone and each finished import plays its success chime; both can be turned off.

#### Fixed

- **Page scans** accept only codes written with a separator, so names like `jay925` or `hhd800.com` are no longer listed.
- **Page list** keeps its header fixed and scrolls inside the table when long.
- **Row statuses** use short chips in Peach's status colors, with the full message on hover.

### 0.6.4 — 2026-10-28

#### Fixed

- **Author and icon** are declared, so userscript managers and Sleazy no longer show a blank author and the default icon.
- **Setup** links the Tampermonkey permission guide for Chromium browsers.

### 0.6.3 — 2026-10-28

#### Changed

- **Script name** defaults to English, and Sleazy shows the name in each page's language.
- **Sleazy** syncs the script from the latest GitHub Release.

### 0.6.2 — 2026-10-28

#### Fixed

- **Sleazy** accepts the release now that every localized name has a description.

### 0.6.1 — 2026-10-28

Published on GitHub; not published on Sleazy because a localized description was missing. The corrected Sleazy release is 0.6.2.

#### Fixed

- **Check for updates** compares Sleazy with Peach's bundled script and offers the newer one.
- **Scripts installed from Peach** also update automatically from Sleazy.
- **DMM** pages use the code Peach resolves, even before the first detail query finishes.
- **Page scans** skip device names such as PS4 and PS5.

#### Changed

- **Name**: the script is called Peach Userscript everywhere, and existing installs keep updating.
- **Descriptions** are published separately in English and Chinese, with a bilingual version history.

### 0.6.0 — Source-only version

Not published separately on Sleazy; included in 0.6.1.

Release backfilled on 2026-10-27 from the original commit; assets were not rebuilt or retested.

#### Added

- **Page scans**: select codes across the page, select all and submit them in a batch.
- **Launcher** follows Peach's theme and accent, remembers where you drag it, and can show always, only on JAV sites or never.

#### Changed

- **Settings**, table selection, avatars and stage animations match Peach.

### 0.5.2 — Source-only version

Bundled with Peach 0.50.0; not published separately on Sleazy.

Release backfilled on 2026-10-27 from the original commit; assets were not rebuilt or retested.

#### Added

- **Update checks** look at Sleazy and Peach releases separately, run daily and prompt a refresh after installing.
- **Announcements** for task status and updates are kept apart.

### 0.5.1 — 2026-10-25

Release backfilled on 2026-10-27 from the original commit; assets were not rebuilt or retested.

#### Added

- **Progress** shows the queue, search, download, import and organizing stages, with download progress when available.
- **Views**: the panel can be compact, collapsed or minimized.
- **Error reports** are restricted and go only to your own Peach.

### 0.5.0 — 2026-10-25

Release backfilled on 2026-10-27 from the original commit; assets were not rebuilt or retested.

#### Changed

- **Code recognition** checks DMM and FANZA maker codes against product URLs, keeps MGS prefixes and suffixes, and adds Kirari and date codes.
- **Errors** tell service failures, unsupported interfaces, rate limits and invalid identities apart.

### 0.4.0 — 2026-10-20

Release backfilled on 2026-10-27 from the original commit; assets were not rebuilt or retested.

#### Added

- **Settings** and library controls match Peach, and pairing accepts pasted details and detects the installation.
- **DMM and MGS** products are identified through Peach, and reviewed mirror domains are added.

### 0.3.0 — 2026-10-18 — Initial release

#### Added

- **Video codes** on the page or in a selection are detected, checked against the library and handed to Peach to download.
- **Site rules** ship as a manifest with a reproducible build and Peach export files.
