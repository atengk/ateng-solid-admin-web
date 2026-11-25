<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElDialog, ElIcon, ElInput } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { useAppStore } from '@/stores/app';
import { usePermissionStore } from '@/stores/permission';
import {
  ADMIN_HOME_PATH,
  ADMIN_PROFILE_PATH,
  flattenSidebarItems,
  navigateMenuTarget,
} from '@/layouts/layoutHelper';

/**
 * 全局快捷命令与菜单检索面板（支持 Ctrl+K / Cmd+K 唤起、键盘上下选择与回车跳转）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'CommandPalette' });

interface PaletteCommandItem {
  key: string;
  title: string;
  path: string;
  groupTitle: string;
  isExternal: boolean;
}

const router = useRouter();
const appStore = useAppStore();
const permissionStore = usePermissionStore();

const keyword = ref<string>('');
const activeIndex = ref<number>(0);
const searchInputRef = ref<InstanceType<typeof ElInput> | null>(null);

const visible = computed<boolean>({
  get: () => appStore.commandPaletteVisible,
  set: (value: boolean) => {
    appStore.toggleCommandPalette(value);
  },
});

const allItems = computed<PaletteCommandItem[]>(() => {
  const staticItems: PaletteCommandItem[] = [
    {
      key: ADMIN_HOME_PATH,
      title: '工作台',
      path: ADMIN_HOME_PATH,
      groupTitle: '首页',
      isExternal: false,
    },
    {
      key: ADMIN_PROFILE_PATH,
      title: '个人中心',
      path: ADMIN_PROFILE_PATH,
      groupTitle: '账户设置',
      isExternal: false,
    },
  ];

  const menuItems = flattenSidebarItems(permissionStore.sidebarGroups).map(item => ({
    key: item.id,
    title: item.title,
    path: item.path,
    groupTitle: item.groupTitle,
    isExternal: item.isExternal,
  }));

  return [...staticItems, ...menuItems];
});

const filteredItems = computed<PaletteCommandItem[]>(() => {
  const normalized = keyword.value.trim().toLowerCase();
  if (!normalized) {
    return allItems.value;
  }
  return allItems.value.filter(
    item =>
      item.title.toLowerCase().includes(normalized) ||
      item.path.toLowerCase().includes(normalized) ||
      item.groupTitle.toLowerCase().includes(normalized),
  );
});

watch(filteredItems, items => {
  if (items.length === 0) {
    activeIndex.value = 0;
    return;
  }
  if (activeIndex.value >= items.length) {
    activeIndex.value = 0;
  }
});

watch(visible, async isOpen => {
  if (!isOpen) {
    keyword.value = '';
    activeIndex.value = 0;
    return;
  }
  await nextTick();
  searchInputRef.value?.focus();
});

async function navigateToItem(item: PaletteCommandItem): Promise<void> {
  appStore.toggleCommandPalette(false);
  await navigateMenuTarget(router, item.path, item.isExternal);
}

function handleGlobalKeyDown(event: KeyboardEvent): void {
  // 1. 响应 Ctrl+K / Cmd+K 快捷唤起或关闭搜索面板
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    event.stopImmediatePropagation();
    appStore.toggleCommandPalette();
    return;
  }

  if (!visible.value) {
    return;
  }

  // 2. 面板展开期间独占 Escape / 方向键与 Enter，避免冒泡触发底层布局退出最大化
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    appStore.toggleCommandPalette(false);
    return;
  }

  const list = filteredItems.value;
  if (list.length === 0) {
    return;
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % list.length;
    return;
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value - 1 + list.length) % list.length;
    return;
  }

  if (event.key === 'Enter') {
    const selected = list[activeIndex.value];
    if (selected) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void navigateToItem(selected);
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeyDown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeyDown);
});
</script>

<template>
  <el-dialog
    v-model="visible"
    data-testid="command-palette-dialog"
    width="520px"
    :show-close="false"
    :close-on-click-modal="true"
    :close-on-press-escape="false"
  >
    <template #header>
      <div class="flex items-center gap-2 border-b border-border pb-3">
        <el-icon :size="16" class="text-ink-muted"><Search /></el-icon>
        <el-input
          ref="searchInputRef"
          v-model="keyword"
          data-testid="command-palette-input"
          clearable
          placeholder="搜索可见菜单名称、路由路径或领域分组..."
        />
      </div>
    </template>

    <div class="max-h-72 overflow-y-auto py-1">
      <div v-if="filteredItems.length === 0" class="py-6 text-center text-xs text-ink-muted">
        未匹配到可用菜单页面
      </div>

      <button
        v-for="(item, index) in filteredItems"
        :key="item.key"
        type="button"
        :data-testid="`command-palette-item-${item.path}`"
        :class="[
          'flex w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--solid-radius-md)] border-none px-3 py-2 text-left text-[13px] transition-colors',
          index === activeIndex
            ? 'bg-primary-soft text-primary'
            : 'bg-transparent text-ink-regular hover:bg-surface-subtle hover:text-ink',
        ]"
        @mouseenter="activeIndex = index"
        @click="navigateToItem(item)"
      >
        <div class="flex min-w-0 flex-col">
          <span class="truncate font-medium">{{ item.title }}</span>
          <span class="text-xs text-ink-muted">{{ item.groupTitle }}</span>
        </div>
        <span class="shrink-0 font-mono-data text-xs text-ink-secondary">{{ item.path }}</span>
      </button>
    </div>

    <template #footer>
      <div class="flex items-center justify-between text-xs text-ink-muted">
        <span>支持上下键切换与 Enter 直达</span>
        <span>Esc 关闭</span>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped></style>
