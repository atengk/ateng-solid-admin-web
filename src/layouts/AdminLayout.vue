<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  watch,
  type Component as VueComponent,
} from 'vue';
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router';
import {
  ATENG_PRO_LAYOUT_KEY,
  AtengTabsNav,
  type AtengProLayoutContext,
  type ProLayoutMode,
  type TabBatchClosePayload,
  type TabItem,
} from '@atengk/element-plus';
import { useTabsNav } from '@atengk/vue';
import { useAppStore } from '@/stores/app';
import { usePermissionStore } from '@/stores/permission';
import { useTenantStore } from '@/stores/tenant';
import { SOLID_LAYOUT_TABS_KEY } from '@/types/router';
import {
  ADMIN_HOME_PATH,
  ADMIN_PROFILE_PATH,
  MOBILE_BREAKPOINT_PX,
  MOBILE_MEDIA_QUERY,
} from '@/layouts/layoutHelper';
import { resolveMenuIcon, TAB_MENU_ICONS } from '@/utils/icon';
import AdminHeader from '@/layouts/AdminHeader.vue';
import AdminSidebar from '@/layouts/AdminSidebar.vue';
import TenantObserveBanner from '@/layouts/TenantObserveBanner.vue';
import CommandPalette from '@/components/CommandPalette.vue';

