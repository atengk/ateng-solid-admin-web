import type { FormRules } from 'element-plus';
import type { MenuTreeVO } from '@/api/system/menu';
import type { DataScopeValue, RoleVO } from '@/api/system/role';

/**
 * 角色权限管理纯逻辑辅助函数（联动态叶子回显防误全选、半选合并及 CUSTOM 数据范围校验）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export const DATA_SCOPE_CUSTOM: DataScopeValue = 2;
export const CUSTOM_DATA_SCOPE_ERROR_MESSAGE = '选择自定部门数据权限时，至少需勾选 1 个部门';
export const ROLE_PROTECTED_TOOLTIP = '平台内置超级管理员角色受系统保护，不可编辑、停用或删除';

const ROLE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const RESERVED_ROLE_KEYS = new Set(['super_admin', 'admin']);

/**
 * 判断目标角色是否为受保护的平台内置超级管理员角色。
 *
 * @param role 角色列表行或详情对象
 * @returns 若为内置超级管理员角色返回 `true`
 */
export function isProtectedRole(role: Pick<RoleVO, 'builtinSuperAdmin' | 'roleKey'>): boolean {
  return role.builtinSuperAdmin || role.roleKey === 'super_admin';
}

/**
 * 将树节点 ID 或键值数组去重并剔除空白串，保留输入顺序。
 *
 * @param keys 原始主键列表
 * @returns 去重后的有效字符串主键数组
 */
export function normalizeUniqueIds(keys?: readonly (string | number)[] | null): string[] {
  if (!Array.isArray(keys)) {
    return [];
  }
  const seen = new Set<string>();
  for (const raw of keys) {
    const trimmed = String(raw ?? '').trim();
    if (trimmed) {
      seen.add(trimmed);
    }
  }
  return Array.from(seen);
}

/**
 * 收集通用树结构中的全部节点主键（用于全选按钮与一键展开/折叠）。
 *
 * @param nodes 树节点列表
 * @returns 树中全部节点主键集合
 */
export function collectTreeNodeIds<T extends { id: string; children?: T[] }>(
  nodes: readonly T[],
): string[] {
  const result: string[] = [];
  const walk = (items: readonly T[]): void => {
    for (const item of items) {
      result.push(item.id);
      if (item.children?.length) {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return result;
}

function collectTreeLeafIdSet(nodes: readonly MenuTreeVO[]): Set<string> {
  const leafSet = new Set<string>();
  const walk = (items: readonly MenuTreeVO[]): void => {
    for (const item of items) {
      if (!item.children || item.children.length === 0) {
        leafSet.add(item.id);
      } else {
        walk(item.children);
      }
    }
  };
  walk(nodes);
  return leafSet;
}

/**
 * 计算角色编辑抽屉在绑定菜单树时应当传入 {@code el-tree.setCheckedKeys} 的初始勾选主键。
 * 联动态（{@code menuCheckStrictly = true}）仅返回末端叶子节点主键，避免传入半选父目录导致全部兄弟节点被误全选；
 * 独立态（{@code menuCheckStrictly = false}）保留全量去重主键。
 *
 * @param tree              当前租户可授权菜单树
 * @param boundMenuIds      后端返回的角色已绑定菜单主键集合
 * @param menuCheckStrictly 菜单树是否父子联动
 * @returns 适配 {@code el-tree.setCheckedKeys} 的主键数组
 */
export function resolveInitialCheckedMenuKeys(
  tree: readonly MenuTreeVO[],
  boundMenuIds: readonly string[],
  menuCheckStrictly: boolean,
): string[] {
  const normalized = normalizeUniqueIds(boundMenuIds);
  if (!menuCheckStrictly) {
    return normalized;
  }
  const leafSet = collectTreeLeafIdSet(tree);
  return normalized.filter(id => leafSet.has(id));
}

/**
 * 汇总角色菜单授权提交时的菜单主键集合。
 * 联动态需合并 {@code getCheckedKeys()} 与 {@code getHalfCheckedKeys()} 确保上级目录 M 与路由树结构完整保存；
 * 独立态仅提交全选节点。
 *
 * @param checkedKeys       树控件全选节点主键
 * @param halfCheckedKeys   树控件半选父节点主键
 * @param menuCheckStrictly 菜单树是否父子联动
 * @returns 去重后的提交菜单主键列表
 */
export function collectSubmittedMenuIds(
  checkedKeys: readonly string[],
  halfCheckedKeys: readonly string[],
  menuCheckStrictly: boolean,
): string[] {
  if (!menuCheckStrictly) {
    return normalizeUniqueIds(checkedKeys);
  }
  return normalizeUniqueIds([...checkedKeys, ...halfCheckedKeys]);
}

/**
 * 校验自定部门数据权限（dataScope = 2）是否满足至少勾选 1 个部门的业务约束。
 *
 * @param dataScope 数据范围枚举值（1~5）
 * @param deptIds   当前勾选的部门主键数组
 * @returns 校验通过返回 `null`，否则返回阻断提示文案
 */
export function validateCustomDataScope(
  dataScope: DataScopeValue,
  deptIds: readonly string[],
): string | null {
  if (dataScope !== DATA_SCOPE_CUSTOM) {
    return null;
  }
  return normalizeUniqueIds(deptIds).length > 0 ? null : CUSTOM_DATA_SCOPE_ERROR_MESSAGE;
}

/**
 * 构造角色新增与编辑表单校验规则表（含保留角色编码 super_admin/admin 阻断校验）。
 *
 * @returns 适配 Element Plus ElForm 的校验规则对象
 */
export function buildRoleFormRules(): FormRules {
  return {
    roleName: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (trimmed.length < 2 || trimmed.length > 50) {
            callback(new Error('角色名称长度须在 2~50 个字符之间'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    roleKey: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (trimmed.length < 2 || trimmed.length > 64 || !ROLE_KEY_PATTERN.test(trimmed)) {
            callback(new Error('角色编码须为 2~64 位字母、数字、下划线或短横线'));
            return;
          }
          if (RESERVED_ROLE_KEYS.has(trimmed.toLowerCase())) {
            callback(new Error('禁止使用保留角色编码 super_admin 或 admin'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    sort: [{ required: true, type: 'number', message: '请输入显示排序（0~9999）', trigger: 'blur' }],
    remark: [
      {
        validator: (_rule, value: string, callback) => {
          if ((value ?? '').trim().length > 500) {
            callback(new Error('备注长度不能超过 500 个字符'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
  };
}
