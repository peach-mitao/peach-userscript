# 用户脚本构建与发布

以下命令在仓库根目录执行；安装与配对见 [README](../README.zh-CN.md)。

## 构建与验证

使用 [Node.js 24 LTS](https://nodejs.org/en/about/previous-releases)。构建与基础单测仅使用 Node 内置模块，无运行依赖。浏览器回归的唯一开发依赖为 `playwright-core`。

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

`dist/peach-jav.user.js` 可直接安装，`dist/jav-sites.json` 是版本化站点快照，`dist/release.json` 记录脚本版本与两个文件的 SHA256，`dist/SHA256SUMS` 用于校验制品。构建不写时间戳、不访问网络。CI 检查已提交制品与源文件一致，并上传制品。

Peach 主仓库消费同一次发布的脚本与站点快照，服务端继续独立验证来源域名和作品参数。维护脚本或站点时在本仓库修改、构建、验证，递增版本后同步制品；协议说明见 [Peach API](PROTOCOL.md)。[Sleazy 发布说明](SLEAZY.md) 可用于发布页面。

需要交给其他项目时，可运行 `npm run export -- --output <制品目录>`，导出这四个文件。导出前会核对源与产物一致；相同内容可重复导出，已有不同内容会被拒绝，防止覆盖混合版本。

同步到 Peach 隔离工作树时，使用 `node scripts/export-peach.mjs --target <Peach隔离工作树> --commit <本仓库40位提交SHA>`。默认仅预览，添加 `--apply` 才写入 `web/integrations/` 中的脚本、站点快照与 `jav-userscript-release.json` 来源记录。工具校验工作树注册关系、Peach 项目标识、发布清单与 hash，不访问网络、不执行 Git 或服务命令。

## 站点与镜像候选

[候选同步工具](MIRROR_REVIEW.md) 从人工选定并固定 SHA256 的 Sleazy 用户脚本元数据中，提取显式 `@match` / `@include` / `@connect` 域名，辅助发现镜像和缺少的源站。仓库提供 6 个不含第三方实现的元数据快照，支持离线重放。所有候选结果保持待复核；工具不执行远程代码，也不改 `jav-sites.json`。没有自动站点同步或定时任务。
