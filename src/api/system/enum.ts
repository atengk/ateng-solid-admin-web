import { adminHttpClient } from '@/utils/http';
import type { OptionItem } from '@/api/types';

/**
 * 静态枚举只读 API 契约（对齐后端 SysEnumController，路径前缀 /admin/system/enums）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 获取后端已注册的全量静态枚举目录与选项映射。
 *
 * @returns 枚举别名到选项列表的映射表
 */
export async function getAllEnums(): Promise<Record<string, OptionItem[]>> {
  const result = await adminHttpClient.get<Record<string, OptionItem[]>>('/admin/system/enums');
  return result ?? {};
}

/**
 * 按枚举别名查询单个静态枚举选项列表。
 *
 * @param name lowerCamelCase 枚举别名（如 dataScopeType）
 * @returns 匹配的选项列表，未匹配或入参为空时返回空数组
 */
export async function getEnumByName(name: string): Promise<OptionItem[]> {
  const trimmed = name.trim();
  if (!trimmed) {
    return [];
  }
  const result = await adminHttpClient.get<OptionItem[]>(
    `/admin/system/enums/${encodeURIComponent(trimmed)}`,
  );
  return result ?? [];
}

/**
 * 批量合并查询多个静态枚举选项映射（请求体直传字符串数组，对齐后端 @RequestBody List<String>）。
 *
 * @param names 静态枚举别名数组
 * @returns 静态枚举别名到选项集合的映射对象
 */
export async function getEnumsBatch(names: string[]): Promise<Record<string, OptionItem[]>> {
  if (!names.length) {
    return {};
  }
  const result = await adminHttpClient.post<Record<string, OptionItem[]>>(
    '/admin/system/enums/batch',
    names,
  );
  return result ?? {};
}
