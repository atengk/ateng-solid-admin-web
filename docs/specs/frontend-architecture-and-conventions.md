# 前端工程结构、配置基线与路由权限规范 (frontend-architecture-and-conventions.md)

> **适用范围**：`ateng-solid-admin-web` 脚手架搭建、日常开发、联调与单元测试编写。

---

## 1. 标准目录拓扑约定

```text
ateng-solid-admin-web/
├── .agents/rules/
│   ├── contracts.md                 # 从根仓同步的跨端协议副本（只读）
│   ├── foundation-first-gate.md     # 从根仓同步的底层缺口即停工硬门禁副本（只读）
│   └── styling-and-ateng-ui.md      # TailwindCSS + theme-pro 与 ateng-ui 接入守则
├── docs/
│   ├── adr/                         # 前端架构决策记录
│   └── specs/                       # 前端架构与约定规范
├── public/                          # 静态公共资源
├── src/
│   ├── api/                         # 按领域划分的手写强类型接口与 TS 类型（auth/system/*）
│   ├── assets/                      # 编译期处理的图标/图片资源
│   ├── components/                  # 业务公共组件（图标映射器、租户切换器、主题切换等）
│   ├── composables/                 # 业务组合式函数（use*）
│   ├── layouts/                     # AtengProLayout + AtengTabsNav + KeepAlive 布局壳
│   ├── router/                      # 静态路由、动态路由加载器（import.meta.glob）与导航守卫
│   ├── stores/                      # Pinia Setup Store（auth/user/permission/app）
│   ├── styles/                      # theme-pro 导入顺序与 TailwindCSS（无 Preflight）入口
│   ├── types/                       # 全局公共 TS 类型（路由、菜单、通用选项等）
│   ├── utils/                       # httpClient/authManager/tenantManager/monitor 实例装配
│   ├── views/                       # 业务页面视图（login/dashboard/system/*）
│   ├── App.vue
│   └── main.ts
├── tests/                           # Vitest 离线自洽单元测试
├── .env.example                     # 环境变量占位符模板（真实本地配置写于 .env.local）
├── eslint.config.mjs                # ESLint 9 Flat Config（与 ateng-ui 对齐）
├── tsconfig.json                    # TypeScript Strict Mode（noImplicitAny / strictNullChecks / noUncheckedIndexedAccess）
└── package.json                     # 锁定 Node >=22、pnpm 11+
```

---

## 2. 静态检查与工程配置基线

1. **ESLint 9 Flat Config（对齐 `ateng-ui`）**：
   - 基于 `@eslint/js`、`typescript-eslint`、`eslint-plugin-vue`（`flat/recommended`）与 `eslint-config-prettier`；
   - 核心硬规则：
     - `vue/component-api-style: ['error', ['script-setup']]`
     - `vue/no-mutating-props: 'error'`
     - `@typescript-eslint/no-explicit-any: 'error'`（或严格收敛仅测试豁免）
     - `@typescript-eslint/no-unused-vars: ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]`
2. **TypeScript Strict Mode**：
   - 开启 `"strict": true`、`"noImplicitAny": true`、`"strictNullChecks": true`、`"noUncheckedIndexedAccess": true`、`"forceConsistentCasingInFileNames": true`。
3. **Prettier**：
   - 由根目录 [`.prettierrc`](../../.prettierrc) 统一托管（`singleQuote: true`、`semi: true`、`printWidth: 100`、`endOfLine: "lf"`）。

---

## 3. 环境变量（`.env.example`）与 Vite Proxy 规范

开发期禁止在代码中硬编码后端域名与端口，`.env.example` 仅暴露非敏感语义占位符：

```ini
# 应用标题
VITE_APP_TITLE=ateng-solid 管理后台

# API 基础前缀（开发期由 Vite Proxy 转发至后端）
VITE_API_BASE_URL=/api

# 开发代理目标（本地联调可在 .env.local 覆盖）
VITE_PROXY_TARGET=http://127.0.0.1:8080

# 是否启用 @atengk/monitor 前端异常与性能采集（默认关闭或本地控制台模式）
VITE_MONITOR_ENABLED=false
VITE_MONITOR_DSN=
```

- **Proxy 重写规则**：当后端端点为 `/admin/**`、前端请求配置 `/admin/**` 时，若 `VITE_API_BASE_URL` 设为空或 `/`（代理 `/admin` ➔ `VITE_PROXY_TARGET`），或设为 `/api` 并在 Vite Proxy 剥离 `/api` 前缀，全项目必须保持单一口径一致（推荐直接统一通过 `VITE_API_BASE_URL` 前缀代理 `/admin` 或配置 `/api` Rewrite）。

---

## 4. 动态路由、权限与 `@atengk/monitor` 约定

1. **静态路由与动态菜单分离**：
   - 静态基础路由：`/login`、`/403`、`/404`、根布局 `/`（含 `/profile` 个人中心、`/dashboard` 工作台）；
   - 动态业务路由：登录/刷新后从 `/admin/auth/info` 与 `/admin/auth/routes` 拉取当前用户信息（`userId`、`username`、`nickname`、`tenantId`、`roles`、`permissions`）与菜单树；
   - `component` 字段约定为相对 `src/views/` 的路径（如 `"system/user/index"`），通过 `import.meta.glob('@/views/**/*.vue')` 精确匹配；未找到组件时降级至安全 404/占位提示页，严禁白屏。
2. **权限控制边界**：
   - 路由守卫校验登录态与菜单权限；
   - 页面按钮使用 `v-permission="'system:user:create'"` 或 `hasPermission('system:user:create')`；
   - `AuthManager` 拦截 `401` 后清空 Pinia 用户状态、Reset 动态路由并跳转 `/login?redirect=...`。
3. **测试隔离规范（Vitest）**：
   - 测试环境使用 `happy-dom` 或 `jsdom`，网络层全部通过 `vi.mock` 拦截；
   - 每个用例 `beforeEach`/`afterEach` 必须清理 `localStorage`、`sessionStorage`、Pinia 状态与挂载 DOM（`wrapper.unmount()`）。
