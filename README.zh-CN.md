<p align="center"><img src="https://peach.video/assets/peach-logo-192.webp" alt="Peach" width="88"></p>

# Peach 用户脚本

从支持的页面向自己的 Peach 提交影片编号。

[安装脚本](https://raw.githubusercontent.com/peach-mitao/peach-userscript/main/dist/peach-jav.user.js) · [Peach 应用](https://github.com/peach-mitao/peach) · [站点规则](docs/SITES.md) · [English](README.md)

[![CI](https://img.shields.io/github/actions/workflow/status/peach-mitao/peach-userscript/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white)](https://github.com/peach-mitao/peach-userscript/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue?logo=gnu&logoColor=white)](LICENSE)

## 功能

- **识别与添加**：在支持的详情页识别编号，也可扫描页面，选择几部或全部添加。
- **查看状态**：核对影片是否已入库或正在队列中。
- **交给 Peach 继续处理**：任务由 Peach 保存，关闭来源页面后仍继续云下载和入库。
- **跟随 Peach**：同步深浅色与强调色，移动图标并选择显示范围；脚本菜单保留设置和检测更新入口。

## 配置

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 和[用户脚本](https://raw.githubusercontent.com/peach-mitao/peach-userscript/main/dist/peach-jav.user.js)。Chrome、Edge 等 Chromium 浏览器还需在 Tampermonkey 扩展详情中开启「允许用户脚本」或开发者模式，见 [Tampermonkey 权限设置说明](https://www.tampermonkey.net/faq.php?locale=zh_CN&q=Q209)。
2. 在 Peach 配置下载渠道、目标目录与挂载路径。
3. 在 Peach 的下载设置中启用浏览器添加，并生成专用令牌。
4. 在脚本菜单填写 Peach 地址和令牌，允许脚本连接该地址。

浏览器须信任 Peach 的 HTTPS 证书；HTTP 仅支持回环地址。支持范围由[站点规则](docs/SITES.md)维护，登记不代表已取得真实站点与完整下载流程的联合验收。

## 隐私

专用令牌只保存在脚本管理器中。脚本提交编号与过滤后的来源地址，不提交来源站 Cookie、播放器地址或整页正文；网盘凭据由 Peach 管理。

## 开发

[构建与发布](docs/DEVELOPMENT.md) · [API 协议](docs/PROTOCOL.md) · [复用说明](docs/REUSE.md) · [反馈问题](https://github.com/peach-mitao/peach-userscript/issues)

## 许可证

[AGPL-3.0-or-later](LICENSE)。来源和依赖说明见 [NOTICE](NOTICE.md)。
