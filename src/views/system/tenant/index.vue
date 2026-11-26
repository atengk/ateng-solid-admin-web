<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue';
import { ElButton, ElFormItem, ElInput, ElOption, ElSelect, ElSwitch, ElTableColumn, ElTag, ElTooltip } from 'element-plus';
import { Delete, Edit, Plus } from '@element-plus/icons-vue';
import { AtengDictSelect, AtengQueryForm, AtengTable, type AtengTableInstance } from '@atengk/element-plus';
import { usePagination } from '@atengk/vue';
import {
  deleteTenants,
  getTenantPage,
  updateTenantStatus,
  type CreateTenantVO,
  type TenantQuery,
  type TenantVO,
} from '@/api/system/tenant';
import { getTenantPackageOptions, type TenantPackageOptionVO } from '@/api/system/tenant-package';
import type { CommonStatus } from '@/api/types';
import { runConfirmedAction } from '@/composables/useConfirmAction';
import { useListTableLayout } from '@/composables/useListTableLayout';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';
import TenantFormDrawer from '@/views/system/tenant/components/TenantFormDrawer.vue';
import TenantInitCredentialDialog from '@/views/system/tenant/components/TenantInitCredentialDialog.vue';
import {
  formatTenantQuotaSummary,
  isProtectedPlatformTenant,
  resolveTenantExpireStatus,
  TENANT_PROTECTED_TOOLTIP,
  type TenantExpireStatus,
  type TenantQuotaSummary,
} from '@/views/system/tenant/tenantHelper';

