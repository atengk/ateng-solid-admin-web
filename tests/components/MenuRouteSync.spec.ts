import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import AtengElementPlus, { DictManager, type DictItem } from '@atengk/element-plus';
import { createAtengVue } from '@atengk/vue';
import * as authApi from '@/api/auth';
import type { AdminProfileVO, RouteMenuVO } from '@/api/auth';
import * as menuApi from '@/api/system/menu';
import type { MenuTreeVO, MenuVO } from '@/api/system/menu';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';
import { setupDictManager } from '@/utils/dict';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import MenuView from '@/views/system/menu/index.vue';

/**
 * 菜单管理写操作同步刷新侧边栏与动态路由及失败降级容错契约测试 (#78)。
 *
 * @author Ateng
 * @since 2026-11-28
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function createMenuSyncRouter(): Router {
  const EmptyView = defineComponent({ name: 'StubView', template: '<div>stub</div>' });
  const EmptyLayout = defineComponent({ name: 'RootLayoutStub', template: '<router-view />' });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/',
        name: 'RootLayout',
        component: EmptyLayout,
        children: [{ path: '/dashboard', name: 'Dashboard', component: EmptyView }],
      },
    ],
  });
}

function createProfile(): AdminProfileVO {
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
    loginDate: '2026-11-28 09:00:00',
  };
}

function createRouteTree(items: RouteMenuVO[]): RouteMenuVO[] {
  return [
    {
      id: 'M1',
      parentId: '0',
      menuType: 'M',
      title: '组织权限',
      path: '/system',
      icon: 'Setting',
      sort: 1,
      visible: 0,
      platformOnly: false,
      children: items,
    },
  ];
}

function createBaseRouteMenu(): RouteMenuVO {
  return {
    id: 'C1',
    parentId: 'M1',
    menuType: 'C',
    title: '菜单管理',
    name: 'SysMenu',
    path: '/system/menu',
    component: 'system/menu/index',
    icon: 'Menu',
    sort: 1,
    visible: 0,
    keepAlive: true,
    isExternal: false,
    platformOnly: true,
    children: [],
  };
}

function createSampleMenuTree(extraChildren: MenuTreeVO[] = []): MenuTreeVO[] {
  return [
    {
      id: 'M1',
      parentId: '0',
      menuType: 'M',
      title: '组织权限',
      path: '/system',
      icon: 'Setting',
      sort: 1,
      visible: 0,
      status: 0,
      keepAlive: false,
      isExternal: false,
      platformOnly: false,
      createTime: '2026-11-28 09:00:00',
      children: [
        {
          id: 'C1',
          parentId: 'M1',
          menuType: 'C',
          title: '菜单管理',
          name: 'SysMenu',
          path: '/system/menu',
          component: 'system/menu/index',
          perms: 'system:menu:list',
          icon: 'Menu',
          sort: 1,
          visible: 0,
          status: 0,
          keepAlive: true,
          isExternal: false,
          platformOnly: true,
          createTime: '2026-11-28 09:01:00',
          children: [],
        },
        ...extraChildren,
      ],
    },
  ];
}

function setDrawerInputValue(testId: string, value: string): void {
  const inputEl = document.body.querySelector(
    `input[data-testid="${testId}"], [data-testid="${testId}"] input`,
  ) as HTMLInputElement | null;
  expect(inputEl, `未找到抽屉输入框 ${testId}`).not.toBeNull();
  if (inputEl) {
    inputEl.value = value;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function clickSaveMenuButton(): void {
  const saveBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
    btn.textContent?.includes('保存菜单'),
  ) as HTMLButtonElement | undefined;
  expect(saveBtn, '未找到 [保存菜单] 按钮').toBeDefined();
  saveBtn?.click();
}

describe('MenuView dynamic route & sidebar sync (#78)', () => {
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
    const dictMap: Record<string, DictItem[]> = {
      commonStatus: [
        { label: '正常', value: 0, tagType: 'success' },
        { label: '停用', value: 1, tagType: 'danger' },
      ],
      visibleStatus: [
        { label: '显示', value: 0 },
        { label: '隐藏', value: 1 },
      ],
    };
    DictManager.setProvider(async code => dictMap[code] ?? []);
    DictManager.setBatchProvider(async codes =>
      Object.fromEntries(codes.map(code => [code, dictMap[code] ?? []])),
    );
  });

  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount();
    }
    setupDictManager();
    vi.restoreAllMocks();
  });

  it('syncs permissionStore sidebarGroups and dynamic routes after menu create, edit, status toggle, and delete', async () => {
    const router = createMenuSyncRouter();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const baseMenuItem = createBaseRouteMenu();
    const boardMenuItem: RouteMenuVO = {
      id: 'C2',
      parentId: 'M1',
      menuType: 'C',
      title: '业务看板',
      name: 'BizBoard',
      path: '/system/board',
      component: 'dashboard/index',
      icon: 'DataBoard',
      sort: 2,
      visible: 0,
      keepAlive: false,
      isExternal: false,
      platformOnly: false,
      children: [],
    };
    const createdMenuItem: RouteMenuVO = {
      id: 'C3',
      parentId: 'M1',
      menuType: 'C',
      title: '动态报表',
      name: 'DynamicReport',
      path: '/system/report',
      component: 'dashboard/index',
      icon: 'Tickets',
      sort: 3,
      visible: 0,
      keepAlive: true,
      isExternal: false,
      platformOnly: false,
      children: [],
    };

    const getAuthRoutesSpy = vi
      .spyOn(authApi, 'getAuthRoutes')
      .mockResolvedValueOnce(createRouteTree([baseMenuItem, boardMenuItem]))
      .mockResolvedValueOnce(createRouteTree([baseMenuItem, boardMenuItem, createdMenuItem]))
      .mockResolvedValueOnce(
        createRouteTree([baseMenuItem, { ...boardMenuItem, title: '业务看板改名' }, createdMenuItem]),
      )
      .mockResolvedValueOnce(createRouteTree([baseMenuItem, createdMenuItem]))
      .mockResolvedValueOnce(createRouteTree([baseMenuItem]));

    const permissionStore = usePermissionStore();
    await permissionStore.buildRoutes(router);
    await router.push('/system/menu');
    await router.isReady();
    expect(router.hasRoute('SysMenu')).toBe(true);
    expect(permissionStore.sidebarGroups[0]?.items.map(item => item.title)).toEqual([
      '菜单管理',
      '业务看板',
    ]);

    const menuTreeRows = createSampleMenuTree([
      {
        id: 'C2',
        parentId: 'M1',
        menuType: 'C',
        title: '业务看板',
        name: 'BizBoard',
        path: '/system/board',
        component: 'dashboard/index',
        perms: 'system:board:list',
        icon: 'DataBoard',
        sort: 2,
        visible: 0,
        status: 0,
        keepAlive: false,
        isExternal: false,
        platformOnly: false,
        createTime: '2026-11-28 09:02:00',
        children: [],
      },
    ]);

    vi.spyOn(menuApi, 'getMenuTree').mockResolvedValue(menuTreeRows);
    vi.spyOn(menuApi, 'getMenuDetail').mockResolvedValue({
      id: 'C2',
      parentId: 'M1',
      menuType: 'C',
      title: '业务看板',
      name: 'BizBoard',
      path: '/system/board',
      component: 'dashboard/index',
      redirect: null,
      perms: 'system:board:list',
      icon: 'DataBoard',
      sort: 2,
      visible: 0,
      status: 0,
      keepAlive: false,
      isExternal: false,
      platformOnly: false,
      createTime: '2026-11-28 09:02:00',
    });
    vi.spyOn(menuApi, 'createMenu').mockResolvedValue('C3');
    vi.spyOn(menuApi, 'updateMenu').mockResolvedValue();
    vi.spyOn(menuApi, 'updateMenuStatus').mockResolvedValue();
    vi.spyOn(menuApi, 'deleteMenu').mockResolvedValue();
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: () => undefined }));
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);

    const wrapper = trackWrapper(
      mount(MenuView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    // 1. 新增菜单保存后立即同步侧边栏与动态路由，并保持当前 SysMenu 动态路由不失配
    await wrapper.find('[data-testid="menu-add-child-btn-M1"]').trigger('click');
    await flushPromises();
    setDrawerInputValue('menu-form-title', '动态报表');
    setDrawerInputValue('menu-form-path', '/system/report');
    setDrawerInputValue('menu-form-name', 'DynamicReport');
    setDrawerInputValue('menu-form-component', 'dashboard/index');
    setDrawerInputValue('menu-form-perms', 'system:report:list');
    await flushPromises();
    clickSaveMenuButton();
    await flushPromises();

    expect(getAuthRoutesSpy).toHaveBeenCalledTimes(2);
    expect(router.hasRoute('SysMenu')).toBe(true);
    expect(router.hasRoute('DynamicReport')).toBe(true);
    expect(permissionStore.sidebarGroups[0]?.items.map(item => item.title)).toEqual([
      '菜单管理',
      '业务看板',
      '动态报表',
    ]);

    // 2. 编辑菜单改名保存后立即更新侧边栏显示
    await wrapper.find('[data-testid="menu-edit-btn-C2"]').trigger('click');
    await flushPromises();
    setDrawerInputValue('menu-form-title', '业务看板改名');
    await flushPromises();
    clickSaveMenuButton();
    await flushPromises();

    expect(getAuthRoutesSpy).toHaveBeenCalledTimes(3);
    expect(permissionStore.sidebarGroups[0]?.items.map(item => item.title)).toContain(
      '业务看板改名',
    );

    // 3. 停用菜单后立即从侧边栏与动态路由移除
    await wrapper.find('[data-testid="menu-status-switch-C2"]').trigger('click');
    await flushPromises();

    expect(getAuthRoutesSpy).toHaveBeenCalledTimes(4);
    expect(permissionStore.sidebarGroups[0]?.items.map(item => item.title)).not.toContain(
      '业务看板改名',
    );
    expect(router.hasRoute('BizBoard')).toBe(false);

    // 4. 删除菜单后同步刷新动态路由并清理节点
    await wrapper.find('[data-testid="menu-delete-btn-C2"]').trigger('click');
    await flushPromises();

    expect(getAuthRoutesSpy).toHaveBeenCalledTimes(5);
    expect(permissionStore.sidebarGroups[0]?.items.map(item => item.title)).toEqual(['菜单管理']);
    expect(router.hasRoute('DynamicReport')).toBe(false);
    expect(router.currentRoute.value.path).toBe('/system/menu');
  });

  it('preserves mutation success feedback, current /system/menu route, expansion state, and sidebarGroups across create/edit/toggle/delete when route sync fails', async () => {
    const router = createMenuSyncRouter();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const initialRoutes = createRouteTree([createBaseRouteMenu()]);
    vi.spyOn(authApi, 'getAuthRoutes')
      .mockResolvedValueOnce(initialRoutes)
      .mockRejectedValue(new Error('路由刷新接口短暂超时'));

    const permissionStore = usePermissionStore();
    await permissionStore.buildRoutes(router);
    await router.push('/system/menu');
    await router.isReady();

    const treeSpy = vi.spyOn(menuApi, 'getMenuTree').mockResolvedValue(
      createSampleMenuTree([
        {
          id: 'C2',
          parentId: 'M1',
          menuType: 'C',
          title: '待删菜单',
          name: 'ToDeleteMenu',
          path: '/system/to-delete',
          component: 'dashboard/index',
          perms: 'system:delete-test:list',
          icon: 'Menu',
          sort: 2,
          visible: 0,
          status: 0,
          keepAlive: false,
          isExternal: false,
          platformOnly: false,
          createTime: '2026-11-28 09:02:00',
          children: [],
        },
      ]),
    );
    const detailVO: MenuVO = {
      id: 'C2',
      parentId: 'M1',
      menuType: 'C',
      title: '待删菜单',
      name: 'ToDeleteMenu',
      path: '/system/to-delete',
      component: 'dashboard/index',
      redirect: null,
      perms: 'system:delete-test:list',
      icon: 'Menu',
      sort: 2,
      visible: 0,
      status: 0,
      keepAlive: false,
      isExternal: false,
      platformOnly: false,
      createTime: '2026-11-28 09:02:00',
    };
    vi.spyOn(menuApi, 'getMenuDetail').mockResolvedValue(detailVO);
    vi.spyOn(menuApi, 'createMenu').mockResolvedValue('C3');
    vi.spyOn(menuApi, 'updateMenu').mockResolvedValue();
    vi.spyOn(menuApi, 'updateMenuStatus').mockResolvedValue();
    vi.spyOn(menuApi, 'deleteMenu').mockResolvedValue();
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const successToastSpy = vi
      .spyOn(ElMessage, 'success')
      .mockImplementation(() => ({ close: () => undefined }));
    const warningToastSpy = vi
      .spyOn(ElMessage, 'warning')
      .mockImplementation(() => ({ close: () => undefined }));
    const errorToastSpy = vi
      .spyOn(ElMessage, 'error')
      .mockImplementation(() => ({ close: () => undefined }));

    const wrapper = trackWrapper(
      mount(MenuView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    // 切换为全部折叠状态，验证四类写操作遇路由同步失败均不重置页内树展开态
    await wrapper.find('[data-testid="menu-expand-toggle-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="menu-expand-toggle-btn"]').text()).toContain('展开全部');

    // 1. 新增保存遇同步失败
    await wrapper.find('[data-testid="menu-add-child-btn-M1"]').trigger('click');
    await flushPromises();
    setDrawerInputValue('menu-form-title', '降级测试菜单');
    setDrawerInputValue('menu-form-path', '/system/degrade-test');
    setDrawerInputValue('menu-form-name', 'DegradeTest');
    setDrawerInputValue('menu-form-component', 'dashboard/index');
    await flushPromises();
    clickSaveMenuButton();
    await flushPromises();
    expect(successToastSpy).toHaveBeenCalledWith('已新增菜单【降级测试菜单】');

    // 2. 编辑保存遇同步失败
    await wrapper.find('[data-testid="menu-edit-btn-C2"]').trigger('click');
    await flushPromises();
    setDrawerInputValue('menu-form-title', '待删菜单改名');
    await flushPromises();
    clickSaveMenuButton();
    await flushPromises();
    expect(successToastSpy).toHaveBeenCalledWith('已保存菜单【待删菜单改名】');

    // 3. 启停切换遇同步失败
    await wrapper.find('[data-testid="menu-status-switch-C2"]').trigger('click');
    await flushPromises();
    expect(successToastSpy).toHaveBeenCalledWith('已停用菜单【待删菜单】');

    // 4. 删除节点遇同步失败
    await wrapper.find('[data-testid="menu-delete-btn-C2"]').trigger('click');
    await flushPromises();
    expect(successToastSpy).toHaveBeenCalledWith('已删除节点【待删菜单】');

    expect(warningToastSpy).toHaveBeenCalledTimes(4);
    expect(warningToastSpy).toHaveBeenCalledWith(
      '菜单变更已生效，但侧边栏导航刷新失败，请稍后刷新页面',
    );
    expect(errorToastSpy).not.toHaveBeenCalled();
    // 1 次挂载 + 2 次打开抽屉拉取上级树 + 4 次写操作后刷新主表 = 7 次
    expect(treeSpy).toHaveBeenCalledTimes(7);
    expect(router.currentRoute.value.path).toBe('/system/menu');
    expect(wrapper.find('[data-testid="menu-expand-toggle-btn"]').text()).toContain('展开全部');
    expect(permissionStore.sidebarGroups[0]?.items.map(item => item.title)).toEqual(['菜单管理']);
  });
});
