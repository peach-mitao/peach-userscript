# 复用记录

## 阶段动画、页面识别与外观

默认密度恢复 Peach 表格采用档：14/20、500，10px 12px 单元格间距；状态文字为 14/20、400，不使用 `bui-table-sm`。头像复用 Peach 已登记的暗色例外：`avatar-neutral-background` 为主文字色 10% 混入 primary 面，前景取主文字色，24px 首字母使用 Avatar `sm` 的 12/16、600。正常、悬停和选中态均检查前景对比度；字段、表格正文、提示分别使用完整的 Body、Caption 字阶。设置与番号列表为左返回子页，沿用 Remix Icon 4.9.0 `RiArrowLeftLine`，仅主浮卡保留关闭。

无人物资料时的默认头像使用同一 Remix Icon 4.9.0 的 `RiUserLine`，保留原始 SVG 路径与现有许可；图形 16px，外框与照片、首字母同为 24px，使用中性灰色。资料读取期间也使用此占位，取得人物名后替换为照片或首字母，不发起额外查询。

批量表格样式与选择交互复用 Peach revision `fc6b5b4f3d9b7dc5f73d1cc503a214dd06a80d9e` 的 `DataTableFrame`、`TableSelectionHeader`、`CheckboxGlyph` 和 `frontend/src/react/styles.css` 中的默认密度 BoardUI Table。Peach 的来源表由 TanStack Table 驱动这些控件；用户脚本将相同的表头全选／半选、逐行选择、整行点击、选中背景和 48px 行高适配为原生 table 与 checkbox。16px 勾选图形、4px 圆角、主题强调色渐变和焦点环沿用现有控件，表头全选只影响仍可添加的行。头像位于番号前，缺人物资料使用默认人像；文字过长单行省略，完整番号与失败提示保留 title。无 React、TanStack 或新的运行时依赖进入安装包。

底部三个操作继续复用共用 Button；图标按钮和禁用主按钮增加明确边框。图标拖动期间阻止图片的原生拖拽，圆形入口的图片不拦截指针；从桃子本身按住拖动与按钮空白处使用同一 Pointer Events 处理，位置仍保存于既有 GM 字段。

待处理阶段使用同一 Remix Icon 4.9.0 的 `RiTimeLine`、`RiSearchLine`、`RiDownload2Line`、`RiInboxArchiveLine`、`RiLayoutGridLine`，重新识别使用 `RiRefreshLine`。阶段区域统一 18×18，标签固定 20px 行高，待处理图形为中性灰色。批量行固定 48px，页脚单行且不提供设置。

人物信息通过 Peach 的受限只读 `/api/jav-browser/people` 获取，复用实体关联、男优排除、元数据快照和 `PreviewService.entity_image` 本地文件查找；64px 缩图复用已有 Pillow，在内存编码。快照缺失不创建 `DiscoveryMetadata`，避免其初始化恢复未完成的抓取。列表不增加封面、外站查询或后台任务；缺图使用中性灰底首字母，缺人物信息使用默认人像。

