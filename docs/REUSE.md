# 复用记录

用户脚本保留 Peach `f8ca8a5b9ac57f6873661c98db7f6df3694535f9` 的识别、来源净化、GM 凭据存储、请求、状态轮询及 SPA 生命周期行为。构建复用原安装端点按站点清单生成 `@match` 与内联 JSON 的边界，使用 Node 内置 `fs`、`crypto` 和 `node:test`，不引入打包器或运行依赖。

已检查源树的用户脚本、路由与浏览器测试，`docs/REUSE.md` 中的 GM API 记录，以及历史提交 `509827d5` 和 `a15b1758`。Tampermonkey [官方文档](https://www.tampermonkey.net/documentation.php) 定义存储、菜单、跨域请求与 URL 变更通知。浏览器测试复用 `playwright-core` 1.64.1（Apache-2.0），版本由本仓库锁文件固定；这是开发依赖，不进入制品。

[Node.js 官方测试入口](https://nodejs.org/docs/latest-v24.x/api/test.html) 与原生 TypeScript 类型擦除满足测试运行要求。未引入 Vite、Rollup、webpack 或用户脚本框架：产物使用确定性模板替换，不涉及模块分包。完整浏览器扩展增加独立权限和发布流程，现有需求由脚本管理器承接。

镜像和缺少源站的发现复用 Sleazy、Greasy 用户脚本的公开元数据格式。只解析人工选定且固定 SHA256 的快照，禁止执行远程脚本；通配主机、正则 include 等不能安全确定域名的规则保留为跳过记录。8 个来源的版本与 hash 见 `mirror-sources.json` 和对应元数据快照，采集内容不包含第三方实现。域名归属、自动识别和服务端信任属于 Peach 的复核边界。

最小实证为确定性构建、字节一致性校验、候选快照 hash 校验、离线同步与合成 Chromium 页面回归。真实扩展和真实网盘联合验收未取得。构建和测试不写生产或 ledger。

## 页面内设置与控件

界面复用 Peach revision `96987634e` 的 `web/css/01-base.css` 色板、按钮与输入框契约，以及 `frontend/src/ui-kit/markup.css` 的 Spinner 和 `modal.css` 的窗口层级、正文与操作条。以同许可的独立快照嵌入脚本，所有入口共用 `control()`、`surface()` 与同一份 `UI_STYLE`。设置图标逐字复用该 revision 的 `web/index.html` 中 `i-settings`：lucide-static 1.57.0，ISC 许可，许可原文随安装脚本保留，不增加运行时依赖。Peach 差异是来源页面内的右下角布局、地址与令牌校验、配对信息粘贴、同地址保留令牌和 GM 存储；运行时不拉远程样式或应用代码。

设置的模态层和焦点管理使用浏览器原生 [`HTMLDialogElement.showModal()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal)，标题、字段、错误与按钮由 Peach 控件绘制。原生 DOM API 随目标浏览器提供，无包版本、额外依赖体积或第三方许可；需支持 Shadow DOM、dialog 与 CSS color-mix 的现代浏览器。脚本管理器的跨域连接权限确认仍由宿主管理。

未引入 React、BoardUI 全量运行时或通用表单框架：脚本只需要两个字段及页面内反馈，完整应用运行时会增加构建与宿主隔离成本。控件样式的来源、语义与主题保留在本快照，表单值不通过 HTML 字符串插入。离线预览直接消费正式构建函数，只在预览响应中把来源地址映射到合成 MissAV 页面；GM 请求均由内存替身响应。此版本的自动回归及真实扩展验收须分别确认。

## 发行平台商品号

DMM 与 MGS 的番号识别直接调用 Peach 的只读 `/api/jav-browser/identify`，由现有 `code_key`、`release_code_from_text`、`normalise_code_key` 和 `release_identity` 处理商品号，不在脚本中移植 Python 规则。DMM 官方接口已核对 `ssis00519` 与 `SSIS-519`；MGS 详情路径保留数字前缀。无法确认的渠道前缀回到主动选择，识别过程不搜索外站或创建下载。来源与实证范围见 `docs/evidence/official-and-mirror-review.json`，本版本自动回归待确认界面后执行。