/**
 * SaaS 多租户管理视图（/system/tenant，仅多租户开启且平台租户 0 可访问）：
 * 实现租户分页检索、0 号默认租户绝对保护、配额与有效期状态渲染、原子初始化凭据回显及停用/删除强退会话警示。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysTenant' });

const STORAGE_KEY = 'solid:table:sys-tenant';

const authStore = useAuthStore();
const tenantStore = useTenantStore();
const { tableAutoHeight, tableAutoHeightMode } = useListTableLayout();
const tableRef = ref<AtengTableInstance<TenantVO>>();
const pagination = usePagination<TenantVO, TenantQuery>(getTenantPage, { defaultSize: 10 });
const selectedRows = ref<TenantVO[]>([]);
const packageOptions = ref<TenantPackageOptionVO[]>([]);
const statusUpdatingId = ref<string>('');

const formDrawerVisible = ref<boolean>(false);
const formDrawerMode = ref<'create' | 'edit'>('create');
const editingTenantId = ref<string | undefined>(undefined);
const initCredentialVisible = ref<boolean>(false);
const createdCredential = ref<CreateTenantVO | null>(null);

const canUpdateTenant = computed<boolean>(() => authStore.hasPermission('system:tenant:update'));
const hasRowActions = computed<boolean>(() =>
  authStore.hasPermission(['system:tenant:update', 'system:tenant:delete']),
);
const asTenantRow = (row: unknown): TenantVO => row as TenantVO;
const isRowSelectable = (row: unknown): boolean => !isProtectedPlatformTenant(asTenantRow(row));
const getQuotaCell = (row: unknown): TenantQuotaSummary => {
  const tenant = asTenantRow(row);
  return formatTenantQuotaSummary(tenant.usedAccountCount, tenant.accountCount);
};
const getExpireStatus = (row: unknown): TenantExpireStatus => {
  const tenant = asTenantRow(row);
  return resolveTenantExpireStatus(tenant.expireTime, undefined, tenant.expired);
};

async function loadPackageOptions(): Promise<void> {
  try {
    packageOptions.value = await getTenantPackageOptions();
  } catch {
    packageOptions.value = [];
  }
}

function syncTenantSwitcherOptions(): void {
  if (!tenantStore.isSuperAdminTenantSwitchAllowed) {
    return;
  }
  void tenantStore.loadTenantOptions().catch(() => undefined);
}

let hasActivatedOnce = false;

onMounted(() => {
  void loadPackageOptions();
});

onActivated(() => {
  if (!hasActivatedOnce) {
    hasActivatedOnce = true;
    return;
  }
  // KeepAlive 切回租户页时同步重拉套餐下拉与列表，避免跨页编辑套餐/用户后配额或套餐展示过期
  void loadPackageOptions();
  void pagination.refresh();
});

function clearTableSelection(): void {
  selectedRows.value = [];
  tableRef.value?.clearSelection?.();
}

function openCreateDrawer(): void {
  formDrawerMode.value = 'create';
  editingTenantId.value = undefined;
  formDrawerVisible.value = true;
}

function openEditDrawer(row: TenantVO): void {
  formDrawerMode.value = 'edit';
  editingTenantId.value = row.id;
  formDrawerVisible.value = true;
}

async function handleToggleStatus(row: TenantVO): Promise<void> {
  if (!canUpdateTenant.value || isProtectedPlatformTenant(row) || statusUpdatingId.value === row.id) {
    return;
  }
  const nextStatus: CommonStatus = row.status === 0 ? 1 : 0;
  const actionText = nextStatus === 0 ? '启用' : '停用';
  const confirmMessage =
    nextStatus === 1
      ? `停用租户【${row.tenantName}】（编码：${row.tenantCode}）后，该租户下所有在线账号将被立即强制下线且无法再登录，确认执行？`
      : `确认启用租户【${row.tenantName}】（编码：${row.tenantCode}）吗？`;

  statusUpdatingId.value = row.id;
  try {
    await runConfirmedAction({
      message: confirmMessage,
      title: `${actionText}确认`,
      confirmButtonText: `确认${actionText}`,
      successMessage: nextStatus === 1 ? `已停用租户【${row.tenantName}】并强制下线其在线会话` : `已启用租户【${row.tenantName}】`,
      errorFallback: `${actionText}租户失败，请稍后重试`,
      execute: () => updateTenantStatus(row.id, nextStatus),
      onSuccess: async () => {
        await pagination.refresh();
        syncTenantSwitcherOptions();
      },
    });
  } finally {
    statusUpdatingId.value = '';
  }
}

function confirmAndDelete(targetIds: string | string[], confirmMessage: string, successMessage: string): void {
  void runConfirmedAction({
    message: confirmMessage,
    title: '删除租户确认',
    confirmButtonText: '确认删除',
    successMessage,
    errorFallback: '删除租户失败，请稍后重试',
    execute: () => deleteTenants(targetIds),
    onSuccess: async () => {
      clearTableSelection();
      await pagination.refresh();
      syncTenantSwitcherOptions();
    },
  });
}

function handleDeleteSingle(row: TenantVO): void {
  if (isProtectedPlatformTenant(row)) {
    return;
  }
  confirmAndDelete(
    row.id,
    `删除租户【${row.tenantName}】（编码：${row.tenantCode}）后，该租户下所有在线账号将被立即强制下线且无法再登录，确认删除？`,
    `已删除租户【${row.tenantName}】并强退关联在线会话`,
  );
}

function handleBatchDelete(): void {
  const deletableIds = selectedRows.value.filter(item => !isProtectedPlatformTenant(item)).map(item => item.id);
  if (deletableIds.length === 0) {
    return;
  }
  confirmAndDelete(
    deletableIds,
    `确认删除选中的 ${deletableIds.length} 个业务租户？删除后关联租户下所有在线账号将被立即强制下线且无法再登录。`,
    `已删除选中的 ${deletableIds.length} 个业务租户`,
  );
}

async function handleDrawerSaved(): Promise<void> {
  clearTableSelection();
  await pagination.refresh();
  syncTenantSwitcherOptions();
}

async function handleTenantCreated(payload: CreateTenantVO): Promise<void> {
  createdCredential.value = payload;
  initCredentialVisible.value = true;
  clearTableSelection();
  await pagination.refresh();
  syncTenantSwitcherOptions();
}
</script>

<template>
  <section data-testid="sys-tenant-page" class="flex flex-col gap-3">
    <AtengTable
      ref="tableRef"
      v-model:selected-rows="selectedRows"
      :pagination="pagination"
      row-key="id"
      :storage-key="STORAGE_KEY"
      :show-batch-bar="false"
      :auto-height="tableAutoHeight"
      :auto-height-mode="tableAutoHeightMode"
      empty-description="暂无租户数据，可点击上方“新增租户”初始化"
      search-empty-description="未检索到匹配的租户信息"
    >
      <template #query>
        <AtengQueryForm :model="pagination.query" :default-collapsed="true" :collapsed-rows="1">
          <el-form-item label="租户编码" prop="tenantCode">
            <el-input v-model="pagination.query.tenantCode" data-testid="tenant-query-code" clearable class="font-mono-data" placeholder="如 000000 / 100002" />
          </el-form-item>
          <el-form-item label="租户名称" prop="tenantName">
            <el-input v-model="pagination.query.tenantName" data-testid="tenant-query-name" clearable placeholder="请输入租户名称" />
          </el-form-item>
          <el-form-item label="租户状态" prop="status">
            <AtengDictSelect v-model="pagination.query.status" data-testid="tenant-query-status" dict-code="commonStatus" value-type="number" placeholder="全部状态" />
          </el-form-item>
          <el-form-item label="所属套餐" prop="packageId">
            <el-select v-model="pagination.query.packageId" data-testid="tenant-query-package" clearable filterable placeholder="全部套餐">
              <el-option v-for="item in packageOptions" :key="item.id" :label="item.packageName" :value="item.id" />
            </el-select>
          </el-form-item>
        </AtengQueryForm>
      </template>

      <template #toolbar-left>
        <el-button v-permission="'system:tenant:create'" data-testid="tenant-add-btn" type="primary" :icon="Plus" @click="openCreateDrawer">
          新增租户
        </el-button>
        <el-button v-permission="'system:tenant:delete'" data-testid="tenant-batch-delete-btn" type="danger" plain :disabled="selectedRows.length === 0" :icon="Delete" @click="handleBatchDelete">
          批量删除{{ selectedRows.length > 0 ? ` (${selectedRows.length})` : '' }}
        </el-button>
      </template>

      <el-table-column type="selection" width="48" align="center" :selectable="isRowSelectable" />

      <el-table-column prop="id" label="租户 ID" min-width="155" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="font-mono-data text-ink-secondary">{{ asTenantRow(row).id }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="tenantCode" label="租户编码" min-width="175" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="inline-flex items-center gap-1.5">
            <span class="font-mono-data text-ink">{{ asTenantRow(row).tenantCode }}</span>
            <el-tag v-if="isProtectedPlatformTenant(asTenantRow(row))" size="small" type="primary">平台默认</el-tag>
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="tenantName" label="租户名称" min-width="160" show-overflow-tooltip />

      <el-table-column prop="packageName" label="关联套餐" min-width="175" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tag v-if="isProtectedPlatformTenant(asTenantRow(row))" size="small" type="info">平台全量免限</el-tag>
          <span v-else class="inline-flex items-center gap-1.5">
            <span>{{ asTenantRow(row).packageName?.trim() || '--' }}</span>
            <el-tag v-if="asTenantRow(row).packageDisabled" size="small" type="warning">已停用</el-tag>
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="accountCount" label="用户配额" min-width="135" align="center">
        <template #default="{ row }">
          <span class="inline-flex items-center gap-1 tabular-nums">
            <span :class="getQuotaCell(row).full ? 'font-medium text-warning' : ''">{{ getQuotaCell(row).text }}</span>
            <el-tag v-if="getQuotaCell(row).full" size="small" type="warning">已满额</el-tag>
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="expireTime" label="过期时间" min-width="210">
        <template #default="{ row }">
          <span v-if="getExpireStatus(row) === 'permanent'" class="text-ink-secondary">永久有效</span>
          <span v-else class="inline-flex items-center gap-1.5 tabular-nums">
            <span>{{ asTenantRow(row).expireTime }}</span>
            <el-tag v-if="getExpireStatus(row) === 'expired'" size="small" type="danger">已过期</el-tag>
            <el-tag v-else-if="getExpireStatus(row) === 'expiring'" size="small" type="warning">即将到期</el-tag>
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="96" align="center">
        <template #default="{ row }">
          <el-tooltip :content="TENANT_PROTECTED_TOOLTIP" :disabled="!isProtectedPlatformTenant(asTenantRow(row))" placement="top">
            <span>
              <el-switch
                :data-testid="`tenant-status-switch-${asTenantRow(row).id}`"
                :model-value="asTenantRow(row).status === 0"
                :disabled="!canUpdateTenant || isProtectedPlatformTenant(asTenantRow(row))"
                :loading="statusUpdatingId === asTenantRow(row).id"
                inline-prompt
                active-text="启用"
                inactive-text="停用"
                @change="handleToggleStatus(asTenantRow(row))"
              />
            </span>
          </el-tooltip>
        </template>
      </el-table-column>

      <el-table-column prop="createTime" label="创建时间" width="175">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asTenantRow(row).createTime || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column v-if="hasRowActions" label="操作" width="140" fixed="right" align="center">
        <template #default="{ row }">
          <div class="inline-flex items-center justify-center gap-1">
            <el-button v-permission="'system:tenant:update'" :data-testid="`tenant-edit-btn-${asTenantRow(row).id}`" type="primary" link size="small" :icon="Edit" @click="openEditDrawer(asTenantRow(row))">
              编辑
            </el-button>
            <el-tooltip :content="TENANT_PROTECTED_TOOLTIP" :disabled="!isProtectedPlatformTenant(asTenantRow(row))" placement="top">
              <span>
                <el-button v-permission="'system:tenant:delete'" :data-testid="`tenant-delete-btn-${asTenantRow(row).id}`" type="danger" link size="small" :disabled="isProtectedPlatformTenant(asTenantRow(row))" :icon="Delete" @click="handleDeleteSingle(asTenantRow(row))">
                  删除
                </el-button>
              </span>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>
    </AtengTable>

    <TenantFormDrawer v-model="formDrawerVisible" :mode="formDrawerMode" :tenant-id="editingTenantId" @saved="handleDrawerSaved" @created="handleTenantCreated" />
    <TenantInitCredentialDialog v-model="initCredentialVisible" :credential="createdCredential" />
  </section>
</template>

<style scoped></style>
