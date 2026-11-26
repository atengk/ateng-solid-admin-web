<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElButton, ElFormItem, ElInput, ElSwitch, ElTableColumn } from 'element-plus';
import { Delete, Edit, Plus } from '@element-plus/icons-vue';
import {
  AtengDictSelect,
  AtengQueryForm,
  AtengSplitLayout,
  AtengTable,
  DictManager,
} from '@atengk/element-plus';
import { usePagination } from '@atengk/vue';
import {
  deleteDictTypes,
  getDictTypePage,
  updateDictTypeStatus,
  type DictTypeQuery,
  type DictTypeVO,
} from '@/api/system/dict';
import type { CommonStatus } from '@/api/types';
import { runConfirmedAction } from '@/composables/useConfirmAction';
import { QUERY_FORM_LOADING_DELAY, useListTableLayout } from '@/composables/useListTableLayout';
import { useAuthStore } from '@/stores/auth';
import DictDataPanel from '@/views/system/dict/components/DictDataPanel.vue';
import DictTypeFormDialog from '@/views/system/dict/components/DictTypeFormDialog.vue';

/**
 * 动态数据字典双面板管理视图（/system/dict，平台默认租户 0 专属）：
 * 采用 AtengSplitLayout 42%/58% 双面板展示字典类型并联动右侧字典明细，支持 <1120px 垂直堆叠布局切换。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysDict' });

const STACKED_BREAKPOINT_PX = 1120;
const TYPE_STORAGE_KEY = 'solid:table:sys-dict-type';
const SPLIT_STORAGE_KEY = 'solid:split:sys-dict';

const authStore = useAuthStore();
const {
  isStacked: isStackedLayout,
  tableAutoHeight,
  tableAutoHeightMode,
} = useListTableLayout({ stackedBreakpoint: STACKED_BREAKPOINT_PX });

const selectedType = ref<DictTypeVO | null>(null);
const typeStatusUpdatingId = ref<string>('');

const typeDialogVisible = ref<boolean>(false);
const typeDialogMode = ref<'create' | 'edit'>('create');
const editingTypeId = ref<string | undefined>(undefined);

const canUpdateDict = computed<boolean>(() => authStore.hasPermission('system:dict:update'));
const hasRowActions = computed<boolean>(() =>
  authStore.hasPermission(['system:dict:update', 'system:dict:delete']),
);

function selectDictType(row: DictTypeVO): void {
  selectedType.value = { ...row };
}

function syncSelectionAfterTypePage(records: readonly DictTypeVO[]): void {
  const firstRow = records[0];
  if (!firstRow) {
    selectedType.value = null;
    return;
  }
  const currentId = selectedType.value?.id;
  const matched = currentId ? records.find(item => item.id === currentId) : undefined;
  selectedType.value = matched ? { ...matched } : { ...firstRow };
}

const typePagination = usePagination<DictTypeVO, DictTypeQuery>(getDictTypePage, {
  defaultSize: 10,
  onSuccess: page => {
    syncSelectionAfterTypePage(page.records);
  },
});

function asDictTypeRow(row: unknown): DictTypeVO {
  return row as DictTypeVO;
}

function handleDictTypeRowClick(row: unknown): void {
  selectDictType(asDictTypeRow(row));
}

function openCreateTypeDialog(): void {
  typeDialogMode.value = 'create';
  editingTypeId.value = undefined;
  typeDialogVisible.value = true;
}

function openEditTypeDialog(row: DictTypeVO): void {
  typeDialogMode.value = 'edit';
  editingTypeId.value = row.id;
  typeDialogVisible.value = true;
}

async function handleToggleTypeStatus(row: DictTypeVO): Promise<void> {
  if (!canUpdateDict.value || typeStatusUpdatingId.value === row.id) {
    return;
  }
  const nextStatus: CommonStatus = row.status === 0 ? 1 : 0;
  const actionText = nextStatus === 0 ? '启用' : '停用';

  typeStatusUpdatingId.value = row.id;
  try {
    await runConfirmedAction({
      message: `确认要${actionText}字典类型【${row.dictName}】吗？`,
      title: '操作确认',
      confirmButtonText: `确认${actionText}`,
      successMessage: `已${actionText}字典类型【${row.dictName}】`,
      errorFallback: `${actionText}字典类型失败，请稍后重试`,
      execute: () => updateDictTypeStatus(row.id, nextStatus),
      onSuccess: async () => {
        DictManager.clearCache(row.dictType);
        await typePagination.refresh();
      },
    });
  } finally {
    typeStatusUpdatingId.value = '';
  }
}

function handleDeleteType(row: DictTypeVO): void {
  void runConfirmedAction({
    message: `确认删除字典类型【${row.dictName}】（${row.dictType}）吗？`,
    title: '删除确认',
    confirmButtonText: '确认删除',
    successMessage: `已删除字典类型【${row.dictName}】`,
    errorFallback: '删除字典类型失败，请先核对下级字典数据',
    execute: () => deleteDictTypes(row.id),
    onSuccess: async () => {
      DictManager.clearCache(row.dictType);
      await typePagination.refresh();
    },
  });
}
</script>

<template>
  <section
    data-testid="sys-dict-page"
    :class="['flex flex-col', isStackedLayout ? 'min-h-[560px]' : 'h-full min-h-0']"
  >
    <AtengSplitLayout
      :storage-key="isStackedLayout ? '' : SPLIT_STORAGE_KEY"
      :direction="isStackedLayout ? 'vertical' : 'horizontal'"
      default-size="44%"
      :min="isStackedLayout ? '180px' : '360px'"
      :max="isStackedLayout ? '75%' : '62%'"
    >
      <template #first>
        <div class="flex h-full min-h-0 min-w-0 flex-col gap-3 pr-2">
          <AtengTable
            :pagination="typePagination"
            row-key="id"
            :storage-key="TYPE_STORAGE_KEY"
            :auto-height="tableAutoHeight"
            :auto-height-mode="tableAutoHeightMode"
            highlight-current-row
            :current-row-key="selectedType?.id"
            empty-description="暂无动态字典类型"
            search-empty-description="未检索到匹配的字典类型"
            @row-click="handleDictTypeRowClick"
          >
            <template #query>
              <AtengQueryForm
                :model="typePagination.query"
                :default-collapsed="true"
                :collapsed-rows="1"
                :loading-delay="QUERY_FORM_LOADING_DELAY"
              >
                <el-form-item label="字典名称" prop="dictName">
                  <el-input
                    v-model="typePagination.query.dictName"
                    data-testid="dict-type-query-name"
                    clearable
                    placeholder="请输入字典名称"
                  />
                </el-form-item>
                <el-form-item label="字典类型" prop="dictType">
                  <el-input
                    v-model="typePagination.query.dictType"
                    data-testid="dict-type-query-code"
                    clearable
                    class="font-mono-data"
                    placeholder="请输入字典编码"
                  />
                </el-form-item>
                <el-form-item label="状态" prop="status">
                  <AtengDictSelect
                    v-model="typePagination.query.status"
                    dict-code="commonStatus"
                    value-type="number"
                    placeholder="全部状态"
                  />
                </el-form-item>
              </AtengQueryForm>
            </template>

            <template #toolbar-left>
              <el-button
                v-permission="'system:dict:create'"
                data-testid="dict-type-add-btn"
                type="primary"
                :icon="Plus"
                @click="openCreateTypeDialog"
              >
                新增类型
              </el-button>
            </template>

            <el-table-column prop="dictName" label="字典名称" min-width="100" show-overflow-tooltip>
              <template #default="{ row }">
                <button
                  type="button"
                  :data-testid="`dict-type-select-${asDictTypeRow(row).id}`"
                  class="cursor-pointer border-0 bg-transparent p-0 text-left font-medium transition-colors"
                  :class="
                    selectedType?.id === asDictTypeRow(row).id
                      ? 'text-brand'
                      : 'text-ink hover:text-brand'
                  "
                  @click.stop="selectDictType(asDictTypeRow(row))"
                >
                  {{ asDictTypeRow(row).dictName }}
                </button>
              </template>
            </el-table-column>

            <el-table-column prop="dictType" label="字典类型" min-width="110" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="font-mono-data text-xs text-ink-secondary">
                  {{ asDictTypeRow(row).dictType }}
                </span>
              </template>
            </el-table-column>

            <el-table-column prop="status" label="状态" width="72" align="center">
              <template #default="{ row }">
                <div @click.stop>
                  <el-switch
                    :data-testid="`dict-type-status-switch-${asDictTypeRow(row).id}`"
                    :model-value="asDictTypeRow(row).status === 0"
                    :disabled="!canUpdateDict"
                    :loading="typeStatusUpdatingId === asDictTypeRow(row).id"
                    size="small"
                    @change="handleToggleTypeStatus(asDictTypeRow(row))"
                  />
                </div>
              </template>
            </el-table-column>

            <el-table-column
              v-if="hasRowActions"
              label="操作"
              width="136"
              fixed="right"
              align="center"
            >
              <template #default="{ row }">
                <div class="inline-flex items-center justify-center gap-1" @click.stop>
                  <el-button
                    v-permission="'system:dict:update'"
                    :data-testid="`dict-type-edit-btn-${asDictTypeRow(row).id}`"
                    type="primary"
                    link
                    size="small"
                    :icon="Edit"
                    @click="openEditTypeDialog(asDictTypeRow(row))"
                  >
                    编辑
                  </el-button>
                  <el-button
                    v-permission="'system:dict:delete'"
                    :data-testid="`dict-type-delete-btn-${asDictTypeRow(row).id}`"
                    type="danger"
                    link
                    size="small"
                    :icon="Delete"
                    @click="handleDeleteType(asDictTypeRow(row))"
                  >
                    删除
                  </el-button>
                </div>
              </template>
            </el-table-column>
          </AtengTable>
        </div>
      </template>

      <template #second>
        <DictDataPanel :selected-type="selectedType" :stacked="isStackedLayout" />
      </template>
    </AtengSplitLayout>

    <DictTypeFormDialog
      v-model="typeDialogVisible"
      :mode="typeDialogMode"
      :dict-type-id="editingTypeId"
      @saved="typePagination.refresh()"
    />
  </section>
</template>

<style scoped></style>
