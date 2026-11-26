import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus, { ElMessage } from 'element-plus';
import AtengElementPlus, { DictManager, type DictItem } from '@atengk/element-plus';
import { createAtengVue } from '@atengk/vue';
import * as authApi from '@/api/auth';
import * as deptApi from '@/api/system/dept';
import type { MenuTreeVO } from '@/api/system/menu';
import * as roleApi from '@/api/system/role';
import type { RoleDetailVO, RoleVO } from '@/api/system/role';
import { setupDictManager } from '@/utils/dict';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import {
  collectSubmittedMenuIds,
  DATA_SCOPE_CUSTOM,
  resolveInitialCheckedMenuKeys,
  validateCustomDataScope,
} from '@/views/system/role/roleHelper';
import RoleView from '@/views/system/role/index.vue';

/**
 * 角色菜单树联动叶子回显、联动切换重算、CUSTOM 部门树上方强校验与页面内置角色保护测试。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function createMenuNode(
  id: string,
  parentId: string,
  menuType: 'M' | 'C' | 'F',
  title: string,
  children: MenuTreeVO[] = [],
): MenuTreeVO {
  return {
    id,
    parentId,
    menuType,
    title,
    sort: 1,
    visible: 0,
    status: 0,
    keepAlive: menuType === 'C',
    isExternal: false,
    platformOnly: false,
    createTime: '2026-11-25 10:00:00',
    children,
  };
}

function createSampleGrantableTree(): MenuTreeVO[] {
  return [
    createMenuNode('M_SYS', '0', 'M', '系统管理', [
      createMenuNode('C_USER', 'M_SYS', 'C', '用户管理', [
        createMenuNode('F_USER_LIST', 'C_USER', 'F', '用户查询'),
        createMenuNode('F_USER_CREATE', 'C_USER', 'F', '用户新增'),
        createMenuNode('F_USER_DELETE', 'C_USER', 'F', '用户删除'),
      ]),
      createMenuNode('C_ROLE', 'M_SYS', 'C', '角色管理', [
        createMenuNode('F_ROLE_LIST', 'C_ROLE', 'F', '角色查询'),
      ]),
      createMenuNode('C_EMPTY_LEAF_MENU', 'M_SYS', 'C', '参数视图'),
    ]),
  ];
}

function createDictMap(): Record<string, DictItem[]> {
  return {
    commonStatus: [
      { label: '正常', value: 0, tagType: 'success' },
      { label: '停用', value: 1, tagType: 'danger' },
    ],
    dataScopeType: [
      { label: '全部数据权限', value: 1, tagType: 'primary' },
      { label: '自定部门数据权限', value: 2, tagType: 'warning' },
      { label: '本部门数据权限', value: 3, tagType: 'info' },
      { label: '本部门及以下数据权限', value: 4, tagType: 'success' },
      { label: '仅本人数据权限', value: 5, tagType: 'info' },
    ],
  };
}

describe('RoleTreeHelpers & RoleView', () => {
  let pinia: ReturnType<typeof createPinia>;
  let atengVue: ReturnType<typeof createAtengVue>;
  let router: Router;

  beforeEach(async () => {
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
    const dictMap = createDictMap();
    DictManager.setProvider(async code => dictMap[code] ?? []);
    DictManager.setBatchProvider(async codes =>
      Object.fromEntries(codes.map(code => [code, dictMap[code] ?? []])),
    );
    const EmptyView = defineComponent({ name: 'StubView', template: '<div />' });
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', name: 'Login', component: EmptyView },
        { path: '/system/role', name: 'SysRole', component: RoleView },
      ],
    });
    await router.push('/system/role');
    await router.isReady();
  });

  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount();
    }
    setActivePinia(createPinia());
    setupDictManager();
    vi.restoreAllMocks();
  });

  it('extracts only tree leaf IDs on edit hydration in linked mode to prevent sibling auto-check, and preserves all keys in unlinked mode', () => {
    const tree = createSampleGrantableTree();
    const storedMenuIds = ['M_SYS', 'C_USER', 'F_USER_LIST', 'C_EMPTY_LEAF_MENU'];

    expect(resolveInitialCheckedMenuKeys(tree, storedMenuIds, true)).toEqual([
      'F_USER_LIST',
      'C_EMPTY_LEAF_MENU',
    ]);
    expect(
      resolveInitialCheckedMenuKeys(tree, ['M_SYS', 'C_USER', 'F_USER_LIST', 'M_SYS'], false),
    ).toEqual(['M_SYS', 'C_USER', 'F_USER_LIST']);
  });

  it('merges checkedKeys and halfCheckedKeys on submit in linked mode while ignoring halfCheckedKeys in unlinked mode', () => {
    expect(
      collectSubmittedMenuIds(['F_USER_LIST', 'F_ROLE_LIST'], ['M_SYS', 'C_USER', 'F_USER_LIST'], true),
    ).toEqual(['F_USER_LIST', 'F_ROLE_LIST', 'M_SYS', 'C_USER']);

    expect(collectSubmittedMenuIds(['F_USER_LIST', 'C_USER'], ['M_SYS'], false)).toEqual([
      'F_USER_LIST',
      'C_USER',
    ]);
  });

  it('blocks CUSTOM (dataScope=2) submission when zero departments are selected and passes otherwise', () => {
    expect(validateCustomDataScope(DATA_SCOPE_CUSTOM, [])).toBe(
      '选择自定部门数据权限时，至少需勾选 1 个部门',
    );
    expect(validateCustomDataScope(DATA_SCOPE_CUSTOM, ['100'])).toBeNull();
    expect(validateCustomDataScope(1, [])).toBeNull();
  });

  it('protects super_admin, preserves half-checked parents across strictly toggle, and blocks CUSTOM dataScope above dept tree', async () => {
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue({
      userId: '1',
      tenantId: '0',
      tenantName: '平台默认租户',
      username: 'superadmin',
      nickname: '超级管理员',
      avatar: null,
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      passwordNeedsChange: false,
    });
    await useAuthStore().fetchUserInfo();

    const roles: RoleVO[] = [
      {
        id: 'R1',
        roleName: '超级管理员',
        roleKey: 'super_admin',
        dataScope: 1,
        menuCheckStrictly: true,
        deptCheckStrictly: false,
        sort: 1,
        status: 0,
        remark: '内置超管',
        builtinSuperAdmin: true,
        createTime: '2026-11-25 09:00:00',
      },
      {
        id: 'R2',
        roleName: '研发主管',
        roleKey: 'rd_lead',
        dataScope: 2,
        menuCheckStrictly: true,
        deptCheckStrictly: false,
        sort: 2,
        status: 0,
        remark: '部门角色',
        builtinSuperAdmin: false,
        createTime: '2026-11-25 09:10:00',
      },
    ];
    const roleDetail: RoleDetailVO = {
      ...roles[1]!,
      menuIds: ['M_SYS', 'C_USER', 'F_USER_LIST'],
      deptIds: [],
    };

    vi.spyOn(roleApi, 'getRolePage').mockResolvedValue({ records: roles, total: 2, size: 10, current: 1, pages: 1 });
    const grantTreeSpy = vi.spyOn(roleApi, 'getRoleGrantableMenuTree').mockResolvedValue(createSampleGrantableTree());
    vi.spyOn(roleApi, 'getRoleDetail').mockResolvedValue(roleDetail);
    const updateRoleSpy = vi.spyOn(roleApi, 'updateRole').mockResolvedValue();
    vi.spyOn(deptApi, 'getDeptOptions').mockResolvedValue([
      { id: 'D1', parentId: '0', ancestors: '0', deptName: '平台总部', sort: 1, status: 0, createTime: '2026-11-25 09:00:00', children: [] },
    ]);
    const dataScopeSpy = vi.spyOn(roleApi, 'updateRoleDataScope').mockResolvedValue();
    vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close: () => undefined }));
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: () => undefined }));

    const wrapper = trackWrapper(mount(RoleView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }));
    await flushPromises();

    expect(wrapper.find('[data-testid="role-builtin-badge-R1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="role-edit-btn-R1"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="role-scope-btn-R1"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="role-delete-btn-R1"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="role-status-switch-R1"]').classes()).toContain('is-disabled');

    // 编辑 R2：切掉「父子联动」时，原半选父目录 M_SYS / C_USER 必须留存且不得误全选 F_USER_CREATE
    await wrapper.find('[data-testid="role-edit-btn-R2"]').trigger('click');
    await flushPromises();
    expect(grantTreeSpy).toHaveBeenCalledTimes(1);

    const strictlyCheckbox = document.body.querySelector(
      '[data-testid="role-menu-strictly"] input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(strictlyCheckbox).not.toBeNull();
    strictlyCheckbox!.click();
    await flushPromises();

    const saveRoleBtn = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent?.includes('保存角色')) as HTMLButtonElement | undefined;
    saveRoleBtn?.click();
    await flushPromises();

    expect(updateRoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'R2',
        menuCheckStrictly: false,
        menuIds: expect.arrayContaining(['F_USER_LIST', 'M_SYS', 'C_USER']),
      }),
    );
    expect(updateRoleSpy.mock.calls[0]![0].menuIds ?? []).not.toContain('F_USER_CREATE');

    // 打开 R2 数据权限弹窗：CUSTOM 未勾部门应在树上方显示错误并阻断提交
    await wrapper.find('[data-testid="role-scope-btn-R2"]').trigger('click');
    await flushPromises();
    const saveScopeBtn = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent?.includes('保存权限')) as HTMLButtonElement | undefined;
    saveScopeBtn?.click();
    await flushPromises();

    expect(dataScopeSpy).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="role-data-scope-error"]')?.textContent).toContain(
      '选择自定部门数据权限时，至少需勾选 1 个部门',
    );
  });

  it('preloads dataScopeType before rendering RoleView rows so first frame never flashes raw numeric codes (#57)', async () => {
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue({
      userId: '1',
      tenantId: '0',
      tenantName: '平台默认租户',
      username: 'superadmin',
      nickname: '超级管理员',
      avatar: null,
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      passwordNeedsChange: false,
    });
    await useAuthStore().fetchUserInfo();

    const dictMap = createDictMap();
    let releaseDataScope!: () => void;
    const dataScopeGate = new Promise<void>(resolve => {
      releaseDataScope = resolve;
    });

    DictManager.setProvider(async code => {
      if (code === 'dataScopeType') {
        await dataScopeGate;
      }
      return dictMap[code] ?? [];
    });
    DictManager.setBatchProvider(async codes => {
      if (codes.includes('dataScopeType')) {
        await dataScopeGate;
      }
      return Object.fromEntries(codes.map(code => [code, dictMap[code] ?? []]));
    });

    vi.spyOn(roleApi, 'getRolePage').mockResolvedValue({
      records: [
        {
          id: 'R1',
          roleName: '超级管理员',
          roleKey: 'super_admin',
          dataScope: 1,
          menuCheckStrictly: true,
          deptCheckStrictly: false,
          sort: 1,
          status: 0,
          builtinSuperAdmin: true,
          createTime: '2026-11-26 09:00:00',
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });

    const wrapper = trackWrapper(
      mount(RoleView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(wrapper.find('.at-dict-tag__item').exists()).toBe(false);

    releaseDataScope();
    await flushPromises();

    const scopeTag = wrapper.find('.at-dict-tag__item');
    expect(scopeTag.exists()).toBe(true);
    expect(scopeTag.text()).toBe('全部数据权限');
  });
});
