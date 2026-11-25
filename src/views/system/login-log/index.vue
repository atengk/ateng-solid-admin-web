<script setup lang="ts">
import { ElFormItem, ElInput, ElTableColumn, ElTag } from 'element-plus';
import {
  AtengDateRange,
  AtengDictSelect,
  AtengDictTag,
  AtengQueryForm,
  AtengTable,
} from '@atengk/element-plus';
import { usePagination } from '@atengk/vue';
import { getLoginLogPage, type LoginLogQuery, type LoginLogVO } from '@/api/system/log';
import AuditTraceCell from '@/views/system/log/components/AuditTraceCell.vue';
import {
  buildAuditTimeShortcuts,
  createTimeRangeBinding,
  DEFAULT_AUDIT_PICKER_TIME,
  resetAuditDateRange,
} from '@/views/system/log/logHelper';

/**
 * 登录审计日志严格只读视图（/system/login-log，keepAlive: false）：
 * 展示全量登录轨迹、客户端环境、失败锁号提示与 TraceId 复制，无任何增删改或导出操作。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysLoginLog' });

const STORAGE_KEY = 'solid:table:sys-login-log';
const QUERY_FORM_COLS = { xs: 1, sm: 2, md: 3, lg: 4, xl: 4 } as const;

const pagination = usePagination<LoginLogVO, LoginLogQuery>(getLoginLogPage, {
  defaultSize: 10,
  defaultParams: {
    beginTime: undefined,
    endTime: undefined,
  },
});

const timeRange = createTimeRangeBinding(pagination.query);
const timeShortcuts = buildAuditTimeShortcuts();

function asLoginLogRow(row: unknown): LoginLogVO {
  return row as LoginLogVO;
}

function handleQueryReset(): void {
  resetAuditDateRange(pagination.query);
}
</script>

<template>
  <section data-testid="sys-login-log-page" class="flex flex-col gap-3">
    <AtengTable
      :pagination="pagination"
      row-key="id"
      :storage-key="STORAGE_KEY"
      empty-description="暂无登录审计日志记录"
      search-empty-description="未检索到匹配的登录审计日志"
    >
      <template #query>
        <AtengQueryForm
          :model="pagination.query"
          :cols="QUERY_FORM_COLS"
          :default-collapsed="true"
          :collapsed-rows="1"
          @reset="handleQueryReset"
        >
          <el-form-item label="登录账号" prop="username">
            <el-input
              v-model="pagination.query.username"
              data-testid="login-log-query-username"
              clearable
              placeholder="请输入登录账号"
            />
          </el-form-item>
          <el-form-item label="客户端 IP" prop="clientIp">
            <el-input
              v-model="pagination.query.clientIp"
              data-testid="login-log-query-ip"
              clearable
              class="font-mono-data"
              placeholder="请输入客户端 IP"
            />
          </el-form-item>
          <el-form-item label="登录状态" prop="status">
            <AtengDictSelect
              v-model="pagination.query.status"
              data-testid="login-log-query-status"
              dict-code="logStatus"
              value-type="number"
              placeholder="全部状态"
            />
          </el-form-item>
          <el-form-item label="TraceId" prop="traceId">
            <el-input
              v-model="pagination.query.traceId"
              data-testid="login-log-query-trace"
              clearable
              class="font-mono-data"
              placeholder="精确匹配 TraceId"
            />
          </el-form-item>
          <el-form-item label="登录时间" prop="beginTime">
            <AtengDateRange
              v-model="timeRange"
              data-testid="login-log-query-time"
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
          <span class="font-mono-data text-ink-secondary">{{ asLoginLogRow(row).id }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="traceId" label="TraceId" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <AuditTraceCell
            :trace-id="asLoginLogRow(row).traceId"
            :test-id="`login-log-table-copy-${asLoginLogRow(row).id}`"
          />
        </template>
      </el-table-column>

      <el-table-column prop="username" label="登录账号" min-width="130" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="font-mono-data">{{ asLoginLogRow(row).username || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="loginType" label="登录体系" width="96" align="center">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ asLoginLogRow(row).loginType || '--' }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="clientIp" label="客户端 IP" width="136">
        <template #default="{ row }">
          <span class="font-mono-data tabular-nums">{{ asLoginLogRow(row).clientIp || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="loginLocation" label="登录地点" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ asLoginLogRow(row).loginLocation || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="browser" label="浏览器" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ asLoginLogRow(row).browser || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="os" label="操作系统" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ asLoginLogRow(row).os || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="登录状态" width="96" align="center">
        <template #default="{ row }">
          <AtengDictTag dict-code="logStatus" :value="asLoginLogRow(row).status" />
        </template>
      </el-table-column>

      <el-table-column prop="msg" label="提示消息" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="text-ink-secondary">{{ asLoginLogRow(row).msg || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="loginTime" label="登录时间" width="175">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asLoginLogRow(row).loginTime || '--' }}</span>
        </template>
      </el-table-column>
    </AtengTable>
  </section>
</template>

<style scoped></style>
