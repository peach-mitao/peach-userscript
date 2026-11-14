# Changelog / 更新日志

Notable changes are grouped by version. English and Chinese describe the same behavior. Each version merged to `main` is published as a GitHub Release automatically; older source-only versions are marked. / 按版本记录面向使用者的变化；中英文保持事实一致。合入 `main` 的每个版本都会自动发布 GitHub Release；早先未单独发布的源码版本已标注。

Entries are written for users to scan: one sentence each, saying where something changed and what you now see. Reasons, implementation, compatibility conditions and edge cases stay in commits and PRs. Changes to one feature become one entry, and within each group the bigger changes come first. The English part before ` / ` stays within 160 characters including spaces, and the Chinese part after it within 80 characters including punctuation; bold and code marks and link addresses are not counted, only the text they display. / 条目给使用者扫读：每条一句话，只写在哪儿看到了什么变化；原因、实现、兼容条件和边界情况留在提交与 PR。同一功能的几处改动合成一条，每组里影响大的排前面。` / ` 之前的英文部分不超过 160 个字符（含空格），之后的中文部分不超过 80 字（含标点）；加粗、代码标记和链接地址不计，只计显示出来的文字。

## 0.7.13 — 2026-11-14

### Fixed / 修复

- **Video pages** no longer report a false code conflict for a word plus number later in the title, such as File05, or uncensored date codes on MissAV and Jable. / 详情页标题后段的单词加数字（如 File05）及 MISSAV、Jable 的无码日期番号不再误报「番号存在冲突」。
- **Panels** scroll long codes, actress names and Other tasks counts back and forth on one line, and stack at most three avatars, fewer when space is tight. / 浮卡里放不下的番号、女优名与「其他任务」计数改为在行内自动来回滚动；头像最多叠三枚，空间窄时更少。
- **Other tasks** rows no longer have the left edge of their hover highlight cut off. / 「其他任务」列表行的悬停底色左侧不再被切掉。

## 0.7.12 — 2026-11-14

### Added / 新增

- **Add to wants** appears on the title panel and on no-match task progress for titles not yet in the library, with newer Peach. / 未入库的作品在浮卡与没找到资源的进度页可「加入想要」，需要新版 Peach。
- **Panel titles** copy the video code when you click them or press Enter, briefly showing Copied. / 浮卡与进度页标题的番号点一下或按 Enter 即复制，并短暂显示「已复制」。

### Changed / 变更

- **Panels** keep every button at the bottom below Other tasks, and a subscribed actress shows a pressed Subscribed button that offers Unsubscribe on hover. / 浮卡按钮统一排在「其他任务」下方；已订阅的女优显示按下态的「已订阅新作」，悬停可取消。
- **Buttons** highlight the main action on task progress, such as Retry, and Settings hide Check for updates while an update is shown. / 进度页把重试等主要动作设为主按钮；设置页已提示可更新时不再显示「检查更新」。

## 0.7.11 — 2026-11-14

### Added / 新增

- **Page codes** list sorts by code when you click the code column header, cycling A–Z, Z–A and back to page order, and remembers your choice. / 本页番号列表点「番号」表头可按字母升序、倒序排列，再点回到页面顺序，并记住选择。
- **Task progress** for an imported title shows Open in library, which opens it in Peach and marks the task as read. / 已入库番号的进度页显示「打开馆藏」，在 Peach 中打开这部作品并标为已读。

### Changed / 变更

- **Task progress** shows its only button, such as Prioritize, as the primary button. / 进度页只有一个按钮时（如「提前处理」）显示为主按钮。

### Fixed / 修复

- **Script updates** no longer show the update and download addresses as changed each time; one last change appears when updating to this version. / 脚本更新时不再每次提示更新与下载地址被更换；更新到本版时还会最后提示一次。

## 0.7.10 — 2026-11-13

### Changed / 变更

- **Open JAV pages** no longer poll Peach while no task is in progress or the tab is in the background, and retry less often while Peach is unreachable. / 没有进行中的任务或页面在后台时，打开的 JAV 页面不再定时向 Peach 查询进度；连不上时逐步放慢重试。

## 0.7.9 — 2026-11-13

