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
import * as configApi from '@/api/system/config';
import type { ConfigVO } from '@/api/system/config';
import * as dictApi from '@/api/system/dict';
import type { DictDataVO, DictTypeVO } from '@/api/system/dict';
import { setupDictManager } from '@/utils/dict';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import ConfigView from '@/views/system/config/index.vue';
import DictView from '@/views/system/dict/index.vue';

/**
 * 动态字典双面板（/system/dict）与系统参数（/system/config）Layer 3 契约测试。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function createDictConfigRouter(): Router {
  const EmptyView = defineComponent({ name: 'StubView', template: '<div>stub</div>' });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: EmptyView },
      { path: '/dashboard', name: 'Dashboard', component: EmptyView },
      { path: '/system/dict', name: 'SysDict', component: DictView },
      { path: '/system/config', name: 'SysConfig', component: ConfigView },
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

function createDictMap(): Record<string, DictItem[]> {
  return {
    commonStatus: [
      { label: '正常', value: 0, tagType: 'success' },
      { label: '停用', value: 1, tagType: 'danger' },
    ],
    configType: [
      { label: '系统内置', value: 'Y', tagType: 'warning' },
      { label: '业务自建', value: 'N', tagType: 'info' },
    ],
  };
}

describe('DictView (/system/dict) and ConfigView (/system/config)', () => {
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

  it('auto-selects first dict type, switches right data, locks dictType on edit, previews tags, and clears DictManager cache', async () => {
    const router = createDictConfigRouter();
    await router.push('/system/dict');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const typeRows: DictTypeVO[] = [
      {
        id: 'DT1',
        dictName: '用户性别',
        dictType: 'sys_user_gender',
        status: 0,
        remark: '性别标准编码',
        createTime: '2026-11-20 09:00:00',
      },
      {
        id: 'DT2',
        dictName: '是否标识',
        dictType: 'sys_yes_no',
        status: 0,
        remark: null,
        createTime: '2026-11-20 09:05:00',
      },
      {
        id: 'DT3',
        dictName: '空明细字典',
        dictType: 'sys_empty_sample',
        status: 0,
        remark: null,
        createTime: '2026-11-20 09:08:00',
      },
    ];
    const genderData: DictDataVO[] = [
      {
        id: 'DD1',
        dictType: 'sys_user_gender',
        dictLabel: '男',
        dictValue: '0',
        tagType: 'primary',
        cssClass: '',
        sort: 1,
        isDefault: 0,
        status: 0,
        remark: null,
      },
    ];
    const yesNoData: DictDataVO[] = [
      {
        id: 'DD2',
        dictType: 'sys_yes_no',
        dictLabel: '是',
        dictValue: 'Y',
        tagType: 'success',
        cssClass: '',
        sort: 1,
        isDefault: 1,
        status: 0,
        remark: null,
      },
    ];

    const typePageSpy = vi.spyOn(dictApi, 'getDictTypePage').mockResolvedValue({
      records: typeRows,
      total: 3,
      size: 10,
      current: 1,
      pages: 1,
    });
    const dataPageSpy = vi.spyOn(dictApi, 'getDictDataPage').mockImplementation(async params => {
      const records =
        params?.dictType === 'sys_yes_no'
          ? yesNoData
          : params?.dictType === 'sys_empty_sample'
            ? []
            : genderData;
      return {
        records,
        total: records.length,
        size: 10,
        current: 1,
        pages: 1,
      };
    });
    const typeDetailSpy = vi.spyOn(dictApi, 'getDictTypeDetail').mockResolvedValue(typeRows[0]!);
    const dataDetailSpy = vi.spyOn(dictApi, 'getDictDataDetail').mockResolvedValue(genderData[0]!);
    const createDataSpy = vi.spyOn(dictApi, 'createDictData').mockResolvedValue('DD3');
    const updateDataSpy = vi.spyOn(dictApi, 'updateDictData').mockResolvedValue();
    const deleteTypeSpy = vi
      .spyOn(dictApi, 'deleteDictTypes')
      .mockRejectedValueOnce(
        new BusinessException(102005, '字典类型【用户性别】下尚有 1 条字典数据，请先清空后再删除'),
      );
    const clearCacheSpy = vi.spyOn(DictManager, 'clearCache');
    const errorToastSpy = vi
      .spyOn(ElMessage, 'error')
      .mockImplementation(() => ({ close: () => undefined }));
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);

    const wrapper = trackWrapper(
      mount(DictView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    // 1. 初始化自动选中首条字典类型 sys_user_gender 并联动拉取右侧明细
    expect(typePageSpy).toHaveBeenCalledTimes(1);
    expect(dataPageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dictType: 'sys_user_gender' }),
    );
    expect(wrapper.find('[data-testid="dict-active-type-badge"]').text()).toContain(
      'sys_user_gender',
    );
    expect(wrapper.text()).toContain('男');

    // 2. 点击左侧第二条字典类型 sys_yes_no，右侧立即切换拉取对应明细
    await wrapper.find('[data-testid="dict-type-select-DT2"]').trigger('click');
    await flushPromises();
    expect(dataPageSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ dictType: 'sys_yes_no' }),
    );
    expect(wrapper.text()).toContain('是');

    // 3. 点击刷新字典缓存精准清理当前选中 dictType
    clearCacheSpy.mockClear();
    await wrapper.find('[data-testid="dict-refresh-cache-btn"]').trigger('click');
    await flushPromises();
    expect(clearCacheSpy).toHaveBeenCalledWith('sys_yes_no');

    // 4. 编辑左侧字典类型时 dictType 输入框禁用只读
    await wrapper.find('[data-testid="dict-type-edit-btn-DT1"]').trigger('click');
    await flushPromises();
    expect(typeDetailSpy).toHaveBeenCalledWith('DT1');
    const typeCodeInput = document.body.querySelector(
      'input[data-testid="dict-type-form-code"], [data-testid="dict-type-form-code"] input',
    ) as HTMLInputElement | null;
    expect(typeCodeInput?.value).toBe('sys_user_gender');
    expect(typeCodeInput?.disabled).toBe(true);

    const typeCancelBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('取消'),
    ) as HTMLButtonElement | undefined;
    typeCancelBtn?.click();
    await flushPromises();

    // 5. 新增字典数据验证 tagType 实时预览区与保存后 DictManager.clearCache(dictType)
    clearCacheSpy.mockClear();
    await wrapper.find('[data-testid="dict-data-add-btn"]').trigger('click');
    await flushPromises();

    const labelInput = document.body.querySelector(
      'input[data-testid="dict-data-form-label"], [data-testid="dict-data-form-label"] input',
    ) as HTMLInputElement | null;
    const valueInput = document.body.querySelector(
      'input[data-testid="dict-data-form-value"], [data-testid="dict-data-form-value"] input',
    ) as HTMLInputElement | null;
    if (labelInput) {
      labelInput.value = '待确认';
      labelInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (valueInput) {
      valueInput.value = 'PENDING,ALT';
      valueInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();

    // 键值含逗号或实时变化时不得触发预览标签重新挂载、分裂或从左侧闪动
    const previewEl = document.body.querySelector('[data-testid="dict-data-preview"]');
    expect(previewEl?.textContent).toContain('待确认');
    expect(previewEl?.querySelectorAll('.at-dict-tag__item')).toHaveLength(1);

    if (valueInput) {
      valueInput.value = 'PENDING';
      valueInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();

    expect(previewEl?.textContent).toContain('待确认');

    const saveDataBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('保存字典数据'),
    ) as HTMLButtonElement | undefined;
    saveDataBtn?.click();
    await flushPromises();

    expect(createDataSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dictType: 'sys_yes_no',
        dictLabel: '待确认',
        dictValue: 'PENDING',
      }),
    );
    expect(clearCacheSpy).toHaveBeenCalledWith('sys_yes_no');

    // 6. 切回 DT1 后编辑字典数据成功后清理 sys_user_gender 缓存
    await wrapper.find('[data-testid="dict-type-select-DT1"]').trigger('click');
    await flushPromises();
    clearCacheSpy.mockClear();
    await wrapper.find('[data-testid="dict-data-edit-btn-DD1"]').trigger('click');
    await flushPromises();
    expect(dataDetailSpy).toHaveBeenCalledWith('DD1');

    const updateDataBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('保存字典数据'),
    ) as HTMLButtonElement | undefined;
    updateDataBtn?.click();
    await flushPromises();
    expect(updateDataSpy).toHaveBeenCalled();
    expect(clearCacheSpy).toHaveBeenCalledWith('sys_user_gender');

    // 7. 含明细时删除字典类型触发 102005 阻断提示
    await wrapper.find('[data-testid="dict-type-delete-btn-DT1"]').trigger('click');
    await flushPromises();
    expect(deleteTypeSpy).toHaveBeenCalledWith('DT1');
    expect(errorToastSpy).toHaveBeenCalledWith(
      '字典类型【用户性别】下尚有 1 条字典数据，请先清空后再删除',
    );

    // 8. 切换到无明细字典类型时不得因 query.dictType 误显示“搜索无结果”空态
    await wrapper.find('[data-testid="dict-type-select-DT3"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('当前字典类型暂无明细，可点击“新增字典数据”添加');
    expect(wrapper.text()).not.toContain('未检索到匹配的字典项');

    // 9. 视口宽度小于 1120px 时 AtengSplitLayout 自动切换为上下堆叠 vertical 方向
    const prevWidth = window.innerWidth;
    const splitCmp = wrapper.findComponent({ name: 'AtengSplitLayout' });
    expect(splitCmp.exists()).toBe(true);
    Object.defineProperty(window, 'innerWidth', { value: 960, configurable: true });
    window.dispatchEvent(new Event('resize'));
    await flushPromises();
    expect(splitCmp.props('direction')).toBe('vertical');
    Object.defineProperty(window, 'innerWidth', { value: prevWidth, configurable: true });
    window.dispatchEvent(new Event('resize'));
  });

  it('disables deleting builtin Y config, locks configKey on edit, blocks weak sys.user.initPassword, and allows deleting business N config', async () => {
    const router = createDictConfigRouter();
    await router.push('/system/config');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const configRows: ConfigVO[] = [
      {
        id: 'CFG1',
        configName: '用户管理-初始默认密码',
        configKey: 'sys.user.initPassword',
        configValue: 'Ateng@2026',
        configType: 'Y',
        remark: '全平台初始默认口令',
        createTime: '2026-11-20 08:00:00',
      },
      {
        id: 'CFG2',
        configName: '工作台公告标题',
        configKey: 'portal.welcome.title',
        configValue: '欢迎使用 ateng-solid',
        configType: 'N',
        remark: null,
        createTime: '2026-11-20 08:05:00',
      },
    ];

    const pageSpy = vi.spyOn(configApi, 'getConfigPage').mockResolvedValue({
      records: configRows,
      total: 2,
      size: 10,
      current: 1,
      pages: 1,
    });
    const detailSpy = vi.spyOn(configApi, 'getConfigDetail').mockResolvedValue(configRows[0]!);
    const updateSpy = vi.spyOn(configApi, 'updateConfig').mockResolvedValue();
    const createSpy = vi.spyOn(configApi, 'createConfig').mockResolvedValue('CFG3');
    const deleteSpy = vi.spyOn(configApi, 'deleteConfigs').mockResolvedValue();
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: () => undefined }));
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never);

    const wrapper = trackWrapper(
      mount(ConfigView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(pageSpy).toHaveBeenCalledWith(expect.objectContaining({ current: 1, size: 10 }));
    expect(wrapper.text()).toContain('sys.user.initPassword');
    expect(wrapper.text()).toContain('系统内置');

    // 1. configType === 'Y' 内置参数多选框与删除按钮均置灰禁用，业务自建 'N' 参数可选可删
    const rowCheckboxes = wrapper.findAll('.el-table__body input[type="checkbox"]');
    expect((rowCheckboxes[0]?.element as HTMLInputElement | undefined)?.disabled).toBe(true);
    expect((rowCheckboxes[1]?.element as HTMLInputElement | undefined)?.disabled).toBe(false);
    const builtinDeleteBtn = wrapper.find('[data-testid="config-delete-btn-CFG1"]');
    const businessDeleteBtn = wrapper.find('[data-testid="config-delete-btn-CFG2"]');
    expect(builtinDeleteBtn.attributes('disabled')).toBeDefined();
    expect(businessDeleteBtn.attributes('disabled')).toBeUndefined();

    // 2. 编辑 sys.user.initPassword：键名锁定只读，弱口令与首尾带空白的口令均被前端拦截
    await wrapper.find('[data-testid="config-edit-btn-CFG1"]').trigger('click');
    await flushPromises();
    expect(detailSpy).toHaveBeenCalledWith('CFG1');

    const keyInput = document.body.querySelector(
      'input[data-testid="config-form-key"], [data-testid="config-form-key"] input',
    ) as HTMLInputElement | null;
    expect(keyInput?.value).toBe('sys.user.initPassword');
    expect(keyInput?.disabled).toBe(true);

    const valueTextarea = document.body.querySelector(
      'textarea[data-testid="config-form-value"], [data-testid="config-form-value"] textarea',
    ) as HTMLTextAreaElement | null;
    expect(valueTextarea).not.toBeNull();
    if (valueTextarea) {
      valueTextarea.value = 'weak123';
      valueTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();

    const saveBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('保存参数'),
    ) as HTMLButtonElement | undefined;
    saveBtn?.click();
    await flushPromises();
    expect(updateSpy).not.toHaveBeenCalled();

    if (valueTextarea) {
      valueTextarea.value = ' Ateng@2026 ';
      valueTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();
    saveBtn?.click();
    await flushPromises();
    expect(updateSpy).not.toHaveBeenCalled();

    // 输入合规 3 类强口令后放行保存并刷新列表
    if (valueTextarea) {
      valueTextarea.value = 'Solid#2027Pass';
      valueTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();
    saveBtn?.click();
    await flushPromises();

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'CFG1',
        configKey: 'sys.user.initPassword',
        configValue: 'Solid#2027Pass',
        configType: 'Y',
      }),
    );
    expect(pageSpy).toHaveBeenCalledTimes(2);

    // 3. 删除业务自建参数 CFG2
    await businessDeleteBtn.trigger('click');
    await flushPromises();
    expect(deleteSpy).toHaveBeenCalledWith('CFG2');

    // 4. 新增业务自建参数（configType 固定为 'N'）
    await wrapper.find('[data-testid="config-add-btn"]').trigger('click');
    await flushPromises();

    const newNameInput = document.body.querySelector(
      'input[data-testid="config-form-name"], [data-testid="config-form-name"] input',
    ) as HTMLInputElement | null;
    const newKeyInput = document.body.querySelector(
      'input[data-testid="config-form-key"], [data-testid="config-form-key"] input',
    ) as HTMLInputElement | null;
    const newValueArea = document.body.querySelector(
      'textarea[data-testid="config-form-value"], [data-testid="config-form-value"] textarea',
    ) as HTMLTextAreaElement | null;
    if (newNameInput) {
      newNameInput.value = '会话闲置超时';
      newNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (newKeyInput) {
      newKeyInput.value = 'session.idle.minutes';
      newKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (newValueArea) {
      newValueArea.value = '30';
      newValueArea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await flushPromises();

    const createSaveBtn = Array.from(document.body.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('保存参数'),
    ) as HTMLButtonElement | undefined;
    createSaveBtn?.click();
    await flushPromises();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        configName: '会话闲置超时',
        configKey: 'session.idle.minutes',
        configValue: '30',
        configType: 'N',
      }),
    );
  });

  it('aligns dual-card surface and adaptive pagination across DictView and ConfigView (0=hidden, 1 page=no jumper, >=2 pages=full) (#379 / ADR-0004)', async () => {
    const router = createDictConfigRouter();
    await router.push('/system/dict');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    // 1. DictView 左右两表不再硬写局部 pagination-layout，统一走 AtengTable 默认自适应双卡契约
    vi.spyOn(dictApi, 'getDictTypePage').mockResolvedValue({
      records: [
        {
          id: 'DT1',
          dictName: '用户性别',
          dictType: 'sys_user_gender',
          status: 0,
          createTime: '2026-11-25 10:00:00',
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });
    vi.spyOn(dictApi, 'getDictDataPage').mockResolvedValue({
      records: [
        {
          id: 'DD1',
          dictType: 'sys_user_gender',
          dictLabel: '男',
          dictValue: '0',
          tagType: 'primary',
          sort: 1,
          isDefault: 1,
          status: 0,
          createTime: '2026-11-25 10:00:00',
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });

    const dictWrapper = trackWrapper(
      mount(DictView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();

    const dictTables = dictWrapper.findAllComponents({ name: 'AtengTable' });
    expect(dictTables).toHaveLength(2);
    for (const tbl of dictTables) {
      expect(tbl.props('surface')).toBe('card');
      expect(tbl.props('paginationAlign')).toBe('between');
      expect(tbl.props('paginationLayout')).toBe('total, sizes, prev, pager, next, jumper');
      expect(tbl.find('.at-table--surface-card > .at-table__surface').exists()).toBe(true);
      expect(tbl.find('.at-table__pagination--between').exists()).toBe(true);
      expect(tbl.find('.el-pagination__jump').exists()).toBe(false);
    }

    // 2. ConfigView 验证 0 条自动隐藏、单页收敛 jumper、多页完整展示跳转控件
    await router.push('/system/config');
    await router.isReady();
    const configPageSpy = vi
      .spyOn(configApi, 'getConfigPage')
      .mockResolvedValueOnce({
        records: [],
        total: 0,
        size: 10,
        current: 1,
        pages: 0,
      })
      .mockResolvedValueOnce({
        records: Array.from({ length: 10 }, (_, idx) => ({
          id: `CFG_${idx}`,
          configName: `参数${idx}`,
          configKey: `cfg.${idx}`,
          configValue: '1',
          configType: 'N',
          createTime: '2026-11-25 10:00:00',
        })),
        total: 25,
        size: 10,
        current: 1,
        pages: 3,
      });

    const cfgWrapper = trackWrapper(
      mount(ConfigView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();
    expect(cfgWrapper.find('.at-table__pagination').exists()).toBe(false);

    const refreshBtn = cfgWrapper.find('.at-table__tool-btn[aria-label="刷新"]');
    await refreshBtn.trigger('click');
    await flushPromises();
    expect(configPageSpy).toHaveBeenCalledTimes(2);
    expect(cfgWrapper.find('.at-table__pagination--between').exists()).toBe(true);
    expect(cfgWrapper.find('.el-pagination__jump').exists()).toBe(true);
  });

  it('preloads configType via single-flight loadDict shared with AtengDictSelect so ConfigView never flashes raw code (#57)', async () => {
    const router = createDictConfigRouter();
    await router.push('/system/config');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const dictMap = createDictMap();
    const providerCalls: string[] = [];
    let releaseConfigType!: () => void;
    const configTypeGate = new Promise<void>(resolve => {
      releaseConfigType = resolve;
    });

    DictManager.setProvider(async code => {
      providerCalls.push(code);
      if (code === 'configType') {
        await configTypeGate;
      }
      return dictMap[code] ?? [];
    });
    DictManager.setBatchProvider(async codes => {
      if (codes.includes('configType')) {
        await configTypeGate;
      }
      return Object.fromEntries(codes.map(code => [code, dictMap[code] ?? []]));
    });

    vi.spyOn(configApi, 'getConfigPage').mockResolvedValue({
      records: [
        {
          id: 'CFG_BUILTIN',
          configName: '初始口令策略',
          configKey: 'sys.user.initPassword',
          configValue: 'Ateng@1234',
          configType: 'Y',
          createTime: '2026-11-26 10:00:00',
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });

    const wrapper = trackWrapper(
      mount(ConfigView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    // 枚举尚未就绪前列表行不得挂载，杜绝首帧闪烁 'Y'
    expect(wrapper.find('.at-dict-tag__item').exists()).toBe(false);

    releaseConfigType();
    await flushPromises();

    const typeTag = wrapper.find('.at-dict-tag__item');
    expect(typeTag.exists()).toBe(true);
    expect(typeTag.text()).toBe('系统内置');
    expect(providerCalls.filter(code => code === 'configType')).toHaveLength(1);
  });

  it('holds edit-mode ConfigFormDialog behind skeleton until detail and configType finish loading so tag never jumps from N to Y (#381)', async () => {
    const router = createDictConfigRouter();
    await router.push('/system/config');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    DictManager.clearCache('configType');

    let releaseDetail!: (val: ConfigVO) => void;
    vi.spyOn(configApi, 'getConfigPage').mockResolvedValue({
      records: [
        {
          id: 'CFG1',
          configName: '用户管理-初始默认密码',
          configKey: 'sys.user.initPassword',
          configValue: 'Ateng@2026',
          configType: 'Y',
          createTime: '2026-11-26 10:00:00',
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });
    vi.spyOn(configApi, 'getConfigDetail').mockImplementation(
      () =>
        new Promise<ConfigVO>(resolve => {
          releaseDetail = resolve;
        }),
    );

    const wrapper = trackWrapper(
      mount(ConfigView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    await wrapper.find('[data-testid="config-edit-btn-CFG1"]').trigger('click');
    await flushPromises();

    // 详情未就绪前不渲染默认 configType='N' 标签，且禁用保存确认按钮
    const dialogRoot = document.body.querySelector('.el-dialog');
    expect(dialogRoot).not.toBeNull();
    expect(dialogRoot?.textContent).not.toContain('业务自建');
    expect(dialogRoot?.querySelector('[data-testid="config-form-key"]')).toBeNull();

    releaseDetail({
      id: 'CFG1',
      configName: '用户管理-初始默认密码',
      configKey: 'sys.user.initPassword',
      configValue: 'Ateng@2026',
      configType: 'Y',
      remark: '全平台初始默认口令',
      createTime: '2026-11-26 10:00:00',
    });
    await flushPromises();

    expect(dialogRoot?.textContent).toContain('系统内置');
    expect(dialogRoot?.textContent).not.toContain('业务自建');
    expect(dialogRoot?.querySelector('[data-testid="config-password-policy"]')).not.toBeNull();
  });
});
