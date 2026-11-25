<script setup lang="ts">
import { inject } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElButton } from 'element-plus';
import { ADMIN_HOME_PATH } from '@/layouts/layoutHelper';
import { SOLID_LAYOUT_TABS_KEY } from '@/types/router';
import ErrorResultShell from '@/views/error/ErrorResultShell.vue';

/**
 * 404 页面不存在及未知动态组件安全降级视图（提供返回工作台、返回上一页与关闭当前页签出口）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'NotFound' });

const route = useRoute();
const router = useRouter();
const layoutTabs = inject(SOLID_LAYOUT_TABS_KEY, null);

async function handleBackHome(): Promise<void> {
  await router.replace(ADMIN_HOME_PATH);
}

function handleGoBack(): void {
  router.back();
}

async function handleCloseCurrentTab(): Promise<void> {
  if (layoutTabs) {
    await layoutTabs.closeCurrentTab(route.fullPath);
    return;
  }
  await router.replace(ADMIN_HOME_PATH);
}
</script>

<template>
  <ErrorResultShell
    test-id="error-404-page"
    icon="info"
    title="404 · 页面不存在"
    sub-title="访问的地址不存在或菜单组件尚未配置，请返回工作台或关闭当前页签。"
  >
    <template #actions>
      <el-button type="primary" data-testid="notfound-home-btn" @click="handleBackHome">
        返回工作台
      </el-button>
      <el-button data-testid="notfound-back-btn" @click="handleGoBack"> 返回上一页 </el-button>
      <el-button data-testid="notfound-close-tab-btn" @click="handleCloseCurrentTab">
        关闭当前页签
      </el-button>
    </template>
  </ErrorResultShell>
</template>

<style scoped></style>
