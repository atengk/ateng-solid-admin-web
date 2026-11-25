# 前端工程结构、配置基线与路由权限规范 (frontend-architecture-and-conventions.md)

> **适用范围**：`ateng-solid-admin-web` 脚手架搭建、日常开发、联调与单元测试编写。

---

## 1. 标准目录拓扑约定

```text
ateng-solid-admin-web/
├── docs/
│   ├── adr/                         # 前端架构决策记录
│   ├── agents/                      # 按需规约与协作配置（同步的 contracts/foundation-first-gate/coding-standards/documentation-specification 与 styling-and-ateng-ui）
│   └── specs/                       # 前端架构与约定规范
├── public/                          # 静态公共资源
├── src/
│   ├── api/                         # 12 个按域划分的手写强类型接口与 TS 类型（auth/index.ts + system/*）
│   ├── assets/                      # 编译期处理的图标/图片资源
│   ├── components/                  # 业务公共组件（租户切换器、主题切换、快捷命令搜索等）
│   ├── composables/                 # 业务组合式函数（use*）
│   ├── layouts/                     # 方案 A 轻量布局壳（AdminLayout/AdminSidebar/AdminHeader/TenantObserveBanner + AtengTabsNav + KeepAlive）
│   ├── router/                      # 静态路由、动态路由加载器（import.meta.glob）与导航守卫（guards.ts）
│   ├── stores/                      # 4 个 Pinia Setup Store（auth/tenant/permission/app）
│   ├── styles/                      # Precision Slate & Cobalt 令牌表（tokens.css）与 TailwindCSS（无 Preflight）入口（main.css）
│   ├── types/                       # 全局公共 TS 类型（路由、菜单、通用选项等）
│   ├── utils/                       # 三单例与拦截器（http.ts）、双轨字典（dict.ts）、图标解析（icon.ts）
│   ├── views/                       # 业务页面视图（login/dashboard/profile/error/system/*）
│   ├── App.vue
│   └── main.ts
├── tests/                           # Vitest + happy-dom 三层离线自洽单测（setup.ts + utils/ + stores/ + router/ + components/）
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
   - 由前端子仓根目录 [`.prettierrc`](../../.prettierrc) 统一托管（`singleQuote: true`、`semi: true`、`printWidth: 100`、`endOfLine: "lf"`）。

---

## 3. 环境变量（`.env.example`）与 Vite Proxy 规范

开发期禁止在代码中硬编码后端域名与端口，`.env.example` 仅暴露非敏感语义占位符：

```ini
# 应用标题
VITE_APP_TITLE=ateng-solid 管理后台

# 本地开发端口
VITE_PORT=5173

# 接口请求基础地址（默认留空直通 /admin/**；生产独立网关域可配置完整基地址）
VITE_API_BASE_URL=

