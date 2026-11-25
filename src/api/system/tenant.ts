import { createPageResult, type PageQuery, type PageResult } from '@atengk/core';
import type { CommonStatus } from '@/api/types';
import { adminHttpClient, formatBatchPathIds } from '@/utils/http';

/**
 * 租户管理域强类型 API 契约（对齐后端 SysTenantController，路径前缀 /admin/system/tenant）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 顶栏租户切换器下拉选项模型（GET /admin/system/tenant/options）。
 */
export interface TenantOptionVO {
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
  /**
   * 租户状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 租户授权到期时间（为空表示永久有效）
   */
  expireTime?: string | null;
}

/**
 * 租户分页检索参数（GET /admin/system/tenant/page）。
 */
export interface TenantQuery extends PageQuery {
  /**
   * 租户唯一业务编码模糊匹配
   */
  tenantCode?: string;
  /**
   * 租户名称模糊匹配
   */
  tenantName?: string;
  /**
   * 租户状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 关联租户套餐主键
   */
  packageId?: string;
}

/**
 * 租户分页与详情视图对象。
 */
export interface TenantVO {
  /**
   * 租户主键（平台默认租户为 '0'）
   */
  id: string;
  /**
   * 租户唯一业务编码（平台默认租户为 '000000'）
   */
  tenantCode: string;
  /**
   * 租户名称
   */
  tenantName: string;
  /**
   * 关联租户套餐主键（平台默认租户为 null）
   */
  packageId?: string | null;
  /**
   * 关联租户套餐名称
   */
  packageName?: string | null;
  /**
   * 所绑定套餐当前是否处于停用状态
   */
  packageDisabled?: boolean | null;
  /**
   * 账号配额上限（-1 表示不限制，>= 1 表示限制数量）
   */
  accountCount: number;
  /**
   * 当前已使用有效账号数量
   */
  usedAccountCount: number;
  /**
   * 授权过期时间（为空表示永久有效）
   */
  expireTime?: string | null;
  /**
   * 当前是否已过期
   */
  expired?: boolean | null;
  /**
   * 租户启停状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 备注说明
   */
  remark?: string | null;
  /**
   * 是否平台内置默认租户
   */
  platformDefault?: boolean | null;
  /**
   * 创建时间
   */
  createTime: string;
}

/**
 * 新增租户及 4 步原子初始化请求载荷（POST /admin/system/tenant）。
 */
export interface TenantCreateRequest {
  /**
   * 租户唯一业务编码（4~32 位字母/数字/下划线/短横线，禁填 000000）
   */
  tenantCode: string;
  /**
   * 租户名称（2~50 字符）
   */
  tenantName: string;
  /**
   * 关联正常启用套餐主键
   */
  packageId: string;
  /**
   * 账号配额上限（-1 表示不限，>= 1 表示最大有效用户数）
   */
  accountCount: number;
  /**
   * 租户过期时间（yyyy-MM-dd HH:mm:ss，为空表示永久有效）
   */
  expireTime?: string | null;
  /**
   * 初始状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 备注说明
   */
  remark?: string | null;
  /**
   * 默认租户管理员登录账号（2~30 位字母、数字或下划线）
   */
  adminUsername: string;
  /**
   * 默认租户管理员初始密码（须满足全站强口令策略）
   */
  adminPassword: string;
}

/**
 * 编辑租户请求载荷（PUT /admin/system/tenant；0 号租户仅传 id、tenantName、remark）。
 */
export interface TenantUpdateRequest {
  /**
   * 租户主键
   */
  id: string;
  /**
   * 租户编码（只读校验字段）
   */
  tenantCode?: string;
  /**
   * 租户名称（2~50 字符）
   */
  tenantName: string;
  /**
   * 关联租户套餐主键（非 0 号租户必填）
   */
  packageId?: string | null;
  /**
   * 账号配额上限（-1 表示不限，>= 1 表示限制数量）
   */
  accountCount?: number | null;
  /**
   * 租户过期时间（为空表示永久有效）
   */
  expireTime?: string | null;
  /**
   * 租户状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 备注说明
   */
  remark?: string | null;
}

