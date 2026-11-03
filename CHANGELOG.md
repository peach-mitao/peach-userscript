# Changelog / 更新日志

Notable changes are grouped by version. English and Chinese describe the same behavior; source-only versions are marked explicitly. / 按版本记录面向使用者的变化；中英文保持事实一致，未单独发布的源码版本明确标注。

## 0.7.1 — 2026-11-04

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Added / 新增

- **Retry organizing** when Peach reports that a downloaded title was ingested but organizing failed: the panel button and the progress page of another title both offer 重试整理, which hands the task back to Peach the same way the task center does and keeps tracking it. Older Peach versions without this endpoint get a note to retry from the Peach task center. / 入库后整理失败时可以直接重试：浮卡按钮和其他任务的进度页都显示「重试整理」，与 Peach 任务中心同一入口，点后接着跟踪进度。没有这个接口的旧版 Peach 会提示到 Peach 任务中心重试。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/26ae5b9...main)

## 0.7.0 — 2026-11-04

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Added / 新增

- **Shared progress** across windows. With a Peach that lists running tasks (`GET /api/jav-browser/active`), one open page queries Peach for every task and the other pages show the same progress without their own requests; closing that page hands polling to another, and closed windows lose nothing because tasks keep running in Peach. The panel lists other running and recently finished titles under 其他任务, one row per title with its performers' avatars; clicking one opens its own five-stage progress page with a back button to the panel. The list folds itself when there are more than three titles or this page's own title is still in progress, and its heading folds or unfolds it by hand. The minimized icon shows how many are running, tracking no longer stops after an hour, and the success chime plays once instead of once per window. Older Peach versions keep per-page polling. / 各窗口共享任务进度。Peach 提供进行中任务列表（`GET /api/jav-browser/active`）时，只由一个打开的页面向 Peach 查询所有任务，其他页面直接显示同一份进度、不再各自请求；这个页面关闭后由别的页面接手，窗口全关了任务也照样在 Peach 继续。浮卡在「其他任务」下列出别的番号的进行中与最近结束的任务，每个番号一行并带人物头像，点开进入该番号的五段进度页，返回键回到浮卡主页；超过 3 项或本页番号还在抓取时列表自动折叠，点标题可手动展开或折叠；收成图标时角标显示进行中的数量；跟踪不再一小时后停止，成功提示音也只响一次，不再每个窗口各响一遍。旧版 Peach 照旧由各页面逐个查询。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/e7b9813...main)

## 0.6.12 — 2026-11-04

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Changed / 变更

- **Panel** can be dragged by any empty area while expanded or collapsed, not only as the minimized icon. Buttons, links and form fields still click normally, and the position is shared with the icon. / 浮卡展开或折叠时按住任意空白处都能拖动，不再只有收成图标时能拖；按钮、链接和表单控件照常点击，位置与图标共用。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/1363343...main)

## 0.6.11 — 2026-11-03

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Fixed / 修复

- **Panels** switch to Settings and the page list with Peach's settings-panel enter and exit motion (BoardUI dialog motion), playing on both layers at once instead of hiding the panel first and fading the new view in from nothing, so switching no longer flashes. Returning brings the panel back as the subpage leaves, and the page list now leaves like Settings. / 浮卡与设置、本页番号切换时改用 Peach 设置面板的进出场动效（BoardUI 弹层动效），两层同时进出，不再先瞬间隐藏浮卡、再让新界面从全透明出现，切换不再闪一下；返回时子页一开始退场浮卡就进场，本页番号的返回也和设置一样退场。
- **Page list** no longer treats reviewer names followed by an honorific (`qwert-02さん` on MGS reviews) as release codes. Local performer lookups also match codes Peach pads (`ABC-12` → `ABC-012`) instead of reporting the local data as invalid. / 本页番号不再把后面跟着敬称的评论署名（MGS 评论里的 `qwert-02さん`）当成番号；Peach 补零后的番号（`ABC-12` → `ABC-012`）也能对上本地人物资料，不再提示「本地女优资料格式无效」。
- **Sound** plays the success chime only after the download has been ingested and organizing has finished, not while organizing is still running. / 成功提示音等入库并整理完成后才响，不再在刚入库、还在整理时就响。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/b47e32f...main)

