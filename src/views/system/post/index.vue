<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ElButton,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElSwitch,
  ElTableColumn,
} from 'element-plus';
import { Delete, Edit, Plus } from '@element-plus/icons-vue';
import {
  AtengDictSelect,
  AtengQueryForm,
  AtengTable,
  type AtengTableInstance,
} from '@atengk/element-plus';
import { usePagination } from '@atengk/vue';
import {
  deletePosts,
  getPostPage,
  updatePostStatus,
  type PostQuery,
  type PostVO,
} from '@/api/system/post';
import type { CommonStatus } from '@/api/types';
import {
  QUERY_COLS_THREE_ITEMS,
  useListTableLayout,
} from '@/composables/useListTableLayout';
import { useAuthStore } from '@/stores/auth';
import { isGlobalHandledHttpError, resolveErrorMessage } from '@/utils/http';
import PostFormDialog from '@/views/system/post/components/PostFormDialog.vue';

/**
 * 岗位管理视图（/system/post）：
 * 基于 usePagination + AtengTable 实现服务端分页检索、行内状态确认切换、单删与批量删除。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysPost' });

const STORAGE_KEY = 'solid:table:sys-post';

const authStore = useAuthStore();
const { tableAutoHeight, tableAutoHeightMode } = useListTableLayout();
const tableRef = ref<AtengTableInstance<PostVO>>();

const pagination = usePagination<PostVO, PostQuery>(getPostPage, {
  defaultSize: 10,
});

const selectedRows = ref<PostVO[]>([]);
const statusUpdatingId = ref<string>('');

const dialogVisible = ref<boolean>(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingPostId = ref<string | undefined>(undefined);

const canUpdatePost = computed<boolean>(() => authStore.hasPermission('system:post:update'));
const hasRowActions = computed<boolean>(() =>
  authStore.hasPermission(['system:post:update', 'system:post:delete']),
);

function asPostRow(row: unknown): PostVO {
  return row as PostVO;
}

function clearTableSelection(): void {
  selectedRows.value = [];
  const elTable = tableRef.value?.tableRef as
    | (NonNullable<AtengTableInstance<PostVO>['tableRef']> & {
        clearSelection?: () => void;
      })
    | undefined;
  elTable?.clearSelection?.();
}

function openCreateDialog(): void {
  dialogMode.value = 'create';
  editingPostId.value = undefined;
  dialogVisible.value = true;
}

function openEditDialog(row: PostVO): void {
  dialogMode.value = 'edit';
  editingPostId.value = row.id;
  dialogVisible.value = true;
}

async function handleToggleStatus(row: PostVO): Promise<void> {
  if (!canUpdatePost.value || statusUpdatingId.value === row.id) {
    return;
  }
  const nextStatus: CommonStatus = row.status === 0 ? 1 : 0;
  const actionText = nextStatus === 0 ? '启用' : '停用';

  try {
    await ElMessageBox.confirm(`确认要${actionText}岗位【${row.postName}】吗？`, '操作确认', {
      type: 'warning',
      confirmButtonText: `确认${actionText}`,
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  statusUpdatingId.value = row.id;
  try {
    await updatePostStatus(row.id, nextStatus);
    ElMessage.success(`已${actionText}岗位【${row.postName}】`);
    await pagination.refresh();
  } catch (error) {
    const message = resolveErrorMessage(error, `${actionText}岗位失败，请稍后重试`);
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(message);
    }
  } finally {
    statusUpdatingId.value = '';
  }
}

async function confirmAndDelete(
  targetIds: string | string[],
  confirmMessage: string,
  successMessage: string,
): Promise<void> {
  try {
    await ElMessageBox.confirm(confirmMessage, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  try {
    await deletePosts(targetIds);
    ElMessage.success(successMessage);
    clearTableSelection();
    await pagination.refresh();
  } catch (error) {
    const message = resolveErrorMessage(error, '删除岗位失败，请稍后重试');
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(message);
    }
  }
}

function handleDeleteSingle(row: PostVO): void {
  void confirmAndDelete(
    row.id,
    `确认删除岗位【${row.postName}】（编码：${row.postCode}）吗？`,
    `已删除岗位【${row.postName}】`,
  );
}

function handleBatchDelete(): void {
  if (selectedRows.value.length === 0) {
    return;
  }
  const ids = selectedRows.value.map(item => item.id);
  void confirmAndDelete(
    ids,
    `确认批量删除已选中的 ${ids.length} 条岗位吗？`,
    `已删除选中的 ${ids.length} 条岗位`,
  );
}

async function handleDialogSaved(): Promise<void> {
  clearTableSelection();
  await pagination.refresh();
}
</script>

<template>
  <section data-testid="sys-post-page" class="flex flex-col gap-3">
    <AtengTable
      ref="tableRef"
      v-model:selected-rows="selectedRows"
      :pagination="pagination"
      row-key="id"
      :storage-key="STORAGE_KEY"
      :show-batch-bar="false"
      :auto-height="tableAutoHeight"
      :auto-height-mode="tableAutoHeightMode"
      empty-description="暂无岗位数据，可点击上方“新增岗位”创建"
      search-empty-description="未检索到匹配的岗位信息"
    >
      <template #query>
        <AtengQueryForm
          :model="pagination.query"
          :cols="QUERY_COLS_THREE_ITEMS"
          :default-collapsed="false"
          :show-collapse="false"
        >
          <el-form-item label="岗位编码" prop="postCode">
            <el-input
              v-model="pagination.query.postCode"
              data-testid="post-query-code"
              clearable
              class="font-mono-data"
              placeholder="请输入岗位编码"
            />
          </el-form-item>
          <el-form-item label="岗位名称" prop="postName">
            <el-input
              v-model="pagination.query.postName"
              data-testid="post-query-name"
              clearable
              placeholder="请输入岗位名称"
            />
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <AtengDictSelect
              v-model="pagination.query.status"
              data-testid="post-query-status"
              dict-code="commonStatus"
              value-type="number"
              placeholder="全部状态"
            />
          </el-form-item>
        </AtengQueryForm>
      </template>

      <template #toolbar-left>
        <el-button
          v-permission="'system:post:create'"
          data-testid="post-add-btn"
          type="primary"
          :icon="Plus"
          @click="openCreateDialog"
        >
          新增岗位
        </el-button>
        <el-button
          v-permission="'system:post:delete'"
          data-testid="post-batch-delete-btn"
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

      <el-table-column prop="postCode" label="岗位编码" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="font-mono-data text-ink">{{ asPostRow(row).postCode }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="postName" label="岗位名称" min-width="160" show-overflow-tooltip />

      <el-table-column prop="sort" label="排序" width="88" align="center">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asPostRow(row).sort }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="96" align="center">
        <template #default="{ row }">
          <el-switch
            :data-testid="`post-status-switch-${asPostRow(row).id}`"
            :model-value="asPostRow(row).status === 0"
            :disabled="!canUpdatePost"
            :loading="statusUpdatingId === asPostRow(row).id"
            inline-prompt
            active-text="启用"
            inactive-text="停用"
            @change="handleToggleStatus(asPostRow(row))"
          />
        </template>
      </el-table-column>

      <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="text-ink-secondary">{{ asPostRow(row).remark?.trim() || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="createTime" label="创建时间" width="175">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asPostRow(row).createTime || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column v-if="hasRowActions" label="操作" width="140" fixed="right" align="center">
        <template #default="{ row }">
          <div class="inline-flex items-center justify-center gap-1">
            <el-button
              v-permission="'system:post:update'"
              :data-testid="`post-edit-btn-${asPostRow(row).id}`"
              type="primary"
              link
              size="small"
              :icon="Edit"
              @click="openEditDialog(asPostRow(row))"
            >
              编辑
            </el-button>

            <el-button
              v-permission="'system:post:delete'"
              :data-testid="`post-delete-btn-${asPostRow(row).id}`"
              type="danger"
              link
              size="small"
              :icon="Delete"
              @click="handleDeleteSingle(asPostRow(row))"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
    </AtengTable>

    <PostFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :post-id="editingPostId"
      @saved="handleDialogSaved"
    />
  </section>
</template>

<style scoped></style>
