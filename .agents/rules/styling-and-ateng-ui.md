---
trigger: always_on
description: "ateng-solid-admin-web TailwindCSS v4（禁用 Preflight）与 Element Plus / ateng-ui 混合样式及组件接入守则"
---

# TailwindCSS + Element Plus / `ateng-ui` 混合样式与组件接入守则 (styling-and-ateng-ui.md)

> **作用域**：`ateng-solid-admin-web` 全量界面、布局壳、公共组件与主题切换开发。

---

## 1. TailwindCSS（禁用 Preflight）配置与边界铁律

1. **TailwindCSS v4（`@tailwindcss/vite`）严禁引入 Preflight**：
   - Tailwind 默认 Preflight 会清除 `button` 背景、标题 Margin 及 `svg` 盒模型对齐，与 Element Plus 及 `@atengk/element-plus/theme-pro.css` 存在直接冲突；
   - 本项目锁定 **TailwindCSS v4 + `@tailwindcss/vite`**，在全局样式入口（`src/styles/main.css`）仅显式导入 `@import "tailwindcss/theme.css";` 与 `@import "tailwindcss/utilities.css";`，**绝对禁止引入 `tailwindcss/preflight.css` 或总入口 `@import "tailwindcss";`**。
2. **样式导入顺序与覆盖防护**：
   - 样式导入顺序：`element-plus/dist/index.css`、`element-plus/theme-chalk/dark/css-vars.css` ➔ `@atengk/element-plus/style.css` ➔ `@atengk/element-plus/theme-pro.css` ➔ Tailwind v4 `theme.css` / `utilities.css`。
3. **语义化令牌与暗黑模式**：
   - 暗黑模式声明 `@custom-variant dark (&:where(.dark, .dark *));`，跟随根节点 `html.dark` 自动切换（配合 `@atengk/element-plus` `initTheme` / `setThemeColor`）；
   - 通过 Tailwind v4 `@theme` 将扩展色板与圆角映射到 `var(--el-*)` / `var(--at-*)`（例如 `--color-page: var(--el-bg-color-page)`、`--color-card: var(--el-bg-color-overlay)`、`--color-main: var(--el-text-color-primary)`、`--color-subtle: var(--el-border-color)`）；
   - **禁止**使用 Tailwind 工具类魔改 `.el-*` 或 `.at-*` 组件内部 DOM 节点样式。

---

## 2. `ateng-ui` 核心组件接入约定

1. **菜单图标解析（等待底座 `ateng-ui#365` 通用扩展点）**：
   - `AtengProLayout` 内置 `ProMenuItemNode` 当前对 `string` 图标仅渲染 `<i :class="itemIcon" />`；
   - 遵循底层硬门禁零补丁铁律，待 `atengk/ateng-ui#365` 在底座提供通用 `iconResolver` 回调或插槽透传增强并正式发版后，前端仅通过标准配置式回调对接 `@element-plus/icons-vue` 图标解析，禁止在上层编写篡改后端菜单数据结构的临时绕过补丁。
2. **`AtengProLayout` + `AtengTabsNav` + `KeepAlive` 联动**：
   - 使用 `@atengk/vue` 的 `useTabsNav` 同步路由守卫与页签列表；
   - 主体 `<router-view v-slot="{ Component, route }">` 外层包裹 `<KeepAlive :include="cachedRouteNames">`，由路由 `meta.keepAlive` 与页签关闭/刷新事件驱动缓存更新。
3. **表格与分页零样板协同**：
   - 统一采用 **`usePagination`（`@atengk/vue`）+ `AtengQueryForm` + `AtengTable`** 三件套；
   - 删除/批量操作与提交按钮统一绑定 `useIdempotent` 或 `v-idempotent` 防连点重放。
4. **字典与枚举双轨加载**：
   - 应用启动或登录后通过 `DictManager`（`@atengk/element-plus`）注册 `provider` / `batchProvider`：支持按前缀或映射规则分别对接动态字典 `/admin/system/dict/data/type/...` 与静态枚举 `/admin/system/enums/...`；
   - 列表状态展示用 `AtengDictTag`，表单录入用 `AtengDictSelect` / `AtengDictRadio` / `AtengDictCheckbox`。
5. **导入导出与验证码**：
   - 登录页图形验证码使用 `<AtengCaptcha type="image" />` 配合 `<el-input>` 组合；
   - 用户等 Excel 导入使用 `AtengExcelFeedback`，导出使用 `AtengExcelExport`（底层依托 `@atengk/core` Blob 双态错误嗅探）。
