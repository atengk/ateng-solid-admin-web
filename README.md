# ateng-solid-admin-web

**ateng-solid-admin-web** 是 **ateng-solid** 全端开源上层框架的管理后台 Web 前端工程，基于独立通用的 [`ateng-ui`](https://github.com/atengk/ateng-ui) 基础设施套件与 **TailwindCSS（禁用 Preflight）+ Element Plus `theme-pro`** 混合样式架构构建，兼作 `ateng-ui` 的实战验证载体与面向企业级业务二开的纯净前端框架壳。

---

## 1. 工程定位与技术栈

- **端形态**：PC Web 企业级管理后台（纯中文首期单体 Vite SPA）。
- **核心技术栈**：Node.js `22+` / pnpm `11+` / Vue `3.5+` / Vite `6+` / TypeScript Strict / Vue Router / Pinia / Element Plus / TailwindCSS（无 Preflight）。
- **底座套件**：`@atengk/core`（L0）、`@atengk/vue`（L1）、`@atengk/element-plus`（L3）、`@atengk/monitor`（按环境变量开关）；`ateng-ui` 的 L2 专业扩展包按后续业务需要再行引入。
- **首期功能范围**：登录认证与图形验证码、个人中心、租户与租户套餐管理、用户/角色/菜单/部门/岗位 RBAC 权限管理、静态枚举与动态数据字典、系统参数、登录与操作审计日志、在线会话治理。

---

## 2. 规范与文档入口

- 独立开发行为准则：[`AGENTS.md`](./AGENTS.md)
- 跨端通信契约（同步副本）：[`.agents/rules/contracts.md`](./.agents/rules/contracts.md)
- 底层缺口即停工硬门禁（同步副本）：[`.agents/rules/foundation-first-gate.md`](./.agents/rules/foundation-first-gate.md)
- 混合样式与 `ateng-ui` 接入守则：[`.agents/rules/styling-and-ateng-ui.md`](./.agents/rules/styling-and-ateng-ui.md)
- 前端领域词汇表：[`CONTEXT.md`](./CONTEXT.md)
- 前端架构决策记录：[`docs/adr/README.md`](./docs/adr/README.md)
- 工程结构与路由权限规范：[`docs/specs/frontend-architecture-and-conventions.md`](./docs/specs/frontend-architecture-and-conventions.md)
- 页面视图、动态路由与 Store 规格：[`docs/specs/views-and-routes-spec.md`](./docs/specs/views-and-routes-spec.md)

---

## 3. 运行环境与自检门禁

- **Node.js**：v22.x LTS 及以上
- **包管理器**：pnpm 11+
- **本地联调**：通过被 `.gitignore` 忽略的 `.env.local` 配置后端代理地址与开关（参照 `.env.example`）。

```bash
# 安装依赖与启动开发（脚手架初始化后执行）
pnpm install
pnpm dev

# 提交前四合一质量门禁
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

---

## 4. 开发协作与开源协议

- 仓库采用 `main`（稳定只读）+ `dev`（活跃开发）双分支，提交流程详见 [贡献指南 (`CONTRIBUTING.md`)](./CONTRIBUTING.md)，安全漏洞披露详见 [安全策略 (`SECURITY.md`)](./SECURITY.md)。
- 基于 [Apache License 2.0](./LICENSE) 协议开源。
