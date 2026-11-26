# 架构决策记录 (Architecture Decision Records - ADR)

本目录记录 `ateng-solid-admin-web` 管理后台前端工程的关键架构决策（ADR）。

## 决策矩阵总览 (Decision Matrix)

| 编号 | 决策标题 | 状态 | 核心收益与权衡 | 关联范围 | 详细文档 |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **0001** | **TailwindCSS（禁用 Preflight）+ Element Plus / 上层自有令牌混合样式架构** | 🟢 Accepted | 剥离 `theme-pro.css`，由 `tokens.css` 静态定义 Light/Dark 双主色阶并与 `initTheme`、Tailwind `@theme` 与防 FOUC 协同 | `src/styles/`、`index.html` 与全局视图 | [查看](./0001-tailwindcss-without-preflight-and-theme-pro.md) |
| **0002** | **手写强类型 `src/api/*` 契约与 `ateng-ui` 核心集成决策** | 🟢 Accepted | 12 域手写强类型 API、三单例装配、数学互斥双轨 `DictManager`（单查+批查）及后 `#373`–`#376` 组件受控接入红线 | `src/api/`、`src/utils/`、组件集成 | [查看](./0002-handwritten-typed-api-and-ateng-ui-integration.md) |
| **0003** | **方案 A 轻量 `AdminLayout` 布局壳、单源鉴权状态桥接与上下文双保险** | 🟢 Accepted | 轻量自建方案 A 布局壳 + `provide(ATENG_PRO_LAYOUT_KEY)` 复用 `AtengTabsNav`/`useTabsNav`；`useAuthStore` 共享 `useAuth` `WeakMap` 零漂移 | `src/layouts/`、`src/stores/`、`src/main.ts` | [查看](./0003-lightweight-scheme-a-admin-layout-and-state-assembly.md) |
| **0004** | **列表页上下双卡分体容器与自适应分页栏架构** | 🟢 Accepted | 检索卡与表格分页卡分体对齐（`8px` 圆角 + `1px` 细边 + `16px` 内边距）、总条数置左/控制置右、`0` 条隐藏与单页收起 `jumper`、通过 `ateng-ui#379` 下沉底座并全站收口（`dev` 放行，合 `main` 前待 npm 锁版） | `ateng-ui#379`、`src/styles/` 与全站 12 个列表页 | [查看](./0004-dual-card-table-and-adaptive-pagination.md) |
| **0005** | **检索复杂度分级单行收口与表格弹性封顶滚动架构** | 🟢 Accepted | ≤3 项全宽检索默认单行展开不折叠（窄分栏与 ≥4 项保持 1 行折叠）；桌面端全站 12 页采用 `max-height` 弹性封顶表内滚动（移动端/垂直堆叠退回整页滚动），已通过 `ateng-ui#380` 下沉并经 `yalc` 全站收口（`dev` 放行，合 `main` 前待 npm 锁版） | `ateng-ui#380`、`useListTableLayout` 与全站 12 个系统列表页 | [查看](./0005-tiered-query-collapse-and-max-auto-height-table.md) |

---

## 维护准则

1. 仅在引入核心前端依赖栈、调整路由/状态/样式架构或重大协议升级时新建 ADR。
2. 局部优化在既有 ADR 中增量修订，并同步更新本索引表与 [`CONTEXT.md`](../../CONTEXT.md)。
