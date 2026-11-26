import { computed, defineComponent, h, provide, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus from 'element-plus';
import AtengElementPlus, {
  ATENG_PRO_LAYOUT_KEY,
  DictManager,
  type AtengProLayoutContext,
  type DictItem,
  type ProLayoutMode,
} from '@atengk/element-plus';
import { createAtengVue } from '@atengk/vue';
import * as authApi from '@/api/auth';
import type { AdminProfileVO } from '@/api/auth';
import * as deptApi from '@/api/system/dept';
import * as dictApi from '@/api/system/dict';
import * as menuApi from '@/api/system/menu';
import * as userApi from '@/api/system/user';
import {
  QUERY_COLS_THREE_ITEMS,
  QUERY_COLS_TWO_ITEMS,
  QUERY_FORM_LOADING_DELAY,
  TABLE_AUTO_HEIGHT_OFFSET,
  useListTableLayout,
} from '@/composables/useListTableLayout';
import { useAuthStore } from '@/stores/auth';
import { setupDictManager } from '@/utils/dict';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import DictView from '@/views/system/dict/index.vue';
import MenuView from '@/views/system/menu/index.vue';
import OnlineSessionView from '@/views/system/online/index.vue';
import UserView from '@/views/system/user/index.vue';

/**
 * 列表检索复杂度分级单行收口与表格弹性封顶滚动契约测试（ADR-0005 / ateng-ui#380）。
 *
 * @author Ateng
 * @since 2026-11-26
 */

const wrappers: VueWrapper[] = [];
const ORIGINAL_INNER_WIDTH = typeof window !== 'undefined' ? window.innerWidth : 1024;

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
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
    loginDate: '2026-11-26 17:00:00',
  };
}

function createDictMap(): Record<string, DictItem[]> {
  return {
    commonStatus: [
      { label: '正常', value: 0, tagType: 'success' },
      { label: '停用', value: 1, tagType: 'danger' },
    ],
  };
}

function createTestRouter(): Router {
  const EmptyView = defineComponent({ name: 'StubView', template: '<div>stub</div>' });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: EmptyView },
      { path: '/dashboard', name: 'Dashboard', component: EmptyView },
      { path: '/system/menu', name: 'SysMenu', component: MenuView },
      { path: '/system/online', name: 'OnlineSession', component: OnlineSessionView },
      { path: '/system/dict', name: 'SysDict', component: DictView },
      { path: '/system/user', name: 'SysUser', component: UserView },
    ],
  });
}