## 0.6.10 — 2026-11-01

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Fixed / 修复

- **MGS** SOD pages such as `107STZY-019` accept the release code Peach returns without the store prefix (`STZY-019`), so owned titles show as owned and magnet searches use the code the library and indexes know. The page list no longer shows the prefixed form as a second row. / MGS 的 SOD 商品页（如 `107STZY-019`）接受 Peach 去掉店铺前缀后返回的番号 `STZY-019`，已入库作品显示「已有」，磁力搜索使用账本与索引站的写法；本页番号不再把带前缀写法单列一行。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/57f2ecc...main)

## 0.6.9 — 2026-10-30

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Changed / 变更

- **Updates** offer a page refresh after opening the installer. Returning to the page rechecks the installed version; only a confirmed newer installation is shown as updated. / 打开更新安装入口后提供「刷新本页」。返回页面时重新核对已安装版本，只有确认安装了新版本才显示「已更新」。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/280c4e67d5e87af7ba1901cda7a5195978023c40...main)

## 0.6.8 — 2026-10-30

Source only; release assets are not published yet. / 仅源码更新，尚未发布发行制品。

### Fixed / 修复

- **Page list** reads each title's Peach status before enabling add actions. Owned titles and active tasks no longer appear as pending or count toward **Add all**; active tasks keep updating, and unavailable status is shown explicitly. / 「本页番号」先查询每部作品的 Peach 状态，再开放加入操作。已有影片与进行中任务不再显示「待加入」或计入「全部加入」；进行中任务继续更新，查询失败明确显示「未取得」。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.7...main)

## 0.6.7 — 2026-10-28

### Changed / 变更

- **Launcher** on pages without a single title, such as the JavDB home page, opens a small panel with **Scan this page** and **Settings** instead of jumping straight into the page list; going back from the list returns to that panel. / 没有单部作品的页面（如 JavDB 首页）点图标先展开入口面板，内含「识别本页全部番号」和设置，不再直接进入本页番号；从本页番号返回时回到面板。
- **Card** drops the “可以加入 Peach 馆藏” line; the button already says it, and shows the reason when adding is not possible. / 浮卡去掉「可以加入 Peach 馆藏」这行，按钮本身已说明，不能加入时按钮会给出原因。
- **Settings** and the page list scroll with the same overlay scrollbar as the table. / 设置页与本页番号的弹窗主体改用与表格相同的覆盖滚动条。

### Fixed / 修复

- **Settings** no longer leave a blank strip below the footer on pages rendered in quirks mode, such as FANZA. / FANZA 等按怪异模式渲染的页面上，设置页底栏下方不再多出一截空白。
- **Page list** avatars no longer scroll over the sticky header. / 本页番号滚动时，头像不再盖住吸顶表头。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.6...v0.6.7)

## 0.6.6 — 2026-10-28

### Changed / 变更

- **Update** opens the Sleazy install file directly, so the userscript manager shows the update prompt instead of the script page. / 「更新用户脚本」直接打开 Sleazy 安装文件，脚本管理器随即弹出更新确认，不再跳到脚本主页。
- **Settings** keep only the hints needed to pair and to turn the icon back on. / 设置页只保留配对和恢复图标所需的提示。

### Fixed / 修复

- With a Peach release newer than 0.51.0 (from 2026-10-28 evening), switching magnets searches every source instead of stopping at the first high-definition result, and performer avatars are framed on the detected face like Peach's own avatars. / 配合 2026-10-28 晚间之后的 Peach，换磁力时会查完所有来源，不再在第一条高清结果处提前结束；人物头像按人脸取景，与 Peach 一致。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.5...v0.6.6)

## 0.6.5 — 2026-10-28

### Fixed / 修复

- Page-wide scans accept only codes written with a separator, matching Peach's validation. Usernames, navigation labels and domains such as `jay925`, `TOP250` and `hhd800.com` are no longer listed as codes. / 整页扫描只收原文带分隔符的番号，与 Peach 校验一致；`jay925`、`TOP250`、`hhd800.com` 这类用户名、导航与域名不再列为番号。
- Long page-code lists keep a maximum height and scroll inside the table with a fixed header, using Peach's overlay scrollbar. / 本页番号较多时表格限高，用 Peach 的覆盖滚动条在表内滚动并保留表头。
- Row statuses use short Board UI chips with Peach's status colors; the full message stays in the tooltip, and handled rows are unchecked. / 行状态改为 Board UI 短标签与 Peach 状态配色，完整说明放在悬停提示，已处理的行取消勾选。

