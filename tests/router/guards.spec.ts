import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { ElMessage } from 'element-plus';
import { AtengLoadingBar } from '@atengk/element-plus';
import type { HttpRequestConfig } from '@atengk/core';
import * as authApi from '@/api/auth';
import type { AdminProfileVO, RouteMenuVO } from '@/api/auth';
import {
  adminAuthManager,
  adminHttpClient,
  adminTenantManager,
  registerHttpErrorHandlers,
} from '@/utils/http';
import { createAppRouter } from '@/router';
import { sanitizeRedirectTarget, setupRouterGuards } from '@/router/guards';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';
import { useTenantStore } from '@/stores/tenant';

/**
 * 静态路由、导航守卫与同源安全 redirect 白名单单元测试。
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

function createSampleRoutes(): RouteMenuVO[] {
  return [
    {
      id: '1000',
      parentId: '0',
      menuType: 'M',
      title: '基础域',
      path: '/system',
      sort: 1,
      visible: 0,
      children: [
        {
          id: '1100',
          parentId: '1000',
          menuType: 'C',
          title: '工作台子页',
          name: 'GuardTestView',
          path: '/system/guard-view',
          component: 'dashboard/index',
          sort: 1,
          visible: 0,
          keepAlive: true,
          children: [],
        },
      ],
    },
  ];
}

describe('router & guards', () => {
  beforeEach(() => {
    vi.spyOn(AtengLoadingBar, 'start').mockImplementation(() => {});
    vi.spyOn(AtengLoadingBar, 'finish').mockImplementation(() => {});
    vi.spyOn(AtengLoadingBar, 'error').mockImplementation(() => {});
  });

  it('validates redirect targets strictly to block open redirects', () => {
    expect(sanitizeRedirectTarget('/system/user?page=2')).toBe('/system/user?page=2');
    expect(sanitizeRedirectTarget('/profile#pwd')).toBe('/profile#pwd');
    expect(sanitizeRedirectTarget('https://evil.com')).toBeUndefined();
    expect(sanitizeRedirectTarget('//evil.com')).toBeUndefined();
    expect(sanitizeRedirectTarget('/\\evil.com')).toBeUndefined();
    expect(sanitizeRedirectTarget('/%2f%2fevil.com')).toBeUndefined();
    expect(sanitizeRedirectTarget('/login?redirect=/dashboard')).toBeUndefined();
    expect(sanitizeRedirectTarget('/403')).toBeUndefined();
    expect(sanitizeRedirectTarget('/404')).toBeUndefined();
  });

  it('redirects unauthenticated navigation to /login?redirect= while allowing public /login', async () => {
    const pinia = createPinia();
    const router = createAppRouter(createMemoryHistory());
    setupRouterGuards(router, pinia);

    await router.push('/system/guard-view?tab=base');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/system/guard-view?tab=base');
    expect(AtengLoadingBar.start).toHaveBeenCalled();
    expect(AtengLoadingBar.finish).toHaveBeenCalled();

    // 公开 /403 允许未登录直接展示，而未知路径未登录也应拦截至登录页
    await router.push('/unknown-secret');
    expect(router.currentRoute.value.path).toBe('/login');
  });

  it('redirects authenticated access on /login with unsafe redirect back to /dashboard', async () => {
    const pinia = createPinia();
    const router = createAppRouter(createMemoryHistory());
    setupRouterGuards(router, pinia);

    adminAuthManager.setToken('valid-token');
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(createSampleRoutes());

    await router.push('/login?redirect=//evil.com/phish');
    await router.isReady();

    expect(router.currentRoute.value.path).toBe('/dashboard');
    expect(useAuthStore(pinia).isInitialized).toBe(true);
    expect(usePermissionStore(pinia).routesLoaded).toBe(true);
  });

  it('loads info and dynamic routes automatically on direct deep link and resolves after second pass', async () => {
    const pinia = createPinia();
    const router = createAppRouter(createMemoryHistory());
    setupRouterGuards(router, pinia);

    adminAuthManager.setToken('valid-token');
    const infoSpy = vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    const routesSpy = vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(createSampleRoutes());

    await router.push('/system/guard-view?from=bookmark');
    await router.isReady();

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(routesSpy).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.name).toBe('GuardTestView');
    expect(router.currentRoute.value.fullPath).toBe('/system/guard-view?from=bookmark');
  });

  it('protects zero-menu accounts by redirecting unauthorized dynamic paths to /403 while permitting /dashboard', async () => {
    const pinia = createPinia();
    const router = createAppRouter(createMemoryHistory());
    setupRouterGuards(router, pinia);

    adminAuthManager.setToken('valid-token');
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createProfile({ roles: ['empty_role'], permissions: [] }),
    );
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue([]);

    await router.push('/system/user');
    await router.isReady();
    expect(router.currentRoute.value.path).toBe('/403');

    // /dashboard 为基础工作台静态页，零菜单用户仍可进入查看受限引导卡
    await router.push('/dashboard');
    expect(router.currentRoute.value.path).toBe('/dashboard');
  });

  it('clears local session and redirects to /login when initial info/routes loading fails', async () => {
    const pinia = createPinia();
    const router = createAppRouter(createMemoryHistory());
    setupRouterGuards(router, pinia);

    adminAuthManager.setToken('broken-token');
    vi.spyOn(authApi, 'getAuthInfo').mockRejectedValue(new Error('network error'));
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue([]);

    await router.push('/dashboard');
    await router.isReady();

    expect(adminAuthManager.getToken()).toBeNull();
    expect(useAuthStore(pinia).isInitialized).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
    expect(router.currentRoute.value.query.redirect).toBe('/dashboard');
    expect(AtengLoadingBar.error).toHaveBeenCalled();
  });

  it('redirects authenticated /login visit to accessible redirect target and falls back to /dashboard for unreachable redirect', async () => {
    const pinia = createPinia();
    const router = createAppRouter(createMemoryHistory());
    setupRouterGuards(router, pinia);

    adminAuthManager.setToken('valid-token');
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createProfile({ roles: ['operator'], permissions: ['system:user:list'] }),
    );
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(createSampleRoutes());

    // 无权限或未在当前菜单内的 redirect 不得直接跳入 403/404，统一安全回退 /dashboard
    await router.push('/login?redirect=/system/tenant');
    await router.isReady();
    expect(router.currentRoute.value.path).toBe('/dashboard');

    // 已在当前动态菜单内且合法同源的 redirect 正常回跳
    await router.push('/login?redirect=/system/guard-view?tab=base');
    expect(router.currentRoute.value.fullPath).toBe('/system/guard-view?tab=base');

    // 已登录持非零菜单用户直接访问未授权动态路由时，按路由隐藏策略落入 NotFound（/404），不落入 /403（#56）
    await router.push('/system/tenant');
    expect(router.currentRoute.value.name).toBe('NotFound');
    expect(router.currentRoute.value.path).toBe('/system/tenant');
  });

  type AdapterConfig = Parameters<
    Extract<NonNullable<HttpRequestConfig['adapter']>, (config: never) => unknown>
  >[0];

  function createInvalidTenantAdapter(options: {
    failRetryOnPlatform?: boolean;
    failRetryWith500?: boolean;
    failRoutesWith401?: boolean;
    delayRoutesGate?: Promise<void>;
    seenTenantHeaders?: string[];
  }) {
    return (async (config: AdapterConfig) => {
      const headers = config.headers as Record<string, unknown> | { get?: (k: string) => unknown };
      const tenantHeader =
        typeof headers?.get === 'function'
          ? String(headers.get('X-Tenant-Id') ?? '')
          : String((headers as Record<string, unknown>)?.['X-Tenant-Id'] ?? '');
      options.seenTenantHeaders?.push(`${config.url}:${tenantHeader}`);

      if (tenantHeader !== '0') {
        if (config.url === '/admin/auth/routes' && options.delayRoutesGate) {
          await options.delayRoutesGate;
          if (options.failRoutesWith401) {
            return {
              data: { code: 401, msg: '登录状态已失效', data: null },
              status: 200,
              statusText: 'OK',
              headers: { 'content-type': 'application/json' },
              config,
            };
          }
          return {
            data: {
              code: 200,
              msg: 'ok',
              data: [
                {
                  id: '900',
                  parentId: '0',
                  menuName: '旧租户独占菜单',
                  path: '/system/stale-tenant-only',
                  component: 'system/user/index',
                  menuType: 'C',
                  visible: '0',
                  isFrame: 1,
                  isCache: 1,
                },
              ],
            },
            status: 200,
            statusText: 'OK',
            headers: { 'content-type': 'application/json' },
            config,
          };
        }
        return {
          data: {
            code: 100002,
            msg: '目标租户不存在、已停用或已过期，无法切换',
            data: null,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          config,
        };
      }

      if (options.failRetryOnPlatform) {
        return {
          data: {
            code: 401,
            msg: '登录状态已失效',
            data: null,
          },
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          config,
        };
      }

      if (options.failRetryWith500) {
        return {
          data: {
            code: 500,
            msg: '系统繁忙，请稍后再试',
            data: null,
          },
          status: 500,
          statusText: 'Internal Server Error',
          headers: { 'content-type': 'application/json' },
          config,
        };
      }

      if (config.url === '/admin/auth/info') {
        return {
          data: {
            code: 200,
            msg: 'ok',
            data: createProfile({ tenantEnabled: true }),
          },
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          config,
        };
      }

      if (config.url === '/admin/auth/routes') {
        return {
          data: {
            code: 200,
            msg: 'ok',
            data: createSampleRoutes(),
          },
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          config,
        };
      }

      return {
        data: { code: 200, msg: 'ok', data: null },
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config,
      };
    }) as typeof adminHttpClient.instance.defaults.adapter;
  }

  async function navigateWithGuardAndAdapter(options: {
    targetUrl: string;
    token: string;
    tenantId: string;
    adapterOptions: Parameters<typeof createInvalidTenantAdapter>[0];
  }) {
    const pinia = createPinia();
    const router = createAppRouter(createMemoryHistory());
    registerHttpErrorHandlers({
      onSessionExpired: async () => {
        await useAuthStore(pinia).logout({ remote: false, router });
      },
      onTenantInvalid: async () => {
        await useTenantStore(pinia).handleHttpInvalidTenantSwitch(router);
      },
    });
    setupRouterGuards(router, pinia);

    adminAuthManager.setToken(options.token);
    adminTenantManager.setTenantId(options.tenantId);
    useAuthStore(pinia).setTenantEnabled(true);

    const originalAdapter = adminHttpClient.instance.defaults.adapter;
    adminHttpClient.instance.defaults.adapter = createInvalidTenantAdapter(options.adapterOptions);
    try {
      await router.push(options.targetUrl);
      await router.isReady();
    } finally {
      adminHttpClient.instance.defaults.adapter = originalAdapter;
      registerHttpErrorHandlers({});
    }
    return { pinia, router };
  }

  it('recovers to platform tenant 0 and lands on /dashboard without logging out super_admin when refresh initialization hits 100002', async () => {
    const warnSpy = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }));
    const seenTenantHeaders: string[] = [];
    const { pinia, router } = await navigateWithGuardAndAdapter({
      targetUrl: '/system/guard-view?deptId=stale-dept',
      token: 'super-token-alive',
      tenantId: '119405572993097728',
      adapterOptions: { seenTenantHeaders },
    });

    // 1. 超管令牌与初始化会话态必须保留，严禁被踢回 /login
    expect(adminAuthManager.getToken()).toBe('super-token-alive');
    expect(useAuthStore(pinia).isAuthenticated).toBe(true);
    expect(useAuthStore(pinia).isInitialized).toBe(true);
    expect(usePermissionStore(pinia).routesLoaded).toBe(true);
    // 2. 失效租户已回退为平台默认租户 '0'，且并发 100002 提示合并去重为 1 次
    expect(adminTenantManager.getTenantId()).toBe('0');
    expect(useTenantStore(pinia).activeTenantId).toBe('0');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // 3. 统一回落 /dashboard 并清除旧租户深链 query，不再误跳 /login
    expect(router.currentRoute.value.path).toBe('/dashboard');
    expect(router.currentRoute.value.fullPath).toBe('/dashboard');
    expect(seenTenantHeaders).toContain('/admin/auth/info:0');
    expect(seenTenantHeaders).toContain('/admin/auth/routes:0');
  });

  it('keeps super_admin logged in when /dashboard refresh itself hits 100002', async () => {
    vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }));
    const { pinia, router } = await navigateWithGuardAndAdapter({
      targetUrl: '/dashboard',
      token: 'super-token-dashboard',
      tenantId: '119405572993097728',
      adapterOptions: {},
    });

    expect(adminAuthManager.getToken()).toBe('super-token-dashboard');
    expect(useAuthStore(pinia).isInitialized).toBe(true);
    expect(adminTenantManager.getTenantId()).toBe('0');
    expect(router.currentRoute.value.path).toBe('/dashboard');
  });

  it('still clears local session and redirects to /login when platform 0 retry itself fails with 401', async () => {
    vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }));
    const { pinia, router } = await navigateWithGuardAndAdapter({
      targetUrl: '/system/guard-view',
      token: 'expired-super-token',
      tenantId: '119405572993097728',
      adapterOptions: { failRetryOnPlatform: true },
    });

    expect(adminAuthManager.getToken()).toBeNull();
    expect(useAuthStore(pinia).isInitialized).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
  });

  it('still clears local session and redirects to /login when platform 0 retry fails with 5xx/network error', async () => {
    vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }));
    vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close: vi.fn() }));
    const { pinia, router } = await navigateWithGuardAndAdapter({
      targetUrl: '/system/guard-view',
      token: 'super-token-retry-500',
      tenantId: '119405572993097728',
      adapterOptions: { failRetryWith500: true },
    });

    expect(adminAuthManager.getToken()).toBeNull();
    expect(useAuthStore(pinia).isInitialized).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
  });

  it('waits for slow concurrent /routes to settle before triggering single 0 recovery on staggered /info 100002', async () => {
    vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }));
    let releaseDelayedRoutes!: () => void;
    const delayRoutesGate = new Promise<void>(resolve => {
      releaseDelayedRoutes = resolve;
    });
    const seenTenantHeaders: string[] = [];

    const navPromise = navigateWithGuardAndAdapter({
      targetUrl: '/system/guard-view',
      token: 'super-token-staggered',
      tenantId: '119405572993097728',
      adapterOptions: { delayRoutesGate, seenTenantHeaders },
    });

    // 等 /info 的 100002 完成微任务后，校验在 /routes 尚未 settle 前不得抢先发起 '0' 重拉
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(seenTenantHeaders.filter(item => item.endsWith(':0'))).toEqual([]);

    releaseDelayedRoutes();
    const { pinia, router } = await navPromise;

    expect(seenTenantHeaders.filter(item => item === '/admin/auth/info:0')).toHaveLength(1);
    expect(seenTenantHeaders.filter(item => item === '/admin/auth/routes:0')).toHaveLength(1);
    expect(usePermissionStore(pinia).hasMenuPath('/system/stale-tenant-only')).toBe(false);
    expect(usePermissionStore(pinia).hasMenuPath('/system/guard-view')).toBe(true);
    expect(router.currentRoute.value.path).toBe('/dashboard');
  });

  it('prioritizes fatal 401 over concurrent 100002 without launching doomed platform 0 retry', async () => {
    vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() }));
    const seenTenantHeaders: string[] = [];
    const { pinia, router } = await navigateWithGuardAndAdapter({
      targetUrl: '/system/guard-view',
      token: 'super-token-mixed-401',
      tenantId: '119405572993097728',
      adapterOptions: {
        delayRoutesGate: Promise.resolve(),
        failRoutesWith401: true,
        seenTenantHeaders,
      },
    });

    expect(seenTenantHeaders.filter(item => item.endsWith(':0'))).toEqual([]);
    expect(adminAuthManager.getToken()).toBeNull();
    expect(useAuthStore(pinia).isInitialized).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
  });
});
