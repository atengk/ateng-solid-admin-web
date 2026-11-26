<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElButton, ElFormItem, ElInput, ElSwitch, ElTableColumn, ElTag, ElTooltip } from 'element-plus';
import { Delete, Edit, Key, Plus } from '@element-plus/icons-vue';
import {
  AtengDictSelect,
  AtengDictTag,
  AtengQueryForm,
  AtengTable,
  type AtengTableInstance,
} from '@atengk/element-plus';
import { usePagination } from '@atengk/vue';
import {
  deleteRoles,
  getRolePage,
  updateRoleStatus,
  type RoleQuery,
  type RoleVO,
} from '@/api/system/role';
import type { CommonStatus } from '@/api/types';
import { runConfirmedAction } from '@/composables/useConfirmAction';
import {
  QUERY_COLS_THREE_ITEMS,
  useListTableLayout,
} from '@/composables/useListTableLayout';
import { useAuthStore } from '@/stores/auth';
import { withDictPreload } from '@/utils/dict';
import RoleDataScopeDialog from '@/views/system/role/components/RoleDataScopeDialog.vue';
import RoleFormDrawer from '@/views/system/role/components/RoleFormDrawer.vue';
import { isProtectedRole, ROLE_PROTECTED_TOOLTIP } from '@/views/system/role/roleHelper';

