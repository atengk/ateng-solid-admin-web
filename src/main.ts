import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs';
import { createAtengVue } from '@atengk/vue';
import AtengElementPlus, { initTheme } from '@atengk/element-plus';
import { adminAuthManager, adminHttpClient, adminTenantManager } from './utils/http';
import { setupDictManager } from './utils/dict';
import './styles/main.css';
import App from './App.vue';

/**
 * 管理后台前端应用启动入口：按严格时序装配主题引擎、双轨字典分发器、Pinia、Element Plus 中文语言包及 ateng-ui 三单例。
 *
 * @author Ateng
 * @since 2026-11-19
 */

// 1. 初始化主题引擎（不传 themeColor，保留 Light/Dark 双主色 CSS 变量切换）与双轨字典
initTheme({
  storageKey: 'solid-theme-mode',
  defaultMode: 'light',
  listenSystemPreference: true,
});
setupDictManager();

// 2. 创建根实例并严格按序挂载核心插件（router 接入时须位于 createAtengVue 之后）
const app = createApp(App);

app.use(createPinia());
app.use(ElementPlus, { locale: zhCn });
app.use(
  createAtengVue({
    httpClient: adminHttpClient,
    authManager: adminAuthManager,
    tenantManager: adminTenantManager,
    superAdminRoles: ['super_admin'],
    defaultSize: 10,
  }),
);
app.use(AtengElementPlus);

app.mount('#app');
