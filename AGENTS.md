# ateng-solid-admin-web 管理后台前端规范 (AGENTS.md)

`ateng-solid-admin-web` 是基于 Node 22+ / pnpm 11+ / Vue 3.5+ / TypeScript Strict / Vite / Pinia（Setup Store）/ Element Plus / `@atengk/{core,vue,element-plus}` + TailwindCSS v4（禁用 Preflight）的 PC 企业级管理后台。依赖版本真源见 [`package.json`](./package.json)。

---

## 1. 依赖边界与底层缺口硬门禁

- **依赖克制**：优先复用 `@atengk/core`（HTTP 解包、长整型正则防截断、`AuthManager`/`TenantManager`、Blob 双态嗅探、`formatMask*`）、`@atengk/vue`（`useRequest`/`usePagination`/`useAuth`/`useTenant`/`useTabsNav`/`useExcel`/`useUpload`）与 `@atengk/element-plus`（`AtengProLayout`/`AtengTabsNav`/`AtengTable`/`AtengQueryForm`/`AtengDialog`/`AtengDrawer`/`AtengDict*`/`AtengCaptcha`/`AtengUpload`/`AtengExcel*`/`v-permission`/`v-idempotent`）。
- **禁止引入**：`lodash`、`moment`、`jquery`、Vuex、Options API、OpenAPI 代码生成工具、外部 Mock 服务；首期不预装 `@atengk/monitor`、L2 重型图表/编辑器与 `vue-i18n`，不提前建立空 `src/modules/` 目录。
- **底层缺口即停工（Zero Workaround）**：遇 `@atengk/*` 能力缺失、设计不顺手或存在缺陷，立即暂停受阻编码并向 `atengk/ateng-ui` 提通用 Issue（严禁业务仓补丁绕过，严禁底座硬编码本项目约定）；正式提交前必须锁回 npm 正式版（`.githooks/pre-commit` 拦截 `file:.yalc`/`file:../`/`link:`）。

---

## 2. 协议、权限、Vue 3.5 与样式硬约束

- **手写强类型 `src/api/*`**：直接对齐后端 `/admin/**` 契约（透明兼容单体与微服务网关）；全部雪花主外键 ID 与 `tenantId` 统一声明为 `string`（严禁 `number`）；列表与分页兜底统一返回 `[]`。
- **认证、多租户与超管防越权**：
  - `AuthManager` 配置 `tokenKey: 'satoken-admin'`、`headerName: 'satoken-admin'`；`TenantManager` 默认 `"0"` 并注入 `X-Tenant-Id`（依据登录前置接口 `tenantEnabled` 显隐租户 UI，仅租户 `"0"` 的 `super_admin` 可切换工作租户）；
  - **必配防越权**：插件注册时显式传 `createAtengVue({ superAdminRoles: ['super_admin'] })`，覆盖底层默认 `'admin'`；按钮权限统一 `v-permission` / `v-role` 与 `<域>:<资源>:<动作>` 三段式编码；
  - 动态路由经 `import.meta.glob('../views/**/*.vue')` 映射；布局壳采用方案 A 轻量自建 `AdminLayout.vue`（`provide(ATENG_PRO_LAYOUT_KEY)` 组合复用 `AtengTabsNav`/`useTabsNav`），菜单与页签图标统一经 `src/utils/icon.ts` `resolveMenuIcon` 映射。
- **Vue 3.5 SFC 与响应式铁律**：
  - 统一 `<script setup lang="ts">` ➔ `<template>` ➔ `<style scoped>`，使用纯 TS 泛型 `defineProps<{...}>()` / `defineEmits<{...}>()`；严禁 Options API、生产裸 `any`、未防御 `!`、直接突变 `props`、破坏响应性的解构与组件内 `document.querySelector`；
  - 表单与 Store 保持“内存真明文”，展示掩码仅在渲染层调用 `formatMask*`；所有监听、定时器、`Observer` 与 `URL.createObjectURL` 必须在 `onUnmounted` / `onScopeDispose` 释放。
- **TailwindCSS v4（禁 Preflight）+ `Precision Slate & Cobalt` 自有令牌**：
  - 仅在 `src/styles/main.css` 显式导入 `tailwindcss/theme.css` 与 `tailwindcss/utilities.css`（严禁引入 Preflight 或 `@import "tailwindcss"`）；Tailwind 仅用于布局与间距，严禁魔改 `.el-*`/`.at-*` 内部 DOM；
  - 脱离 `@atengk/element-plus/theme-pro.css` 默认皮肤，通过 `src/styles/tokens.css` 定义 `--solid-*` 并映射至 `--el-*` 与 Tailwind `@theme`（暗黑模式跟随 `html.dark`），全站严禁硬编码 Hex 色值。

---

## 3. 验证门禁、本地配置与交付底线

- **四合一验证门禁**：交付前本地执行 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全绿；Vitest 单测依赖 `vi.mock` 离线自洽，组件测试在 `afterEach` 调用 `wrapper.unmount()` 并重置 Pinia / Storage。
- **本地配置与 Git**：后端代理与私有配置仅存 `.gitignore` 忽略的 `.env.local`（仓库仅留 `.env.example`）；`dev` 分支开发，未获明确指令不提交/推送，暂存显式指定路径（禁 `git add .`/`-A`），Conventional Commits。

---

## 4. 按需必读文档（按场景触发）

| 触发场景（何时必先读） | 文档路径 |
| :--- | :--- |
| 编写页面布局、样式令牌，或接入 `AdminLayout`/`AtengTabsNav`/`Table`/`QueryForm`/`Dict*`/`Captcha`/`Upload`/`Excel*` | [`docs/agents/styling-and-ateng-ui.md`](./docs/agents/styling-and-ateng-ui.md) |
| 新增或调整 `src/api/*` 接口、请求头、错误码、多租户、权限码或 Excel 导入导出 | [`docs/agents/contracts.md`](./docs/agents/contracts.md) |
| 拆分复杂视图/Composable、选型表驱动、写注释或做 Code Review | [`docs/agents/coding-standards.md`](./docs/agents/coding-standards.md) |
| 遇 `ateng-ui` 底座缺口，或需用 `pnpm pack + yalc` 本地联调还原 | [`docs/agents/foundation-first-gate.md`](./docs/agents/foundation-first-gate.md) |
| 功能通过四合一门禁后逆向沉淀 `README.md` / Specs / `CONTEXT.md` / `llms.txt` | [`docs/agents/documentation-specification.md`](./docs/agents/documentation-specification.md) |
| 查阅目录结构、ESLint/TS 基线、路由表、Store 与扩展模块规格 | [`docs/specs/frontend-architecture-and-conventions.md`](./docs/specs/frontend-architecture-and-conventions.md) · [`docs/specs/views-and-routes-spec.md`](./docs/specs/views-and-routes-spec.md) |
| 全局索引、前端术语表与架构决策 | [`llms.txt`](./llms.txt) · [`CONTEXT.md`](./CONTEXT.md) · [`docs/adr/README.md`](./docs/adr/README.md) |

## Agent skills

- **Issue tracker**: GitHub Issues (`gh` CLI) — [`docs/agents/issue-tracker.md`](./docs/agents/issue-tracker.md)
- **Triage labels**: 5 角色标签词表 — [`docs/agents/triage-labels.md`](./docs/agents/triage-labels.md)
- **Domain docs**: 单上下文（根 `CONTEXT.md` + `docs/adr/`）— [`docs/agents/domain.md`](./docs/agents/domain.md)