阶段动画取自 [loading.dev](https://loading.dev/) 的上游 `jakubkrehel/loading` 0.3.6，固定 revision `755235bf7eea3dfb05ec4c3661088e3521ee2d75`。Clock 表示排队等待，Radar 表示搜索，LinearDots 表示传输，Gather 表示汇聚入库，Blocks 表示分块整理。保留对应路径、节奏与关键帧，仅将 React 包装改为现有原生 DOM，并使用 Peach 当前强调色。只有当前阶段动画运行，减少动效时静止。来源文件摘要和 MIT 原文分别保存为 `assets/loading-dev-source.json`、`assets/loading-dev.LICENSE`，安装脚本内联许可；不引入 React 运行时或远程资源。

多番号识别复用现有 `candidates`、`comparisonKey` 与逐项 `/api/jav-browser` 请求。页面扫描由用户点击触发，候选去重后交由用户选择；服务端仍负责最终校验。普通网页采用不带来源的 `manual: true` 协议，Peach 端复用既有队列和幂等处理。未引入自动爬虫、LLM 识别、元数据预抓取或批量后台重试。

外观复用 Peach 的 `peach.settings.v1` 和页面实际 `--color-accent-400` 至 `700`，只在已配对 origin 读取主题与强调色。GM 存储快照和既有跨标签监听承接同步；未取得时随系统。图标拖动使用原生 Pointer Events、指针捕获和比例位置存储，打开浮卡、设置与窗口缩放时按视口约束位置。

## 更新状态与安装感知

显隐开关复用 GM 存储和跨标签变更监听，独立保存 `peach.jav.enabled` 布尔值，不覆盖原来的 JAV／所有网页范围。普通页与关闭状态仍注册「开启、检测更新、设置」三项 `GM_registerMenuCommand`；页面识别与自动检查由同一显示判据约束，手动设置和检查不受此判据拦截。关闭使当前视图代际失效、停止后续轮询并移除入口，后台已提交任务保持原有生命周期，无新增权限或依赖。

作品浮卡只在发现用户脚本更新、Peach 更新或安装后待刷新时显示更新区；当前版本、检查中与检查失败留在设置窗口。用户脚本更新使用蓝色提示，Peach 更新使用橙色提示，同时可用时分别保留操作。查询与抓取期间，主操作使用原生 `disabled`，禁用态不响应 hover 或按下配色；请求结束后按真实状态恢复。

更新检查复用既有 GM 存储、跨域请求和菜单入口，无新增依赖。Tampermonkey 官方 [GM_xmlhttpRequest](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_xmlhttpRequest) 定义 `anonymous`、`redirect`、`finalUrl` 与返回句柄的 `abort()`；官方说明 Chrome 的 fetch 模式不保证 `timeout` 生效，因此请求另设 15 秒浏览器定时器并实际中止。固定已知域通过 [@connect](https://www.tampermonkey.net/documentation.php?locale=en&q=connect) 单独声明，`*` 继续用于用户选择的 Peach origin。

运行版本和跨标签安装感知分别复用官方 [GM_info](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_info) 与 [GM_addValueChangeListener / GM_removeValueChangeListener](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_values)。这些能力由脚本管理器提供，不增加运行包或第三方许可。页面退出释放新增监听、定时器和请求；未运行本版本检查器的既有页面无法接收新增监听，需刷新一次。

Sleazy 官方脚本 600821 的 JSON 元数据与 `.meta.js` 已通过严格 HTTPS 读取核对：名称 `Peach · JAV 入库`、namespace `https://github.com/peach-mitao/peach-userscript`、发行版本 `0.5.1`、对应同 ID 的下载地址一致。协议格式依据 [Greasy Fork 官方 API](https://greasyfork.org/en/help/api) 和维护者的[元数据下载域名说明](https://github.com/Tampermonkey/tampermonkey/issues/1904)。只解析版本与身份，不依赖影片识别或 Peach 配对；本地 Peach 接口继续复用既有发行快照。独立更新库及远程代码加载不适用于此只读需求。

商品身份复用 Peach 的 `sources.dmm` CID 模型和 `catalog_rules` 商品番号判据，不引入第三方解析依赖。浏览器只提取明确字段与完整短番号，DMM 与 MGS 的来源差异由服务端解释；厂家番号与商品号联合校验，尾字母和日期分隔符保留。模拟 GM API 的 Chromium 回归覆盖字段冲突、特殊番号与 HTTP 错误分类；Peach 消费端另以完整安装脚本连接临时账本的真实识别接口，验证桌面与手机链路。
CI 使用 Node 原生 TypeScript 执行文档判定，不增加依赖。push 从最近成功的同分支祖先计算差异，失败区间仍纳入本次验证。普通 README 和维护文档只检查格式及比较基线，保留验证结果；混合代码、未知路径、基线未取得和手动运行执行完整制品与浏览器验证。

浏览器回归通过现有 `PEACH_E2E_CHROME` 入口使用 runner 已安装的 Chrome，记录实际版本；不重复下载 Chromium 或通过 apt 安装桌面依赖。runner 未提供浏览器时直接失败，不把未运行当作通过。

用户脚本保留 Peach `f8ca8a5b9ac57f6873661c98db7f6df3694535f9` 的识别、来源净化、GM 凭据存储、请求、状态轮询及 SPA 生命周期行为。构建复用原安装端点按站点清单生成 `@match` 与内联 JSON 的边界，使用 Node 内置 `fs`、`crypto` 和 `node:test`，不引入打包器或运行依赖。

已检查源树的用户脚本、路由与浏览器测试，`docs/REUSE.md` 中的 GM API 记录，以及历史提交 `509827d5` 和 `a15b1758`。Tampermonkey [官方文档](https://www.tampermonkey.net/documentation.php) 定义存储、菜单、跨域请求与 URL 变更通知。浏览器测试复用 `playwright-core` 1.64.1（Apache-2.0），版本由本仓库锁文件固定；这是开发依赖，不进入制品。

[Node.js 官方测试入口](https://nodejs.org/docs/latest-v24.x/api/test.html) 与原生 TypeScript 类型擦除满足测试运行要求。未引入 Vite、Rollup、webpack 或用户脚本框架：产物使用确定性模板替换，不涉及模块分包。完整浏览器扩展增加独立权限和发布流程，现有需求由脚本管理器承接。

镜像和缺少源站的发现复用 Sleazy、Greasy 用户脚本的公开元数据格式。只解析人工选定且固定 SHA256 的快照，禁止执行远程脚本；通配主机、正则 include 等不能安全确定域名的规则保留为跳过记录。8 个来源的版本与 hash 见 `mirror-sources.json` 和对应元数据快照，采集内容不包含第三方实现。域名归属、自动识别和服务端信任属于 Peach 的复核边界。

最小实证为确定性构建、字节一致性校验、候选快照 hash 校验、离线同步与合成 Chromium 页面回归。真实扩展和真实网盘联合验收未取得。构建和测试不写生产或 ledger。

## 页面内设置与控件

设置弹窗与共用浮卡的控件快照对齐 Peach revision `689c6ead624f1137cde389176f807174f6b5242e` 的 BoardUI 适配：`web/board.css`、`frontend/src/react/base.css` 与已安装的 BoardUI Button、Input、theme、typography 源码。使用同一套中性色、蓝色主动作渐变、36px 表单档、10px 控件圆角、20px 弹窗圆角和正文／说明排版。原生 DOM 继续消费内嵌快照，不引入 React 或远程样式；所有入口仍共用一份 `UI_STYLE`，深浅主题只切换语义 token。旧 `geist-*` class 保留为已有 DOM 入口，不再代表旧色板。配对、令牌与请求协议不变；该修改的浏览器回归待当前预览确认后执行。

设置图标保留 Peach revision `96987634e` 的 `web/index.html` 中 `i-settings`：lucide-static 1.57.0，ISC 许可，许可原文随安装脚本保留。Spinner 沿用同 revision 的 `frontend/src/ui-kit/markup.css`。Peach 差异是来源页面内的右下角布局、地址与令牌校验、配对信息粘贴、同地址保留令牌和 GM 存储；运行时不拉远程样式或应用代码。

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
