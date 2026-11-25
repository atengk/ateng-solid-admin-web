# TailwindCSS v4 + `Precision Slate & Cobalt` 令牌与 `ateng-ui` 接入守则 (styling-and-ateng-ui.md)

> **适用时机**：编写页面布局、主题样式、`src/styles/*`，或接入 `@atengk/element-plus` / `@atengk/vue` 核心组件前必读。
> **视觉真源**：`Precision Slate & Cobalt` 令牌与方案 A 布局定义于根仓 `docs/specs/prd/design-system.md` 与 `00-overview-and-ux-standards.md`（前端 ADR 见 [`docs/adr/0001-tailwindcss-without-preflight-and-theme-pro.md`](../adr/0001-tailwindcss-without-preflight-and-theme-pro.md)）。

---

## 1. TailwindCSS v4（禁用 Preflight）与自有令牌导入顺序

1. **严禁引入 Preflight**：本项目使用 TailwindCSS v4 + `@tailwindcss/vite`，在 `src/styles/main.css` 仅显式导入 `@import "tailwindcss/theme.css";` 与 `@import "tailwindcss/utilities.css";`，严禁导入 `tailwindcss/preflight.css` 或总入口 `@import "tailwindcss";`（Preflight 会清空 `button` 背景、标题边距与 `svg` 对齐，破坏 Element Plus 外观）。
2. **彻底移除 `theme-pro.css` 与 6 段固定导入序**：
   - 受益于 `ateng-ui#374` 将 `.at-loading-bar`、`AtengLoading`、`html.is-theme-switching` 迁入 `@atengk/element-plus/style.css`，`src/styles/main.css` **彻底移除 `@import '@atengk/element-plus/theme-pro.css'`**，严格按 6 段导入：
     1. `element-plus/dist/index.css`
     2. `element-plus/theme-chalk/dark/css-vars.css`
     3. `@atengk/element-plus/style.css`
     4. `./tokens.css`
     5. `tailwindcss/theme.css`
     6. `tailwindcss/utilities.css`
   - 由 `src/styles/tokens.css` 在 `:root`（Light `#1D4ED8`）与 `html.dark`（Dark `#3B82F6`）静态声明全套 `--solid-*`、Element Plus 1~9 级主色阶（`--el-color-primary*`）、画布/边框/文字变量与 `--at-shadow-focus-ring`；`main.css` `@theme` 将 Tailwind 语义色（`--color-brand`/`--color-canvas`/`--color-surface`/`--color-ink`/`--color-border` 等）统一指向 `var(--solid-*)`。
3. **语义色值、双主色与防首屏闪烁（FOUC）**：
   - Tailwind 仅负责页面/区块级布局与间距，严禁用 Tailwind 工具类魔改 `.el-*`/`.at-*` 内部 DOM；局部自定义样式必须 `<style scoped>`，禁全局 `!important`。
   - 暗黑模式声明 `@custom-variant dark (&:where(.dark, .dark *));`，由 `initTheme({ storageKey: 'solid-theme-mode', defaultMode: 'light', listenSystemPreference: true })` 驱动 `light`/`dark`/`auto` 与 `html.is-theme-switching`，**严禁向 `initTheme` 传入 `themeColor`**（会通过内联样式覆写 Light/Dark 双主色）；并在 `index.html` `<head>` 置入极简同步脚本预补 `html.dark` 防 FOUC。
   - 表格 ID、统计数字、时间戳、IP 与分页数字统一附加 `.tabular-nums`（`font-variant-numeric: tabular-nums`）。

---

## 2. `@atengk/*` 组件接入实测避坑速查（对齐后 `#373`–`#376` 基线）

1. **方案 A 布局壳与 `ATENG_PRO_LAYOUT_KEY` 总线**：
   - 主布局采用自建轻量 `src/layouts/AdminLayout.vue`（拆分 `AdminSidebar`、`AdminHeader`、`TenantObserveBanner`，不强行套用 `AtengProLayout`，原因见 [ADR-0003](../adr/0003-lightweight-scheme-a-admin-layout-and-state-assembly.md)）；
   - `AdminLayout.vue` 必须主动 `provide(ATENG_PRO_LAYOUT_KEY, context)`，以原生兼容 `AtengTabsNav` 内容最大化、`Esc` 退出最大化及 `AtengFooterBar` 等布局总线消费件；侧栏与页签图标统一经 `src/utils/icon.ts` `resolveMenuIcon` 映射 `@element-plus/icons-vue`。
