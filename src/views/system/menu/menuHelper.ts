import type { MenuSaveRequest, MenuTreeVO } from '@/api/system/menu';
import type { CommonStatus, MenuType, VisibleStatus } from '@/api/types';
import { collectTreeSubtreeIds } from '@/utils/tree';

/**
 * 菜单权限树管理纯逻辑辅助函数（节点父级约束、类型升降级保护、平台专属继承与提交字段清洗）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export const ROOT_MENU_ID = '0';
const ROOT_MENU_LABEL = '顶级菜单（根目录）';
export const ROUTE_NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
export const PERMS_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*:[a-z][a-z0-9-*]*$/;
export const EXTERNAL_URL_PATTERN = /^https?:\/\/.+/;

export const MENU_TYPE_LABEL_MAP: Record<MenuType, string> = {
  M: '目录',
  C: '菜单',
  F: '按钮',
};

export const MENU_TYPE_TAG_TYPE: Record<MenuType, 'primary' | 'success' | 'info'> = {
  M: 'primary',
  C: 'success',
  F: 'info',
};

export const MENU_TYPE_OPTIONS: Array<{ label: string; value: MenuType }> = [
  { label: '目录', value: 'M' },
  { label: '菜单', value: 'C' },
  { label: '按钮', value: 'F' },
];

/**
 * 上级菜单树形选择器节点模型（适配 Element Plus ElTreeSelect）。
 */
export interface MenuParentSelectorOption {
  /**
   * 节点主键（顶级虚拟根为 '0'）
   */
  id: string;
  /**
   * 节点名称
   */
  label: string;
  /**
   * 节点类型
   */
  menuType: MenuType;
  /**
   * 是否仅平台专属
   */
  platformOnly: boolean;
  /**
   * 是否禁选
   */
  disabled: boolean;
  /**
   * 下级节点集合
   */
  children: MenuParentSelectorOption[];
}

/**
 * 菜单抽屉内部编辑态草稿模型（保留切换类型或外链前的输入现场）。
 */
export interface MenuFormDraft {
  mode: 'create' | 'edit';
  id?: string;
  parentId: string;
  menuType: MenuType;
  title: string;
  name: string;
  path: string;
  component: string;
  redirect: string;
  perms: string;
  icon: string;
  sort: number;
  visible: VisibleStatus;
  status: CommonStatus;
  keepAlive: boolean;
  isExternal: boolean;
  platformOnly: boolean;
}

/**
 * 在菜单树中按主键查找目标节点。
 *
 * @param nodes    菜单树集合
 * @param targetId 节点主键
 * @returns 匹配的节点对象；未命中返回 `undefined`
 */
export function findMenuNodeById(
  nodes: MenuTreeVO[],
  targetId?: string | null,
): MenuTreeVO | undefined {
  const trimmed = targetId?.trim();
  if (!trimmed || trimmed === ROOT_MENU_ID) {
    return undefined;
  }
  for (const item of nodes) {
    if (item.id === trimmed) {
      return item;
    }
    if (item.children?.length) {
      const matched = findMenuNodeById(item.children, trimmed);
      if (matched) {
        return matched;
      }
    }
  }
  return undefined;
}

/**
 * 构造不同节点类型（M/C/F）对应的合法父级菜单树选择器选项。
 * - `M`/`C` 仅可挂在顶级根 `'0'` 或目录 `'M'` 下；
 * - `F` 仅可挂在菜单 `'C'` 下（目录 `'M'` 保留作层级路径但禁用）。
 *
 * @param nodes         完整菜单树
 * @param menuType      当前选择节点类型
 * @param editingMenuId 编辑态自身主键（禁用自身及子树防自环）
 * @returns 适配 ElTreeSelect 的选择器节点树
 */
export function buildMenuParentOptions(
  nodes: MenuTreeVO[],
  menuType: MenuType,
  editingMenuId?: string | null,
): MenuParentSelectorOption[] {
  const forbiddenIds = collectTreeSubtreeIds(nodes, editingMenuId);

  if (menuType === 'F') {
    const mapForButton = (items: MenuTreeVO[]): MenuParentSelectorOption[] =>
      items
        .filter(item => item.menuType !== 'F')
        .map(item => ({
          id: item.id,
          label: item.title,
          menuType: item.menuType,
          platformOnly: item.platformOnly,
          disabled: item.menuType !== 'C' || forbiddenIds.has(item.id),
          children: item.menuType === 'C' ? [] : mapForButton(item.children ?? []),
        }));
    return mapForButton(nodes);
  }

  const mapDirectoryOnly = (items: MenuTreeVO[]): MenuParentSelectorOption[] =>
    items
      .filter(item => item.menuType === 'M')
      .map(item => ({
        id: item.id,
        label: item.title,
        menuType: item.menuType,
        platformOnly: item.platformOnly,
        disabled: forbiddenIds.has(item.id),
        children: mapDirectoryOnly(item.children ?? []),
      }));

  return [
    {
      id: ROOT_MENU_ID,
      label: ROOT_MENU_LABEL,
      menuType: 'M',
      platformOnly: false,
      disabled: false,
      children: [],
    },
    ...mapDirectoryOnly(nodes),
  ];
}

