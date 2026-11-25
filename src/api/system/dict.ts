import { adminHttpClient } from '@/utils/http';
import type { CommonStatus } from '@/api/types';

/**
 * 动态数据字典项数据传输对象（对应后端 SysDictDataVO）。
 *
 * @author Ateng
 * @since 2026-11-25
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
