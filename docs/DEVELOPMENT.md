# 用户脚本构建与发布

以下命令在仓库根目录执行；安装与配对见 [README](../README.zh-CN.md)。

## 构建与验证

使用 [Node.js 24 LTS](https://nodejs.org/en/about/previous-releases)。构建与基础单测仅使用 Node 内置模块，无运行依赖。浏览器回归的唯一开发依赖为 `playwright-core`。

脚本与测试写成 `.ts`，由 Node 24 的类型擦除直接运行，不另加构建步骤；用户脚本源码 `src/peach-jav.user.js` 是浏览器里运行的 `.js`。不新建 `.mjs`、`.cjs`，`tests/build.test.ts` 会拦下。本地模块按完整文件名导入，例如 `'./build.ts'`。

以下命令均在仓库根目录执行。生成确定性的安装脚本及站点快照：

```powershell
npm run build
```

执行构建和候选工具的基础单测：

```powershell
npm test
```

按锁文件安装浏览器测试依赖：

```powershell
npm ci --ignore-scripts
```

安装用于离线合成页面回归的 Chromium：

```powershell
node node_modules/playwright-core/cli.js install chromium
```

核对已提交产物并运行全部测试：

```powershell
npm run verify
```

有本机 Chrome 时，可将 `PEACH_E2E_CHROME` 设置为其完整可执行文件路径。测试拦截所有页面请求并模拟 GM API，不访问真实 Peach、源站或网盘。真实扩展权限确认与网盘联合验收仍需在实际部署中完成。

## 发布与 Peach 同步

已配对时，更新检查比较 Sleazy 与 Peach 随附脚本，入口指向较新版本的来源，同版本优先 Sleazy。任一来源失败仍显示另一来源已取得的更新。固定的 `@updateURL` 和 `@downloadURL` 让从 Peach 本地安装的脚本也使用 Sleazy 自动更新渠道。Sleazy 下发时会删掉这两行，按「先 `@downloadURL` 后 `@updateURL`、键后一个空格、地址用 Sleazy 页面上的脚本名」补在头部末尾；源码照这个写法，脚本管理器更新时才不会提示地址被更换。Sleazy 上的脚本改名后要同步改这两行。Sleazy 说明分别维护在 `SLEAZY.md`（英文）和 `SLEAZY.zh-CN.md`（中文），发布时填写对应语言的附加信息。

发行说明按 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 区分新增、变更和修复；中英文描述同一事实，条目写法与长度上限见 [CHANGELOG](../CHANGELOG.md) 开头。兼容条件和尚未验证的范围写进 PR 与提交；Release 正文需要提醒时放在开头一段，两种语言都写。每项可追溯到实际 PR、issue 或提交，不虚构编号；尚需用户验证的 issue 使用普通引用或 `Refs`，不使用自动关闭关键词。末尾提供上一发行标签到当前标签的 `Full Changelog` 比较链接；首发使用 `Initial release / 初始发布` 和该标签的提交历史链接。GitHub Release 与 Sleazy 原生历史使用同一份 Release 正文，版本记录仅在对应平台发行后写入。

Sleazy 的中英文附加说明分别填写，按访客语言显示。原生历史使用一个字段，展示与 GitHub Release 一致的完整双语正文和发行链接。GitHub Release 标题只写版本号（如 `v0.7.1`），默认展示完整英文正文，中文放入 `details` 折叠区，两部分共同引用同一变更范围。

Sleazy 的 GitHub Release webhook 从事件的 `release.name` 读取原生历史日志。`scripts/sleazy-notes.ts` 取得实际 GitHub Release，通过 GitHub Markdown API 将完整正文渲染为 HTML，再把正文和发行链接放入发送事件的 `release.name`，使用既有签名密钥计算 `X-Hub-Signature`。Sleazy 使用 Redcarpet，折叠区内的标题、列表等内容须转换为 HTML 才能正常显示。两端展示同一份双语内容。工作流从 `0.7.19` 之后的新版本开始写入，既有版本运行时通过 `ping` 验证配置。平台缺少作者修改旧历史行的入口，历史补录和格式修正由平台管理员处理。

GitHub 中现有的 Sleazy webhook 订阅 `push`，用于将 `main` 上修改的 `docs/SLEAZY.md` 和 `docs/SLEAZY.zh-CN.md` 同步为附加说明。发行同步由 `release.yml` 的签名步骤负责，仓库变量 `SLEAZY_WEBHOOK_URL` 保存账号 webhook 地址，Actions Secret `SLEAZY_WEBHOOK_SECRET` 保存既有签名密钥。脚本通过官方 `api.sleazyfork.org` 的 `versions.json` 读取完整版本历史，发送前按版本查重，确认本次运行对应 GitHub 最新发行版，并要求新版本高于 Sleazy 当前版本。收到目标脚本的成功应答后，再通过该 API 核对版本已经发布。请求失败或结果未确认时工作流报错，可重跑该次工作流继续核对。JSON API 仅提供版本记录，发行正文由签名请求传递，页面上的正文展示另行核验。

对外名称以英文优先：默认 `@name` 与 `@description` 使用英文 `Peach Userscript`，`zh-CN`、`zh-TW` 由本地化元数据提供。Sleazy 会忽略与脚本默认语言相同的本地化名称，因此发布页的默认语言须保持英语，否则对应语言页面显示默认名。namespace 是安装身份，保持不变。0.6.3 之前的更新检查只接受旧名 `Peach · JAV 入库`；这些安装在脚本管理器按 `@updateURL` 升级前，Sleazy 来源显示未取得，升级后同时接受新旧两个名称。

Sleazy 从 GitHub 同步：源码取 [最新 Release 的安装脚本](https://github.com/peach-mitao/peach-userscript/releases/latest/download/peach-jav.user.js)，默认附加信息取 `main` 分支的 `docs/SLEAZY.md`，`zh-CN` 附加信息取 `docs/SLEAZY.zh-CN.md`。因此发布即创建带四个制品的 GitHub Release。

发布是自动的。递增 `package.json` 版本、在 `CHANGELOG.md` 写好这一版并合入 `main` 后，工作流 `release.yml` 核对制品与源码一致，用 `scripts/release-notes.ts` 从 CHANGELOG 生成正文，汇总到上一个已发布版本，英文在前、中文折叠，随后打标签 `v<版本>` 并上传四个制品。已经存在的 Release 直接进入 Sleazy 同步步骤。CHANGELOG 缺这一版或标着仅源码时工作流失败。正文生成可在本地预览，运行 `node scripts/release-notes.ts --version <版本> --previous <上一个标签> --repo peach-mitao/peach-userscript`。同步失败后重跑工作流时，脚本先通过官方 API 检查原生历史，确认已经写入的版本后结束。

`dist/peach-jav.user.js` 可直接安装，`dist/jav-sites.json` 是版本化站点快照，`dist/release.json` 记录脚本版本与两个文件的 SHA256，`dist/SHA256SUMS` 用于校验制品。构建不写时间戳、不访问网络。CI 检查已提交制品与源文件一致，并上传制品。

Peach 主仓库消费同一次发布的脚本与站点快照，服务端继续独立验证来源域名和作品参数。维护脚本或站点时在本仓库修改、构建、验证，递增版本后同步制品；协议说明见 [Peach API](PROTOCOL.md)。[Sleazy 发布说明](SLEAZY.md) 可用于发布页面。

需要交给其他项目时，可运行 `npm run export -- --output <制品目录>`，导出这四个文件。导出前会核对源与产物一致；相同内容可重复导出，已有不同内容会被拒绝，防止覆盖混合版本。

同步到 Peach 隔离工作树时，使用 `node scripts/export-peach.ts --target <Peach隔离工作树> --commit <本仓库40位提交SHA>`。默认仅预览，添加 `--apply` 才写入 `web/integrations/` 中的脚本、站点快照与 `jav-userscript-release.json` 来源记录。工具校验工作树注册关系、Peach 项目标识、发布清单与 hash，不访问网络、不执行 Git 或服务命令。

## 站点与镜像候选

[候选同步工具](MIRROR_REVIEW.md) 从人工选定并固定 SHA256 的 Sleazy 用户脚本元数据中，提取显式 `@match` / `@include` / `@connect` 域名，辅助发现镜像和缺少的源站。仓库提供 6 个不含第三方实现的元数据快照，支持离线重放。所有候选结果保持待复核；工具不执行远程代码，也不改 `jav-sites.json`。没有自动站点同步或定时任务。
