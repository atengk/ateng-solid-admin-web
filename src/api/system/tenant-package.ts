import { createPageResult, type PageQuery, type PageResult } from '@atengk/core';
import type { CommonStatus } from '@/api/types';
import { adminHttpClient, formatBatchPathIds } from '@/utils/http';

/**
 * 租户套餐管理域强类型 API 契约（对齐后端 SysTenantPackageController，路径前缀 /admin/system/tenant-package）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 租户套餐分页检索参数（GET /admin/system/tenant-package/page）。
 */
export interface TenantPackageQuery extends PageQuery {
  /**
   * 套餐名称模糊匹配
   */
  packageName?: string;
  /**
   * 套餐启停状态（0=正常，1=停用）
   */
  status?: CommonStatus;
}

/**
 * 租户套餐分页列表视图对象（含关联菜单与绑定租户聚合统计）。
 */
export interface TenantPackageVO {
  /**
   * 套餐主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 套餐名称
   */
  packageName: string;
  /**
   * 包含菜单与权限节点总数
   */
  menuCount: number;
  /**
   * 当前绑定该套餐的未删除租户总数
   */
  tenantCount: number;
  /**
   * 菜单权限树是否父子联动
   */
  menuCheckStrictly: boolean;
  /**
   * 套餐启停状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 备注说明
   */
  remark?: string | null;
  /**
   * 创建时间
   */
  createTime: string;
}

/**
 * 租户套餐详情视图对象（GET /admin/system/tenant-package/{id}）。
 */
export interface TenantPackageDetailVO {
  /**
   * 套餐主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 套餐名称
   */
  packageName: string;
  /**
   * 菜单权限树是否父子联动
   */
  menuCheckStrictly: boolean;
  /**
   * 套餐启停状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 备注说明
   */
  remark?: string | null;
  /**
   * 创建时间
   */
  createTime: string;
  /**
   * 已绑定的非平台专属菜单主键集合
   */
  menuIds: string[];
}

/**
 * 正常启用状态的租户套餐轻量下拉选项模型（GET /admin/system/tenant-package/options）。
 */
export interface TenantPackageOptionVO {
  /**
   * 套餐主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 套餐名称
   */
  packageName: string;
}

/**
 * 租户套餐新增与修改请求载荷（POST / PUT /admin/system/tenant-package）。
 */
export interface TenantPackageSaveRequest {
  /**
   * 套餐主键（新增留空，修改必填）
   */
  id?: string;
  /**
   * 套餐名称（2~50 字符，全局未删除唯一）
   */
  packageName: string;
  /**
   * 菜单权限树是否父子联动（默认 true）
   */
  menuCheckStrictly?: boolean;
  /**
   * 套餐状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 备注说明
   */
  remark?: string | null;
  /**
   * 套餐授权菜单与按钮主键集合（严禁含 platformOnly 节点）
   */
  menuIds?: string[];
}

/**
 * 缩减套餐菜单影响范围预览请求载荷（POST /admin/system/tenant-package/shrink-preview）。
 */
export interface TenantPackageShrinkPreviewRequest {
  /**
   * 目标套餐主键
   */
  packageId: string;
  /**
   * 编辑后的新版菜单主键集合
   */
  newMenuIds?: string[];
}

/**
 * 受套餐菜单缩减影响的租户摘要。
 */
export interface AffectedTenantSummaryVO {
  /**
   * 租户主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 租户唯一业务编码
   */
  tenantCode: string;
  /**
   * 租户名称
   */
  tenantName: string;
}

/**
 * 租户套餐菜单缩减影响范围只读预览响应模型。
 */
export interface TenantPackageShrinkPreviewVO {
  /**
   * 本次被移除的菜单主键集合
   */
  removedMenuIds: string[];
  /**
   * 本次被移除的菜单标题清单
   */
  removedMenuTitles: string[];
  /**
   * 受影响的关联租户数量
   */
  affectedTenantCount: number;
  /**
   * 受影响的关联租户明细清单
   */
  affectedTenants: AffectedTenantSummaryVO[];
}

/**
 * 分页查询租户套餐列表（含绑定菜单数与绑定租户数聚合统计）。
 *
 * @param params 分页与筛选参数
 * @returns 空安全套餐分页结果
 */
