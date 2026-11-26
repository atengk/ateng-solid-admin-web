import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus';
import AtengElementPlus, { DictManager, type DictItem } from '@atengk/element-plus';
import { BusinessException } from '@atengk/core';
import { createAtengVue } from '@atengk/vue';
import * as authApi from '@/api/auth';
import type { AdminProfileVO } from '@/api/auth';
import * as deptApi from '@/api/system/dept';
import type { DeptTreeVO, DeptVO } from '@/api/system/dept';
import * as menuApi from '@/api/system/menu';
import type { MenuTreeVO, MenuVO } from '@/api/system/menu';
import * as postApi from '@/api/system/post';
import type { PostVO } from '@/api/system/post';
import * as userApi from '@/api/system/user';
import { setupDictManager } from '@/utils/dict';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import { buildDeptSelectorOptions } from '@/views/system/dept/deptHelper';
import DeptView from '@/views/system/dept/index.vue';
import {
  buildMenuParentOptions,
  getAllowedMenuTypesForEdit,
  sanitizeMenuSavePayload,
} from '@/views/system/menu/menuHelper';
import MenuView from '@/views/system/menu/index.vue';
import PostView from '@/views/system/post/index.vue';

/**
 * 组织架构（/system/dept、/system/post）与平台菜单（/system/menu）Layer 1 & Layer 3 契约测试。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function createOrgRouter(): Router {
  const EmptyView = defineComponent({ name: 'StubView', template: '<div>stub</div>' });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: EmptyView },
      { path: '/dashboard', name: 'Dashboard', component: EmptyView },
      { path: '/system/dept', name: 'SysDept', component: DeptView },
      { path: '/system/post', name: 'SysPost', component: PostView },
      { path: '/system/menu', name: 'SysMenu', component: MenuView },
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

function createSampleDeptTree(): DeptTreeVO[] {
  return [
    {
      id: 'A',
      parentId: '0',
      ancestors: '0',
      deptName: '平台总部',
      sort: 1,
      leaderUserId: '1001',
      leaderNickname: '陈默',
      leaderUsername: 'chenmo',
      phone: '13812345678',
      email: 'hq@ateng.dev',
      status: 0,
      createTime: '2026-11-20 09:00:00',
      children: [
        {
          id: 'B',
          parentId: 'A',
          ancestors: '0,A',
          deptName: '研发中心',
          sort: 1,
          leaderUserId: '1002',
          leaderNickname: '林芸',
          leaderUsername: 'linyun',
          phone: '13987654321',
          email: 'rd@ateng.dev',
          status: 0,
          createTime: '2026-11-20 09:10:00',
          children: [
            {
              id: 'C',
              parentId: 'B',
              ancestors: '0,A,B',
              deptName: '后端架构组',
              sort: 1,
              leaderUserId: null,
              leaderNickname: null,
              leaderUsername: null,
              phone: null,
              email: null,
              status: 0,
              createTime: '2026-11-20 09:20:00',
              children: [
                {
                  id: 'D',
                  parentId: 'C',
                  ancestors: '0,A,B,C',
                  deptName: '中间件小组',
                  sort: 1,
                  leaderUserId: null,
                  leaderNickname: null,
                  leaderUsername: null,
                  phone: null,
                  email: null,
                  status: 0,
                  createTime: '2026-11-20 09:30:00',
                  children: [],
                },
              ],
            },
          ],
        },
        {
          id: 'E',
          parentId: 'A',
          ancestors: '0,A',
          deptName: '财务合规部',
          sort: 2,
          leaderUserId: null,
          leaderNickname: null,
          leaderUsername: null,
          phone: null,
          email: null,
          status: 0,
          createTime: '2026-11-20 09:40:00',
          children: [],
        },
        {
          id: 'F',
          parentId: 'A',
          ancestors: '0,A',
          deptName: '历史归档部门',
          sort: 3,
          leaderUserId: null,
          leaderNickname: null,
          leaderUsername: null,
          phone: null,
          email: null,
          status: 1,
          createTime: '2026-11-20 09:50:00',
          children: [],
        },
      ],
    },
  ];
}

function createDictMap(): Record<string, DictItem[]> {
  return {
    commonStatus: [
      { label: '正常', value: 0, tagType: 'success' },
      { label: '停用', value: 1, tagType: 'danger' },
    ],
    menuType: [
      { label: '目录', value: 'M' },
      { label: '菜单', value: 'C' },
      { label: '按钮', value: 'F' },
    ],
    visibleStatus: [
      { label: '显示', value: 0 },
      { label: '隐藏', value: 1 },
    ],
  };
}

describe('Dept / Post / Menu views and helpers', () => {
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
    const dictMap = createDictMap();
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

  it('disables editing dept B and all its descendants while keeping ancestors and siblings selectable', () => {
    const options = buildDeptSelectorOptions(createSampleDeptTree(), 'B');

    const rootOption = options.find(item => item.id === '0');
    const deptA = options.find(item => item.id === 'A');
    const deptB = deptA?.children.find(item => item.id === 'B');
    const deptC = deptB?.children.find(item => item.id === 'C');
    const deptD = deptC?.children.find(item => item.id === 'D');
    const deptE = deptA?.children.find(item => item.id === 'E');
    const deptF = deptA?.children.find(item => item.id === 'F');

    expect(rootOption?.disabled).toBe(false);
    expect(deptA?.disabled).toBe(false);
    expect(deptB?.disabled).toBe(true);
    expect(deptC?.disabled).toBe(true);
    expect(deptD?.disabled).toBe(true);
    expect(deptE?.disabled).toBe(false);
    expect(deptF?.disabled).toBe(true);
  });

  it('renders masked phone in DeptView, pre-fills parentId on add-child, loads plaintext in edit dialog, and handles 102005 errors cleanly', async () => {
    const router = createOrgRouter();
    await router.push('/system/dept');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const treeSpy = vi.spyOn(deptApi, 'getDeptTree').mockResolvedValue(createSampleDeptTree());
    const userOptSpy = vi.spyOn(userApi, 'getUserOptions').mockResolvedValue([
      { userId: '1001', username: 'chenmo', nickname: '陈默' },
      { userId: '1002', username: 'linyun', nickname: '林芸' },
    ]);
    const detailVO: DeptVO = {
      id: 'B',
      parentId: 'A',
      ancestors: '0,A',
      deptName: '研发中心',
      sort: 1,
      leaderUserId: '1002',
      leaderNickname: '林芸',
      leaderUsername: 'linyun',
      phone: '13987654321',
      email: 'rd@ateng.dev',
      status: 0,
      createTime: '2026-11-20 09:10:00',
    };
    const detailSpy = vi.spyOn(deptApi, 'getDeptDetail').mockResolvedValue(detailVO);
    const updateSpy = vi
      .spyOn(deptApi, 'updateDept')
      .mockRejectedValueOnce(
        new BusinessException(102002, '同级部门下已存在相同部门名称', 'trace-dept-dup'),
      )
      .mockResolvedValueOnce();
    const errorToastSpy = vi
      .spyOn(ElMessage, 'error')
      .mockImplementation(() => ({ close: () => undefined }));

    const wrapper = trackWrapper(
      mount(DeptView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(treeSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('平台总部');
    expect(wrapper.text()).toContain('陈默 (chenmo)');
    expect(wrapper.text()).toContain('138****5678');
    expect(wrapper.text()).not.toContain('13812345678');

    // 点击研发中心行内 [编辑]，核对真明文回填与报错保留现场
    await wrapper.find('[data-testid="dept-edit-btn-B"]').trigger('click');
    await flushPromises();

    expect(detailSpy).toHaveBeenCalledWith('B');
    expect(userOptSpy).toHaveBeenCalled();

    const phoneInput = document.body.querySelector(
      'input[data-testid="dept-form-phone"], [data-testid="dept-form-phone"] input',
    ) as HTMLInputElement | null;
    expect(phoneInput?.value).toBe('13987654321');

    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('保存部门'),
    ) as HTMLButtonElement | undefined;
    expect(confirmBtn).toBeDefined();
    expect(confirmBtn?.disabled).toBe(false);

    // 首次保存遇到 102002 时必须提示错误并保持弹窗打开
    confirmBtn?.click();
    await flushPromises();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(errorToastSpy).toHaveBeenCalledWith('同级部门下已存在相同部门名称');
    expect(document.body.querySelector('[data-testid="dept-form-phone"]')).not.toBeNull();

    // 二次提交成功关闭弹窗并刷新部门树
    confirmBtn?.click();
    await flushPromises();
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(treeSpy).toHaveBeenCalledTimes(3);

    // 已停用部门 F 的 [新增下级] 按钮应禁用，启用部门 A 点击 [新增下级] 预填 parentId = A
    const disabledAddChild = wrapper.find('[data-testid="dept-add-child-btn-F"]');
    expect(disabledAddChild.attributes('disabled')).toBeDefined();

    const createSpy = vi.spyOn(deptApi, 'createDept').mockResolvedValue('G');
    await wrapper.find('[data-testid="dept-add-child-btn-A"]').trigger('click');
    await flushPromises();

    const nameInput = document.body.querySelector(
      'input[data-testid="dept-form-name"], [data-testid="dept-form-name"] input',
    ) as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();
    if (nameInput) {
      nameInput.value = '质量保障部';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();

    const createConfirmBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('保存部门'),
    ) as HTMLButtonElement | undefined;
    createConfirmBtn?.click();
    await flushPromises();
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 'A',
        deptName: '质量保障部',
      }),
    );

    // 删除部门前弹出确认且在 102005 时提示具体错误
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);
    const deleteSpy = vi
      .spyOn(deptApi, 'deleteDept')
      .mockRejectedValueOnce(new BusinessException(102005, '存在下级部门，禁止删除'));
    await wrapper.find('[data-testid="dept-delete-btn-B"]').trigger('click');
    await flushPromises();
    expect(deleteSpy).toHaveBeenCalledWith('B');
    expect(errorToastSpy).toHaveBeenCalledWith('存在下级部门，禁止删除');
    expect(treeSpy).toHaveBeenCalledTimes(5);
  });

  it('loads paginated posts, edits with 102002 guard, creates post, toggles status, and batch-deletes via deletePosts', async () => {
    const router = createOrgRouter();
    await router.push('/system/post');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const samplePosts: PostVO[] = [
      {
        id: 'P1',
        postCode: 'CTO',
        postName: '首席技术官',
        sort: 1,
        status: 0,
        remark: '技术委员会负责人',
        createTime: '2026-11-20 10:00:00',
      },
      {
        id: 'P2',
        postCode: 'PM',
        postName: '产品经理',
        sort: 2,
        status: 1,
        remark: null,
        createTime: '2026-11-20 10:05:00',
      },
    ];

    const pageSpy = vi.spyOn(postApi, 'getPostPage').mockResolvedValue({
      records: samplePosts,
      total: 2,
      size: 10,
      current: 1,
      pages: 1,
    });
    const detailSpy = vi.spyOn(postApi, 'getPostDetail').mockResolvedValue(samplePosts[0]!);
    const updateSpy = vi
      .spyOn(postApi, 'updatePost')
      .mockRejectedValueOnce(new BusinessException(102002, '岗位编码已存在', 'trace-post-dup'))
      .mockResolvedValueOnce();
    const createSpy = vi.spyOn(postApi, 'createPost').mockResolvedValue('P3');
    const statusSpy = vi.spyOn(postApi, 'updatePostStatus').mockResolvedValue();
    const deleteSpy = vi
      .spyOn(postApi, 'deletePosts')
      .mockRejectedValueOnce(new BusinessException(102005, '岗位已被用户关联，禁止删除'))
      .mockResolvedValueOnce();
    const errorToastSpy = vi
      .spyOn(ElMessage, 'error')
      .mockImplementation(() => ({ close: () => undefined }));
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);

    const wrapper = trackWrapper(
      mount(PostView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(pageSpy).toHaveBeenCalledWith(expect.objectContaining({ current: 1, size: 10 }));
    expect(wrapper.text()).toContain('CTO');
    expect(wrapper.text()).toContain('首席技术官');

    // 未勾选行时工具栏 [批量删除] 禁用
    const batchDeleteBtn = wrapper.find('[data-testid="post-batch-delete-btn"]');
    expect(batchDeleteBtn.attributes('disabled')).toBeDefined();

    // 点击编辑加载详情，遭遇 102002 报错保留弹窗，再次提交成功并刷新列表
    await wrapper.find('[data-testid="post-edit-btn-P1"]').trigger('click');
    await flushPromises();
    expect(detailSpy).toHaveBeenCalledWith('P1');

    const codeInput = document.body.querySelector(
      'input[data-testid="post-form-code"], [data-testid="post-form-code"] input',
    ) as HTMLInputElement | null;
    expect(codeInput?.value).toBe('CTO');

    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('保存岗位'),
    ) as HTMLButtonElement | undefined;
    expect(confirmBtn).toBeDefined();

    confirmBtn?.click();
    await flushPromises();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(errorToastSpy).toHaveBeenCalledWith('岗位编码已存在');
    expect(document.body.querySelector('[data-testid="post-form-error"]')?.textContent).toContain(
      '岗位编码已存在',
    );

    confirmBtn?.click();
    await flushPromises();
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(pageSpy).toHaveBeenCalledTimes(2);

    // 点击新增岗位并提交
    await wrapper.find('[data-testid="post-add-btn"]').trigger('click');
    await flushPromises();

    const newCodeInput = document.body.querySelector(
      'input[data-testid="post-form-code"], [data-testid="post-form-code"] input',
    ) as HTMLInputElement | null;
    const newNameInput = document.body.querySelector(
      'input[data-testid="post-form-name"], [data-testid="post-form-name"] input',
    ) as HTMLInputElement | null;
    if (newCodeInput) {
      newCodeInput.value = 'QA_LEAD';
      newCodeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (newNameInput) {
      newNameInput.value = '质量主管';
      newNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();

    const createConfirmBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('保存岗位'),
    ) as HTMLButtonElement | undefined;
    createConfirmBtn?.click();
    await flushPromises();
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        postCode: 'QA_LEAD',
        postName: '质量主管',
      }),
    );

    // 切换状态开关弹出确认并调用 updatePostStatus
    const switchWrapper = wrapper.find('[data-testid="post-status-switch-P1"]');
    await switchWrapper.trigger('click');
    await flushPromises();
    expect(statusSpy).toHaveBeenCalledWith('P1', 1);

    // 行内删除触发 102005 提示
    await wrapper.find('[data-testid="post-delete-btn-P1"]').trigger('click');
    await flushPromises();
    expect(deleteSpy).toHaveBeenCalledWith('P1');
    expect(errorToastSpy).toHaveBeenCalledWith('岗位已被用户关联，禁止删除');

    // 通过表格选行后触发工具栏批量删除
    const tableCmp = wrapper.findComponent({ name: 'AtengTable' });
    tableCmp.vm.$emit('update:selectedRows', samplePosts);
    await flushPromises();
    expect(batchDeleteBtn.attributes('disabled')).toBeUndefined();
    await batchDeleteBtn.trigger('click');
    await flushPromises();
    expect(deleteSpy).toHaveBeenLastCalledWith(['P1', 'P2']);
  });

  it('enforces menu parent selection rules, topology edit restrictions, and field sanitization per menuType', () => {
    const sampleMenuTree: MenuTreeVO[] = [
      {
        id: 'M1',
        parentId: '0',
        menuType: 'M',
        title: '系统管理',
        path: '/system',
        icon: 'Setting',
        sort: 1,
        visible: 0,
        status: 0,
        keepAlive: false,
        isExternal: false,
        platformOnly: false,
        createTime: '2026-11-20 09:00:00',
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
            sort: 3,
            visible: 0,
            status: 0,
            keepAlive: true,
            isExternal: false,
            platformOnly: true,
            createTime: '2026-11-20 09:01:00',
            children: [
              {
                id: 'F1',
                parentId: 'C1',
                menuType: 'F',
                title: '新增菜单',
                perms: 'system:menu:create',
                sort: 1,
                visible: 0,
                status: 0,
                keepAlive: false,
                isExternal: false,
                platformOnly: true,
                createTime: '2026-11-20 09:02:00',
                children: [],
              },
            ],
          },
        ],
      },
      {
        id: 'M2',
        parentId: '0',
        menuType: 'M',
        title: '运维监控',
        path: '/monitor',
        icon: 'Monitor',
        sort: 2,
        visible: 0,
        status: 0,
        keepAlive: false,
        isExternal: false,
        platformOnly: false,
        createTime: '2026-11-20 09:03:00',
        children: [],
      },
    ];

    // 1. 按钮 F 只能挂载在菜单 C 下，根目录不开放，目录 M 仅作层级展示但禁用
    const buttonParents = buildMenuParentOptions(sampleMenuTree, 'F');
    expect(buttonParents.some(item => item.id === '0')).toBe(false);
    const m1ForBtn = buttonParents.find(item => item.id === 'M1');
    expect(m1ForBtn?.disabled).toBe(true);
    expect(m1ForBtn?.children.find(item => item.id === 'C1')?.disabled).toBe(false);
    expect(m1ForBtn?.children[0]?.children.some(item => item.id === 'F1')).toBe(false);

    // 2. 编辑目录 M1 时自身禁用，同级目录 M2 与根目录 '0' 可选
    const dirParents = buildMenuParentOptions(sampleMenuTree, 'M', 'M1');
    expect(dirParents.find(item => item.id === '0')?.disabled).toBe(false);
    expect(dirParents.find(item => item.id === 'M1')?.disabled).toBe(true);
    expect(dirParents.find(item => item.id === 'M2')?.disabled).toBe(false);

    // 3. 节点类型拓扑约束：M1 含子菜单仅可为 M；C1 含子按钮仅可为 C；叶子 M2 可自由切换
    expect(getAllowedMenuTypesForEdit(sampleMenuTree[0]!)).toEqual(['M']);
    expect(getAllowedMenuTypesForEdit(sampleMenuTree[0]!.children[0]!)).toEqual(['C']);
    expect(getAllowedMenuTypesForEdit(sampleMenuTree[1]!)).toEqual(['M', 'C', 'F']);

    // 4. 提交前字段清洗：按钮节点剔除路由/图标字段；外链菜单剔除 name/component/keepAlive
    expect(
      sanitizeMenuSavePayload({
        mode: 'create',
        parentId: 'C1',
        menuType: 'F',
        title: ' 批量导入 ',
        name: 'ShouldBeCleared',
        path: '/ignored',
        component: 'ignored/index',
        redirect: '/redirect',
        perms: ' system:menu:import ',
        icon: 'Upload',
        sort: 5,
        visible: 1,
        status: 0,
        keepAlive: true,
        isExternal: true,
        platformOnly: true,
      }),
    ).toEqual({
      id: undefined,
      parentId: 'C1',
      menuType: 'F',
      title: '批量导入',
      name: null,
      path: null,
      component: null,
      redirect: null,
      perms: 'system:menu:import',
      icon: null,
      sort: 5,
      visible: 0,
      status: 0,
      keepAlive: false,
      isExternal: false,
      platformOnly: true,
    });

    expect(
      sanitizeMenuSavePayload({
        mode: 'edit',
        id: 'C_EXT',
        parentId: 'M1',
        menuType: 'C',
        title: '接口文档',
        name: 'SwaggerDoc',
        path: 'https://docs.ateng.dev',
        component: 'external/doc',
        redirect: '/ignored',
        perms: '',
        icon: 'Link',
        sort: 9,
        visible: 0,
        status: 0,
        keepAlive: true,
        isExternal: true,
        platformOnly: false,
      }),
    ).toEqual({
      id: 'C_EXT',
      parentId: 'M1',
      menuType: 'C',
      title: '接口文档',
      name: null,
      path: 'https://docs.ateng.dev',
      component: null,
      redirect: null,
      perms: null,
      icon: 'Link',
      sort: 9,
      visible: 0,
      status: 0,
      keepAlive: false,
      isExternal: true,
      platformOnly: false,
    });
  });

  it('renders MenuView badges, toggles M/C/F drawer fields, locks inherited platformOnly, and reports 102005 delete error', async () => {
    const router = createOrgRouter();
    await router.push('/system/menu');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const menuTreeData: MenuTreeVO[] = [
      {
        id: 'M1',
        parentId: '0',
        menuType: 'M',
        title: '租户运维',
        path: '/platform-tenant',
        icon: 'OfficeBuilding',
        sort: 1,
        visible: 0,
        status: 0,
        keepAlive: false,
        isExternal: false,
        platformOnly: true,
        createTime: '2026-11-20 09:00:00',
        children: [
          {
            id: 'C1',
            parentId: 'M1',
            menuType: 'C',
            title: '租户列表',
            name: 'SysTenant',
            path: '/system/tenant',
            component: 'system/tenant/index',
            perms: 'system:tenant:list',
            icon: 'Tickets',
            sort: 1,
            visible: 0,
            status: 0,
            keepAlive: true,
            isExternal: false,
            platformOnly: true,
            createTime: '2026-11-20 09:05:00',
            children: [],
          },
        ],
      },
    ];

    const detailVO: MenuVO = {
      id: 'C1',
      parentId: 'M1',
      menuType: 'C',
      title: '租户列表',
      name: 'SysTenant',
      path: '/system/tenant',
      component: 'system/tenant/index',
      redirect: null,
      perms: 'system:tenant:list',
      icon: 'Tickets',
      sort: 1,
      visible: 0,
      status: 0,
      keepAlive: true,
      isExternal: false,
      platformOnly: true,
      createTime: '2026-11-20 09:05:00',
    };

    const treeSpy = vi.spyOn(menuApi, 'getMenuTree').mockResolvedValue(menuTreeData);
    const detailSpy = vi.spyOn(menuApi, 'getMenuDetail').mockResolvedValue(detailVO);
    const createSpy = vi.spyOn(menuApi, 'createMenu').mockResolvedValue('F_NEW');
    const deleteSpy = vi
      .spyOn(menuApi, 'deleteMenu')
      .mockRejectedValueOnce(new BusinessException(102005, '存在子菜单或按钮权限，禁止删除'));
    const errorToastSpy = vi
      .spyOn(ElMessage, 'error')
      .mockImplementation(() => ({ close: () => undefined }));
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);

    const wrapper = trackWrapper(
      mount(MenuView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(treeSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('租户运维');
    expect(wrapper.text()).toContain('平台专属');
    expect(wrapper.text()).toContain('system:tenant:list');

    // 从菜单行 C1 点击 [新增]：预填 parentId = C1，默认类型为 F，仅显示按钮必填字段且强制继承 platformOnly=true
    await wrapper.find('[data-testid="menu-add-child-btn-C1"]').trigger('click');
    await flushPromises();

    expect(document.body.querySelector('[data-testid="menu-form-perms"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="menu-form-path"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="menu-form-component"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="menu-platform-locked-hint"]')).not.toBeNull();

    const permsInput = document.body.querySelector(
      'input[data-testid="menu-form-perms"], [data-testid="menu-form-perms"] input',
    ) as HTMLInputElement | null;
    const titleInput = document.body.querySelector(
      'input[data-testid="menu-form-title"], [data-testid="menu-form-title"] input',
    ) as HTMLInputElement | null;
    if (titleInput) {
      titleInput.value = '新增租户';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (permsInput) {
      permsInput.value = 'system:tenant:create';
      permsInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();

    const saveBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('保存菜单'),
    ) as HTMLButtonElement | undefined;
    saveBtn?.click();
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: 'C1',
        menuType: 'F',
        title: '新增租户',
        perms: 'system:tenant:create',
        platformOnly: true,
        path: null,
        component: null,
      }),
    );

    // 点击编辑 C1，确认抽屉回显并传入 EXTRA_ELEMENT_ICONS
    await wrapper.find('[data-testid="menu-edit-btn-C1"]').trigger('click');
    await flushPromises();
    expect(detailSpy).toHaveBeenCalledWith('C1');
    const drawerCmp = wrapper.findComponent({ name: 'MenuFormDrawer' });
    const iconSelectCmp = drawerCmp.findComponent({ name: 'AtengIconSelect' });
    expect(iconSelectCmp.exists()).toBe(true);
    expect((iconSelectCmp.props('customIcons') as unknown[]).length).toBeGreaterThan(150);

    // 切为外链菜单时应立即隐藏 name / component / keepAlive
    const extSwitch = document.body.querySelector(
      '[data-testid="menu-form-external"]',
    ) as HTMLElement | null;
    extSwitch?.click();
    await flushPromises();
    expect(document.body.querySelector('[data-testid="menu-form-component"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="menu-form-name"]')).toBeNull();

    // 删除菜单时遭遇 102005 应提示精准业务文案
    await wrapper.find('[data-testid="menu-delete-btn-M1"]').trigger('click');
    await flushPromises();
    expect(deleteSpy).toHaveBeenCalledWith('M1');
    expect(errorToastSpy).toHaveBeenCalledWith('存在子菜单或按钮权限，禁止删除');
  });

  it('preloads visibleStatus before rendering MenuView rows so first frame never flashes raw "0" (#57)', async () => {
    const router = createOrgRouter();
    await router.push('/system/menu');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const dictMap = createDictMap();
    let releaseVisibleStatus!: () => void;
    const visibleStatusGate = new Promise<void>(resolve => {
      releaseVisibleStatus = resolve;
    });

    DictManager.setProvider(async code => {
      if (code === 'visibleStatus') {
        await visibleStatusGate;
      }
      return dictMap[code] ?? [];
    });
    DictManager.setBatchProvider(async codes => {
      if (codes.includes('visibleStatus')) {
        await visibleStatusGate;
      }
      return Object.fromEntries(codes.map(code => [code, dictMap[code] ?? []]));
    });

    vi.spyOn(menuApi, 'getMenuTree').mockResolvedValue([
      {
        id: 'M1',
        parentId: '0',
        menuType: 'M',
        title: '系统治理',
        path: '/system',
        icon: 'Setting',
        sort: 1,
        visible: 0,
        status: 0,
        keepAlive: false,
        isExternal: false,
        platformOnly: false,
        createTime: '2026-11-26 09:00:00',
        children: [],
      },
    ]);

    const wrapper = trackWrapper(
      mount(MenuView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    // 枚举尚在冷加载期间不得先将原始码值 "0" 渲染进表格标签
    expect(wrapper.find('.at-dict-tag__item').exists()).toBe(false);

    releaseVisibleStatus();
    await flushPromises();

    const visibleTag = wrapper.find('.at-dict-tag__item');
    expect(visibleTag.exists()).toBe(true);
    expect(visibleTag.text()).toBe('显示');
  });
});
