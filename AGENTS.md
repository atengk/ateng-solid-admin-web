# ateng-solid-admin-web 管理后台前端规范 (AGENTS.md)

本文件为 `ateng-solid-admin-web` 独立仓库的完整自洽研发规范，同时配合公共同步规约 [`.agents/rules/contracts.md`](./.agents/rules/contracts.md)、[`.agents/rules/foundation-first-gate.md`](./.agents/rules/foundation-first-gate.md) 与混合样式及底座指南 [`.agents/rules/styling-and-ateng-ui.md`](./.agents/rules/styling-and-ateng-ui.md) 生效。单开本子仓即可独立完成研发、测试与交付。

---

## 1. 技术栈基线与依赖克制

- **工程基线**：Node.js `>=22`、pnpm `11+`、Vue `3.5+`、TypeScript `5.6+`（Strict Mode，开启 `noImplicitAny` / `strictNullChecks` / `noUncheckedIndexedAccess`）、Vite `6+`、Vue Router、Pinia（Setup Store）、Element Plus。
- **底座套件复用（`ateng-ui:1.0.0+`）**：
  - `@atengk/core`（L0）：HTTP 客户端、统一解包、雪花 Long ID 原始 JSON 正则防截断、`AuthManager`、`TenantManager`、文件下载 Blob 双态异常识别、`formatMask*` 脱敏、精度金融工具；
  - `@atengk/vue`（L1）：`useRequest`、`usePagination`、`useLatest`、`useAuth`、`useTenant`、`useIdempotent`、`useTabsNav`、`useExcel`、`useUpload`；
  - `@atengk/element-plus`（L3）：`AtengProLayout`、`AtengTabsNav`、`AtengTable`、`AtengQueryForm`、`AtengDialog`、`AtengDrawer`、`AtengDict*`、`AtengCaptcha`、`AtengUpload`、`AtengExcelFeedback`/`AtengExcelExport`、`v-permission`、`v-role`、`v-idempotent`；
  - `@atengk/monitor`（L0）：按环境变量开关接入前端异常与性能可观测基座（默认仅本地闭环或开启配置后上报）。
- **底层缺口即停工硬门禁**：开发任何通用或复合 UI 基础设施能力时，若 `ateng-ui`（`@atengk/core`/`vue`/`element-plus`/`monitor`）功能缺失或存在缺陷，**必须立即暂停该特性编码并向 `atengk/ateng-ui` 提交 Issue**，详见 [`.agents/rules/foundation-first-gate.md`](./.agents/rules/foundation-first-gate.md)。
- **依赖克制**：首期**不预装** `ateng-ui` 的 L2 重型扩展包（图表、流程图、富文本等），按业务需求再引入；**严禁引入** `lodash`、`moment`、`jquery`、Vuex、Options API、外部 Mock 服务；首期纯中文应用（暂不引入 `vue-i18n`，业务文案保持集中/语义化）。
- **双态后端无感切换**：前端唯一对接 `.agents/rules/contracts.md` 定义的 `/admin/**` 契约，无论后端运行于单体 `ateng-solid-server` 还是 `ateng-cloud-gateway` 微服务网关模式，前端代码与接口契约保持 100% 透明兼容。

---

## 2. 协议对齐、认证权限与路由规范

