<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import {
  ElButton,
  ElFormItem,
  ElIcon,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTableColumn,
  ElTag,
} from 'element-plus';
import { Delete, Edit, Expand, Fold, Plus } from '@element-plus/icons-vue';
import { AtengDictSelect, AtengDictTag, AtengQueryForm, AtengTable } from '@atengk/element-plus';
import {
  deleteMenu,
  getMenuTree,
  updateMenuStatus,
  type MenuQuery,
  type MenuTreeVO,
} from '@/api/system/menu';
import type { CommonStatus, MenuType } from '@/api/types';
import {
  QUERY_COLS_THREE_ITEMS,
  QUERY_FORM_LOADING_DELAY,
  useListTableLayout,
} from '@/composables/useListTableLayout';
import { useTreeTableControls } from '@/composables/useTreeTableControls';
import { useAuthStore } from '@/stores/auth';
import { withDictPreload } from '@/utils/dict';
import { isGlobalHandledHttpError, resolveErrorMessage } from '@/utils/http';
import { resolveMenuIcon } from '@/utils/icon';
import MenuFormDrawer from '@/views/system/menu/components/MenuFormDrawer.vue';
import {
  getDefaultChildMenuType,
  MENU_TYPE_LABEL_MAP,
  MENU_TYPE_TAG_TYPE,
  ROOT_MENU_ID,
} from '@/views/system/menu/menuHelper';

