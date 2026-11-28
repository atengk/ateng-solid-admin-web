<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import {
  ElButton,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElSwitch,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from 'element-plus';
import { Delete, Edit, Fold, Expand, Plus } from '@element-plus/icons-vue';
import { formatMaskPhone } from '@atengk/core';
import { AtengDictSelect, AtengQueryForm, AtengTable } from '@atengk/element-plus';
import {
  deleteDept,
  getDeptTree,
  updateDeptStatus,
  type DeptQuery,
  type DeptTreeVO,
} from '@/api/system/dept';
import type { CommonStatus } from '@/api/types';
import {
  QUERY_COLS_TWO_ITEMS,
  QUERY_FORM_LOADING_DELAY,
  useListTableLayout,
} from '@/composables/useListTableLayout';
import { useTreeTableControls } from '@/composables/useTreeTableControls';
import { useAuthStore } from '@/stores/auth';
import { isGlobalHandledHttpError, resolveErrorMessage } from '@/utils/http';
import DeptFormDialog from '@/views/system/dept/components/DeptFormDialog.vue';
import { formatDeptLeader, ROOT_DEPT_ID } from '@/views/system/dept/deptHelper';

/**
 * 组织部门树管理视图（/system/dept）：
 * 支持树形层级展示、一键展开/折叠、状态二次确认切换、联系手机号渲染层脱敏与防自环维护弹窗。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysDept' });

const STORAGE_KEY = 'solid:table:sys-dept';

const authStore = useAuthStore();
const { tableAutoHeight, tableAutoHeightMode } = useListTableLayout();

const query = reactive<DeptQuery>({
  deptName: '',
  status: undefined,
});

const deptTree = ref<DeptTreeVO[]>([]);
const fullDeptTree = ref<DeptTreeVO[]>([]);
const loading = ref<boolean>(false);
const loadError = ref<unknown>(undefined);
const statusUpdatingId = ref<string>('');

const dialogVisible = ref<boolean>(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingDeptId = ref<string | undefined>(undefined);
const initialParentId = ref<string>(ROOT_DEPT_ID);

const canUpdateDept = computed<boolean>(() => authStore.hasPermission('system:dept:update'));
const hasRowActions = computed<boolean>(() =>
  authStore.hasPermission(['system:dept:create', 'system:dept:update', 'system:dept:delete']),
);

function asDeptRow(row: unknown): DeptTreeVO {
  return row as DeptTreeVO;
}

function hasActiveDeptFilter(): boolean {
  return Boolean(query.deptName?.trim()) || query.status !== undefined;
}

const {
  tableRef,
  isAllExpanded,
  applyTreeExpansion,
  toggleExpandAll,
  handleQuerySearch,
  handleQueryReset,
} = useTreeTableControls<DeptTreeVO>({
  treeData: deptTree,
  onLoad: loadDeptTree,
  onResetFields: () => {
    query.deptName = '';
    query.status = undefined;
  },
});

async function loadDeptTree(): Promise<void> {
  if (loading.value) {
    return;
  }
  loading.value = true;
  loadError.value = undefined;
  try {
    const trimmedName = query.deptName?.trim();
    const isUnfiltered = !hasActiveDeptFilter();
    const params: DeptQuery = {
      deptName: trimmedName || undefined,
      status: query.status,
    };
    const fetchedTree = await getDeptTree(params);
    deptTree.value = fetchedTree;
    if (isUnfiltered) {
      fullDeptTree.value = fetchedTree;
    }
    await nextTick();
    if (!isUnfiltered || isAllExpanded.value) {
      applyTreeExpansion(true);
    } else {
      applyTreeExpansion(false);
    }
  } catch (error) {
    loadError.value = error;
    deptTree.value = [];
  } finally {
    loading.value = false;
  }
}

async function refreshDeptTreeAfterMutation(): Promise<void> {
  if (hasActiveDeptFilter()) {
    fullDeptTree.value = [];
  }
  await loadDeptTree();
}

function openCreateDialog(parentId = ROOT_DEPT_ID): void {
  dialogMode.value = 'create';
  editingDeptId.value = undefined;
  initialParentId.value = parentId;
  dialogVisible.value = true;
}

function openEditDialog(row: DeptTreeVO): void {
  dialogMode.value = 'edit';
  editingDeptId.value = row.id;
  initialParentId.value = row.parentId;
  dialogVisible.value = true;
}

async function handleToggleStatus(row: DeptTreeVO): Promise<void> {
  if (!canUpdateDept.value || statusUpdatingId.value === row.id) {
    return;
  }
  const nextStatus: CommonStatus = row.status === 0 ? 1 : 0;
  const actionText = nextStatus === 1 ? '停用' : '启用';

  try {
    await ElMessageBox.confirm(
      `确认要${actionText}部门【${row.deptName}】吗？`,
      `确认${actionText}部门`,
      {
        type: 'warning',
        confirmButtonText: `确认${actionText}`,
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }

  statusUpdatingId.value = row.id;
  try {
    await updateDeptStatus(row.id, nextStatus);
    ElMessage.success(`已${actionText}部门【${row.deptName}】`);
    await refreshDeptTreeAfterMutation();
  } catch (error) {
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(resolveErrorMessage(error, `${actionText}部门失败，请稍后重试`));
    }
  } finally {
    statusUpdatingId.value = '';
  }
}

async function handleDelete(row: DeptTreeVO): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认删除部门【${row.deptName}】？删除前须确保不存在下级部门与关联用户。`,
      '确认删除部门',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      },
    );
  } catch {
    return;
  }

  try {
    await deleteDept(row.id);
    ElMessage.success(`已删除部门【${row.deptName}】`);
    await refreshDeptTreeAfterMutation();
  } catch (error) {
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(resolveErrorMessage(error, '删除部门失败，请核对关联数据后重试'));
    }
  }
}

onMounted(() => {
  void loadDeptTree();
});
</script>

<template>
  <section data-testid="dept-page" class="flex flex-col gap-3">
    <AtengTable
      ref="tableRef"
      :data="deptTree"
      :loading="loading"
      :error="loadError"
      row-key="id"
      :storage-key="STORAGE_KEY"
      :show-pagination="false"
      :auto-height="tableAutoHeight"
      :auto-height-mode="tableAutoHeightMode"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      :default-expand-all="true"
      empty-description="暂无部门数据"
      search-empty-description="未找到符合条件的部门"
      @refresh="loadDeptTree"
    >
      <template #query>
        <AtengQueryForm
          :model="query"
          :cols="QUERY_COLS_TWO_ITEMS"
          :default-collapsed="false"
          :show-collapse="false"
          :loading-delay="QUERY_FORM_LOADING_DELAY"
          @search="handleQuerySearch"
          @reset="handleQueryReset"
        >
          <el-form-item label="部门名称" prop="deptName">
            <el-input
              v-model="query.deptName"
              data-testid="dept-query-name"
              clearable
              placeholder="请输入部门名称"
            />
          </el-form-item>
          <el-form-item label="部门状态" prop="status">
            <AtengDictSelect
              v-model="query.status"
              data-testid="dept-query-status"
              dict-code="commonStatus"
              value-type="number"
              placeholder="全部状态"
            />
          </el-form-item>
        </AtengQueryForm>
      </template>

      <template #toolbar-left>
        <el-button
          v-permission="'system:dept:create'"
          data-testid="dept-add-btn"
          type="primary"
          :icon="Plus"
          @click="openCreateDialog(ROOT_DEPT_ID)"
        >
          新增部门
        </el-button>
        <el-button
          data-testid="dept-expand-toggle-btn"
          :icon="isAllExpanded ? Fold : Expand"
          @click="toggleExpandAll"
        >
          {{ isAllExpanded ? '折叠全部' : '展开全部' }}
        </el-button>
      </template>

      <el-table-column prop="deptName" label="部门名称" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="inline-flex items-center gap-1.5">
            <span :class="{ 'font-medium text-ink': asDeptRow(row).parentId === ROOT_DEPT_ID }">
              {{ asDeptRow(row).deptName }}
            </span>
            <el-tag v-if="asDeptRow(row).parentId === ROOT_DEPT_ID" size="small" type="primary">
              顶级
            </el-tag>
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="sort" label="排序" width="88" align="center">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asDeptRow(row).sort }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="leaderNickname" label="部门负责人" min-width="160">
        <template #default="{ row }">
          <span>{{ formatDeptLeader(asDeptRow(row)) }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="phone" label="联系电话" width="145">
        <template #default="{ row }">
          <span class="font-mono-data">
            {{ formatMaskPhone(asDeptRow(row).phone) || '--' }}
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="96" align="center">
        <template #default="{ row }">
          <el-switch
            :data-testid="`dept-status-switch-${asDeptRow(row).id}`"
            :model-value="asDeptRow(row).status === 0"
            :disabled="!canUpdateDept"
            :loading="statusUpdatingId === asDeptRow(row).id"
            inline-prompt
            active-text="启用"
            inactive-text="停用"
            @change="handleToggleStatus(asDeptRow(row))"
          />
        </template>
      </el-table-column>

      <el-table-column prop="createTime" label="创建时间" width="175">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asDeptRow(row).createTime || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column v-if="hasRowActions" label="操作" width="220" fixed="right" align="center">
        <template #default="{ row }">
          <div class="dept-row-actions inline-flex items-center justify-center gap-2">
            <span v-permission="'system:dept:create'" class="inline-flex">
              <el-tooltip
                v-if="asDeptRow(row).status !== 0"
                content="已停用部门不可挂载下级部门"
                placement="top"
              >
                <span>
                  <el-button
                    :data-testid="`dept-add-child-btn-${asDeptRow(row).id}`"
                    type="primary"
                    link
                    size="small"
                    disabled
                    :icon="Plus"
                  >
                    新增下级
                  </el-button>
                </span>
              </el-tooltip>
              <el-button
                v-else
                :data-testid="`dept-add-child-btn-${asDeptRow(row).id}`"
                type="primary"
                link
                size="small"
                :icon="Plus"
                @click="openCreateDialog(asDeptRow(row).id)"
              >
                新增下级
              </el-button>
            </span>

            <el-button
              v-permission="'system:dept:update'"
              :data-testid="`dept-edit-btn-${asDeptRow(row).id}`"
              type="primary"
              link
              size="small"
              :icon="Edit"
              @click="openEditDialog(asDeptRow(row))"
            >
              编辑
            </el-button>

            <el-button
              v-permission="'system:dept:delete'"
              :data-testid="`dept-delete-btn-${asDeptRow(row).id}`"
              type="danger"
              link
              size="small"
              :icon="Delete"
              @click="handleDelete(asDeptRow(row))"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
    </AtengTable>

    <DeptFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :dept-id="editingDeptId"
      :initial-parent-id="initialParentId"
      :dept-tree="fullDeptTree"
      @saved="refreshDeptTreeAfterMutation"
    />
  </section>
</template>

<style scoped>
.dept-row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
