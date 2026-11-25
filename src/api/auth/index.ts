import { createPageResult, type PageResult } from '@atengk/core';
import { adminHttpClient } from '@/utils/http';
import type {
  AdminLoginRequest,
  AdminLoginVO,
  AdminProfileVO,
  AvatarUploadVO,
  CaptchaVO,
  OnlineSessionQuery,
  OnlineSessionVO,
  PersonalProfileVO,
  RouteMenuVO,
  UpdatePasswordRequest,
  UpdateProfileRequest,
} from './types';

export * from './types';

/**
 * 管理端认证、个人中心与在线会话域强类型 API（对齐后端 /admin/auth/** 全量 11 个端点）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

function normalizeRouteMenus(nodes?: RouteMenuVO[] | null): RouteMenuVO[] {
  if (!Array.isArray(nodes)) {
    return [];
  }
  return nodes.map(node => ({
    ...node,
    children: normalizeRouteMenus(node.children),
  }));
}

/**
 * 拉取登录图形验证码与多租户运行开关前置配置（匿名访问）。
 *
 * @returns 验证码内容与开关配置
 */
export async function getCaptcha(): Promise<CaptchaVO> {
  return adminHttpClient.get<CaptchaVO>('/admin/auth/captcha');
}

/**
 * 提交管理端账户登录认证请求（匿名访问）。
 *
 * @param data 登录请求载荷
 * @returns 访问令牌与生效租户摘要
 */
export async function login(data: AdminLoginRequest): Promise<AdminLoginVO> {
  return adminHttpClient.post<AdminLoginVO, AdminLoginRequest>('/admin/auth/login', data);
}

/**
 * 注销当前管理端登录会话。
 *
 * @returns 空完成 Promise
 */
export async function logout(): Promise<void> {
  await adminHttpClient.post<void>('/admin/auth/logout');
}

/**
 * 拉取当前登录用户身份摘要、角色编码及扁平权限码集合。
 *
 * @returns 轻量认证身份对象
 */
export async function getAuthInfo(): Promise<AdminProfileVO> {
  const profile = await adminHttpClient.get<AdminProfileVO>('/admin/auth/info');
  return {
    ...profile,
    roles: profile.roles ?? [],
    permissions: profile.permissions ?? [],
  };
}

/**
 * 拉取当前有效视角下的嵌套动态菜单路由树（已由后端过滤停用与平台专属项）。
 *
 * @returns 嵌套动态路由菜单数组（空集合保底）
 */
export async function getAuthRoutes(): Promise<RouteMenuVO[]> {
  const routes = await adminHttpClient.get<RouteMenuVO[]>('/admin/auth/routes');
  return normalizeRouteMenus(routes);
}

/**
 * 读取个人中心完整内存真明文资料。
 *
 * @returns 个人完整资料
 */
export async function getPersonalProfile(): Promise<PersonalProfileVO> {
  const profile = await adminHttpClient.get<PersonalProfileVO>('/admin/auth/profile');
  return {
    ...profile,
    postNames: profile.postNames ?? [],
    roles: profile.roles ?? [],
  };
}

/**
 * 更新本人基本资料。
 *
 * @param data 待更新的基本资料字段
 * @returns 空完成 Promise
 */
export async function updatePersonalProfile(data: UpdateProfileRequest): Promise<void> {
  await adminHttpClient.put<void, UpdateProfileRequest>('/admin/auth/profile', data);
}

/**
 * 上传并替换本人头像文件（仅限图片格式且 <= 2MB）。
 *
 * @param file 本地图片文件实体
 * @returns 签发预览 URL 与持久相对对象键
 */
export async function uploadProfileAvatar(file: File): Promise<AvatarUploadVO> {
  const formData = new FormData();
  formData.append('file', file);
  return adminHttpClient.post<AvatarUploadVO, FormData>('/admin/auth/profile/avatar', formData);
}

/**
 * 自助修改当前用户登录密码（成功后服务端同步踢出该用户全端会话）。
 *
 * @param data 旧密码与新密码载荷
 * @returns 空完成 Promise
 */
export async function updatePassword(data: UpdatePasswordRequest): Promise<void> {
  await adminHttpClient.put<void, UpdatePasswordRequest>('/admin/auth/password', data);
}

/**
 * 分页查询当前工作租户下的管理端在线会话列表。
 *
 * @param params 分页与筛选参数
 * @returns 空安全在线会话分页结果
 */
export async function getOnlineSessionPage(
  params?: OnlineSessionQuery,
): Promise<PageResult<OnlineSessionVO>> {
  const page = await adminHttpClient.get<PageResult<OnlineSessionVO>>('/admin/auth/online/page', {
    params,
  });
  return createPageResult(page?.records, page?.total, {
    current: page?.current,
    size: page?.size,
    pages: page?.pages,
  });
}

/**
 * 强退指定不透明会话句柄对应的在线登录态。
 *
 * @param sessionId 不透明会话句柄
 * @returns 空完成 Promise
 */
export async function kickoutOnlineSession(sessionId: string): Promise<void> {
  const trimmed = sessionId.trim();
  if (!trimmed) {
    return;
  }
  await adminHttpClient.delete<void>(`/admin/auth/online/${encodeURIComponent(trimmed)}`);
}
