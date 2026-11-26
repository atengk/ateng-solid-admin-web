<script setup lang="ts">
import { ElButton } from 'element-plus';
import { CopyDocument } from '@element-plus/icons-vue';
import { copyAuditText } from '@/views/system/log/logHelper';

/**
 * 审计日志表格 TraceId 单元格（等宽字体展示并附带一键复制按钮，空值回落 `--`）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'AuditTraceCell' });

defineProps<{
  /**
   * 链路追踪标识。
   */
  traceId?: string | null;
  /**
   * 复制按钮的测试锚点 ID。
   */
  testId?: string;
}>();
</script>

<template>
  <span v-if="traceId?.trim()" class="inline-flex max-w-full items-center gap-1">
    <span class="min-w-0 truncate font-mono-data tabular-nums text-ink" :title="traceId">{{
      traceId
    }}</span>
    <el-button
      :data-testid="testId"
      type="primary"
      link
      size="small"
      class="shrink-0"
      aria-label="复制 TraceId"
      :icon="CopyDocument"
      @click="copyAuditText(traceId, 'TraceId')"
    />
  </span>
  <span v-else class="text-ink-muted">--</span>
</template>

<style scoped></style>
