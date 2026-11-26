<script setup lang="ts">
import { ref } from 'vue';
import { ElButton, ElFormItem, ElInput, ElTableColumn } from 'element-plus';
import { View } from '@element-plus/icons-vue';
import {
  AtengDateRange,
  AtengDictSelect,
  AtengDictTag,
  AtengQueryForm,
  AtengTable,
} from '@atengk/element-plus';
import { usePagination } from '@atengk/vue';
import { getOperLogPage, type OperLogQuery, type OperLogVO } from '@/api/system/log';
import { useListTableLayout } from '@/composables/useListTableLayout';
import AuditTraceCell from '@/views/system/log/components/AuditTraceCell.vue';
import OperLogDetailDrawer from '@/views/system/oper-log/components/OperLogDetailDrawer.vue';
import {
  buildAuditTimeShortcuts,
  createTimeRangeBinding,
  DEFAULT_AUDIT_PICKER_TIME,
  formatAuditClientEnv,
  resetAuditDateRange,
} from '@/views/system/log/logHelper';

/**
 * 操作审计日志严格只读视图（/system/oper-log，keepAlive: false）：
 * 仅提供按模块、操作人、操作类型、状态、TraceId 与时间区间检索，支持 TraceId 一键复制与 720px 只读详情抽屉。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysOperLog' });

const STORAGE_KEY = 'solid:table:sys-oper-log';
const QUERY_FORM_COLS = { xs: 1, sm: 2, md: 3, lg: 5, xl: 5 } as const;
const { tableAutoHeight, tableAutoHeightMode } = useListTableLayout();

const pagination = usePagination<OperLogVO, OperLogQuery>(getOperLogPage, {
  defaultSize: 10,
  defaultParams: {
    beginTime: undefined,
    endTime: undefined,
  },
});

const timeRange = createTimeRangeBinding(pagination.query);
const timeShortcuts = buildAuditTimeShortcuts();

const detailDrawerVisible = ref<boolean>(false);
const activeLogId = ref<string | undefined>(undefined);

function asOperLogRow(row: unknown): OperLogVO {
  return row as OperLogVO;
}

function openDetailDrawer(row: OperLogVO): void {
  activeLogId.value = row.id;
  detailDrawerVisible.value = true;
}

function handleQueryReset(): void {
  resetAuditDateRange(pagination.query);
}
</script>

<template>
  <section data-testid="sys-oper-log-page" class="flex flex-col gap-3">
    <AtengTable
      :pagination="pagination"
      row-key="id"
      :storage-key="STORAGE_KEY"
      :auto-height="tableAutoHeight"
      :auto-height-mode="tableAutoHeightMode"
      empty-description="暂无操作审计日志记录"
      search-empty-description="未检索到匹配的操作审计日志"
    >
      <template #query>
        <AtengQueryForm
          :model="pagination.query"
          :cols="QUERY_FORM_COLS"
          :default-collapsed="true"
          :collapsed-rows="1"
          @reset="handleQueryReset"
        >
          <el-form-item label="操作模块" prop="module">
            <el-input
              v-model="pagination.query.module"
              data-testid="oper-log-query-module"
              clearable
              placeholder="请输入操作模块"
            />
          </el-form-item>
          <el-form-item label="操作人员" prop="userName">
            <el-input
              v-model="pagination.query.userName"
              data-testid="oper-log-query-user"
              clearable
              placeholder="请输入操作人账号或昵称"
            />
          </el-form-item>
          <el-form-item label="操作类型" prop="operateType">
            <AtengDictSelect
              v-model="pagination.query.operateType"
              data-testid="oper-log-query-type"
              dict-code="operateType"
              value-type="number"
              placeholder="全部类型"
            />
          </el-form-item>
          <el-form-item label="操作状态" prop="status">
            <AtengDictSelect
              v-model="pagination.query.status"
              data-testid="oper-log-query-status"
              dict-code="logStatus"
              value-type="number"
              placeholder="全部状态"
            />
          </el-form-item>
          <el-form-item label="TraceId" prop="traceId">
            <el-input
              v-model="pagination.query.traceId"
              data-testid="oper-log-query-trace"
              clearable
              class="font-mono-data"
              placeholder="精确匹配 TraceId"
            />
          </el-form-item>
          <el-form-item label="操作时间" prop="beginTime">
            <AtengDateRange
              v-model="timeRange"
              :name="['beginTime', 'endTime']"
              data-testid="oper-log-query-time"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始时间"
              end-placeholder="结束时间"
              value-format="YYYY-MM-DD HH:mm:ss"
              format="YYYY-MM-DD HH:mm:ss"
              :default-time="DEFAULT_AUDIT_PICKER_TIME"
              :shortcuts="timeShortcuts"
              clearable
            />
          </el-form-item>
        </AtengQueryForm>
      </template>

      <el-table-column prop="id" label="日志ID" min-width="168" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="font-mono-data text-ink-secondary">{{ asOperLogRow(row).id }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="traceId" label="TraceId" min-width="210">
        <template #default="{ row }">
          <AuditTraceCell
            :trace-id="asOperLogRow(row).traceId"
            :test-id="`oper-log-table-copy-${asOperLogRow(row).id}`"
          />
        </template>
      </el-table-column>

      <el-table-column prop="module" label="操作模块" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ asOperLogRow(row).module || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="operateType" label="操作类型" width="96" align="center">
        <template #default="{ row }">
          <AtengDictTag dict-code="operateType" :value="asOperLogRow(row).operateType" />
        </template>
      </el-table-column>

      <el-table-column
        prop="requestUrl"
        label="请求方式与路径"
        min-width="220"
        show-overflow-tooltip
      >
        <template #default="{ row }">
          <span class="font-mono-data text-ink-secondary">
            {{ asOperLogRow(row).requestMethod || '--' }} {{ asOperLogRow(row).requestUrl || '' }}
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="userName" label="操作人员" min-width="110" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ asOperLogRow(row).userName || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="clientIp" label="客户端 IP" width="136">
        <template #default="{ row }">
          <span class="font-mono-data tabular-nums">{{ asOperLogRow(row).clientIp || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="browser" label="浏览器 / 系统" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ formatAuditClientEnv(asOperLogRow(row).browser, asOperLogRow(row).os) }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="88" align="center">
        <template #default="{ row }">
          <AtengDictTag dict-code="logStatus" :value="asOperLogRow(row).status" />
        </template>
      </el-table-column>

      <el-table-column prop="costTime" label="耗时" width="96" align="right">
        <template #default="{ row }">
          <span class="tabular-nums">
            {{
              typeof asOperLogRow(row).costTime === 'number'
                ? `${asOperLogRow(row).costTime} ms`
                : '--'
            }}
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="operateTime" label="操作时间" width="175">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asOperLogRow(row).operateTime || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="90" fixed="right" align="center">
        <template #default="{ row }">
          <el-button
            :data-testid="`oper-log-detail-btn-${asOperLogRow(row).id}`"
            type="primary"
            link
            size="small"
            :icon="View"
            @click="openDetailDrawer(asOperLogRow(row))"
          >
            详情
          </el-button>
        </template>
      </el-table-column>
    </AtengTable>

    <OperLogDetailDrawer v-model="detailDrawerVisible" :log-id="activeLogId" />
  </section>
</template>

<style scoped></style>
