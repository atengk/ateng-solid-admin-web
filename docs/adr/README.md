# 架构决策记录 (Architecture Decision Records - ADR)

本目录记录 `ateng-solid-admin-web` 管理后台前端工程的关键架构决策（ADR）。

## 决策矩阵总览 (Decision Matrix)

| 编号 | 决策标题 | 状态 | 核心收益与权衡 | 关联范围 | 详细文档 |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **0001** | **TailwindCSS（禁用 Preflight）+ Element Plus / 上层自有令牌混合样式架构** | 🟢 Accepted | 剥离 `theme-pro.css`，由 `tokens.css` 静态定义 Light/Dark 双主色阶并与 `initTheme`、Tailwind `@theme` 与防 FOUC 协同 | `src/styles/`、`index.html` 与全局视图 | [查看](./0001-tailwindcss-without-preflight-and-theme-pro.md) |
| **0002** | **手写强类型 `src/api/*` 契约与 `ateng-ui` 核心集成决策** | 🟢 Accepted | 12 域手写强类型 API、三单例装配、数学互斥双轨 `DictManager`（单查+批查）及后 `#373`–`#376` 组件受控接入红线 | `src/api/`、`src/utils/`、组件集成 | [查看](./0002-handwritten-typed-api-and-ateng-ui-integration.md) |
| **0003** | **方案 A 轻量 `AdminLayout` 布局壳、单源鉴权状态桥接与上下文双保险** | 🟢 Accepted | 轻量自建方案 A 布局壳 + `provide(ATENG_PRO_LAYOUT_KEY)` 复用 `AtengTabsNav`/`useTabsNav`；`useAuthStore` 共享 `useAuth` `WeakMap` 零漂移 | `src/layouts/`、`src/stores/`、`src/main.ts` | [查看](./0003-lightweight-scheme-a-admin-layout-and-state-assembly.md) |

---

## 维护准则

1. 仅在引入核心前端依赖栈、调整路由/状态/样式架构或重大协议升级时新建 ADR。
2. 局部优化在既有 ADR 中增量修订，并同步更新本索引表与 [`CONTEXT.md`](../../CONTEXT.md)。