Includes the changes recorded below for source-only versions 0.7.6–0.7.8. / 包含下方仅源码版本 0.7.6–0.7.8 中记录的变更。

### Changed / 变更

- **Other tasks** lists every task with failures first, with notices above it when Peach is unreachable, the token stops working or adds are paused. / 其他任务全部列出且失败项排最前；连不上 Peach、令牌失效或添加暂停时上方显示提示框。
- **Update reminders** for the script and Peach now appear as blue notices with the install button inside. / 脚本与 Peach 的更新提醒改为蓝色提示框，安装按钮在框内。

### Fixed / 修复

- **Retry failed** retries every failed task instead of only the first 20. / 「重试失败项」会重试全部失败项，不再只处理前 20 个。

## 0.7.8 — 2026-11-09

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Added / 新增

- **Queued tasks** can be moved to the front of the search queue from their progress page or the panel, which also shows how many are ahead. / 排队中的任务可在进度页或浮卡上「提前处理」，并显示前面还有几项。

### Changed / 变更

- **Other tasks** count failures separately from completed ones, and the heading and collapsed icon badge turn red while any task has failed. / 其他任务把失败与已完成分开计数，有失败项时标题和收起图标的角标变红。

## 0.7.7 — 2026-11-09

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Added / 新增

- **DMM titles with a bonus edition** show two add buttons, the edition of the current page first, so you choose which one Peach downloads. / DMM 作品有特典版时浮卡显示两个添加按钮，本页的版本在前，可选下载哪一版。

## 0.7.6 — 2026-11-09

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Added / 新增

- **FANZA clip pages** (`clip.fanza.jp/moment`) recognize the title code from the address, for example SABA-978. / FANZA 剪辑页按地址识别番号，例如 SABA-978。

### Fixed / 修复

- **DMM and MGS pages** identify titles from the address alone, so other codes on the page no longer block the button as a conflict. / DMM、MGS 作品页只按地址识别番号，页面里的其他番号不再让按钮判成冲突。

## 0.7.5 — 2026-11-06

Includes the changes recorded below for source-only versions 0.7.2–0.7.4. / 包含下方仅源码版本 0.7.2–0.7.4 中记录的变更。

### Fixed / 修复

- **Temporary failures** show the next automatic retry and attempt count; exhausted retries keep their failure status and manual recovery. / 暂时故障显示自动重试时间与次数，次数用尽后保留失败状态和手动重试入口。
- **Task lists** show a red **Organization failed** status when post-import processing fails, instead of showing the title as successfully imported. / 入库后整理失败时，任务列表直接显示红色「整理失败」。
- **Panel positions** keep the same distance from the bottom-right corner across different window sizes, including when collapsed to an icon. / 浮窗与收起图标跨窗口记住距右下角的位置，不再随窗口大小漂移。
- **Progress pages** stay separate from the task list when the panel refreshes or you switch back and forth. / 任务进度页刷新或来回切换时，不再和主页任务列表叠在一起。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.7.1...v0.7.5)

## 0.7.4 — 2026-11-05

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Fixed / 修复

- **Other tasks** scroll with Peach's overlay scrollbar instead of the browser's native one. / 「其他任务」列表改用 Peach 的悬浮滚动条，不再露出浏览器原生滚动条。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/c7caa61...main)

## 0.7.3 — 2026-11-05

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Added / 新增

- **Performer pages** on JavDB, DMM and MISSAV let you subscribe to her new releases from the Peach panel. / JavDB、DMM、MISSAV 的女优页可以在 Peach 面板里订阅她的新作。
- **Open in Peach**: when Peach already has the title, the panel's main button opens its page in Peach. / Peach 已有这部作品时，浮卡主按钮变成「在 Peach 中打开」，直达作品详情页。

### Changed / 变更

- **Top-right buttons** for settings, fold and hide now also appear on list and performer pages and on progress pages. / 列表页、女优页的 Peach 面板与番号进度页的右上角也有设置、折叠、隐藏。

### Fixed / 修复

- **Title pages** on FC2 Contents Market and DMM amateur titles are recognized right away, without selecting the code first. / FC2 内容市场与 DMM 素人的作品页直接识别番号，不必先选中或识别本页。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/8a79b31...main)