2. **多标签页 `AtengTabsNav` + `useTabsNav` + `<KeepAlive>` 单源契约**：
   - 用 `@atengk/vue` `useTabsNav()` 维护唯一数据源，`<router-view>` 外包裹 `<KeepAlive :include="cachedViews">` 并结合 `refreshingKey` 实现无整页刷新重载；
   - **后 `#376` 标准绑定**：固定配置 `style-type="line"`、`height="36px"`、`:emit-close-on-batch="false"`、`:icon-resolver="resolveMenuIcon"`、`:menu-icons="TAB_MENU_ICONS"`（注入 `@element-plus/icons-vue` 线性图标替换默认 emoji）；事件统一单源收口：`@tab-click` 跳转、`@tab-close` 调 `closeTab`、`@batch-close` 依据 `payload.command` 一次性调用 `closeOthers`/`closeLeft`/`closeRight`/`closeAll` 消除多次状态跳变、`@tab-refresh` 调 `refreshTab`。
3. **分页表格与查询表单协同（后 `#375`）**：
   - 标准组合：`usePagination`（`@atengk/vue`）+ `AtengQueryForm` + `AtengTable`；
   - 当 `AtengQueryForm` 嵌套在已传 `:pagination` 的 `<AtengTable #query>` 插槽内时，受益于 `#375` 修复可自动继承 `tableContext.loading` 且无双发查询/无效重置，仅需传 `:model="pagination.query"`，勿重复传 `:pagination`；
   - 树形表格直接向 `<AtengTable>` 透传 `:tree-props`、`row-key="id"`、`:show-pagination="false"`。
4. **双轨字典与枚举加载（`src/utils/dict.ts`）**：
   - 必须同时注册 `DictManager.setProvider` 与 `DictManager.setBatchProvider`：依据数学互斥命名规则，`lowerCamelCase`（含 `[A-Z]`，如 `commonStatus`/`dataScopeType`）路由至 `GET /admin/system/enums/{name}` 与 `POST /admin/system/enums/batch`；`snake_case`（如 `sys_user_gender`）路由至 `GET /admin/system/dict/data/type/{dictType}`；
   - 适配层将后端 `OptionItem`（`{ code, label, disabled, extra }`）与 `DictDataVO` 统一归一化为 `DictItem`，过滤 `'default'` 及非法 `tagType` 为 `undefined`（与 `#375` 修复形成双防线）；列表用 `AtengDictTag`，表单用 `AtengDictSelect` / `AtengDictRadio` / `AtengDictCheckbox`。
5. **验证码、上传与 Excel 导入导出**：
   - 图形验证码：`<AtengCaptcha type="image" :refresh="loadCaptcha" />`（`refresh` 是 **Prop 回调**，不是 `@refresh` 事件）；
   - 上传组件：**强制传递 `:http-request="uploadWithAdminClient"`** 桥接 `adminHttpClient`（严禁使用默认 XHR `action`，否则绕过 `satoken-admin`、`X-Tenant-Id` 与全局异常拦截器）；用户导入写接口须覆盖请求级超时 `timeout: 120_000`；
   - 导入错误反馈：`<AtengExcelFeedback :download-action="downloadFeedbackBlob" />` 强制经 `adminHttpClient` 拉取二进制流（受益于 `#375` 自动优先解析 `Content-Disposition` 文件名）；导出使用 `AtengExcelExport` 或 `useExcel({ httpClient: adminHttpClient })`。

> 若接入中发现 `@atengk/*` 通用能力缺失或缺陷，按 [`foundation-first-gate.md`](./foundation-first-gate.md) 停工提单；当前本地 `.yalc/@atengk/element-plus`（含 `#369`–`#376` 修复）仅限联调，正式合并入 `dev`/`main` 前必须还原为上游已发布的正式 npm 版本锁版。
