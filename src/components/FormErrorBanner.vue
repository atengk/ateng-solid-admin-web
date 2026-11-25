<script setup lang="ts">
import { ElIcon } from 'element-plus';
import { Warning } from '@element-plus/icons-vue';

/**
 * 弹窗/抽屉内联错误告警横幅（保留提交现场并展示语义化诊断提示）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'FormErrorBanner' });

defineProps<{
  /**
   * 错误提示文本（为空或空白时不渲染）。
   */
  message?: string;
  /**
   * 测试定位属性（可选）。
   */
  testId?: string;
}>();
</script>

<template>
  <div
    v-if="message"
    :data-testid="testId"
    role="alert"
    class="flex items-center gap-2 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2 text-[13px] text-[var(--solid-danger)]"
  >
    <el-icon :size="15"><Warning /></el-icon>
    <span>{{ message }}</span>
  </div>
</template>

<style scoped></style>
