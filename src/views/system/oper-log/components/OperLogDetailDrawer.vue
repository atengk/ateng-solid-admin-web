<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { ElButton, ElIcon } from 'element-plus';
import { CopyDocument, Warning } from '@element-plus/icons-vue';
import { AtengDescriptions, AtengDrawer, type DescriptionsItemConfig } from '@atengk/element-plus';
import { getOperLogDetail, type OperLogDetailVO } from '@/api/system/log';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import {
  copyAuditText,
  formatAuditClientEnv,
  formatAuditOperator,
  formatAuditPayload,
} from '@/views/system/log/logHelper';

/**
 * 操作审计日志只读详情抽屉（720px）：
 * 通过 AtengDescriptions 展示完整操作摘要，美化并限高滚动脱敏报文，提供 traceId 一键复制。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'OperLogDetailDrawer' });

const props = defineProps<{
  /**
   * 抽屉显隐状态（v-model）。
   */
  modelValue: boolean;
  /**
   * 待查看的操作日志主键（64 位雪花 ID 字符串）。
   */
  logId?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const visible = computed<boolean>({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

const { detailLoading, submitError, resetDialogState, runDetailLoad } = useDetailDialogState();
const detail = reactive<Partial<OperLogDetailVO>>({});
const expandedPanels = reactive<Record<'requestParams' | 'responseResult' | 'extraJson', boolean>>({
  requestParams: false,
  responseResult: false,
  extraJson: false,
});

const hasLoadedDetail = computed<boolean>(() => Boolean(detail.id));

const detailItems: DescriptionsItemConfig<Partial<OperLogDetailVO>>[] = [
  { prop: 'id', label: '日志ID', className: 'font-mono-data' },
  { prop: 'traceId', label: 'TraceId' },
  { prop: 'module', label: '操作模块' },
  { prop: 'operateType', label: '操作类型', dictCode: 'operateType' },
  { prop: 'requestMethod', label: '请求方式', className: 'font-mono-data' },
  { prop: 'requestUrl', label: '请求路径', className: 'font-mono-data' },
  // AtengDescriptions 在主 prop 为空时会跳过 formatter 直接渲染 '--'，故以下复合字段改走具名插槽
  { prop: 'userName', label: '操作人员' },
  { prop: 'clientIp', label: '客户端 IP', className: 'font-mono-data' },
  { prop: 'operateLocation', label: '操作地点', emptyText: '--' },
  { prop: 'browser', label: '浏览器 / 系统' },
  {
    prop: 'costTime',
    label: '执行耗时',
    className: 'tabular-nums',
    formatter: val => (typeof val === 'number' ? `${val} ms` : '--'),
  },
  { prop: 'status', label: '执行状态', dictCode: 'logStatus' },
  { prop: 'operateTime', label: '操作时间', span: 2, className: 'tabular-nums' },
  { prop: 'description', label: '操作描述', span: 2, emptyText: '--' },
];

interface PayloadPanelConfig {
  key: 'requestParams' | 'responseResult' | 'extraJson';
  title: string;
  testId: string;
  raw: string | null | undefined;
  formatted: string;
}

const payloadPanels = computed<PayloadPanelConfig[]>(() => {
  const req = formatAuditPayload(detail.requestParams);
  const res = formatAuditPayload(detail.responseResult);
  const panels: PayloadPanelConfig[] = [
    {
      key: 'requestParams',
      title: '请求参数（已脱敏）',
      testId: 'oper-log-req-params',
      raw: detail.requestParams,
      formatted: req.formatted,
    },
    {
      key: 'responseResult',
      title: '响应结果',
      testId: 'oper-log-res-result',
      raw: detail.responseResult,
      formatted: res.formatted,
    },
  ];
  if (detail.extraJson?.trim()) {
    const extra = formatAuditPayload(detail.extraJson);
    panels.push({
      key: 'extraJson',
      title: '扩展信息',
      testId: 'oper-log-extra-json',
      raw: detail.extraJson,
      formatted: extra.formatted,
    });
  }
  return panels;
});

function clearDetailState(): void {
  resetDialogState();
  Object.keys(detail).forEach(key => {
    delete detail[key as keyof OperLogDetailVO];
  });
  expandedPanels.requestParams = false;
  expandedPanels.responseResult = false;
  expandedPanels.extraJson = false;
}

async function loadOperLogDetail(): Promise<void> {
  clearDetailState();
  const targetId = props.logId?.trim();
  if (!targetId) {
    return;
  }
  await runDetailLoad({
    loader: () => getOperLogDetail(targetId),
    onLoaded: data => {
      Object.assign(detail, data);
    },
    errorFallback: '加载操作日志详情失败，请关闭重试',
  });
}

watch(
  () => [props.modelValue, props.logId] as const,
  ([opened]) => {
    if (opened) {
      void loadOperLogDetail();
    } else {
      clearDetailState();
    }
  },
);
</script>

<template>
  <AtengDrawer
    v-model="visible"
    title="操作审计日志详情"
    size="720px"
    :show-confirm="false"
    cancel-text="关闭"
  >
    <div v-loading="detailLoading" data-testid="oper-log-detail-body" class="flex flex-col gap-4">
      <div
        v-if="submitError"
        data-testid="oper-log-detail-error"
        role="alert"
        class="flex items-center gap-2 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2 text-[13px] text-[var(--solid-danger)]"
      >
        <el-icon :size="15"><Warning /></el-icon>
        <span>{{ submitError }}</span>
      </div>

      <AtengDescriptions
        v-if="hasLoadedDetail"
        :data="detail"
        :items="detailItems"
        :column="2"
        border
        empty-text="--"
      >
        <template #traceId="{ value }">
          <span class="inline-flex items-center gap-1.5">
            <span class="font-mono-data">{{ value || '--' }}</span>
            <el-button
              v-if="detail.traceId"
              data-testid="oper-log-copy-trace"
              type="primary"
              link
              size="small"
              :icon="CopyDocument"
              @click="copyAuditText(detail.traceId, 'TraceId')"
            >
              复制
            </el-button>
          </span>
        </template>
        <template #userName="{ data }">
          <span>{{ formatAuditOperator(data.userName, data.userId) }}</span>
        </template>
        <template #browser="{ data }">
          <span>{{ formatAuditClientEnv(data.browser, data.os) }}</span>
        </template>
      </AtengDescriptions>

      <div
        v-for="panel in payloadPanels"
        :key="panel.key"
        class="flex flex-col gap-2 rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle p-3"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-ink">{{ panel.title }}</span>
          <div class="flex items-center gap-2">
            <el-button
              v-if="panel.raw?.trim()"
              type="primary"
              link
              size="small"
              :icon="CopyDocument"
              @click="copyAuditText(panel.formatted, panel.title)"
            >
              复制
            </el-button>
            <el-button
              v-if="panel.raw?.trim()"
              type="primary"
              link
              size="small"
              @click="expandedPanels[panel.key] = !expandedPanels[panel.key]"
            >
              {{ expandedPanels[panel.key] ? '收起' : '展开完整' }}
            </el-button>
          </div>
        </div>
        <pre
          :data-testid="panel.testId"
          class="font-mono-data m-0 overflow-auto whitespace-pre-wrap break-all rounded bg-surface p-2.5 text-xs leading-relaxed text-ink-regular"
          :class="expandedPanels[panel.key] ? 'max-h-[480px]' : 'max-h-[240px]'"
          >{{ panel.formatted }}</pre>
      </div>

      <div
        v-if="detail.status === 1 && detail.errorMsg"
        data-testid="oper-log-error-msg"
        role="alert"
        class="flex flex-col gap-1 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2.5 text-[13px] text-[var(--solid-danger)]"
      >
        <div class="flex items-center gap-1.5 font-medium">
          <el-icon :size="15"><Warning /></el-icon>
          <span>失败异常摘要</span>
        </div>
        <p class="m-0 max-h-[160px] overflow-auto whitespace-pre-wrap break-all leading-relaxed">
          {{ detail.errorMsg }}
        </p>
      </div>
    </div>
  </AtengDrawer>
</template>

<style scoped></style>
