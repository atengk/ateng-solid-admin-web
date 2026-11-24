# 前端页面视图、动态路由与 Store 契约规格 (views-and-routes-spec.md)

> **适用范围**：`ateng-solid-admin-web` 首期 MVP 页面清单、路由元信息、Pinia Store 职责与 API 模块映射。
> **底盘与视觉真源**：受 [`docs/agents/foundation-first-gate.md`](../agents/foundation-first-gate.md) 约束（增量门禁见根仓 `foundation-enhancements-checklist.md` `U5~U8`）；视觉令牌与方案 A 布局遵循根仓 `docs/specs/prd/design-system.md`（`Precision Slate & Cobalt`）与 `00-overview-and-ux-standards.md`。

---

## 1. 静态路由与动态业务路由矩阵

### 1.1 静态基础路由（前端内置）
| 路径 | 路由名 (`name`) | 视图路径 | `meta` 约定 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `Login` | `src/views/login/index.vue` | `public: true`, `hidden: true` | 非对称双栏登录舞台、按 `tenantEnabled` 显隐租户编码框（默认预填 `000000`）、`<AtengCaptcha type="image" :refresh="loadCaptcha" />`、CapsLock 提示与 `redirect` 白名单守卫 |
| `/` | `RootLayout` | `src/layouts/AdminLayout.vue` | `requiresAuth: true` | 定稿 **方案 A**（`228px/60px` 左侧栏 + `48px` 单行顶栏 + `36px` `AtengTabsNav` + `<KeepAlive>` + 跨租户观察横幅）；`U5` (`#369`) 已在上游 `dev` 关单并接入本地 `yalc` 联调（正式合入待发版锁版） |
| `/dashboard` | `Dashboard` | `src/views/dashboard/index.vue` | `title: '工作台'`, `affix: true`, `keepAlive: true` | 复用 `/admin/auth/info` 与 `/routes`：`pwdUpdateTime === null` 非阻塞改密提醒条、身份摘要、动态快捷导航网格与 0 菜单受限提示卡 |
| `/profile` | `Profile` | `src/views/profile/index.vue` | `title: '个人中心'`, `hidden: true` | 消费 `GET /admin/auth/profile`（左栏 `AtengDescriptions` 脱敏+真明文复制，右栏内存真明文基本资料编辑、`<AtengUpload>` 直传 `POST /admin/auth/profile/avatar` 与改密重登） |
| `/403` | `Forbidden` | `src/views/error/403.vue` | `public: true`, `hidden: true` | 已登录优先嵌入 `AdminLayout` 居中展示；零菜单无权限用户显式提供 `[退出登录]` 防死锁出口 |
| `/:pathMatch(.*)*` | `NotFound` | `src/views/error/404.vue` | `public: true`, `hidden: true` | 404 兜底与未匹配动态视图降级页（提供返回工作台、上一页及关闭当前页签） |

