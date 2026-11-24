---
trigger: always_on
description: "ateng-solid-admin-web TailwindCSS v4（禁用 Preflight）、Precision Slate & Cobalt 令牌与 ateng-ui 接入守则"
---

# TailwindCSS + Element Plus / `ateng-ui` 混合样式与组件接入守则 (styling-and-ateng-ui.md)

> **作用域**：`ateng-solid-admin-web` 全量界面、布局壳、公共组件与主题切换开发。
> **视觉真源**：`Precision Slate & Cobalt` 令牌与方案 A 布局定义于根仓 `docs/specs/prd/design-system.md` 与 `00-overview-and-ux-standards.md`（2026-11-24 评审定稿）。

---

## 1. TailwindCSS（禁用 Preflight）与 `Precision Slate & Cobalt` 令牌铁律

1. **TailwindCSS v4（`@tailwindcss/vite`）严禁引入 Preflight**：
   - Tailwind 默认 Preflight 会清除 `button` 背景、标题 Margin 及 `svg` 盒模型对齐，与 Element Plus 及 `@atengk/element-plus/style.css` 存在直接冲突；
   - 本项目锁定 **TailwindCSS v4 + `@tailwindcss/vite`**，在全局样式入口（`src/styles/main.css`）仅显式导入 `@import "tailwindcss/theme.css";` 与 `@import "tailwindcss/utilities.css";`，**绝对禁止引入 `tailwindcss/preflight.css` 或总入口 `@import "tailwindcss";`**。
2. **脱离 `theme-pro.css` 默认皮肤，导入顺序与令牌覆盖**：
   - 样式导入顺序：`element-plus/dist/index.css`、`element-plus/theme-chalk/dark/css-vars.css` ➔ `@atengk/element-plus/style.css` ➔ `Precision Slate & Cobalt` 自有设计令牌表（`src/styles/tokens.css`）➔ Tailwind v4 `theme.css` / `utilities.css`；
   - 第一阶段确立不绑定 `@atengk/element-plus/theme-pro.css` 默认靛紫视觉皮肤，转由 `src/styles/tokens.css` 定义 `--solid-*` 语义令牌并双向映射至 Element Plus `--el-*` 与 Tailwind `@theme`（保持 `@atengk/element-plus` 组件功能样式与 `@atengk/core`/`@atengk/vue` 无头状态机 100% 复用）。
3. **语义化令牌、等宽数字与暗黑模式**：
   - 暗黑模式声明 `@custom-variant dark (&:where(.dark, .dark *));`，跟随根节点 `html.dark` 自动切换（Light `#1D4ED8` / Dark `#3B82F6` 深钴蓝焦点）；
   - 通过 Tailwind v4 `@theme` 将扩展色板与圆角映射到 `var(--solid-*)` / `var(--el-*)`；严禁在页面或组件硬编码 Hex 色值，严禁使用 Tailwind 工具类魔改 `.el-*` 或 `.at-*` 组件内部 DOM 节点结构；
   - 表格 ID、统计数值、时间戳、IP 与分页数字统一附加 `font-variant-numeric: tabular-nums`。

---

## 2. `ateng-ui` 核心组件接入约定（对齐 `@atengk/*@1.1.0` 实测）

1. **菜单图标解析（`ateng-ui#365` 已随 `1.1.0` 就绪）**：
   - `AtengProLayout` / `ProMenu` 已内置 `iconResolver` 回调扩展点，前端直接通过 `iconResolver` 将后端菜单 `icon` 字符串映射为 `@element-plus/icons-vue` 组件，禁止篡改后端菜单数据结构。
2. **方案 A `AdminLayout` + `AtengTabsNav` + `<KeepAlive>` 联动**：
   - 使用 `@atengk/vue` 的 `useTabsNav` 同步路由守卫与页签列表，主体 `<router-view v-slot="{ Component, route }">` 包裹 `<KeepAlive :include="cachedRouteNames">`；
   - 注意 `AtengTabsNav` 单标签 `close` 仅派发 `tabClose`，批量关闭命令同时派发 `tabClose` 与 `update:tabs`，须由容器收口至 `useTabsNav` 单一数据源；`AtengProLayout` `'mix'` 模式 `headerRight` 兜底（**`U5` `ateng-ui#369`**）已在上游 `dev` 关单，本地 `yalc` 已接入验证（正式合入待发版锁版）。
3. **表格、查询表单与抽屉弹窗协同**：
   - 统一采用 **`usePagination`（`@atengk/vue`）+ `AtengQueryForm` + `AtengTable`**；当 `AtengQueryForm` 嵌套在已传 `:pagination` 的 `<AtengTable #query>` 内时，表单仅传 `:model="pagination.query" :search-loading="pagination.loading"`，避免重置触发双重请求；
   - 树形表格直接向 `<AtengTable>` 透传 `:tree-props`、`row-key="id"`、`:show-pagination="false"`；
   - `AtengDrawer` `#footer` 作用域参数（**`U6` `ateng-ui#370`**）与 `AtengIconSelect` `#icon`/`#footer` 透传（**`U7` `ateng-ui#371`**）已在上游 `dev` 关单，本地 `yalc` 已接入验证（正式合入待发版锁版）。
4. **字典与枚举双轨加载**：
   - 通过 `DictManager`（`@atengk/element-plus`）注册 `provider` / `batchProvider` 分别对接动态字典 `/admin/system/dict/data/type/...` 与静态枚举 `/admin/system/enums/...`；
   - 前端枚举适配层须将后端 `OptionItem`（`{ code, label, disabled, extra }`）映射为 `DictItem`（`{ label, value, ... }`）并将 `'default'` `tagType` 归一化为 `''`；列表用 `AtengDictTag`，表单用 `AtengDictSelect` / `AtengDictRadio` / `AtengDictCheckbox`。
5. **导入导出、上传与验证码**：
   - 登录页图形验证码使用 `<AtengCaptcha type="image" :refresh="loadCaptcha" />`（注意 `refresh` 是 **Prop 回调**，非 `@refresh` 事件）；
   - 非分片上传使用 `<AtengUpload :http-request="..." />`（`1.1.0` 已支持 `httpRequest` 与 `inheritAttrs: false`）；
   - 导入错误反馈使用 `AtengExcelFeedback`（仅渲染 `rowNum`、`columnName`、`errorMessage` 3 列）；导出使用 `AtengExcelExport`（直传 `Blob` 自动提取 `Content-Disposition` 文件名 **`U8` `ateng-ui#372`** 已在上游 `dev` 关单，本地 `yalc` 已接入验证，正式合入待发版锁版）。
