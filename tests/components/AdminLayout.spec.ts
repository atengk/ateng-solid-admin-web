import { defineComponent, inject, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus from 'element-plus';
import AtengElementPlus, {
  ATENG_PRO_LAYOUT_KEY,
  AtengTabsNav,
  type AtengProLayoutContext,
  type TabBatchClosePayload,
} from '@atengk/element-plus';
import * as authApi from '@/api/auth';
import * as tenantApi from '@/api/system/tenant';
import type { AdminProfileVO, RouteMenuVO } from '@/api/auth';
import { adminAuthManager, adminTenantManager } from '@/utils/http';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';
import { useTenantStore } from '@/stores/tenant';
import AdminLayout from '@/layouts/AdminLayout.vue';

/**
 * 方案 A 轻量 AdminLayout 主布局壳契约测试（依赖注入、最大化显隐与 Esc 收口、响应式抽屉、KeepAlive 与 AtengTabsNav 批关闭）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function createSuperAdminProfile(): AdminProfileVO {
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
  };
}

function buildSampleMenus(): RouteMenuVO[] {
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
          title: '用户管理',
          name: 'SysUser',
          path: '/system/user',
          component: 'dashboard/index',
          icon: 'User',
          sort: 1,
          visible: 0,
          keepAlive: true,
          children: [],
        },
        {
          id: '1200',
          parentId: '1000',
          menuType: 'C',
          title: '角色管理',
          name: 'SysRole',
          path: '/system/role',
          component: 'profile/index',
          icon: 'Setting',
          sort: 2,
          visible: 0,
          keepAlive: false,
          children: [],
        },
      ],
    },
  ];
}

function createLayoutTestRouter(): Router {
  const DashboardStub = defineComponent({
    name: 'Dashboard',
    template: '<div data-testid="view-dashboard">Dashboard Content</div>',
  });
  const UserStub = defineComponent({
    name: 'SysUser',
    template: '<div data-testid="view-user">SysUser Content</div>',
  });
  const RoleStub = defineComponent({
    name: 'SysRole',
    template: '<div data-testid="view-role">SysRole Content</div>',
  });

  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: { template: '<div>Login</div>' } },
      {
        path: '/',
        name: 'RootLayout',
        component: AdminLayout,
        redirect: '/dashboard',
        children: [
          {
            path: '/dashboard',
            name: 'Dashboard',
            component: DashboardStub,
            meta: { title: '工作台', affix: true, keepAlive: true, requiresAuth: true },
          },
          {
            path: '/system/user',
            name: 'SysUser',
            component: UserStub,
            meta: {
              title: '用户管理',
              icon: 'User',
              keepAlive: true,
              groupTitle: '组织权限',
              requiresAuth: true,
            },
          },
          {
            path: '/system/role',
            name: 'SysRole',
            component: RoleStub,
            meta: {
              title: '角色管理',
              icon: 'Setting',
              keepAlive: false,
              groupTitle: '组织权限',
              requiresAuth: true,
            },
          },
        ],
      },
    ],
  });
}

describe('AdminLayout Core Shell', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    adminAuthManager.setToken('valid-token');
    adminTenantManager.setTenantId('0');
  });

  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount();
    }
    vi.restoreAllMocks();
  });

  it('provides ATENG_PRO_LAYOUT_KEY, hides sidebar/header/observeBanner during maximize, exits on Esc and cleans listeners', async () => {
    const router = createLayoutTestRouter();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore();
    const tenantStore = useTenantStore();
    authStore.setTenantEnabled(true);
    vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValue([]);
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createSuperAdminProfile());
    await authStore.fetchUserInfo();
    adminTenantManager.setTenantId('10002');
    tenantStore.activeTenantName = '星辰智能科技';

    let capturedLayout: AtengProLayoutContext | null = null;
    const DescendantProbe = defineComponent({
      name: 'DescendantProbe',
      setup() {
        capturedLayout = inject(ATENG_PRO_LAYOUT_KEY, null);
        return {};
      },
      template: '<div data-testid="layout-probe">probe</div>',
    });

    const wrapper = trackWrapper(
      mount(
        defineComponent({
          components: { AdminLayout, DescendantProbe },
          template: '<AdminLayout><DescendantProbe /></AdminLayout>',
        }),
        {
          global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
        },
      ),
    );
    await flushPromises();

    expect(capturedLayout).not.toBeNull();
    expect(capturedLayout!.collapsed.value).toBe(false);
    expect(capturedLayout!.asideWidth.value).toBe('228px');
    expect(wrapper.find('[data-testid="tenant-observe-banner"]').exists()).toBe(true);

    // 折叠侧栏同步更新注入上下文宽度
    capturedLayout!.toggleCollapse();
    await nextTick();
    expect(capturedLayout!.collapsed.value).toBe(true);
    expect(capturedLayout!.asideWidth.value).toBe('60px');

    // 最大化内容区：隐藏侧栏、顶栏与跨租户观察横幅，并按 Esc 还原
    capturedLayout!.toggleMaximize?.(true);
    await nextTick();
    expect(capturedLayout!.isMaximized?.value).toBe(true);
    expect(capturedLayout!.asideWidth.value).toBe('0px');
    expect(wrapper.find('[data-testid="admin-sidebar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-header"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tenant-observe-banner"]').exists()).toBe(false);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(capturedLayout!.isMaximized?.value).toBe(false);
    expect(wrapper.find('[data-testid="tenant-observe-banner"]').exists()).toBe(true);

    // CommandPalette 打开期间按 Esc 仅关闭面板，严禁同时退出布局最大化
    capturedLayout!.toggleMaximize?.(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await nextTick();
    expect(useAppStore().commandPaletteVisible).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(useAppStore().commandPaletteVisible).toBe(false);
    expect(capturedLayout!.isMaximized?.value).toBe(true);

    // 卸载后清理 window 监听
    const removeEventSpy = vi.spyOn(window, 'removeEventListener');
    wrapper.unmount();
    expect(removeEventSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(capturedLayout!.isMaximized?.value).toBe(true);
  });

  it('supports responsive <768px mobile drawer overlay and keeps dynamic views alive across tab switches until refreshTab', async () => {
    const router = createLayoutTestRouter();
    await router.push('/dashboard');
    await router.isReady();

    let userMountCount = 0;
    const CountedUserView = defineComponent({
      name: 'SysUser',
      mounted() {
        userMountCount += 1;
      },
      template: '<div data-testid="counted-user-view">User Page</div>',
    });
    router.removeRoute('SysUser');
    router.addRoute('RootLayout', {
      path: '/system/user',
      name: 'SysUser',
      component: CountedUserView,
      meta: {
        title: '用户管理',
        icon: 'User',
        keepAlive: true,
        groupTitle: '组织权限',
        requiresAuth: true,
      },
    });

    const permissionStore = usePermissionStore();
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(buildSampleMenus());
    await permissionStore.buildRoutes();

    const originalInnerWidth = window.innerWidth;
    try {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 1280,
      });

      const RootOutlet = defineComponent({ name: 'RootOutletStub', template: '<router-view />' });
      const wrapper = trackWrapper(
        mount(RootOutlet, {
          global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
        }),
      );
      await flushPromises();

      expect(wrapper.find('[data-testid="admin-sidebar"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('组织权限');
      expect(wrapper.text()).toContain('用户管理');

      // KeepAlive 缓存 SysUser，切换回工作台后再切回不重新挂载；触发 tabRefresh 局部重挂载
      await router.push('/system/user');
      await flushPromises();
      expect(userMountCount).toBe(1);

      await router.push('/dashboard');
      await flushPromises();
      await router.push('/system/user');
      await flushPromises();
      expect(userMountCount).toBe(1);

      const tabsNavComp = wrapper.findComponent(AtengTabsNav);
      tabsNavComp.vm.$emit('tabRefresh', '/system/user', {
        key: '/system/user',
        title: '用户管理',
      });
      await flushPromises();
      expect(userMountCount).toBe(2);

      // 切换至 <768px 移动端断点，隐藏常驻侧栏并可通过顶栏按钮打开抽屉遮罩
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: 640,
      });
      window.dispatchEvent(new Event('resize'));
      await nextTick();

      expect(useAppStore().isMobile).toBe(true);
      expect(wrapper.find('[data-testid="mobile-sidebar-overlay"]').exists()).toBe(false);

      await wrapper.find('[data-testid="header-sidebar-toggle"]').trigger('click');
      await nextTick();
      expect(wrapper.find('[data-testid="mobile-sidebar-overlay"]').exists()).toBe(true);
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      });
    }
  });

  it('handles AtengTabsNav @batch-close with a single batch state update and syncs resetNonAffixTabs()', async () => {
    const router = createLayoutTestRouter();
    await router.push('/dashboard');
    await router.isReady();

    const RootOutlet = defineComponent({ name: 'RootOutletStub', template: '<router-view />' });
    const wrapper = trackWrapper(
      mount(RootOutlet, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    await router.push('/system/user');
    await flushPromises();
    await router.push('/system/role');
    await flushPromises();

    const tabsNavComp = wrapper.findComponent(AtengTabsNav);
    expect(tabsNavComp.exists()).toBe(true);
    expect(tabsNavComp.props('emitCloseOnBatch')).toBe(false);
    expect(tabsNavComp.props('styleType')).toBe('line');
    expect(tabsNavComp.props('height')).toBe('36px');
    expect((tabsNavComp.props('tabs') as Array<{ key: string }>).map(t => t.key)).toEqual([
      '/dashboard',
      '/system/user',
      '/system/role',
    ]);

    const appStore = useAppStore();
    const initialTabs = tabsNavComp.props('tabs') as TabBatchClosePayload['remainingTabs'];
    tabsNavComp.vm.$emit('batchClose', {
      command: 'closeOthers',
      closedTabs: [initialTabs[2]!],
      remainingTabs: [initialTabs[0]!, initialTabs[1]!],
      nextActiveKey: '/system/user',
    } satisfies TabBatchClosePayload);
    await flushPromises();

    expect((tabsNavComp.props('tabs') as Array<{ key: string }>).map(t => t.key)).toEqual([
      '/dashboard',
      '/system/user',
    ]);
    expect(router.currentRoute.value.fullPath).toBe('/system/user');

    appStore.resetNonAffixTabs();
    await flushPromises();
    expect((tabsNavComp.props('tabs') as Array<{ key: string }>).map(t => t.key)).toEqual([
      '/dashboard',
    ]);
  });

  it('renders BrandLogo in AdminSidebar, hides wordmark on collapse, navigates home on click, and preserves Instance Brand during tenant observation', async () => {
    const router = createLayoutTestRouter();
    await router.push('/system/user');
    await router.isReady();

    const authStore = useAuthStore();
    const tenantStore = useTenantStore();
    authStore.setTenantEnabled(true);
    vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValue([]);
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createSuperAdminProfile());
    await authStore.fetchUserInfo();

    const RootOutlet = defineComponent({ name: 'RootOutletStub', template: '<router-view />' });
    const wrapper = trackWrapper(
      mount(RootOutlet, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const brandTrigger = wrapper.find('[data-testid="sidebar-brand-trigger"]');
    expect(brandTrigger.exists()).toBe(true);
    expect(brandTrigger.attributes('title')).toContain('点击返回工作台');
    expect(brandTrigger.findAll('[data-testid="brand-logo-mark"] path')).toHaveLength(3);
    expect(brandTrigger.find('[data-testid="brand-logo-wordmark"]').text()).toBe('ateng-solid');

    // 超管切换租户观察态：品牌组合标保持实例不变（不随工作租户切换）
    adminTenantManager.setTenantId('10002');
    tenantStore.activeTenantName = '星辰智能科技';
    await nextTick();
    expect(wrapper.find('[data-testid="tenant-observe-banner"]').exists()).toBe(true);
    expect(brandTrigger.find('[data-testid="brand-logo-wordmark"]').text()).toBe('ateng-solid');

    // 折叠侧栏：隐藏品牌字标，保留居中的三阶几何图形
    await wrapper.find('[data-testid="header-sidebar-toggle"]').trigger('click');
    await nextTick();
    expect(brandTrigger.find('[data-testid="brand-logo-mark"]').exists()).toBe(true);
    expect(brandTrigger.find('[data-testid="brand-logo-wordmark"]').exists()).toBe(false);

    // 点击侧栏品牌区跳转回工作台 /dashboard
    await brandTrigger.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/dashboard');
  });

  it('remounts shared route and KeepAlive views across cross-tenant switches and platform reset (#43)', async () => {
    const router = createLayoutTestRouter();
    await router.push('/login');
    await router.isReady();

    let dashboardMountCount = 0;
    let userMountCount = 0;
    const TrackedDashboard = defineComponent({
      name: 'Dashboard',
      setup() {
        const tenantStore = useTenantStore();
        return { tenantStore };
      },
      mounted() {
        dashboardMountCount += 1;
      },
      template: '<div data-testid="tracked-dashboard">dash:{{ tenantStore.activeTenantId }}</div>',
    });
    const TrackedUser = defineComponent({
      name: 'SysUser',
      setup() {
        const tenantStore = useTenantStore();
        return { tenantStore };
      },
      mounted() {
        userMountCount += 1;
      },
      template: '<div data-testid="tracked-user">user:{{ tenantStore.activeTenantId }}</div>',
    });
    const registerTrackedRoutes = (targetRouter: Router) => {
      if (targetRouter.hasRoute('Dashboard')) {
        targetRouter.removeRoute('Dashboard');
      }
      if (targetRouter.hasRoute('SysUser')) {
        targetRouter.removeRoute('SysUser');
      }
      targetRouter.addRoute('RootLayout', {
        path: '/dashboard',
        name: 'Dashboard',
        component: TrackedDashboard,
        meta: { title: '工作台', affix: true, keepAlive: true, requiresAuth: true },
      });
      targetRouter.addRoute('RootLayout', {
        path: '/system/user',
        name: 'SysUser',
        component: TrackedUser,
        meta: { title: '用户管理', icon: 'User', keepAlive: true, groupTitle: '组织权限', requiresAuth: true },
      });
    };
    registerTrackedRoutes(router);

    const authStore = useAuthStore();
    const permissionStore = usePermissionStore();
    const tenantStore = useTenantStore();
    authStore.setTenantEnabled(true);
    vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValue([
      { id: '10002', tenantCode: '100002', tenantName: '星辰智能科技', status: 0 },
    ]);
    vi.spyOn(authApi, 'getAuthInfo').mockImplementation(async () => {
      const tid = adminTenantManager.getTenantId() || '0';
      return {
        ...createSuperAdminProfile(),
        tenantId: tid,
        tenantName: tid === '10002' ? '星辰智能科技' : '平台默认租户',
        tenantEnabled: true,
      };
    });
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(buildSampleMenus());
    await authStore.fetchUserInfo();
    const origBuildRoutes = permissionStore.buildRoutes.bind(permissionStore);
    vi.spyOn(permissionStore, 'buildRoutes').mockImplementation(async targetRouter => {
      const routes = await origBuildRoutes(targetRouter);
      if (targetRouter) {
        registerTrackedRoutes(targetRouter);
      }
      return routes;
    });
    await permissionStore.buildRoutes(router);

    const RootOutlet = defineComponent({ name: 'RootOutletStub', template: '<router-view />' });
    const wrapper = trackWrapper(
      mount(RootOutlet, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    // 先激活并缓存 Dashboard，再切回 /system/user
    await router.push('/dashboard');
    await flushPromises();
    expect(dashboardMountCount).toBe(1);
    await router.push('/system/user');
    await flushPromises();
    expect(userMountCount).toBe(1);
    expect(wrapper.find('[data-testid="tracked-user"]').text()).toBe('user:0');

    // 从 '0' 切换至 '10002'（停留在同一共享路由 /system/user）：必须干净重建组件，禁止残留 '0' 视图
    expect(await tenantStore.switchTenant('10002', router)).toBe(true);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/system/user');
    expect(userMountCount).toBe(2);
    expect(wrapper.find('[data-testid="tracked-user"]').text()).toBe('user:10002');

    // 再从 '10002' 切回平台默认租户 '0'（停留在同一共享路由 /system/user）：禁止复用切出前缓存的 '0' 实例
    expect(await tenantStore.resetToPlatform(router)).toBe(true);
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/system/user');
    expect(userMountCount).toBe(3);
    expect(wrapper.find('[data-testid="tracked-user"]').text()).toBe('user:0');

    // 切到 KeepAlive 的 /dashboard：由于切换租户重建 KeepAlive 容器，Dashboard 也必须全新挂载而非回放旧租户缓存
    await router.push('/dashboard');
    await flushPromises();
    expect(dashboardMountCount).toBe(2);
    expect(wrapper.find('[data-testid="tracked-dashboard"]').text()).toBe('dash:0');
  });

  it('renders AdminSidebar as semantic <nav> without el-menu ARIA roles and preserves collapsed aria-label & active navigation (#53)', async () => {
    const router = createLayoutTestRouter();
    await router.push('/system/user');
    await router.isReady();

    const permissionStore = usePermissionStore();
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(buildSampleMenus());
    await permissionStore.buildRoutes();

    const RootOutlet = defineComponent({ name: 'RootOutletStub', template: '<router-view />' });
    const wrapper = trackWrapper(
      mount(RootOutlet, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const nav = wrapper.find('[data-testid="admin-sidebar-nav"]');
    expect(nav.exists()).toBe(true);
    expect(nav.element.tagName.toLowerCase()).toBe('nav');
    expect(nav.attributes('aria-label')).toBe('主导航');
    expect(nav.findAll('[role="menubar"], [role="menu"], [role="menuitem"]')).toHaveLength(0);

    const activeUserBtn = nav.find('[data-testid="sidebar-item-/system/user"]');
    expect(activeUserBtn.attributes('aria-current')).toBe('page');

    // 折叠侧栏：隐藏可见文字，但为图标按钮补齐 aria-label 并支持点击导航
    await wrapper.find('[data-testid="header-sidebar-toggle"]').trigger('click');
    await nextTick();

    const dashBtnCollapsed = nav.find('[data-testid="sidebar-item-/dashboard"]');
    expect(dashBtnCollapsed.attributes('aria-label')).toBe('工作台');
    expect(nav.find('[data-testid="sidebar-item-/system/user"]').attributes('aria-label')).toBe('用户管理');

    await dashBtnCollapsed.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/dashboard');
    expect(dashBtnCollapsed.attributes('aria-current')).toBe('page');
  });
});
