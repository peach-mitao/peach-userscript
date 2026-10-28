<p align="center"><img src="https://peach.video/assets/peach-logo-192.webp" alt="Peach" width="88"></p>

# Peach 用户脚本

从支持的页面向自己的 Peach 提交影片编号。

[Peach 应用](https://github.com/peach-mitao/peach) · [站点规则](https://github.com/peach-mitao/peach-userscript/blob/main/docs/SITES.md) · [反馈问题](https://github.com/peach-mitao/peach-userscript/issues)

## 功能

- **识别与添加**：在支持的详情页识别编号，也可扫描当前页面，选择几部或全部添加。
- **查看状态**：核对影片是否已入库、查看出演者，排队、搜索、下载和入库进度自动刷新。关闭来源页面后，Peach 继续处理。
- **失败时换磁力**：区分是磁力还是网盘出了问题，磁力失效时可以换一个磁力。
- **收起页面入口**：拖动桃子图标，选择显示范围，或彻底关闭图标。脚本菜单仍可打开设置、检测更新。
- **跟随 Peach 外观**：与已配对的 Peach 同步深浅色和强调色。

## 配置

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)，点击上方的**安装此脚本**。Chrome、Edge 等 Chromium 浏览器还需在 Tampermonkey 扩展详情中开启「允许用户脚本」或开发者模式，见 [Tampermonkey 权限设置说明](https://www.tampermonkey.net/faq.php?locale=zh_CN&q=Q209)。
2. 在 Peach 配置下载渠道、目标目录与挂载路径。
3. 在 Peach 的下载设置中启用浏览器添加，并生成专用令牌。
4. 在脚本设置填写 Peach 地址和令牌，允许脚本连接该地址。

浏览器须信任 Peach 的 HTTPS 证书；HTTP 仅支持回环地址。支持 FANZA / DMM、MGS、JavDB、JavBus、MissAV 等站点。页面候选番号在提交前由 Peach 校验。

## 更新

**检测更新**会比较 Sleazy 发行版与已配对 Peach 随附的脚本，打开较新的来源；同版本优先 Sleazy。安装由脚本管理器确认，已打开的页面可能需要刷新。

整页批量提交与本地女优资料需要 Peach 提供对应接口，旧安装包可能需要更新；安装脚本不会升级 Peach 本身。[双语版本历史](https://github.com/peach-mitao/peach-userscript/blob/main/CHANGELOG.md)从 **0.3.0 — 初始发布**起记录变化与兼容说明。

## 隐私

专用令牌只保存在脚本管理器中。脚本提交编号与过滤后的来源地址，不提交来源站 Cookie、播放器地址或整页正文；网盘凭据由 Peach 管理。Sleazy 更新检查不携带 Peach 令牌或当前浏览页面的身份。

## 许可证

[AGPL-3.0-or-later](https://github.com/peach-mitao/peach-userscript/blob/main/LICENSE)。来源和依赖说明见 [NOTICE](https://github.com/peach-mitao/peach-userscript/blob/main/NOTICE.md)。
