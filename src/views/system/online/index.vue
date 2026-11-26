<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ElButton,
  ElFormItem,
  ElInput,
  ElMessage,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from 'element-plus';
import { SwitchButton } from '@element-plus/icons-vue';
import { AtengDialog, AtengQueryForm, AtengTable } from '@atengk/element-plus';
import { BusinessException } from '@atengk/core';
import { usePagination } from '@atengk/vue';
import {
  getOnlineSessionPage,
  kickoutOnlineSession,
  type OnlineSessionQuery,
  type OnlineSessionVO,
} from '@/api/auth';

/**
 * 管理端在线会话治理视图（/system/online）：
 * 仅消费服务端脱敏 tokenMask 与不透明 sessionId，严禁自身会话强退，支持 CIDR IP 检索与二次确认强退。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'OnlineSession' });

const MAX_SCAN_LIMIT = 2000;
const EXPIRING_SOON_SECONDS = 300;
const CODE_CANNOT_KICKOUT_SELF = 101007;
const GLOBAL_HANDLED_HTTP_CODES = new Set<number>([401, 403, 429, 100002, 101005, 40003]);
const STORAGE_KEY = 'solid:table:online-session';

const pagination = usePagination<OnlineSessionVO, OnlineSessionQuery>(getOnlineSessionPage, {
  defaultSize: 10,
});

const kickoutDialogVisible = ref<boolean>(false);
const pendingSession = ref<OnlineSessionVO | null>(null);

const isScanCapped = computed<boolean>(() => pagination.total.value >= MAX_SCAN_LIMIT);

function formatRemainingTimeout(seconds: number): string {
  if (seconds < 0) {
    return '长期有效';
  }
  if (seconds === 0) {
    return '即将失效';
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}小时${mins}分`;
  }
  if (mins > 0) {
    return `${mins}分${secs}秒`;
  }
  return `${secs}秒`;
}

function isExpiringSoon(seconds: number): boolean {
  return seconds >= 0 && seconds <= EXPIRING_SOON_SECONDS;
}

function formatDeviceLabel(device?: string | null): string {
  const trimmed = device?.trim();
  const normalized = trimmed?.toLowerCase();
  if (!trimmed || normalized === 'default' || normalized === 'def') {
    return 'PC 网页端';
  }
  return trimmed;
}

function asSessionRow(row: unknown): OnlineSessionVO {
  return row as OnlineSessionVO;
}

function isGlobalHandledError(error: unknown): boolean {
  if (!(error instanceof BusinessException)) {
    return false;
  }
  return GLOBAL_HANDLED_HTTP_CODES.has(error.code) || error.code >= 500 || error.code <= 0;
}

watch(kickoutDialogVisible, visible => {
  if (!visible) {
    pendingSession.value = null;
  }
});

function openKickoutDialog(row: OnlineSessionVO): void {
  if (row.currentSession) {
    return;
  }
  pendingSession.value = row;
  kickoutDialogVisible.value = true;
}

async function handleConfirmKickout(): Promise<boolean> {
  if (!pendingSession.value) {
    return false;
  }
  try {
    await kickoutOnlineSession(pendingSession.value.sessionId);
  } catch (error) {
    if (error instanceof BusinessException && error.code === CODE_CANNOT_KICKOUT_SELF) {
      ElMessage.error(error.msg || '不可强退当前正在使用的会话');
    } else if (!isGlobalHandledError(error)) {
      ElMessage.error(
        error instanceof BusinessException && error.msg
          ? error.msg
          : '强退在线会话失败，请稍后重试',
      );
    }
    return false;
  }

  ElMessage.success('已强退在线会话');
  try {
    await pagination.refresh();
  } catch {
    // 列表刷新异常不阻断强退确认弹窗正常关闭
  }
  return true;
}
</script>

<template>
  <section data-testid="online-session-page" class="flex flex-col gap-3">
    <AtengTable
      :pagination="pagination"
      row-key="sessionId"
      :storage-key="STORAGE_KEY"
      empty-description="当前工作租户暂无其他活跃会话"
      search-empty-description="未检索到匹配的在线会话"
    >
      <template #query>
        <AtengQueryForm :model="pagination.query" :default-collapsed="true" :collapsed-rows="1">
          <el-form-item label="登录账号" prop="username">
            <el-input
              v-model="pagination.query.username"
              data-testid="online-query-username"
              clearable
              placeholder="请输入登录账号"
            />
          </el-form-item>
          <el-form-item label="客户端 IP" prop="clientIp">
            <el-input
              v-model="pagination.query.clientIp"
              data-testid="online-query-ip"
              clearable
              placeholder="支持精确 IP 或 CIDR（如 10.10.2.0/24）"
            />
          </el-form-item>
        </AtengQueryForm>
      </template>

      <template #toolbar-left>
        <div class="flex flex-wrap items-center gap-2 text-xs text-ink-secondary">
          <span class="tabular-nums">活跃会话共 {{ pagination.total.value }} 条</span>
          <el-tag v-if="isScanCapped" type="warning" size="small">
            当前仅展示最近扫描的 2000 条活跃会话，请通过账号或 IP 缩小范围
          </el-tag>
        </div>
      </template>

      <el-table-column prop="tokenMask" label="会话标识" min-width="190">
        <template #default="{ row }">
          <div class="flex items-center gap-1.5">
            <span class="font-mono-data text-ink">{{ asSessionRow(row).tokenMask }}</span>
            <el-tag v-if="asSessionRow(row).currentSession" size="small" type="primary">
              当前会话
            </el-tag>
          </div>
        </template>
      </el-table-column>

      <el-table-column prop="username" label="登录账号" min-width="130">
        <template #default="{ row }">
          <span class="font-mono-data">{{ asSessionRow(row).username }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="nickname" label="用户昵称" min-width="120" show-overflow-tooltip />

      <el-table-column prop="loginDevice" label="登录终端" width="120">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{
            formatDeviceLabel(asSessionRow(row).loginDevice)
          }}</el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="clientIp" label="客户端 IP" min-width="140">
        <template #default="{ row }">
          <span class="font-mono-data">{{ asSessionRow(row).clientIp || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="loginTime" label="登录时间" min-width="175">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asSessionRow(row).loginTime || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="tokenTimeout" label="剩余有效期" width="130">
        <template #default="{ row }">
          <span
            class="tabular-nums"
            :class="
              isExpiringSoon(asSessionRow(row).tokenTimeout)
                ? 'font-medium text-warning'
                : 'text-ink-regular'
            "
          >
            {{ formatRemainingTimeout(asSessionRow(row).tokenTimeout) }}
          </span>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="100" fixed="right" align="center">
        <template #default="{ row }">
          <span
            v-permission="'auth:online:kickout'"
            class="inline-flex items-center justify-center"
          >
            <el-tooltip
              v-if="asSessionRow(row).currentSession"
              content="不可强退当前正在使用的会话"
              placement="top"
            >
              <span>
                <el-button
                  :data-testid="`online-kickout-btn-${asSessionRow(row).sessionId}`"
                  type="danger"
                  link
                  size="small"
                  disabled
                  title="不可强退当前正在使用的会话"
                  :icon="SwitchButton"
                >
                  强退
                </el-button>
              </span>
            </el-tooltip>

            <el-button
              v-else
              :data-testid="`online-kickout-btn-${asSessionRow(row).sessionId}`"
              type="danger"
              link
              size="small"
              :icon="SwitchButton"
              @click="openKickoutDialog(asSessionRow(row))"
            >
              强退
            </el-button>
          </span>
        </template>
      </el-table-column>
    </AtengTable>

    <AtengDialog
      v-model="kickoutDialogVisible"
      title="确认强退在线会话"
      width="480px"
      confirm-text="确认强退"
      :before-confirm="handleConfirmKickout"
    >
      <p v-if="pendingSession" class="m-0 text-sm leading-relaxed text-ink-regular">
        确认将账号【<span class="font-mono-data font-medium text-ink">{{
          pendingSession.username
        }}</span
        >】 （IP:
        <span class="font-mono-data">{{
          pendingSession.clientIp || '--'
        }}</span>）强制下线？下线后该会话需重新登录。
      </p>
    </AtengDialog>
  </section>
</template>

<style scoped></style>