/**
 * 菜单权限树管理视图（/system/menu）：
 * 展示平台完整 M/C/F 三级权限树、平台专属标识、动态抽屉编辑与受控删除提示。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'SysMenu' });

const STORAGE_KEY = 'solid:table:sys-menu';

const authStore = useAuthStore();
const { tableAutoHeight, tableAutoHeightMode } = useListTableLayout();

const query = reactive<MenuQuery>({
  title: '',
  status: undefined,
  platformOnly: undefined,
});

const menuTree = ref<MenuTreeVO[]>([]);
const loading = ref<boolean>(false);
const loadError = ref<unknown>(undefined);
const statusUpdatingId = ref<string>('');

const drawerVisible = ref<boolean>(false);
const drawerMode = ref<'create' | 'edit'>('create');
const editingMenuId = ref<string | undefined>(undefined);
const initialParentId = ref<string>(ROOT_MENU_ID);
const initialMenuType = ref<MenuType>('M');

const canUpdateMenu = computed<boolean>(() => authStore.hasPermission('system:menu:update'));
const hasRowActions = computed<boolean>(() =>
  authStore.hasPermission(['system:menu:create', 'system:menu:update', 'system:menu:delete']),
);

function asMenuRow(row: unknown): MenuTreeVO {
  return row as MenuTreeVO;
}

const {
  tableRef,
  isAllExpanded,
  applyTreeExpansion,
  toggleExpandAll,
  handleQuerySearch,
  handleQueryReset,
} = useTreeTableControls<MenuTreeVO>({
  treeData: menuTree,
  onLoad: loadMenuTree,
  onResetFields: () => {
    query.title = '';
    query.status = undefined;
    query.platformOnly = undefined;
  },
});

async function loadMenuTree(): Promise<void> {
  if (loading.value) {
    return;
  }
  loading.value = true;
  loadError.value = undefined;
  try {
    menuTree.value = await withDictPreload(['visibleStatus'], () =>
      getMenuTree({
        title: query.title?.trim() || undefined,
        status: typeof query.status === 'number' ? query.status : undefined,
        platformOnly: typeof query.platformOnly === 'boolean' ? query.platformOnly : undefined,
      }),
    );
    await nextTick();
    applyTreeExpansion(isAllExpanded.value);
  } catch (error) {
    loadError.value = error;
    const message = resolveErrorMessage(error, '加载菜单权限树失败，请稍后重试');
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(message);
    }
  } finally {
    loading.value = false;
  }
}

function openCreateDrawer(parent?: MenuTreeVO): void {
  drawerMode.value = 'create';
  editingMenuId.value = undefined;
  initialParentId.value = parent?.id ?? ROOT_MENU_ID;
  initialMenuType.value = getDefaultChildMenuType(parent);
  drawerVisible.value = true;
}

function openEditDrawer(row: MenuTreeVO): void {
  drawerMode.value = 'edit';
  editingMenuId.value = row.id;
  initialParentId.value = row.parentId || ROOT_MENU_ID;
  initialMenuType.value = row.menuType;
  drawerVisible.value = true;
}

async function handleToggleStatus(row: MenuTreeVO): Promise<void> {
  if (!canUpdateMenu.value || statusUpdatingId.value === row.id) {
    return;
  }
  const nextStatus: CommonStatus = row.status === 0 ? 1 : 0;
  const actionText = nextStatus === 0 ? '启用' : '停用';

  try {
    await ElMessageBox.confirm(`确认要${actionText}菜单【${row.title}】吗？`, '操作确认', {
      type: 'warning',
      confirmButtonText: `确认${actionText}`,
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  statusUpdatingId.value = row.id;
  try {
    await updateMenuStatus(row.id, nextStatus);
    ElMessage.success(`已${actionText}菜单【${row.title}】`);
    await loadMenuTree();
  } catch (error) {
    const message = resolveErrorMessage(error, `${actionText}菜单失败，请稍后重试`);
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(message);
    }
  } finally {
    statusUpdatingId.value = '';
  }
}

async function handleDelete(row: MenuTreeVO): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认删除节点【${row.title}】吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }

  try {
    await deleteMenu(row.id);
    ElMessage.success(`已删除节点【${row.title}】`);
    await loadMenuTree();
  } catch (error) {
    const message = resolveErrorMessage(error, '删除菜单节点失败，请稍后重试');
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(message);
    }
  }
}

onMounted(() => {
  void loadMenuTree();
});
</script>

<template>
  <section data-testid="sys-menu-page" class="flex flex-col gap-3">
    <AtengTable
      ref="tableRef"
      :data="menuTree"
      :loading="loading"
      :error="loadError"
      row-key="id"
      :storage-key="STORAGE_KEY"
      :show-pagination="false"
      :auto-height="tableAutoHeight"
      :auto-height-mode="tableAutoHeightMode"
      :default-expand-all="true"
      :tree-props="{ children: 'children' }"
      empty-description="暂无菜单权限配置"
      search-empty-description="未检索到匹配的菜单或按钮权限"
      @refresh="loadMenuTree"
    >
      <template #query>
        <AtengQueryForm
          :model="query"
          :cols="QUERY_COLS_THREE_ITEMS"
          :default-collapsed="false"
          :show-collapse="false"
          :loading-delay="QUERY_FORM_LOADING_DELAY"
          @search="handleQuerySearch"
          @reset="handleQueryReset"
        >
          <el-form-item label="菜单名称" prop="title">
            <el-input
              v-model="query.title"
              data-testid="menu-query-title"
              clearable
              placeholder="请输入菜单或按钮名称"
            />
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <AtengDictSelect
              v-model="query.status"
              data-testid="menu-query-status"
              dict-code="commonStatus"
              value-type="number"
              placeholder="全部状态"
            />
          </el-form-item>
          <el-form-item label="平台归属" prop="platformOnly">
            <el-select
              v-model="query.platformOnly"
              data-testid="menu-query-platform-only"
              clearable
              :value-on-clear="undefined"
              placeholder="全部归属"
            >
              <el-option label="仅平台专属" :value="true" />
              <el-option label="租户可分发" :value="false" />
            </el-select>
          </el-form-item>
        </AtengQueryForm>
      </template>

      <template #toolbar-left>
        <el-button
          v-permission="'system:menu:create'"
          data-testid="menu-add-btn"
          type="primary"
          :icon="Plus"
          @click="openCreateDrawer()"
        >
          新增菜单
        </el-button>
        <el-button
          data-testid="menu-expand-toggle-btn"
          :icon="isAllExpanded ? Fold : Expand"
          @click="toggleExpandAll"
        >
          {{ isAllExpanded ? '折叠全部' : '展开全部' }}
        </el-button>
      </template>

      <el-table-column prop="title" label="名称" min-width="196" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="inline-flex items-center gap-1.5">
            <el-icon
              v-if="resolveMenuIcon(asMenuRow(row).icon ?? undefined)"
              :size="15"
              class="text-ink-secondary"
            >
              <component :is="resolveMenuIcon(asMenuRow(row).icon ?? undefined)" />
            </el-icon>
            <span class="font-medium text-ink">{{ asMenuRow(row).title }}</span>
            <el-tag v-if="asMenuRow(row).platformOnly" size="small" type="warning">
              平台专属
            </el-tag>
            <el-tag v-if="asMenuRow(row).isExternal" size="small" type="info">外链</el-tag>
          </span>
        </template>
      </el-table-column>

      <el-table-column prop="menuType" label="类型" width="74" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="MENU_TYPE_TAG_TYPE[asMenuRow(row).menuType]">
            {{ MENU_TYPE_LABEL_MAP[asMenuRow(row).menuType] }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column prop="path" label="路由路径" min-width="136" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="font-mono-data text-ink-secondary">{{ asMenuRow(row).path || '--' }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="component" label="组件标识" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="asMenuRow(row).name || asMenuRow(row).component" class="font-mono-data">
            {{ asMenuRow(row).name ? `${asMenuRow(row).name} · ` : ''
            }}{{ asMenuRow(row).component || '' }}
          </span>
          <span v-else class="text-ink-muted">--</span>
        </template>
      </el-table-column>

      <el-table-column prop="perms" label="权限标识" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <code v-if="asMenuRow(row).perms" class="font-mono-data text-xs text-ink">
            {{ asMenuRow(row).perms }}
          </code>
          <span v-else class="text-ink-muted">--</span>
        </template>
      </el-table-column>

      <el-table-column prop="sort" label="排序" width="66" align="center">
        <template #default="{ row }">
          <span class="tabular-nums">{{ asMenuRow(row).sort }}</span>
        </template>
      </el-table-column>

      <el-table-column prop="visible" label="显隐" width="76" align="center">
        <template #default="{ row }">
          <AtengDictTag
            v-if="asMenuRow(row).menuType !== 'F'"
            dict-code="visibleStatus"
            :value="asMenuRow(row).visible"
          />
          <span v-else class="text-ink-muted">--</span>
        </template>
      </el-table-column>

      <el-table-column prop="status" label="状态" width="84" align="center">
        <template #default="{ row }">
          <el-switch
            :data-testid="`menu-status-switch-${asMenuRow(row).id}`"
            :model-value="asMenuRow(row).status === 0"
            :disabled="!canUpdateMenu"
            :loading="statusUpdatingId === asMenuRow(row).id"
            inline-prompt
            active-text="启用"
            inactive-text="停用"
            @change="handleToggleStatus(asMenuRow(row))"
          />
        </template>
      </el-table-column>

      <el-table-column v-if="hasRowActions" label="操作" width="190" fixed="right" align="center">
        <template #default="{ row }">
          <div class="inline-flex items-center justify-center gap-1">
            <el-button
              v-if="asMenuRow(row).menuType !== 'F'"
              v-permission="'system:menu:create'"
              :data-testid="`menu-add-child-btn-${asMenuRow(row).id}`"
              type="primary"
              link
              size="small"
              :icon="Plus"
              @click="openCreateDrawer(asMenuRow(row))"
            >
              新增
            </el-button>

            <el-button
              v-permission="'system:menu:update'"
              :data-testid="`menu-edit-btn-${asMenuRow(row).id}`"
              type="primary"
              link
              size="small"
              :icon="Edit"
              @click="openEditDrawer(asMenuRow(row))"
            >
              编辑
            </el-button>

            <el-button
              v-permission="'system:menu:delete'"
              :data-testid="`menu-delete-btn-${asMenuRow(row).id}`"
              type="danger"
              link
              size="small"
              :icon="Delete"
              @click="handleDelete(asMenuRow(row))"
            >
              删除
            </el-button>
          </div>
        </template>
      </el-table-column>
    </AtengTable>

    <MenuFormDrawer
      v-model="drawerVisible"
      :mode="drawerMode"
      :menu-id="editingMenuId"
      :initial-parent-id="initialParentId"
      :initial-menu-type="initialMenuType"
      @saved="loadMenuTree"
    />
  </section>
</template>

<style scoped></style>