## 0.7.2 — 2026-11-04

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Added / 新增

- **Other tasks** keep finished titles until you mark them as read, and the minimized icon counts the unread ones. / 「其他任务」里已结束的番号一直保留到标为已读，收成图标时角标显示未读数量。
- **Retry failed tasks** from the bottom of 其他任务 or from a failed title's progress page. / 「其他任务」列表底部和失败番号的进度页都能重试失败的任务。

### Changed / 变更

- **Resubmitting**: titles whose cloud download Peach is resubmitting by itself show 等待自动重新提交. / Peach 正在自动重新提交云下载的番号显示「等待自动重新提交」。
- **Other tasks** fold, unfold and open progress pages with Peach's transitions. / 「其他任务」展开、折叠和进出进度页时沿用 Peach 的过渡动效。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.7.1...main)

## 0.7.1 — 2026-11-04

### Added / 新增

- **Retry organizing** from the panel or another title's progress page when organizing fails after import. / 入库后整理失败时，浮卡和其他任务的进度页都能直接「重试整理」。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/26ae5b9...v0.7.1)

## 0.7.0 — 2026-11-04

Not published separately; included in 0.7.1. / 未单独发布，随 0.7.1 提供。

### Added / 新增

- **Shared progress**: open pages show the same task progress, tracking no longer stops after an hour, and the success chime plays once. / 多个窗口共享同一份任务进度，跟踪不再一小时后停止，成功提示音只响一次。
- **Other tasks** on the panel list other titles, each with its own progress page, and the minimized icon counts running ones. / 浮卡的「其他任务」列出别的番号，点开看各自的进度页；收成图标时角标显示进行中的数量。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/e7b9813...26ae5b9)

## 0.6.12 — 2026-11-04

Not published separately; included in 0.7.1. / 未单独发布，随 0.7.1 提供。

### Changed / 变更

- **Panel** can be dragged by any empty area, not only as the minimized icon. / 浮卡按住任意空白处都能拖动，不再只有收成图标时能拖。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/1363343...e7b9813)

## 0.6.11 — 2026-11-03

Not published separately; included in 0.7.1. / 未单独发布，随 0.7.1 提供。

### Fixed / 修复

- **Page list** no longer reads reviewer names such as `qwert-02さん` as codes, and padded codes match local performer data. / 本页番号不再把 `qwert-02さん` 这类评论署名当成番号，补零后的番号也能对上本地人物资料。
- **Switching** to Settings or the page list no longer flashes. / 切换到设置或本页番号时不再闪一下。
- **Sound**: the success chime waits until organizing has finished. / 成功提示音等整理完成后才响。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/b47e32f...1363343)

## 0.6.10 — 2026-11-01

Not published separately; included in 0.7.1. / 未单独发布，随 0.7.1 提供。

### Fixed / 修复

- **MGS** SOD pages such as `107STZY-019` show owned titles as owned and search magnets without the store prefix. / MGS 的 SOD 商品页（如 `107STZY-019`）正确显示「已有」，磁力搜索改用不带店铺前缀的番号。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/57f2ecc...576adc7)

## 0.6.9 — 2026-10-30

Not published separately; included in 0.7.1. / 未单独发布，随 0.7.1 提供。

### Changed / 变更

- **Updates** offer a page refresh after opening the installer and show 已更新 only once the newer version is installed. / 打开更新安装入口后提供「刷新本页」，确认装上新版本才显示「已更新」。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/280c4e6...57f2ecc)

## 0.6.8 — 2026-10-30

Not published separately; included in 0.7.1. / 未单独发布，随 0.7.1 提供。

### Fixed / 修复

- **Page list** no longer counts owned titles or running tasks as pending or toward **Add all**. / 「本页番号」不再把已有影片和进行中任务算作「待加入」或计入「全部加入」。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.7...280c4e6)

## 0.6.7 — 2026-10-28

### Changed / 变更

