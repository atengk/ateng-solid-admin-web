import { computed, defineComponent, h, KeepAlive, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus, { ElMessage } from 'element-plus';
import AtengElementPlus, { DictManager, type DictItem } from '@atengk/element-plus';
import { BusinessException } from '@atengk/core';
import { createAtengVue } from '@atengk/vue';
import * as authApi from '@/api/auth';
import * as configApi from '@/api/system/config';
import * as deptApi from '@/api/system/dept';
import * as postApi from '@/api/system/post';
import * as roleApi from '@/api/system/role';
import * as userApi from '@/api/system/user';
import type { ImportResultVO, UserDetailVO, UserVO } from '@/api/system/user';
import { setupDictManager } from '@/utils/dict';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import UserFormDrawer from '@/views/system/user/components/UserFormDrawer.vue';
import UserImportDialog from '@/views/system/user/components/UserImportDialog.vue';
import UserView from '@/views/system/user/index.vue';
import { buildAssignablePostOptions, buildUserDeptTreeOptions } from '@/views/system/user/userHelper';

/**
 * 用户管理（左部门树联动、精确手机号检索、超管/自身行保护、导出与 Fesod 导入批注反馈）离线测试。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function createUserDictMap(): Record<string, DictItem[]> {
  return {
    commonStatus: [
      { label: '正常', value: 0, tagType: 'success' },
      { label: '停用', value: 1, tagType: 'danger' },
    ],
    sys_user_gender: [
      { label: '男', value: '0' },
      { label: '女', value: '1' },
      { label: '未知', value: '2' },
    ],
  };
}

describe('UserImportDialog & UserView', () => {
  let pinia: ReturnType<typeof createPinia>;
  let atengVue: ReturnType<typeof createAtengVue>;
  let router: Router;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    adminAuthManager.setToken('valid-token');
    useAuthStore().syncTokenFromManager();
    adminTenantManager.setTenantId('10');
    atengVue = createAtengVue({
      httpClient: adminHttpClient,
      authManager: adminAuthManager,
      tenantManager: adminTenantManager,
      superAdminRoles: ['super_admin'],
      defaultSize: 10,
    });
    const dictMap = createUserDictMap();
    DictManager.setProvider(async code => dictMap[code] ?? []);
    DictManager.setBatchProvider(async codes =>
      Object.fromEntries(codes.map(code => [code, dictMap[code] ?? []])),
    );
    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/system/user', name: 'SysUser', component: UserView }],
    });
    await router.push('/system/user');
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

  it('passes explicit { timeout: 120_000 } when invoking importUsers through adminHttpClient', async () => {
    const mockImportResult: ImportResultVO = {
      totalCount: 2,
      successCount: 2,
      failCount: 0,
      errors: [],
      feedbackToken: null,
    };
    const postSpy = vi.spyOn(adminHttpClient, 'post').mockResolvedValue(mockImportResult);
    const file = new File(['dummy-xlsx'], 'users.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const result = await userApi.importUsers(file);

    expect(result).toEqual(mockImportResult);
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [url, payload, config] = postSpy.mock.calls[0]!;
    expect(url).toBe('/admin/system/user/import');
    expect(payload).toBeInstanceOf(FormData);
    expect((payload as FormData).get('file')).toBe(file);
    expect(config).toEqual(expect.objectContaining({ timeout: 120_000 }));
  });

  it('opens AtengExcelFeedback on failCount > 0 and triggers downloadImportFeedback via adminHttpClient on click', async () => {
    const failedImportResult: ImportResultVO = {
      totalCount: 3,
      successCount: 0,
      failCount: 2,
      errors: [
        { rowNum: 2, columnName: '用户账号', errorMessage: '用户账号 zhangsan 已存在', rawValue: 'zhangsan' },
        { rowNum: 3, columnName: '手机号码', errorMessage: '手机号码格式不正确', rawValue: '12345' },
      ],
      feedbackToken: 'fb-token-34001',
    };

    const httpPostSpy = vi.spyOn(adminHttpClient, 'post').mockResolvedValue(failedImportResult);
    const httpGetSpy = vi.spyOn(adminHttpClient, 'get').mockResolvedValue(new Blob(['xlsx-error-feedback']));

    const dialogVisible = ref(true);
    const Host = {
      components: { UserImportDialog },
      setup() {
        const open = computed({
          get: () => dialogVisible.value,
          set: (val: boolean) => {
            dialogVisible.value = val;
          },
        });
        return { open };
      },
      template: '<UserImportDialog v-model="open" />',
    };

    const wrapper = trackWrapper(mount(Host, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }));
    await flushPromises();

    const uploadCmp = wrapper.findComponent({ name: 'AtengUpload' });
    expect(uploadCmp.exists()).toBe(true);
    const httpRequestProp = uploadCmp.props('httpRequest') as ((opts: { file: File }) => Promise<unknown>) | undefined;

    await httpRequestProp!({
      file: new File(['xlsx-bytes'], 'users_fail.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    });
    await flushPromises();

    expect(httpPostSpy).toHaveBeenCalledWith(
      '/admin/system/user/import',
      expect.any(FormData),
      expect.objectContaining({ timeout: 120_000 }),
    );
    expect(dialogVisible.value).toBe(false);
    expect(document.body.textContent).toContain('用户账号 zhangsan 已存在');
    expect(document.body.textContent).toContain('手机号码格式不正确');

    const downloadFeedbackBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('下载标红批注'),
    ) as HTMLButtonElement | undefined;
    expect(downloadFeedbackBtn).toBeDefined();
    downloadFeedbackBtn!.click();
    await flushPromises();

    expect(httpGetSpy).toHaveBeenCalledWith(
      '/admin/system/user/import/feedback/fb-token-34001',
      expect.objectContaining({ responseType: 'blob' }),
    );

    // 关闭动画期保留失败行数与错误明细，直到 @closed 才清空（#50）
    const feedbackCmp = wrapper.findComponent({ name: 'AtengExcelFeedback' });
    expect(feedbackCmp.exists()).toBe(true);
    await feedbackCmp.vm.$emit('update:modelValue', false);
    await flushPromises();
    expect(feedbackCmp.props('title')).toContain('共解析 3 行，校验失败 2 条');

    await feedbackCmp.vm.$emit('closed');
    await flushPromises();
    expect(feedbackCmp.props('title')).toContain('共解析 0 行，校验失败 0 条');
    expect(feedbackCmp.props('errors')).toEqual([]);
  });

  it('retains disabled bound dept/post fallbacks, protects super_admin and self rows, filters by real DOM dept click, and loads plaintext on edit', async () => {
    // 1. 停用部门与停用岗位回显兜底纯函数验证
    const deptFallback = buildUserDeptTreeOptions([], 'D_OLD', '历史架构组');
    expect(deptFallback).toEqual([{ id: 'D_OLD', label: '历史架构组', disabled: false, status: 1, children: [] }]);
    const postFallback = buildAssignablePostOptions([{ id: 'P1', postCode: 'DEV', postName: '后端开发', status: 0 }], ['P1', 'P_DISABLED']);
    expect(postFallback).toEqual([
      { id: 'P1', postCode: 'DEV', postName: '后端开发', status: 0, disabled: false },
      { id: 'P_DISABLED', postCode: 'P_DISABLED', postName: '岗位 #P_DISABLED (已停用)', status: 1, disabled: true },
    ]);

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue({
      userId: 'U_SELF',
      tenantId: '10',
      tenantName: '租户A',
      username: 'tenant_admin',
      nickname: '当前管理员',
      avatar: null,
      roles: ['tenant_admin'],
      permissions: ['system:user:list', 'system:user:create', 'system:user:update', 'system:user:delete', 'system:user:import', 'system:user:export'],
      passwordNeedsChange: false,
    });
    await useAuthStore().fetchUserInfo();

    const sampleUsers: UserVO[] = [
      { id: 'U_SUPER', tenantId: '10', deptId: 'D1', deptName: '平台总部', username: 'superadmin', nickname: '平台超管', email: 'admin@ateng.dev', phone: '13900001111', gender: '0', avatar: null, status: 0, createTime: '2026-11-25 09:00:00', builtinSuperAdmin: true },
      { id: 'U_SELF', tenantId: '10', deptId: 'D1', deptName: '平台总部', username: 'tenant_admin', nickname: '当前管理员', email: 'self@ateng.dev', phone: '13811112222', gender: '0', avatar: null, status: 0, createTime: '2026-11-25 09:05:00', builtinSuperAdmin: false },
      { id: 'U_NORMAL', tenantId: '10', deptId: 'D2', deptName: '研发中心', username: 'zhangsan', nickname: '张三', email: 'zhangsan@ateng.dev', phone: '13812345678', gender: '1', avatar: null, status: 0, createTime: '2026-11-25 09:10:00', builtinSuperAdmin: false },
    ];

    const pageSpy = vi.spyOn(userApi, 'getUserPage').mockResolvedValue({ records: sampleUsers, total: 3, size: 10, current: 1, pages: 1 });
    vi.spyOn(deptApi, 'getDeptOptions').mockResolvedValue([
      {
        id: 'D1',
        parentId: '0',
        ancestors: '0',
        deptName: '平台总部',
        sort: 1,
        status: 0,
        createTime: '2026-11-25 09:00:00',
        children: [{ id: 'D2', parentId: 'D1', ancestors: '0,D1', deptName: '研发中心', sort: 2, status: 0, createTime: '2026-11-25 09:00:00', children: [] }],
      },
    ]);
    vi.spyOn(postApi, 'getPostOptions').mockResolvedValue([]);
    vi.spyOn(roleApi, 'getRoleOptions').mockResolvedValue([]);
    vi.spyOn(configApi, 'getConfigByKey').mockResolvedValue('Ateng@123456');

    const detailVO: UserDetailVO = { ...sampleUsers[2]!, roleIds: [], postIds: [] };
    const detailSpy = vi.spyOn(userApi, 'getUserDetail').mockResolvedValue(detailVO);

    const wrapper = trackWrapper(mount(UserView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }));
    await flushPromises();

    // 2. 列表脱敏展示 + 手机号精确提示
    expect(wrapper.text()).toContain('138****5678');
    expect(wrapper.text()).not.toContain('13812345678');
    const phoneQueryInput = wrapper.find('input[data-testid="user-query-phone"], [data-testid="user-query-phone"] input');
    expect(phoneQueryInput.attributes('placeholder')).toBe('请输入完整手机号（精确查询）');

    // 3. 当前用户及内置超管不可勾选/停用/删除，非平台超管同样禁用超管编辑按钮
    const checkboxes = wrapper.findAll('.el-table__body-wrapper .el-table-column--selection input[type="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0]!.attributes('disabled')).toBeDefined();
    expect(checkboxes[1]!.attributes('disabled')).toBeDefined();
    expect(checkboxes[2]!.attributes('disabled')).toBeUndefined();

    expect(wrapper.find('[data-testid="user-edit-btn-U_SUPER"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="user-delete-btn-U_SUPER"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="user-delete-btn-U_SELF"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="user-delete-btn-U_NORMAL"]').attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="user-reset-pwd-btn-U_SUPER"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="user-status-switch-U_SELF"]').classes()).toContain('is-disabled');

    // 4. 真实 DOM 点击左侧部门树节点触发带 deptId 的过滤
    const rdNodeContent = wrapper.findAll('.el-tree-node__content').find(node => node.text().includes('研发中心'));
    expect(rdNodeContent).toBeDefined();
    await rdNodeContent!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="user-active-dept-capsule"]').text()).toContain('筛选部门：研发中心（含下级）');
    expect(pageSpy).toHaveBeenLastCalledWith(expect.objectContaining({ deptId: 'D2', current: 1 }));

    // 5. 编辑普通用户加载真明文；编辑自己时锁定 roleIds
    await wrapper.find('[data-testid="user-edit-btn-U_NORMAL"]').trigger('click');
    await flushPromises();
    expect(detailSpy).toHaveBeenCalledWith('U_NORMAL');
    const formPhoneInput = document.body.querySelector('input[data-testid="user-form-phone"], [data-testid="user-form-phone"] input') as HTMLInputElement | null;
    expect(formPhoneInput?.value).toBe('13812345678');

    const closeDrawerBtn = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent?.includes('取消')) as HTMLButtonElement | undefined;
    closeDrawerBtn?.click();
    await flushPromises();

    detailSpy.mockResolvedValueOnce({ ...sampleUsers[1]!, roleIds: ['R_TENANT'], postIds: [] });
    await wrapper.find('[data-testid="user-edit-btn-U_SELF"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-testid="user-self-role-lock-hint"]')?.textContent).toContain(
      '当前登录账号不可自行修改角色授权',
    );
  });

  it('refreshes deptTree and user list upon KeepAlive reactivation and clears stale removed dept filter (#48)', async () => {
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue({
      userId: 'U_SELF',
      tenantId: '10',
      tenantName: '租户A',
      username: 'tenant_admin',
      nickname: '当前管理员',
      avatar: null,
      roles: ['tenant_admin'],
      permissions: ['system:user:list'],
      passwordNeedsChange: false,
    });
    await useAuthStore().fetchUserInfo();

    const deptOptSpy = vi.spyOn(deptApi, 'getDeptOptions')
      .mockResolvedValueOnce([
        {
          id: 'D1',
          parentId: '0',
          ancestors: '0',
          deptName: '平台总部',
          sort: 1,
          status: 0,
          createTime: '2026-11-25 09:00:00',
          children: [{ id: 'D2', parentId: 'D1', ancestors: '0,D1', deptName: '旧研发部', sort: 2, status: 0, createTime: '2026-11-25 09:00:00', children: [] }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'D1',
          parentId: '0',
          ancestors: '0',
          deptName: '平台总部',
          sort: 1,
          status: 0,
          createTime: '2026-11-25 09:00:00',
          children: [],
        },
      ]);
    const userPageSpy = vi.spyOn(userApi, 'getUserPage').mockResolvedValue({
      records: [],
      total: 0,
      size: 10,
      current: 1,
      pages: 0,
    });

    const active = ref<'user' | 'other'>('user');
    const DummyOther = defineComponent({ name: 'DummyOther', template: '<div>other</div>' });
    const Host = defineComponent({
      setup() {
        return { active };
      },
      render() {
        return h(KeepAlive, null, {
          default: () => (active.value === 'user' ? h(UserView) : h(DummyOther)),
        });
      },
    });

    const wrapper = trackWrapper(
      mount(Host, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();
    expect(deptOptSpy).toHaveBeenCalledTimes(1);
    expect(userPageSpy).toHaveBeenCalledTimes(1);

    // 选中即将被其他页删除的部门 D2
    const oldDeptNode = wrapper.findAll('.el-tree-node__content').find(node => node.text().includes('旧研发部'));
    await oldDeptNode!.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="user-active-dept-capsule"]').exists()).toBe(true);

    // 切离后返回：应重新拉取部门树与用户分页，且清掉已不存在的 D2 部门筛选
    active.value = 'other';
    await flushPromises();
    active.value = 'user';
    await flushPromises();

    expect(deptOptSpy).toHaveBeenCalledTimes(2);
    expect(userPageSpy.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(wrapper.find('[data-testid="user-active-dept-capsule"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('旧研发部');
  });

  it('marks username required only in create mode and hides 操作 column when lacking update/delete permissions (#51)', async () => {
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue({
      userId: 'U_VIEWER',
      tenantId: '10',
      tenantName: '租户A',
      username: 'viewer',
      nickname: '只读审计员',
      avatar: null,
      roles: ['auditor'],
      permissions: ['system:user:list'],
      passwordNeedsChange: false,
    });
    await useAuthStore().fetchUserInfo();

    vi.spyOn(deptApi, 'getDeptOptions').mockResolvedValue([]);
    vi.spyOn(postApi, 'getPostOptions').mockResolvedValue([]);
    vi.spyOn(roleApi, 'getRoleOptions').mockResolvedValue([]);
    vi.spyOn(configApi, 'getConfigByKey').mockResolvedValue('Init@2026');
    vi.spyOn(userApi, 'getUserDetail').mockResolvedValue({
      id: 'U_1',
      tenantId: '10',
      deptId: null,
      deptName: null,
      username: 'zhangsan',
      nickname: '张三',
      email: 'z@example.com',
      phone: '13800138000',
      gender: '0',
      avatar: null,
      status: 0,
      createTime: '2026-11-25 09:00:00',
      builtinSuperAdmin: false,
      roleIds: [],
      postIds: [],
    });
    vi.spyOn(userApi, 'getUserPage').mockResolvedValue({
      records: [
        {
          id: 'U_1',
          tenantId: '10',
          deptId: null,
          deptName: null,
          username: 'zhangsan',
          nickname: '张三',
          email: 'z@example.com',
          phone: '13800138000',
          gender: '0',
          avatar: null,
          status: 0,
          createTime: '2026-11-25 09:00:00',
          builtinSuperAdmin: false,
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/system/user', component: UserView }],
    });
    await router.push('/system/user');
    await router.isReady();

    // 1. 无 system:user:update / delete 权限时隐藏操作列
    const viewWrapper = trackWrapper(
      mount(UserView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();
    expect(viewWrapper.findAll('th').some(th => th.text().includes('操作'))).toBe(false);

    // 2. 新增态登录账号标 *，编辑态不标 * 且禁用
    const drawerMode = ref<'create' | 'edit'>('create');
    const drawerOpen = ref(true);
    const drawerHost = defineComponent({
      components: { UserFormDrawer },
      setup() {
        return { drawerMode, drawerOpen };
      },
      template: '<UserFormDrawer v-model="drawerOpen" :mode="drawerMode" user-id="U_1" />',
    });
    trackWrapper(
      mount(drawerHost, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();
    const createUsernameItem = document.body.querySelector('[data-testid="user-form-username"]')?.closest('.el-form-item');
    expect(createUsernameItem?.classList.contains('is-required')).toBe(true);

    drawerMode.value = 'edit';
    await flushPromises();
    const editUsernameItem = document.body.querySelector('[data-testid="user-form-username"]')?.closest('.el-form-item');
    expect(editUsernameItem?.classList.contains('is-required')).toBe(false);
  });

  it('resolves AtengUpload httpRequest without unhandled rejection when importUsers fails with BusinessException (#75)', async () => {
    const msgErrorSpy = vi
      .spyOn(ElMessage, 'error')
      .mockImplementation(() => ({ close: () => undefined }));
    const msgSuccessSpy = vi
      .spyOn(ElMessage, 'success')
      .mockImplementation(() => ({ close: () => undefined }));
    vi.spyOn(adminHttpClient, 'post')
      .mockRejectedValueOnce(new BusinessException(400, '缺少必要表头列：用户账号'))
      .mockResolvedValueOnce({
        totalCount: 1,
        successCount: 1,
        failCount: 0,
        errors: [],
        feedbackToken: null,
      } satisfies ImportResultVO);

    const dialogVisible = ref(true);
    const importedSpy = vi.fn();
    const Host = {
      components: { UserImportDialog },
      setup() {
        const open = computed({
          get: () => dialogVisible.value,
          set: (val: boolean) => {
            dialogVisible.value = val;
          },
        });
        return { open, importedSpy };
      },
      template: '<UserImportDialog v-model="open" @imported="importedSpy" />',
    };

    const wrapper = trackWrapper(
      mount(Host, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();

    const uploadCmp = wrapper.findComponent({ name: 'AtengUpload' });
    const httpRequestProp = uploadCmp.props('httpRequest') as (opts: { file: File }) => Promise<unknown>;
    const badFile = new File(['bad-xlsx'], 'bad.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    await expect(httpRequestProp({ file: badFile })).resolves.toBeUndefined();
    await flushPromises();

    expect(dialogVisible.value).toBe(true);
    expect(document.body.querySelector('[data-testid="user-import-error"]')?.textContent).toContain(
      '缺少必要表头列：用户账号',
    );
    expect(msgErrorSpy).toHaveBeenCalledWith('缺少必要表头列：用户账号');

    // 失败后弹窗保持可重试，再次上传合法文件可正常关闭并触发 imported
    await expect(httpRequestProp({ file: badFile })).resolves.toBeDefined();
    await flushPromises();
    expect(dialogVisible.value).toBe(false);
    expect(importedSpy).toHaveBeenCalledTimes(1);
    expect(msgSuccessSpy).toHaveBeenCalledWith('已成功批量导入 1 条用户数据');
  });
});