# 开发代理目标（本地联调可在 .env.local 覆盖为单体服务或网关地址）
VITE_PROXY_TARGET=http://127.0.0.1:8080
```

- **直通 `/admin` 代理规则**：前端 `src/api/*` 统一使用 `/admin/<域>/<资源>` 路径，`VITE_API_BASE_URL` 默认留空；`vite.config.ts` 仅代理 `'/admin'` ➔ `VITE_PROXY_TARGET`（零路径重写），与后端单体及未来 `ateng-cloud-gateway` 路径 100% 对称。

---

## 4. 核心引擎装配、全局异常分流与双轨字典契约

> 架构决策详见 [ADR-0001](../adr/0001-tailwindcss-without-preflight-and-theme-pro.md)、[ADR-0002](../adr/0002-handwritten-typed-api-and-ateng-ui-integration.md) 与 [ADR-0003](../adr/0003-lightweight-scheme-a-admin-layout-and-state-assembly.md)。

### 4.1 三单例装配、`main.ts` 启动时序与上下文双保险
1. **`src/utils/http.ts` 集中导出三单例**：
   - `adminAuthManager = createAuthManager({ tokenKey: 'satoken-admin', headerName: 'satoken-admin' })`；
   - `adminTenantManager = createTenantManager({ tenantKey: 'solid-tenant-id', headerName: 'X-Tenant-Id' })`（若本地为空则初始化写入 `'0'`）；
   - `adminHttpClient = createHttpClient({ baseURL: import.meta.env.VITE_API_BASE_URL || '', timeout: 15_000, authManager: adminAuthManager, tenantManager: adminTenantManager, unwrap: true, onUnauthorized: () => handleSessionExpired('401') })`。
2. **`src/main.ts` 严格 8 步启动顺序**：
   - `initTheme({ storageKey: 'solid-theme-mode', defaultMode: 'light', listenSystemPreference: true })`（**不传 `themeColor`**，配合 `index.html` 防 FOUC 脚本）
   - ➔ `setupDictManager()`（注册双轨单查 + 批查 Provider）
   - ➔ `app.use(pinia)`
   - ➔ `app.use(ElementPlus, { locale: zhCn })`
   - ➔ `app.use(createAtengVue({ httpClient: adminHttpClient, authManager: adminAuthManager, tenantManager: adminTenantManager, superAdminRoles: ['super_admin'], defaultSize: 10 }))`（**必须在 `app.use(router)` 与任何 Store 调用之前**）
   - ➔ `app.use(AtengElementPlus)`
   - ➔ `setupRouterGuards(router, pinia)` + `app.use(router)`
   - ➔ `app.mount('#app')`。
3. **脱离 `setup()` 的显式传参双保险**：
   - 凡在 Pinia Store、`src/router/guards.ts`、`src/utils/*` 与 Vitest 单测中调用 `@atengk/vue` Composable（`useAuth`、`useTenant`、`useExcel`）或网络客户端时，**必须显式传入** `{ authManager: adminAuthManager, tenantManager: adminTenantManager, httpClient: adminHttpClient }`，彻底规避 `useAtengConfig()` 在 `hasInjectionContext() === false` 时静默回落全局默认单例的风险。

### 4.2 全局 HTTP / 业务错误码分流契约
挂载于 `adminHttpClient.instance` 响应拦截器，统一消费 `@atengk/core` 产出的 `BusinessException`（含 `checkBlobForJsonError` 自动转译的 Blob 下载 JSON 错误）：

| 错误码 / 异常类型 | 触发场景 | 前端标准处理动作 |
| :--- | :--- | :--- |
| **`isAbortError(err)`** | 切页或竞态主动中止请求 | 静默忽略，不弹任何提示 |
| **`401`** | 未登录、Token 过期或被强退 | 经防重入锁 `isHandlingAuthReset` 触发会话终止：清空 `adminAuthManager`、重置 `adminTenantManager('0')`、卸载动态路由与页签缓存、清理 `DictManager`，提示「登录状态已失效，请重新登录」并跳转 `/login?redirect=...` |
| **`101005`**（已认证请求） | 运行时 `TenantAvailabilityInterceptor` 拦截所属租户停用/过期 | 与 `401` 同级视为**会话终止**：执行防重入登出清理、重置租户 `'0'` 与路由/页签，展示后端精准 `err.msg` 并跳转 `/login`（登录页未认证时按普通表单错误展示） |
| **`100002`** | 平台 `super_admin` 跨租户切换/访问失效目标租户 | **严禁注销 `"0"` 平台会话**：自动重置 `adminTenantManager.setTenantId('0')`、调用 `DictManager.clearCache()`、重刷 `/admin/auth/info` 与 `/admin/auth/routes`、提示 `err.msg` 并回退 `/dashboard` |
| **`101004`** | 登录页触发防爆破锁定 | **跳过全局弹窗**，静默透传至 `/login`；登录页直接读取 `(err.cause as Result<LoginLockDetailVO>)?.data`（`{ lockType: 'IP' \| 'ACCOUNT', remainSeconds }`）驱动倒计时（`ACCOUNT` 编辑账号/租户即清零，`IP` 保持倒计时） |
| **`403`** | 接口级无权限或账号禁用 | 弹出 `ElMessage.warning(err.msg || '暂无操作权限')`，不跳转整页 |
| **`429` / `40003`** | 限流或 `@Idempotent` 重复提交 | 弹出带 `2s` 节流合并的 `ElMessage.warning('操作过于频繁，请稍后再试')` |
| **`500` / `503` / 未知异常** | 服务端异常或网络超时 | 展示友好错误提示并附带 `err.traceId`（提供一键复制 `traceId`），严禁暴露底层堆栈或 SQL |

### 4.3 双轨 `DictManager` 路由与缓存失效（`src/utils/dict.ts`）
依据后端静态枚举与动态字典的命名正交性，同时注册 `DictManager.setProvider` 与 `DictManager.setBatchProvider`：
1. **数学互斥判定**：
   - 静态枚举（`EnumDictionaryRegistry`）一律采用 **`lowerCamelCase`**（含大写字母 `/[A-Z]/`，如 `commonStatus`、`menuType`、`dataScopeType`、`operateType`、`logStatus`、`configType`、`visibleStatus`）；
   - 动态字典（`sys_dict_type.dict_type`）正则严格限定为 **`^[a-z][a-z0-9_]{1,63}$`**（纯小写+数字+下划线，不含大写字母）。
2. **单查与批量路由**：
   - `setProvider(code)`：命中 `/[A-Z]/` 走 `GET /admin/system/enums/${code}` 并将 `OptionItem`（`{ code, label, disabled, extra }`）归一化为 `DictItem`（`{ value: code, label, disabled: Boolean(disabled), tagType: normalizeTagType(extra?.tagType ?? extra?.listClass) }`）；否则走 `GET /admin/system/dict/data/type/${code}`，将 `DictDataVO`（`{ dictValue, dictLabel, tagType, cssClass, status }`）归一化为 `DictItem`（`disabled: status !== 0`）；
   - `setBatchProvider(codes)`：按 `/[A-Z]/` 拆分为 `enumCodes` 与 `dictCodes`——`enumCodes` 合并为单次 `POST /admin/system/enums/batch` 请求，`dictCodes` 并发拉取未缓存的 `dictType`；
   - **`tagType` 防御归一化**：统一过滤 `'default'`、空串、纯空白及非合法 Element Plus Tag 枚举值并返回 `undefined`（与 `ateng-ui#375` 形成双重保险）。
3. **缓存失效联动**：
   - 平台超管切换租户（含 `100002` 回退）或登出时调用 `DictManager.clearCache()`；
   - `/system/dict` 页面任一字典类型或字典项增删改/启停成功后，精准调用 `DictManager.clearCache(dictType)`。

---

## 5. 动态路由、权限边界与 Vitest 三层离线测试体系

1. **静态路由与动态菜单分离**：
   - 静态基础路由：`/login`、`/403`、`/404`、根布局 `/`（含 `/dashboard` 固定页签工作台、`/profile` 个人中心）；
   - 动态业务路由：登录/刷新后从 `/admin/auth/info` 与 `/admin/auth/routes` 拉取当前用户信息与菜单树；`component` 为相对 `src/views/` 路径（如 `"system/user/index"`），通过 `import.meta.glob('../views/**/*.vue')` 精确匹配，未匹配时安全降级 404，严禁白屏。
