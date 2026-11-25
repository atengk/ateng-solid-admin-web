import type { PageQuery } from '@atengk/core';
import type { CommonStatus, GenderValue } from '@/api/types';

/**
 * 用户管理与 Fesod 导入导出域 TypeScript 接口契约定义。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 部门负责人与轻量选择器下拉用户选项模型（GET /admin/system/user/options）。
 */
export interface UserOptionVO {
  userId: string;
  username: string;
  nickname: string;
}

/**
 * 用户分页列表查询参数（GET /admin/system/user/page）。
 */
export interface UserQuery extends PageQuery {
  /** 登录账号或用户昵称模糊关键字 */
  username?: string;
  /** 完整 11 位手机号码（后端按确定性加密精确匹配） */
  phone?: string;
  /** 账号启停状态（0=正常，1=停用） */
  status?: CommonStatus;
  /** 归属部门主键（含全部下级子孙部门） */
  deptId?: string;
  /** 创建时间起始边界（yyyy-MM-dd HH:mm:ss） */
  beginTime?: string;
  /** 创建时间截止边界（yyyy-MM-dd HH:mm:ss） */
  endTime?: string;
}

/**
 * 用户核心基础视图字段（列表与详情共用真明文契约）。
 */
export interface UserBaseVO {
  id: string;
  tenantId: string;
  deptId?: string | null;
  deptName?: string | null;
  username: string;
  nickname: string;
  email?: string | null;
  phone?: string | null;
  gender?: GenderValue | string | null;
  avatar?: string | null;
  status: CommonStatus;
  loginIp?: string | null;
  loginDate?: string | null;
  pwdUpdateTime?: string | null;
  remark?: string | null;
  createTime: string;
  builtinSuperAdmin: boolean;
}

/**
 * 用户分页列表响应模型。
 */
export type UserVO = UserBaseVO;

/**
 * 用户详情视图对象（GET /admin/system/user/{id}）。
 */
export interface UserDetailVO extends UserBaseVO {
  roleIds: string[];
  postIds: string[];
}

/**
 * 用户表单持久化公共可变字段（新增与修改共用）。
 */
export interface UserMutableFields {
  nickname: string;
  deptId?: string | null;
  postIds?: string[];
  roleIds?: string[];
  phone?: string | null;
  email?: string | null;
  gender?: GenderValue | string;
  status?: CommonStatus;
  remark?: string | null;
}

/**
 * 新增管理端用户请求载荷（POST /admin/system/user）。
 */
export interface UserCreateRequest extends UserMutableFields {
  username: string;
  password?: string | null;
}

/**
 * 修改管理端用户请求载荷（PUT /admin/system/user，禁止修改登录账号与密码）。
 */
export interface UserUpdateRequest extends UserMutableFields {
  id: string;
}

/**
 * 管理员重置用户密码请求载荷（PUT /admin/system/user/{id}/reset-password）。
 */
export interface UserResetPasswordRequest {
  password?: string | null;
}

/**
 * 用户 Excel 流式导出请求载荷（POST /admin/system/user/export）。
 */
export interface UserExportRequest {
  ids?: string[];
  username?: string;
  phone?: string;
  status?: CommonStatus;
  deptId?: string;
  beginTime?: string;
  endTime?: string;
}

/**
 * Excel 批量用户导入单行校验错误明细。
 */
export interface ImportErrorVO {
  rowNum: number;
  columnName?: string;
  errorMessage: string;
  rawValue?: string | null;
}

/**
 * Excel 批量用户导入汇总响应模型（POST /admin/system/user/import）。
 */
export interface ImportResultVO {
  totalCount: number;
  successCount: number;
  failCount: number;
  errors: ImportErrorVO[];
  feedbackToken?: string | null;
}
