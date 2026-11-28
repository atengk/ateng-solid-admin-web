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
3. **分页表格、检索分层与弹性封顶滚动（对齐 `#375` / `#379` / `#380` 与 ADR-0004、ADR-0005）**：
   - 标准组合：`usePagination`（`@atengk/vue`）+ `AtengQueryForm` + `AtengTable`；
   - **双卡与自适应分页约定（[ADR-0004](../adr/0004-dual-card-table-and-adaptive-pagination.md)）**：列表页统一采用“检索卡 + 表格分页卡”上下分体结构与“总条数置左、翻页控制组置右”两端分布；`total === 0` 自动收起分页、单页收起 `jumper`、窄容器自动折行；**各业务页统一消费 `AtengTable` 默认自适应分页策略，禁止手写互异的 `pagination-layout` 覆盖**，且严禁在上层用 `!important` 覆写 `.at-table__*`（通用容器与分页布局已于 [`ateng-ui#379`](https://github.com/atengk/ateng-ui/issues/379) 下沉并在 `tokens.css`/`main.css` 完成轻量视觉对齐，`dev` 可通过 `yalc` 联调提交，合入 `main` 与发版前须锁回 npm 正式版）；
   - **1440px 列宽预算与默认隐藏列（[`ateng-ui#390`](https://github.com/atengk/ateng-ui/issues/390) / `defaultHiddenColumns`）**：在 `1440x900` 展开侧栏下，常规单栏表格可视净宽为 `1146px`、`/system/user` 双栏右侧为 `904px`。多列宽表保留 `fixed="right"` 操作列与既有 `storageKey`（不做破坏性迁移），通过强类型 `:default-hidden-columns`（常量使用 `as const`，严禁 `as any`、`@ts-expect-error` 或强写无类型 `:visible="false"`）默认收敛低频列并确保默认可见列宽总和 `<=` 容器预算，用户仍可在右上角「列设置」一键勾选恢复或「重置」还原；
   - **检索复杂度分级与弹性封顶滚动（[ADR-0005](../adr/0005-tiered-query-collapse-and-max-auto-height-table.md)）**：全宽 ≤3 项检索统一 `:default-collapsed="false" :show-collapse="false"` 并配 `:cols` 单行收口（复用 `useListTableLayout.ts` 导出的 `QUERY_COLS_THREE_ITEMS` / `QUERY_COLS_TWO_ITEMS`）；仅窄分栏（`dict` 左栏）与 ≥4 项多条件页保留 `:default-collapsed="true"`；全站 12 个业务页已通过 `useListTableLayout` 在桌面横排态统一接入 `:auto-height="16"` + `auto-height-mode="max"`（已于 [`ateng-ui#380`](https://github.com/atengk/ateng-ui/issues/380) 下沉并在 `dev` 经本地 `yalc` 联调验证，合入 `main` 前锁回 npm 正式版；分栏外层配 `h-full min-h-0`），移动端/垂直堆叠态自动传 `false` 退回整页滚动；
   - 当 `AtengQueryForm` 嵌套在已传 `:pagination` 的 `<AtengTable #query>` 插槽内时，受益于 `#375` 修复可自动继承 `tableContext.loading` 且无双发查询/无效重置，仅需传 `:model="pagination.query"`，勿重复传 `:pagination`；
   - 树形表格直接向 `<AtengTable>` 透传 `:tree-props`、`row-key="id"`、`:show-pagination="false"`。
- **双轨字典、预热与同步缓存水合（`src/utils/dict.ts`）**：
   - 必须同时注册 `DictManager.setProvider` 与 `DictManager.setBatchProvider`：依据数学互斥命名规则，`lowerCamelCase`（含 `[A-Z]`，如 `commonStatus`/`dataScopeType`）路由至 `GET /admin/system/enums/{name}` 与 `POST /admin/system/enums/batch`；`snake_case`（如 `sys_user_gender`）路由至 `GET /admin/system/dict/data/type/{dictType}`；
   - 适配层将后端 `OptionItem`（`{ code, label, disabled, extra }`）与 `DictDataVO` 统一归一化为 `DictItem`，过滤 `'default'` 及非法 `tagType` 为 `undefined`（与 `#375` 修复形成双防线）；列表用 `AtengDictTag`，表单用 `AtengDictSelect` / `AtengDictRadio` / `AtengDictCheckbox`。
   - 受益于 `ateng-ui#381`（提交 `934135a`），`AtengDictTag` 命中缓存支持 `setup()` 同步水合且冷加载支持占位；列表页与详情弹窗/抽屉在拉数期间通过 `withDictPreload` + `useDetailDialogState().detailReady` 骨架屏门控协同（待后端详情与所需字典均返回后再渲染表单与关闭禁点），消除编辑态 `'N'` ➔ `'Y'`、`isPlatformZero` 或 `CUSTOM` 权限树的首帧假默认跳变。
5. **验证码、上传与 Excel 导入导出**：
   - 图形验证码：`<AtengCaptcha type="image" :refresh="loadCaptcha" />`（`refresh` 是 **Prop 回调**，不是 `@refresh` 事件）；
   - 上传组件：**强制传递 `:http-request="uploadWithAdminClient"`** 桥接 `adminHttpClient`（严禁使用默认 XHR `action`，否则绕过 `satoken-admin`、`X-Tenant-Id` 与全局异常拦截器）；用户导入写接口须覆盖请求级超时 `timeout: 120_000`；
   - 导入错误反馈：`<AtengExcelFeedback :download-action="downloadFeedbackBlob" />` 强制经 `adminHttpClient` 拉取二进制流（受益于 `#375` 自动优先解析 `Content-Disposition` 文件名）；导出使用 `AtengExcelExport` 或 `useExcel({ httpClient: adminHttpClient })`。
6. **表单绝对定位固定校验槽位、宽列排版与协同组件复用（`src/styles/main.css`、`src/components/`，[ADR-0006](../adr/0006-stable-form-validation-slot-and-single-line-copy.md)）**：
   - **稳态固定校验槽位（严禁全局 `position: static`）**：在 `src/styles/main.css` 保留 Element Plus 原生 `.el-form-item__error` 的 `position: absolute; top: 100%; left: 0;`，仅为非行内且非检索栏表单 `.el-form:not(.el-form--inline):not(.at-query-form)` 设置 `--el-form-item-margin-bottom: 20px`（`--large` 维持 `22px`）、`.el-form-item__error { padding-top: 3px; line-height: 1.3; }` 及 `.at-dialog__content .el-form:not(.el-form--inline) { padding-bottom: 1px; }`（保留 `.el-form p { margin-bottom: 0; }`），保证所有单行报错稳妥落在预留槽位内，**0px 容器高度抖动**且弹窗末行不裁切、不触发多余滚动条；
   - **宽裕列宽与单行校验文案**：编辑/新增表单弹窗与抽屉统一复用 `<FormErrorBanner>`、`<PasswordPolicyChecklist>`（位于 `.el-form-item__content` 内，配对字段使用简短规则文案 `PASSWORD_POLICY_SHORT_MESSAGE`）与 `useDetailDialogState`；长字段输入、选择器与邮箱/电话统一采用单列或宽列布局（如 `UserFormDrawer` / `TenantFormDrawer` `560px`、`RoleFormDrawer` `540px`、`DeptFormDialog` `640px` 仅排序与状态并排），并将校验提示文案收敛在单行可读长度内，严禁通过 `position: static` 或 `text-overflow: ellipsis` 掩盖窄列长文案问题。

> 若接入中发现 `@atengk/*` 通用能力缺失或缺陷，按 [`foundation-first-gate.md`](./foundation-first-gate.md) 提单并先在 `ateng-ui` 本地改造；当前本地 `.yalc/@atengk/element-plus` 可在 `dev` 分支随本仓改动正常提交联调，合入 `main` 与发版前必须还原为上游已发布的正式 npm 版本锁版。
