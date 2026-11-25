<script setup lang="ts">
import { computed, inject } from 'vue';
import { ElResult } from 'element-plus';
import { ATENG_PRO_LAYOUT_KEY } from '@atengk/element-plus';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';
import AdminLayout from '@/layouts/AdminLayout.vue';

/**
 * 异常状态兜底共享壳组件：统一判定是否嵌入 AdminLayout 居中展示，避免 403/404 重复包装逻辑。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'ErrorResultShell' });

withDefaults(
  defineProps<{
    /**
     * 异常页根节点测试标识。
     */
    testId: string;
    /**
     * Element Plus Result 图标类型。
     */
    icon?: 'success' | 'warning' | 'info' | 'error';
    /**
     * 异常主标题。
     */
    title: string;
    /**
     * 异常说明文案。
     */
    subTitle: string;
  }>(),
  {
    icon: 'info',
  },
);

const authStore = useAuthStore();
const permissionStore = usePermissionStore();

authStore.syncTokenFromManager();

const hasLayoutParent = inject(ATENG_PRO_LAYOUT_KEY, null) !== null;
const shouldEmbedLayout = computed<boolean>(
  () => !hasLayoutParent && authStore.isAuthenticated && permissionStore.hasAccessibleMenus,
);
</script>

<template>
  <component
    :is="shouldEmbedLayout ? AdminLayout : 'div'"
    :class="{ 'min-h-screen bg-canvas': !shouldEmbedLayout }"
  >
    <section
      :data-testid="testId"
      class="flex min-h-[calc(100vh-140px)] items-center justify-center p-6"
    >
      <div
        class="w-full max-w-md rounded-[var(--solid-radius-lg)] border border-border bg-surface p-6 text-center"
      >
        <el-result :icon="icon" :title="title" :sub-title="subTitle">
          <template #extra>
            <div class="flex flex-wrap items-center justify-center gap-2.5">
              <slot name="actions" />
            </div>
          </template>
        </el-result>
      </div>
    </section>
  </component>
</template>

<style scoped></style>