### 1.2 动态业务路由（由 `GET /admin/auth/routes` 下发）
| 菜单路径 | 对应组件 (`component`) | 核心权限码前缀 | 核心 `ateng-ui` 复用件与关键门禁 |
| :--- | :--- | :--- | :--- |
| `/system/tenant` | `system/tenant/index` | `system:tenant:*` | `AtengQueryForm` + `AtengTable` + `AtengDrawer` + `AtengDictTag`（仅 `tenantEnabled=true` 且平台租户 `"0"` 可见；新建后弹窗回显初始化凭据） |
| `/system/tenant-package` | `system/tenant-package/index` | `system:tenant-package:*` | `AtengTable` + 菜单树抽屉（`AtengDrawer`，排除 `platform_only=1`）+ 缩减裁剪影响预览弹窗（`shrink-preview`） |
| `/system/user` | `system/user/index` | `system:user:*` | `AtengSplitLayout` 左侧部门树 + `AtengTable` + `AtengUpload` + `AtengExcelFeedback` + `AtengExcelExport`（`B14`/`U8` 已在上游 `dev` 关单，本地联调态已接入，正式合入待发版锁版；超管与自身禁删禁用） |
| `/system/role` | `system/role/index` | `system:role:*` | `AtengTable` + 菜单树（联动态仅叶子回显）+ 5 级 `@DataScope` 数据范围弹窗（`CUSTOM` 强校验至少 1 个部门） |
| `/system/menu` | `system/menu/index` | `system:menu:*` | 树形 `AtengTable` + `M`/`C`/`F` 动态表单 + `AtengIconSelect`（`:custom-icons` 注入全量 Icons；`U7` 已在上游 `dev` 关单并接入本地 `yalc`；`platform_only` 标注，仅 `"0"` 租户可见） |
| `/system/dept` | `system/dept/index` | `system:dept:*` | 树形 `AtengTable` + 部门树选择器（编辑禁用自身及子孙防自环；负责人消费 `user/options`） |
| `/system/post` | `system/post/index` | `system:post:*` | 标准 `AtengQueryForm` + `AtengTable` + `AtengDialog` |
| `/system/dict` | `system/dict/index` | `system:dict:*` | `AtengSplitLayout` 同屏双面板（左字典类型 `dictType` 编辑锁定 / 右字典数据 `AtengDictTag` 实时预览与 `isDefault` 互斥，仅 `"0"` 租户可见） |
| `/system/config` | `system/config/index` | `system:config:*` | 租户参数配置表（`configType='Y'` 禁删改键名；`sys.user.initPassword` 强口令校验） |
| `/system/oper-log` | `system/oper-log/index` | `system:oper-log:*` | 严格只读分页检索 + `720px` 详情抽屉（`AtengDescriptions` + 限高美化脱敏 JSON + `traceId` 复制） |
| `/system/login-log` | `system/login-log/index` | `system:login-log:*` | 严格只读分页检索（含 `traceId`、`browser`、`os` 与提示消息） |
| `/system/online` | `system/online/index` | `auth:online:*` | 在线会话分页（`tokenMask` + `sessionId` 防泄漏、`currentSession` 禁强退）+ `DELETE /admin/auth/online/{sessionId}` |

---

## 2. Pinia Setup Store 职责边界 (`src/stores/`)

| Store 文件 | 职责边界 | 状态持久化与清理约定 |
| :--- | :--- | :--- |
| `useAuthStore` | 串联 `@atengk/core` `AuthManager`（`satoken-admin`）与 `@atengk/vue` `useAuth`，管理登录态、用户信息、角色、权限码与登出清空 | 监听 `AuthManager.onUnauthorized` 广播，401 时清空状态、重置动态路由并跳转 `/login` |
| `useTenantStore` | 串联 `TenantManager`（`X-Tenant-Id`，默认 `"0"`）与后端 `tenantEnabled` 开关；多租户关闭时隐藏租户切换入口与菜单，开启后控制平台超管顶栏租户切换与页签（关闭除 `/dashboard` 外非固定页签）/路由刷新与跨租户横幅展示 | 普通用户禁止写入非归属 `tenantId`；登出重置回 `"0"` |
| `usePermissionStore` | 缓存后端菜单树、动态注册路由句柄与侧边栏 `ProMenuItem[]` 转换结果（字符串图标通过底座 `iconResolver` 扩展点解析 `@element-plus/icons-vue`） | 登出或切换租户视角时调用 `resetRoutes()` 逐一移除动态路由 |
| `useAppStore` | 管理侧边栏折叠、暗黑模式（同步 `html.dark`）、多页签栏显隐偏好、工作区最大化与 `<KeepAlive>` 缓存视图名集合 | 仅持久化非敏感 UI 偏好至 `localStorage` |

---

## 3. API 契约目录划分 (`src/api/`)

按后端域 1:1 映射，全部手写强类型 TS 接口，所有主外键 ID（含 `tenantId`）一律声明为 `string`：
- `src/api/auth/index.ts`：对应 `/admin/auth/**`（含 `captcha`、`login`、`logout`、`info`、`routes`、个人中心 `profile`/`profile/avatar`/`password` 及在线会话 `online/page`/`online/{sessionId}`）
- `src/api/system/tenant.ts`、`tenant-package.ts`、`user.ts`、`role.ts`、`menu.ts`、`dept.ts`、`post.ts`、`dict.ts`、`config.ts`、`log.ts`、`enum.ts`：对应 `/admin/system/**`
