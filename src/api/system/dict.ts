import { createPageResult, type PageQuery, type PageResult } from '@atengk/core';
import type { CommonStatus, TagType } from '@/api/types';
import { adminHttpClient, formatBatchPathIds } from '@/utils/http';

/**
 * 动态数据字典管理与消费域强类型 API 契约（对齐后端 SysDictController，全量 14 个端点）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 字典类型分页查询条件（GET /admin/system/dict/type/page）。
 */
export interface DictTypeQuery extends PageQuery {
  /**
   * 字典名称模糊匹配
   */
  dictName?: string;
  /**
   * 字典类型编码模糊匹配
   */
  dictType?: string;
  /**
   * 启停状态（0=正常，1=停用）
   */
  status?: CommonStatus;
}

/**
 * 字典类型视图对象（分页列表与详情通用）。
 */
export interface DictTypeVO {
  /**
   * 字典类型主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 字典名称
   */
  dictName: string;
  /**
   * 字典类型编码（snake_case，全局唯一且创建后只读）
   */
  dictType: string;
  /**
   * 启停状态（0=正常，1=停用）
   */
  status: CommonStatus;
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
 * 启用态字典类型轻量化下拉选项（GET /admin/system/dict/type/options）。
 */
export interface DictTypeOptionVO {
  /**
   * 字典类型主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 字典名称
   */
  dictName: string;
  /**
   * 字典类型编码
   */
  dictType: string;
  /**
   * 启停状态（0=正常，1=停用）
   */
  status: CommonStatus;
}

/**
 * 字典类型新增/修改请求载荷（POST / PUT /admin/system/dict/type）。
 */
export interface DictTypeSaveRequest {
  /**
   * 字典类型主键（新增留空，修改必填）
   */
  id?: string;
  /**
   * 字典名称（2~50 字符）
   */
  dictName: string;
  /**
   * 字典类型编码（新增必填，修改保持原值只读）
   */
  dictType?: string;
  /**
   * 启停状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 备注（不超过 500 字符）
   */
  remark?: string | null;
}

/**
 * 字典数据分页查询条件（GET /admin/system/dict/data/page）。
 */
export interface DictDataQuery extends PageQuery {
  /**
   * 所属字典类型编码（精确匹配）
   */
  dictType?: string;
  /**
   * 字典标签模糊匹配
   */
  dictLabel?: string;
  /**
   * 启停状态（0=正常，1=停用）
   */
  status?: CommonStatus;
}

/**
 * 动态数据字典项数据传输对象（对应后端 DictDataVO）。
 */
export interface DictDataVO {
  /**
   * 字典数据主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 所属字典类型编码（snake_case）
   */
  dictType: string;
  /**
   * 字典显示标签
   */
  dictLabel: string;
  /**
   * 字典真实键值
   */
  dictValue: string;
  /**
   * Tag 语义回显色彩（'' | primary | success | warning | danger | info）
   */
  tagType?: string | null;
  /**
   * 自定义扩展 CSS 类名
   */
  cssClass?: string | null;
  /**
   * 显示排序（升序）
   */
  sort: number;
  /**
   * 是否默认项（0=否，1=是）
   */
  isDefault: CommonStatus;
  /**
   * 启用状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 备注
   */
  remark?: string | null;
  /**
   * 创建时间（消费端点与管理列表均返回，历史静态桩可省略）
   */
  createTime?: string;
}

/**
 * 字典数据新增/修改请求载荷（POST / PUT /admin/system/dict/data）。
 */
export interface DictDataSaveRequest {
  /**
   * 字典明细主键（新增留空，修改必填）
   */
  id?: string;
  /**
   * 所属字典类型编码（修改须与原值一致）
   */
  dictType: string;
  /**
   * 字典标签（1~64 字符）
   */
  dictLabel: string;
  /**
   * 字典键值（1~64 字符，同 dictType 内唯一）
   */
  dictValue: string;
  /**
   * Tag 语义回显样式
   */
  tagType?: TagType | null;
  /**
   * 自定义扩展 CSS 类名
   */
  cssClass?: string | null;
  /**
   * 显示排序（0~9999）
   */
  sort: number;
  /**
   * 是否默认项（0=否，1=是，同 dictType 互斥唯一）
   */
  isDefault?: CommonStatus;
  /**
   * 启用状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 备注（不超过 500 字符）
   */
  remark?: string | null;
}

/**
 * 分页查询动态字典类型列表（平台默认租户 0 专属）。
 *
 * @param params 分页与筛选参数
 * @returns 空安全字典类型分页结果
 */
export async function getDictTypePage(params?: DictTypeQuery): Promise<PageResult<DictTypeVO>> {
  const page = await adminHttpClient.get<PageResult<DictTypeVO>>('/admin/system/dict/type/page', {
    params,
  });
  return createPageResult(page?.records, page?.total, {
    current: page?.current,
    size: page?.size,
    pages: page?.pages,
  });
}

/**
 * 获取启用状态的动态字典类型下拉选项。
 *
 * @returns 空安全字典类型选项数组
 */
export async function getDictTypeOptions(): Promise<DictTypeOptionVO[]> {
  const list = await adminHttpClient.get<DictTypeOptionVO[]>('/admin/system/dict/type/options');
  return list ?? [];
}

/**
 * 查询指定字典类型详情。
 *
 * @param id 字典类型主键
 * @returns 字典类型详情对象
 */
export async function getDictTypeDetail(id: string): Promise<DictTypeVO> {
  return adminHttpClient.get<DictTypeVO>(
    `/admin/system/dict/type/${encodeURIComponent(id.trim())}`,
  );
}

/**
 * 新增动态字典类型。
 *
 * @param data 字典类型保存请求
 * @returns 新建字典类型主键（64 位雪花 ID 字符串）
 */
export async function createDictType(data: DictTypeSaveRequest): Promise<string> {
  return adminHttpClient.post<string, DictTypeSaveRequest>('/admin/system/dict/type', data);
}

/**
 * 修改动态字典类型基本信息（后端强校验锁定 dictType 不可变更）。
 *
 * @param data 字典类型修改请求
 * @returns 空完成 Promise
 */
export async function updateDictType(data: DictTypeSaveRequest): Promise<void> {
  await adminHttpClient.put<void, DictTypeSaveRequest>('/admin/system/dict/type', data);
}

/**
 * 切换字典类型启停状态。
 *
 * @param id     字典类型主键
 * @param status 目标状态（0=正常，1=停用）
 * @returns 空完成 Promise
 */
export async function updateDictTypeStatus(id: string, status: CommonStatus): Promise<void> {
  await adminHttpClient.put<void, { status: CommonStatus }>(
    `/admin/system/dict/type/${encodeURIComponent(id.trim())}/status`,
    { status },
  );
}

/**
 * 批量删除字典类型（任一类型下存在未删除明细时后端返回 102005 整批阻断）。
 *
 * @param ids 单个或数组形式的字典类型主键集合
 * @returns 空完成 Promise
 */
export async function deleteDictTypes(ids: string | string[]): Promise<void> {
  const pathIds = formatBatchPathIds(ids);
  if (!pathIds) {
    return;
  }
  await adminHttpClient.delete<void>(`/admin/system/dict/type/${pathIds}`);
}

/**
 * 分页查询动态字典数据明细。
 *
 * @param params 分页与筛选参数
 * @returns 空安全字典数据分页结果
 */
export async function getDictDataPage(params?: DictDataQuery): Promise<PageResult<DictDataVO>> {
  const page = await adminHttpClient.get<PageResult<DictDataVO>>('/admin/system/dict/data/page', {
    params,
  });
  return createPageResult(page?.records, page?.total, {
    current: page?.current,
    size: page?.size,
    pages: page?.pages,
  });
}

/**
 * 查询单条字典数据明细详情。
 *
 * @param id 字典数据主键
 * @returns 字典数据详情对象
 */
export async function getDictDataDetail(id: string): Promise<DictDataVO> {
  return adminHttpClient.get<DictDataVO>(
    `/admin/system/dict/data/${encodeURIComponent(id.trim())}`,
  );
}

/**
 * 按字典类型编码只读拉取正常启用状态的动态字典项集合。
 *
 * @param dictType 字典类型编码（如 sys_user_gender）
 * @returns 字典明细列表，未匹配或入参为空时返回空数组
 */
export async function getDictDataByType(dictType: string): Promise<DictDataVO[]> {
  const trimmed = dictType.trim();
  if (!trimmed) {
    return [];
  }
  const result = await adminHttpClient.get<DictDataVO[]>(
    `/admin/system/dict/data/type/${encodeURIComponent(trimmed)}`,
  );
  return result ?? [];
}

/**
 * 新增动态字典数据明细。
 *
 * @param data 字典数据保存请求
 * @returns 新建字典数据主键（64 位雪花 ID 字符串）
 */
export async function createDictData(data: DictDataSaveRequest): Promise<string> {
  return adminHttpClient.post<string, DictDataSaveRequest>('/admin/system/dict/data', data);
}

/**
 * 修改动态字典数据明细。
 *
 * @param data 字典数据修改请求
 * @returns 空完成 Promise
 */
export async function updateDictData(data: DictDataSaveRequest): Promise<void> {
  await adminHttpClient.put<void, DictDataSaveRequest>('/admin/system/dict/data', data);
}

/**
 * 切换动态字典数据启停状态。
 *
 * @param id     字典数据主键
 * @param status 目标状态（0=正常，1=停用）
 * @returns 空完成 Promise
 */
export async function updateDictDataStatus(id: string, status: CommonStatus): Promise<void> {
  await adminHttpClient.put<void, { status: CommonStatus }>(
    `/admin/system/dict/data/${encodeURIComponent(id.trim())}/status`,
    { status },
  );
}

/**
 * 批量删除动态字典数据明细。
 *
 * @param ids 单个或数组形式的字典数据主键集合
 * @returns 空完成 Promise
 */
export async function deleteDictData(ids: string | string[]): Promise<void> {
  const pathIds = formatBatchPathIds(ids);
  if (!pathIds) {
    return;
  }
  await adminHttpClient.delete<void>(`/admin/system/dict/data/${pathIds}`);
}
