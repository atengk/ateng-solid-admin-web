import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus, { ElMessage } from 'element-plus';
import { formatMaskEmail } from '@atengk/core';
import AtengElementPlus, { DictManager, type DictItem } from '@atengk/element-plus';
import { createAtengVue } from '@atengk/vue';
import * as authApi from '@/api/auth';
import type { AdminProfileVO } from '@/api/auth';
import * as configApi from '@/api/system/config';
import * as deptApi from '@/api/system/dept';
import * as logApi from '@/api/system/log';
import * as menuApi from '@/api/system/menu';
import * as tenantApi from '@/api/system/tenant';
import * as tenantPackageApi from '@/api/system/tenant-package';
import * as userApi from '@/api/system/user';
import { setupDictManager } from '@/utils/dict';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import ConfigView from '@/views/system/config/index.vue';
import MenuView from '@/views/system/menu/index.vue';
import OperLogView from '@/views/system/oper-log/index.vue';
import TenantView from '@/views/system/tenant/index.vue';
import UserView from '@/views/system/user/index.vue';

/**
 * 1440x900 视口六大系统列表页列宽预算与 AtengTable 默认隐藏列（ateng-ui#390）契约测试 (#70)。
 *
 * @author Ateng
 * @since 2026-11-28
 */

interface ParsedColumnMeta {
  key: string;
  width: number;
  hasFixedRight: boolean;
}

const ADMIN_WEB_ROOT = resolve(__dirname, '../..');
// 菜单管理三按钮（新增/编辑/删除）行内渲染防截断最小列宽预算（px）
const MENU_THREE_BUTTON_ACTION_MIN_WIDTH = 212;
const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function readViewSource(relativePath: string): string {
  return readFileSync(resolve(ADMIN_WEB_ROOT, relativePath), 'utf8');
}

function parseTableColumns(source: string): ParsedColumnMeta[] {
  const tableMatch = source.match(/<AtengTable\b[\s\S]*?<\/AtengTable>/);
  if (!tableMatch) {
    throw new Error('未在视图源码中找到 <AtengTable> 代码块');
  }
  const columnRegex = /<el-table-column\b([^>]*)>/g;
  const columns: ParsedColumnMeta[] = [];
  let match: RegExpExecArray | null;

  while ((match = columnRegex.exec(tableMatch[0])) !== null) {
    const attrs = match[1] ?? '';
    const prop = attrs.match(/\bprop="([^"]+)"/)?.[1];
    const label = attrs.match(/\blabel="([^"]+)"/)?.[1];
    const type = attrs.match(/\btype="([^"]+)"/)?.[1];
    const widthStr = attrs.match(/(?:^|\s)width="(\d+)"/)?.[1] ?? attrs.match(/\bmin-width="(\d+)"/)?.[1];
    const key = prop ?? label ?? type ?? '';
    if (!key || !widthStr) {
      throw new Error(`列定义缺少唯一键或显式宽度: ${attrs.trim()}`);
    }
    columns.push({
      key,
      width: Number(widthStr),
      hasFixedRight: /\bfixed="right"/.test(attrs),
    });
  }
  return columns;
}

function createProfile(tenantEnabled = true): AdminProfileVO {
  return {
    userId: '1',
    tenantId: '0',
    tenantName: '平台默认租户',
    username: 'superadmin',
    nickname: '超级管理员',
    avatar: null,
    roles: ['super_admin'],
    permissions: ['*:*:*'],
    tenantEnabled,
    passwordNeedsChange: false,
    loginIp: '10.20.30.40',
    loginDate: '2026-11-28 08:00:00',
  };
}

function createBudgetRouter(): Router {
  const EmptyView = defineComponent({ name: 'StubView', template: '<div>stub</div>' });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: EmptyView },
      { path: '/dashboard', name: 'Dashboard', component: EmptyView },
      { path: '/system/config', name: 'SysConfig', component: ConfigView },
      { path: '/system/menu', name: 'SysMenu', component: MenuView },
      { path: '/system/tenant', name: 'SysTenant', component: TenantView },
      { path: '/system/user', name: 'SysUser', component: UserView },
      { path: '/system/oper-log', name: 'SysOperLog', component: OperLogView },
    ],
  });
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
    visibleStatus: [
      { label: '显示', value: 0, tagType: 'success' },
      { label: '隐藏', value: 1, tagType: 'info' },
    ],
    operateType: [{ label: '修改', value: 2, tagType: 'warning' }],
    logStatus: [{ label: '成功', value: 0, tagType: 'success' }],
  };
}

