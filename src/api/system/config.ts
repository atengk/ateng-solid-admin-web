import { createPageResult, type PageQuery, type PageResult } from '@atengk/core';
import type { YesNoValue } from '@/api/types';
import { adminHttpClient, formatBatchPathIds } from '@/utils/http';

/**
 * 系统参数管理与键值读取强类型 API 契约（对齐后端 SysConfigController，路径前缀 /admin/system/config）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 系统参数内置标识（Y=系统内置，N=业务自建）。
 */
export type ConfigType = YesNoValue;

/**
 * 系统参数分页检索参数（GET /admin/system/config/page）。
 */
export interface ConfigQuery extends PageQuery {
  /**
   * 参数名称模糊匹配
   */
  configName?: string;
  /**
   * 参数键名模糊匹配
   */
  configKey?: string;
  /**
   * 参数类型（Y=系统内置，N=业务自建）
   */
  configType?: ConfigType;
}

/**
 * 系统参数分页与详情视图对象。
 */
export interface ConfigVO {
  /**
   * 参数主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 参数名称
   */
  configName: string;
  /**
   * 参数键名（同租户内唯一）
   */
  configKey: string;
  /**
   * 参数键值
   */
  configValue: string;
  /**
   * 参数类型（Y=系统内置，N=业务自建）
   */
  configType: ConfigType;
  /**
   * 备注
   */
  remark?: string | null;
  /**
   * 创建时间
   */
  createTime: string;
}

/**
 * 系统参数新增与修改请求载荷（POST / PUT /admin/system/config）。
 */
export interface ConfigSaveRequest {
  /**
   * 参数主键（新增留空，修改必填）
   */
  id?: string;
  /**
   * 参数名称（2~100 字符）
   */
  configName: string;
  /**
   * 参数键名（2~100 位字母、数字、点、下划线或短横线；系统内置 Y 编辑只读）
   */
  configKey: string;
  /**
   * 参数键值（1~2000 字符；sys.user.initPassword 须满足全站强口令策略）
   */
  configValue: string;
  /**
   * 参数类型（新建仅允许 N；系统内置 Y 不可降级）
   */
  configType?: ConfigType;
  /**
   * 备注（不超过 500 字符）
   */
  remark?: string | null;
}

/**
 * 分页查询当前工作租户下的系统参数。
 *
 * @param params 分页与筛选条件
 * @returns 空安全系统参数分页结果
 */
export async function getConfigPage(params?: ConfigQuery): Promise<PageResult<ConfigVO>> {
  const page = await adminHttpClient.get<PageResult<ConfigVO>>('/admin/system/config/page', {
    params,
  });
  return createPageResult(page?.records, page?.total, {
    current: page?.current,
    size: page?.size,
    pages: page?.pages,
  });
}

/**
 * 查询单条系统参数详情。
 *
 * @param id 参数主键
 * @returns 系统参数详情对象
 */
export async function getConfigDetail(id: string): Promise<ConfigVO> {
  return adminHttpClient.get<ConfigVO>(`/admin/system/config/${encodeURIComponent(id.trim())}`);
}

/**
 * 按参数键名读取参数值（普通租户未覆盖时由后端自动回退读取平台默认租户 0 全局值）。
 *
 * @param configKey 参数键名
 * @returns 参数键值字符串；未配置或入参空白时返回 null
 */
export async function getConfigByKey(configKey: string): Promise<string | null> {
  const trimmed = configKey.trim();
  if (!trimmed) {
    return null;
  }
  const value = await adminHttpClient.get<string | null>(
    `/admin/system/config/key/${encodeURIComponent(trimmed)}`,
  );
  return value ?? null;
}

/**
 * 新增系统参数（后端强制仅允许业务自建类型 N）。
 *
 * @param data 系统参数保存请求
 * @returns 新建参数主键（64 位雪花 ID 字符串）
 */
export async function createConfig(data: ConfigSaveRequest): Promise<string> {
  return adminHttpClient.post<string, ConfigSaveRequest>('/admin/system/config', data);
}

/**
 * 修改系统参数（内置参数 Y 禁改键名与降级，sys.user.initPassword 禁传弱口令）。
 *
 * @param data 系统参数修改请求
 * @returns 空完成 Promise
 */
export async function updateConfig(data: ConfigSaveRequest): Promise<void> {
  await adminHttpClient.put<void, ConfigSaveRequest>('/admin/system/config', data);
}

/**
 * 批量删除当前租户下的业务自建参数（包含系统内置 Y 时后端返回 102007 整批拦截）。
 *
 * @param ids 单个或数组形式的参数主键集合
 * @returns 空完成 Promise
 */
export async function deleteConfigs(ids: string | string[]): Promise<void> {
  const pathIds = formatBatchPathIds(ids);
  if (!pathIds) {
    return;
  }
  await adminHttpClient.delete<void>(`/admin/system/config/${pathIds}`);
}
