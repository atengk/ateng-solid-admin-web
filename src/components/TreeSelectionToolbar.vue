<script setup lang="ts">
import { ElButton, ElCheckbox } from 'element-plus';

/**
 * 树形权限选择器顶部工具栏（提供一键展开/折叠、全选/全不选及父子联动开关）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'TreeSelectionToolbar' });

defineProps<{
  /**
   * 当前是否处于全部展开态。
   */
  expandedAll: boolean;
  /**
   * 当前是否处于全选态。
   */
  allSelected: boolean;
  /**
   * 父子联动状态（v-model:strictly）。
   */
  strictly: boolean;
  /**
   * 控件 testId 前缀（用于区分菜单树或部门树定位）。
   */
  testIdPrefix: string;
}>();

const emit = defineEmits<{
  /**
   * 切换全部展开或折叠事件。
   */
  (e: 'toggle-expand'): void;
  /**
   * 切换全选或全不选事件。
   */
  (e: 'toggle-select-all'): void;
  /**
   * 父子联动开关双向绑定更新事件。
   */
  (e: 'update:strictly', value: boolean): void;
  /**
   * 父子联动开关显式变更事件（供组件同步重算树勾选态）。
   */
  (e: 'strictly-change', value: boolean): void;
}>();

function handleStrictlyChange(val: string | number | boolean): void {
  const checked = Boolean(val);
  emit('update:strictly', checked);
  emit('strictly-change', checked);
}
</script>

<template>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <el-button
        :data-testid="`${testIdPrefix}-expand-btn`"
        size="small"
        plain
        @click="emit('toggle-expand')"
      >
        {{ expandedAll ? '折叠全部' : '展开全部' }}
      </el-button>
      <el-button
        :data-testid="`${testIdPrefix}-select-all-btn`"
        size="small"
        plain
        @click="emit('toggle-select-all')"
      >
        {{ allSelected ? '全不选' : '全选' }}
      </el-button>
    </div>
    <el-checkbox
      :model-value="strictly"
      :name="`${testIdPrefix}-strictly`"
      :data-testid="`${testIdPrefix}-strictly`"
      @change="handleStrictlyChange"
    >
      父子联动
    </el-checkbox>
  </div>
</template>

<style scoped></style>
