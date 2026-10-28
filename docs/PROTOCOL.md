# Peach 浏览器添加协议

脚本使用 Peach 现有 `/api/jav-browser` 接口。Peach 是独立服务，负责校验番号、验证来源、搜索磁力、选择下载渠道、保存队列和入库。脚本不接触网盘凭据，也不从页面直接采纳磁力。

## 配对与传输

在 Peach 的浏览器添加设置中启用并生成专用令牌。脚本管理器将 Peach origin 和令牌保存在 `peach.jav.base` 与 `peach.jav.token`，作品操作和本机状态请求通过 `GM_xmlhttpRequest` 发往用户配置的 Peach origin。

配对信息使用 JSON：`{"peach_pairing":1,"base":"https://peach.example.com","token":"专用令牌"}`。Peach 在令牌签发后可复制该信息；用户脚本在地址输入框粘贴时校验版本与字段，按配置的相同判据校验后填入表单，不自动保存。载荷上限 4,096 字符，不包含网盘凭据或来源站数据。

## 安装检测

脚本只在固定路径 `/integrations/peach-userscript-bridge` 的同源子框架内响应检测，HTTPS 支持自托管主机，HTTP 仅匹配本机。Peach 页面发出 `{type:"peach-userscript:probe",nonce}`，脚本校验父窗口、来源与 UUID nonce 后回报 `{type:"peach-userscript:ready",protocol:1,nonce,version,paired}`。`paired` 只表示 GM 存储中的有效地址等于当前 origin，不证明令牌仍有效；不回报地址或令牌。普通来源站点的子框架不运行添加逻辑。

## 发行平台商品号

`GET /api/jav-browser/identify?source_url=<已净化的详情地址>&code=<页面明确番号>` 使用同一专用令牌，返回与状态查询相同的字段。`code` 可省略；有厂家番号或品番字段时提交，用于核对商品号与页面身份。字段不一致返回 400。Peach 从登记的 DMM、MGS 详情路径提取商品号：DMM 复用来源解析器的 CID 形态，目录数字头不进入番号；MGS 保留三位发行前缀。明确商品番号的尾字母属于身份，不作为字幕标记剥除。识别不搜索来源、不写账本、不创建下载。脚本不维护商品号转换表。

发行平台在 `jav-sites.json` 声明 `identity: "peach"`。两端从同一详情正则的第一捕获组或唯一作品参数取得商品号；域名、镜像与详情路径均以该清单为准。

脚本只读取详情表中的「メーカー品番」「品番」等明确身份字段，不把「配信品番」与厂家番号混为一谈。多个字段矛盾时阻止添加；请求保留尾字母，响应须与所提交字段一致。通用提取覆盖 KIRARI 的 `MKBD-S`／`MKD-S` 和二至四位序号的日期式番号。HTTP 404／405 提示升级 Peach，429 提示稍后查询，5xx 提示服务故障；不将这些故障显示为番号缺失。

地址接受 HTTPS；HTTP 仅接受 `localhost`、`127.0.0.1`、`[::1]`。地址须为 origin，不能带用户名、密码、路径、查询或片段。令牌不能为空，最多 256 字符，不接受换行。请求使用 `Authorization: Bearer <专用令牌>`，`Accept: application/json`，`anonymous: true`，业务请求单次超时 60 秒。`@connect *` 用于自选 Peach 地址；带令牌的请求目标始终来自有效配置，独立发行检查使用下文固定的官方元数据地址。

## 检查更新

`GET /api/jav-browser/updates` 使用同一 Bearer 专用令牌，无需番号或作品来源。返回 `{runtime:{version,build_id},release,userscript:{version,minimum_version,install_url,release_url}}`；`release` 沿用 Peach 的发行检查快照。服务端只读取本机状态，不联网检查发行版、不创建任务、不写 ledger。脚本只采纳合法脚本版本，安装入口固定为当前已配对 origin 的 `/integrations/peach-jav.user.js`，应用入口为该 origin 的 `/settings/maintenance#releaseUpdates`。

