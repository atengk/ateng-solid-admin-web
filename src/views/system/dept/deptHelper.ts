import type { FormRules } from 'element-plus';
import type { DeptTreeVO } from '@/api/system/dept';
import type { CommonStatus } from '@/api/types';
import { collectTreeSubtreeIds } from '@/utils/tree';

/**
 * 部门管理域纯逻辑辅助函数（防自环树选择器构造、表单校验规则与负责人展示格式化）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export const ROOT_DEPT_ID = '0';
const ROOT_DEPT_LABEL = '顶级部门';
const DEPT_PHONE_PATTERN = /^[0-9+\-()]{5,20}$/;
const DEPT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 部门树选择器选项节点模型（适配 Element Plus ElTreeSelect）。
 */
export interface DeptSelectorOption {
  /**
   * 部门主键（顶级虚拟根为 '0'）
   */
  id: string;
  /**
   * 显示名称
   */
  label: string;
  /**
   * 是否禁用选择（编辑态自身及子孙、或非当前上级且已停用的部门禁选）
   */
  disabled: boolean;
  /**
   * 状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 下级子节点
   */
  children: DeptSelectorOption[];
}

/**
 * 构造部门表单校验规则表。
 *
 * @returns 适配 Element Plus ElForm 的部门表单校验规则
 */
export function buildDeptFormRules(): FormRules {
  return {
    parentId: [{ required: true, message: '请选择上级部门', trigger: 'change' }],
    deptName: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (trimmed.length < 2 || trimmed.length > 50) {
            callback(new Error('部门名称须为 2~50 个字符'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    sort: [
      { required: true, type: 'number', message: '请输入显示排序（0~9999）', trigger: 'blur' },
    ],
    phone: [
      {
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (!trimmed) {
            callback();
            return;
          }
          if (!DEPT_PHONE_PATTERN.test(trimmed)) {
            callback(new Error('请输入合法联系电话（5~20 位）'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    email: [
      {
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (!trimmed) {
            callback();
            return;
          }
          if (trimmed.length > 64 || !DEPT_EMAIL_PATTERN.test(trimmed)) {
            callback(new Error('请输入合法电子邮箱（64 字符内）'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
  };
}

/**
 * 构造上级部门树形选择器数据源（含顶级虚拟节点 `'0'`，编辑时禁用自身及全部子孙防自环）。
 *
 * @param nodes           完整部门树集合
 * @param editingDeptId   当前正在编辑的部门主键（新增时留空）
 * @param currentParentId 当前编辑部门既有上级主键（允许保留已停用的原上级直至主动调整）
 * @returns 带禁用标记的部门树选择器选项集合
 */
export function buildDeptSelectorOptions(
  nodes: DeptTreeVO[],
  editingDeptId?: string | null,
  currentParentId?: string | null,
): DeptSelectorOption[] {
  const forbiddenIds = collectTreeSubtreeIds(nodes, editingDeptId);

  const mapNodes = (items: DeptTreeVO[]): DeptSelectorOption[] =>
    items.map(item => {
      const isForbiddenSubtree = forbiddenIds.has(item.id);
      const isInactiveParent = item.status !== 0 && item.id !== currentParentId;
      return {
        id: item.id,
        label: item.deptName,
        disabled: isForbiddenSubtree || isInactiveParent,
        status: item.status,
        children: mapNodes(item.children ?? []),
      };
    });

  return [
    {
      id: ROOT_DEPT_ID,
      label: ROOT_DEPT_LABEL,
      disabled: false,
      status: 0,
      children: [],
    },
    ...mapNodes(nodes),
  ];
}

/**
 * 格式化部门负责人显示文本。
 *
 * @param dept 含负责人昵称与账号的对象
 * @returns `昵称 (账号)` 或单字段；无负责人时返回 `'--'`
 */
export function formatDeptLeader(
  dept: Pick<DeptTreeVO, 'leaderNickname' | 'leaderUsername'>,
): string {
  const nickname = dept.leaderNickname?.trim();
  const username = dept.leaderUsername?.trim();
  if (nickname && username) {
    return `${nickname} (${username})`;
  }
  return nickname || username || '--';
}
