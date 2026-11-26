import type { FormRules } from 'element-plus';
import type { DeptTreeVO } from '@/api/system/dept';
import type { PostOptionVO } from '@/api/system/post';
import type { RoleOptionVO } from '@/api/system/role';
import type { UserExportRequest, UserQuery, UserVO } from '@/api/system/user';
import type { CommonStatus } from '@/api/types';
import {
  buildDateTimeShortcuts,
  createDateTimeRangeBinding,
  DEFAULT_RANGE_PICKER_TIME,
} from '@/utils/dateRange';
import { evaluatePasswordPolicy, PASSWORD_POLICY_SHORT_MESSAGE } from '@/utils/password';

/**
 * 用户管理与 Fesod 导入导出纯逻辑辅助函数（自身/超管保护、停用部门岗位回显兜底、强口令规则与导出入参收敛）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export const PHONE_QUERY_PLACEHOLDER = '请输入完整手机号（精确查询）';
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 500;
export const USER_PROTECTED_SELF_TIP = '当前登录账号不可停用或删除';
export const USER_PROTECTED_SUPER_TIP = '平台内置超级管理员账号不可停用或删除';
export const USER_EDIT_SUPER_FORBIDDEN_TIP = '非平台超级管理员禁止编辑内置超级管理员账号';
export const RESET_PWD_SUPER_FORBIDDEN_TIP = '不可越权重置平台内置超级管理员密码';

export const DEFAULT_USER_PICKER_TIME = DEFAULT_RANGE_PICKER_TIME;
export const USER_TIME_SHORTCUTS = buildDateTimeShortcuts();
export const createUserTimeRangeBinding = createDateTimeRangeBinding;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{2,30}$/;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 用户表单归属部门选择器节点模型。
 */
export interface UserDeptSelectorOption {
  id: string;
  label: string;
  disabled: boolean;
  status: CommonStatus;
  children: UserDeptSelectorOption[];
}

/**
 * 用户表单岗位选项状态模型（含已停用既绑岗位回显标识）。
 */
export interface AssignablePostOption {
  id: string;
  postCode: string;
  postName: string;
  status: CommonStatus;
  disabled: boolean;
}

/**
 * 角色多选框选项状态模型。
 */
export interface AssignableRoleOption extends RoleOptionVO {
  disabled: boolean;
}

/**
 * 用户表格行受保护状态摘要。
 */
export interface UserRowProtectionState {
  isProtectedSelf: boolean;
  isProtectedSuper: boolean;
  canEdit: boolean;
  mutableStatusOrDelete: boolean;
  canResetPassword: boolean;
  disableReason: string;
  editDisableReason: string;
}

/**
 * 判定目标用户行受内置超管或当前登录用户自身的保护边界。
 *
 * @param row                用户列表行对象
 * @param currentUserId      当前登录用户主键
 * @param isPlatformSuperView 是否具备平台租户超管治理权限
 * @returns 用户操作受限状态集合
 */
export function resolveUserRowProtection(
  row: Pick<UserVO, 'id' | 'builtinSuperAdmin'>,
  currentUserId?: string | null,
  isPlatformSuperView = true,
): UserRowProtectionState {
  const normalizedCurrentId = currentUserId?.trim() ?? '';
  const isProtectedSelf = Boolean(normalizedCurrentId && row.id === normalizedCurrentId);
  const isProtectedSuper = Boolean(row.builtinSuperAdmin);
  const mutableStatusOrDelete = !isProtectedSuper && !isProtectedSelf;
  const canEdit = !isProtectedSuper || isPlatformSuperView;

  let disableReason = '';
  if (isProtectedSuper) {
    disableReason = USER_PROTECTED_SUPER_TIP;
  } else if (isProtectedSelf) {
    disableReason = USER_PROTECTED_SELF_TIP;
  }

  return {
    isProtectedSelf,
    isProtectedSuper,
    canEdit,
    mutableStatusOrDelete,
    canResetPassword: !isProtectedSuper || isProtectedSelf,
    disableReason,
    editDisableReason: canEdit ? '' : USER_EDIT_SUPER_FORBIDDEN_TIP,
  };
}

/**
 * 判断用户表格行是否允许被复选框勾选。
 *
 * @param row           用户列表行对象
 * @param currentUserId 当前登录用户主键
 * @returns 允许勾选返回 `true`
 */