- **Launcher** on pages without a single title, such as the JavDB home page, opens a small panel instead of the page list. / 没有单部作品的页面（如 JavDB 首页）点图标先展开入口面板，不再直接进入本页番号。
- **Card** drops the “可以加入 Peach 馆藏” line, since the button already says it. / 浮卡去掉「可以加入 Peach 馆藏」这行，按钮本身已说明。
- **Settings** and the page list scroll with the same overlay scrollbar as the table. / 设置页与本页番号的弹窗主体改用与表格相同的覆盖滚动条。

### Fixed / 修复

- **Settings** no longer leave a blank strip below the footer on pages rendered in quirks mode, such as FANZA. / FANZA 等按怪异模式渲染的页面上，设置页底栏下方不再多出一截空白。
- **Page list** avatars no longer scroll over the sticky header. / 本页番号滚动时，头像不再盖住吸顶表头。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.6...v0.6.7)

## 0.6.6 — 2026-10-28

### Changed / 变更

- **Update** opens the Sleazy install file directly, so the userscript manager shows the update prompt. / 「更新用户脚本」直接打开 Sleazy 安装文件，脚本管理器随即弹出更新确认。
- **Settings** keep only the hints needed to pair and to turn the icon back on. / 设置页只保留配对和恢复图标所需的提示。

### Fixed / 修复

- **Magnet switching** searches every source instead of stopping at the first high-definition result. / 换磁力时查完所有来源，不再停在第一条高清结果。
- **Performer avatars** are framed on the face, like Peach's own. / 人物头像按人脸取景，与 Peach 一致。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.5...v0.6.6)

## 0.6.5 — 2026-10-28

### Added / 新增

- **Statuses** refresh automatically for up to an hour after submission, with download progress in the page list. / 提交后自动刷新状态，最长一小时，本页番号也显示下载进度。
- **Failures** say whether the magnet or the cloud drive is at fault, and a failed magnet can be switched for the next one. / 失败时区分磁力问题与网盘问题，磁力失效可以换下一个。
- **Performer avatars** appear on the card title, including for titles outside the library. / 浮卡标题显示人物头像，馆藏外的作品也按 Peach 本地人物匹配出头像。
- **Sounds**: adding plays Peach's start tone and each finished import plays its success chime; both can be turned off. / 点加入时播放 Peach 的开始音，每部影片入库完成时播放成功音效，都能在设置里关闭。

### Fixed / 修复

- **Page scans** accept only codes written with a separator, so names like `jay925` or `hhd800.com` are no longer listed. / 整页扫描只收带分隔符的番号，`jay925`、`hhd800.com` 这类用户名和域名不再列出。
- **Page list** keeps its header fixed and scrolls inside the table when long. / 本页番号较多时表格限高，表头固定、表内滚动。
- **Row statuses** use short chips in Peach's status colors, with the full message on hover. / 行状态改为 Peach 配色的短标签，完整说明放在悬停提示。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.4...v0.6.5)

## 0.6.4 — 2026-10-28

### Fixed / 修复

- **Author and icon** are declared, so userscript managers and Sleazy no longer show a blank author and the default icon. / 声明脚本作者与 Peach 图标，脚本管理器与 Sleazy 不再显示空作者和默认图标。
- **Setup** links the Tampermonkey permission guide for Chromium browsers. / 配置步骤补充 Chromium 浏览器的 Tampermonkey 权限设置说明。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.3...v0.6.4)

## 0.6.3 — 2026-10-28

### Changed / 变更

- **Script name** defaults to English, and Sleazy shows the name in each page's language. / 默认脚本名改为英文，Sleazy 按页面语言显示对应名称。
- **Sleazy** syncs the script from the latest GitHub Release. / Sleazy 改为从最新 GitHub Release 同步脚本。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.2...v0.6.3)

## 0.6.2 — 2026-10-28

### Fixed / 修复

- **Sleazy** accepts the release now that every localized name has a description. / 每个本地化脚本名都有对应语言的简介，通过 Sleazy 发布校验。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.1...v0.6.2)

## 0.6.1 — 2026-10-28

Published on GitHub; not published on Sleazy because a localized description was missing. The corrected Sleazy release is 0.6.2. / 已在 GitHub 发布；因缺少本地化简介，未发布到 Sleazy，Sleazy 修正版本为 0.6.2。

### Fixed / 修复

