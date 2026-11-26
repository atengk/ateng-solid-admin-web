<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ElButton,
  ElFormItem,
  ElInput,
  ElMessage,
  ElSwitch,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { Delete, Edit, Plus, Refresh } from '@element-plus/icons-vue';
import {
  AtengDictSelect,
  AtengDictTag,
  AtengEmpty,
  AtengQueryForm,
  AtengTable,
  DictManager,
  type DictItem,
} from '@atengk/element-plus';
import { createPageResult } from '@atengk/core';
import { usePagination } from '@atengk/vue';
import {
  deleteDictData,
  getDictDataPage,
  updateDictDataStatus,
  type DictDataQuery,
  type DictDataVO,
  type DictTypeVO,
} from '@/api/system/dict';
import type { CommonStatus } from '@/api/types';
import { runConfirmedAction } from '@/composables/useConfirmAction';
import {
  QUERY_COLS_TWO_ITEMS,
  QUERY_FORM_LOADING_DELAY,
  useListTableLayout,
} from '@/composables/useListTableLayout';
import { useAuthStore } from '@/stores/auth';
import { normalizeTagType, withDictPreload } from '@/utils/dict';
import DictDataFormDialog from '@/views/system/dict/components/DictDataFormDialog.vue';

/**
 * 动态字典右侧明细管理面板：
 * 响应左侧字典类型切换、展示 AtengDictTag 实时标签、触发精准缓存失效与明细维护弹窗。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'DictDataPanel' });

const DATA_STORAGE_KEY = 'solid:table:sys-dict-data';

const props = withDefaults(
  defineProps<{
    /**
     * 左侧当前选中的字典类型对象；未选中时展示引导空状态。
     */
    selectedType: DictTypeVO | null;
    /**
     * 所属分栏是否处于垂直堆叠布局态（堆叠态关闭表内高度封顶，退回整页滚动）。
     */
    stacked?: boolean;
  }>(),
  {
    stacked: false,
  },
);

const { tableAutoHeight, tableAutoHeightMode } = useListTableLayout({
  stacked: () => props.stacked,
});

const authStore = useAuthStore();
const canUpdateDict = computed<boolean>(() => authStore.hasPermission('system:dict:update'));
const hasRowActions = computed<boolean>(() =>
  authStore.hasPermission(['system:dict:update', 'system:dict:delete']),
);

const dataStatusUpdatingId = ref<string>('');
const dataDialogVisible = ref<boolean>(false);
const dataDialogMode = ref<'create' | 'edit'>('create');
const editingDataId = ref<string | undefined>(undefined);

const dataPagination = usePagination<DictDataVO, DictDataQuery>(
  async params => {
    const activeType = props.selectedType?.dictType;
    if (!activeType) {
      return createPageResult<DictDataVO>([], 0, {
        current: params?.current ?? 1,
        size: params?.size ?? 10,
      });
    }
    return withDictPreload(['commonStatus'], () =>
      getDictDataPage({ ...params, dictType: activeType }),
    );
  },
  { defaultSize: 10 },
);

watch(
  () => props.selectedType?.dictType,
  (nextDictType, prevDictType) => {
    if (nextDictType === prevDictType) {
      return;
    }
    // 切换所属类型仅复位可见筛选字段，绝不把 dictType 写入 query，避免无明细时误显示检索无结果空态
    dataPagination.query.dictLabel = '';
    dataPagination.query.status = undefined;
    void dataPagination.search({
      dictLabel: undefined,
      status: undefined,
    });
  },
);

function asDictDataRow(row: unknown): DictDataVO {
  return row as DictDataVO;
}

function buildRowTagOptions(row: DictDataVO): DictItem[] {
  return [
    {
      label: row.dictLabel,
      value: row.dictValue,
      tagType: normalizeTagType(row.tagType),
      cssClass: row.cssClass?.trim() || undefined,
    },
  ];
}

function openCreateDataDialog(): void {
  if (!props.selectedType) {
    return;
  }
  dataDialogMode.value = 'create';
  editingDataId.value = undefined;
  dataDialogVisible.value = true;
}

function openEditDataDialog(row: DictDataVO): void {
  dataDialogMode.value = 'edit';
  editingDataId.value = row.id;
  dataDialogVisible.value = true;
}

async function handleToggleDataStatus(row: DictDataVO): Promise<void> {
  if (!canUpdateDict.value || dataStatusUpdatingId.value === row.id) {
    return;
  }
  const nextStatus: CommonStatus = row.status === 0 ? 1 : 0;
  const actionText = nextStatus === 0 ? '启用' : '停用';

  dataStatusUpdatingId.value = row.id;
  try {
    await runConfirmedAction({
      message: `确认要${actionText}字典项【${row.dictLabel}】吗？`,
      title: '操作确认',
      confirmButtonText: `确认${actionText}`,
      successMessage: `已${actionText}字典项【${row.dictLabel}】`,
      errorFallback: `${actionText}字典数据失败，请稍后重试`,
      execute: () => updateDictDataStatus(row.id, nextStatus),
      onSuccess: async () => {
        DictManager.clearCache(row.dictType);
        await dataPagination.refresh();
      },
    });
  } finally {
    dataStatusUpdatingId.value = '';
  }
}

