<script setup lang="ts">
import { computed, onActivated, ref } from 'vue';
import { ElButton, ElFormItem, ElInput, ElSwitch, ElTableColumn, ElTag } from 'element-plus';
import { Delete, Edit, Plus } from '@element-plus/icons-vue';
import {
  AtengDictSelect,
  AtengQueryForm,
  AtengTable,
  type AtengTableInstance,
} from '@atengk/element-plus';
import { usePagination } from '@atengk/vue';
import {
  deleteTenantPackages,
  getTenantPackagePage,
  updateTenantPackageStatus,
  type TenantPackageQuery,
  type TenantPackageVO,
} from '@/api/system/tenant-package';
import type { CommonStatus } from '@/api/types';
import { runConfirmedAction } from '@/composables/useConfirmAction';
import {
  QUERY_COLS_TWO_ITEMS,
  useListTableLayout,
} from '@/composables/useListTableLayout';
import { useAuthStore } from '@/stores/auth';
import PackageFormDrawer from '@/views/system/tenant-package/components/PackageFormDrawer.vue';

/**
 * 租户套餐管理视图（/system/tenant-package，仅多租户开启且平台租户 0 可访问）：
 * 实现套餐分页检索、平台菜单排除抽屉、缩减菜单预览裁剪确认及引用保护删除。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysTenantPackage' });

const STORAGE_KEY = 'solid:table:sys-tenant-package';

const authStore = useAuthStore();
const { tableAutoHeight, tableAutoHeightMode } = useListTableLayout();
const tableRef = ref<AtengTableInstance<TenantPackageVO>>();
const pagination = usePagination<TenantPackageVO, TenantPackageQuery>(getTenantPackagePage, {
  defaultSize: 10,
});
const selectedRows = ref<TenantPackageVO[]>([]);
const statusUpdatingId = ref<string>('');

const formDrawerVisible = ref<boolean>(false);
const formDrawerMode = ref<'create' | 'edit'>('create');
const editingPackageId = ref<string | undefined>(undefined);

const canUpdatePackage = computed<boolean>(() =>
  authStore.hasPermission('system:tenant-package:update'),
);
const hasRowActions = computed<boolean>(() =>
  authStore.hasPermission(['system:tenant-package:update', 'system:tenant-package:delete']),
);
const asPackageRow = (row: unknown): TenantPackageVO => row as TenantPackageVO;

function clearTableSelection(): void {
  selectedRows.value = [];
  tableRef.value?.clearSelection?.();
}

function openCreateDrawer(): void {
  formDrawerMode.value = 'create';
  editingPackageId.value = undefined;
  formDrawerVisible.value = true;
}

function openEditDrawer(row: TenantPackageVO): void {
  formDrawerMode.value = 'edit';
  editingPackageId.value = row.id;
  formDrawerVisible.value = true;
}

async function handleToggleStatus(row: TenantPackageVO): Promise<void> {
  if (!canUpdatePackage.value || statusUpdatingId.value === row.id) {
    return;
  }
  const nextStatus: CommonStatus = row.status === 0 ? 1 : 0;
  const actionText = nextStatus === 0 ? '启用' : '停用';
  const confirmMessage =
    nextStatus === 1
      ? `确认停用套餐【${row.packageName}】吗？停用不影响已绑定存量租户继续运行，仅禁止后续新建或变更租户时新选。`
      : `确认启用套餐【${row.packageName}】吗？`;

  statusUpdatingId.value = row.id;
  try {
    await runConfirmedAction({
      message: confirmMessage,
      title: `${actionText}确认`,
      confirmButtonText: `确认${actionText}`,
      successMessage: `已${actionText}租户套餐【${row.packageName}】`,
      errorFallback: `${actionText}租户套餐失败，请稍后重试`,
      execute: () => updateTenantPackageStatus(row.id, nextStatus),
      onSuccess: async () => {
        await pagination.refresh();
      },
    });
  } finally {
    statusUpdatingId.value = '';
  }
}

function confirmAndDelete(
  targetIds: string | string[],
  confirmMessage: string,
  successMessage: string,
): void {
  void runConfirmedAction({
    message: confirmMessage,
    title: '删除确认',
    confirmButtonText: '确认删除',
    successMessage,
    errorFallback: '删除租户套餐失败，请确认是否仍被租户绑定',
    execute: () => deleteTenantPackages(targetIds),
    onSuccess: async () => {
      clearTableSelection();
      await pagination.refresh();
    },
  });
}

function handleDeleteSingle(row: TenantPackageVO): void {
  confirmAndDelete(
    row.id,
    `确认删除租户套餐【${row.packageName}】吗？若仍被租户绑定将拦截删除。`,
    `已删除租户套餐【${row.packageName}】`,
  );
}

function handleBatchDelete(): void {
  const targetIds = selectedRows.value.map(item => item.id);
  if (targetIds.length === 0) {
    return;
  }
  confirmAndDelete(
    targetIds,
    `确认批量删除已选中的 ${targetIds.length} 个租户套餐吗？`,
    `已删除选中的 ${targetIds.length} 个租户套餐`,
  );
}

async function handleSaved(): Promise<void> {
  clearTableSelection();
  await pagination.refresh();
}

let hasActivatedOnce = false;

onActivated(() => {
  if (!hasActivatedOnce) {
    hasActivatedOnce = true;
    return;
  }
  // KeepAlive 切回套餐页时静默重拉列表，确保跨租户模块 CRUD 后的「绑定租户数」统计一致
  clearTableSelection();
  void pagination.refresh();
});
</script>

<template>
  <section data-testid="sys-tenant-package-page" class="flex flex-col gap-3">
    <AtengTable
      ref="tableRef"
      v-model:selected-rows="selectedRows"
      :pagination="pagination"
      row-key="id"
      :storage-key="STORAGE_KEY"
      :show-batch-bar="false"
      :auto-height="tableAutoHeight"
      :auto-height-mode="tableAutoHeightMode"
      empty-description="暂无租户套餐数据，可点击上方“新增套餐”配置"
      search-empty-description="未检索到匹配的租户套餐"
    >
      <template #query>
        <AtengQueryForm
          :model="pagination.query"
          :cols="QUERY_COLS_TWO_ITEMS"
          :default-collapsed="false"
          :show-collapse="false"
        >
          <el-form-item label="套餐名称" prop="packageName">
            <el-input
              v-model="pagination.query.packageName"
              data-testid="pkg-query-name"
              clearable
              placeholder="请输入套餐名称"
            />
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <AtengDictSelect
              v-model="pagination.query.status"
              data-testid="pkg-query-status"
              dict-code="commonStatus"
              value-type="number"
              placeholder="全部状态"
            />
          </el-form-item>
        </AtengQueryForm>
      </template>

      <template #toolbar-left>
        <el-button
          v-permission="'system:tenant-package:create'"
          data-testid="pkg-add-btn"
          type="primary"
          :icon="Plus"
          @click="openCreateDrawer"
        >
          新增套餐
        </el-button>
        <el-button
          v-permission="'system:tenant-package:delete'"
          data-testid="pkg-batch-delete-btn"
          type="danger"
          plain
          :disabled="selectedRows.length === 0"
          :icon="Delete"
          @click="handleBatchDelete"
        >
          批量删除{{ selectedRows.length > 0 ? ` (${selectedRows.length})` : '' }}
        </el-button>
      </template>

      <el-table-column type="selection" width="48" align="center" />

      <el-table-column prop="packageName" label="套餐名称" min-width="180" show-overflow-tooltip />

      <el-table-column prop="menuCount" label="包含菜单数" width="120" align="center">
        <template #default="{ row }">
          <span class="font-mono-data">{{ asPackageRow(row).menuCount }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="tenantCount" label="绑定租户数" width="130" align="center">
        <template #default="{ row }">
          <el-tag
            v-if="asPackageRow(row).tenantCount > 0"
            size="small"
            type="primary"
            class="tabular-nums"
          >
            {{ asPackageRow(row).tenantCount }} 个租户
          </el-tag>
          <span v-else class="font-mono-data text-ink-secondary">0</span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="96" align="center">
        <template #default="{ row }">
          <el-switch
            :data-testid="`pkg-status-switch-${asPackageRow(row).id}`"
            :model-value="asPackageRow(row).status === 0"
            :disabled="!canUpdatePackage"
            :loading="statusUpdatingId === asPackageRow(row).id"
            inline-prompt
            active-text="启用"
            inactive-text="停用"
            @change="handleToggleStatus(asPackageRow(row))"
          />
        </template>
      </el-table-column>

      <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="text-ink-secondary">{{ asPackageRow(row).remark?.trim() || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="createTime" label="创建时间" width="175">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asPackageRow(row).createTime || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column v-if="hasRowActions" label="操作" width="140" fixed="right" align="center">
        <template #default="{ row }">
          <div class="inline-flex items-center justify-center gap-1">
            <el-button
              v-permission="'system:tenant-package:update'"
              :data-testid="`pkg-edit-btn-${asPackageRow(row).id}`"
              type="primary"
              link
              size="small"
              :icon="Edit"
              @click="openEditDrawer(asPackageRow(row))"
            >
              编辑
            </el-button>
            <el-button
              v-permission="'system:tenant-package:delete'"
              :data-testid="`pkg-delete-btn-${asPackageRow(row).id}`"
              type="danger"
              link
              size="small"
              :icon="Delete"
              @click="handleDeleteSingle(asPackageRow(row))"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
    </AtengTable>

    <PackageFormDrawer
      v-model="formDrawerVisible"
      :mode="formDrawerMode"
      :package-id="editingPackageId"
      @saved="handleSaved"
    />
  </section>
</template>

<style scoped></style>
