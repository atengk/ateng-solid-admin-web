# ADR-0002: 手写强类型 `src/api/*` 契约与 `ateng-ui` 核心集成决策

- **状态**：`Accepted`
- **日期**：2026-11-18
- **作者**：Ateng
- **关联范围**：`src/api/*`、插件初始化、路由菜单、字典、权限控制

---

## 1. 背景

核查 `ateng-ui:1.0.0` 源码后发现若干需要业务工程显式对齐与承接的集成边界：
1. `@atengk/vue` 的 `DEFAULT_OPTIONS.superAdminRoles` 默认为 `['admin', 'super_admin']`，多租户下若租户创建名为 `admin` 的角色会触发前端权限指令误放行；
2. `@atengk/element-plus` 的 `ProMenuItemNode.vue` 对字符串类型的 `icon` 仅渲染 `<i :class="itemIcon" />`，不会自动按图标名字符串解析 `@element-plus/icons-vue` 组件；
3. `AtengProLayout` 与 `AtengTabsNav` 专注于 UI 表现，`<KeepAlive>` 缓存视图需与 Vue Router 自行联动。

---

## 2. 核心决策

1. **手写强类型 `src/api/*` 契约层**：
   - 保持零 OpenAPI 生成器依赖，全部接口请求函数与请求/响应 TypeScript 接口收敛于 `src/api/`；
   - 所有雪花主键与 `tenantId` 统一声明为 `string`。
2. **安全覆写 `superAdminRoles`**：
   - 初始化 `@atengk/vue` 时强制配置 `createAtengVue({ httpClient, authManager, tenantManager, superAdminRoles: ['super_admin'] })`，与后端多租户超管角色收敛保持一致。
3. **显式配置管理端鉴权与多租户头**：
   - `AuthManager` 配置 `tokenKey: 'satoken-admin'`、`headerName: 'satoken-admin'`；
   - `TenantManager` 自动注入 `X-Tenant-Id`（默认 `"0"`），仅租户 `"0"` 且角色含 `super_admin` 时向顶栏渲染租户切换入口。
4. **菜单图标扩展点与 `<KeepAlive>` 壳封装**：
   - 遵循底层硬门禁零补丁原则，菜单字符串图标解析依赖 `atengk/ateng-ui#365` 在底座提供通用 `iconResolver` 扩展点后按配置式回调接入，不在上层魔改后端菜单结构绕过；
   - 在 `layouts/` 中结合 `useTabsNav` 对 `<router-view>` 包裹 `<KeepAlive :include="cachedViews">`。
5. **双轨字典与开关式前端监控**：
   - 通过 `DictManager` 统一对接 `/admin/system/enums`（静态枚举）与 `/admin/system/dict/data/type/*`（动态字典）；
   - 按环境变量开关初始化 `@atengk/monitor`，无外部监控服务时仅本地闭环不报错。
