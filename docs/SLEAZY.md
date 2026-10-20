# Peach · JAV 入库

本脚本需配套 [Peach](https://github.com/peach-mitao/peach) 使用。识别影片页的番号，交给自己的 Peach 搜索磁力、云下载并加入馆藏。

## 使用

1. 安装 Tampermonkey 和本脚本。
2. 在「Peach 配置 → 下载渠道 → 浏览器添加 JAV」选择渠道并启用，将 Peach 地址与专用令牌填入脚本设置。
3. 打开影片详情页，使用页面中的添加按钮；无法自动识别时，选中一个完整番号，在脚本菜单选择「选中番号加入 Peach」。

需要已运行的 Peach 写入端，以及配置好的云下载账号和媒体库路径。首次连接时，允许脚本访问自己的 Peach 地址。

支持 FANZA / DMM、MGS、JavDB、JavBus、MissAV 等站点及已登记镜像，见[完整站点清单](https://github.com/peach-mitao/peach-userscript/blob/main/docs/SITES.md)。

馆藏已有或正在下载的影片会显示现有状态。添加后可关闭来源页面，在 Peach 活动页查看下载与入库进度。

[项目与问题反馈](https://github.com/peach-mitao/peach-userscript)
