import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuth } from '@atengk/vue';
import { DictManager } from '@atengk/element-plus';
import { BusinessException } from '@atengk/core';
import * as authApi from '@/api/auth';
import * as tenantApi from '@/api/system/tenant';
import type { AdminProfileVO, RouteMenuVO } from '@/api/auth';
import { adminAuthManager, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { usePermissionStore } from '@/stores/permission';
import { useTenantStore } from '@/stores/tenant';

/**
 * 多租户上下文 Store 单元测试（普通用户防越权写入、超管 7 步强时序切换与 100002 回退保护）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

function createProfile(overrides: Partial<AdminProfileVO> = {}): AdminProfileVO {
  return {
    userId: '1859201948101000001',
    tenantId: '0',
    tenantName: '平台默认租户',
    username: 'superadmin',
    nickname: '超级管理员',
    avatar: null,
    roles: ['super_admin'],
    permissions: ['*:*:*'],
    passwordNeedsChange: false,
    loginIp: '127.0.0.1',
    loginDate: '2026-11-25 10:00:00',
    ...overrides,
  };
}

function buildTenantRouteMenus(includePlatformMenu: boolean): RouteMenuVO[] {
  return [
    {
      id: '1000',
      parentId: '0',
      menuType: 'M',
      title: '组织权限',
      path: '/system',
      sort: 1,
      visible: 0,
      children: [
        {
          id: '1100',
          parentId: '1000',
          menuType: 'C',
          title: '工作台直达',
          name: 'TenantVisiblePage',
          path: '/system/visible',
          component: 'dashboard/index',
          sort: 1,
          visible: 0,
          children: [],
        },
        ...(includePlatformMenu
          ? [
              {
                id: '3100',
                parentId: '1000',
                menuType: 'C' as const,
                title: '租户管理',
                name: 'SysTenant',
                path: '/system/tenant',
                component: 'dashboard/index',
                sort: 2,
                visible: 0 as const,
                platformOnly: true,
                children: [],
              },
            ]
          : []),
      ],
    },
  ];
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'RootLayout',
        component: { template: '<router-view />' },
        children: [
          {
            path: '/dashboard',
            name: 'Dashboard',
            component: { template: '<div>dashboard</div>' },
          },
          {
            path: '/profile',
            name: 'Profile',
            component: { template: '<div>profile</div>' },
          },
        ],
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'NotFound',
        component: { template: '<div>404</div>' },
      },
    ],
  });
}

describe('useTenantStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    adminTenantManager.setTenantId('0');
  });

  it('prevents ordinary tenant users from writing non-owned tenantId', async () => {
    const authStore = useAuthStore();
    const tenantStore = useTenantStore();
    authStore.setTenantEnabled(true);

    // 即使切换前有人篡改 localStorage 为其他租户，initForUser 也必须立即矫正为真实归属租户
    adminTenantManager.setTenantId('9999');
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createProfile({
        tenantId: '10002',
        tenantName: '星辰智能科技',
        username: 'xc_admin',
        roles: ['tenant_admin'],
        permissions: ['system:user:list'],
      }),
    );

    await authStore.fetchUserInfo();

    expect(tenantStore.activeTenantId).toBe('10002');
    expect(adminTenantManager.getTenantId()).toBe('10002');
    expect(tenantStore.isSuperAdminTenantSwitchAllowed).toBe(false);
    expect(tenantStore.isObservingTenant).toBe(false);

    const switched = await tenantStore.switchTenant('20003');
    expect(switched).toBe(false);
    expect(tenantStore.activeTenantId).toBe('10002');
    expect(adminTenantManager.getTenantId()).toBe('10002');

    // 普通用户无权加载切换租户选项
    await tenantStore.loadTenantOptions();
    expect(tenantStore.tenantOptions).toEqual([]);
  });

  it('resets stale non-zero tenantId back to 0 when tenantEnabled is false even for super_admin', async () => {
    const authStore = useAuthStore();
    const tenantStore = useTenantStore();

    authStore.setTenantEnabled(false);
    adminTenantManager.setTenantId('10002');
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());

    await authStore.fetchUserInfo();

    expect(adminTenantManager.getTenantId()).toBe('0');
    expect(tenantStore.activeTenantId).toBe('0');
    expect(tenantStore.isObservingTenant).toBe(false);
  });

  it('executes switchTenant in strict 7-step order and redirects to /dashboard if current route vanishes', async () => {
    const authStore = useAuthStore();
    const appStore = useAppStore();
    const permissionStore = usePermissionStore();
    const tenantStore = useTenantStore();
    const router = createTestRouter();

    authStore.setTenantEnabled(true);
    useAuth({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] }).login({
      token: 'super-token',
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      user: createProfile(),
    });
    tenantStore.initForUser(createProfile());

    // 先加载平台视图（包含 /system/tenant），并停留在该平台专属路由
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValueOnce(buildTenantRouteMenus(true));
    await permissionStore.buildRoutes(router);
    await router.push('/system/tenant');
    expect(router.currentRoute.value.path).toBe('/system/tenant');

    // 记录严格 7 步执行轨迹
    const sequence: string[] = [];
    const origSetTenantId = adminTenantManager.setTenantId.bind(adminTenantManager);
    vi.spyOn(adminTenantManager, 'setTenantId').mockImplementation(id => {
      sequence.push(`1.setTenantId:${id}`);
      origSetTenantId(id);
    });
    vi.spyOn(DictManager, 'clearCache').mockImplementation(() => {
      sequence.push('2.clearDictCache');
    });
    appStore.registerTabsResetHandler(() => {
      sequence.push('3.closeNonAffixTabs');
    });
    const origResetRoutes = permissionStore.resetRoutes.bind(permissionStore);
    vi.spyOn(permissionStore, 'resetRoutes').mockImplementation(r => {
      sequence.push('4.resetRoutes');
      origResetRoutes(r);
    });
    vi.spyOn(authApi, 'getAuthInfo').mockImplementation(async () => {
      sequence.push('5a.fetchUserInfo');
      return createProfile({
        tenantId: '10002',
        tenantName: '星辰智能科技',
        roles: ['super_admin'],
      });
    });
    vi.spyOn(authApi, 'getAuthRoutes').mockImplementation(async () => {
      sequence.push('5b.buildRoutes');
      return buildTenantRouteMenus(false);
    });
    vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValue([
      { id: '10002', tenantCode: '100002', tenantName: '星辰智能科技' },
    ]);

    await tenantStore.loadTenantOptions();
    const result = await tenantStore.switchTenant('10002', router);

    expect(result).toBe(true);
    expect(sequence).toEqual([
      '1.setTenantId:10002',
      '2.clearDictCache',
      '3.closeNonAffixTabs',
      '4.resetRoutes',
      '5a.fetchUserInfo',
      '5b.buildRoutes',
    ]);
    expect(tenantStore.activeTenantId).toBe('10002');
    expect(tenantStore.activeTenantName).toBe('星辰智能科技');
    expect(tenantStore.isObservingTenant).toBe(true);
    expect(router.hasRoute('SysTenant')).toBe(false);
    // 原位置 /system/tenant 在目标租户下不存在，自动回退 /dashboard
    expect(router.currentRoute.value.path).toBe('/dashboard');
  });

  it('recovers back to platform tenant 0 without logging out super_admin when backend returns 100002', async () => {
    const authStore = useAuthStore();
    const permissionStore = usePermissionStore();
    const tenantStore = useTenantStore();
    const router = createTestRouter();

    authStore.setTenantEnabled(true);
    useAuth({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] }).login({
      token: 'super-token-alive',
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      user: createProfile(),
    });
    tenantStore.initForUser(createProfile());
    await router.push('/system/visible');

    // 第 1 次请求切换到失效租户 9999 抛 100002，第 2 次复位到 '0' 后恢复正常数据
    vi.spyOn(authApi, 'getAuthInfo')
      .mockRejectedValueOnce(new BusinessException(100002, '目标租户不存在或已过期'))
      .mockResolvedValueOnce(createProfile({ tenantId: '0', tenantName: '平台默认租户' }));
    vi.spyOn(authApi, 'getAuthRoutes')
      .mockRejectedValueOnce(new BusinessException(100002, '目标租户不存在或已过期'))
      .mockResolvedValueOnce(buildTenantRouteMenus(true));

    const switched = await tenantStore.switchTenant('9999', router);

    expect(switched).toBe(false);
    // 平台超级管理员会话必须保留
    expect(authStore.isAuthenticated).toBe(true);
    expect(adminAuthManager.getToken()).toBe('super-token-alive');
    // 租户已回退至平台 '0'
    expect(adminTenantManager.getTenantId()).toBe('0');
    expect(tenantStore.activeTenantId).toBe('0');
    expect(tenantStore.activeTenantName).toBe('平台默认租户');
    expect(tenantStore.isObservingTenant).toBe(false);
    expect(permissionStore.routesLoaded).toBe(true);
    expect(router.currentRoute.value.path).toBe('/dashboard');
  });
});