async function openColumnSettingPopover(wrapper: VueWrapper): Promise<void> {
  const trigger = wrapper.find('.at-table__tool-btn[aria-label="列设置"]');
  expect(trigger.exists()).toBe(true);
  await trigger.trigger('click');
  await flushPromises();
}

function toggleSettingColumn(columnLabel: string): void {
  const items = Array.from(document.body.querySelectorAll('.at-table-column-setting__item'));
  const target = items.find(item => item.textContent?.includes(columnLabel));
  const checkbox = target?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  expect(checkbox).not.toBeNull();
  checkbox?.click();
}

function clickSettingReset(): void {
  const resetBtn = Array.from(
    document.body.querySelectorAll('.at-table-column-setting__header button'),
  ).find(btn => btn.textContent?.includes('重置')) as HTMLButtonElement | undefined;
  expect(resetBtn).toBeDefined();
  resetBtn?.click();
}

describe('1440px table column width budgets & defaultHiddenColumns (#70)', () => {
  let pinia: ReturnType<typeof createPinia>;
  let atengVue: ReturnType<typeof createAtengVue>;

  beforeEach(() => {
    localStorage.clear();
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
    localStorage.clear();
    vi.unstubAllGlobals();
    setupDictManager();
    vi.restoreAllMocks();
  });

  it('meets exact 1440px container width budgets, preserves storageKey & fixed="right", and bans type workarounds across all 6 views', () => {
    const specs: Array<{
      path: string;
      storageKey: string;
      budget: number;
      expectedVisibleSum: number;
      visibleCount: number;
      hiddenKeys: string[];
      expectFixedRight: boolean;
      expectedActionWidth?: number;
    }> = [
      {
        path: 'src/views/system/config/index.vue',
        storageKey: 'solid:table:sys-config',
        budget: 1146,
        expectedVisibleSum: 1069,
        visibleCount: 8,
        hiddenKeys: [],
        expectFixedRight: true,
      },
      {
        path: 'src/views/system/menu/index.vue',
        storageKey: 'solid:table:sys-menu',
        budget: 1146,
        expectedVisibleSum: 1112,
        visibleCount: 9,
        hiddenKeys: [],
        expectFixedRight: true,
        expectedActionWidth: 220,
      },
      {
        path: 'src/views/system/tenant/index.vue',
        storageKey: 'solid:table:sys-tenant',
        budget: 1146,
        expectedVisibleSum: 1046,
        visibleCount: 8,
        hiddenKeys: ['id', 'createTime'],
        expectFixedRight: true,
      },
      {
        path: 'src/views/system/user/index.vue',
        storageKey: 'solid:table:sys-user',
        budget: 904,
        expectedVisibleSum: 848,
        visibleCount: 8,
        hiddenKeys: ['id', 'email', 'createTime'],
        expectFixedRight: true,
      },
      {
        path: 'src/views/system/oper-log/index.vue',
        storageKey: 'solid:table:sys-oper-log',
        budget: 1146,
        expectedVisibleSum: 1047,
        visibleCount: 9,
        hiddenKeys: ['id', 'traceId', 'browser'],
        expectFixedRight: true,
      },
      {
        path: 'src/views/system/login-log/index.vue',
        storageKey: 'solid:table:sys-login-log',
        budget: 1146,
        expectedVisibleSum: 1012,
        visibleCount: 8,
        hiddenKeys: ['id', 'traceId', 'loginType'],
        expectFixedRight: false,
      },
    ];

    for (const spec of specs) {
      const source = readViewSource(spec.path);
      expect(source).not.toMatch(/\bas\s+any\b|@ts-expect-error|:visible=/);
      expect(source).toContain(`'${spec.storageKey}'`);

      const columns = parseTableColumns(source);
      const hiddenSet = new Set(spec.hiddenKeys);
      const visibleCols = columns.filter(col => !hiddenSet.has(col.key));
      const visibleSum = visibleCols.reduce((acc, col) => acc + col.width, 0);

      expect(visibleCols).toHaveLength(spec.visibleCount);
      expect(visibleSum).toBeLessThanOrEqual(spec.budget);
      expect(visibleSum).toBe(spec.expectedVisibleSum);

      if (spec.expectFixedRight) {
        expect(columns.at(-1)?.hasFixedRight).toBe(true);
      }
      if (spec.expectedActionWidth !== undefined) {
        const actionColumn = columns.at(-1);
        expect(actionColumn?.key).toBe('操作');
        expect(actionColumn?.width).toBeGreaterThanOrEqual(MENU_THREE_BUTTON_ACTION_MIN_WIDTH);
        expect(actionColumn?.width).toBe(spec.expectedActionWidth);
      }
      if (spec.hiddenKeys.length > 0) {
        expect(source).toContain(':default-hidden-columns=');
        for (const hiddenKey of spec.hiddenKeys) {
          expect(source).toContain(`'${hiddenKey}'`);
        }
      } else {
        expect(source).not.toContain(':default-hidden-columns=');
      }
    }
  });

  it('keeps all columns visible on ConfigView and MenuView without defaultHiddenColumns', async () => {
    const router = createBudgetRouter();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    vi.spyOn(configApi, 'getConfigPage').mockResolvedValue({
      records: [
        {
          id: 'CFG1',
          configName: '站点名称',
          configKey: 'sys.site.name',
          configValue: 'ateng-solid',
          configType: 'N',
          remark: '系统标题',
          createTime: '2026-11-28 08:10:00',
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });

    await router.push('/system/config');
    await router.isReady();
    const configWrapper = trackWrapper(
      mount(ConfigView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();

    const configTable = configWrapper.findComponent({ name: 'AtengTable' });
    expect(configTable.props('defaultHiddenColumns')).toBeUndefined();
    expect(configWrapper.text()).toContain('2026-11-28 08:10:00');
    expect(configWrapper.text()).toContain('站点名称');

    vi.spyOn(menuApi, 'getMenuTree').mockResolvedValue([
      {
        id: 'M1',
        parentId: '0',
        menuType: 'C',
        title: '系统参数',
        path: '/system/config',
        component: 'system/config/index',
        perms: 'system:config:list',
        sort: 1,
        visible: 0,
        status: 0,
        keepAlive: true,
        isExternal: false,
        platformOnly: false,
        createTime: '2026-11-28 08:00:00',
        children: [],
      },
    ]);

    await router.push('/system/menu');
    await router.isReady();
    const menuWrapper = trackWrapper(
      mount(MenuView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();

    const menuTable = menuWrapper.findComponent({ name: 'AtengTable' });
    expect(menuTable.props('defaultHiddenColumns')).toBeUndefined();
    expect(menuWrapper.text()).toContain('system:config:list');
    expect(menuWrapper.text()).toContain('显示');
    expect(menuWrapper.find('[data-testid="menu-status-switch-M1"]').exists()).toBe(true);
  });

  it('hides default low-frequency columns on TenantView, restores and resets via column settings, and respects existing storageKey preferences', async () => {
    const router = createBudgetRouter();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile(true));
    useAuthStore().setTenantEnabled(true);
    await useAuthStore().fetchUserInfo();

    vi.spyOn(tenantPackageApi, 'getTenantPackageOptions').mockResolvedValue([]);
    vi.spyOn(tenantApi, 'getTenantPage').mockResolvedValue({
      records: [
        {
          id: 'T_HIDDEN_ID_01',
          tenantCode: '100088',
          tenantName: '华东智造租户',
          packageId: 'PKG1',
          packageName: '标准企业版',
          accountCount: 100,
          usedAccountCount: 12,
          expireTime: null,
          status: 0,
          createTime: '2026-11-11 08:09:10',
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });

    await router.push('/system/tenant');
    await router.isReady();
    const tenantWrapper = trackWrapper(
      mount(TenantView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();

    const tenantTable = tenantWrapper.findComponent({ name: 'AtengTable' });
    expect(tenantTable.props('defaultHiddenColumns')).toEqual(['id', 'createTime']);
    expect(tenantWrapper.text()).toContain('100088');
    expect(tenantWrapper.text()).toContain('华东智造租户');
    expect(tenantWrapper.find('[data-testid="tenant-status-switch-T_HIDDEN_ID_01"]').exists()).toBe(true);
    expect(tenantWrapper.text()).not.toContain('T_HIDDEN_ID_01');
    expect(tenantWrapper.text()).not.toContain('2026-11-11 08:09:10');

    // 列配置一键勾选恢复并重置
    await openColumnSettingPopover(tenantWrapper);
    toggleSettingColumn('创建时间');
    await flushPromises();
    expect(tenantWrapper.text()).toContain('2026-11-11 08:09:10');

    clickSettingReset();
    await flushPromises();
    expect(tenantWrapper.text()).not.toContain('2026-11-11 08:09:10');
    tenantWrapper.unmount();

    // 已有自定义列偏好的用户优先保留既有配置，点击重置才回落到新默认隐藏集合
    localStorage.setItem(
      'solid:table:sys-tenant',
      JSON.stringify({
        visible: { id: true, createTime: false },
      }),
    );
    const customWrapper = trackWrapper(
      mount(TenantView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();
    expect(customWrapper.text()).toContain('T_HIDDEN_ID_01');
    expect(customWrapper.text()).not.toContain('2026-11-11 08:09:10');

    await openColumnSettingPopover(customWrapper);
    clickSettingReset();
    await flushPromises();
    expect(customWrapper.text()).not.toContain('T_HIDDEN_ID_01');
  });

  it('hides id/email/createTime on UserView and traceId on OperLogView by default with one-click column recovery', async () => {
    const router = createBudgetRouter();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    vi.spyOn(deptApi, 'getDeptOptions').mockResolvedValue([]);
    vi.spyOn(userApi, 'getUserPage').mockResolvedValue({
      records: [
        {
          id: 'U_HIDDEN_99',
          tenantId: '10',
          username: 'zhangsan',
          nickname: '张三',
          avatar: null,
          deptId: 'D1',
          deptName: '研发中心',
          phone: '13812345678',
          email: 'devuser@ateng.dev',
          status: 0,
          builtinSuperAdmin: false,
          createTime: '2026-11-12 07:08:09',
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });

    await router.push('/system/user');
    await router.isReady();
    const userWrapper = trackWrapper(
      mount(UserView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();

    const maskedEmail = formatMaskEmail('devuser@ateng.dev');
    const userTable = userWrapper.findComponent({ name: 'AtengTable' });
    expect(userTable.props('defaultHiddenColumns')).toEqual(['id', 'email', 'createTime']);
    expect(userWrapper.text()).toContain('zhangsan');
    expect(userWrapper.text()).toContain('138****5678');
    expect(userWrapper.find('[data-testid="user-status-switch-U_HIDDEN_99"]').exists()).toBe(true);
    expect(userWrapper.text()).not.toContain('U_HIDDEN_99');
    expect(userWrapper.text()).not.toContain(maskedEmail);
    expect(userWrapper.text()).not.toContain('2026-11-12 07:08:09');

    await openColumnSettingPopover(userWrapper);
    toggleSettingColumn('电子邮箱');
    await flushPromises();
    expect(userWrapper.text()).toContain(maskedEmail);

    clickSettingReset();
    await flushPromises();
    expect(userWrapper.text()).not.toContain(maskedEmail);
    userWrapper.unmount();

    // 验证 OperLogView 可通过列设置恢复并复制 TraceId
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: writeTextMock } });
    vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: () => undefined }));
    vi.spyOn(logApi, 'getOperLogPage').mockResolvedValue({
      records: [
        {
          id: '9099',
          traceId: 'trace-oper-9099',
          userId: '1',
          userName: 'admin',
          module: '用户管理',
          operateType: 2,
          description: '更新用户',
          requestMethod: 'PUT',
          requestUrl: '/admin/system/user',
          clientIp: '10.0.0.8',
          operateLocation: null,
          browser: 'Firefox 132',
          os: 'Linux',
          requestParams: '{}',
          responseResult: '{}',
          status: 0,
          costTime: 18,
          errorMsg: null,
          extraJson: null,
          operateTime: '2026-11-28 08:15:00',
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });

    await router.push('/system/oper-log');
    await router.isReady();
    const operWrapper = trackWrapper(
      mount(OperLogView, { global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] } }),
    );
    await flushPromises();

    expect(operWrapper.text()).not.toContain('trace-oper-9099');
    await openColumnSettingPopover(operWrapper);
    toggleSettingColumn('TraceId');
    await flushPromises();
    expect(operWrapper.text()).toContain('trace-oper-9099');

    await operWrapper.find('[data-testid="oper-log-table-copy-9099"]').trigger('click');
    await flushPromises();
    expect(writeTextMock).toHaveBeenCalledWith('trace-oper-9099');

    clickSettingReset();
    await flushPromises();
    expect(operWrapper.text()).not.toContain('trace-oper-9099');
  });
});
