# ADR-0001: TailwindCSS（禁用 Preflight）+ Element Plus / 上层自有令牌混合样式架构

- **状态**：`Accepted`（`2026-11-24` 第一阶段视觉定稿修订）
- **日期**：2026-11-18（修订：`2026-11-24`）
- **作者**：Ateng
- **关联范围**：样式入口、Tailwind 配置、`Precision Slate & Cobalt` 令牌体系、业务页面与暗黑模式

---

## 1. 背景与冲突评估

`@atengk/element-plus` 自带组件功能样式 `style.css` 及默认企业级皮肤 `theme-pro.css`（基于 `--el-*`、`--at-*` CSS 变量与 `html.dark`），但不提供页面布局实用工具类（Flex/Grid/Spacing）。

在第一阶段 PRD 与交互原型评审（`atengk/ateng-solid#4`）中确认：
1. Tailwind 的 Preflight 基础样式重置会清空 `<button>` 默认背景、调整 `h1~h6` 边距及修改 `svg`/`img` 为 `display: block`，极易破坏 Element Plus 与 `@atengk/element-plus` 组件外观；
2. 若直接沿用 `theme-pro.css` 默认靛紫视觉皮肤，难以建立 `ateng-solid` 独立辨识度；而若在页面层直接写死 Tailwind 默认调色盘（如 `bg-white`）或 Hex 色值，又会破坏 `html.dark` 暗黑模式与统一主题切换。

---

## 2. 核心决策

1. **采用“TailwindCSS v4（关闭 Preflight）+ `Precision Slate & Cobalt` 自有令牌覆写”混合方案**：
   - 在 Tailwind 配置中强制禁用 Preflight（v4 跳过 `preflight.css` 仅加载 `theme.css` 与 `utilities.css`）；
   - 全局组件功能样式保留 `element-plus` 与 `@atengk/element-plus/style.css`，**脱离 `theme-pro.css` 默认靛紫视觉皮肤**（不引入 `theme-pro.css` 或由 `src/styles/tokens.css` 全面覆写），统一由 `Precision Slate & Cobalt`（Light `#1D4ED8` / Dark `#3B82F6` 深钴蓝 + 冷石白画布）定义 `--solid-*` 令牌并双向映射至 `--el-*` 与 Tailwind `@theme`。
2. **职责边界清晰二分**：
   - Tailwind 仅用于页面级与区块级布局（`flex`、`grid`、`gap-*`、`p-*`、`m-*`、响应式隐藏/展示）；
   - **严禁**使用 Tailwind 工具类魔改 `.el-*` 或 `.at-*` 组件内部 DOM 节点；
   - 继续 100% 复用 `@atengk/core`、`@atengk/vue` 无头状态机及 `@atengk/element-plus` 功能组件契约。
3. **暗黑模式与语义色值唯一通道**：
   - 声明 `@custom-variant dark (&:where(.dark, .dark *));`，跟随根节点 `html.dark`；
   - Tailwind 颜色别名映射至 `var(--solid-*)` / `var(--el-*)` 语义 CSS 变量，全项目禁止硬编码 Hex 色值。

---

## 3. 后果与权衡

- **优点**：既拥有独立克制的 `Precision Slate & Cobalt` 企业基础设施视觉识别，又保留 Tailwind 布局效率与 Element Plus / `ateng-ui` 全套功能组件与无障碍对比度保障。
- **代价**：`Spec 1 / Spec 2` 正式编码启动时须同步将当前脚手架 `src/styles/main.css` 从 `@import '@atengk/element-plus/theme-pro.css'` 切换为导入 `Precision Slate & Cobalt` 令牌表，并持续遵守“禁 Preflight”与“禁硬编码 Hex”。