- **手写强类型 `src/api/*`**：不使用 OpenAPI 代码生成工具；接口层收敛于 `src/api/*`，直接调用 `@atengk/core` `http` 客户端并对照后端 DTO/VO 手写强类型接口。
- **统一响应与分页**：对齐 `Result<T>`、`PageQuery`（`current` / `size` / `sorts`）与 `PageResult<T>`（`records` / `total`）；列表查询或兜底**统一返回空数组 `[]`**，严禁返回 `null`/`undefined`。
- **雪花 ID 与多租户对齐**：所有业务主外键 ID（含 `tenantId`）在 TS 模型中**统一声明为 `string`**，严禁使用 `number`。
- **管理端多账号与超管收敛**：
  - `AuthManager` 显式配置：`tokenKey: 'satoken-admin'`、`headerName: 'satoken-admin'`（对应后端 `loginType = "admin"`）；
  - `TenantManager` 维护当前租户（默认 `"0"`）并自动注入 `X-Tenant-Id`；仅租户 `"0"` 的超级管理员在前端顶栏可切换工作租户视角；
  - **关键初始化防越权**：注册插件时必须显式覆写 **`createAtengVue({ superAdminRoles: ['super_admin'] })`**，覆盖底层默认含 `'admin'` 的数组，防止普通租户管理员角色绕过按钮权限。
- **动态路由与三段式权限**：
  - 后端下发嵌套路由菜单树（`M`/`C`/`F`），前端通过 Vite `import.meta.glob('@/views/**/*.vue')` 动态映射注册；
  - `AtengProLayout` + `AtengTabsNav` 配合 `useTabsNav` 对 `<router-view>` 自行包裹 `<KeepAlive :include="...">`；
  - 菜单 `icon` 字符串通过映射器转为 `@element-plus/icons-vue` 组件对象；
  - 按钮权限统一采用 `v-permission` / `v-role` 与 `<域>:<资源>:<动作>` 三段式编码。

---

## 3. Vue 3.5 + TailwindCSS 混合样式与代码规范

### 3.1 SFC 与 TypeScript 铁律
- **强制 `<script setup lang="ts">`**，标签顺序固定为 `<script setup lang="ts">` ➔ `<template>` ➔ `<style scoped>`；单文件 `.vue` 建议 ≤ 400 行，`.ts` ≤ 500 行；**100% 禁止 Options API 与 Vue 2 废弃语法**。
- **Props / Emits / 响应式安全**：
  - 使用纯粹 TS 泛型字面量声明 `defineProps<{ ... }>()` 与 `defineEmits<{ ... }>()`；
  - 严禁直接突变 `props`（通过 `emit` 或 `defineModel` 回传）；严禁在需要维持响应性的位置对 `props` / `reactive()` 直接 ES6 解构（使用 `toRefs` / `toRef` / `toValue()`）；
  - **100% 严禁生产裸 `any`**（使用 `unknown` + 类型守卫）与未防御的非空断言 `!`；
  - **严禁绕过 Vue 直接 `document.getElementById`/`querySelector` 获取组件内节点**（使用 `ref` / `useTemplateRef`）。

### 3.2 TailwindCSS（禁 Preflight）+ `theme-pro` CSS 变量混合体系
- **职责严格二分**：
  - **TailwindCSS（关闭 `preflight: false`）**：**仅用于页面级/区块级 Flex/Grid 布局、间距、对齐与响应式排版**；
  - **Element Plus + `@atengk/element-plus/theme-pro.css`**：全面接管全局 Reset、基础字体/滚动条、组件皮肤与状态交互。
- **主题与暗黑双模铁律**：
  - 暗黑模式使用 `darkMode: 'class'`，同步响应 `html.dark`；
  - 颜色、圆角、阴影 100% 绑定 `--el-*` / `--at-*` CSS 变量，**严禁硬编码 Hex 色值**；**严禁使用 Tailwind 类覆盖组件库内部私有样式**；局部自定义 CSS 必须使用 `<style scoped>`，禁止全局 `!important`。

### 3.3 生命周期、内存真明文与日志
- **内存真明文与脱敏**：表单状态与状态管理保持真明文，脱敏展示仅在渲染管道调用 `formatMask*`。
- **确定性资源释放**：所有 `addEventListener`、`setInterval`/`setTimeout`、`ResizeObserver`/`IntersectionObserver`、WebSocket/SSE 与 `URL.createObjectURL` 必须在 `onUnmounted` 或 `onScopeDispose` 中 100% 释放。
- **零裸 `console.log`**：生产代码严禁遗留 `console.log`；异常经 `BusinessException` 或全局错误边界受控处理，严禁空 `catch` 吞咽异常。