export function canSelectUserRow(
  row: Pick<UserVO, 'id' | 'builtinSuperAdmin'>,
  currentUserId?: string | null,
): boolean {
  return resolveUserRowProtection(row, currentUserId).mutableStatusOrDelete;
}

function treeContainsDept(nodes: readonly DeptTreeVO[], targetId: string): boolean {
  for (const node of nodes) {
    if (node.id === targetId || (node.children?.length && treeContainsDept(node.children, targetId))) {
      return true;
    }
  }
  return false;
}

/**
 * 构造用户表单部门树形选择器选项；若编辑用户的原归属部门已停用且未在可用树内返回，自动注入停用占位回显项。
 *
 * @param nodes           部门选项树
 * @param currentDeptId   编辑态原归属部门主键
 * @param currentDeptName 编辑态原归属部门名称
 * @returns 带禁用状态的树形选择器选项
 */
export function buildUserDeptTreeOptions(
  nodes: readonly DeptTreeVO[],
  currentDeptId?: string | null,
  currentDeptName?: string | null,
): UserDeptSelectorOption[] {
  const activeDeptId = currentDeptId?.trim() || undefined;
  const mapNodes = (items: readonly DeptTreeVO[]): UserDeptSelectorOption[] =>
    items.map(node => ({
      id: node.id,
      label: node.deptName,
      disabled: node.status !== 0 && node.id !== activeDeptId,
      status: node.status,
      children: mapNodes(node.children ?? []),
    }));

  const mapped = mapNodes(nodes);
  if (activeDeptId && !treeContainsDept(nodes, activeDeptId)) {
    mapped.unshift({
      id: activeDeptId,
      label: currentDeptName?.trim() || `已停用部门 (${activeDeptId})`,
      disabled: false,
      status: 1,
      children: [],
    });
  }
  return mapped;
}

/**
 * 构造用户表单岗位多选选项；对存量用户已绑定但现已停用的岗位保留回显并标记状态 1。
 *
 * @param activePosts     启用状态岗位列表
 * @param existingPostIds 编辑态用户当前关联岗位主键集合
 * @returns 带停用兜底项的岗位选择器列表
 */
export function buildAssignablePostOptions(
  activePosts: readonly PostOptionVO[],
  existingPostIds: readonly string[] = [],
): AssignablePostOption[] {
  const existingMap = new Map<string, PostOptionVO>();
  const result: AssignablePostOption[] = activePosts.map(post => {
    existingMap.set(post.id, post);
    return {
      ...post,
      disabled: post.status !== 0,
    };
  });
  for (const postId of existingPostIds) {
    const trimmed = postId.trim();
    if (!trimmed || existingMap.has(trimmed)) {
      continue;
    }
    result.push({
      id: trimmed,
      postCode: trimmed,
      postName: `岗位 #${trimmed} (已停用)`,
      status: 1,
      disabled: true,
    });
  }
  return result;
}

/**
 * 过滤可分配角色列表：非平台超管视角隐藏 {@code super_admin}，内置超管编辑锁定保留自身 {@code super_admin}。
 *
 * @param roles                   后端返回的角色选项列表
 * @param allowSuperAdminAssign   是否处于平台默认租户 0 的超管授权视角
 * @param existingRoleIds         编辑用户已绑定的角色主键集合
 * @param targetBuiltinSuperAdmin 目标用户是否为内置超管
 * @returns 带锁定标记的可展示角色选项列表
 */
export function filterAssignableRoles(
  roles: readonly RoleOptionVO[],
  allowSuperAdminAssign: boolean,
  existingRoleIds: readonly string[] = [],
  targetBuiltinSuperAdmin = false,
): AssignableRoleOption[] {
  const assignedSet = new Set(existingRoleIds);
  const result: AssignableRoleOption[] = [];
  for (const role of roles) {
    const isSuperRole = role.roleKey === 'super_admin';
    if (isSuperRole && !allowSuperAdminAssign && !assignedSet.has(role.id)) {
      continue;
    }
    result.push({
      ...role,
      disabled: isSuperRole && targetBuiltinSuperAdmin,
    });
  }
  return result;
}

/**
 * 提取用户头像降级展示首字。
 *
 * @param nickname 用户昵称
 * @param username 登录账号
 * @returns 大写首字符
 */
