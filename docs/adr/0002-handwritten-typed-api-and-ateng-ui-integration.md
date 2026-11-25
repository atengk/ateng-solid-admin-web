# ADR-0002: 手写强类型 `src/api/*` 契约与 `ateng-ui` 核心集成决策

- **状态**：`Accepted`（`2026-11-25` 后 `#373`–`#376` 装配与双轨字典定稿修订）
- **日期**：2026-11-18（修订：`2026-11-25`）
- **作者**：Ateng
- **关联范围**：`src/api/*`、`src/utils/{http,dict,icon}.ts`、插件初始化、路由菜单、双轨字典、权限与上传/导出集成

---

## 1. 背景

核查 `ateng-ui:1.0.0` 源码后发现若干需要业务工程显式对齐与承接的集成边界：
1. `@atengk/vue` 的 `DEFAULT_OPTIONS.superAdminRoles` 默认为 `['admin', 'super_admin']`，多租户下若租户创建名为 `admin` 的角色会触发前端权限指令误放行；
2. `@atengk/element-plus` 的 `ProMenuItemNode.vue` 对字符串类型的 `icon` 仅渲染 `<i :class="itemIcon" />`，不会自动按图标名字符串解析 `@element-plus/icons-vue` 组件；
3. `AtengProLayout` 与 `AtengTabsNav` 专注于 UI 表现，`<KeepAlive>` 缓存视图需与 Vue Router 自行联动。

---

## 2. 核心决策

1. **手写强类型 `src/api/*` 契约层（12 个域文件）**：
   - 保持零 OpenAPI 生成器依赖，全部接口请求函数与请求/响应 TypeScript 契约收敛于 `src/api/`（`auth/index.ts` + `system/{tenant,tenant-package,user,role,menu,dept,post,dict,config,log,enum}.ts`）；
   - 请求/响应对象使用 `interface`、联合字面量使用 `type`；所有雪花主键、外键与 `tenantId` 统一声明为 `string`/`string[]`，`sys_user.gender` 声明为 `'0' | '1' | '2'`；长耗时 500 行导入接口 `POST /admin/system/user/import` 显式配置请求级 `timeout: 120_000`。
2. **安全覆写 `superAdminRoles` 与三单例双保险**：
   - 在 `src/utils/http.ts` 集中导出 `adminAuthManager`（`tokenKey: 'satoken-admin'`、`headerName: 'satoken-admin'`）、`adminTenantManager`（`tenantKey: 'solid-tenant-id'`、`headerName: 'X-Tenant-Id'`）与 `adminHttpClient`；
   - `main.ts` 在 `app.use(router)` 前强制安装 `createAtengVue({ httpClient: adminHttpClient, authManager: adminAuthManager, tenantManager: adminTenantManager, superAdminRoles: ['super_admin'], defaultSize: 10 })`，且脱离组件 `setup()` 的 Store/守卫/工具层必须显式传入对应实例防上下文回落。
3. **图标解析、单源页签与受控上传/导出红线（对齐 `ateng-ui#373`–`#376`）**：
   - 字符串菜单/标签图标统一通过 `src/utils/icon.ts` `resolveMenuIcon` 映射 `@element-plus/icons-vue`；
   - `AtengTabsNav` + `useTabsNav` 采用单源受控契约：启用 `:emit-close-on-batch="false"` 与 `@batch-close` 一次性同步，并通过 `:menu-icons` 替换为线性 SVG 图标；布局壳装配详见 [ADR-0003](./0003-lightweight-scheme-a-admin-layout-and-state-assembly.md)；
   - `AtengUpload` 强制传入 `:http-request` 桥接 `adminHttpClient`（禁止默认 XHR `action`）；`AtengExcelFeedback` 强制传入 `:download-action` 桥接 `adminHttpClient`；`AtengCaptcha` 图形模式绑定 `:refresh` Prop 回调；
   - **底座锁版门禁**：本地 `.yalc/@atengk/element-plus` 仅用于前置开发联调，合入 `dev`/`main` 前必须切换回包含 `#373`–`#376` 修复的正式 npm 发布版本。
4. **数学互斥双轨 `DictManager`（`src/utils/dict.ts`）**：
   - 同时注册 `DictManager.setProvider` 与 `DictManager.setBatchProvider`：依据后端命名契约，**`lowerCamelCase`（含大写字母 `/[A-Z]/`）** 路由至静态枚举（单查 `GET /admin/system/enums/{name}`、批查 `POST /admin/system/enums/batch`，将 `OptionItem` 映射为 `DictItem`）；**`snake_case`（`^[a-z][a-z0-9_]{1,63}$`）** 路由至动态字典（`GET /admin/system/dict/data/type/{dictType}`），统一将 `tagType === 'default'` 或空串归一化为 `undefined`；首期不预装 `@atengk/monitor`，待二期按需引入。
