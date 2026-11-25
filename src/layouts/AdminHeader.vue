<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ElAvatar,
  ElBreadcrumb,
  ElBreadcrumbItem,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElIcon,
} from 'element-plus';
import { ArrowDown, Expand, Fold, Lock, Search, SwitchButton, User } from '@element-plus/icons-vue';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { ADMIN_HOME_PATH, ADMIN_PROFILE_PATH } from '@/layouts/layoutHelper';
import TenantSwitcher from '@/components/TenantSwitcher.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';

/**
 * 方案 A 48px 单行顶栏（折叠按钮、动态面包屑、快捷命令入口、租户切换器、主题切换与用户菜单）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'AdminHeader' });

const props = withDefaults(
  defineProps<{
    /**
     * 当前桌面侧边栏是否处于折叠状态。
     */
    collapsed?: boolean;
    /**
     * 当前是否处于移动端视口断点（<768px）。
     */
    isMobile?: boolean;
  }>(),
  {
    collapsed: false,
    isMobile: false,
  },
);

const emit = defineEmits<{
  /**
   * 触发切换侧边栏折叠或打开移动端抽屉导航。
   */
  (e: 'toggle-sidebar'): void;
}>();

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const authStore = useAuthStore();

const displayName = computed<string>(
  () => authStore.user?.nickname || authStore.user?.username || '管理员',
);

const avatarInitial = computed<string>(() => displayName.value.slice(0, 1).toUpperCase() || '管');

const domainLabel = computed<string | undefined>(() => {
  if (route.path === ADMIN_HOME_PATH) {
    return '首页';
  }
  const raw = route.meta.groupTitle;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
});

const currentTitle = computed<string>(() => {
  const raw = route.meta.title;
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : '';
});

const collapseAriaLabel = computed<string>(() => {
  if (props.isMobile) {
    return '打开导航菜单';
  }
  return props.collapsed ? '展开侧边栏' : '收起侧边栏';
});

async function handleUserCommand(
  command: string | number | Record<string, unknown>,
): Promise<void> {
  if (command === 'profile') {
    await router.push(ADMIN_PROFILE_PATH);
    return;
  }
  if (command === 'password') {
    await router.push({ path: ADMIN_PROFILE_PATH, query: { tab: 'password' } });
    return;
  }
  if (command === 'logout') {
    await authStore.logout({ router });
  }
}
</script>

<template>
  <header
    data-testid="admin-header"
    class="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4"
  >
    <div class="flex min-w-0 flex-1 items-center gap-2.5">
      <button
        type="button"
        data-testid="header-sidebar-toggle"
        :aria-label="collapseAriaLabel"
        :title="collapseAriaLabel"
        class="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--solid-radius-md)] border border-transparent bg-transparent text-ink-regular transition-colors hover:bg-surface-subtle hover:text-ink"
        @click="emit('toggle-sidebar')"
      >
        <el-icon :size="16">
          <Expand v-if="isMobile || collapsed" />
          <Fold v-else />
        </el-icon>
      </button>

      <div class="solid-breadcrumb min-w-0 truncate">
        <el-breadcrumb separator="/" data-testid="header-breadcrumb">
          <el-breadcrumb-item
            v-if="domainLabel"
            :to="route.path !== ADMIN_HOME_PATH ? { path: ADMIN_HOME_PATH } : undefined"
          >
            {{ domainLabel }}
          </el-breadcrumb-item>
          <el-breadcrumb-item
            v-else
            :to="route.path !== ADMIN_HOME_PATH ? { path: ADMIN_HOME_PATH } : undefined"
          >
            首页
          </el-breadcrumb-item>
          <el-breadcrumb-item v-if="currentTitle">{{ currentTitle }}</el-breadcrumb-item>
        </el-breadcrumb>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-2">
      <button
        type="button"
        data-testid="header-command-trigger"
        aria-label="打开快捷搜索"
        title="快捷搜索菜单 (Ctrl+K)"
        class="hidden h-8 cursor-pointer items-center gap-2 rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle px-2.5 text-xs text-ink-secondary transition-colors hover:text-ink sm:inline-flex"
        @click="appStore.toggleCommandPalette(true)"
      >
        <el-icon :size="13"><Search /></el-icon>
        <span>搜索菜单</span>
        <kbd
          class="rounded-[var(--solid-radius-sm)] border border-border bg-surface px-1 py-0.5 font-mono-data text-[11px] text-ink-muted"
        >
          Ctrl K
        </kbd>
      </button>

      <TenantSwitcher />
      <ThemeToggle />

      <el-dropdown trigger="click" @command="handleUserCommand">
        <button
          type="button"
          data-testid="header-user-trigger"
          class="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[var(--solid-radius-md)] border border-transparent bg-transparent px-2 text-[13px] text-ink transition-colors hover:bg-surface-subtle"
        >
          <el-avatar
            :size="24"
            :src="authStore.user?.avatar || undefined"
            class="solid-user-avatar"
          >
            {{ avatarInitial }}
          </el-avatar>
          <span class="hidden max-w-[120px] truncate font-medium sm:inline">
            {{ displayName }}
          </span>
          <el-icon :size="12" class="text-ink-muted"><ArrowDown /></el-icon>
        </button>

        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="profile" :icon="User">个人中心</el-dropdown-item>
            <el-dropdown-item command="password" :icon="Lock">修改密码</el-dropdown-item>
            <el-dropdown-item divided command="logout" :icon="SwitchButton">
              退出登录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </header>
</template>

<style scoped>
.solid-breadcrumb :deep(.el-breadcrumb) {
  font-size: 13px;
}

.solid-user-avatar {
  --el-avatar-bg-color: var(--solid-primary-soft);
  --el-avatar-text-color: var(--solid-primary);
  font-size: 12px;
  font-weight: 600;
}
</style>