/**
 * 角色管理视图（/system/role）：
 * 实现分页检索、super_admin 平台内置硬保护、菜单授权抽屉与 5 级 @DataScope 数据权限分配弹窗。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysRole' });

const STORAGE_KEY = 'solid:table:sys-role';

const authStore = useAuthStore();
const { tableAutoHeight, tableAutoHeightMode } = useListTableLayout();
const tableRef = ref<AtengTableInstance<RoleVO>>();
const pagination = usePagination<RoleVO, RoleQuery>(
  params => withDictPreload(['dataScopeType'], () => getRolePage(params)),
  { defaultSize: 10 },
);
const selectedRows = ref<RoleVO[]>([]);
const statusUpdatingId = ref<string>('');

const formDrawerVisible = ref<boolean>(false);
const formDrawerMode = ref<'create' | 'edit'>('create');
const editingRoleId = ref<string | undefined>(undefined);
const dataScopeVisible = ref<boolean>(false);
const dataScopeRoleId = ref<string | undefined>(undefined);

const canUpdateRole = computed<boolean>(() => authStore.hasPermission('system:role:update'));
const hasRowActions = computed<boolean>(() =>
  authStore.hasPermission(['system:role:update', 'system:role:delete']),
);
const asRoleRow = (row: unknown): RoleVO => row as RoleVO;
const isRowSelectable = (row: unknown): boolean => !isProtectedRole(asRoleRow(row));

function clearTableSelection(): void {
  selectedRows.value = [];
  tableRef.value?.clearSelection?.();
}

function openCreateDrawer(): void {
  formDrawerMode.value = 'create';
  editingRoleId.value = undefined;
  formDrawerVisible.value = true;
}

function openEditDrawer(row: RoleVO): void {
  if (isProtectedRole(row)) {
    return;
  }
  formDrawerMode.value = 'edit';
  editingRoleId.value = row.id;
  formDrawerVisible.value = true;
}

function openDataScopeDialog(row: RoleVO): void {
  if (isProtectedRole(row)) {
    return;
  }
  dataScopeRoleId.value = row.id;
  dataScopeVisible.value = true;
}

async function handleToggleStatus(row: RoleVO): Promise<void> {
  if (!canUpdateRole.value || isProtectedRole(row) || statusUpdatingId.value === row.id) {
    return;
  }
  const nextStatus: CommonStatus = row.status === 0 ? 1 : 0;
  const actionText = nextStatus === 0 ? '启用' : '停用';

  statusUpdatingId.value = row.id;
  try {
    await runConfirmedAction({
      message: `确认要${actionText}角色【${row.roleName}】吗？`,
      title: '操作确认',
      confirmButtonText: `确认${actionText}`,
      successMessage: `已${actionText}角色【${row.roleName}】`,
      errorFallback: `${actionText}角色失败，请稍后重试`,
      execute: () => updateRoleStatus(row.id, nextStatus),
      onSuccess: async () => {
        await pagination.refresh();
      },
    });
  } finally {
    statusUpdatingId.value = '';
  }
}

function confirmAndDelete(targetIds: string | string[], confirmMessage: string, successMessage: string): void {
  void runConfirmedAction({
    message: confirmMessage,
    title: '删除确认',
    confirmButtonText: '确认删除',
    successMessage,
    errorFallback: '删除角色失败，请确认是否仍有关联用户',
    execute: () => deleteRoles(targetIds),
    onSuccess: async () => {
      clearTableSelection();
      await pagination.refresh();
    },
  });
}

function handleDeleteSingle(row: RoleVO): void {
  if (isProtectedRole(row)) {
    return;
  }
  confirmAndDelete(row.id, `确认删除角色【${row.roleName}】（编码：${row.roleKey}）吗？`, `已删除角色【${row.roleName}】`);
}

function handleBatchDelete(): void {
  const deletableIds = selectedRows.value.filter(item => !isProtectedRole(item)).map(item => item.id);
  if (deletableIds.length === 0) {
    return;
  }
  confirmAndDelete(deletableIds, `确认批量删除已选中的 ${deletableIds.length} 个角色吗？`, `已删除选中的 ${deletableIds.length} 个角色`);
}

async function handleSaved(): Promise<void> {
  clearTableSelection();
  await pagination.refresh();
}
</script>

<template>
  <section data-testid="sys-role-page" class="flex flex-col gap-3">
    <AtengTable
      ref="tableRef"
      v-model:selected-rows="selectedRows"
      :pagination="pagination"
      row-key="id"
      :storage-key="STORAGE_KEY"
      :show-batch-bar="false"
      :auto-height="tableAutoHeight"
      :auto-height-mode="tableAutoHeightMode"
      empty-description="暂无角色数据，可点击上方“新增角色”创建"
      search-empty-description="未检索到匹配的角色信息"
    >
      <template #query>
        <AtengQueryForm
          :model="pagination.query"
          :cols="QUERY_COLS_THREE_ITEMS"
          :default-collapsed="false"
          :show-collapse="false"
        >
          <el-form-item label="角色名称" prop="roleName">
            <el-input v-model="pagination.query.roleName" data-testid="role-query-name" clearable placeholder="请输入角色名称" />
          </el-form-item>
          <el-form-item label="角色编码" prop="roleKey">
            <el-input v-model="pagination.query.roleKey" data-testid="role-query-key" clearable class="font-mono-data" placeholder="请输入角色编码" />
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <AtengDictSelect v-model="pagination.query.status" data-testid="role-query-status" dict-code="commonStatus" value-type="number" placeholder="全部状态" />
          </el-form-item>
        </AtengQueryForm>
      </template>

      <template #toolbar-left>
        <el-button v-permission="'system:role:create'" data-testid="role-add-btn" type="primary" :icon="Plus" @click="openCreateDrawer">
          新增角色
        </el-button>
        <el-button
          v-permission="'system:role:delete'"
          data-testid="role-batch-delete-btn"
          type="danger"
          plain
          :disabled="selectedRows.length === 0"
          :icon="Delete"
          @click="handleBatchDelete"
        >
          批量删除{{ selectedRows.length > 0 ? ` (${selectedRows.length})` : '' }}
        </el-button>
      </template>

      <el-table-column type="selection" width="48" align="center" :selectable="isRowSelectable" />
      <el-table-column prop="roleName" label="角色名称" min-width="150" show-overflow-tooltip />
      <el-table-column prop="roleKey" label="角色编码" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="inline-flex items-center gap-1.5">
            <span class="font-mono-data text-ink">{{ asRoleRow(row).roleKey }}</span>
            <el-tag v-if="isProtectedRole(asRoleRow(row))" :data-testid="`role-builtin-badge-${asRoleRow(row).id}`" size="small" type="primary">
              平台内置
            </el-tag>
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="dataScope" label="数据范围" min-width="150">
        <template #default="{ row }">
          <AtengDictTag dict-code="dataScopeType" :value="asRoleRow(row).dataScope" />
        </template>
      </el-table-column>

      <el-table-column prop="sort" label="排序" width="82" align="center">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asRoleRow(row).sort }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="96" align="center">
        <template #default="{ row }">
          <el-tooltip :content="ROLE_PROTECTED_TOOLTIP" :disabled="!isProtectedRole(asRoleRow(row))" placement="top">
            <span>
              <el-switch
                :data-testid="`role-status-switch-${asRoleRow(row).id}`"
                :model-value="asRoleRow(row).status === 0"
                :disabled="!canUpdateRole || isProtectedRole(asRoleRow(row))"
                :loading="statusUpdatingId === asRoleRow(row).id"
                inline-prompt
                active-text="启用"
                inactive-text="停用"
                @change="handleToggleStatus(asRoleRow(row))"
              />
            </span>
          </el-tooltip>
        </template>
      </el-table-column>

      <el-table-column prop="createTime" label="创建时间" width="175">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asRoleRow(row).createTime || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column v-if="hasRowActions" label="操作" width="210" fixed="right" align="center">
        <template #default="{ row }">
          <el-tooltip :content="ROLE_PROTECTED_TOOLTIP" :disabled="!isProtectedRole(asRoleRow(row))" placement="top">
            <div class="inline-flex items-center justify-center gap-1">
              <el-button
                v-permission="'system:role:update'"
                :data-testid="`role-edit-btn-${asRoleRow(row).id}`"
                type="primary"
                link
                size="small"
                :disabled="isProtectedRole(asRoleRow(row))"
                :icon="Edit"
                @click="openEditDrawer(asRoleRow(row))"
              >
                编辑
              </el-button>
              <el-button
                v-permission="'system:role:update'"
                :data-testid="`role-scope-btn-${asRoleRow(row).id}`"
                type="primary"
                link
                size="small"
                :disabled="isProtectedRole(asRoleRow(row))"
                :icon="Key"
                @click="openDataScopeDialog(asRoleRow(row))"
              >
                数据权限
              </el-button>
              <el-button
                v-permission="'system:role:delete'"
                :data-testid="`role-delete-btn-${asRoleRow(row).id}`"
                type="danger"
                link
                size="small"
                :disabled="isProtectedRole(asRoleRow(row))"
                :icon="Delete"
                @click="handleDeleteSingle(asRoleRow(row))"
              >
                删除
              </el-button>
            </div>
          </el-tooltip>
        </template>
      </el-table-column>
    </AtengTable>

    <RoleFormDrawer v-model="formDrawerVisible" :mode="formDrawerMode" :role-id="editingRoleId" @saved="handleSaved" />
    <RoleDataScopeDialog v-model="dataScopeVisible" :role-id="dataScopeRoleId" @saved="handleSaved" />
  </section>
</template>

<style scoped></style>
