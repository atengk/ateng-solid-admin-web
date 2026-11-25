import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus, { ElMessage } from 'element-plus';
import AtengElementPlus from '@atengk/element-plus';
import { BusinessException } from '@atengk/core';
import { createAtengVue } from '@atengk/vue';
import * as authApi from '@/api/auth';
import type { AdminProfileVO, OnlineSessionVO, RouteMenuVO } from '@/api/auth';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';
import DashboardView from '@/views/dashboard/index.vue';
import OnlineSessionView from '@/views/system/online/index.vue';

/**
 * 工作台（/dashboard）与在线会话管理页（/system/online）Layer 3 组件契约测试。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function createViewRouter(): Router {
  const EmptyView = defineComponent({ name: 'StubView', template: '<div>stub</div>' });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: EmptyView },
      { path: '/dashboard', name: 'Dashboard', component: DashboardView },
      { path: '/profile', name: 'Profile', component: EmptyView },
      { path: '/system/online', name: 'OnlineSession', component: OnlineSessionView },
      { path: '/system/user', name: 'SysUser', component: EmptyView },
    ],
  });
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
    loginIp: '10.20.30.40',
    loginDate: '2026-11-25 14:30:00',
    ...overrides,
  };
}

function createMenus(): RouteMenuVO[] {
  return [
    {
      id: '100',
      parentId: '0',
      menuType: 'M',
      title: '组织权限',
      path: '/system',
      sort: 1,
      visible: 0,
      children: [
        {
          id: '101',
          parentId: '100',
          menuType: 'C',
          title: '用户管理',
          name: 'SysUser',
          path: '/system/user',
          component: 'system/user/index',
          icon: 'User',
          sort: 1,
          visible: 0,
          keepAlive: true,
          children: [],
        },
        {
          id: '102',
          parentId: '100',
          menuType: 'C',
          title: '在线会话',
          name: 'OnlineSession',
          path: '/system/online',
          component: 'system/online/index',
          icon: 'Monitor',
          sort: 2,
          visible: 0,
          keepAlive: false,
          platformOnly: true,
          children: [],
        },
      ],
    },
  ];
}

function createOnlineRow(overrides: Partial<OnlineSessionVO> = {}): OnlineSessionVO {
  return {
    sessionId: 'sess-other',
    tokenMask: 'f9c0****3d2a',
    currentSession: false,
    userId: '1002',
    username: 'alice',
    nickname: '张敏',
    tenantId: '0',
    loginDevice: 'PC',
    clientIp: '10.0.0.88',
    loginTime: '2026-11-25 13:00:00',
    tokenTimeout: 240,
    ...overrides,
  };
}

describe('DashboardView (/dashboard) & OnlineSessionView (/system/online)', () => {
  let pinia: ReturnType<typeof createPinia>;
  let atengVue: ReturnType<typeof createAtengVue>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    adminAuthManager.setToken('valid-token');
    useAuthStore().syncTokenFromManager();
    adminTenantManager.setTenantId('0');
    atengVue = createAtengVue({
      httpClient: adminHttpClient,
      authManager: adminAuthManager,
      tenantManager: adminTenantManager,
      superAdminRoles: ['super_admin'],
      defaultSize: 10,
    });
  });

  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount();
    }
    vi.restoreAllMocks();
  });

  it('shows non-blocking password change banner when passwordNeedsChange=true, navigates to /profile?tab=password, and supports session dismiss', async () => {
    const router = createViewRouter();
    await router.push('/dashboard');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createProfile({ passwordNeedsChange: true }),
    );
    await useAuthStore().fetchUserInfo();

    const wrapper = trackWrapper(
      mount(DashboardView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const reminder = wrapper.find('[data-testid="dashboard-pwd-reminder"]');
    expect(reminder.exists()).toBe(true);
    expect(reminder.text()).toContain('初始或管理员重置口令');

    await wrapper.find('[data-testid="dashboard-pwd-go-btn"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/profile');
    expect(router.currentRoute.value.query.tab).toBe('password');

    await wrapper.find('[data-testid="dashboard-pwd-dismiss-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="dashboard-pwd-reminder"]').exists()).toBe(false);
    wrapper.unmount();

    // 同会话再次进入工作台保持隐藏
    const remounted = trackWrapper(
      mount(DashboardView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();
    expect(remounted.find('[data-testid="dashboard-pwd-reminder"]').exists()).toBe(false);
    remounted.unmount();

    // 退出重登录后，若仍处于初始未改密态，改密提醒须恢复显示
    await useAuthStore().logout({ remote: false, router });
    adminAuthManager.setToken('relogin-token');
    useAuthStore().syncTokenFromManager();
    await useAuthStore().fetchUserInfo();
    await router.push('/dashboard');
    await flushPromises();

    const reloginMounted = trackWrapper(
      mount(DashboardView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();
    expect(reloginMounted.find('[data-testid="dashboard-pwd-reminder"]').exists()).toBe(true);
  });

  it('renders identity summary, dynamic shortcut grid from sidebarGroups, and zero-menu fallback card', async () => {
    const router = createViewRouter();
    await router.push('/dashboard');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createProfile({
        roles: ['tenant_admin'],
        permissions: ['system:user:list'],
        loginIp: null,
        loginDate: null,
      }),
    );
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue([]);

    await useAuthStore().fetchUserInfo();
    await usePermissionStore().buildRoutes(router);

    const zeroMenuWrapper = trackWrapper(
      mount(DashboardView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(zeroMenuWrapper.text()).toContain('首次登录管理台');
    expect(zeroMenuWrapper.find('[data-testid="dashboard-empty-menus-card"]').exists()).toBe(true);
    expect(zeroMenuWrapper.find('[data-testid="dashboard-empty-logout-btn"]').exists()).toBe(true);
    expect(zeroMenuWrapper.find('[data-testid="dashboard-online-link"]').exists()).toBe(false);

    // 验证 0 菜单受限卡片内退出登录出口可执行注销并跳转 /login
    vi.spyOn(authApi, 'logout').mockResolvedValueOnce();
    await zeroMenuWrapper.find('[data-testid="dashboard-empty-logout-btn"]').trigger('click');
    await flushPromises();
    expect(useAuthStore().isAuthenticated).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
    zeroMenuWrapper.unmount();

    // 恢复持菜单与在线会话权限态
    adminAuthManager.setToken('valid-token');
    useAuthStore().syncTokenFromManager();
    await router.push('/dashboard');
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue(createMenus());
    await useAuthStore().fetchUserInfo();
    await usePermissionStore().buildRoutes(router);

    const normalWrapper = trackWrapper(
      mount(DashboardView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(normalWrapper.find('[data-testid="dashboard-empty-menus-card"]').exists()).toBe(false);
    expect(normalWrapper.find('[data-testid="dashboard-shortcut-/system/user"]').exists()).toBe(
      true,
    );
    expect(normalWrapper.find('[data-testid="dashboard-online-link"]').exists()).toBe(true);

    const pushSpy = vi.spyOn(router, 'push');
    await normalWrapper.find('[data-testid="dashboard-shortcut-/system/online"]').trigger('click');
    await flushPromises();
    expect(pushSpy).toHaveBeenCalledWith('/system/online');
  });

  it('disables kickout on currentSession=true and executes confirmation flow via DELETE /admin/auth/online/{sessionId}', async () => {
    const router = createViewRouter();
    await router.push('/system/online');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createProfile({
        roles: ['auditor'],
        permissions: ['auth:online:list', 'auth:online:kickout'],
      }),
    );
    await useAuthStore().fetchUserInfo();

    const pageSpy = vi.spyOn(authApi, 'getOnlineSessionPage').mockResolvedValue({
      records: [
        createOnlineRow({
          sessionId: 'sess-self',
          tokenMask: 'self****1111',
          currentSession: true,
          username: 'auditor',
          tokenTimeout: -1,
        }),
        createOnlineRow({
          sessionId: 'sess-other',
          tokenMask: 'f9c0****3d2a',
          currentSession: false,
          username: 'alice',
          clientIp: '10.0.0.88',
          tokenTimeout: 240,
        }),
      ],
      total: 2000,
      current: 1,
      size: 10,
      pages: 200,
    });
    const errorToastSpy = vi
      .spyOn(ElMessage, 'error')
      .mockImplementation(() => ({ close: () => undefined }));
    const kickoutSpy = vi
      .spyOn(authApi, 'kickoutOnlineSession')
      .mockRejectedValueOnce(
        new BusinessException(101007, '不可强退当前正在使用的会话', 'trace-101007'),
      )
      .mockResolvedValueOnce();

    const wrapper = trackWrapper(
      mount(OnlineSessionView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(pageSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('self****1111');
    expect(wrapper.text()).toContain('当前会话');
    expect(wrapper.text()).toContain('长期有效');
    // total >= 2000 展示上限扫描提醒，且剩余有效期 <= 300s 高亮 warning 色
    expect(wrapper.text()).toContain('2000 条活跃会话');
    expect(wrapper.find('.text-warning').exists()).toBe(true);

    const selfKickBtn = wrapper.find('[data-testid="online-kickout-btn-sess-self"]');
    expect(selfKickBtn.exists()).toBe(true);
    expect(selfKickBtn.attributes('disabled')).toBeDefined();

    const otherKickBtn = wrapper.find('[data-testid="online-kickout-btn-sess-other"]');
    expect(otherKickBtn.attributes('disabled')).toBeUndefined();
    await otherKickBtn.trigger('click');
    await flushPromises();

    const confirmText = document.body.textContent ?? '';
    expect(confirmText).toContain('alice');
    expect(confirmText).toContain('10.0.0.88');

    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('确认强退'),
    );
    expect(confirmBtn).toBeDefined();
    // 1. 首次触发 101007 时给出明确错误提示且保留弹窗待用户取消或重试
    confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(errorToastSpy).toHaveBeenCalledWith('不可强退当前正在使用的会话');
    expect(document.body.textContent).toContain('alice');

    // 2. 二次确认成功强退后刷新分页列表
    confirmBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(kickoutSpy).toHaveBeenCalledTimes(2);
    expect(kickoutSpy).toHaveBeenCalledWith('sess-other');
    expect(pageSpy).toHaveBeenCalledTimes(2);
  });

  it('supports username/clientIp query filtering and hides kickout actions without auth:online:kickout permission', async () => {
    const router = createViewRouter();
    await router.push('/system/online');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createProfile({
        roles: ['auditor'],
        permissions: ['auth:online:list'],
      }),
    );
    await useAuthStore().fetchUserInfo();

    const pageSpy = vi.spyOn(authApi, 'getOnlineSessionPage').mockResolvedValue({
      records: [createOnlineRow({ sessionId: 'sess-readonly', username: 'alice' })],
      total: 1,
      current: 1,
      size: 10,
      pages: 1,
    });

    const wrapper = trackWrapper(
      mount(OnlineSessionView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    // 无 auth:online:kickout 权限时强退按钮及表格行外层 tooltip 包装均应被 v-permission 物理移除
    expect(wrapper.find('[data-testid="online-kickout-btn-sess-readonly"]').exists()).toBe(false);
    expect(wrapper.find('tbody .el-tooltip__trigger').exists()).toBe(false);

    await wrapper.find('[data-testid="online-query-username"]').setValue('alice');
    await wrapper.find('[data-testid="online-query-ip"]').setValue('10.0.0.0/24');
    const searchBtn = wrapper
      .findAll('button')
      .find(btn => btn.text().replace(/\s+/g, '') === '查询');
    expect(searchBtn).toBeDefined();
    await searchBtn?.trigger('click');
    await flushPromises();

    expect(pageSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        username: 'alice',
        clientIp: '10.0.0.0/24',
        current: 1,
      }),
    );
  });
});
