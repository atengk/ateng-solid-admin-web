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
    // TODO(Ateng): superAdminRoles 已在 ateng-ui#364 合入 dev，待 @atengk/vue 1.0.1+ 正式发布至 npm 后取消注释
    // superAdminRoles: ['super_admin'],
  }),
);
app.use(AtengElementPlus);

app.mount('#app');
