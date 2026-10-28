# Changelog / 更新日志

Notable changes are grouped by version. English and Chinese describe the same behavior; source-only versions are marked explicitly. / 按版本记录面向使用者的变化；中英文保持事实一致，未单独发布的源码版本明确标注。

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