### Added / 新增

- Statuses refresh automatically after submission for up to an hour, including download progress in the page-code list. / 提交后自动刷新状态，最长一小时，本页列表也显示下载进度。
- Failures say whether the magnet or the cloud drive is at fault. A failed magnet can be switched for the next one from the card or by adding the row again. / 失败时区分磁力问题与网盘问题；磁力失效可在浮卡或再次加入时换一个磁力。
- Performers listed on the detail page are matched with Peach's local people, so titles outside the library show performer avatars. / 详情页的出演者与 Peach 本地人物匹配，馆藏外的作品也能显示头像。
- The card title shows performer avatars, stacked like Peach's title cards with the same hover spread; rescanning spins its icon. / 浮卡标题显示人物头像，沿用 Peach 作品卡的叠放与悬停展开；重新识别时图标旋转。
- Adding plays Peach's rising start tone, and each title that finishes importing plays Peach's success chime; both can be turned off in settings. / 点加入时播放 Peach 的上扬开始音，每部影片完成入库时播放 Peach 的成功音效，均可在设置中关闭。

### Compatibility / 兼容性

- Magnet switching, failure causes and performer matching need a Peach release newer than 0.51.0; Peach 0.51.0 and earlier ignore the new fields and keep retrying the same magnet. / 换磁力、失败原因与出演者匹配需要 0.51.0 之后的 Peach 版本；0.51.0 及更早版本忽略新字段，重试仍使用原磁力。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.4...v0.6.5)

## 0.6.4 — 2026-10-28

### Fixed / 修复

- Declare the script author and the Peach icon, so userscript managers and Sleazy show them instead of a blank author and the default icon. / 声明脚本作者与 Peach 图标，脚本管理器与 Sleazy 不再显示空作者和默认图标。
- Setup now links the Tampermonkey permission guide for Chromium browsers. / 配置步骤补充 Chromium 浏览器的 Tampermonkey 权限设置说明。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.3...v0.6.4)

## 0.6.3 — 2026-10-28

### Changed / 变更

- Use English as the default script name and description, so Sleazy shows Peach Userscript, Peach 用户脚本 and Peach 使用者腳本 on the matching language pages. / 默认脚本名与简介改为英文，Sleazy 的英文、简体中文、繁体中文页面分别显示 Peach Userscript、Peach 用户脚本、Peach 使用者腳本。
- Sleazy now syncs the script from the latest GitHub Release and the descriptions from this repository. / Sleazy 改为从最新 GitHub Release 同步脚本，从本仓库同步说明。

### Compatibility / 兼容性

- The update check accepts both the new and the previous name. Installs of 0.6.2 or earlier show the Sleazy source as unavailable in **Check for updates** until the userscript manager updates them. / 更新检查同时接受新旧名称。0.6.2 及更早的安装在脚本管理器自动升级前，「检查更新」中的 Sleazy 来源显示未取得。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.2...v0.6.3)

## 0.6.2 — 2026-10-28

### Fixed / 修复

- Provide a description for every localized script name, satisfying Sleazy's publication validation. / 为每个本地化脚本名称提供对应语言的简介，满足 Sleazy 发布校验。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.6.1...v0.6.2)

## 0.6.1 — 2026-10-28

Published on GitHub; not published on Sleazy because a localized description was missing. The corrected Sleazy release is 0.6.2. / 已在 GitHub 发布；因缺少本地化简介，未发布到 Sleazy，Sleazy 修正版本为 0.6.2。

### Fixed / 修复

- Compare Sleazy and the paired Peach bundle numerically, select the newer source, and prefer Sleazy on equal versions. One failed source does not discard a successful result. / 比较 Sleazy 与已配对 Peach 随附脚本的版本，采用较新来源；同版本优先 Sleazy，一端失败不丢弃另一端结果。
- Declare Sleazy update and download URLs for scripts installed from Peach. / 从 Peach 安装的脚本也声明 Sleazy 自动更新与下载地址。
- Exclude single-digit device labels such as PS4 and PS5 from page scans. Reuse Peach's resolved DMM identity, including when the initial detail query is pending. / 整页扫描排除 PS4、PS5 等单数字设备名；首次详情查询未完成时也先取得 Peach 解析的 DMM 规范番号。

