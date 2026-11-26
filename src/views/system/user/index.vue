<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue';
import {
  ElAvatar,
  ElButton,
  ElFormItem,
  ElInput,
  ElSwitch,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from 'element-plus';
import { Delete, Plus, Upload } from '@element-plus/icons-vue';
import { formatMaskEmail, formatMaskPhone } from '@atengk/core';
import {
  AtengDateRange,
  AtengDictSelect,
  AtengExcelExport,
  AtengQueryForm,
  AtengSplitLayout,
  AtengTable,
  type AtengTableInstance,
} from '@atengk/element-plus';
import { usePagination } from '@atengk/vue';
import { getDeptOptions, type DeptTreeVO } from '@/api/system/dept';
import {
  deleteUsers,
  exportUsers,
  getUserPage,
  updateUserStatus,
  type UserQuery,
  type UserVO,
} from '@/api/system/user';
import type { CommonStatus } from '@/api/types';
import { runConfirmedAction } from '@/composables/useConfirmAction';
import { QUERY_FORM_LOADING_DELAY, useListTableLayout } from '@/composables/useListTableLayout';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';
import UserDeptSidebar from '@/views/system/user/components/UserDeptSidebar.vue';
import UserFormDrawer from '@/views/system/user/components/UserFormDrawer.vue';
import UserImportDialog from '@/views/system/user/components/UserImportDialog.vue';
import UserResetPwdDialog from '@/views/system/user/components/UserResetPwdDialog.vue';
import UserRowActions from '@/views/system/user/components/UserRowActions.vue';
import {
  buildUserExportPayload,
  canSelectUserRow,
  createUserTimeRangeBinding,
  DEFAULT_USER_PICKER_TIME,
  formatUserAvatarInitial,
  PHONE_QUERY_PLACEHOLDER,
  resolveUserRowProtection,
  USER_TIME_SHORTCUTS,
} from '@/views/system/user/userHelper';

/**
 * 用户管理视图（/system/user）：
 * 基于 AtengSplitLayout 左侧部门树子树联动过滤、精确手机号检索、超管与当前用户行保护，
 * 并串联新增/编辑抽屉、强口令重置、批量原子导入反馈及流式导出。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysUser' });

const STACKED_BREAKPOINT_PX = 960;
const SPLIT_STORAGE_KEY = 'solid:split:sys-user';
const TABLE_STORAGE_KEY = 'solid:table:sys-user';

const authStore = useAuthStore();
const tenantStore = useTenantStore();
const tableRef = ref<AtengTableInstance<UserVO>>();
const deptSidebarRef = ref<InstanceType<typeof UserDeptSidebar>>();

const {
  isStacked: isStackedLayout,
  tableAutoHeight,
  tableAutoHeightMode,
} = useListTableLayout({ stackedBreakpoint: STACKED_BREAKPOINT_PX });
const deptTree = ref<DeptTreeVO[]>([]);
const activeDeptFilter = ref<{ id: string; deptName: string } | null>(null);

const pagination = usePagination<UserVO, UserQuery>(getUserPage, {
  defaultSize: 10,
  defaultParams: { deptId: undefined, beginTime: undefined, endTime: undefined },
});
const timeRange = createUserTimeRangeBinding(pagination.query);
const selectedRows = ref<UserVO[]>([]);
const statusUpdatingId = ref<string>('');

const formDrawerVisible = ref<boolean>(false);
const formDrawerMode = ref<'create' | 'edit'>('create');
const editingUserId = ref<string | undefined>(undefined);
const resetPwdVisible = ref<boolean>(false);
const resetPwdTarget = ref<UserVO | null>(null);
const importDialogVisible = ref<boolean>(false);

const currentUserId = computed<string | undefined>(() => authStore.user?.userId);
const canUpdateUser = computed<boolean>(() => authStore.hasPermission('system:user:update'));
const hasRowActions = computed<boolean>(() =>
  authStore.hasPermission(['system:user:update', 'system:user:delete']),
);
const allowPlatformSuperEdit = computed<boolean>(
  () => tenantStore.activeTenantId === '0' && authStore.hasRole('super_admin'),
);
const selectedUserIds = computed<string[]>(() => selectedRows.value.map(item => item.id));

const asUserRow = (row: unknown): UserVO => row as UserVO;
const isRowSelectable = (row: unknown): boolean =>
  canSelectUserRow(asUserRow(row), currentUserId.value);
const rowDisableReason = (row: UserVO): string =>
  resolveUserRowProtection(row, currentUserId.value, allowPlatformSuperEdit.value).disableReason;

function containsDeptNode(nodes: DeptTreeVO[], targetId: string): boolean {
  return nodes.some(
    node =>
      node.id === targetId || (node.children ? containsDeptNode(node.children, targetId) : false),
  );
}

async function loadDeptTree(): Promise<void> {
  try {
    const tree = await getDeptOptions();
    deptTree.value = tree;
    if (activeDeptFilter.value && !containsDeptNode(tree, activeDeptFilter.value.id)) {
      activeDeptFilter.value = null;
      pagination.query.deptId = undefined;
      deptSidebarRef.value?.clearSelection();
    }
  } catch {
    deptTree.value = [];
  }
}

let hasActivatedOnce = false;

onMounted(() => {
  void loadDeptTree();
});

onActivated(() => {
  if (!hasActivatedOnce) {
    hasActivatedOnce = true;
    return;
  }
  // KeepAlive 切回用户页时同步刷新部门树与分页列表，避免跨部门/角色/岗位维护后树或表格陈旧
  void loadDeptTree().then(() => pagination.refresh());
});

function clearTableSelection(): void {
  selectedRows.value = [];
  tableRef.value?.clearSelection?.();
}

function handleDeptSelect(dept: { id: string; deptName: string }): void {
  activeDeptFilter.value = dept;
  pagination.query.deptId = dept.id;
  clearTableSelection();
  void pagination.search({ deptId: dept.id });
}

function clearDeptFilter(triggerSearch = true): void {
  activeDeptFilter.value = null;
  pagination.query.deptId = undefined;
  deptSidebarRef.value?.clearSelection();
  if (triggerSearch) {
    clearTableSelection();
    void pagination.search({ deptId: undefined });
  }
}

function handleQueryReset(): void {
  pagination.query.beginTime = undefined;
  pagination.query.endTime = undefined;
  clearDeptFilter(false);
}

function openCreateDrawer(): void {
  formDrawerMode.value = 'create';
  editingUserId.value = undefined;
  formDrawerVisible.value = true;
}

function openEditDrawer(row: UserVO): void {
  if (!resolveUserRowProtection(row, currentUserId.value, allowPlatformSuperEdit.value).canEdit) {
    return;
  }
  formDrawerMode.value = 'edit';
  editingUserId.value = row.id;
  formDrawerVisible.value = true;
}

function openResetPwdDialog(row: UserVO): void {
  if (!resolveUserRowProtection(row, currentUserId.value).canResetPassword) {
    return;
  }
  resetPwdTarget.value = row;
  resetPwdVisible.value = true;
}

async function handleToggleStatus(row: UserVO): Promise<void> {
  if (
    !canUpdateUser.value ||
    !canSelectUserRow(row, currentUserId.value) ||
    statusUpdatingId.value === row.id
  ) {
    return;
  }
  const nextStatus: CommonStatus = row.status === 0 ? 1 : 0;
  const actionText = nextStatus === 0 ? '启用' : '停用';
  statusUpdatingId.value = row.id;
  try {
    await runConfirmedAction({
      message: `确认要${actionText}用户【${row.nickname}】（账号：${row.username}）吗？`,
      title: '操作确认',
      confirmButtonText: `确认${actionText}`,
      successMessage: `已${actionText}用户【${row.nickname}】`,
      errorFallback: `${actionText}用户失败，请稍后重试`,
      execute: () => updateUserStatus(row.id, nextStatus),
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
    errorFallback: '删除用户失败，请稍后重试',
    execute: () => deleteUsers(targetIds),
    onSuccess: async () => {
      clearTableSelection();
      await pagination.refresh();
    },
  });
}

function handleDeleteSingle(row: UserVO): void {
  if (!canSelectUserRow(row, currentUserId.value)) {
    return;
  }
  confirmAndDelete(
    row.id,
    `确认删除用户【${row.nickname}】（账号：${row.username}）吗？`,
    `已删除用户【${row.nickname}】`,
  );
}

function handleBatchDelete(): void {
  const deletableIds = selectedRows.value
    .filter(item => canSelectUserRow(item, currentUserId.value))
    .map(item => item.id);
  if (deletableIds.length === 0) {
    return;
  }
  confirmAndDelete(
    deletableIds,
    `确认批量删除已选中的 ${deletableIds.length} 位用户吗？`,
    `已删除选中的 ${deletableIds.length} 位用户`,
  );
}

async function handleExportExcel(params: Record<string, unknown>): Promise<Blob> {
  return exportUsers(buildUserExportPayload(params, pagination.query));
}

async function handleTableReload(): Promise<void> {
  clearTableSelection();
  await pagination.refresh();
}
</script>

<template>
  <section
    data-testid="sys-user-page"
    :class="['flex flex-col', isStackedLayout ? 'min-h-[580px]' : 'h-full min-h-0']"
  >
    <AtengSplitLayout
      :storage-key="isStackedLayout ? '' : SPLIT_STORAGE_KEY"
      :direction="isStackedLayout ? 'vertical' : 'horizontal'"
      default-size="230px"
      :min="isStackedLayout ? '150px' : '180px'"
      :max="isStackedLayout ? '55%' : '360px'"
      collapsible
    >
      <template #first>
        <UserDeptSidebar
          ref="deptSidebarRef"
          :dept-tree="deptTree"
          :active-dept-id="activeDeptFilter?.id"
          @select="handleDeptSelect"
          @clear="clearDeptFilter(true)"
        />
      </template>

      <template #second>
        <div class="flex min-w-0 flex-1 flex-col gap-2.5 pl-0 sm:pl-2">
          <AtengTable
            ref="tableRef"
            v-model:selected-rows="selectedRows"
            :pagination="pagination"
            row-key="id"
            :storage-key="TABLE_STORAGE_KEY"
            :show-batch-bar="false"
            :auto-height="tableAutoHeight"
            :auto-height-mode="tableAutoHeightMode"
            empty-description="暂无用户数据，可点击上方“新增用户”或“导入”"
            search-empty-description="未检索到匹配的用户信息"
          >
            <template #query>
              <AtengQueryForm
                :model="pagination.query"
                :default-collapsed="true"
                :collapsed-rows="1"
                :loading-delay="QUERY_FORM_LOADING_DELAY"
                @reset="handleQueryReset"
              >
                <el-form-item label="账号/昵称" prop="username">
                  <el-input
                    v-model="pagination.query.username"
                    data-testid="user-query-username"
                    clearable
                    placeholder="请输入用户账号或昵称"
                  />
                </el-form-item>
                <el-form-item label="手机号码" prop="phone">
                  <el-input
                    v-model="pagination.query.phone"
                    data-testid="user-query-phone"
                    clearable
                    maxlength="11"
                    class="font-mono-data"
                    :placeholder="PHONE_QUERY_PLACEHOLDER"
                  />
                </el-form-item>
                <el-form-item label="账号状态" prop="status">
                  <AtengDictSelect
                    v-model="pagination.query.status"
                    data-testid="user-query-status"
                    dict-code="commonStatus"
                    value-type="number"
                    placeholder="全部状态"
                  />
                </el-form-item>
                <el-form-item label="创建时间" prop="beginTime">
                  <AtengDateRange
                    v-model="timeRange"
                    :name="['beginTime', 'endTime']"
                    data-testid="user-query-time"
                    type="datetimerange"
                    range-separator="至"
                    start-placeholder="开始时间"
                    end-placeholder="结束时间"
                    value-format="YYYY-MM-DD HH:mm:ss"
                    format="YYYY-MM-DD HH:mm:ss"
                    :default-time="DEFAULT_USER_PICKER_TIME"
                    :shortcuts="USER_TIME_SHORTCUTS"
                    clearable
                  />
                </el-form-item>
              </AtengQueryForm>
            </template>

            <template #toolbar-left>
              <div class="flex flex-wrap items-center gap-2">
                <el-button
                  v-permission="'system:user:create'"
                  data-testid="user-add-btn"
                  type="primary"
                  :icon="Plus"
                  @click="openCreateDrawer"
                >
                  新增用户
                </el-button>
                <el-button
                  v-permission="'system:user:delete'"
                  data-testid="user-batch-delete-btn"
                  type="danger"
                  plain
                  :disabled="selectedRows.length === 0"
                  :icon="Delete"
                  @click="handleBatchDelete"
                >
                  批量删除{{ selectedRows.length > 0 ? ` (${selectedRows.length})` : '' }}
                </el-button>
                <el-button
                  v-permission="'system:user:import'"
                  data-testid="user-import-btn"
                  plain
                  :icon="Upload"
                  @click="importDialogVisible = true"
                >
                  导入
                </el-button>
                <AtengExcelExport
                  v-permission="'system:user:export'"
                  data-testid="user-export-btn"
                  mode="dropdown"
                  type="default"
                  plain
                  text="导出"
                  :selected-ids="selectedUserIds"
                  :action="handleExportExcel"
                />
                <el-tag
                  v-if="activeDeptFilter"
                  data-testid="user-active-dept-capsule"
                  closable
                  type="primary"
                  effect="light"
                  @close="clearDeptFilter(true)"
                >
                  筛选部门：{{ activeDeptFilter.deptName }}（含下级）
                </el-tag>
              </div>
            </template>

            <el-table-column
              type="selection"
              width="48"
              align="center"
              :selectable="isRowSelectable"
            />
            <el-table-column prop="id" label="用户ID" min-width="164" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="font-mono-data text-ink-secondary">{{ asUserRow(row).id }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="username" label="用户账号" min-width="145" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="inline-flex items-center gap-1.5">
                  <span class="font-mono-data text-ink">{{ asUserRow(row).username }}</span>
                  <el-tag v-if="asUserRow(row).builtinSuperAdmin" size="small" type="primary"
                    >内置</el-tag
                  >
                </span>
              </template>
            </el-table-column>
            <el-table-column
              prop="nickname"
              label="用户昵称"
              min-width="115"
              show-overflow-tooltip
            />
            <el-table-column prop="avatar" label="头像" width="72" align="center">
              <template #default="{ row }">
                <el-avatar
                  :size="26"
                  :src="asUserRow(row).avatar || undefined"
                  :alt="`${asUserRow(row).nickname || asUserRow(row).username}头像`"
                >
                  {{ formatUserAvatarInitial(asUserRow(row).nickname, asUserRow(row).username) }}
                </el-avatar>
              </template>
            </el-table-column>
            <el-table-column prop="deptName" label="归属部门" min-width="130" show-overflow-tooltip>
              <template #default="{ row }">
                <span>{{ asUserRow(row).deptName?.trim() || '--' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="phone" label="手机号码" width="138">
              <template #default="{ row }">
                <span class="font-mono-data">{{
                  formatMaskPhone(asUserRow(row).phone) || '--'
                }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="email" label="电子邮箱" min-width="168" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="font-mono-data">{{
                  formatMaskEmail(asUserRow(row).email) || '--'
                }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="94" align="center">
              <template #default="{ row }">
                <el-tooltip
                  :content="rowDisableReason(asUserRow(row))"
                  :disabled="!rowDisableReason(asUserRow(row))"
                  placement="top"
                >
                  <span>
                    <el-switch
                      :data-testid="`user-status-switch-${asUserRow(row).id}`"
                      :model-value="asUserRow(row).status === 0"
                      :disabled="!canUpdateUser || Boolean(rowDisableReason(asUserRow(row)))"
                      :loading="statusUpdatingId === asUserRow(row).id"
                      inline-prompt
                      active-text="启用"
                      inactive-text="停用"
                      @change="handleToggleStatus(asUserRow(row))"
                    />
                  </span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column prop="createTime" label="创建时间" width="184">
              <template #default="{ row }">
                <span class="tabular-nums">{{ asUserRow(row).createTime || '--' }}</span>
              </template>
            </el-table-column>
            <el-table-column
              v-if="hasRowActions"
              label="操作"
              width="210"
              fixed="right"
              align="center"
            >
              <template #default="{ row }">
                <UserRowActions
                  :row="asUserRow(row)"
                  :current-user-id="currentUserId"
                  :allow-platform-super-edit="allowPlatformSuperEdit"
                  @edit="openEditDrawer"
                  @reset-password="openResetPwdDialog"
                  @delete="handleDeleteSingle"
                />
              </template>
            </el-table-column>
          </AtengTable>
        </div>
      </template>
    </AtengSplitLayout>

    <UserFormDrawer
      v-model="formDrawerVisible"
      :mode="formDrawerMode"
      :user-id="editingUserId"
      :initial-dept-id="activeDeptFilter?.id"
      :dept-options="deptTree"
      @saved="handleTableReload"
    />
    <UserResetPwdDialog
      v-model="resetPwdVisible"
      :user="resetPwdTarget"
      @saved="handleTableReload"
    />
    <UserImportDialog v-model="importDialogVisible" @imported="handleTableReload" />
  </section>
</template>

<style scoped></style>