/**
 * 方案 A 轻量管理后台布局壳主容器（Flex + --solid-* 自有令牌，单源持有 useTabsNav 状态机并兼容底座 ATENG_PRO_LAYOUT_KEY）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'RootLayout' });

const EXPANDED_SIDEBAR_WIDTH = '228px';
const COLLAPSED_SIDEBAR_WIDTH = '60px';
const HEADER_HEIGHT = '48px';
const TABS_HEIGHT = '36px';

const DASHBOARD_TAB: TabItem = {
  key: ADMIN_HOME_PATH,
  title: '工作台',
  icon: 'HomeFilled',
  affix: true,
  closable: false,
  componentName: 'Dashboard',
};

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const permissionStore = usePermissionStore();
const tenantStore = useTenantStore();

const mobileDrawerVisible = ref<boolean>(false);
let mediaQueryList: MediaQueryList | null = null;
let viewportChangeListener: (() => void) | null = null;

function isTabSyncableRoute(targetRoute: RouteLocationNormalizedLoaded): boolean {
  if (targetRoute.path === '/login' || targetRoute.path === '/403' || targetRoute.path === '/404') {
    return false;
  }
  return Boolean(targetRoute.meta.title);
}

function resolveTabFromRoute(targetRoute: RouteLocationNormalizedLoaded): TabItem {
  const rawTitle = targetRoute.meta.title;
  const title =
    typeof rawTitle === 'string' && rawTitle.trim().length > 0 ? rawTitle : targetRoute.path;
  const rawIcon = targetRoute.meta.icon;
  const icon =
    typeof rawIcon === 'string' && rawIcon.trim().length > 0
      ? rawIcon
      : targetRoute.path === ADMIN_HOME_PATH
        ? 'HomeFilled'
        : undefined;
  const componentName =
    targetRoute.meta.keepAlive && typeof targetRoute.name === 'string'
      ? targetRoute.name
      : undefined;

  return {
    key: targetRoute.fullPath,
    title,
    icon,
    affix: Boolean(targetRoute.meta.affix) || targetRoute.path === ADMIN_HOME_PATH,
    closable: !(Boolean(targetRoute.meta.affix) || targetRoute.path === ADMIN_HOME_PATH),
    componentName,
  };
}

const tabsNav = useTabsNav({
  defaultTabs: [DASHBOARD_TAB],
  defaultActiveKey: ADMIN_HOME_PATH,
  onRefresh: async () => {
    await nextTick();
  },
});

// 1. 注册跨租户切换与会话清理时的“关闭非固定页签”协调回调
appStore.registerTabsResetHandler(() => {
  tabsNav.closeAll();
});

function syncTabFromCurrentRoute(): void {
  if (!isTabSyncableRoute(route)) {
    return;
  }
  tabsNav.openTab(resolveTabFromRoute(route));
}

watch(
  () => route.fullPath,
  () => {
    syncTabFromCurrentRoute();
    if (appStore.isMobile) {
      mobileDrawerVisible.value = false;
    }
  },
  { immediate: true },
);

watch(
  () => tenantStore.switching,
  (isSwitching, wasSwitching) => {
    if (wasSwitching && !isSwitching && isTabSyncableRoute(route)) {
      // 跨租户切换完成后：若当前动态路由仍在新视角内合法可达，恢复对应激活页签
      if (permissionStore.hasMenuPath(route.path) || route.path === ADMIN_PROFILE_PATH) {
        syncTabFromCurrentRoute();
      }
    }
  },
);

function handleToggleSidebar(): void {
  if (appStore.isMobile) {
    mobileDrawerVisible.value = !mobileDrawerVisible.value;
    return;
  }
  appStore.toggleSidebar();
}

function resolveBatchAnchorKey(payload: TabBatchClosePayload): string {
  if (payload.command === 'closeOthers') {
    return payload.nextActiveKey || tabsNav.activeKey.value;
  }
  if (payload.nextActiveKey && payload.nextActiveKey !== tabsNav.activeKey.value) {
    return payload.nextActiveKey;
  }
  if (payload.command === 'closeLeft') {
    return payload.remainingTabs.find(tab => !tab.affix)?.key ?? tabsNav.activeKey.value;
  }
  if (payload.command === 'closeRight') {
    const nonAffixTabs = payload.remainingTabs.filter(tab => !tab.affix);
    return nonAffixTabs[nonAffixTabs.length - 1]?.key ?? tabsNav.activeKey.value;
  }
  return tabsNav.activeKey.value;
}

async function handleTabClick(tab: TabItem): Promise<void> {
  if (tab.key && route.fullPath !== tab.key) {
    await router.push(tab.key);
  }
}

async function closeTabAndSyncRoute(targetKey: string): Promise<void> {
  const wasActive = route.fullPath === targetKey;
  tabsNav.closeTab(targetKey);
  if (wasActive && tabsNav.activeKey.value && tabsNav.activeKey.value !== route.fullPath) {
    await router.push(tabsNav.activeKey.value);
  } else if (wasActive && !tabsNav.activeKey.value) {
    await router.replace(ADMIN_HOME_PATH);
  }
}

async function handleTabClose(key: string): Promise<void> {
  await closeTabAndSyncRoute(key);
}

async function handleBatchClose(payload: TabBatchClosePayload): Promise<void> {
  // 单源一次性调用 useTabsNav 批量关闭动作，严禁拆分为多次 tabClose 循环跳变
  if (payload.command === 'closeAll') {
    tabsNav.closeAll();
  } else {
    const anchorKey = resolveBatchAnchorKey(payload);
    if (payload.command === 'closeOthers') {
      tabsNav.closeOthers(anchorKey);
    } else if (payload.command === 'closeLeft') {
      tabsNav.closeLeft(anchorKey);
    } else if (payload.command === 'closeRight') {
      tabsNav.closeRight(anchorKey);
    }
  }

  if (tabsNav.activeKey.value && tabsNav.activeKey.value !== route.fullPath) {
    await router.push(tabsNav.activeKey.value);
  }
}

async function handleTabRefresh(key: string): Promise<void> {
  await tabsNav.refreshTab(key);
}

function handleTabOrderChange(nextTabs: TabItem[]): void {
  tabsNav.setTabs(nextTabs);
}

function handleUpdateMaximized(nextValue?: boolean): void {
  tabsNav.toggleMaximize(nextValue);
}

function resolveTabIcon(icon: string | VueComponent): string | VueComponent | undefined {
  if (typeof icon === 'string') {
    return resolveMenuIcon(icon);
  }
  return icon;
}

// 2. 向子孙业务组件提供标准 ATENG_PRO_LAYOUT_KEY（保障 AtengFooterBar 等自动侧栏避让）
const layoutContext: AtengProLayoutContext = {
  collapsed: computed(() => appStore.sidebarCollapsed),
  asideWidth: computed(() => {
    if (tabsNav.isMaximized.value || appStore.isMobile) {
      return '0px';
    }
    return appStore.sidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : EXPANDED_SIDEBAR_WIDTH;
  }),
  headerHeight: computed(() => (tabsNav.isMaximized.value ? '0px' : HEADER_HEIGHT)),
  tabsHeight: computed(() => (appStore.showTabsBar ? TABS_HEIGHT : '0px')),
  layout: computed<ProLayoutMode>(() => 'side'),
  fixedHeader: computed(() => true),
  fixedAside: computed(() => true),
  isMobile: computed(() => appStore.isMobile),
  isMaximized: computed(() => tabsNav.isMaximized.value),
  toggleCollapse: handleToggleSidebar,
  toggleMaximize: handleUpdateMaximized,
};

provide(ATENG_PRO_LAYOUT_KEY, layoutContext);
provide(SOLID_LAYOUT_TABS_KEY, {
  closeCurrentTab: async (targetKey?: string) => {
    const key = targetKey || route.fullPath;
    if (tabsNav.tabs.value.some(tab => tab.key === key && !tab.affix)) {
      await closeTabAndSyncRoute(key);
      return;
    }
    await router.replace(ADMIN_HOME_PATH);
  },
});

function syncMobileViewport(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const matchesMedia =
    typeof window.matchMedia === 'function' ? window.matchMedia(MOBILE_MEDIA_QUERY).matches : false;
  const mobile = matchesMedia || window.innerWidth < MOBILE_BREAKPOINT_PX;
  appStore.setMobile(mobile);
  if (!mobile) {
    mobileDrawerVisible.value = false;
  }
}

function handleWindowKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.key !== 'Escape') {
    return;
  }
  if (mobileDrawerVisible.value) {
    mobileDrawerVisible.value = false;
    return;
  }
  if (tabsNav.isMaximized.value && !appStore.commandPaletteVisible) {
    tabsNav.toggleMaximize(false);
  }
}

onMounted(() => {
  syncMobileViewport();
  if (typeof window !== 'undefined') {
    viewportChangeListener = () => {
      syncMobileViewport();
    };
    if (typeof window.matchMedia === 'function') {
      mediaQueryList = window.matchMedia(MOBILE_MEDIA_QUERY);
      mediaQueryList.addEventListener('change', viewportChangeListener);
    }
    window.addEventListener('resize', viewportChangeListener);
    window.addEventListener('keydown', handleWindowKeyDown);
  }
});

onBeforeUnmount(() => {
  appStore.registerTabsResetHandler(null);
  if (mediaQueryList && viewportChangeListener) {
    mediaQueryList.removeEventListener('change', viewportChangeListener);
    mediaQueryList = null;
  }
  if (typeof window !== 'undefined') {
    if (viewportChangeListener) {
      window.removeEventListener('resize', viewportChangeListener);
    }
    window.removeEventListener('keydown', handleWindowKeyDown);
  }
  viewportChangeListener = null;
});
</script>

<template>
  <div
    data-testid="admin-layout-shell"
    class="flex h-screen w-full overflow-hidden bg-canvas text-ink"
  >
    <AdminSidebar
      v-if="!appStore.isMobile && !tabsNav.isMaximized.value"
      :collapsed="appStore.sidebarCollapsed"
    />

    <div
      v-if="appStore.isMobile && mobileDrawerVisible && !tabsNav.isMaximized.value"
      data-testid="mobile-sidebar-overlay"
      class="fixed inset-0 z-40 flex bg-ink/40"
      @click.self="mobileDrawerVisible = false"
    >
      <AdminSidebar :mobile-drawer="true" @select="mobileDrawerVisible = false" />
    </div>

    <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
      <AdminHeader
        v-if="!tabsNav.isMaximized.value"
        :collapsed="appStore.sidebarCollapsed"
        :is-mobile="appStore.isMobile"
        @toggle-sidebar="handleToggleSidebar"
      />

      <AtengTabsNav
        v-if="appStore.showTabsBar"
        :model-value="tabsNav.activeKey.value"
        :tabs="tabsNav.tabs.value"
        style-type="line"
        height="36px"
        :emit-close-on-batch="false"
        :is-maximized="tabsNav.isMaximized.value"
        :icon-resolver="resolveTabIcon"
        :menu-icons="TAB_MENU_ICONS"
        @tab-click="handleTabClick"
        @tab-close="handleTabClose"
        @batch-close="handleBatchClose"
        @tab-refresh="handleTabRefresh"
        @tab-order-change="handleTabOrderChange"
        @update:is-maximized="handleUpdateMaximized"
      />

      <TenantObserveBanner v-if="!tabsNav.isMaximized.value" />

      <main class="min-h-0 flex-1 overflow-auto p-4">
        <slot>
          <router-view
            :key="tenantStore.activeTenantId"
            v-slot="{ Component, route: currentRoute }"
          >
            <KeepAlive :include="tabsNav.cachedViews.value">
              <component
                :is="Component"
                v-if="
                  Component &&
                  !tenantStore.switching &&
                  tabsNav.refreshingKey.value !== currentRoute.fullPath
                "
                :key="`${tenantStore.activeTenantId}:${currentRoute.fullPath}`"
              />
            </KeepAlive>
          </router-view>
        </slot>
      </main>
    </div>

    <CommandPalette />
  </div>
</template>

<style scoped></style>
