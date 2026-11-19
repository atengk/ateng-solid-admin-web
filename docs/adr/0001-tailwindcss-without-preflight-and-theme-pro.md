# ADR-0001: TailwindCSS（禁用 Preflight）+ Element Plus / `theme-pro` 混合样式架构

- **状态**：`Accepted`
- **日期**：2026-11-18
- **作者**：Ateng
- **关联范围**：样式入口、Tailwind 配置、业务页面与暗黑模式

---

## 1. 背景与冲突评估

`@atengk/element-plus` 自带完整的企业级皮肤引擎 `theme-pro.css`，基于 `--el-*`、`--at-*` CSS 变量与 `html.dark` Slate 暗黑模式实现，但不提供页面布局实用工具类（Flex/Grid/Spacing）。

若直接按默认方式引入 TailwindCSS：
- Tailwind 的 Preflight 基础样式重置会清空 `<button>` 默认背景、调整 `h1~h6` 边距及修改 `svg`/`img` 为 `display: block`，极易破坏 Element Plus 与 `@atengk/element-plus` 组件外观；
- 若颜色直接用 Tailwind 默认调色盘（如 `bg-white`、`text-gray-700`），切换 `html.dark` 暗黑模式或切换 `theme-pro` 主题预设色时将产生色值撕裂。

---

## 2. 核心决策

1. **采用“TailwindCSS（关闭 Preflight）+ `theme-pro` 变量映射”混合方案**：
   - 在 Tailwind 配置中强制禁用 Preflight（Tailwind v3 设 `corePlugins: { preflight: false }`；v4 跳过 `preflight.css` 仅加载 theme 与 utilities）；
   - 全局样式 Reset 与滚动条统归 Element Plus + `@atengk/element-plus/theme-pro.css` 管理。
2. **职责边界清晰二分**：
   - Tailwind 仅用于页面级与区块级布局（`flex`、`grid`、`gap-*`、`p-*`、`m-*`、响应式隐藏/展示）；
   - **严禁**使用 Tailwind 工具类魔改 `.el-*` 或 `.at-*` 组件内部 DOM 节点；组件皮肤由 `theme-pro` 与 `--el-*`/`--at-*` 控制。
3. **暗黑模式与语义色值唯一通道**：
   - 配置 `darkMode: 'class'`，跟随根节点 `html.dark`；
   - Tailwind 颜色别名映射至 `var(--el-*)` / `var(--at-*)` 语义 CSS 变量，全项目禁止硬编码 Hex 色值。

---

## 3. 后果与权衡

- **优点**：兼具页面开发效率、AI 生成准确率以及 Element Plus / `ateng-ui` 工业级主题完整性。
- **代价**：新增开发者必须知晓“严禁开启 Preflight”及“禁止用 Tailwind 原生硬色值替代 `--el-*` 变量”两项约束。
