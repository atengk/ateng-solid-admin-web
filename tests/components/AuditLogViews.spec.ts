import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus, { ElMessage } from 'element-plus';
import AtengElementPlus, { DictManager, type DictItem } from '@atengk/element-plus';
import { createAtengVue } from '@atengk/vue';
import * as authApi from '@/api/auth';
import type { AdminProfileVO } from '@/api/auth';
import * as logApi from '@/api/system/log';
import type { LoginLogVO, OperLogVO } from '@/api/system/log';
import { setupDictManager } from '@/utils/dict';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import {
  createTimeRangeBinding,
  formatAuditClientEnv,
  formatAuditOperator,
  formatAuditPayload,
  resetAuditDateRange,
} from '@/views/system/log/logHelper';
import LoginLogView from '@/views/system/login-log/index.vue';
import OperLogView from '@/views/system/oper-log/index.vue';

/**
 * 只读审计日志（/system/oper-log、/system/login-log）Layer 1 & Layer 3 契约测试。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function createAuditRouter(): Router {
  const EmptyView = defineComponent({ name: 'StubView', template: '<div>stub</div>' });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: EmptyView },
      { path: '/dashboard', name: 'Dashboard', component: EmptyView },
      { path: '/system/oper-log', name: 'SysOperLog', component: OperLogView },
      { path: '/system/login-log', name: 'SysLoginLog', component: LoginLogView },
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
    loginDate: '2026-11-25 14:30:00',
  };
}

function createDictMap(): Record<string, DictItem[]> {
  return {
    operateType: [
      { label: '新增', value: 1, tagType: 'primary' },
      { label: '修改', value: 2, tagType: 'warning' },
      { label: '删除', value: 3, tagType: 'danger' },
    ],
    logStatus: [
      { label: '成功', value: 0, tagType: 'success' },
      { label: '失败', value: 1, tagType: 'danger' },
    ],
  };
}

describe('Audit log views (/system/oper-log & /system/login-log)', () => {
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
    vi.unstubAllGlobals();
    setupDictManager();
    vi.restoreAllMocks();
  });

  it('pretty-prints JSON audit payloads, falls back cleanly on plain text, and formats client environment', () => {
    const pretty = formatAuditPayload('{"username":"alice","password":"[EXCLUDED]"}');
    expect(pretty.isJson).toBe(true);
    expect(pretty.formatted).toContain('\n  "username": "alice"');
    expect(pretty.formatted).toContain('"[EXCLUDED]"');

    expect(formatAuditPayload('plain-text-body')).toEqual({
      formatted: 'plain-text-body',
      isJson: false,
    });
    expect(formatAuditPayload(null)).toEqual({
      formatted: '--',
      isJson: false,
    });
    expect(formatAuditClientEnv('Chrome 130', 'Windows 10')).toBe('Chrome 130 / Windows 10');
    expect(formatAuditClientEnv(null, '')).toBe('--');
    expect(formatAuditClientEnv(null, 'Windows 10')).toBe('Windows 10');
    expect(formatAuditOperator('张敏', '1001')).toBe('张敏 (1001)');
    expect(formatAuditOperator(null, '1001')).toBe('-- (1001)');
    expect(formatAuditOperator(null, null)).toBe('--');

    const query: { beginTime?: string; endTime?: string } = {};
    const binding = createTimeRangeBinding(query);
    expect(binding.value).toBeNull();
    binding.value = ['2026-11-25 00:00:00', '2026-11-25 23:59:59'];
    expect(query).toEqual({
      beginTime: '2026-11-25 00:00:00',
      endTime: '2026-11-25 23:59:59',
    });
    binding.value = null;
    expect(query).toEqual({ beginTime: undefined, endTime: undefined });
    binding.value = ['2026-11-25 00:00:00', '2026-11-25 23:59:59'];
    resetAuditDateRange(query);
    expect(query).toEqual({ beginTime: undefined, endTime: undefined });
  });

  it('renders strictly read-only OperLogView, formats JSON inside 720px detail drawer, renders -- for null operateLocation, and copies traceId', async () => {
    const router = createAuditRouter();
    await router.push('/system/oper-log');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const operRows: OperLogVO[] = [
      {
        id: '9001',
        traceId: 'trace-oper-001',
        userId: '1001',
        userName: '张敏',
        module: '部门管理',
        operateType: 2,
        description: '修改部门',
        requestMethod: 'PUT',
        requestUrl: '/admin/system/dept',
        clientIp: '10.20.30.40',
        operateLocation: null,
        browser: 'Chrome 130',
        os: 'Windows 10',
        requestParams: '{"id":"B","phone":"138****5678"}',
        responseResult: '{"code":200,"msg":"success"}',
        status: 1,
        costTime: 48,
        errorMsg: '同级部门下已存在相同部门名称',
        extraJson: null,
        operateTime: '2026-11-25 16:00:00',
      },
    ];

    const pageSpy = vi.spyOn(logApi, 'getOperLogPage').mockResolvedValue({
      records: operRows,
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });
    const detailSpy = vi.spyOn(logApi, 'getOperLogDetail').mockResolvedValue(operRows[0]!);
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: writeTextMock } });
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: () => undefined }));

    const wrapper = trackWrapper(
      mount(OperLogView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(pageSpy).toHaveBeenCalledWith(expect.objectContaining({ current: 1, size: 10 }));
    expect(wrapper.text()).toContain('部门管理');
    expect(wrapper.text()).toContain('trace-oper-001');

    // 严格只读：页面禁止出现新增、编辑、删除、清空、导出按钮
    const buttonTexts = wrapper.findAll('button').map(btn => btn.text().trim());
    for (const text of buttonTexts) {
      expect(text).not.toMatch(/新增|编辑|删除|清空|导出/);
    }

    // 校验折叠查询表单 cols 配置与首行主条件可见性（module/userName/operateType/status）
    const queryForm = wrapper.findComponent({ name: 'AtengQueryForm' });
    expect(queryForm.exists()).toBe(true);
    expect(queryForm.props('cols')).toMatchObject({ lg: 5, xl: 5 });
    expect(wrapper.find('[data-testid="oper-log-query-type"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="oper-log-query-status"]').exists()).toBe(true);

    // 打开 720px 详情抽屉
    await wrapper.find('[data-testid="oper-log-detail-btn-9001"]').trigger('click');
    await flushPromises();
    expect(detailSpy).toHaveBeenCalledWith('9001');

    const drawerCmp = wrapper.findComponent({ name: 'AtengDrawer' });
    expect(drawerCmp.exists()).toBe(true);
    expect(drawerCmp.props('size')).toBe('720px');

    const drawerText =
      document.body.querySelector('[data-testid="oper-log-detail-body"]')?.textContent ?? '';
    expect(drawerText).toContain('--');
    expect(drawerText).toContain('PUT');
    expect(drawerText).toContain('/admin/system/dept');
    expect(drawerText).toContain('同级部门下已存在相同部门名称');
    expect(wrapper.text()).toContain('PUT /admin/system/dept');

    const reqPre =
      document.body.querySelector('[data-testid="oper-log-req-params"]')?.textContent ?? '';
    expect(reqPre).toContain('\n  "id": "B"');

    // 点击详情内 traceId 一键复制
    const copyTraceBtn = document.body.querySelector(
      '[data-testid="oper-log-copy-trace"]',
    ) as HTMLElement | null;
    expect(copyTraceBtn).not.toBeNull();
    copyTraceBtn?.click();
    await flushPromises();
    expect(writeTextMock).toHaveBeenCalledWith('trace-oper-001');
  });

  it('renders drawer fallback slots when userName or browser is null and renders non-empty extraJson panel', async () => {
    const router = createAuditRouter();
    await router.push('/system/oper-log');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const partialRow: OperLogVO = {
      id: '9002',
      traceId: 'trace-oper-002',
      userId: '1001',
      userName: null,
      module: '系统监控',
      operateType: 1,
      description: null,
      requestMethod: 'POST',
      requestUrl: '/admin/system/job',
      clientIp: '127.0.0.1',
      operateLocation: null,
      browser: null,
      os: 'Windows 10',
      requestParams: '{}',
      responseResult: null,
      status: 0,
      costTime: 12,
      errorMsg: null,
      extraJson: '{"source":"cron","attempt":1}',
      operateTime: '2026-11-25 16:05:00',
    };

    vi.spyOn(logApi, 'getOperLogPage').mockResolvedValue({
      records: [partialRow],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });
    vi.spyOn(logApi, 'getOperLogDetail').mockResolvedValue(partialRow);

    const wrapper = trackWrapper(
      mount(OperLogView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    await wrapper.find('[data-testid="oper-log-detail-btn-9002"]').trigger('click');
    await flushPromises();

    const drawerText =
      document.body.querySelector('[data-testid="oper-log-detail-body"]')?.textContent ?? '';
    expect(drawerText).toContain('-- (1001)');
    expect(drawerText).toContain('Windows 10');

    const extraPre =
      document.body.querySelector('[data-testid="oper-log-extra-json"]')?.textContent ?? '';
    expect(extraPre).toContain('\n  "source": "cron"');
  });

  it('renders strictly read-only LoginLogView with null-safe loginLocation and traceId copy', async () => {
    const router = createAuditRouter();
    await router.push('/system/login-log');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    const loginRows: LoginLogVO[] = [
      {
        id: '9101',
        traceId: 'trace-login-001',
        username: 'superadmin',
        loginType: 'admin',
        clientIp: '10.20.30.40',
        loginLocation: null,
        browser: 'Chrome 130',
        os: 'Windows 10',
        status: 1,
        msg: '连续登录失败已锁定 (101004)',
        loginTime: '2026-11-25 16:10:00',
      },
    ];

    const pageSpy = vi.spyOn(logApi, 'getLoginLogPage').mockResolvedValue({
      records: loginRows,
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: writeTextMock } });
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: () => undefined }));

    const wrapper = trackWrapper(
      mount(LoginLogView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(pageSpy).toHaveBeenCalledWith(expect.objectContaining({ current: 1, size: 10 }));
    expect(wrapper.text()).toContain('trace-login-001');
    expect(wrapper.text()).toContain('superadmin');
    expect(wrapper.text()).toContain('连续登录失败已锁定 (101004)');
    expect(wrapper.text()).toContain('--');

    // 严格只读：页面禁止出现新增、编辑、删除、清空、导出按钮
    const buttonTexts = wrapper.findAll('button').map(btn => btn.text().trim());
    for (const text of buttonTexts) {
      expect(text).not.toMatch(/新增|编辑|删除|清空|导出/);
    }

    // 校验折叠查询表单 cols 配置与首行主条件可见性（username/clientIp/status）
    const queryForm = wrapper.findComponent({ name: 'AtengQueryForm' });
    expect(queryForm.exists()).toBe(true);
    expect(queryForm.props('cols')).toMatchObject({ lg: 4, xl: 4 });
    expect(wrapper.find('[data-testid="login-log-query-username"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-log-query-ip"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-log-query-status"]').exists()).toBe(true);

    // 点击表内 traceId 复制
    await wrapper.find('[data-testid="login-log-table-copy-9101"]').trigger('click');
    await flushPromises();
    expect(writeTextMock).toHaveBeenCalledWith('trace-login-001');
  });
});
