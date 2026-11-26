<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElIcon, ElTooltip } from 'element-plus';
import { HomeFilled, Menu as DefaultMenuIcon } from '@element-plus/icons-vue';
import BrandLogo from '@/components/BrandLogo.vue';
import { usePermissionStore } from '@/stores/permission';
import { resolveMenuIcon } from '@/utils/icon';
import {
  ADMIN_HOME_PATH,
  flattenSidebarItems,
  navigateMenuTarget,
  type FlattenedMenuNavigationItem,
} from '@/layouts/layoutHelper';

/**
 * 方案 A 经典左侧导航栏（228px 展开 / 60px 折叠 / 48px 顶部品牌区 / 平铺域分组头与 3px 左激活条）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'AdminSidebar' });

const props = withDefaults(
  defineProps<{
    /**
     * 是否处于桌面端折叠状态。
     */
    collapsed?: boolean;
    /**
     * 是否渲染在移动端滑出抽屉中（抽屉内部强制展开展示文案）。
     */
    mobileDrawer?: boolean;
  }>(),
  {
    collapsed: false,
    mobileDrawer: false,
  },
);

const emit = defineEmits<{
  /**
   * 点击任意菜单项完成跳转后触发（用于移动端抽屉自动收起）。
   */
  (e: 'select', path: string): void;
}>();

const route = useRoute();
const router = useRouter();
const permissionStore = usePermissionStore();

const ADMIN_HOME_TITLE = '工作台';
const appTitle = import.meta.env.VITE_APP_TITLE || 'ateng-solid 管理后台';
const isCollapsed = computed<boolean>(() => !props.mobileDrawer && props.collapsed);
const activeMenuPath = computed<string>(() => route.path || ADMIN_HOME_PATH);
const brandTooltip = computed<string>(() => `${appTitle} · 点击返回工作台`);

const flattenedMenuMap = computed<Map<string, FlattenedMenuNavigationItem>>(() => {
  const map = new Map<string, FlattenedMenuNavigationItem>();
  for (const item of flattenSidebarItems(permissionStore.sidebarGroups)) {
    map.set(item.path, item);
  }
  return map;
});

function resolveSidebarItemIcon(icon?: string | null) {
  return resolveMenuIcon(icon ?? undefined) ?? DefaultMenuIcon;
}

async function handleMenuSelect(index: string): Promise<void> {
  const target = flattenedMenuMap.value.get(index);
  await navigateMenuTarget(router, target?.path ?? index, Boolean(target?.isExternal));
  emit('select', index);
}

async function handleBrandClick(): Promise<void> {
  if (route.path !== ADMIN_HOME_PATH) {
    await router.push(ADMIN_HOME_PATH);
  }
  emit('select', ADMIN_HOME_PATH);
}
</script>

<template>
  <aside
    data-testid="admin-sidebar"
    :class="[
      'flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out select-none',
      isCollapsed ? 'w-[60px]' : 'w-[228px]',
    ]"
  >
    <button
      type="button"
      data-testid="sidebar-brand-trigger"
      :title="brandTooltip"
      :aria-label="brandTooltip"
      :class="[
        'flex h-12 w-full shrink-0 cursor-pointer items-center overflow-hidden border-0 border-b border-solid border-border-subtle bg-transparent text-left transition-colors hover:bg-surface-subtle',
        isCollapsed ? 'justify-center px-0' : 'px-3.5',
      ]"
      @click="handleBrandClick"
    >
      <BrandLogo :size="24" :show-wordmark="!isCollapsed" wordmark-size="sm" />
    </button>

    <nav
      aria-label="主导航"
      data-testid="admin-sidebar-nav"
      class="flex-1 overflow-x-hidden overflow-y-auto py-1.5"
    >
      <ul class="m-0 list-none p-0">
        <li>
          <el-tooltip :content="ADMIN_HOME_TITLE" placement="right" :disabled="!isCollapsed">
            <button
              type="button"
              :data-testid="`sidebar-item-${ADMIN_HOME_PATH}`"
              :aria-label="isCollapsed ? ADMIN_HOME_TITLE : undefined"
              :aria-current="activeMenuPath === ADMIN_HOME_PATH ? 'page' : undefined"
              :class="[
                'solid-sidebar-item',
                isCollapsed && 'solid-sidebar-item--collapsed',
                activeMenuPath === ADMIN_HOME_PATH && 'is-active',
              ]"
              @click="handleMenuSelect(ADMIN_HOME_PATH)"
            >
              <el-icon :size="16" class="shrink-0" aria-hidden="true"><HomeFilled /></el-icon>
              <span v-if="!isCollapsed" class="truncate">{{ ADMIN_HOME_TITLE }}</span>
            </button>
          </el-tooltip>
        </li>

        <li v-for="group in permissionStore.sidebarGroups" :key="group.id" class="mt-0.5">
          <div v-if="!isCollapsed" class="solid-sidebar-group-title">
            {{ group.title }}
          </div>
          <ul class="m-0 list-none p-0" :aria-label="group.title">
            <li v-for="item in group.items" :key="item.id">
              <el-tooltip :content="item.title" placement="right" :disabled="!isCollapsed">
                <button
                  type="button"
                  :data-testid="`sidebar-item-${item.path}`"
                  :aria-label="isCollapsed ? item.title : undefined"
                  :aria-current="activeMenuPath === item.path ? 'page' : undefined"
                  :class="[
                    'solid-sidebar-item',
                    isCollapsed && 'solid-sidebar-item--collapsed',
                    activeMenuPath === item.path && 'is-active',
                  ]"
                  @click="handleMenuSelect(item.path)"
                >
                  <el-icon :size="16" class="shrink-0" aria-hidden="true">
                    <component :is="resolveSidebarItemIcon(item.icon)" />
                  </el-icon>
                  <span v-if="!isCollapsed" class="truncate">{{ item.title }}</span>
                </button>
              </el-tooltip>
            </li>
          </ul>
        </li>
      </ul>
    </nav>
  </aside>
</template>

<style scoped>
.solid-sidebar-group-title {
  padding: 10px 16px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--solid-text-muted);
  line-height: 1.4;
}

.solid-sidebar-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% - 16px);
  height: 36px;
  margin: 2px 8px;
  padding: 0 10px;
  border: none;
  border-radius: var(--solid-radius-md);
  background-color: transparent;
  color: var(--solid-text-regular);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.solid-sidebar-item:hover {
  background-color: var(--solid-bg-subtle);
  color: var(--solid-text-primary);
}

.solid-sidebar-item:focus-visible {
  outline: none;
  box-shadow: var(--solid-shadow-focus);
}

.solid-sidebar-item.is-active {
  background-color: var(--solid-primary-soft);
  color: var(--solid-primary);
  font-weight: 600;
}

.solid-sidebar-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 0 var(--solid-radius-sm) var(--solid-radius-sm) 0;
  background-color: var(--solid-primary);
}

.solid-sidebar-item--collapsed {
  width: calc(100% - 12px);
  margin: 2px 6px;
  padding: 0;
  justify-content: center;
}
</style>
