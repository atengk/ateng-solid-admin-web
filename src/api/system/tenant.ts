import type { CommonStatus } from '@/api/types';
import { adminHttpClient } from '@/utils/http';

/**
 * 租户管理域轻量选项契约（Spec 2 首版导出切换器选项，CRUD 接口于 Spec 3 增量补全）。
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
 * 拉取当前平台可供平台超管切换的正常未过期租户列表。
 *
 * @returns 可选活跃租户集合，无匹配时返回空数组
 */
export async function getTenantOptions(): Promise<TenantOptionVO[]> {
  const list = await adminHttpClient.get<TenantOptionVO[]>('/admin/system/tenant/options');
  return list ?? [];
}
