<script setup lang="ts">
import { computed, ref } from 'vue';
import { ElButton, ElFormItem, ElInput, ElTableColumn, ElTooltip } from 'element-plus';
import { Delete, Edit, Plus } from '@element-plus/icons-vue';
import {
  AtengDictSelect,
  AtengDictTag,
  AtengQueryForm,
  AtengTable,
  type AtengTableInstance,
} from '@atengk/element-plus';
import { usePagination } from '@atengk/vue';
import { deleteConfigs, getConfigPage, type ConfigQuery, type ConfigVO } from '@/api/system/config';
import { runConfirmedAction } from '@/composables/useConfirmAction';
import {
  QUERY_COLS_THREE_ITEMS,
  useListTableLayout,
} from '@/composables/useListTableLayout';
import { useAuthStore } from '@/stores/auth';
import { withDictPreload } from '@/utils/dict';
import ConfigFormDialog from '@/views/system/config/components/ConfigFormDialog.vue';

/**
 * 系统参数管理视图（/system/config）：
 * 实现租户隔离参数分页检索、系统内置参数（configType='Y'）禁删改键保护与初始口令强校验编辑。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysConfig' });

const STORAGE_KEY = 'solid:table:sys-config';

const authStore = useAuthStore();
const { tableAutoHeight, tableAutoHeightMode } = useListTableLayout();
const tableRef = ref<AtengTableInstance<ConfigVO>>();

const hasRowActions = computed<boolean>(() =>
  authStore.hasPermission(['system:config:update', 'system:config:delete']),
);

const pagination = usePagination<ConfigVO, ConfigQuery>(
  params => withDictPreload(['configType'], () => getConfigPage(params)),
  {
    defaultSize: 10,
  },
);

const selectedRows = ref<ConfigVO[]>([]);

const dialogVisible = ref<boolean>(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingConfigId = ref<string | undefined>(undefined);

function asConfigRow(row: unknown): ConfigVO {
  return row as ConfigVO;
}

function isRowSelectable(row: unknown): boolean {
  return asConfigRow(row).configType !== 'Y';
}

function clearTableSelection(): void {
  selectedRows.value = [];
  tableRef.value?.clearSelection?.();
}

function openCreateDialog(): void {
  dialogMode.value = 'create';
  editingConfigId.value = undefined;
  dialogVisible.value = true;
}

function openEditDialog(row: ConfigVO): void {
  dialogMode.value = 'edit';
  editingConfigId.value = row.id;
  dialogVisible.value = true;
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
    errorFallback: '删除系统参数失败，请稍后重试',
    execute: () => deleteConfigs(targetIds),
    onSuccess: async () => {
      clearTableSelection();
      await pagination.refresh();
    },
  });
}

function handleDeleteSingle(row: ConfigVO): void {
  if (row.configType === 'Y') {
    return;
  }
  confirmAndDelete(
    row.id,
    `确认删除系统参数【${row.configName}】（键名：${row.configKey}）吗？`,
    `已删除参数【${row.configName}】`,
  );
}

function handleBatchDelete(): void {
  const deletableIds = selectedRows.value
    .filter(item => item.configType !== 'Y')
    .map(item => item.id);
  if (deletableIds.length === 0) {
    return;
  }
  confirmAndDelete(
    deletableIds,
    `确认批量删除已选中的 ${deletableIds.length} 条系统参数吗？`,
    `已删除选中的 ${deletableIds.length} 条系统参数`,
  );
}

async function handleDialogSaved(): Promise<void> {
  clearTableSelection();
  await pagination.refresh();
}
</script>

<template>
  <section data-testid="sys-config-page" class="flex flex-col gap-3">
    <AtengTable
      ref="tableRef"
      v-model:selected-rows="selectedRows"
      :pagination="pagination"
      row-key="id"
      :storage-key="STORAGE_KEY"
      :show-batch-bar="false"
      :auto-height="tableAutoHeight"
      :auto-height-mode="tableAutoHeightMode"
      empty-description="暂无系统参数配置"
      search-empty-description="未检索到匹配的系统参数"
    >
      <template #query>
        <AtengQueryForm
          :model="pagination.query"
          :cols="QUERY_COLS_THREE_ITEMS"
          :default-collapsed="false"
          :show-collapse="false"
        >
          <el-form-item label="参数名称" prop="configName">
            <el-input
              v-model="pagination.query.configName"
              data-testid="config-query-name"
              clearable
              placeholder="请输入参数名称"
            />
          </el-form-item>
          <el-form-item label="参数键名" prop="configKey">
            <el-input
              v-model="pagination.query.configKey"
              data-testid="config-query-key"
              clearable
              class="font-mono-data"
              placeholder="请输入参数键名"
            />
          </el-form-item>
          <el-form-item label="参数类型" prop="configType">
            <AtengDictSelect
              v-model="pagination.query.configType"
              data-testid="config-query-type"
              dict-code="configType"
              value-type="string"
              placeholder="全部类型"
            />
          </el-form-item>
        </AtengQueryForm>
      </template>

      <template #toolbar-left>
        <el-button
          v-permission="'system:config:create'"
          data-testid="config-add-btn"
          type="primary"
          :icon="Plus"
          @click="openCreateDialog"
        >
          新增参数
        </el-button>
        <el-button
          v-permission="'system:config:delete'"
          data-testid="config-batch-delete-btn"
          type="danger"
          plain
          :disabled="selectedRows.filter(item => item.configType !== 'Y').length === 0"
          :icon="Delete"
          @click="handleBatchDelete"
        >
          批量删除{{ selectedRows.length > 0 ? ` (${selectedRows.length})` : '' }}
        </el-button>
      </template>

      <el-table-column type="selection" width="48" align="center" :selectable="isRowSelectable" />

      <el-table-column prop="configName" label="参数名称" min-width="170" show-overflow-tooltip />

      <el-table-column prop="configKey" label="参数键名" min-width="210" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="font-mono-data text-ink">{{ asConfigRow(row).configKey }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="configValue" label="参数键值" min-width="190" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="font-mono-data text-ink-secondary">{{ asConfigRow(row).configValue }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="configType" label="参数类型" width="110" align="center">
        <template #default="{ row }">
          <AtengDictTag dict-code="configType" :value="asConfigRow(row).configType" />
        </template>
      </el-table-column>

      <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="text-ink-secondary">{{ asConfigRow(row).remark?.trim() || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="createTime" label="创建时间" width="175">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asConfigRow(row).createTime || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column v-if="hasRowActions" label="操作" width="140" fixed="right" align="center">
        <template #default="{ row }">
          <div class="inline-flex items-center justify-center gap-1">
            <el-button
              v-permission="'system:config:update'"
              :data-testid="`config-edit-btn-${asConfigRow(row).id}`"
              type="primary"
              link
              size="small"
              :icon="Edit"
              @click="openEditDialog(asConfigRow(row))"
            >
              编辑
            </el-button>

            <span v-permission="'system:config:delete'" class="inline-flex">
              <el-tooltip
                v-if="asConfigRow(row).configType === 'Y'"
                content="系统内置核心参数受保护，禁止删除"
                placement="top"
              >
                <span>
                  <el-button
                    :data-testid="`config-delete-btn-${asConfigRow(row).id}`"
                    type="danger"
                    link
                    size="small"
                    disabled
                    :icon="Delete"
                  >
                    删除
                  </el-button>
                </span>
              </el-tooltip>

              <el-button
                v-else
                :data-testid="`config-delete-btn-${asConfigRow(row).id}`"
                type="danger"
                link
                size="small"
                :icon="Delete"
                @click="handleDeleteSingle(asConfigRow(row))"
              >
                删除
              </el-button>
            </span>
          </div>
        </template>
      </el-table-column>
    </AtengTable>

    <ConfigFormDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :config-id="editingConfigId"
      @saved="handleDialogSaved"
    />
  </section>
</template>

<style scoped></style>