describe('useListTableLayout & Tiered Query / Max Auto-Height Views (ADR-0005)', () => {
  let pinia: ReturnType<typeof createPinia>;
  let atengVue: ReturnType<typeof createAtengVue>;

  beforeEach(() => {
    setViewportWidth(1440);
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
    setViewportWidth(ORIGINAL_INNER_WIDTH);
    setupDictManager();
    vi.restoreAllMocks();
  });

  it('switches tableAutoHeight between 16 and false across viewport thresholds and layout isMobile context', async () => {
    const mobileRef = ref(false);
    const Consumer = defineComponent({
      props: {
        stackedBreakpoint: { type: Number, default: undefined },
      },
      setup(props) {
        return useListTableLayout({ stackedBreakpoint: props.stackedBreakpoint });
      },
      render() {
        return h('div', {
          'data-stacked': String(this.isStacked),
          'data-height': String(this.tableAutoHeight),
          'data-mode': this.tableAutoHeightMode,
        });
      },
    });
    const Host = defineComponent({
      props: {
        provideLayout: { type: Boolean, default: false },
        stackedBreakpoint: { type: Number, default: undefined },
      },
      setup(props) {
        if (props.provideLayout) {
          const layoutContext: AtengProLayoutContext = {
            collapsed: computed(() => false),
            asideWidth: computed(() => '228px'),
            headerHeight: computed(() => '48px'),
            tabsHeight: computed(() => '36px'),
            layout: computed<ProLayoutMode>(() => 'side'),
            fixedHeader: computed(() => true),
            fixedAside: computed(() => true),
            isMobile: computed(() => mobileRef.value),
            isMaximized: computed(() => false),
            toggleCollapse: () => undefined,
            toggleMaximize: () => undefined,
          };
          provide(ATENG_PRO_LAYOUT_KEY, layoutContext);
        }
        return () => h(Consumer, { stackedBreakpoint: props.stackedBreakpoint });
      },
    });

    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const wrapper = trackWrapper(mount(Host, { props: { stackedBreakpoint: 1120 } }));
    await flushPromises();

    expect(wrapper.attributes('data-stacked')).toBe('false');
    expect(wrapper.attributes('data-height')).toBe(String(TABLE_AUTO_HEIGHT_OFFSET));
    expect(wrapper.attributes('data-mode')).toBe('max');

    setViewportWidth(1024);
    await flushPromises();
    expect(wrapper.attributes('data-stacked')).toBe('true');
    expect(wrapper.attributes('data-height')).toBe('false');

    wrapper.unmount();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    const layoutWrapper = trackWrapper(mount(Host, { props: { provideLayout: true } }));
    await flushPromises();
    setViewportWidth(1440);
    await flushPromises();
    expect(layoutWrapper.attributes('data-height')).toBe(String(TABLE_AUTO_HEIGHT_OFFSET));

    mobileRef.value = true;
    await flushPromises();
    expect(layoutWrapper.attributes('data-stacked')).toBe('true');
    expect(layoutWrapper.attributes('data-height')).toBe('false');
  });

  it('configures 3-item MenuView and 2-item OnlineSessionView as single-row non-collapsible with max autoHeight', async () => {
    const router = createTestRouter();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    vi.spyOn(menuApi, 'getMenuTree').mockResolvedValue([
      {
        id: '1',
        parentId: '0',
        menuType: 'C',
        title: '菜单管理',
        path: '/system/menu',
        sort: 1,
        visible: 0,
        status: 0,
        keepAlive: true,
        isExternal: false,
        platformOnly: true,
        createTime: '2026-11-26 10:00:00',
        children: [],
      },
    ]);

    await router.push('/system/menu');
    await router.isReady();
    const menuWrapper = trackWrapper(
      mount(MenuView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const menuQueryForm = menuWrapper.findComponent({ name: 'AtengQueryForm' });
    expect(menuQueryForm.props('cols')).toEqual(QUERY_COLS_THREE_ITEMS);
    expect(menuQueryForm.props('defaultCollapsed')).toBe(false);
    expect(menuQueryForm.props('showCollapse')).toBe(false);
    expect(menuWrapper.find('.at-query-form__collapse-btn').exists()).toBe(false);

    const menuTable = menuWrapper.findComponent({ name: 'AtengTable' });
    expect(menuTable.props('autoHeight')).toBe(TABLE_AUTO_HEIGHT_OFFSET);
    expect(menuTable.props('autoHeightMode')).toBe('max');

    const menuElTable = menuTable.findComponent({ name: 'ElTable' });
    expect(menuElTable.props('height')).toBeUndefined();
    expect(menuElTable.props('maxHeight')).toBeTypeOf('number');

    vi.spyOn(authApi, 'getOnlineSessionPage').mockResolvedValue({
      records: [],
      total: 0,
      current: 1,
      size: 10,
      pages: 0,
    });

    await router.push('/system/online');
    await router.isReady();
    const onlineWrapper = trackWrapper(
      mount(OnlineSessionView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const onlineQueryForm = onlineWrapper.findComponent({ name: 'AtengQueryForm' });
    expect(onlineQueryForm.props('cols')).toEqual(QUERY_COLS_TWO_ITEMS);
    expect(onlineQueryForm.props('defaultCollapsed')).toBe(false);
    expect(onlineQueryForm.props('showCollapse')).toBe(false);
    expect(onlineWrapper.find('.at-query-form__collapse-btn').exists()).toBe(false);

    const onlineTable = onlineWrapper.findComponent({ name: 'AtengTable' });
    expect(onlineTable.props('autoHeight')).toBe(TABLE_AUTO_HEIGHT_OFFSET);
    expect(onlineTable.props('autoHeightMode')).toBe('max');

    setViewportWidth(640);
    await flushPromises();
    expect(onlineTable.props('autoHeight')).toBe(false);
  });

  it('applies viewport bounds and stacked fallback on DictView and UserView split layouts', async () => {
    const router = createTestRouter();
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    await useAuthStore().fetchUserInfo();

    vi.spyOn(dictApi, 'getDictTypePage').mockResolvedValue({
      records: [
        {
          id: 'DT1',
          dictName: '用户性别',
          dictType: 'sys_user_gender',
          status: 0,
          createTime: '2026-11-26 10:00:00',
        },
      ],
      total: 1,
      size: 10,
      current: 1,
      pages: 1,
    });
    vi.spyOn(dictApi, 'getDictDataPage').mockResolvedValue({
      records: [],
      total: 0,
      size: 10,
      current: 1,
      pages: 0,
    });

    await router.push('/system/dict');
    await router.isReady();
    const dictWrapper = trackWrapper(
      mount(DictView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const dictSection = dictWrapper.find('[data-testid="sys-dict-page"]');
    expect(dictSection.classes()).toContain('h-full');
    expect(dictSection.classes()).toContain('min-h-0');

    const dictQueries = dictWrapper.findAllComponents({ name: 'AtengQueryForm' });
    expect(dictQueries).toHaveLength(2);
    expect(dictQueries[0]!.props('defaultCollapsed')).toBe(true);
    expect(dictQueries[0]!.props('loadingDelay')).toBe(QUERY_FORM_LOADING_DELAY);
    expect(dictQueries[1]!.props('cols')).toEqual(QUERY_COLS_TWO_ITEMS);
    expect(dictQueries[1]!.props('defaultCollapsed')).toBe(false);
    expect(dictQueries[1]!.props('showCollapse')).toBe(false);
    expect(dictQueries[1]!.props('loadingDelay')).toBe(QUERY_FORM_LOADING_DELAY);

    const dictTables = dictWrapper.findAllComponents({ name: 'AtengTable' });
    expect(dictTables).toHaveLength(2);
    expect(dictTables[0]!.props('autoHeight')).toBe(TABLE_AUTO_HEIGHT_OFFSET);
    expect(dictTables[0]!.props('autoHeightMode')).toBe('max');
    expect(dictTables[1]!.props('autoHeight')).toBe(TABLE_AUTO_HEIGHT_OFFSET);
    expect(dictTables[1]!.props('autoHeightMode')).toBe('max');

    setViewportWidth(980);
    await flushPromises();
    expect(dictSection.classes()).toContain('min-h-[560px]');
    expect(dictTables[0]!.props('autoHeight')).toBe(false);
    expect(dictTables[1]!.props('autoHeight')).toBe(false);

    setViewportWidth(1440);
    vi.spyOn(deptApi, 'getDeptOptions').mockResolvedValue([]);
    vi.spyOn(userApi, 'getUserPage').mockResolvedValue({
      records: [],
      total: 0,
      size: 10,
      current: 1,
      pages: 0,
    });

    await router.push('/system/user');
    await router.isReady();
    const userWrapper = trackWrapper(
      mount(UserView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const userSection = userWrapper.find('[data-testid="sys-user-page"]');
    expect(userSection.classes()).toContain('h-full');
    expect(userWrapper.findComponent({ name: 'AtengQueryForm' }).props('defaultCollapsed')).toBe(
      true,
    );
    const userTable = userWrapper.findComponent({ name: 'AtengTable' });
    expect(userTable.props('autoHeight')).toBe(TABLE_AUTO_HEIGHT_OFFSET);
    expect(userTable.props('autoHeightMode')).toBe('max');

    setViewportWidth(820);
    await flushPromises();
    expect(userSection.classes()).toContain('min-h-[580px]');
    expect(userTable.props('autoHeight')).toBe(false);
  });
});
