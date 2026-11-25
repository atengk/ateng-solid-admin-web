import type { FormRules } from 'element-plus';
import type { MenuTreeVO } from '@/api/system/menu';
import type { TenantPackageSaveRequest } from '@/api/system/tenant-package';
import type { CommonStatus } from '@/api/types';
import { normalizeUniqueIds } from '@/views/system/role/roleHelper';

/**
 * 租户套餐管理纯逻辑辅助函数（主动过滤 platformOnly/停用节点双防线、缩减检测与保存载荷构造）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 租户套餐表单状态模型。
 */
export interface TenantPackageFormState {
  id?: string;
  packageName: string;
  menuCheckStrictly: boolean;
  status: CommonStatus;
  remark: string;
}

/**
 * 判断单个菜单节点是否应从租户套餐可授权树中排除（平台专属或已停用均不得下放）。
 *
 * @param node 菜单树节点
 * @returns 若应排除返回 `true`
 */
export function isExcludedPackageMenuNode(node: MenuTreeVO): boolean {
  const platformFlag: unknown = node.platformOnly;
  const isPlatformOnly = platformFlag === true || platformFlag === 1 || platformFlag === '1';
  return isPlatformOnly || node.status !== 0;
}

/**
 * 递归过滤菜单权限树，主动剔除所有 `platformOnly` 节点及停用节点，与后端 `102006` 构成双防线。
 *
 * @param nodes 原始菜单树节点数组
 * @returns 仅含正常非平台专属节点的干净菜单树
 */
export function filterPackageAssignableMenus(nodes?: readonly MenuTreeVO[] | null): MenuTreeVO[] {
  if (!Array.isArray(nodes)) {
    return [];
  }
  const filtered: MenuTreeVO[] = [];
  for (const node of nodes) {
    if (isExcludedPackageMenuNode(node)) {
      continue;
    }
    filtered.push({
      ...node,
      children: filterPackageAssignableMenus(node.children),
    });
  }
  return filtered;
}

/**
 * 判断编辑套餐后待提交的菜单主键集合相对原绑定集合是否移除了至少 1 项菜单。
 *
 * @param originalMenuIds 编辑加载时的原绑定菜单主键列表
 * @param nextMenuIds     当前勾选准备提交的菜单主键列表
 * @returns 存在任意被移除菜单返回 `true`
 */
export function hasRemovedMenuIds(
  originalMenuIds: readonly string[],
  nextMenuIds: readonly string[],
): boolean {
  const normalizedOriginal = normalizeUniqueIds(originalMenuIds);
  if (normalizedOriginal.length === 0) {
    return false;
  }
  const nextSet = new Set(normalizeUniqueIds(nextMenuIds));
  return normalizedOriginal.some(id => !nextSet.has(id));
}

/**
 * 将套餐表单与树勾选状态封装为标准 `TenantPackageSaveRequest` 载荷。
 *
 * @param mode    操作模式（新增或编辑）
 * @param form    套餐表单状态
 * @param menuIds 归一化后的菜单主键集合
 * @returns 套餐保存请求载荷
 */
export function buildTenantPackageSavePayload(
  mode: 'create' | 'edit',
  form: TenantPackageFormState,
  menuIds: readonly string[],
): TenantPackageSaveRequest {
  return {
    id: mode === 'edit' ? form.id : undefined,
    packageName: form.packageName.trim(),
    menuCheckStrictly: form.menuCheckStrictly,
    status: form.status,
    remark: form.remark.trim() || null,
    menuIds: normalizeUniqueIds(menuIds),
  };
}

/**
 * 构造租户套餐表单校验规则。
 *
 * @returns Element Plus 表单校验规则对象
 */
export function buildTenantPackageFormRules(): FormRules {
  return {
    packageName: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (trimmed.length < 2 || trimmed.length > 50) {
            callback(new Error('套餐名称长度须在 2~50 个字符之间'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
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