export function formatUserAvatarInitial(nickname?: string | null, username?: string | null): string {
  const source = nickname?.trim() || username?.trim() || 'U';
  return source.slice(0, 1).toUpperCase();
}

/**
 * 将 {@code AtengExcelExport} 回调载荷收口转换为干净的后端 {@code UserExportRequest}。
 *
 * @param rawParams    导出组件传入参数
 * @param currentQuery 当前表格生效的筛选参数兜底
 * @returns 严格对齐后端契约的导出请求体
 */
export function buildUserExportPayload(
  rawParams: Record<string, unknown>,
  currentQuery: Partial<UserQuery>,
): UserExportRequest {
  const rawIds = rawParams.ids;
  if (Array.isArray(rawIds)) {
    const selectedIds = rawIds.map(item => String(item ?? '').trim()).filter(Boolean);
    if (selectedIds.length > 0) {
      return { ids: selectedIds };
    }
  }

  const pickString = (key: keyof UserQuery): string | undefined => {
    const val = rawParams[key] ?? currentQuery[key];
    return typeof val === 'string' && val.trim() ? val.trim() : undefined;
  };
  const statusRaw = rawParams.status ?? currentQuery.status;
  const status: CommonStatus | undefined =
    statusRaw === 0 || statusRaw === 1 ? statusRaw : undefined;

  return {
    username: pickString('username'),
    phone: pickString('phone'),
    status,
    deptId: pickString('deptId'),
    beginTime: pickString('beginTime'),
    endTime: pickString('endTime'),
  };
}

/**
 * 用户表单抽屉响应式状态结构。
 */
export interface UserDrawerFormState {
  id?: string;
  username: string;
  nickname: string;
  password: string;
  deptId: string;
  postIds: string[];
  roleIds: string[];
  phone: string;
  email: string;
  gender: '0' | '1' | '2';
  status: CommonStatus;
  remark: string;
}

/**
 * 将用户表单状态归一化为新增或修改请求载荷。
 *
 * @param mode 当前操作模式
 * @param form 表单状态对象
 * @returns 清理首尾空白并对齐空值约定的请求载荷
 */
export function buildUserDrawerPayload(
  mode: 'create' | 'edit',
  form: UserDrawerFormState,
): { mode: 'edit'; data: import('@/api/system/user').UserUpdateRequest } | { mode: 'create'; data: import('@/api/system/user').UserCreateRequest } {
  const shared = {
    nickname: form.nickname.trim(),
    deptId: form.deptId.trim() || null,
    postIds: [...form.postIds],
    roleIds: [...form.roleIds],
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    gender: form.gender,
    status: form.status,
    remark: form.remark.trim() || null,
  };
  if (mode === 'edit' && form.id) {
    return { mode: 'edit', data: { id: form.id, ...shared } };
  }
  return {
    mode: 'create',
    data: { username: form.username.trim(), password: form.password, ...shared },
  };
}

/**
 * 构造新增/编辑用户抽屉表单校验规则。
 *
 * @param isCreate 判断当前是否处于新增模式
 * @returns Element Plus 表单校验规则表
 */
export function buildUserFormRules(isCreate: () => boolean): FormRules {
  return {
    username: [
      {
        required: isCreate(),
        validator: (_rule, value: string, callback) => {
          if (!isCreate()) {
            callback();
            return;
          }
          if (!USERNAME_PATTERN.test((value ?? '').trim())) {
            callback(new Error('用户账号须为 2~30 位字母、数字或下划线'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    nickname: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (trimmed.length < 2 || trimmed.length > 30) {
            callback(new Error('用户昵称长度须在 2~30 个字符之间'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    password: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          if (!isCreate()) {
            callback();
            return;
          }
          if (!evaluatePasswordPolicy(value ?? '').valid) {
            callback(new Error(PASSWORD_POLICY_SHORT_MESSAGE));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    phone: [
      {
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (!trimmed || PHONE_PATTERN.test(trimmed)) {
            callback();
            return;
          }
          callback(new Error('请输入合法的 11 位中国大陆手机号码'));
        },
        trigger: 'blur',
      },
    ],
    email: [
      {
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (!trimmed || (trimmed.length <= 64 && EMAIL_PATTERN.test(trimmed))) {
            callback();
            return;
          }
          callback(new Error('请输入合法电子邮箱（不超过 64 个字符）'));
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
