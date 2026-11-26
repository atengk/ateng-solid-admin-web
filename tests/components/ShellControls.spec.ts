import { defineComponent, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus from 'element-plus';
import AtengElementPlus from '@atengk/element-plus';
import * as authApi from '@/api/auth';
import * as tenantApi from '@/api/system/tenant';
import type { AdminProfileVO, RouteMenuVO } from '@/api/auth';
import { adminAuthManager, adminTenantManager } from '@/utils/http';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';
import { useTenantStore } from '@/stores/tenant';
import AdminLayout from '@/layouts/AdminLayout.vue';
import AdminHeader from '@/layouts/AdminHeader.vue';
import TenantObserveBanner from '@/layouts/TenantObserveBanner.vue';
import TenantSwitcher from '@/components/TenantSwitcher.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import BrandLogo from '@/components/BrandLogo.vue';
import Forbidden from '@/views/error/403.vue';
import NotFound from '@/views/error/404.vue';

/**
 * 顶栏组件、跨租户观察横幅、租户切换、主题切换、命令面板与 403/404 异常页契约测试。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

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
      ],
    },
  ];
}

function createShellRouter(): Router {
  const EmptyView = defineComponent({ name: 'StubView', template: '<div>stub</div>' });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: EmptyView },
      {
        path: '/',
        name: 'RootLayout',
        component: AdminLayout,
        redirect: '/dashboard',
        children: [
          {
            path: '/dashboard',
            name: 'Dashboard',
            component: EmptyView,
            meta: { title: '工作台', affix: true, keepAlive: true },
          },
          {
            path: '/profile',
            name: 'Profile',
            component: EmptyView,
            meta: { title: '个人中心', hidden: true },
          },
          {
            path: '/system/user',
            name: 'SysUser',
            component: EmptyView,
            meta: { title: '用户管理', groupTitle: '组织权限', keepAlive: true },
          },
        ],
      },
      {
        path: '/403',
        name: 'Forbidden',
        component: Forbidden,
        meta: { public: true, title: '暂无权限' },
      },
      {
        path: '/:pathMatch(.*)*',
        name: 'NotFound',
        component: NotFound,
        meta: { public: true, title: '页面不存在' },
      },
    ],
  });
}

describe('Shell Controls & Error Views', () => {
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

  it('renders domain/page breadcrumb and user dropdown commands including 个人中心, 修改密码 and 退出登录', async () => {
    const router = createShellRouter();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createProfile({ avatar: 'https://cdn.example.com/avatar.png' }),
    );
    await authStore.fetchUserInfo();

    const headerWrapper = trackWrapper(
      mount(AdminHeader, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    // #54: 搜索按钮 aria-label 须含可见文案 "搜索菜单"，且头像 img 具非空 alt
    const commandBtn = headerWrapper.find('[data-testid="header-command-trigger"]');
    expect(commandBtn.attributes('aria-label')).toContain('搜索菜单');
    expect(headerWrapper.find('img').attributes('alt')).toBe('超级管理员头像');

    // /dashboard 面包屑渲染 "首页 / 工作台"
    const breadcrumb = headerWrapper.find('[data-testid="header-breadcrumb"]');
    expect(breadcrumb.text()).toContain('首页');
    expect(breadcrumb.text()).toContain('工作台');

    // 下拉包含个人中心、修改密码与退出登录，且修改密码直达 /profile?tab=password
    await headerWrapper.find('[data-testid="header-user-trigger"]').trigger('click');
    await flushPromises();
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).toContain('个人中心');
    expect(bodyText).toContain('修改密码');
    expect(bodyText).toContain('退出登录');

    const dropdown = headerWrapper.findComponent({ name: 'ElDropdown' });
    dropdown.vm.$emit('command', 'password');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/profile');
    expect(router.currentRoute.value.query.tab).toBe('password');

    await router.push('/system/user');
    await flushPromises();
    expect(headerWrapper.find('[data-testid="header-breadcrumb"]').text()).toContain('组织权限');
    expect(headerWrapper.find('[data-testid="header-breadcrumb"]').text()).toContain('用户管理');
  });

  it('shows TenantObserveBanner only during cross-tenant observation and resets to platform on click', async () => {
    const router = createShellRouter();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore();
    const tenantStore = useTenantStore();
    authStore.setTenantEnabled(true);
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await authStore.fetchUserInfo();

    const wrapper = trackWrapper(
      mount(TenantObserveBanner, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );

    expect(wrapper.find('[data-testid="tenant-observe-banner"]').exists()).toBe(false);

    adminTenantManager.setTenantId('10002');
    tenantStore.activeTenantName = '星辰智能科技';
    await nextTick();

    const banner = wrapper.find('[data-testid="tenant-observe-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain('星辰智能科技');

    const resetSpy = vi.spyOn(tenantStore, 'resetToPlatform').mockResolvedValue(true);
    await wrapper.find('[data-testid="tenant-observe-reset-btn"]').trigger('click');
    await flushPromises();
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('renders TenantSwitcher per tenantEnabled and role permissions cleanly', async () => {
    const router = createShellRouter();
    await router.push('/dashboard');
    await router.isReady();

    const authStore = useAuthStore();
    const tenantStore = useTenantStore();
    vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValue([
      { id: '10002', tenantCode: '100002', tenantName: '星辰智能科技', status: 0 },
    ]);

    authStore.setTenantEnabled(false);
    const wrapper = trackWrapper(
      mount(TenantSwitcher, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    expect(wrapper.html()).not.toContain('租户');

    authStore.setTenantEnabled(true);
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createProfile({
        tenantId: '10002',
        tenantName: '星辰智能科技',
        roles: ['tenant_admin'],
        permissions: ['system:user:list'],
      }),
    );
    await authStore.fetchUserInfo();
    await flushPromises();

    expect(wrapper.find('[data-testid="tenant-readonly-capsule"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tenant-switch-trigger"]').exists()).toBe(false);

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await authStore.fetchUserInfo();
    await flushPromises();

    expect(tenantStore.isSuperAdminTenantSwitchAllowed).toBe(true);
    expect(wrapper.find('[data-testid="tenant-switch-trigger"]').exists()).toBe(true);

    // #46: 已有非空列表后每次打开浮层仍刷新 getTenantOptions，同步最新租户列表
    await flushPromises();
    const spy = vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValue([
      { id: '10002', tenantCode: '100002', tenantName: '星辰智能科技', status: 0 },
      { id: '10099', tenantCode: '100099', tenantName: '新建未来科技', status: 0 },
    ]);
    const triggerEl = wrapper.find('[data-testid="tenant-switch-trigger"]').element as HTMLButtonElement;
    triggerEl.click();
    await new Promise(resolve => setTimeout(resolve, 30));
    await flushPromises();
    expect(spy).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="tenant-option-10099"]').text()).toContain('新建未来科技');
  });

  it('renders anti-deadlock logout button on 403 for zero-menu logged-in users and supports 404 recovery actions', async () => {
    const router = createShellRouter();
    await router.push('/403');
    await router.isReady();

    const authStore = useAuthStore();
    const permissionStore = usePermissionStore();
    permissionStore.resetRoutes();
    const logoutSpy = vi.spyOn(authStore, 'logout').mockResolvedValue();

    const forbiddenWrapper = trackWrapper(
      mount(Forbidden, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const logoutBtn = forbiddenWrapper.find('[data-testid="forbidden-logout-btn"]');
    expect(logoutBtn.exists()).toBe(true);
    await logoutBtn.trigger('click');
    expect(logoutSpy).toHaveBeenCalledTimes(1);

    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(buildSampleMenus());
    await permissionStore.buildRoutes(router);

    const embeddedWrapper = trackWrapper(
      mount(Forbidden, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();
    expect(embeddedWrapper.findComponent(AdminLayout).exists()).toBe(true);
    expect(embeddedWrapper.find('[data-testid="forbidden-home-btn"]').exists()).toBe(true);

    await router.push('/unknown-path');
    const notFoundWrapper = trackWrapper(
      mount(NotFound, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();
    expect(notFoundWrapper.find('[data-testid="notfound-home-btn"]').exists()).toBe(true);
    expect(notFoundWrapper.find('[data-testid="notfound-back-btn"]').exists()).toBe(true);
    expect(notFoundWrapper.find('[data-testid="notfound-close-tab-btn"]').exists()).toBe(true);
  });

  it('toggles theme via ThemeToggle and handles Ctrl+K CommandPalette navigation with unmount cleanup', async () => {
    const router = createShellRouter();
    await router.push('/dashboard');
    await router.isReady();

    const appStore = useAppStore();
    const permissionStore = usePermissionStore();
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(buildSampleMenus());
    await permissionStore.buildRoutes();

    const themeSpy = vi.spyOn(appStore, 'setThemeMode');
    const themeWrapper = trackWrapper(
      mount(ThemeToggle, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await themeWrapper.find('button').trigger('click');
    expect(themeSpy).toHaveBeenCalledWith('dark');

    const paletteWrapper = trackWrapper(
      mount(CommandPalette, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await nextTick();
    expect(appStore.commandPaletteVisible).toBe(true);

    const userMenuOption = paletteWrapper.find('[data-testid="command-palette-item-/system/user"]');
    expect(userMenuOption.exists()).toBe(true);
    await userMenuOption.trigger('click');
    await flushPromises();
    expect(appStore.commandPaletteVisible).toBe(false);
    expect(router.currentRoute.value.path).toBe('/system/user');

    paletteWrapper.unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await nextTick();
    expect(appStore.commandPaletteVisible).toBe(false);
  });

  it('renders BrandLogo semantic tones, sizes, and wordmark visibility cleanly', () => {
    const defaultLogo = trackWrapper(mount(BrandLogo));
    expect(defaultLogo.find('[data-testid="brand-logo-mark"]').attributes('width')).toBe('24');
    expect(defaultLogo.find('[data-testid="brand-logo-mark"]').classes()).toContain(
      'brand-mark-primary',
    );
    expect(defaultLogo.findAll('[data-testid="brand-logo-mark"] path')).toHaveLength(3);
    expect(defaultLogo.find('[data-testid="brand-logo-wordmark"]').text()).toBe('ateng-solid');

    const darkPanelLogo = trackWrapper(
      mount(BrandLogo, {
        props: {
          size: 26,
          tone: 'dark-panel',
          showWordmark: false,
          wordmark: 'custom-brand',
        },
      }),
    );
    expect(darkPanelLogo.find('[data-testid="brand-logo-mark"]').attributes('width')).toBe('26');
    expect(darkPanelLogo.find('[data-testid="brand-logo-mark"]').classes()).toContain(
      'brand-mark-dark-panel',
    );
    expect(darkPanelLogo.find('[data-testid="brand-logo-wordmark"]').exists()).toBe(false);

    const inverseLogo = trackWrapper(
      mount(BrandLogo, {
        props: { tone: 'inverse', wordmarkSize: 'lg', wordmark: 'solid-portal' },
      }),
    );
    expect(inverseLogo.find('[data-testid="brand-logo-mark"]').classes()).toContain(
      'brand-mark-inverse',
    );
    expect(inverseLogo.find('[data-testid="brand-logo-wordmark"]').text()).toBe('solid-portal');
  });
});
