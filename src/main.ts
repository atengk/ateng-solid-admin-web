import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import { createAuthManager } from '@atengk/core';
import { createAtengVue } from '@atengk/vue';
import AtengElementPlus from '@atengk/element-plus';
import './styles/main.css';
import App from './App.vue';

/**
 * 管理后台前端应用启动入口，显式装配管理端多账号 AuthManager 与收敛超管角色集合。
 *
 * @author Ateng
 * @since 2026-11-19
 */
const adminAuthManager = createAuthManager({
  tokenKey: 'satoken-admin',
  headerName: 'satoken-admin',
});

const app = createApp(App);

app.use(createPinia());
app.use(ElementPlus);
app.use(
  createAtengVue({
    authManager: adminAuthManager,
    // TODO(Ateng): Spec 2 装配 src/utils/http.ts 时须同步绑定 httpClient 与 tenantManager，避免 usePagination/useRequest 回落至全局默认 http 单例
    // TODO(Ateng): 待 @atengk/vue 发布含 #362/#363/#364 修复的 1.0.1+/1.1.0+ 正式版至 npm 后取消注释
    // superAdminRoles: ['super_admin'],
  }),
);
app.use(AtengElementPlus);

app.mount('#app');
