<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ElButton } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';
import { ADMIN_HOME_PATH } from '@/layouts/layoutHelper';
import ErrorResultShell from '@/views/error/ErrorResultShell.vue';

/**
 * 403 无权限引导视图：已登录且持有可用菜单时嵌入 AdminLayout 居中展示；零菜单账号显式提供退出登录防死锁出口。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'Forbidden' });

const router = useRouter();
const authStore = useAuthStore();
const permissionStore = usePermissionStore();

authStore.syncTokenFromManager();

const isZeroMenuAuthenticated = computed<boolean>(
  () => authStore.isAuthenticated && !permissionStore.hasAccessibleMenus,
);

const description = computed<string>(() => {
  if (!authStore.isAuthenticated) {
    return '当前访问受限或登录状态未建立，请登录后再试。';
  }
  if (isZeroMenuAuthenticated.value) {
    return '当前账号尚未分配任何可用功能菜单，请联系管理员授权或退出切换其他账号。';
  }
  return '抱歉，您暂无访问该页面或资源的权限，如需开通请联系系统管理员。';
});

async function handleBackHome(): Promise<void> {
  await router.replace(ADMIN_HOME_PATH);
}

function handleGoBack(): void {
  router.back();
}

async function handleBackLogin(): Promise<void> {
  await router.replace('/login');
}

async function handleLogout(): Promise<void> {
  await authStore.logout({ router });
}
</script>

<template>
  <ErrorResultShell
    test-id="error-403-page"
    icon="warning"
    title="403 · 暂无访问权限"
    :sub-title="description"
  >
    <template #actions>
      <template v-if="isZeroMenuAuthenticated">
        <el-button type="primary" data-testid="forbidden-logout-btn" @click="handleLogout">
          退出登录
        </el-button>
        <el-button data-testid="forbidden-home-btn" @click="handleBackHome"> 返回工作台 </el-button>
      </template>

      <template v-else-if="authStore.isAuthenticated">
        <el-button type="primary" data-testid="forbidden-home-btn" @click="handleBackHome">
          返回工作台
        </el-button>
        <el-button data-testid="forbidden-back-btn" @click="handleGoBack"> 返回上一页 </el-button>
      </template>

      <template v-else>
        <el-button type="primary" data-testid="forbidden-login-btn" @click="handleBackLogin">
          返回登录页
        </el-button>
      </template>
    </template>
  </ErrorResultShell>
</template>

<style scoped></style>
