import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia } from 'pinia';
import { createMemoryHistory } from 'vue-router';
import { AtengLoadingBar } from '@atengk/element-plus';
import * as authApi from '@/api/auth';
import type { AdminProfileVO, RouteMenuVO } from '@/api/auth';
import { adminAuthManager } from '@/utils/http';
import { createAppRouter } from '@/router';
import { sanitizeRedirectTarget, setupRouterGuards } from '@/router/guards';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';

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
  });
});
