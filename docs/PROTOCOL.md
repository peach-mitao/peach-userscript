# Peach 浏览器添加协议

脚本使用 Peach 现有 `/api/jav-browser` 接口。Peach 是独立服务，负责校验番号、验证来源、搜索磁力、选择下载渠道、保存队列和入库。脚本不接触网盘凭据，也不从页面直接采纳磁力。

## 配对与传输

在 Peach 的浏览器添加设置中启用并生成专用令牌。脚本管理器将 Peach origin 和令牌保存在 `peach.jav.base` 与 `peach.jav.token`，所有请求通过 `GM_xmlhttpRequest` 发往用户配置的 Peach origin。

配对信息使用 JSON：`{"peach_pairing":1,"base":"https://peach.example.com","token":"专用令牌"}`。Peach 在令牌签发后可复制该信息；用户脚本在地址输入框粘贴时校验版本与字段，按配置的相同判据校验后填入表单，不自动保存。载荷上限 4,096 字符，不包含网盘凭据或来源站数据。

## 安装检测

脚本只在固定路径 `/integrations/peach-userscript-bridge` 的同源子框架内响应检测，HTTPS 支持自托管主机，HTTP 仅匹配本机。Peach 页面发出 `{type:"peach-userscript:probe",nonce}`，脚本校验父窗口、来源与 UUID nonce 后回报 `{type:"peach-userscript:ready",protocol:1,nonce,version,paired}`。`paired` 只表示 GM 存储中的有效地址等于当前 origin，不证明令牌仍有效；不回报地址或令牌。普通来源站点的子框架不运行添加逻辑。

## 发行平台商品号

`GET /api/jav-browser/identify?source_url=<已净化的详情地址>&code=<页面明确番号>` 使用同一专用令牌，返回与状态查询相同的字段。`code` 可省略；有厂家番号或品番字段时提交，用于核对商品号与页面身份。字段不一致返回 400。Peach 从登记的 DMM、MGS 详情路径提取商品号：DMM 复用来源解析器的 CID 形态，目录数字头不进入番号；MGS 保留三位发行前缀。明确商品番号的尾字母属于身份，不作为字幕标记剥除。识别不搜索来源、不写账本、不创建下载。脚本不维护商品号转换表。

发行平台在 `jav-sites.json` 声明 `identity: "peach"`。两端从同一详情正则的第一捕获组或唯一作品参数取得商品号；域名、镜像与详情路径均以该清单为准。

脚本只读取详情表中的「メーカー品番」「品番」等明确身份字段，不把「配信品番」与厂家番号混为一谈。多个字段矛盾时阻止添加；请求保留尾字母，响应须与所提交字段一致。通用提取覆盖 KIRARI 的 `MKBD-S`／`MKD-S` 和二至四位序号的日期式番号。HTTP 404／405 提示升级 Peach，429 提示稍后查询，5xx 提示服务故障；不将这些故障显示为番号缺失。

地址接受 HTTPS；HTTP 仅接受 `localhost`、`127.0.0.1`、`[::1]`。地址须为 origin，不能带用户名、密码、路径、查询或片段。令牌不能为空，最多 256 字符，不接受换行。请求使用 `Authorization: Bearer <专用令牌>`，`Accept: application/json`，`anonymous: true`，单次超时 15 秒。`@connect *` 用于自选 Peach 地址；脚本的请求目标始终来自有效配置。

## 查询状态

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

成功响应必须为 JSON，包含 `ok: true`、与请求番号一致的 `code` 和已知 `state`。`message` 由服务端提供，脚本使用自己的状态文案。

| `state` | 脚本行为 |
| --- | --- |
| `idle` | 允许主动添加 |
| `queued`、`searching`、`submitted` | 查询进度，不重复提交 |
| `ingested`、`owned` | 显示完成状态，添加按钮禁用 |
| `failed`、`no_match` | 允许用户主动重试 |

队列状态每 2 秒查询一次，最多追加 30 次，轮询总预算 120 秒。达到上限后保留查询按钮。网络超时、401 / 403、非成功 HTTP、未知状态、无效 JSON 和番号不匹配都保留查询入口。请求结果不确定时不会自动重复 POST。

页面跳转会隔离旧响应；重复执行脚本只注入一次。任务取消在 Peach 活动页执行。实际云下载和入库状态以 Peach 为准。
