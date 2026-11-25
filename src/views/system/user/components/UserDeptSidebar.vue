<script setup lang="ts">
import { ref, watch } from 'vue';
import { ElButton, ElInput, ElTree } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import type { DeptTreeVO } from '@/api/system/dept';

/**
 * 用户管理左侧部门树过滤边栏：
 * 支持部门关键字实时过滤与点击节点按部门子树联动筛选右侧用户表。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'UserDeptSidebar' });

defineProps<{
  /**
   * 当前租户正常部门树数据。
   */
  deptTree: DeptTreeVO[];
  /**
   * 当前激活筛选的部门主键（用于控制全部重置按钮显隐）。
   */
  activeDeptId?: string;
}>();

const emit = defineEmits<{
  /** 选中部门节点筛选用户事件。 */
  (e: 'select', dept: { id: string; deptName: string }): void;
  /** 重置部门筛选恢复全租户视图事件。 */
  (e: 'clear'): void;
}>();

const treeRef = ref<InstanceType<typeof ElTree>>();
const keyword = ref<string>('');

function filterDeptNode(value: string, data: Record<string, unknown>): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return true;
  }
  const name = typeof data.deptName === 'string' ? data.deptName.toLowerCase() : '';
  return name.includes(trimmed);
}

watch(keyword, val => {
  treeRef.value?.filter(val);
});

function handleNodeClick(data: Record<string, unknown>): void {
  const id = typeof data.id === 'string' ? data.id : '';
  const deptName = typeof data.deptName === 'string' ? data.deptName : '';
  if (!id) {
    return;
  }
  emit('select', { id, deptName });
}

function clearSelection(): void {
  treeRef.value?.setCurrentKey(undefined);
}

defineExpose({ clearSelection });
</script>

<template>
  <aside
    data-testid="user-dept-tree-panel"
    class="flex h-full flex-col gap-2.5 rounded-[var(--solid-radius-lg)] border border-border bg-surface p-3"
  >
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium text-ink">部门架构</span>
      <el-button
        v-if="activeDeptId"
        data-testid="user-dept-reset-btn"
        type="primary"
        link
        size="small"
        @click="emit('clear')"
      >
        全部
      </el-button>
    </div>
    <el-input
      v-model="keyword"
      data-testid="user-dept-search"
      size="small"
      clearable
      :prefix-icon="Search"
      placeholder="过滤部门名称"
    />
    <div class="min-h-0 flex-1 overflow-y-auto">
      <el-tree
        ref="treeRef"
        data-testid="user-dept-tree"
        :data="deptTree"
        node-key="id"
        highlight-current
        default-expand-all
        :expand-on-click-node="false"
        :filter-node-method="filterDeptNode"
        :props="{ label: 'deptName', children: 'children' }"
        empty-text="暂无部门节点"
        @node-click="handleNodeClick"
      />
    </div>
  </aside>
</template>

<style scoped></style>
