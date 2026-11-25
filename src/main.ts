import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs';
import { createAtengVue } from '@atengk/vue';
import AtengElementPlus from '@atengk/element-plus';
import {
  adminAuthManager,
  adminHttpClient,
  adminTenantManager,
  registerHttpErrorHandlers,
} from './utils/http';
import { setupDictManager } from './utils/dict';
import { initAppTheme } from './stores/app';
import { useAuthStore } from './stores/auth';
import { useTenantStore } from './stores/tenant';
import { router } from './router';
import { setupRouterGuards } from './router/guards';
import './styles/main.css';
import App from './App.vue';

/**
 * 管理后台前端应用启动入口：严格执行 8 步初始化时序装配主题、字典、Pinia、ateng-ui 三单例、全局异常回调与动态路由。
 *
 * @author Ateng
 * @since 2026-11-19
 */

// 1. 初始化主题引擎（不传 themeColor，保留 Light/Dark 双主色 CSS 变量切换）
initAppTheme();

// 2. 注册双轨（静态枚举 + 动态字典）分发器至 DictManager
setupDictManager();

const app = createApp(App);
const pinia = createPinia();

// 3. 挂载 Pinia 状态管理插件
app.use(pinia);

// 4. 挂载 Element Plus 及中文语言包
app.use(ElementPlus, { locale: zhCn });

// 5. 挂载 @atengk/vue（必须在 app.use(router) 与任何 Store 调用之前，覆盖 superAdminRoles）
app.use(
  createAtengVue({
    httpClient: adminHttpClient,
    authManager: adminAuthManager,
    tenantManager: adminTenantManager,
    superAdminRoles: ['super_admin'],
    defaultSize: 10,
  }),
);

// 6. 挂载 @atengk/element-plus 通用业务组件与指令插件
app.use(AtengElementPlus);

// 7. 接线全局 HTTP 异常会话/租户回调，装配导航守卫并挂载 Vue Router
registerHttpErrorHandlers({
  onSessionExpired: async () => {
    const authStore = useAuthStore(pinia);
    const currentRoute = router.currentRoute.value;
    const redirect = currentRoute.meta.public ? undefined : currentRoute.fullPath;
    await authStore.logout({ remote: false, router, redirect });
  },
  onTenantInvalid: async () => {
    await useTenantStore(pinia).handleHttpInvalidTenantSwitch(router);
  },
});
setupRouterGuards(router, pinia);
app.use(router);

// 8. 挂载应用根实例
app.mount('#app');