### Changed / 变更

- Publish separate English and Chinese descriptions and maintain a bilingual version history. / 发布独立的中英文说明，并维护双语版本历史。
- Unify the public name as Peach Userscript / Peach 用户脚本 through localized metadata, retaining the original installation identity for existing update checks. / 通过本地化元数据将对外名称统一为 Peach 用户脚本 / Peach Userscript，保留旧安装身份以兼容既有更新检查。

[Full Changelog / 完整变更](https://github.com/peach-mitao/peach-userscript/compare/v0.3.0...v0.6.1)

## 0.6.0 — Source-only version / 源码版本

Not published separately on Sleazy; included in 0.6.1. / 未单独发布到 Sleazy，随 0.6.1 提供。

- Add page-wide code selection, select-all and batch submission. / 支持整页番号识别、多选、全选与批量提交。
- Sync Peach's theme and accent, remember the draggable launcher position, and offer always-visible, JAV-only and fully hidden modes. / 同步 Peach 深浅色与强调色，记住可拖动图标的位置，提供常驻、仅 JAV 站点和彻底关闭图标选项。
- Align settings, table selection, avatars and progress-stage animations with Peach. / 对齐设置、表格选择、头像和各任务阶段动画。

[Source changes / 源码变更](https://github.com/peach-mitao/peach-userscript/compare/74dd91b9e3e91b00bc4d75d1ad119fe3f7e95ba5...5aa16f5f706318892187f1324d30a7cc43201adc)

## 0.5.2 — Source-only version / 源码版本

Bundled with Peach 0.50.0; not published separately on Sleazy. / 随 Peach 0.50.0 分发，未单独发布到 Sleazy。

- Add independent Sleazy release checks, Peach release checks, daily automatic checks and refresh prompts after installation. / 增加独立 Sleazy 发行检查、Peach 发行检查、每日自动检查与安装后的刷新提示。
- Keep task-state announcements separate from update announcements. / 任务状态与更新提示分别播报。

## 0.5.1 — 2026-10-25

- Show queue, search, download, import and organization stages with available download progress. Stop polling after organization completes. / 显示排队、搜索、下载、入库和整理阶段及可取得的下载进度；整理完成后停止轮询。
- Support compact, collapsed and minimized views, and send restricted error reports only to the user's Peach instance. / 支持紧凑、折叠和图标视图；受限错误报告仅发送到用户自己的 Peach。
- The backend progress and timeout fixes are included in Peach 0.50.0. The original release's “package pending” notice described its publication-time status. / 后端进度与超时修复已包含在 Peach 0.50.0；原发布记录中的「安装包待发布」是当时的发布状态。

## 0.5.0 — 2026-10-25

- Validate DMM / FANZA maker codes against product URLs, preserve MGS publisher prefixes and suffix letters, and recognize Kirari and date-based codes. / 联合校验 DMM／FANZA 厂家番号与商品地址，保留 MGS 发行前缀与尾字母，补齐 Kirari 和日期式番号。
- Distinguish HTTP service failures, unsupported interfaces, rate limits and invalid identities. / 区分服务故障、接口不兼容、限流与身份无效。

## 0.4.0 — 2026-10-20

- Align the settings dialog and library controls with Peach; support pasted pairing information and installation detection. / 对齐 Peach 设置与馆藏控件，支持粘贴配对信息和安装检测。
- Resolve DMM and MGS product identities through Peach and add reviewed mirror domains. / 通过 Peach 识别 DMM、MGS 商品身份，补充已复核镜像。

## 0.3.0 — 2026-10-18 — Initial release / 初始发布

- Detect or submit selected video codes, query library status, and hand download/import tasks to Peach. / 识别或提交选中的影片编号，查询馆藏状态，并交给 Peach 下载入库。
- Publish the site-rule manifest, deterministic build, candidate-review tooling and Peach export artifacts. / 提供站点规则清单、确定性构建、候选复核工具与 Peach 同步制品。

[Initial source history / 初始源码历史](https://github.com/peach-mitao/peach-userscript/commits/v0.3.0)