function handleDeleteData(row: DictDataVO): void {
  void runConfirmedAction({
    message: `确认删除字典项【${row.dictLabel}】（键值：${row.dictValue}）吗？`,
    title: '删除确认',
    confirmButtonText: '确认删除',
    successMessage: `已删除字典项【${row.dictLabel}】`,
    errorFallback: '删除字典数据失败，请稍后重试',
    execute: () => deleteDictData(row.id),
    onSuccess: async () => {
      DictManager.clearCache(row.dictType);
      await dataPagination.refresh();
    },
  });
}

async function handleRefreshActiveCache(): Promise<void> {
  const active = props.selectedType;
  if (!active) {
    return;
  }
  DictManager.clearCache(active.dictType);
  ElMessage.success(`已刷新字典【${active.dictType}】客户端缓存`);
  await dataPagination.refresh();
}
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col gap-3 pl-2">
    <div
      v-if="selectedType"
      class="flex flex-wrap items-center justify-between gap-2 rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle px-3 py-2"
    >
      <div data-testid="dict-active-type-badge" class="flex items-center gap-2 text-sm">
        <span class="font-medium text-ink">{{ selectedType.dictName }}</span>
        <code class="font-mono-data rounded bg-surface px-1.5 py-0.5 text-xs text-ink-secondary">
          {{ selectedType.dictType }}
        </code>
        <el-tag v-if="selectedType.status === 1" size="small" type="info">
          已停用（消费返回空列表）
        </el-tag>
      </div>
      <div class="flex items-center gap-2">
        <el-button
          data-testid="dict-refresh-cache-btn"
          size="small"
          :icon="Refresh"
          @click="handleRefreshActiveCache"
        >
          刷新字典缓存
        </el-button>
      </div>
    </div>

    <AtengEmpty
      v-if="!selectedType"
      description="请先在左侧选择或新增一个字典类型，以查看和维护字典数据"
    />

    <AtengTable
      v-else
      :pagination="dataPagination"
      row-key="id"
      :storage-key="DATA_STORAGE_KEY"
      :auto-height="tableAutoHeight"
      :auto-height-mode="tableAutoHeightMode"
      empty-description="当前字典类型暂无明细，可点击“新增字典数据”添加"
      search-empty-description="未检索到匹配的字典项"
    >
      <template #query>
        <AtengQueryForm
          :model="dataPagination.query"
          :cols="QUERY_COLS_TWO_ITEMS"
          :default-collapsed="false"
          :show-collapse="false"
          :loading-delay="QUERY_FORM_LOADING_DELAY"
        >
          <el-form-item label="字典标签" prop="dictLabel">
            <el-input
              v-model="dataPagination.query.dictLabel"
              data-testid="dict-data-query-label"
              clearable
              placeholder="请输入字典标签"
            />
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <AtengDictSelect
              v-model="dataPagination.query.status"
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
          data-testid="dict-data-add-btn"
          type="primary"
          :icon="Plus"
          @click="openCreateDataDialog"
        >
          新增字典数据
        </el-button>
      </template>

      <el-table-column prop="dictLabel" label="字典标签" min-width="100">
        <template #default="{ row }">
          <AtengDictTag
            :options="buildRowTagOptions(asDictDataRow(row))"
            :value="asDictDataRow(row).dictValue"
          />
        </template>
      </el-table-column>

      <el-table-column prop="dictValue" label="字典键值" min-width="96" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="font-mono-data">{{ asDictDataRow(row).dictValue }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="sort" label="排序" width="68" align="center">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asDictDataRow(row).sort }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="isDefault" label="默认" width="72" align="center">
        <template #default="{ row }">
          <el-tag v-if="asDictDataRow(row).isDefault === 1" size="small" type="primary"
            >默认</el-tag
          >
          <span v-else class="text-ink-muted">--</span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="74" align="center">
        <template #default="{ row }">
          <el-switch
            :data-testid="`dict-data-status-switch-${asDictDataRow(row).id}`"
            :model-value="asDictDataRow(row).status === 0"
            :disabled="!canUpdateDict"
            :loading="dataStatusUpdatingId === asDictDataRow(row).id"
            size="small"
            @change="handleToggleDataStatus(asDictDataRow(row))"
          />
        </template>
      </el-table-column>

      <el-table-column v-if="hasRowActions" label="操作" width="136" fixed="right" align="center">
        <template #default="{ row }">
          <div class="inline-flex items-center justify-center gap-1">
            <el-button
              v-permission="'system:dict:update'"
              :data-testid="`dict-data-edit-btn-${asDictDataRow(row).id}`"
              type="primary"
              link
              size="small"
              :icon="Edit"
              @click="openEditDataDialog(asDictDataRow(row))"
            >
              编辑
            </el-button>
            <el-button
              v-permission="'system:dict:delete'"
              :data-testid="`dict-data-delete-btn-${asDictDataRow(row).id}`"
              type="danger"
              link
              size="small"
              :icon="Delete"
              @click="handleDeleteData(asDictDataRow(row))"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
    </AtengTable>

    <DictDataFormDialog
      v-model="dataDialogVisible"
      :mode="dataDialogMode"
      :dict-type="selectedType?.dictType ?? ''"
      :dict-data-id="editingDataId"
      @saved="dataPagination.refresh()"
    />
  </div>
</template>

<style scoped></style>
