<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { ElAvatar, ElButton, ElIcon, ElTag } from 'element-plus';
import {
  Close,
  Lock,
  Menu as DefaultMenuIcon,
  Monitor,
  Right,
  User,
} from '@element-plus/icons-vue';
import {
  ADMIN_PROFILE_PATH,
  flattenSidebarItems,
  navigateMenuTarget,
} from '@/layouts/layoutHelper';
import { PASSWORD_REMINDER_DISMISS_PREFIX, useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';
import { useTenantStore } from '@/stores/tenant';
import { resolveMenuIcon } from '@/utils/icon';

/**
 * 轻量工作台视图（/dashboard）：
 * 复用认证摘要与动态菜单路由状态，渲染非阻塞改密提醒、会话身份卡、动态快捷入口网格与运行基线指引。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'Dashboard' });

const MAX_SHORTCUT_COUNT = 12;

const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();
const tenantStore = useTenantStore();

function buildDismissStorageKey(userId?: string): string {
  return `${PASSWORD_REMINDER_DISMISS_PREFIX}${userId || 'current'}`;
}

function readDismissedFlag(userId?: string): boolean {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }
  try {
    return sessionStorage.getItem(buildDismissStorageKey(userId)) === '1';
  } catch {
    return false;
  }
}

const dismissedInSession = ref<boolean>(readDismissedFlag(authStore.user?.userId));

watch(
  () => authStore.user?.userId,
  nextUserId => {
    dismissedInSession.value = readDismissedFlag(nextUserId);
  },
);

const showPasswordReminder = computed<boolean>(
  () => Boolean(authStore.user?.passwordNeedsChange) && !dismissedInSession.value,
);

const displayName = computed<string>(
  () => authStore.user?.nickname || authStore.user?.username || '管理员',
);

const avatarInitial = computed<string>(() => displayName.value.slice(0, 1).toUpperCase() || '管');

const greetingText = computed<string>(() => {
  const hour = new Date().getHours();
  if (hour < 12) {
    return '早上好';
  }
  if (hour < 18) {
    return '下午好';
  }
  return '晚上好';
});

const tenantSummary = computed<string>(() => {
  if (!authStore.tenantEnabled) {
    return '平台默认租户 (0)';
  }
  return `${tenantStore.activeTenantName} (${tenantStore.activeTenantId})`;
});

const lastLoginSummary = computed<string>(() => {
  const ip = authStore.user?.loginIp?.trim();
  const time = authStore.user?.loginDate?.trim();
  if (!ip && !time) {
    return '首次登录管理台';
  }
  return `${ip || '--'} · ${time || '--'}`;
});

const shortcutItems = computed(() =>
  flattenSidebarItems(permissionStore.sidebarGroups).slice(0, MAX_SHORTCUT_COUNT),
);

const hasOnlinePermission = computed<boolean>(() => authStore.hasPermission('auth:online:list'));

function handleDismissReminder(): void {
  dismissedInSession.value = true;
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(buildDismissStorageKey(authStore.user?.userId), '1');
  } catch {
    // 会话存储不可用时仅在内存隐藏
  }
}

async function handleGoChangePassword(): Promise<void> {
  await router.push({ path: ADMIN_PROFILE_PATH, query: { tab: 'password' } });
}

async function handleGoProfile(): Promise<void> {
  await router.push(ADMIN_PROFILE_PATH);
}

async function handleGoOnline(): Promise<void> {
  await router.push('/system/online');
}

async function handleOpenShortcut(path: string, isExternal: boolean): Promise<void> {
  await navigateMenuTarget(router, path, isExternal);
}

async function handleLogout(): Promise<void> {
  await authStore.logout({ router });
}

function resolveCardIcon(icon?: string | null): Component {
  return resolveMenuIcon(icon ?? undefined) ?? DefaultMenuIcon;
}
</script>

<template>
  <section data-testid="dashboard-page" class="flex flex-col gap-4">
    <!-- 初始/重置密码非阻塞安全提醒条 -->
    <div
      v-if="showPasswordReminder"
      data-testid="dashboard-pwd-reminder"
      role="status"
      class="solid-pwd-banner flex flex-wrap items-center justify-between gap-3 rounded-[var(--solid-radius-lg)] border px-4 py-3 text-[13px]"
    >
      <div class="flex items-center gap-2.5">
        <el-icon :size="16" class="shrink-0"><Lock /></el-icon>
        <span> 当前账号仍在使用初始或管理员重置口令，为保障账号安全建议尽快修改密码。 </span>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <el-button
          data-testid="dashboard-pwd-go-btn"
          type="warning"
          size="small"
          @click="handleGoChangePassword"
        >
          立即修改密码
        </el-button>
        <el-button
          data-testid="dashboard-pwd-dismiss-btn"
          size="small"
          plain
          :icon="Close"
          @click="handleDismissReminder"
        >
          本次不再提醒
        </el-button>
      </div>
    </div>

    <!-- 第一区：欢迎头与会话身份摘要卡 -->
    <div class="rounded-[var(--solid-radius-lg)] border border-border bg-surface p-5">
      <div
        class="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-4"
      >
        <div class="flex min-w-0 items-center gap-3.5">
          <el-avatar
            :size="48"
            :src="authStore.user?.avatar || undefined"
            class="solid-dashboard-avatar shrink-0"
          >
            {{ avatarInitial }}
          </el-avatar>

          <div class="min-w-0">
            <h1 class="m-0 truncate text-lg font-semibold text-ink">
              {{ greetingText }}，{{ displayName }}
            </h1>
            <div class="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-secondary">
              <span class="font-mono-data">{{ authStore.user?.username || '--' }}</span>
              <span>·</span>
              <el-tag
                v-for="role in authStore.roles"
                :key="role"
                size="small"
                :type="role === 'super_admin' ? 'primary' : 'info'"
              >
                {{ role }}
              </el-tag>
              <span v-if="authStore.roles.length === 0" class="text-ink-muted">未分配角色</span>
            </div>
          </div>
        </div>

        <el-button type="primary" plain :icon="User" @click="handleGoProfile"> 个人中心 </el-button>
      </div>

      <dl class="mt-4 mb-0 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div
          class="rounded-[var(--solid-radius-md)] border border-border-subtle bg-surface-subtle/50 px-3.5 py-2.5"
        >
          <dt class="text-xs text-ink-secondary">当前账号</dt>
          <dd class="mt-1 mb-0 ms-0 flex items-center gap-2 text-sm font-medium text-ink">
            <span class="font-mono-data">{{ authStore.user?.username || '--' }}</span>
          </dd>
        </div>

        <div
          class="rounded-[var(--solid-radius-md)] border border-border-subtle bg-surface-subtle/50 px-3.5 py-2.5"
        >
          <dt class="text-xs text-ink-secondary">当前工作租户</dt>
          <dd class="mt-1 mb-0 ms-0 flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
            <span class="tabular-nums">{{ tenantSummary }}</span>
            <el-tag v-if="tenantStore.isObservingTenant" size="small" type="warning">
              跨租户观察
            </el-tag>
          </dd>
        </div>

        <div
          class="rounded-[var(--solid-radius-md)] border border-border-subtle bg-surface-subtle/50 px-3.5 py-2.5"
        >
          <dt class="text-xs text-ink-secondary">最近登录记录</dt>
          <dd class="mt-1 mb-0 ms-0 truncate font-mono-data text-sm font-medium text-ink" :title="lastLoginSummary">
            {{ lastLoginSummary }}
          </dd>
        </div>
      </dl>
    </div>

    <!-- 第二区：按权限动态过滤的快捷导航网格 -->
    <div class="rounded-[var(--solid-radius-lg)] border border-border bg-surface p-5">
      <div class="mb-3.5 flex items-center justify-between gap-2">
        <h2 class="m-0 text-base font-semibold text-ink">快捷功能导航</h2>
        <span class="tabular-nums text-xs text-ink-secondary">
          共 {{ shortcutItems.length }} 项可用入口
        </span>
      </div>

      <div
        v-if="shortcutItems.length === 0"
        data-testid="dashboard-empty-menus-card"
        class="flex flex-col items-center justify-center gap-3 rounded-[var(--solid-radius-md)] border border-dashed border-border bg-canvas/60 px-6 py-8 text-center"
      >
        <p class="m-0 text-sm text-ink-regular">
          当前账号暂未分配业务模块访问权限，请联系管理员在【角色管理】中授予菜单权限
        </p>
        <div class="flex flex-wrap items-center justify-center gap-2.5">
          <el-button type="primary" plain @click="handleGoProfile">前往个人中心</el-button>
          <el-button data-testid="dashboard-empty-logout-btn" plain @click="handleLogout">
            退出登录
          </el-button>
        </div>
      </div>

      <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <button
          v-for="item in shortcutItems"
          :key="item.id"
          type="button"
          :data-testid="`dashboard-shortcut-${item.path}`"
          class="flex cursor-pointer flex-col gap-2 rounded-[var(--solid-radius-md)] border border-border bg-surface p-3.5 text-left transition-colors hover:border-primary hover:bg-primary-soft/40"
          @click="handleOpenShortcut(item.path, item.isExternal)"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <span
                class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--solid-radius-sm)] bg-primary-soft text-primary"
              >
                <el-icon :size="15">
                  <component :is="resolveCardIcon(item.icon)" />
                </el-icon>
              </span>
              <span class="truncate text-sm font-semibold text-ink">{{ item.title }}</span>
            </div>
            <el-tag v-if="item.platformOnly" size="small" type="info">平台专属</el-tag>
          </div>

          <div class="flex items-center justify-between gap-2 text-xs text-ink-secondary">
            <span class="truncate">{{ item.groupTitle }}</span>
            <span class="font-mono-data truncate text-[11px] text-ink-muted">{{ item.path }}</span>
          </div>
        </button>
      </div>
    </div>

    <!-- 第三区：系统运行基线与安全规范指引（双栏轻量说明） -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section class="rounded-[var(--solid-radius-lg)] border border-border bg-surface p-5">
        <h3 class="m-0 mb-2.5 text-sm font-semibold text-ink">框架运行态概要</h3>
        <ul class="m-0 flex list-none flex-col gap-2 p-0 text-[13px] text-ink-regular">
          <li class="flex items-center justify-between border-b border-border-subtle pb-2">
            <span class="text-ink-secondary">多租户运行模式</span>
            <span class="font-medium text-ink">
              {{ authStore.tenantEnabled ? 'SaaS 多租户已开启' : '单租户默认态' }}
            </span>
          </li>
          <li class="flex items-center justify-between border-b border-border-subtle pb-2">
            <span class="text-ink-secondary">管理端会话体系</span>
            <span class="font-mono-data text-ink">satoken-admin</span>
          </li>
          <li class="flex items-center justify-between">
            <span class="text-ink-secondary">多页签快捷交互</span>
            <span class="text-ink">右键支持局部刷新与批关闭 · Ctrl+K 快捷搜索</span>
          </li>
        </ul>
      </section>

      <section class="rounded-[var(--solid-radius-lg)] border border-border bg-surface p-5">
        <div class="mb-2.5 flex items-center justify-between gap-2">
          <h3 class="m-0 text-sm font-semibold text-ink">账号与安全规范指引</h3>
          <el-button
            v-if="hasOnlinePermission"
            data-testid="dashboard-online-link"
            type="primary"
            link
            size="small"
            @click="handleGoOnline"
          >
            <el-icon class="mr-1"><Monitor /></el-icon>
            查看在线会话
            <el-icon class="ml-0.5"><Right /></el-icon>
          </el-button>
        </div>
        <ul
          class="m-0 flex list-none flex-col gap-2 p-0 text-[13px] leading-relaxed text-ink-regular"
        >
          <li>1. 个人资料渲染遵循展示脱敏与内存真明文分离，编辑提交使用完整未脱敏值。</li>
          <li>
            2. 登录口令须为 8~20 位无空白字符，并至少包含大小写字母、数字与特殊字符中的 3 类。
          </li>
          <li>3. 自助修改密码成功后将强制注销当前及同账号全部活跃会话，需使用新口令重登。</li>
        </ul>
      </section>
    </div>
  </section>
</template>

<style scoped>
.solid-pwd-banner {
  background-color: var(--solid-warning-soft);
  border-color: var(--solid-warning-border);
  color: var(--solid-warning);
}

.solid-dashboard-avatar {
  --el-avatar-bg-color: var(--solid-primary-soft);
  --el-avatar-text-color: var(--solid-primary);
  font-size: 16px;
  font-weight: 600;
}
</style>
