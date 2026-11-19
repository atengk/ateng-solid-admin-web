# 前端页面视图、动态路由与 Store 契约规格 (views-and-routes-spec.md)

> **适用范围**：`ateng-solid-admin-web` 首期 MVP 页面清单、路由元信息、Pinia Store 职责与 API 模块映射。
> **底盘遵循**：受 [`.agents/rules/foundation-first-gate.md`](../../.agents/rules/foundation-first-gate.md) 约束，依赖上游 `ateng-ui` 增强项（如 `atengk/ateng-ui#365`）或后端认证/RBAC 接口的特性待前置闭环后分 Spec 落地。

---

## 1. 静态路由与动态业务路由矩阵

### 1.1 静态基础路由（前端内置）
| 路径 | 路由名 (`name`) | 视图路径 | `meta` 约定 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `Login` | `src/views/login/index.vue` | `public: true`, `hidden: true` | 账密登录、租户编码输入与 `<AtengCaptcha type="image" />` |
| `/` | `RootLayout` | `src/layouts/AdminLayout.vue` | `requiresAuth: true` | `AtengProLayout` + `AtengTabsNav` + `<KeepAlive>` 主框架壳 |
| `/dashboard` | `Dashboard` | `src/views/dashboard/index.vue` | `title: '工作台'`, `affix: true`, `keepAlive: true` | 首期系统概览与快捷入口 |
| `/profile` | `Profile` | `src/views/profile/index.vue` | `title: '个人中心'`, `hidden: true` | 基本资料、头像上传与修改密码 |
| `/403` | `Forbidden` | `src/views/error/403.vue` | `public: true`, `hidden: true` | 无权限提示页 |
| `/:pathMatch(.*)*` | `NotFound` | `src/views/error/404.vue` | `public: true`, `hidden: true` | 404 兜底与未匹配动态视图降级页 |

### 1.2 动态业务路由（由 `GET /admin/auth/routes` 下发）
| 菜单路径 | 对应组件 (`component`) | 核心权限码前缀 | 核心 `ateng-ui` 复用件 |
| :--- | :--- | :--- | :--- |
| `/system/tenant` | `system/tenant/index` | `system:tenant:*` | `AtengQueryForm` + `AtengTable` + `AtengDialog` + `AtengDictTag`（仅平台租户 `"0"` 可见） |
| `/system/tenant-package` | `system/tenant-package/index` | `system:tenant-package:*` | `AtengTable` + 菜单树选择抽屉 (`AtengDrawer`) |
| `/system/user` | `system/user/index` | `system:user:*` | 左侧部门树 + `AtengTable` + `AtengUpload` + `AtengExcelFeedback` + `AtengExcelExport` |
| `/system/role` | `system/role/index` | `system:role:*` | `AtengTable` + 菜单权限分配 + 5 级 `@DataScope` 数据范围分配弹窗 |
| `/system/menu` | `system/menu/index` | `system:menu:*` | 树形 `AtengTable` + 菜单类型 (`M`/`C`/`F`) 表单 + `AtengIconSelect` |
| `/system/dept` | `system/dept/index` | `system:dept:*` | 树形 `AtengTable` + 部门树选择器 |
| `/system/post` | `system/post/index` | `system:post:*` | 标准 `AtengQueryForm` + `AtengTable` + `AtengDialog` |
| `/system/dict` | `system/dict/index` | `system:dict:*` | 字典类型与字典数据双面板管理 |
| `/system/config` | `system/config/index` | `system:config:*` | 租户参数配置表 |
| `/system/oper-log` | `system/oper-log/index` | `system:oper-log:*` | 只读分页检索 + 详情抽屉 (`AtengDescriptions`) |
| `/system/login-log` | `system/login-log/index` | `system:login-log:*` | 只读分页检索 |
| `/system/online` | `system/online/index` | `auth:online:*` | 在线会话分页 + `v-idempotent` 强退确认 |

---

## 2. Pinia Setup Store 职责边界 (`src/stores/`)

| Store 文件 | 职责边界 | 状态持久化与清理约定 |
| :--- | :--- | :--- |
| `useAuthStore` | 串联 `@atengk/core` `AuthManager`（`satoken-admin`）与 `@atengk/vue` `useAuth`，管理登录态、用户信息、角色、权限码与登出清空 | 监听 `AuthManager.onUnauthorized` 广播，401 时清空状态、重置动态路由并跳转 `/login` |
| `useTenantStore` | 串联 `TenantManager`（`X-Tenant-Id`，默认 `"0"`），控制平台超管顶栏租户切换与切换后页签/路由刷新 | 普通用户禁止写入非归属 `tenantId`；登出重置回 `"0"` |
| `usePermissionStore` | 缓存后端菜单树、动态注册路由句柄、侧边栏 `ProMenuItem[]` 转换结果与菜单图标映射 | 登出或切换租户视角时调用 `resetRoutes()` 逐一移除动态路由 |
| `useAppStore` | 管理侧边栏折叠、暗黑模式（同步 `html.dark`）、布局模式与 `<KeepAlive>` 缓存视图名集合 | 仅持久化非敏感 UI 偏好至 `localStorage` |

---

## 3. API 契约目录划分 (`src/api/`)

按后端域 1:1 映射，全部手写强类型 TS 接口，所有主外键 ID（含 `tenantId`）一律声明为 `string`：
- `src/api/auth/index.ts`：对应 `/admin/auth/**`
- `src/api/system/tenant.ts`、`tenant-package.ts`、`user.ts`、`role.ts`、`menu.ts`、`dept.ts`、`post.ts`、`dict.ts`、`config.ts`、`log.ts`、`enum.ts`：对应 `/admin/system/**`