- **Check for updates** compares Sleazy with Peach's bundled script and offers the newer one. / 「检查更新」比较 Sleazy 与 Peach 随附脚本，采用较新的版本。
- **Scripts installed from Peach** also update automatically from Sleazy. / 从 Peach 安装的脚本也从 Sleazy 自动更新。
- **DMM** pages use the code Peach resolves, even before the first detail query finishes. / DMM 页面在首次详情查询完成前也使用 Peach 解析的规范番号。
- **Page scans** skip device names such as PS4 and PS5. / 整页扫描不再把 PS4、PS5 等设备名当成番号。

### Changed / 变更

- **Name**: the script is called Peach Userscript everywhere, and existing installs keep updating. / 对外名称统一为 Peach 用户脚本，旧安装照常更新。
- **Descriptions** are published separately in English and Chinese, with a bilingual version history. / 发布独立的中英文说明，并维护双语版本历史。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.3.0...v0.6.1)

## 0.6.0 — Source-only version / 源码版本

Not published separately on Sleazy; included in 0.6.1. / 未单独发布到 Sleazy，随 0.6.1 提供。

- **Page scans**: select codes across the page, select all and submit them in a batch. / 整页识别番号，可多选、全选并批量提交。
- **Launcher** follows Peach's theme and accent, remembers where you drag it, and can show always, only on JAV sites or never. / 图标同步 Peach 深浅色与强调色，记住拖动位置，可常驻、仅在 JAV 站点显示或彻底关闭。
- **Settings**, table selection, avatars and stage animations match Peach. / 设置、表格选择、头像和各阶段动画与 Peach 对齐。

[Source changes / 源码变更](https://github.com/peach-mitao/peach-userscript/compare/74dd91b9e3e91b00bc4d75d1ad119fe3f7e95ba5...5aa16f5f706318892187f1324d30a7cc43201adc)

## 0.5.2 — Source-only version / 源码版本

Bundled with Peach 0.50.0; not published separately on Sleazy. / 随 Peach 0.50.0 分发，未单独发布到 Sleazy。

- **Update checks** look at Sleazy and Peach releases separately, run daily and prompt a refresh after installing. / 分别检查 Sleazy 与 Peach 发行版本，每日自动检查，安装后提示刷新。
- **Announcements** for task status and updates are kept apart. / 任务状态与更新提示分别播报。

## 0.5.1 — 2026-10-25

- **Progress** shows the queue, search, download, import and organizing stages, with download progress when available. / 显示排队、搜索、下载、入库和整理各阶段，能取得时显示下载进度。
- **Views**: the panel can be compact, collapsed or minimized. / 浮卡支持紧凑、折叠和图标三种视图。
- **Error reports** are restricted and go only to your own Peach. / 受限的错误报告只发送到你自己的 Peach。

## 0.5.0 — 2026-10-25

- **Code recognition** checks DMM and FANZA maker codes against product URLs, keeps MGS prefixes and suffixes, and adds Kirari and date codes. / 番号识别对照商品地址校验 DMM／FANZA 厂家番号，保留 MGS 前缀与尾字母，补上 Kirari 和日期式番号。
- **Errors** tell service failures, unsupported interfaces, rate limits and invalid identities apart. / 区分服务故障、接口不兼容、限流与身份无效。

## 0.4.0 — 2026-10-20

- **Settings** and library controls match Peach, and pairing accepts pasted details and detects the installation. / 设置与馆藏控件与 Peach 对齐，配对支持粘贴信息并检测安装。
- **DMM and MGS** products are identified through Peach, and reviewed mirror domains are added. / 通过 Peach 识别 DMM、MGS 商品身份，补充已复核的镜像站。

## 0.3.0 — 2026-10-18 — Initial release / 初始发布

- **Video codes** on the page or in a selection are detected, checked against the library and handed to Peach to download. / 识别页面或选中的影片编号，查询馆藏状态，交给 Peach 下载入库。
- **Site rules** ship as a manifest with a reproducible build and Peach export files. / 提供站点规则清单、可复现构建与 Peach 同步制品。

[Initial source history / 初始源码历史](https://github.com/peach-mitao/peach-userscript/commits/v0.3.0)
