import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuth } from '@atengk/vue';
import { DictManager } from '@atengk/element-plus';
import { BusinessException, type HttpRequestConfig } from '@atengk/core';
import { ElMessage } from 'element-plus';
import * as authApi from '@/api/auth';
import * as tenantApi from '@/api/system/tenant';
import type { AdminProfileVO, RouteMenuVO } from '@/api/auth';
import {
  adminAuthManager,
  adminHttpClient,
  adminTenantManager,
  registerHttpErrorHandlers,
} from '@/utils/http';
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

  it('coalesces concurrent 100002 responses on initialized business pages, recovers to tenant 0, and redirects to /dashboard without logout', async () => {
    const authStore = useAuthStore();
    const permissionStore = usePermissionStore();
    const tenantStore = useTenantStore();
    const router = createTestRouter();
    const warnSpy = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }));

    authStore.setTenantEnabled(true);
    useAuth({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] }).login({
      token: 'super-token-in-session',
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      user: createProfile(),
    });
    tenantStore.initForUser(createProfile());
    adminTenantManager.setTenantId('119405572993097728');

    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValueOnce(buildTenantRouteMenus(false));
    await permissionStore.buildRoutes(router);
    await router.push('/system/visible');
    await router.isReady();
    expect(router.currentRoute.value.path).toBe('/system/visible');

    let recoverCompleted: (() => void) | undefined;
    const recoverGate = new Promise<void>(resolve => {
      recoverCompleted = resolve;
    });

    registerHttpErrorHandlers({
      onTenantInvalid: async () => {
        await tenantStore.handleHttpInvalidTenantSwitch(router);
        recoverCompleted?.();
      },
    });

    const appStore = useAppStore();
    const resetTabsSpy = vi.fn();
    appStore.registerTabsResetHandler(resetTabsSpy);

    const infoSpy = vi
      .spyOn(authApi, 'getAuthInfo')
      .mockResolvedValueOnce(createProfile({ tenantId: '0', tenantName: '平台主租户' }));
    const routesSpy = vi
      .spyOn(authApi, 'getAuthRoutes')
      .mockResolvedValueOnce(buildTenantRouteMenus(true));

    type AdapterConfig = Parameters<
      Extract<NonNullable<HttpRequestConfig['adapter']>, (config: never) => unknown>
    >[0];
    const invalidTenantAdapter = async (config: AdapterConfig) => ({
      data: {
        code: 100002,
        msg: '目标租户不存在、已停用或已过期，无法切换',
        data: null,
      },
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      config,
    });

    try {
      await Promise.allSettled([
        adminHttpClient.get('/admin/system/user/page', { adapter: invalidTenantAdapter }),
        adminHttpClient.get('/admin/system/dept/options', { adapter: invalidTenantAdapter }),
      ]);
      await recoverGate;
    } finally {
      registerHttpErrorHandlers({});
    }

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(routesSpy).toHaveBeenCalledTimes(1);
    expect(resetTabsSpy).toHaveBeenCalledTimes(1);
    expect(authStore.isAuthenticated).toBe(true);
    expect(adminAuthManager.getToken()).toBe('super-token-in-session');
    expect(adminTenantManager.getTenantId()).toBe('0');
    expect(tenantStore.activeTenantId).toBe('0');
    expect(tenantStore.activeTenantName).toBe('平台主租户');
    expect(router.currentRoute.value.path).toBe('/dashboard');
  });

  it('defers handleHttpInvalidTenantSwitch during guard initialization, shares one recoveryPromise when concurrent, and keeps state unchanged if platform retry fails', async () => {
    const authStore = useAuthStore();
    const tenantStore = useTenantStore();
    const router = createTestRouter();

    authStore.setTenantEnabled(true);
    useAuth({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] }).login({
      token: 'super-token-alive',
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      user: createProfile(),
    });
    vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValueOnce([
      {
        id: '10002',
        tenantCode: '100002',
        tenantName: '星辰智能科技',
        status: 0,
        expireTime: null,
      },
    ]);
    await tenantStore.loadTenantOptions();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValueOnce(
      createProfile({ tenantId: '10002', tenantName: '星辰智能科技' }),
    );
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValueOnce(buildTenantRouteMenus(false));
    await tenantStore.switchTenant('10002', router);
    await router.push('/system/visible');
    expect(tenantStore.activeTenantName).toBe('星辰智能科技');

    // 1. 守卫并发初始化期内（guardInitDepth > 0），http 100002 回调必须让步，不得抢先触发恢复
    const infoCallSpy = vi.spyOn(authApi, 'getAuthInfo');
    tenantStore.setGuardInitializationActive(true);
    await tenantStore.handleHttpInvalidTenantSwitch(router);
    expect(infoCallSpy).not.toHaveBeenCalled();
    tenantStore.setGuardInitializationActive(false);

    // 2. 非初始化期内并发重入 handleHttpInvalidTenantSwitch 必须阻塞等待同一 recoveryPromise；回退触发时同步复位 ID/名称并在重试失败时不误跳转
    let releaseRetry!: (fail: boolean) => void;
    const retryGate = new Promise<boolean>(resolve => {
      releaseRetry = resolve;
    });
    const getAuthInfoSpy = vi.spyOn(authApi, 'getAuthInfo').mockImplementation(async () => {
      const shouldFail = await retryGate;
      if (shouldFail) {
        throw new BusinessException(500, '服务暂时不可用');
      }
      return createProfile({ tenantId: '0', tenantName: '平台默认租户' });
    });
    const getAuthRoutesSpy = vi
      .spyOn(authApi, 'getAuthRoutes')
      .mockResolvedValue(buildTenantRouteMenus(true));

    let secondResolved = false;
    const firstCall = tenantStore.handleHttpInvalidTenantSwitch(router);
    const secondCall = tenantStore.handleHttpInvalidTenantSwitch(router).then(() => {
      secondResolved = true;
    });

    await Promise.resolve();
    expect(secondResolved).toBe(false);
    expect(tenantStore.switching).toBe(true);
    expect(tenantStore.activeTenantId).toBe('0');
    expect(tenantStore.activeTenantName).toBe('平台默认租户');

    releaseRetry(true);
    await expect(firstCall).rejects.toBeInstanceOf(BusinessException);
    await expect(secondCall).rejects.toBeInstanceOf(BusinessException);
    expect(getAuthInfoSpy).toHaveBeenCalledTimes(1);
    expect(getAuthRoutesSpy).toHaveBeenCalledTimes(1);
    expect(tenantStore.switching).toBe(false);
    expect(tenantStore.activeTenantId).toBe('0');
    expect(tenantStore.activeTenantName).toBe('平台默认租户');
    expect(router.currentRoute.value.path).toBe('/system/visible');
  });

  it('updates activeTenantName synchronously when switchTenant and resetToPlatform start switching', async () => {
    const authStore = useAuthStore();
    const tenantStore = useTenantStore();
    const router = createTestRouter();

    authStore.setTenantEnabled(true);
    useAuth({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] }).login({
      token: 'super-token-sync-name',
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      user: createProfile(),
    });
    vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValueOnce([
      {
        id: '10002',
        tenantCode: '100002',
        tenantName: '星辰智能科技',
        status: 0,
        expireTime: null,
      },
    ]);
    await tenantStore.loadTenantOptions();
    await router.push('/system/visible');

    let resolveSwitchInfo!: (profile: AdminProfileVO) => void;
    vi.spyOn(authApi, 'getAuthInfo').mockImplementationOnce(
      () =>
        new Promise<AdminProfileVO>(resolve => {
          resolveSwitchInfo = resolve;
        }),
    );
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValueOnce(buildTenantRouteMenus(false));

    const switchPromise = tenantStore.switchTenant('10002', router);
    expect(tenantStore.switching).toBe(true);
    expect(tenantStore.activeTenantId).toBe('10002');
    expect(tenantStore.activeTenantName).toBe('星辰智能科技');

    resolveSwitchInfo(createProfile({ tenantId: '10002', tenantName: '星辰智能科技' }));
    await expect(switchPromise).resolves.toBe(true);
    expect(tenantStore.switching).toBe(false);

    let resolveResetInfo!: (profile: AdminProfileVO) => void;
    vi.spyOn(authApi, 'getAuthInfo').mockImplementationOnce(
      () =>
        new Promise<AdminProfileVO>(resolve => {
          resolveResetInfo = resolve;
        }),
    );
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValueOnce(buildTenantRouteMenus(true));

    const resetPromise = tenantStore.resetToPlatform(router);
    expect(tenantStore.switching).toBe(true);
    expect(tenantStore.activeTenantId).toBe('0');
    expect(tenantStore.activeTenantName).toBe('平台默认租户');

    resolveResetInfo(createProfile({ tenantId: '0', tenantName: '平台默认租户' }));
    await expect(resetPromise).resolves.toBe(true);
    expect(tenantStore.switching).toBe(false);
  });

  it('rolls back activeTenantId, activeTenantName and routes when switchTenant fails with non-100002 error', async () => {
    const authStore = useAuthStore();
    const permissionStore = usePermissionStore();
    const tenantStore = useTenantStore();
    const router = createTestRouter();

    authStore.setTenantEnabled(true);
    useAuth({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] }).login({
      token: 'super-token-rollback',
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      user: createProfile(),
    });
    vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValueOnce([
      {
        id: '10002',
        tenantCode: '100002',
        tenantName: '星辰智能科技',
        status: 0,
        expireTime: null,
      },
      {
        id: '10003',
        tenantCode: '100003',
        tenantName: '未来云租户',
        status: 0,
        expireTime: null,
      },
    ]);
    await tenantStore.loadTenantOptions();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValueOnce(
      createProfile({ tenantId: '10002', tenantName: '星辰智能科技' }),
    );
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValueOnce(buildTenantRouteMenus(false));
    await expect(tenantStore.switchTenant('10002', router)).resolves.toBe(true);

    vi.spyOn(authApi, 'getAuthInfo')
      .mockRejectedValueOnce(new BusinessException(500, '网络抖动'))
      .mockResolvedValueOnce(createProfile({ tenantId: '10002', tenantName: '星辰智能科技' }));
    vi.spyOn(authApi, 'getAuthRoutes')
      .mockResolvedValueOnce(buildTenantRouteMenus(false))
      .mockResolvedValueOnce(buildTenantRouteMenus(false));

    await expect(tenantStore.switchTenant('10003', router)).rejects.toBeInstanceOf(
      BusinessException,
    );
    expect(tenantStore.switching).toBe(false);
    expect(adminTenantManager.getTenantId()).toBe('10002');
    expect(tenantStore.activeTenantId).toBe('10002');
    expect(tenantStore.activeTenantName).toBe('星辰智能科技');
    expect(permissionStore.routesLoaded).toBe(true);
    expect(router.hasRoute('TenantVisiblePage')).toBe(true);
  });

  it('does not overwrite platform tenant 0 when switchTenant fails due to 401 session expiration', async () => {
    const authStore = useAuthStore();
    const tenantStore = useTenantStore();
    const router = createTestRouter();

    authStore.setTenantEnabled(true);
    useAuth({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] }).login({
      token: 'super-token-401-switch',
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      user: createProfile(),
    });
    vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValueOnce([
      {
        id: '10002',
        tenantCode: '100002',
        tenantName: '星辰智能科技',
        status: 0,
        expireTime: null,
      },
      {
        id: '10003',
        tenantCode: '100003',
        tenantName: '未来云租户',
        status: 0,
        expireTime: null,
      },
    ]);
    await tenantStore.loadTenantOptions();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValueOnce(
      createProfile({ tenantId: '10002', tenantName: '星辰智能科技' }),
    );
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValueOnce(buildTenantRouteMenus(false));
    await expect(tenantStore.switchTenant('10002', router)).resolves.toBe(true);

    // 模拟切换期间拦截器先执行 401/101005 强退清态（失活认证 + 复位租户为 '0'）后再抛出异常
    const infoSpy = vi.spyOn(authApi, 'getAuthInfo').mockImplementationOnce(async () => {
      adminAuthManager.handleUnauthorized();
      adminTenantManager.setTenantId('0');
      throw new BusinessException(401, '登录状态已过期');
    });
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValueOnce(buildTenantRouteMenus(false));

    await expect(tenantStore.switchTenant('10003', router)).rejects.toBeInstanceOf(
      BusinessException,
    );
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(authStore.isAuthenticated).toBe(false);
    expect(tenantStore.switching).toBe(false);
    expect(adminTenantManager.getTenantId()).toBe('0');
    expect(tenantStore.activeTenantId).toBe('0');
    expect(tenantStore.activeTenantName).toBe('平台默认租户');
  });
});
