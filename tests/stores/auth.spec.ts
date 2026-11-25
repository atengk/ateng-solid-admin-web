import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuth } from '@atengk/vue';
import { DictManager } from '@atengk/element-plus';
import * as authApi from '@/api/auth';
import { type AdminLoginVO, type AdminProfileVO } from '@/api/auth';
import { adminAuthManager, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';
import { useAppStore } from '@/stores/app';

/**
 * 认证状态与 UI 偏好 Store 单元测试（super_admin 放行 vs 普通 admin 严格校验、WeakMap 零漂移与登出清理）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

function createProfile(overrides: Partial<AdminProfileVO> = {}): AdminProfileVO {
  return {
    userId: '1859201948101000001',
    tenantId: '0',
    tenantName: '平台默认租户',
    username: 'tester',
    nickname: '测试员',
    avatar: null,
    roles: [],
    permissions: [],
    passwordNeedsChange: false,
    loginIp: '127.0.0.1',
    loginDate: '2026-11-25 10:00:00',
    ...overrides,
  };
}

describe('useAuthStore & useAppStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    adminTenantManager.setTenantId('0');
  });

  it('grants all permissions only for super_admin role while enforcing strict permission checks for admin role', async () => {
    const authStore = useAuthStore();

    // 普通角色编码 "admin" 必须被严格校验，严禁触发底座默认超级管理员免检
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValueOnce(
      createProfile({
        roles: ['admin'],
        permissions: ['system:user:list'],
      }),
    );
    await authStore.fetchUserInfo();

    expect(authStore.hasRole('admin')).toBe(true);
    expect(authStore.hasPermission('system:user:list')).toBe(true);
    expect(authStore.hasPermission('system:user:delete')).toBe(false);

    // 平台超级管理员角色 "super_admin" 放行全部按钮权限
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValueOnce(
      createProfile({
        roles: ['super_admin'],
        permissions: [],
      }),
    );
    await authStore.fetchUserInfo();

    expect(authStore.hasRole('super_admin')).toBe(true);
    expect(authStore.hasPermission('system:user:delete')).toBe(true);
    expect(authStore.hasPermission(['system:tenant:create', 'system:role:delete'], 'every')).toBe(
      true,
    );
  });

  it('shares a single WeakMap reactive source between useAuthStore and useAuth({ authManager: adminAuthManager })', async () => {
    const authStore = useAuthStore();
    const directiveSideAuth = useAuth<AdminProfileVO>({
      authManager: adminAuthManager,
      superAdminRoles: ['super_admin'],
    });

    vi.spyOn(authApi, 'login').mockResolvedValue({
      tokenName: 'satoken-admin',
      tokenValue: 'jwt-solid-token',
      expireIn: 7200,
      tenantId: '10002',
      tenantName: '星辰智能科技',
    } satisfies AdminLoginVO);
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createProfile({
        tenantId: '10002',
        tenantName: '星辰智能科技',
        roles: ['tenant_admin'],
        permissions: ['system:user:create'],
      }),
    );

    await authStore.login({
      tenantCode: '100002',
      username: 'xc_admin',
      password: 'Password@123',
    });
    expect(directiveSideAuth.token.value).toBe('jwt-solid-token');
    expect(directiveSideAuth.isAuthenticated.value).toBe(true);

    await authStore.fetchUserInfo();
    expect(directiveSideAuth.roles.value).toEqual(['tenant_admin']);
    expect(directiveSideAuth.hasPermission('system:user:create')).toBe(true);

    // 反向从 useAuth 侧更新权限时，authStore 响应式同步感知（零漂移）
    directiveSideAuth.setPermissions(['system:dept:list']);
    expect(authStore.permissions).toEqual(['system:dept:list']);
    expect(authStore.hasPermission('system:user:create')).toBe(false);
    expect(authStore.hasPermission('system:dept:list')).toBe(true);
  });

  it('clears token, tenant id to 0, DictManager cache, and dynamic routes on logout and clearLocalSession', async () => {
    const authStore = useAuthStore();
    const permissionStore = usePermissionStore();
    const appStore = useAppStore();
    const clearCacheSpy = vi.spyOn(DictManager, 'clearCache');
    const logoutSpy = vi.spyOn(authApi, 'logout').mockResolvedValue();
    const resetTabsSpy = vi.fn();
    appStore.registerTabsResetHandler(resetTabsSpy);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', name: 'Login', component: { template: '<div>login</div>' } },
        { path: '/', name: 'RootLayout', component: { template: '<router-view />' } },
      ],
    });
    router.addRoute('RootLayout', {
      name: 'DynamicTemp',
      path: '/system/temp',
      component: { template: '<div>temp</div>' },
    });
    permissionStore.registeredRouteNames.push('DynamicTemp');
    permissionStore.routesLoaded = true;

    useAuth({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] }).login({
      token: 'active-token',
      roles: ['super_admin'],
      permissions: ['*:*:*'],
    });
    adminTenantManager.setTenantId('10002');
    authStore.isInitialized = true;

    await authStore.logout({ router, redirect: '/system/temp' });

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(adminAuthManager.getToken()).toBeNull();
    expect(authStore.isAuthenticated).toBe(false);
    expect(authStore.isInitialized).toBe(false);
    expect(adminTenantManager.getTenantId()).toBe('0');
    expect(clearCacheSpy).toHaveBeenCalled();
    expect(resetTabsSpy).toHaveBeenCalled();
    expect(permissionStore.routesLoaded).toBe(false);
    expect(router.hasRoute('DynamicTemp')).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/system/temp');
  });

  it('persists non-sensitive UI preferences and applies theme without inline themeColor override', () => {
    const appStore = useAppStore();

    // 不传 themeColor 时严禁在内联样式强行注入 --el-color-primary 覆盖双主色静态令牌
    expect(document.documentElement.style.getPropertyValue('--el-color-primary')).toBe('');

    appStore.toggleSidebar(true);
    appStore.setThemeMode('dark');
    appStore.setShowTabsBar(false);
    appStore.setMobile(true);
    appStore.toggleCommandPalette(true);

    expect(localStorage.getItem('solid-sidebar-collapsed')).toBe('true');
    expect(localStorage.getItem('solid-theme-mode')).toBe('dark');
    expect(localStorage.getItem('solid-show-tabs')).toBe('false');
    expect(appStore.themeMode).toBe('dark');
    expect(appStore.activeTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--el-color-primary')).toBe('');
    expect(appStore.isMobile).toBe(true);
    expect(appStore.commandPaletteVisible).toBe(true);

    appStore.setThemeMode('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    appStore.dispose();
  });
});