独立检查固定请求 `https://update.sleazyfork.org/scripts/600821/Peach%20%C2%B7%20JAV%20%E5%85%A5%E5%BA%93.meta.js`，不带 Bearer、Cookie、来源站地址或影片身份。响应最大 128,000 字符，必须包含唯一默认 `@name`，值为 `Peach Userscript` 或 0.6.3 之前的 `Peach · JAV 入库`，以及`@namespace https://github.com/peach-mitao/peach-userscript` 与三段数字版本。只解析元数据区，不执行返回内容，也不采纳返回的安装地址；安装动作固定打开 [Sleazy 发布页](https://sleazyfork.org/zh-CN/scripts/600821)。跨域响应与重定向均拒绝。

更新请求通过 `GM_xmlhttpRequest` 的 `anonymous` 模式发送；15 秒看门狗到期后调用 `abort()`。自动检查尝试时间与成功结果分别保存在 `peach.jav.update-attempted-at` 和 `peach.jav.updates`，自动尝试间隔至少 24 小时。页面隐藏或退出中止未完成请求；恢复可见时读取已保存结果，并在间隔到期时检查。手动检查独立于此间隔，失败保留明确错误与重试入口。

`peach.jav.installed-version` 只从本机实际运行实例的编译版本与 `GM_info.script.version` 更新，不从发行检查结果写入。实例保留自己的运行版本，监听 GM 安装标记与结果变化；安装标记高于运行版本时提示刷新。记录在同页重复注入的去重判断之前写入。新发行版提示安装，已安装版提示刷新，两个状态互不替代。

## 本机错误取证

`POST /api/jav-browser/errors` 使用同一专用令牌与 `{events:[...]}` 请求体；每条仅包含 UUID `id`、ISO 时间 `at`、`kind`、`operation`、站点清单标识 `site`、番号 `code`、`elapsed_ms`、HTTP `status` 与 `script_version`。`kind` 为 `timeout`、`network`、`abort`、`http`、`invalid_response` 或 `client_exception`，`operation` 为 `GET`、`POST` 或 `IDENTIFY`。商品号识别尚未确定番号时 `code` 为空。

脚本不提交原始异常、完整来源地址、Cookie、令牌或页面正文。服务端每批最多 10 条、16 KiB，每分钟最多 20 条；响应 `{recorded:数量}`，同一分钟内重复 UUID 返回 0。日志仅写入当前 Peach 本机并进入诊断包，不创建下载或写入账本。

错误在 GM 存储最多保留 20 条、7 天，只补报至原 Peach 地址。单次日志请求超时 5 秒、尝试间隔至少一分钟，失败不递归记录；后续业务请求成功时可以补报待发送记录。旧 Peach 不支持该端点时不影响添加或查询。

## 查询作品状态

`GET /api/jav-browser/people?codes=SSIS-057,ABP-616` 使用同一专用令牌，最多 50 个番号；返回 `{ok:true,source:"local-cache",items:{番号:[{id,name,avatar?}]}}`。人物来自本地馆藏关系与已保存的发现元数据，排除已登记男优。可选 `avatar` 仅由已安装的实体头像在内存缩为 64×64 JPEG 后编码为 data URL；没有头像时不包含该字段，名字由客户端生成灰底首字母。没有人物资料时对应数组为空。

人物端点不调用来源 API、不抓取封面、不初始化会恢复外站任务的元数据服务。冷缺失直接返回空结果，已有服务则只读取 `peek`，未初始化时只读快照文件。查询失败与正常无资料分别提示，不影响番号选择。旧 Peach 缺少此端点时保留资料未取得提示。

`GET /api/jav-browser?code=SSIS-057` 仅查询状态。首次识别、请求结果不确定和已提交任务的按钮操作均使用查询。查询请求不带来源页面或令牌查询参数。

## 添加任务

`POST /api/jav-browser` 使用 `Content-Type: application/json`，请求体为：

```json
{"code":"SSIS-057","source_url":"https://javdb.com/v/opaque123"}
```

| 字段 | 内容 |
| --- | --- |
| `code` | 单个明确番号，由 Peach 最终校验并规范化 |
| `source_url` | 来源 HTTPS 页面的 origin、路径与允许的作品参数，不带片段、其他查询参数、Cookie 或页面正文 |

同域及登记域名的子域符合站点匹配规则。JavLibrary 允许 `v`，FANZA / DMM 允许 `id`，色花堂允许 `tid`；参数值必须唯一且匹配 `[A-Za-z0-9_-]{1,100}`。色花堂的 `mod=viewthread` 不属于保留参数。Peach 服务端独立检查来源 URL 和允许的参数，具体接受范围以部署版本自带的站点快照为准。

## 响应与恢复

普通网页的主动批量添加不发送网页地址，采用 `{"code":"SSIS-057","manual":true}`。`manual` 必须是布尔值 `true`，不能同时携带非空 `source_url`；Peach 仍按 `code_key` 校验番号，并复用同一队列、幂等和令牌检查。每个番号是独立请求，列表不触发服务端整页抓取。部署版本需支持此协议；不支持时保留失败回执，不自动改成来源添加或重复提交。

成功响应必须为 JSON，包含 `ok: true`、与请求番号一致的 `code` 和已知 `state`。`message` 由服务端提供，脚本使用自己的状态文案。

可选 `stage: "submitting"` 表示远端提交正在进行。可选 `download` 仅含 `state`、`label`、`phase`、0–1 的实际 `progress` 或 `null`、`postprocess_state`、`postprocess_label` 和 `updated_at`。`phase` 为 `download`、`ingest` 或 `organize`，由真实任务里程碑确定。整体进度覆盖排队、搜索、下载、入库、整理五个阶段，完成阶段打勾、当前阶段高亮；下载百分比仅在下载段填充，其他阶段依据状态推进，不计算预计总耗时百分比。百分比代表后台最近一次网盘对账结果，不按时间插值。已入库但整理仍为 `pending`、`queued` 或 `running` 时继续有限轮询；整理完成后停止，未请求的整理显示跳过。连接异常保留最近一次确认的阶段，没有确认状态时全部待处理。

| `state` | 脚本行为 |
| --- | --- |
| `idle` | 允许主动添加 |
| `queued`、`searching`、`submitted` | 查询进度，不重复提交 |
| `ingested`、`owned` | 显示完成状态，添加按钮禁用 |
| `failed`、`no_match` | 允许用户主动重试 |

队列状态每 2 秒查询一次，最多追加 30 次，轮询总预算 120 秒。达到上限后保留查询按钮。网络超时、401 / 403、非成功 HTTP、未知状态、无效 JSON 和番号不匹配都保留查询入口。请求结果不确定时不会自动重复 POST。

页面跳转会隔离旧响应；重复执行脚本只注入一次。任务取消在 Peach 活动页执行。实际云下载和入库状态以 Peach 为准。