2. **权限控制边界**：
   - 路由守卫校验登录态与菜单权限；页面按钮使用 `v-permission="'system:user:create'"` 或 `authStore.hasPermission('system:user:create')`；
   - `useAuthStore` 直接代理 `useAuth<AdminProfileVO>({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] })` 内部 `WeakMap` 响应式状态，保障 Store 与 `v-permission` / `v-role` 指令 100% 单源零漂移。
3. **Vitest + `happy-dom` 三层离线测试体系（复用既有 `@vue/test-utils`，零外部 Mock 库依赖）**：
   - **Layer 1 (`tests/utils/*.spec.ts`)**：覆盖 `adminHttpClient` 全错误码分流（`401` 防重入、`101005` 会话终止、`100002` 回退 `'0'` 不登出、`101004` `err.cause.data`、`429`/`40003`、`500`+`traceId`、Blob JSON 异常）、双轨 `DictManager`（单查/批查分流、`'default'` 归一、`clearCache`）与 `resolveMenuIcon`；
   - **Layer 2 (`tests/stores/*.spec.ts`、`tests/router/*.spec.ts`)**：以 `createPinia()` + `createMemoryHistory()` 测试 4 个 Setup Store（`super_admin` 放行 vs 普通 `admin` 角色隔离、跨租户 7 步强重置、`100002` 安全回退、动态路由注册与精确 `removeRoute`）及路由守卫白名单/重定向/404 兜底；
   - **Layer 3 (`tests/components/*.spec.ts`)**：覆盖 `AdminLayout`（`ATENG_PRO_LAYOUT_KEY` 注入、跨租户横幅显隐、`AtengTabsNav` `@batch-close` 单源同步）、登录页 `101004` 倒计时（`ACCOUNT` 编辑清零 vs `IP` 保持）与用户导入弹窗 `120s` 超时及批注反馈；
   - **确定性隔离基线 (`tests/setup.ts`)**：在 `vitest.config.ts` 注册 `setupFiles: ['tests/setup.ts']`，每个用例 `beforeEach`/`afterEach` 强制清空 `localStorage`、`sessionStorage`、`DictManager.clearCache()`、`adminAuthManager.clearToken()`、`adminTenantManager.clearTenantId()` 并执行 `vi.restoreAllMocks()`；网络层统一通过 Axios 自定义 `adapter` 或 `vi.spyOn(adminHttpClient, ...)` 离线拦截，严禁引入 MSW 等重型外部依赖。

---

## 6. 装配期可插拔扩展模块约定 (`SolidFeatureModule`)

1. **特性自发现目录（首期不建空目录）**：
   - 后续扩展特性（如社交登录、实时站内信或 `biz-*` 业务域）统一内聚于 `src/modules/<feature>/`（独立维护 `api/`、`views/`、`stores/` 与 `index.ts`），由核心入口通过 `import.meta.glob('@/modules/*/index.ts', { eager: true })` 自动扫描注册并按启用开关加载。
   - **可逆剥离**：移除目录或关闭开关后，Vite Tree-shaking 自动剔除该扩展全部代码与分包，无需修改核心路由表或 `main.ts`。
2. **轻量 UI 扩展挂点**：仅在确有跨模块协同需要时在核心页面（如登录页第三方按钮区、个人中心扩展页签）按需预留轻量 Extension Slot，不引入重型微前端框架或通用插件引擎。
