# ADR-0003: 方案 A 轻量 `AdminLayout` 布局壳、单源鉴权状态桥接与上下文双保险

- **状态**：`Accepted`
- **日期**：2026-11-25
- **作者**：Ateng
- **关联范围**：`src/layouts/`、`src/stores/`、`src/utils/http.ts`、`src/main.ts`、`@atengk/element-plus` / `@atengk/vue` 集成

---

## 1. 背景与源码核验

结合第一阶段定稿的 **方案 A + `Precision Slate & Cobalt`** 视觉规格（`228px/60px` 左侧导航栏 + `48px` 单行顶栏 + `36px` 多页签栏 + 跨租户观察态通栏横幅）及对 `ateng-ui` 修复 `#373`–`#376` 后源码的实测核验，发现两类需明确架构边界的问题：

1. **`AtengProLayout` 与方案 A 存在结构性摩擦**：
   - `ProLayoutMain.vue` 仅提供 `<ProLayoutTabs />` 与带内边距的 `<AtengContent />`，缺少「多页签栏下方、内容区上方」的全宽通栏横幅插槽；若硬塞 36px 跨租户观察态横幅，必须依赖负 `margin` 黑魔法或置 `contentPadding="0px"` 再在所有业务页面手动补内边距；
   - `ProMenu` / `ProMenuItemNode.vue` 面向通用树形折叠手风琴，不支持方案 A 要求的轻量平铺领域分组头（`ElMenuItemGroup`），且在 `depth >= 1` 时内联写入 `paddingLeft: ... !important`，无法通过 CSS 变量温和覆写；
   - 方案 A 锁定单一 `side` 布局形态，无需承载 `top` / `mix` 三模分支复杂度；但 `AtengTabsNav`（后 `#376` 已支持 `emitCloseOnBatch`、`@batch-close`、`menuIcons`、`iconResolver`）、`useTabsNav` 及公开导出的 `ATENG_PRO_LAYOUT_KEY` 高度适配本系统。
2. **脱离 `setup()` 时的全局上下文回落与双份权限状态风险**：
   - `@atengk/vue` 的 `useAtengConfig()` 在 `hasInjectionContext() === false`（Pinia Store 异步动作、Vue Router 守卫、`src/utils/*`、未挂载插件的 Vitest 用例）时会静默回落至 `@atengk/core` 全局默认单例（`tokenKey: 'token'`、`superAdminRoles: ['admin', 'super_admin']`）；
   - `v-permission` / `v-role` 指令通过 `useAuth({ authManager, superAdminRoles })` 按 `AuthManager` 实例维度读取内部 `WeakMap` 响应式状态，若 `useAuthStore` 另建独立 `ref` 维护 `roles`/`permissions`，极易出现 Store 与指令状态漂移。

---

## 2. 核心决策

### 2.1 自建轻量方案 A `AdminLayout.vue` + 100% 组合复用 `ateng-ui` 核心基建
1. **组件拆分**（内聚于 `src/layouts/`）：
   - `AdminLayout.vue`：主骨架容器（Tailwind v4 Flex 布局 + `--solid-*` 变量），负责协调 `<router-view>`、`<KeepAlive :include="cachedViews">`、`refreshingKey` 局部重载、内容区最大化（含 `Esc` 退出）及移动端 `<768px` 抽屉遮罩；
   - `AdminSidebar.vue`：`228px` / 折叠 `60px` 侧栏，顶部 `48px` 品牌区，采用 Element Plus `ElMenu` + `ElMenuItemGroup`（平铺领域分组头）+ `resolveMenuIcon`，保留左侧 `3px` 激活指示条；
   - `AdminHeader.vue`：`48px` 单行顶栏，左侧折叠按钮 + 动态面包屑，右侧依次挂载租户切换器/只读胶囊（受 `tenantEnabled` 控制）、明暗主题切换与用户下拉菜单；
   - `TenantObserveBanner.vue`：`36px` 琥珀金全宽通栏警示条，精准坐落于 `AtengTabsNav` 与 `<main>` 内容区之间，仅当平台超管处于跨租户观察态（`isObservingTenant === true`）时展示并提供一键切回 `"0"` 按钮。
2. **总线兼容与组件复用**：
   - `AdminLayout.vue` 主动调用 `provide(ATENG_PRO_LAYOUT_KEY, context)`，向后代提供 `collapsed`、`asideWidth`、`headerHeight`、`tabsHeight`、`layout: computed(() => 'side')`、`isMobile`、`isMaximized`、`toggleCollapse`、`toggleMaximize`，使 `AtengTabsNav` 最大化按钮、`AtengFooterBar` 等所有布局总线消费件原生无缝联动；
   - 多标签页 100% 复用 `@atengk/vue` `useTabsNav` + `@atengk/element-plus` `AtengTabsNav`（启用 `#376` 新 API：`:emit-close-on-batch="false"`、`@batch-close`、`style-type="line"`、`height="36px"`、`:icon-resolver`、`:menu-icons` 替换为 `@element-plus/icons-vue` 线性图标）。

### 2.2 单源 `useAuth` `WeakMap` 桥接与上下文双保险
1. **唯一真源实例（`src/utils/http.ts`）**：集中构造并导出 `adminAuthManager`（`tokenKey: 'satoken-admin'`、`headerName: 'satoken-admin'`）、`adminTenantManager`（`tenantKey: 'solid-tenant-id'`、`headerName: 'X-Tenant-Id'`）与 `adminHttpClient`。
2. **`main.ts` 强时序挂载**：`app.use(createAtengVue({ httpClient: adminHttpClient, authManager: adminAuthManager, tenantManager: adminTenantManager, superAdminRoles: ['super_admin'], defaultSize: 10 }))` **必须在 `app.use(router)` 与任何 Store 首次调度之前执行**。
3. **`setup()` 外显式注入双保险**：凡在 Pinia Store、路由守卫、`src/utils/*` 或单元测试中调用 `@atengk/vue` Composable 或网络请求时，一律显式传入 `{ authManager: adminAuthManager, tenantManager: adminTenantManager, httpClient: adminHttpClient }`。
4. **`useAuthStore` 零漂移桥接**：`useAuthStore` 直接代理 `useAuth<AdminProfileVO>({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] })` 返回的响应式 `token`、`user`、`roles`、`permissions`、`hasPermission`、`hasRole`，与 `v-permission` / `v-role` 指令共享同一底层 `WeakMap` 状态实例，杜绝双份状态不一致。

---

## 3. 后果与权衡

- **优点**：
  - `AdminLayout` 套件总代码量约 200 行，零负 `margin`、零覆盖底座 `!important` 样式，100% 还原方案 A 视觉标尺；
  - 完整保留 `AtengTabsNav`、`useTabsNav`、`ATENG_PRO_LAYOUT_KEY`、`AtengLoading`、`AtengWatermark` 等核心底座价值；
  - 彻底消除脱离组件上下文时的隐性单例回落 bug 与权限指令状态漂移。
- **代价与约束**：
  - 首期仅支持方案 A 单一左侧栏布局，若二期确需新增顶部/混合双栏布局模式，可在 `src/layouts/` 增量扩展或评估复用 `AtengProLayout`；
  - 侧栏响应断点（`<768px`）与 `Esc` 退出最大化监听器由 `AdminLayout.vue` 自行维护并在 `onBeforeUnmount` 确定性清理。
