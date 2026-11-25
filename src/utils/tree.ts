/**
 * 通用树形结构遍历与子树主键收集工具（供部门树与菜单树视图共享）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export interface TreeNodeShape {
  id: string;
  children?: TreeNodeShape[];
}

function collectDescendants<T extends { id: string; children?: T[] }>(
  node: T,
  collector: Set<string>,
): void {
  collector.add(node.id);
  for (const child of node.children ?? []) {
    collectDescendants(child, collector);
  }
}

/**
 * 收集目标节点及其全部子孙节点主键集合（用于编辑时禁用自身与子孙节点防自环）。
 *
 * @param nodes    完整树节点集合
 * @param targetId 目标节点主键
 * @returns 包含自身及全部子孙节点主键的集合
 */
export function collectTreeSubtreeIds<T extends { id: string; children?: T[] }>(
  nodes: T[],
  targetId?: string | null,
): Set<string> {
  const result = new Set<string>();
  const trimmed = targetId?.trim();
  if (!trimmed) {
    return result;
  }

  const walk = (items: T[]): boolean => {
    for (const item of items) {
      if (item.id === trimmed) {
        collectDescendants(item, result);
        return true;
      }
      if (item.children?.length && walk(item.children)) {
        return true;
      }
    }
    return false;
  };

  walk(nodes);
  return result;
}

/**
 * 先序遍历展平树节点列表。
 *
 * @param nodes 树节点数组
 * @returns 扁平节点集合
 */
export function flattenTreeNodes<T extends { children?: T[] }>(nodes: T[]): T[] {
  const result: T[] = [];
  const walk = (items: T[]): void => {
    for (const item of items) {
      result.push(item);
      if (item.children?.length) {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return result;
}