---

## 4. 本地配置、验证门禁与 Git 纪律

- **双模联调配置**：后端代理地址、应用标题与 `@atengk/monitor` 开关等配置写入被 `.gitignore` 忽略的 `.env.local`（仓库仅提交占位模板 `.env.example`）；开发联调走 Vite Proxy。
- **四合一验证门禁 & 全自洽 Vitest 单测**：
  - 修改代码提交前必须执行并通过四合一检查：`pnpm typecheck && pnpm lint && pnpm test && pnpm build`；
  - Vitest 单测不依赖真实后端，必须依托 `vi.mock` 自洽拦截 HTTP；挂载组件测试须在 `afterEach` 调用 `wrapper.unmount()` 并重置 Storage / Pinia 状态。
- **双分支与安全暂存**：`main` 只读发布，`dev` 活跃开发；本地预提交钩子 `.githooks/pre-commit` 与 `.githooks/commit-msg` 自动守门；未获用户明确提交/推送指令前改动停留在工作区；暂存必须显式指定文件路径（严禁 `git add .` / `-A`）。
- **注释规范**：新建文件/组件/Hooks/API 接口需具备中文 JSDoc（`@author Ateng`、`@since YYYY-MM-DD`），详细说明 Props/Emits 边界与空值约定。

---

## 5. AI 交付前自检清单 (Pre-flight Checklist)

- [ ] **强类型与契约对齐**：所有业务 ID 是否全部为 `string`？无生产裸 `any` 与未防御 `!`？
- [ ] **样式与暗黑模式**：Tailwind 是否禁用了 Preflight？页面无硬编码 Hex 色值且未覆盖组件库内部类？`<style scoped>` 正确隔离？
- [ ] **组件范式与响应式**：是否 100% 使用 `<script setup lang="ts">`？无突变 Props 与失效解构？
- [ ] **权限安全防线**：`createAtengVue` 是否显式收敛 `superAdminRoles: ['super_admin']`？按钮控制是否统一 `v-permission`？
- [ ] **生命周期清理**：是否 100% 在 `onUnmounted` / `onScopeDispose` 中清理所有监听、定时器与 Observer？
- [ ] **本地门禁全绿**：是否已在本地执行 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 并全部通过？无真实凭据或 `console.log` 残留？

---

## 6. 专职规约与文档导航

- 底层缺口即停工硬门禁（同步副本）：[`.agents/rules/foundation-first-gate.md`](./.agents/rules/foundation-first-gate.md)
- 跨端通信与数据契约（同步副本）：[`.agents/rules/contracts.md`](./.agents/rules/contracts.md)
- 混合样式与 `ateng-ui` 接入细则：[`.agents/rules/styling-and-ateng-ui.md`](./.agents/rules/styling-and-ateng-ui.md)
- 前端领域词汇表：[`CONTEXT.md`](./CONTEXT.md)
- 前端架构决策记录：[`docs/adr/README.md`](./docs/adr/README.md)
- 前端架构、配置基线与路由规范：[`docs/specs/frontend-architecture-and-conventions.md`](./docs/specs/frontend-architecture-and-conventions.md)
- 页面视图、动态路由与 Store 契约规格：[`docs/specs/views-and-routes-spec.md`](./docs/specs/views-and-routes-spec.md)

---

## Agent skills

### Issue tracker

本仓库使用 GitHub Issues（通过 `gh` CLI）跟踪前端需求、规格与缺陷。详见 [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md)。

### Triage labels

采用标准 5 角色分诊标签词表（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）。详见 [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md)。

### Domain docs

本仓库采用单上下文（single-context）结构（根目录 `CONTEXT.md` + `docs/adr/`）。详见 [`docs/agents/domain.md`](./docs/agents/domain.md)。