export async function getTenantPackagePage(
  params?: TenantPackageQuery,
): Promise<PageResult<TenantPackageVO>> {
  const page = await adminHttpClient.get<PageResult<TenantPackageVO>>(
    '/admin/system/tenant-package/page',
    { params },
  );
  return createPageResult(page?.records, page?.total, {
    current: page?.current,
    size: page?.size,
    pages: page?.pages,
  });
}

/**
 * 拉取全部正常启用状态的租户套餐下拉选项。
 *
 * @returns 空安全启用套餐选项列表
 */
export async function getTenantPackageOptions(): Promise<TenantPackageOptionVO[]> {
  const list = await adminHttpClient.get<TenantPackageOptionVO[]>(
    '/admin/system/tenant-package/options',
  );
  return list ?? [];
}

/**
 * 查询指定租户套餐详情及已授权菜单主键列表。
 *
 * @param id 套餐主键
 * @returns 套餐详情视图
 */
export async function getTenantPackageDetail(id: string): Promise<TenantPackageDetailVO> {
  const detail = await adminHttpClient.get<TenantPackageDetailVO>(
    `/admin/system/tenant-package/${encodeURIComponent(id.trim())}`,
  );
  return {
    ...detail,
    menuIds: (detail.menuIds ?? []).map(String),
  };
}

/**
 * 预览编辑缩减套餐菜单后对存量绑定租户与移除菜单名称的影响范围。
 *
 * @param data 缩减预览请求载荷
 * @returns 影响范围只读预览视图
 */
export async function previewPackageShrink(
  data: TenantPackageShrinkPreviewRequest,
): Promise<TenantPackageShrinkPreviewVO> {
  const preview = await adminHttpClient.post<
    TenantPackageShrinkPreviewVO,
    TenantPackageShrinkPreviewRequest
  >('/admin/system/tenant-package/shrink-preview', data);
  return {
    removedMenuIds: (preview?.removedMenuIds ?? []).map(String),
    removedMenuTitles: preview?.removedMenuTitles ?? [],
    affectedTenantCount: Number(preview?.affectedTenantCount ?? 0),
    affectedTenants: (preview?.affectedTenants ?? []).map(tenant => ({
      ...tenant,
      id: String(tenant.id),
    })),
  };
}

/**
 * 新增租户套餐并绑定非平台专属菜单权限。
 *
 * @param data 套餐保存请求
 * @returns 新建套餐主键（64 位雪花 ID 字符串）
 */
export async function createTenantPackage(data: TenantPackageSaveRequest): Promise<string> {
  const id = await adminHttpClient.post<string, TenantPackageSaveRequest>(
    '/admin/system/tenant-package',
    data,
  );
  return String(id);
}

/**
 * 修改租户套餐（菜单缩减时由后端在事务内同步裁剪关联租户的越界角色权限）。
 *
 * @param data 套餐修改请求
 * @returns 空完成 Promise
 */
export async function updateTenantPackage(data: TenantPackageSaveRequest): Promise<void> {
  await adminHttpClient.put<void, TenantPackageSaveRequest>('/admin/system/tenant-package', data);
}

/**
 * 切换租户套餐启停状态（停用后存量已绑定租户可继续运行，仅禁止后续新选）。
 *
 * @param id     套餐主键
 * @param status 目标状态（0=正常，1=停用）
 * @returns 空完成 Promise
 */
export async function updateTenantPackageStatus(id: string, status: CommonStatus): Promise<void> {
  await adminHttpClient.put<void, { status: CommonStatus }>(
    `/admin/system/tenant-package/${encodeURIComponent(id.trim())}/status`,
    { status },
  );
}

/**
 * 批量删除未被引用的租户套餐（仍被租户绑定时后端返回 102005 整批拦截）。
 *
 * @param ids 单个或数组形式的套餐主键集合
 * @returns 空完成 Promise
 */
export async function deleteTenantPackages(ids: string | string[]): Promise<void> {
  const pathIds = formatBatchPathIds(ids);
  if (!pathIds) {
    return;
  }
  await adminHttpClient.delete<void>(`/admin/system/tenant-package/${pathIds}`);
}
