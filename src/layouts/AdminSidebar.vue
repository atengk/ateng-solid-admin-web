<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElIcon, ElMenu, ElMenuItem, ElMenuItemGroup } from 'element-plus';
import { HomeFilled, Menu as DefaultMenuIcon } from '@element-plus/icons-vue';
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

const appTitle = import.meta.env.VITE_APP_TITLE || 'ateng-solid';
const isCollapsed = computed<boolean>(() => !props.mobileDrawer && props.collapsed);
const activeMenuPath = computed<string>(() => route.path || ADMIN_HOME_PATH);

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
</script>

<template>
  <aside
    data-testid="admin-sidebar"
    :class="[
      'flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-out select-none',
      isCollapsed ? 'w-[60px]' : 'w-[228px]',
    ]"
  >
    <div
      class="flex h-12 shrink-0 items-center gap-2.5 overflow-hidden border-b border-border-subtle px-3.5"
    >
      <span
        class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--solid-radius-md)] bg-primary text-[13px] font-bold text-surface"
      >
        S
      </span>
      <div v-if="!isCollapsed" class="flex min-w-0 items-baseline gap-1 truncate">
        <span class="truncate text-sm font-semibold text-ink">{{ appTitle }}</span>
        <span class="text-[11px] font-medium text-ink-muted">Admin</span>
      </div>
    </div>

    <div class="flex-1 overflow-x-hidden overflow-y-auto py-1.5">
      <el-menu
        class="solid-sidebar-menu"
        :default-active="activeMenuPath"
        :collapse="isCollapsed"
        :collapse-transition="false"
        @select="handleMenuSelect"
      >
        <el-menu-item :index="ADMIN_HOME_PATH">
          <el-icon><HomeFilled /></el-icon>
          <template #title>工作台</template>
        </el-menu-item>

        <template v-for="group in permissionStore.sidebarGroups" :key="group.id">
          <el-menu-item-group :title="isCollapsed ? undefined : group.title">
            <el-menu-item v-for="item in group.items" :key="item.id" :index="item.path">
              <el-icon>
                <component :is="resolveSidebarItemIcon(item.icon)" />
              </el-icon>
              <template #title>{{ item.title }}</template>
            </el-menu-item>
          </el-menu-item-group>
        </template>
      </el-menu>
    </div>
  </aside>
</template>

<style scoped>
.solid-sidebar-menu {
  border-right: none;
  background-color: transparent;
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: var(--solid-bg-subtle);
  --el-menu-active-color: var(--solid-primary);
  --el-menu-text-color: var(--solid-text-regular);
  --el-menu-item-height: 36px;
}

.solid-sidebar-menu :deep(.el-menu-item-group__title) {
  padding: 10px 16px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--solid-text-muted);
  line-height: 1.4;
}

.solid-sidebar-menu :deep(.el-menu-item) {
  position: relative;
  height: 36px;
  line-height: 36px;
  margin: 2px 8px;
  padding: 0 10px;
  border-radius: var(--solid-radius-md);
  font-size: 13px;
}

.solid-sidebar-menu :deep(.el-menu-item.is-active) {
  background-color: var(--solid-primary-soft);
  color: var(--solid-primary);
  font-weight: 600;
}

.solid-sidebar-menu :deep(.el-menu-item.is-active)::before {
  content: '';
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  border-radius: 0 var(--solid-radius-sm) var(--solid-radius-sm) 0;
  background-color: var(--solid-primary);
}

.solid-sidebar-menu.el-menu--collapse :deep(.el-menu-item) {
  margin: 2px 6px;
  justify-content: center;
}

.solid-sidebar-menu.el-menu--collapse :deep(.el-menu-item-group__title) {
  display: none;
}
</style>
