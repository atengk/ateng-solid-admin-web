import { defineComponent, h, KeepAlive, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import AtengElementPlus, { DictManager, type DictItem } from '@atengk/element-plus';
import { createAtengVue } from '@atengk/vue';
import * as authApi from '@/api/auth';
import * as configApi from '@/api/system/config';
import * as menuApi from '@/api/system/menu';
import type { MenuTreeVO } from '@/api/system/menu';
import * as tenantApi from '@/api/system/tenant';
import type { TenantVO } from '@/api/system/tenant';
import * as tenantPackageApi from '@/api/system/tenant-package';
import type { TenantPackageDetailVO, TenantPackageVO } from '@/api/system/tenant-package';
import { setupDictManager } from '@/utils/dict';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import {
  buildSelectablePackageOptions,
  buildTenantInitCopyText,
  buildTenantUpdatePayload,
  formatTenantQuotaSummary,
  generateRandomTenantCode,
  isProtectedPlatformTenant,
  resolveTenantExpireStatus,
} from '@/views/system/tenant/tenantHelper';
import TenantView from '@/views/system/tenant/index.vue';
import { filterPackageAssignableMenus, hasRemovedMenuIds } from '@/views/system/tenant-package/tenantPackageHelper';
import TenantPackageView from '@/views/system/tenant-package/index.vue';

/**
 * SaaS 多租户管理（/system/tenant）与租户套餐管理（/system/tenant-package）验收测试。
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
  options: { platformOnly?: boolean | number; status?: 0 | 1; children?: MenuTreeVO[] } = {},
): MenuTreeVO {
  return {
    id,
    parentId,
    menuType,
    title,
    sort: 1,
    visible: 0,
    status: options.status ?? 0,
    keepAlive: menuType === 'C',
    isExternal: false,
    platformOnly: options.platformOnly as unknown as boolean,
    createTime: '2026-11-25 10:00:00',
    children: options.children ?? [],
  };
}

function setInputValue(selector: string, val: string): HTMLInputElement | null {
  const input = document.body.querySelector(selector) as HTMLInputElement | null;
  if (input) {
    input.value = val;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return input;
}

function findButtonByText(text: string, scope: ParentNode = document.body): HTMLButtonElement | undefined {
  return Array.from(scope.querySelectorAll('button')).find(btn => btn.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined;
}

describe('Tenant & TenantPackage Views & Helpers', () => {
  let pinia: ReturnType<typeof createPinia>;
  let atengVue: ReturnType<typeof createAtengVue>;
  let router: Router;

  async function mountWithPlatformSuperAdmin(path: '/system/tenant' | '/system/tenant-package') {
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue({
      userId: '1',
      tenantId: '0',
      tenantName: '平台默认租户',
      username: 'superadmin',
      nickname: '超级管理员',
      avatar: null,
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      tenantEnabled: true,
      passwordNeedsChange: false,
    });
    useAuthStore().setTenantEnabled(true);
    await useAuthStore().fetchUserInfo();
    await router.push(path);
    await router.isReady();
    const cmp = path === '/system/tenant' ? TenantView : TenantPackageView;
    const wrapper = trackWrapper(
      mount(cmp, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();
    return wrapper;
  }

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
    };
    DictManager.setProvider(async code => dictMap[code] ?? []);
    DictManager.setBatchProvider(async codes => Object.fromEntries(codes.map(c => [c, dictMap[c] ?? []])));
    const StubView = defineComponent({ name: 'StubView', template: '<div />' });
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/login', name: 'Login', component: StubView },
        { path: '/system/tenant', name: 'SysTenant', component: TenantView },
        { path: '/system/tenant-package', name: 'SysTenantPackage', component: TenantPackageView },
      ],
    });
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: () => undefined }));
    vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close: () => undefined }));
  });

  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount();
    }
    localStorage.clear();
    sessionStorage.clear();
    adminAuthManager.clearToken();
    adminTenantManager.setTenantId('0');
    setActivePinia(createPinia());
    setupDictManager();
    vi.restoreAllMocks();
  });

  it('identifies protected platform default tenant 0 (000000) and builds restricted update payload', () => {
    expect(isProtectedPlatformTenant({ id: '0', tenantCode: '000000', platformDefault: true })).toBe(true);
    expect(isProtectedPlatformTenant({ id: '100', tenantCode: '000000', platformDefault: false })).toBe(true);
    expect(isProtectedPlatformTenant({ id: '10002', tenantCode: '100002', platformDefault: false })).toBe(false);

    expect(
      buildTenantUpdatePayload(
        {
          id: '0',
          tenantCode: '000000',
          tenantName: ' 平台默认运营中心 ',
          packageId: 'pkg-1',
          unlimitedAccount: false,
          accountCount: 5,
          permanentExpire: false,
          expireTime: '2028-01-01 00:00:00',
          status: 1,
          remark: ' 默认平台租户备注 ',
        },
        true,
      ),
    ).toEqual({ id: '0', tenantName: '平台默认运营中心', remark: '默认平台租户备注' });

    expect(
      buildTenantUpdatePayload(
        {
          id: '10002',
          tenantCode: '100002',
          tenantName: '星辰智能科技',
          packageId: '34001',
          unlimitedAccount: true,
          accountCount: 10,
          permanentExpire: true,
          expireTime: '2028-01-01 00:00:00',
          status: 0,
          remark: '',
        },
        false,
      ),
    ).toEqual({
      id: '10002',
      tenantName: '星辰智能科技',
      packageId: '34001',
      accountCount: -1,
      expireTime: null,
      status: 0,
      remark: null,
    });
  });

  it('formats quota summaries, evaluates expiry urgency, preserves disabled bound packages, and generates safe 6-digit codes', () => {
    expect(formatTenantQuotaSummary(2, -1)).toEqual({ text: '2 / 不限', unlimited: true, full: false });
    expect(formatTenantQuotaSummary(4, 4)).toEqual({ text: '4 / 4', unlimited: false, full: true });
    expect(formatTenantQuotaSummary(1, 5)).toEqual({ text: '1 / 5', unlimited: false, full: false });

    const now = new Date('2026-11-25T12:00:00');
    expect(resolveTenantExpireStatus(null, now)).toBe('permanent');
    expect(resolveTenantExpireStatus('2026-11-24 23:59:59', now)).toBe('expired');
    expect(resolveTenantExpireStatus('2026-11-29 12:00:00', now)).toBe('expiring');
    expect(resolveTenantExpireStatus('2027-06-01 00:00:00', now)).toBe('normal');

    expect(
      buildSelectablePackageOptions([{ id: 'P1', packageName: '标准版套餐' }], {
        packageId: 'P_LEGACY',
        packageName: '历史体验版',
      }),
    ).toEqual([
      { id: 'P1', packageName: '标准版套餐', disabled: false, status: 0 },
      { id: 'P_LEGACY', packageName: '历史体验版 (已停用)', disabled: true, status: 1 },
    ]);

    for (let i = 0; i < 20; i += 1) {
      const code = generateRandomTenantCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(code).not.toBe('000000');
    }

    expect(
      buildTenantInitCopyText({ tenantId: '10009', tenantCode: '886601', tenantName: '新云制造', adminUsername: 'xy_admin' }),
    ).toContain('886601');
  });

  it('recursively strips platformOnly (boolean true or numeric 1) and disabled nodes from package menu tree, and detects menu shrinkage', () => {
    const rawTree: MenuTreeVO[] = [
      createMenuNode('M_SYS', '0', 'M', '系统管理', {
        platformOnly: false,
        children: [
          createMenuNode('C_USER', 'M_SYS', 'C', '用户管理', { platformOnly: false }),
          createMenuNode('C_MENU', 'M_SYS', 'C', '菜单管理', { platformOnly: true }),
          createMenuNode('C_DICT', 'M_SYS', 'C', '数据字典', { platformOnly: 1 }),
          createMenuNode('C_DISABLED', 'M_SYS', 'C', '停用功能', { status: 1 }),
        ],
      }),
      createMenuNode('M_TENANT_DIR', '0', 'M', '多租户治理', {
        platformOnly: 1,
        children: [createMenuNode('C_TENANT', 'M_TENANT_DIR', 'C', '租户管理', { platformOnly: false })],
      }),
    ];

    const filtered = filterPackageAssignableMenus(rawTree);
    expect(filtered.map(n => n.id)).toEqual(['M_SYS']);
    expect(filtered[0]!.children.map(n => n.id)).toEqual(['C_USER']);
    expect(hasRemovedMenuIds(['M_SYS', 'C_USER', 'C_ROLE'], ['M_SYS', 'C_USER'])).toBe(true);
    expect(hasRemovedMenuIds(['M_SYS', 'C_USER'], ['M_SYS', 'C_USER', 'C_ROLE'])).toBe(false);
    expect(hasRemovedMenuIds([], ['M_SYS'])).toBe(false);
  });

  it('protects tenant 0 (000000), shows CreateTenantVO credential dialog on creation, and warns about session kickout on status disable/delete', async () => {
    const sampleTenants: TenantVO[] = [
      {
        id: '0',
        tenantCode: '000000',
        tenantName: '平台默认租户',
        packageId: null,
        packageName: null,
        packageDisabled: false,
        accountCount: -1,
        usedAccountCount: 4,
        expireTime: null,
        expired: false,
        status: 0,
        remark: '平台内置',
        platformDefault: true,
        createTime: '2026-11-18 09:00:00',
      },
      {
        id: '10002',
        tenantCode: '100002',
        tenantName: '星辰智能科技',
        packageId: 'P_STD',
        packageName: '标准企业版',
        packageDisabled: false,
        accountCount: 4,
        usedAccountCount: 4,
        expireTime: '2026-11-01 00:00:00',
        expired: true,
        status: 0,
        remark: '已满额且过期测试',
        platformDefault: false,
        createTime: '2026-11-20 10:00:00',
      },
    ];

    vi.spyOn(tenantApi, 'getTenantPage').mockResolvedValue({ records: sampleTenants, total: 2, size: 10, current: 1, pages: 1 });
    vi.spyOn(tenantPackageApi, 'getTenantPackageOptions').mockResolvedValue([{ id: 'P_STD', packageName: '标准企业版' }]);
    const tenantOptionsSpy = vi.spyOn(tenantApi, 'getTenantOptions').mockResolvedValue([]);
    vi.spyOn(tenantApi, 'getTenantDetail').mockResolvedValue(sampleTenants[0]!);
    const updateTenantSpy = vi.spyOn(tenantApi, 'updateTenant').mockResolvedValue();
    const createTenantSpy = vi.spyOn(tenantApi, 'createTenant').mockResolvedValue({
      tenantId: '10088',
      tenantCode: '668899',
      tenantName: '未来智造',
      adminUsername: 'wl_admin',
    });
    const updateStatusSpy = vi.spyOn(tenantApi, 'updateTenantStatus').mockResolvedValue();
    const deleteTenantsSpy = vi.spyOn(tenantApi, 'deleteTenants').mockResolvedValue();
    vi.spyOn(configApi, 'getConfigByKey').mockResolvedValue('Ateng@2026');
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextMock }, configurable: true });

    const wrapper = await mountWithPlatformSuperAdmin('/system/tenant');

    // 1. id === '0' 行禁用勾选、状态与删除；普通租户可删并显示配额/过期标识
    const checkboxes = wrapper.findAll('.el-table__body-wrapper .el-table-column--selection input[type="checkbox"]');
    expect(checkboxes[0]!.attributes('disabled')).toBeDefined();
    expect(checkboxes[1]!.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="tenant-status-switch-0"]').classes()).toContain('is-disabled');
    expect(wrapper.find('[data-testid="tenant-delete-btn-0"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="tenant-delete-btn-10002"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('平台默认');
    expect(wrapper.text()).toContain('4 / 不限');
    expect(wrapper.text()).toContain('永久有效');
    expect(wrapper.text()).toContain('4 / 4');
    expect(wrapper.text()).toContain('已过期');

    // 2. 编辑 0 号租户仅可改名称/备注
    await wrapper.find('[data-testid="tenant-edit-btn-0"]').trigger('click');
    await flushPromises();
    setInputValue('[data-testid="tenant-form-name"] input, input[data-testid="tenant-form-name"]', '平台运营底座');
    await flushPromises();
    findButtonByText('保存租户')?.click();
    await flushPromises();
    expect(updateTenantSpy).toHaveBeenCalledWith({ id: '0', tenantName: '平台运营底座', remark: '平台内置' });
    expect(tenantOptionsSpy).toHaveBeenCalledTimes(1);

    // 3. 新建租户预填初始密码并弹出 CreateTenantVO 凭据回显框
    await wrapper.find('[data-testid="tenant-add-btn"]').trigger('click');
    await flushPromises();
    const pwdInput = document.body.querySelector('[data-testid="tenant-form-admin-password"] input, input[data-testid="tenant-form-admin-password"]') as HTMLInputElement | null;
    expect(pwdInput?.value).toBe('Ateng@2026');

    setInputValue('[data-testid="tenant-form-code"] input, input[data-testid="tenant-form-code"]', '668899');
    setInputValue('[data-testid="tenant-form-name"] input, input[data-testid="tenant-form-name"]', '未来智造');
    setInputValue('[data-testid="tenant-form-admin-username"] input, input[data-testid="tenant-form-admin-username"]', 'wl_admin');
    (document.body.querySelector('[data-testid="tenant-form-permanent-expire"] input[type="checkbox"]') as HTMLInputElement).click();
    (document.body.querySelector('[data-testid="tenant-form-unlimited-account"] input[type="checkbox"]') as HTMLInputElement).click();
    await flushPromises();

    const pkgTrigger = (document.body.querySelector('[data-testid="tenant-form-package"] .el-select__wrapper') ??
      document.body.querySelector('[data-testid="tenant-form-package"]')) as HTMLElement;
    pkgTrigger.click();
    await flushPromises();
    (document.body.querySelector('.tenant-form-package-popper [data-testid="tenant-form-package-option-P_STD"]') as HTMLElement).click();
    await flushPromises();

    findButtonByText('创建租户')?.click();
    await flushPromises();
    expect(createTenantSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantCode: '668899', tenantName: '未来智造', packageId: 'P_STD', accountCount: -1, expireTime: null, adminUsername: 'wl_admin', adminPassword: 'Ateng@2026' }),
    );
    expect(tenantOptionsSpy).toHaveBeenCalledTimes(2);

    const credDialog = document.body.querySelector('[data-testid="tenant-init-credential-dialog"]');
    expect(credDialog?.textContent).toContain('10088');
    expect(credDialog?.textContent).toContain('668899');
    expect(credDialog?.textContent).toContain('wl_admin');
    (credDialog?.querySelector('[data-testid="tenant-init-copy-btn"]') as HTMLButtonElement | null)?.click();
    await flushPromises();
    expect(writeTextMock).toHaveBeenCalledWith(expect.stringContaining('668899'));
    findButtonByText('完成', document.body.querySelector('.el-dialog') ?? document.body)?.click();
    await flushPromises();

    // 4. 停用/删除租户确认警示强退在线会话
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    await wrapper.find('[data-testid="tenant-status-switch-10002"]').trigger('click');
    await flushPromises();
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('强制下线'), expect.any(String), expect.any(Object));
    expect(updateStatusSpy).toHaveBeenCalledWith('10002', 1);
    expect(tenantOptionsSpy).toHaveBeenCalledTimes(3);

    await wrapper.find('[data-testid="tenant-delete-btn-10002"]').trigger('click');
    await flushPromises();
    expect(confirmSpy).toHaveBeenLastCalledWith(expect.stringContaining('强制下线'), expect.any(String), expect.any(Object));
    expect(deleteTenantsSpy).toHaveBeenCalledWith('10002');
    expect(tenantOptionsSpy).toHaveBeenCalledTimes(4);
  });

  it('excludes platformOnly nodes from package menu tree, triggers shrink-preview on menu removal, aborts PUT on cancel, and submits PUT on confirm', async () => {
    const samplePackages: TenantPackageVO[] = [
      { id: '34001', packageName: '标准企业版套餐', menuCount: 5, tenantCount: 2, menuCheckStrictly: true, status: 0, remark: '常规组织权限', createTime: '2026-11-19 09:00:00' },
    ];
    const pkgDetail: TenantPackageDetailVO = {
      ...samplePackages[0]!,
      menuIds: ['M_SYS', 'C_USER', 'F_USER_LIST', 'C_ROLE', 'F_ROLE_LIST'],
    };
    const fullMenuTree: MenuTreeVO[] = [
      createMenuNode('M_SYS', '0', 'M', '系统管理', {
        platformOnly: false,
        children: [
          createMenuNode('C_USER', 'M_SYS', 'C', '用户管理', {
            children: [createMenuNode('F_USER_LIST', 'C_USER', 'F', '用户查询'), createMenuNode('F_USER_CREATE', 'C_USER', 'F', '用户新增')],
          }),
          createMenuNode('C_ROLE', 'M_SYS', 'C', '角色管理', { children: [createMenuNode('F_ROLE_LIST', 'C_ROLE', 'F', '角色查询')] }),
          createMenuNode('C_MENU', 'M_SYS', 'C', '菜单管理', { platformOnly: true }),
          createMenuNode('C_DICT', 'M_SYS', 'C', '数据字典', { platformOnly: 1 }),
        ],
      }),
      createMenuNode('M_TENANT_DIR', '0', 'M', '多租户治理', {
        platformOnly: true,
        children: [createMenuNode('C_TENANT', 'M_TENANT_DIR', 'C', '租户管理', { platformOnly: true })],
      }),
    ];

    vi.spyOn(tenantPackageApi, 'getTenantPackagePage').mockResolvedValue({ records: samplePackages, total: 1, size: 10, current: 1, pages: 1 });
    vi.spyOn(tenantPackageApi, 'getTenantPackageDetail').mockResolvedValue(pkgDetail);
    const menuTreeSpy = vi.spyOn(menuApi, 'getMenuTree').mockResolvedValue(fullMenuTree);
    const shrinkPreviewSpy = vi.spyOn(tenantPackageApi, 'previewPackageShrink').mockResolvedValue({
      removedMenuIds: ['C_ROLE', 'F_ROLE_LIST'],
      removedMenuTitles: ['角色管理', '角色查询'],
      affectedTenantCount: 2,
      affectedTenants: [
        { id: '10002', tenantCode: '100002', tenantName: '星辰智能科技' },
        { id: '10003', tenantCode: '100003', tenantName: '云港物流集团' },
      ],
    });
    const updatePkgSpy = vi.spyOn(tenantPackageApi, 'updateTenantPackage').mockResolvedValue();

    const wrapper = await mountWithPlatformSuperAdmin('/system/tenant-package');
    expect(wrapper.text()).toContain('标准企业版套餐');

    // 1. 编辑抽屉排除 platformOnly 节点且未缩减时跳过 shrink-preview 直接 PUT
    await wrapper.find('[data-testid="pkg-edit-btn-34001"]').trigger('click');
    await flushPromises();
    expect(menuTreeSpy).toHaveBeenCalledTimes(1);

    const treeContainer = document.body.querySelector('[data-testid="pkg-form-menu-tree"]');
    expect(treeContainer?.textContent).toContain('角色查询');
    expect(treeContainer?.textContent).not.toContain('菜单管理');
    expect(treeContainer?.textContent).not.toContain('数据字典');
    expect(treeContainer?.textContent).not.toContain('租户管理');

    findButtonByText('保存套餐')?.click();
    await flushPromises();
    expect(shrinkPreviewSpy).not.toHaveBeenCalled();
    expect(updatePkgSpy).toHaveBeenCalledTimes(1);
    expect(updatePkgSpy.mock.calls[0]![0].menuIds).not.toContain('F_USER_CREATE');

    // 2. 反选「角色查询」触发缩减预览弹窗；取消阻断 PUT，确认放行 PUT
    updatePkgSpy.mockClear();
    await wrapper.find('[data-testid="pkg-edit-btn-34001"]').trigger('click');
    await flushPromises();

    const roleCheckbox = document.body
      .querySelector('[data-testid="pkg-menu-node-F_ROLE_LIST"]')
      ?.closest('.el-tree-node__content')
      ?.querySelector('.el-checkbox input[type="checkbox"]') as HTMLInputElement;
    roleCheckbox.click();
    await flushPromises();

    findButtonByText('保存套餐')?.click();
    await flushPromises();
    expect(shrinkPreviewSpy).toHaveBeenCalledWith({
      packageId: '34001',
      newMenuIds: expect.arrayContaining(['M_SYS', 'C_USER', 'F_USER_LIST']),
    });
    expect(updatePkgSpy).not.toHaveBeenCalled();

    const shrinkDialog = document.body.querySelector('[data-testid="pkg-shrink-confirm-dialog"]');
    expect(shrinkDialog?.textContent).toContain('星辰智能科技');
    expect(shrinkDialog?.textContent).toContain('云港物流集团');
    expect(shrinkDialog?.textContent).toContain('角色管理');

    findButtonByText('取消', shrinkDialog!.closest('.el-dialog') ?? document.body)?.click();
    await flushPromises();
    expect(updatePkgSpy).not.toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="pkg-form-menu-tree"]')).not.toBeNull();

    findButtonByText('保存套餐')?.click();
    await flushPromises();
    findButtonByText('确认缩减并裁剪权限')?.click();
    await flushPromises();
    expect(updatePkgSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: '34001', menuIds: expect.arrayContaining(['M_SYS', 'C_USER', 'F_USER_LIST']) }),
    );
  });

  it('refreshes package counts and tenant package options upon KeepAlive reactivation without duplicating mount requests (#48)', async () => {
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue({
      userId: '1',
      tenantId: '0',
      tenantName: '平台默认租户',
      username: 'superadmin',
      nickname: '超级管理员',
      avatar: null,
      roles: ['super_admin'],
      permissions: ['*:*:*'],
      tenantEnabled: true,
      passwordNeedsChange: false,
    });
    useAuthStore().setTenantEnabled(true);
    await useAuthStore().fetchUserInfo();

    const pkgPageSpy = vi.spyOn(tenantPackageApi, 'getTenantPackagePage').mockResolvedValue({
      records: [{ id: 'P1', packageName: '标准套餐', menuCount: 2, tenantCount: 1, menuCheckStrictly: true, status: 0, createTime: '2026-11-25 10:00:00' }],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });
    const tenantPageSpy = vi.spyOn(tenantApi, 'getTenantPage').mockResolvedValue({
      records: [],
      total: 0,
      size: 10,
      current: 1,
      pages: 0,
    });
    const pkgOptSpy = vi.spyOn(tenantPackageApi, 'getTenantPackageOptions').mockResolvedValue([
      { id: 'P1', packageName: '标准套餐' },
    ]);

    const activeView = ref<'pkg' | 'tenant'>('pkg');
    const Host = defineComponent({
      setup() {
        return { activeView };
      },
      render() {
        return h(KeepAlive, null, {
          default: () => (activeView.value === 'pkg' ? h(TenantPackageView) : h(TenantView)),
        });
      },
    });

    const wrapper = trackWrapper(
      mount(Host, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();
    expect(wrapper.text()).toContain('标准套餐');
    // 首次挂载 KeepAlive 不应双发
    expect(pkgPageSpy).toHaveBeenCalledTimes(1);

    // 切至租户管理页（KeepAlive 缓存套餐页）
    activeView.value = 'tenant';
    await flushPromises();
    expect(tenantPageSpy).toHaveBeenCalledTimes(1);
    expect(pkgOptSpy).toHaveBeenCalledTimes(1);

    // 切回套餐页：必须触发二次刷新以同步最新绑定租户数
    activeView.value = 'pkg';
    await flushPromises();
    expect(pkgPageSpy).toHaveBeenCalledTimes(2);

    // 再切回租户页：必须同步重拉列表与套餐下拉选项
    activeView.value = 'tenant';
    await flushPromises();
    expect(tenantPageSpy).toHaveBeenCalledTimes(2);
    expect(pkgOptSpy).toHaveBeenCalledTimes(2);
  });
});