/**
 * 新建租户初始化完成后返回的一次性登录凭据指引视图（CreateTenantVO）。
 */
export interface CreateTenantVO {
  /**
   * 新建租户雪花主键
   */
  tenantId: string;
  /**
   * 租户登录业务编码
   */
  tenantCode: string;
  /**
   * 租户名称
   */
  tenantName: string;
  /**
   * 初始化完成的默认租户管理员账号
   */
  adminUsername: string;
}

function normalizeTenantVO(item: TenantVO): TenantVO {
  return {
    ...item,
    id: String(item.id),
    packageId: item.packageId != null ? String(item.packageId) : null,
    accountCount: Number(item.accountCount),
    usedAccountCount: Number(item.usedAccountCount ?? 0),
  };
}

/**
 * 分页查询平台纳管的全部 SaaS 租户列表。
 *
 * @param params 分页与筛选参数
 * @returns 空安全租户分页结果
 */
export async function getTenantPage(params?: TenantQuery): Promise<PageResult<TenantVO>> {
  const page = await adminHttpClient.get<PageResult<TenantVO>>('/admin/system/tenant/page', {
    params,
  });
  return createPageResult(
    (page?.records ?? []).map(normalizeTenantVO),
    page?.total,
    {
      current: page?.current,
      size: page?.size,
      pages: page?.pages,
    },
  );
}

/**
 * 拉取当前平台可供平台超管切换的正常未过期租户列表。
 *
 * @returns 可选活跃租户集合，无匹配时返回空数组
 */
export async function getTenantOptions(): Promise<TenantOptionVO[]> {
  const list = await adminHttpClient.get<TenantOptionVO[]>('/admin/system/tenant/options');
  return list ?? [];
}

/**
 * 按主键查询租户详情（包含 0 号平台默认租户）。
 *
 * @param id 租户主键
 * @returns 租户详情视图
 */
export async function getTenantDetail(id: string): Promise<TenantVO> {
  const detail = await adminHttpClient.get<TenantVO>(
    `/admin/system/tenant/${encodeURIComponent(id.trim())}`,
  );
  return normalizeTenantVO(detail);
}

/**
 * 新增租户并执行 4 步原子初始化（租户、顶级部门、tenant_admin 角色与默认管理员）。
 *
 * @param data 新增租户请求载荷
 * @returns 新建租户登录指引凭据视图
 */
export async function createTenant(data: TenantCreateRequest): Promise<CreateTenantVO> {
  const created = await adminHttpClient.post<CreateTenantVO, TenantCreateRequest>(
    '/admin/system/tenant',
    data,
  );
  return {
    ...created,
    tenantId: String(created.tenantId),
  };
}

/**
 * 修改租户基础信息或变更关联套餐（0 号平台默认租户仅允许修改名称与备注）。
 *
 * @param data 编辑租户请求载荷
 * @returns 空完成 Promise
 */
export async function updateTenant(data: TenantUpdateRequest): Promise<void> {
  await adminHttpClient.put<void, TenantUpdateRequest>('/admin/system/tenant', data);
}

/**
 * 切换租户启停状态（0 号租户受 102003 保护；停用后强退该租户全员在线会话）。
 *
 * @param id     租户主键
 * @param status 目标状态（0=正常，1=停用）
 * @returns 空完成 Promise
 */
export async function updateTenantStatus(id: string, status: CommonStatus): Promise<void> {
  await adminHttpClient.put<void, { status: CommonStatus }>(
    `/admin/system/tenant/${encodeURIComponent(id.trim())}/status`,
    { status },
  );
}

/**
 * 批量逻辑删除业务租户并强退全员在线会话（含 0 号租户时后端抛出 102003 拦截）。
 *
 * @param ids 单个或数组形式的租户主键集合
 * @returns 空完成 Promise
 */
export async function deleteTenants(ids: string | string[]): Promise<void> {
  const pathIds = formatBatchPathIds(ids);
  if (!pathIds) {
    return;
  }
  await adminHttpClient.delete<void>(`/admin/system/tenant/${pathIds}`);
}
