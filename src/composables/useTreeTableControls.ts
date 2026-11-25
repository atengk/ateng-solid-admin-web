import { ref, type Ref } from 'vue';
import type { AtengTableInstance } from '@atengk/element-plus';
import { flattenTreeNodes } from '@/utils/tree';

/**
 * 无分页树形表格协同控制（统一处理全部展开/折叠切换与 AtengQueryForm 重置双发防抖）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export interface UseTreeTableControlsOptions<T extends object & { children?: T[] }> {
  /**
   * 树形数据响应式数组
   */
  treeData: Ref<T[]>;
  /**
   * 执行树数据加载的函数
   */
  onLoad: () => void | Promise<void>;
  /**
   * 清空查询条件回调
   */
  onResetFields: () => void;
  /**
   * 初始展开状态，默认全部展开
   */
  defaultExpanded?: boolean;
}

/**
 * 为树形管理页提供一致的展开切换与防重查控制状态。
 *
 * @param options 树形表格控制选项
 * @returns 表格实例引用、展开态与标准事件处理方法
 */
export function useTreeTableControls<T extends object & { children?: T[] }>(
  options: UseTreeTableControlsOptions<T>,
) {
  const tableRef = ref<AtengTableInstance<T>>();
  const isAllExpanded = ref<boolean>(options.defaultExpanded ?? true);
  let skipNextQuerySearch = false;

  function applyTreeExpansion(expanded: boolean): void {
    const elTable = tableRef.value?.tableRef as
      | (NonNullable<AtengTableInstance<T>['tableRef']> & {
          toggleRowExpansion?: (row: T, expanded?: boolean) => void;
        })
      | undefined;
    if (!elTable || typeof elTable.toggleRowExpansion !== 'function') {
      return;
    }
    for (const node of flattenTreeNodes(options.treeData.value)) {
      if (node.children && node.children.length > 0) {
        elTable.toggleRowExpansion(node, expanded);
      }
    }
  }

  function toggleExpandAll(): void {
    isAllExpanded.value = !isAllExpanded.value;
    applyTreeExpansion(isAllExpanded.value);
  }

  function handleQuerySearch(): void {
    if (skipNextQuerySearch) {
      skipNextQuerySearch = false;
      return;
    }
    void options.onLoad();
  }

  function handleQueryReset(): void {
    options.onResetFields();
    // AtengQueryForm 在无 pagination 的 AtengTable 内重置时将紧接着触发 tableContext.reset -> @refresh，跳过此次重复检索
    skipNextQuerySearch = true;
    queueMicrotask(() => {
      skipNextQuerySearch = false;
    });
  }

  return {
    tableRef,
    isAllExpanded,
    applyTreeExpansion,
    toggleExpandAll,
    handleQuerySearch,
    handleQueryReset,
  };
}
