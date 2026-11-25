# ADR-0001: TailwindCSS（禁用 Preflight）+ Element Plus / 上层自有令牌混合样式架构

- **状态**：`Accepted`（`2026-11-25` 令牌工程化与双主色驱动定稿修订）
- **日期**：2026-11-18（修订：`2026-11-24`、`2026-11-25`）
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

1. **采用“TailwindCSS v4（关闭 Preflight）+ 剥离 `theme-pro.css` + `Precision Slate & Cobalt` 自有令牌表”混合方案**：
   - 受益于 `ateng-ui#374` 将 `.at-loading-bar`、`AtengLoading` 与 `html.is-theme-switching` 防闪烁风暴样式下沉至 `@atengk/element-plus/style.css`，`src/styles/main.css` **彻底移除 `@import '@atengk/element-plus/theme-pro.css'`**；
   - `src/styles/main.css` 强制遵守 6 段导入序：`element-plus/dist/index.css` ➔ `element-plus/theme-chalk/dark/css-vars.css` ➔ `@atengk/element-plus/style.css` ➔ `./tokens.css` ➔ `tailwindcss/theme.css` ➔ `tailwindcss/utilities.css`（严禁引入 `tailwindcss/preflight.css` 或总入口 `@import 'tailwindcss'`）；
   - 由 `src/styles/tokens.css` 在 `:root`（Light 主色 `#1D4ED8` + 冷石白画布 `#F8FAFC`）与 `html.dark`（Dark 主色 `#3B82F6` + 暗石板 `#0B1120`/`#111827`）静态声明全套 `--solid-*` 语义令牌、Element Plus 1~9 级主色阶（`--el-color-primary*`）、画布/表面/边框/文字变量与 `--at-shadow-focus-ring`，并提供全局 `.tabular-nums` 等宽数字样式。
2. **职责边界清晰二分**：
   - Tailwind 仅用于页面级与区块级布局（`flex`、`grid`、`gap-*`、`p-*`、`m-*`、响应式隐藏/展示）；
   - **严禁**使用 Tailwind 工具类魔改 `.el-*` 或 `.at-*` 组件内部 DOM 节点；
   - 继续 100% 复用 `@atengk/core`、`@atengk/vue` 无头状态机及 `@atengk/element-plus` 功能组件契约。
3. **暗黑模式、双主色与防首屏闪烁（FOUC）唯一通道**：
   - 声明 `@custom-variant dark (&:where(.dark, .dark *));`，并在 `main.css` `@theme` 中将 `--color-brand`、`--color-canvas`、`--color-surface`、`--color-surface-subtle`、`--color-ink`、`--color-ink-secondary`、`--color-ink-muted`、`--color-border`、`--color-border-subtle` 等语义别名统一绑定至 `var(--solid-*)`，全站严禁硬编码 Hex 色值；
   - 复用 `@atengk/element-plus` `initTheme({ storageKey: 'solid-theme-mode', defaultMode: 'light', listenSystemPreference: true })` 接管 `light`/`dark`/`auto` 持久化、系统偏好监听与 `html.is-theme-switching` 防重绘风暴，**严禁向 `initTheme` 传入单一 `themeColor`**（`setThemeColor` 会通过内联 `style.setProperty` 覆写 CSS 变量，破坏 Light `#1D4ED8` / Dark `#3B82F6` 双主色切换）；
   - 在 `index.html` `<head>` 置入极简同步内联脚本，按同一 `solid-theme-mode` 键在首帧渲染前预补 `html.dark`，杜绝暗黑模式首屏白屏闪烁。

---

## 3. 后果与权衡

- **优点**：既拥有独立克制的 `Precision Slate & Cobalt` Light/Dark 双主色视觉识别，又零内联样式覆盖冲突，同时保留 Tailwind 布局效率、`ateng-ui` 防闪烁风暴与无障碍对比度保障。
- **代价**：`Spec 1` 编码时须同步升级当前骨架 `src/styles/main.css`（移除 `theme-pro.css`）、新增 `src/styles/tokens.css` 并在 `index.html` 加入防 FOUC 脚本；未来若二期开放租户级动态换肤再按需引入 `setThemeColor`。
