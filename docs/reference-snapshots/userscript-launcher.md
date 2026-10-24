# 用户脚本收起入口参考

取证日期：2026-10-25。本文件是人工取证笔记，不作为上游原文登记或自动接受更新的快照。

## 实测

- [Transitions.dev Library](https://transitions.dev/library.html) 的 Dropdown menu morph：DOM 使用 `.p20-morph`、`data-open` 和独立按钮，关闭时为 40×40 圆形入口，定位在容器右下角。实际点击后 `data-open` 为 `true`。闭合宽、高、圆角的 CSS 过渡为 250ms、`cubic-bezier(0.22, 1, 0.36, 1)`；展开为 350ms、`cubic-bezier(0.34, 1.25, 0.64, 1)`。本记录基于页面 DOM、computed style 与可读 CSS 规则。
- 同一页面提供 Card resize 和 Panel reveal 的公开演示；构建器页面需要桌面布局，未取得可直接导入本项目的生产组件源码。
- [Libraries.dev Gooey](https://libraries.dev/gooey) 的官方用法以 React `Liquid`、`Liquid.Item` 组合多个圆形元素，包含位移、融合和延迟参数。该库的运行效果、打包成本与 Peach 的联合验收未取得。

## Peach 的采用范围

采用右下角锚点固定、面板与小入口可逆切换的交互原则。控件、箭头、关闭图形、颜色与标志来自 Peach 现有代码；保留紧凑横向进度。折叠显示标题与当前状态，隐藏显示 Peach 标志，恢复时仅查询已存在的任务。

不移植演示站的宽高变形、液态融合、模糊、弹簧配置或源码。显现采用 Peach 生产 Collapse 的 200ms 时长与轻量透明度、位置变化，支持连续切换、焦点恢复和减少动效；未引入 React、Motion 或 Gooey 运行依赖。
