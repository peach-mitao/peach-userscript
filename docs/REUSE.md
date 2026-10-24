# 复用记录

商品身份复用 Peach 的 `sources.dmm` CID 模型和 `catalog_rules` 商品番号判据，不引入第三方解析依赖。浏览器只提取明确字段与完整短番号，DMM 与 MGS 的来源差异由服务端解释；厂家番号与商品号联合校验，尾字母和日期分隔符保留。模拟 GM API 的 Chromium 回归覆盖字段冲突、特殊番号与 HTTP 错误分类；Peach 消费端另以完整安装脚本连接临时账本的真实识别接口，验证桌面与手机链路。

用户脚本保留 Peach `f8ca8a5b9ac57f6873661c98db7f6df3694535f9` 的识别、来源净化、GM 凭据存储、请求、状态轮询及 SPA 生命周期行为。构建复用原安装端点按站点清单生成 `@match` 与内联 JSON 的边界，使用 Node 内置 `fs`、`crypto` 和 `node:test`，不引入打包器或运行依赖。

已检查源树的用户脚本、路由与浏览器测试，`docs/REUSE.md` 中的 GM API 记录，以及历史提交 `509827d5` 和 `a15b1758`。Tampermonkey [官方文档](https://www.tampermonkey.net/documentation.php) 定义存储、菜单、跨域请求与 URL 变更通知。浏览器测试复用 `playwright-core` 1.64.1（Apache-2.0），版本由本仓库锁文件固定；这是开发依赖，不进入制品。

[Node.js 官方测试入口](https://nodejs.org/docs/latest-v24.x/api/test.html) 与原生 TypeScript 类型擦除满足测试运行要求。未引入 Vite、Rollup、webpack 或用户脚本框架：产物使用确定性模板替换，不涉及模块分包。完整浏览器扩展增加独立权限和发布流程，现有需求由脚本管理器承接。

镜像和缺少源站的发现复用 Sleazy、Greasy 用户脚本的公开元数据格式。只解析人工选定且固定 SHA256 的快照，禁止执行远程脚本；通配主机、正则 include 等不能安全确定域名的规则保留为跳过记录。8 个来源的版本与 hash 见 `mirror-sources.json` 和对应元数据快照，采集内容不包含第三方实现。域名归属、自动识别和服务端信任属于 Peach 的复核边界。

最小实证为确定性构建、字节一致性校验、候选快照 hash 校验、离线同步与合成 Chromium 页面回归。真实扩展和真实网盘联合验收未取得。构建和测试不写生产或 ledger。

## 页面内设置与控件

界面复用 Peach revision `96987634e` 的 `web/css/01-base.css` 色板、按钮与输入框契约，以及 `frontend/src/ui-kit/markup.css` 的 Spinner 和 `modal.css` 的窗口层级、正文与操作条。以同许可的独立快照嵌入脚本，所有入口共用 `control()`、`surface()` 与同一份 `UI_STYLE`。设置图标逐字复用该 revision 的 `web/index.html` 中 `i-settings`：lucide-static 1.57.0，ISC 许可，许可原文随安装脚本保留，不增加运行时依赖。Peach 差异是来源页面内的右下角布局、地址与令牌校验、配对信息粘贴、同地址保留令牌和 GM 存储；运行时不拉远程样式或应用代码。

设置的模态层和焦点管理使用浏览器原生 [`HTMLDialogElement.showModal()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal)，标题、字段、错误与按钮由 Peach 控件绘制。原生 DOM API 随目标浏览器提供，无包版本、额外依赖体积或第三方许可；需支持 Shadow DOM、dialog 与 CSS color-mix 的现代浏览器。脚本管理器的跨域连接权限确认仍由宿主管理。

未引入 React、BoardUI 全量运行时或通用表单框架：脚本只需要两个字段及页面内反馈，完整应用运行时会增加构建与宿主隔离成本。控件样式的来源、语义与主题保留在本快照，表单值不通过 HTML 字符串插入。离线预览直接消费正式构建函数，只在预览响应中把来源地址映射到合成 MissAV 页面；GM 请求均由内存替身响应。此版本的自动回归及真实扩展验收须分别确认。

## 本机错误取证

进度条复用 Peach revision `44c347573e47cdd3b2294d35719f363ee5305246` 的 `frontend/src/react/components/progress.tsx`：SVG 画布分为 100 份、高度 6px，保留相同比例、轨道、刻度和填充配色。阶段完成标记、当前阶段与 `aria-current="step"` 复用同 revision 的 `library-processing/library-processing-notice.tsx` 语义，以紧凑横排组成五个阶段。整体条按已确认里程碑推进，下载段内使用实际百分比；无数值时保留阶段指示，不插值。读屏进度以五个阶段为总量，不把各阶段解释为相同耗时。快照与项目采用相同 AGPL-3.0-or-later 许可，不引入 React 或运行时依赖。

错误取证沿用已授权的 Tampermonkey GM 存储与跨域请求 API，接入 Peach 本地 `error_reporting.event` 和诊断包。受限字段、原主机绑定、有限暂存和失败隔离是 Peach 协议策略；不新增遥测 SDK、运行依赖或站点脚本监听，不收集宿主页面异常、原始异常与完整地址。官方 GM API 定义与现有发布实现均已核对；构建仍只使用 Node.js 24 内置模块。

横排阶段标记逐字复用 Peach revision `63b45ae0fdcc13be7b8ef2f4a5ca3e04b8d7f9bf` 所用 `@remixicon/react` 4.9.0 的 `RiCheckLine`、`RiCheckboxBlankCircleLine`、`RiErrorWarningLine` 和 `RiSubtractLine` SVG 路径，尺寸沿用生产 `--icon-inline: 1.2em`。完成标签使用任务列表的删除线与 `text-tertiary` 配色，当前圆环使用 `border-focus-ring` 配色；五阶段保持单行。图形依据 Remix Icon License v1.0 使用，版权与许可链接保留在安装脚本中；图形本身沿用其许可。此适配只内联已使用的图形，不引入 React 或新的运行时依赖。

折叠箭头、关闭键沿用同 revision 的任务提示与现有 `control()`，Peach 标志来自该 revision 的 `resources/peach-logo-64.png`，构建时内联到安装脚本。右下角入口为 48px 圆形按钮，折叠标题栏保留当前状态；显示状态在当前页面与 SPA 导航内保留。恢复入口只执行状态查询。浮卡与 logo 入口切换采用 200ms 的轻量显现，时长沿用生产 Collapse；减少动效时立即切换。参考产品的实际取证与适配边界见 [收起入口参考](reference-snapshots/userscript-launcher.md)，不引入外部动画包。

设置弹窗的进入与退出复用同 revision 的 `components/surface-motion.css`：进入 200ms、退出 120ms，透明度与 `.98` 缩放同步，缓动为生产 `--ease-out` 的 `cubic-bezier(0,0,.2,1)`。遮罩同步淡入淡出；原生 dialog 在退出结束后关闭，随后清除表单、移除宿主并归还焦点。再次打开可反向中止退出；减少动效时直接关闭。

## 商品号识别复用

DMM 与 MGS 的番号识别直接调用 Peach 的只读 `/api/jav-browser/identify`，由现有 `code_key`、`release_code_from_text`、`normalise_code_key` 和 `release_identity` 处理商品号，不在脚本中移植 Python 规则。DMM 官方接口已核对 `ssis00519` 与 `SSIS-519`；MGS 详情路径保留数字前缀。无法确认的渠道前缀回到主动选择，识别过程不搜索外站或创建下载。来源与实证范围见 `docs/evidence/official-and-mirror-review.json`，本版本自动回归待确认界面后执行。
