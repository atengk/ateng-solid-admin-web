import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { type RouteMenuVO } from '@/api/auth';
import * as authApi from '@/api/auth';
import { usePermissionStore } from '@/stores/permission';

/**
 * 权限菜单与动态路由 Store 单元测试（纯内存态、动态视图映射、404 安全降级与精确卸载）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

function buildSampleMenus(): RouteMenuVO[] {
  return [
    {
      id: '2000',
      parentId: '0',
      menuType: 'M',
      title: '基础配置',
      path: '/config',
      sort: 2,
      visible: 0,
      platformOnly: false,
      children: [
        {
          id: '2200',
          parentId: '2000',
          menuType: 'C',
          title: '工作台直达',
          name: 'SysConfigDashboardMock',
          path: '/system/mock-dashboard',
          component: 'dashboard/index',
          icon: 'Operation',
          sort: 1,
          visible: 0,
          keepAlive: true,
          isExternal: false,
          platformOnly: false,
          children: [],
        },
        {
          id: '2201',
          parentId: '2000',
          menuType: 'C',
          title: '隐藏页面',
          name: 'HiddenPage',
          path: '/system/hidden',
          component: 'profile/index',
          sort: 2,
          visible: 1,
          keepAlive: false,
          isExternal: false,
          platformOnly: false,
          children: [],
        },
      ],
    },
    {
      id: '1000',
      parentId: '0',
      menuType: 'M',
      title: '组织权限',
      path: '/system',
      sort: 1,
      visible: 0,
      platformOnly: false,
      children: [
        {
          id: '1100',
          parentId: '1000',
          menuType: 'C',
          title: '未落地页面',
          name: 'SysMissingView',
          path: '/system/missing',
          component: 'system/missing/index',
          icon: 'User',
          sort: 1,
          visible: 0,
          keepAlive: false,
          isExternal: false,
          platformOnly: false,
          children: [
            {
              id: '1101',
              parentId: '1100',
              menuType: 'F',
              title: '查询按钮',
              path: '',
              sort: 1,
              visible: 0,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: '3000',
      parentId: '0',
      menuType: 'M',
      title: '空目录',
      path: '/empty',
      sort: 3,
      visible: 0,
      children: [],
    },
  ];
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/login',
        name: 'Login',
        component: { template: '<div>login</div>' },
      },
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
        ],
      },
    ],
  });
}

describe('usePermissionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('builds sorted sidebarGroups and safely falls back to 404 when dynamic component is missing', async () => {
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(buildSampleMenus());
    const store = usePermissionStore();
    const router = createTestRouter();

    await store.buildRoutes(router);

    expect(store.routesLoaded).toBe(true);
    expect(store.sidebarGroups.map(group => group.title)).toEqual(['组织权限', '基础配置']);
    expect(store.sidebarGroups[1]?.items.map(item => item.title)).toEqual(['工作台直达']);
    expect(store.registeredRouteNames).toEqual(
      expect.arrayContaining(['SysConfigDashboardMock', 'SysMissingView']),
    );
    expect(router.hasRoute('SysConfigDashboardMock')).toBe(true);
    expect(router.hasRoute('SysMissingView')).toBe(true);

    // 未知组件路径安全降级至 404 视图，不抛异常也不产生白屏 undefined
    await router.push('/system/missing');
    const matchedRecord = router.currentRoute.value.matched.find(
      record => record.name === 'SysMissingView',
    );
    const resolvedComponent = matchedRecord?.components?.default as
      | { name?: string }
      | (() => Promise<{ default?: { name?: string }; name?: string }>)
      | undefined;
    let componentName: string | undefined;
    if (typeof resolvedComponent === 'function') {
      const resolvedModule = await resolvedComponent();
      componentName = resolvedModule?.default?.name ?? resolvedModule?.name;
    } else {
      componentName = resolvedComponent?.name;
    }
    expect(componentName).toBe('NotFound');

    // 严禁写入浏览器持久存储
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('removes all dynamic routes on resetRoutes while keeping static routes intact', async () => {
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(buildSampleMenus());
    const store = usePermissionStore();
    const router = createTestRouter();

    await store.buildRoutes(router);
    expect(router.hasRoute('SysConfigDashboardMock')).toBe(true);

    store.resetRoutes(router);

    expect(store.routesLoaded).toBe(false);
    expect(store.rawMenus).toEqual([]);
    expect(store.registeredRouteNames).toEqual([]);
    expect(router.hasRoute('SysConfigDashboardMock')).toBe(false);
    expect(router.hasRoute('SysMissingView')).toBe(false);
    expect(router.hasRoute('RootLayout')).toBe(true);
    expect(router.hasRoute('Dashboard')).toBe(true);
    expect(router.hasRoute('Login')).toBe(true);
  });
});
