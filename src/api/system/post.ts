import { createPageResult, type PageQuery, type PageResult } from '@atengk/core';
import type { CommonStatus } from '@/api/types';
import { adminHttpClient } from '@/utils/http';

/**
 * 岗位管理域强类型 API 契约（对齐后端 SysPostController，路径前缀 /admin/system/post）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 岗位分页筛选参数（GET /admin/system/post/page）。
 */
export interface PostQuery extends PageQuery {
  /**
   * 岗位编码模糊匹配
   */
  postCode?: string;
  /**
   * 岗位名称模糊匹配
   */
  postName?: string;
  /**
   * 岗位状态（0=正常，1=停用）
   */
  status?: CommonStatus;
}

/**
 * 岗位列表与详情视图对象。
 */
export interface PostVO {
  /**
   * 岗位主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 岗位编码（租户内唯一）
   */
  postCode: string;
  /**
   * 岗位名称（租户内唯一）
   */
  postName: string;
  /**
   * 显示排序（升序）
   */
  sort: number;
  /**
   * 岗位状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 管理备注
   */
  remark?: string | null;
  /**
   * 创建时间
   */
  createTime: string;
}

/**
 * 岗位下拉选项轻量化视图对象（GET /admin/system/post/options）。
 */
export interface PostOptionVO {
  /**
   * 岗位主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 岗位编码
   */
  postCode: string;
  /**
   * 岗位名称
   */
  postName: string;
  /**
   * 岗位状态（0=正常，1=停用）
   */
  status: CommonStatus;
}

/**
 * 新增与修改岗位请求载荷（POST / PUT /admin/system/post）。
 */
export interface PostSaveRequest {
  /**
   * 岗位主键（新增留空，修改必填）
   */
  id?: string;
  /**
   * 岗位编码（2~64 位字母/数字/下划线/短横线）
   */
  postCode: string;
  /**
   * 岗位名称（2~50 字符）
   */
  postName: string;
  /**
   * 显示排序
   */
  sort: number;
  /**
   * 岗位状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 备注（不超过 500 字符）
   */
  remark?: string | null;
}

/**
 * 分页查询当前工作租户下的岗位列表。
 *
 * @param params 分页与筛选参数
 * @returns 空安全岗位分页结果
 */
export async function getPostPage(params?: PostQuery): Promise<PageResult<PostVO>> {
  const page = await adminHttpClient.get<PageResult<PostVO>>('/admin/system/post/page', {
    params,
  });
  return createPageResult(page?.records, page?.total, {
    current: page?.current,
    size: page?.size,
    pages: page?.pages,
  });
}

/**
 * 获取当前工作租户下正常启用状态的岗位下拉选项。
 *
 * @returns 空安全岗位选项列表
 */
export async function getPostOptions(): Promise<PostOptionVO[]> {
  const list = await adminHttpClient.get<PostOptionVO[]>('/admin/system/post/options');
  return list ?? [];
}

/**
 * 查询指定岗位详情。
 *
 * @param id 岗位主键
 * @returns 岗位详情对象
 */
export async function getPostDetail(id: string): Promise<PostVO> {
  return adminHttpClient.get<PostVO>(`/admin/system/post/${encodeURIComponent(id.trim())}`);
}

/**
 * 新增岗位。
 *
 * @param data 岗位保存请求
 * @returns 新建岗位主键（64 位雪花 ID 字符串）
 */
export async function createPost(data: PostSaveRequest): Promise<string> {
  return adminHttpClient.post<string, PostSaveRequest>('/admin/system/post', data);
}

/**
 * 修改岗位。
 *
 * @param data 岗位修改请求
 * @returns 空完成 Promise
 */
export async function updatePost(data: PostSaveRequest): Promise<void> {
  await adminHttpClient.put<void, PostSaveRequest>('/admin/system/post', data);
}

/**
 * 切换岗位启停状态。
 *
 * @param id 岗位主键
 * @param status 目标状态（0=正常，1=停用）
 * @returns 空完成 Promise
 */
export async function updatePostStatus(id: string, status: CommonStatus): Promise<void> {
  await adminHttpClient.put<void, { status: CommonStatus }>(
    `/admin/system/post/${encodeURIComponent(id.trim())}/status`,
    { status },
  );
}

/**
 * 批量删除指定岗位（任一被用户占用时由后端整批拦截并点名岗位名称）。
 *
 * @param ids 单个或数组形式的岗位主键集合
 * @returns 空完成 Promise
 */
export async function deletePosts(ids: string | string[]): Promise<void> {
  const normalized = (Array.isArray(ids) ? ids : ids.split(','))
    .map(item => item.trim())
    .filter(Boolean);
  if (normalized.length === 0) {
    return;
  }
  const pathIds = normalized.map(item => encodeURIComponent(item)).join(',');
  await adminHttpClient.delete<void>(`/admin/system/post/${pathIds}`);
}
