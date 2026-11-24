# 架构决策记录 (Architecture Decision Records - ADR)

本目录记录 `ateng-solid-admin-web` 管理后台前端工程的关键架构决策（ADR）。

## 决策矩阵总览 (Decision Matrix)

| 编号 | 决策标题 | 状态 | 核心收益与权衡 | 关联范围 | 详细文档 |
| :---: | :--- | :---: | :--- | :--- | :---: |
| **0001** | **TailwindCSS（禁用 Preflight）+ Element Plus / 上层自有令牌混合样式架构** | 🟢 Accepted | 兼顾 Tailwind 原子布局提效与 `Precision Slate & Cobalt` 自有令牌、`html.dark` 暗黑及 `--el-*` 变量零冲突协同 | `src/styles/`、全局样式与视图 | [查看](./0001-tailwindcss-without-preflight-and-theme-pro.md) |
| **0002** | **手写强类型 `src/api/*` 契约与 `ateng-ui` 核心集成决策** | 🟢 Accepted | 摆脱 OpenAPI 代码生成依赖；显式收敛 `superAdminRoles: ['super_admin']`，封装图标映射、`KeepAlive` 与双轨字典接入 | `core-infra`、`auth-session`、`router-layout` | [查看](./0002-handwritten-typed-api-and-ateng-ui-integration.md) |

---

## 维护准则

1. 仅在引入核心前端依赖栈、调整路由/状态/样式架构或重大协议升级时新建 ADR。
2. 局部优化在既有 ADR 中增量修订，并同步更新本索引表与 [`CONTEXT.md`](../../CONTEXT.md)。