/**
 * 根据节点既有直接子节点拓扑计算编辑态允许保留或切换的节点类型列表（对齐后端 SysMenuService 降级保护）。
 *
 * @param node 完整菜单树中的目标节点
 * @returns 允许选择的节点类型集合
 */
export function getAllowedMenuTypesForEdit(node?: MenuTreeVO | null): MenuType[] {
  const children = node?.children ?? [];
  if (children.length === 0) {
    return ['M', 'C', 'F'];
  }
  const hasDirOrMenu = children.some(item => item.menuType === 'M' || item.menuType === 'C');
  const hasButton = children.some(item => item.menuType === 'F');
  if (hasDirOrMenu && !hasButton) {
    return ['M'];
  }
  if (hasButton && !hasDirOrMenu) {
    return ['C'];
  }
  return node ? [node.menuType] : ['M', 'C', 'F'];
}

/**
 * 检查所选父节点（或其祖先）是否标记为平台专属（平台专属下新增或挂载的子节点强制继承）。
 *
 * @param nodes    完整菜单树
 * @param parentId 父节点主键
 * @returns 父链存在平台专属标记返回 `true`
 */
export function isMenuParentPlatformOnly(nodes: MenuTreeVO[], parentId?: string | null): boolean {
  const trimmed = parentId?.trim();
  if (!trimmed || trimmed === ROOT_MENU_ID) {
    return false;
  }

  const walk = (items: MenuTreeVO[], ancestorPlatformOnly: boolean): boolean | undefined => {
    for (const item of items) {
      const currentPlatformOnly = ancestorPlatformOnly || item.platformOnly;
      if (item.id === trimmed) {
        return currentPlatformOnly;
      }
      if (item.children?.length) {
        const nested = walk(item.children, currentPlatformOnly);
        if (nested !== undefined) {
          return nested;
        }
      }
    }
    return undefined;
  };

  return walk(nodes, false) ?? false;
}

/**
 * 推导点击某节点行 [新增] 时的默认子节点类型。
 *
 * @param parent 父节点；顶级新增传入 `undefined`
 * @returns 推荐子节点类型
 */
export function getDefaultChildMenuType(parent?: MenuTreeVO | null): MenuType {
  if (!parent) {
    return 'M';
  }
  return parent.menuType === 'M' ? 'C' : 'F';
}

/**
 * 按 M / C / F 与外链规则清洗菜单提交载荷，避免隐藏字段残留引发后端校验驳回。
 *
 * @param draft 抽屉当前表单草稿
 * @returns 对齐后端 MenuSaveRequest 契约的干净请求体
 */
export function sanitizeMenuSavePayload(draft: MenuFormDraft): MenuSaveRequest {
  const base = {
    id: draft.mode === 'edit' ? draft.id : undefined,
    parentId: draft.parentId.trim() || ROOT_MENU_ID,
    menuType: draft.menuType,
    title: draft.title.trim(),
    sort: Number(draft.sort) || 0,
    status: draft.status,
    platformOnly: draft.platformOnly,
  };

  if (draft.menuType === 'F') {
    return {
      ...base,
      name: null,
      path: null,
      component: null,
      redirect: null,
      perms: draft.perms.trim(),
      icon: null,
      visible: 0,
      keepAlive: false,
      isExternal: false,
    };
  }

  if (draft.menuType === 'M') {
    return {
      ...base,
      name: null,
      path: draft.path.trim(),
      component: null,
      redirect: draft.redirect.trim() || null,
      perms: null,
      icon: draft.icon.trim() || null,
      visible: draft.visible,
      keepAlive: false,
      isExternal: false,
    };
  }

  if (draft.isExternal) {
    return {
      ...base,
      name: null,
      path: draft.path.trim(),
      component: null,
      redirect: null,
      perms: draft.perms.trim() || null,
      icon: draft.icon.trim() || null,
      visible: draft.visible,
      keepAlive: false,
      isExternal: true,
    };
  }

  return {
    ...base,
    name: draft.name.trim(),
    path: draft.path.trim(),
    component: draft.component.trim(),
    redirect: null,
    perms: draft.perms.trim() || null,
    icon: draft.icon.trim() || null,
    visible: draft.visible,
    keepAlive: draft.keepAlive,
    isExternal: false,
  };
}
