import { createPageResult, type PageResult } from '@atengk/core';
import type { CommonStatus } from '@/api/types';
import { adminHttpClient, formatBatchPathIds } from '@/utils/http';
import type {
  ImportResultVO,
  UserCreateRequest,
  UserDetailVO,
  UserExportRequest,
  UserOptionVO,
  UserQuery,
  UserResetPasswordRequest,
  UserUpdateRequest,
  UserVO,
} from '@/api/system/userTypes';

export * from '@/api/system/userTypes';

/**
 * 用户管理与 Fesod Excel 导入导出域 HTTP API 调用封装（对齐 SysUserController / SysUserImportExportController）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 模糊检索当前租户下正常启用状态的用户选项列表（不依赖 system:user:list 权限）。
 *
 * @param keyword 账号或昵称模糊关键字（可选）
 * @returns 匹配的用户选项列表，无匹配时返回空数组
 */
export async function getUserOptions(keyword?: string): Promise<UserOptionVO[]> {
  const trimmed = keyword?.trim();
  const list = await adminHttpClient.get<UserOptionVO[]>('/admin/system/user/options', {
    params: trimmed ? { keyword: trimmed } : undefined,
  });
  return list ?? [];
}

/**
 * 分页查询当前工作租户下符合 5 级数据权限与部门子树约束的用户列表。
 *
 * @param params 分页、部门联动与精确手机号筛选参数
 * @returns 空安全用户分页结果
 */
export async function getUserPage(params?: UserQuery): Promise<PageResult<UserVO>> {
  const page = await adminHttpClient.get<PageResult<UserVO>>('/admin/system/user/page', {
    params,
  });
  return createPageResult(page?.records, page?.total, {
    current: page?.current,
    size: page?.size,
    pages: page?.pages,
  });
}

/**
 * 查询指定用户详情（包含内存真明文联系方式及已关联角色/岗位主键列表）。
 *
 * @param id 用户主键
 * @returns 用户详情视图对象
 */
export async function getUserDetail(id: string): Promise<UserDetailVO> {
  const detail = await adminHttpClient.get<UserDetailVO>(
    `/admin/system/user/${encodeURIComponent(id.trim())}`,
  );
  return {
    ...detail,
    roleIds: detail.roleIds ?? [],
    postIds: detail.postIds ?? [],
  };
}

/**
 * 新增管理端用户（受租户套餐 accountCount 悲观锁配额护栏约束）。
 *
 * @param data 新增用户请求载荷
 * @returns 新建用户主键（64 位雪花 ID 字符串）
 */
export async function createUser(data: UserCreateRequest): Promise<string> {
  return adminHttpClient.post<string, UserCreateRequest>('/admin/system/user', data);
}

/**
 * 修改管理端用户信息。
 *
 * @param data 修改用户请求载荷
 * @returns 空完成 Promise
 */
export async function updateUser(data: UserUpdateRequest): Promise<void> {
  await adminHttpClient.put<void, UserUpdateRequest>('/admin/system/user', data);
}

/**
 * 切换用户启停状态（超管与当前登录用户受后端 102007 保护，停用转启用受套餐配额校验）。
 *
 * @param id     用户主键
 * @param status 目标状态（0=正常，1=停用）
 * @returns 空完成 Promise
 */
export async function updateUserStatus(id: string, status: CommonStatus): Promise<void> {
  await adminHttpClient.put<void, { status: CommonStatus }>(
    `/admin/system/user/${encodeURIComponent(id.trim())}/status`,
    { status },
  );
}

/**
 * 重置指定用户登录密码（置空 pwd_update_time 并强退在线会话）。
 *
 * @param id   目标用户主键
 * @param data 新密码载荷（可选）
 * @returns 空完成 Promise
 */
export async function resetUserPassword(
  id: string,
  data?: UserResetPasswordRequest,
): Promise<void> {
  await adminHttpClient.put<void, UserResetPasswordRequest>(
    `/admin/system/user/${encodeURIComponent(id.trim())}/reset-password`,
    data ?? {},
  );
}

/**
 * 批量逻辑删除用户（超管与当前登录用户自身禁止删除）。
 *
 * @param ids 单个或数组形式的用户主键集合
 * @returns 空完成 Promise
 */
export async function deleteUsers(ids: string | string[]): Promise<void> {
  const pathIds = formatBatchPathIds(ids);
  if (!pathIds) {
    return;
  }
  await adminHttpClient.delete<void>(`/admin/system/user/${pathIds}`);
}

/**
 * 下载 9 列用户导入 Excel 标准模板（带表头批注与性别/状态下拉约束）。
 *
 * @returns 是否成功触发浏览器安全下载
 */
export async function downloadUserImportTemplate(): Promise<boolean> {
  return adminHttpClient.download('/admin/system/user/import/template', '用户导入模板.xlsx');
}

/**
 * 上传 Excel 工作簿（.xlsx <= 2MB / <= 500 行）执行整批原子用户导入（强制透传 120_000 ms 长耗时超时）。
 *
 * @param file 待导入的 Excel 文件
 * @returns 导入校验汇总与批注下载令牌
 */
export async function importUsers(file: File): Promise<ImportResultVO> {
  const formData = new FormData();
  formData.append('file', file);
  const result = await adminHttpClient.post<ImportResultVO, FormData>(
    '/admin/system/user/import',
    formData,
    { timeout: 120_000 },
  );
  return {
    ...result,
    errors: result.errors ?? [],
    feedbackToken: result.feedbackToken ?? null,
  };
}

/**
 * 按批注令牌经 adminHttpClient 拉取标红批注错误工作簿（受租户与操作人归属隔离保护）。
 *
 * @param feedbackToken 32 位批注下载令牌
 * @returns 二进制 Excel Blob
 */
export async function downloadImportFeedback(feedbackToken: string): Promise<Blob> {
  return adminHttpClient.get<Blob>(
    `/admin/system/user/import/feedback/${encodeURIComponent(feedbackToken.trim())}`,
    { responseType: 'blob' },
  );
}

/**
 * 按当前筛选条件或勾选主键集合流式导出用户数据（手机/邮箱服务端脱敏，不含密码列）。
 *
 * @param data 导出筛选条件或选中主键集合
 * @returns 二进制 Excel Blob
 */
export async function exportUsers(data?: UserExportRequest): Promise<Blob> {
  return adminHttpClient.post<Blob, UserExportRequest>('/admin/system/user/export', data ?? {}, {
    responseType: 'blob',
  });
}
