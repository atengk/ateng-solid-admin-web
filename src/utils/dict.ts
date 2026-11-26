import { DictManager, type DictItem } from '@atengk/element-plus';
import type { OptionItem } from '@/api/types';
import { getEnumByName, getEnumsBatch } from '@/api/system/enum';
import { getDictDataByType, type DictDataVO } from '@/api/system/dict';

const VALID_TAG_TYPES = new Set(['primary', 'success', 'warning', 'danger', 'info']);

/**
 * 归一化后端或字典明细的 Tag 语义色彩，剔除 `'default'`、空白及非法值。
 *
 * @param raw 原始标签样式字符串
 * @returns Element Plus 合法 Tag 类型；非法或默认值返回 `undefined`
 */
export function normalizeTagType(raw?: string | null): DictItem['tagType'] {
  if (typeof raw !== 'string') {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'default') {
    return undefined;
  }
  return VALID_TAG_TYPES.has(trimmed) ? (trimmed as DictItem['tagType']) : undefined;
}

function isStaticEnumCode(code: string): boolean {
  // 静态枚举采用 lowerCamelCase（含大写字母），动态字典强制 snake_case，两者命名空间正交
  return /[A-Z]/.test(code);
}

function readExtraString(
  extra: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const val = extra?.[key];
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
}

function mapOptionItemToDictItem(item: OptionItem): DictItem {
  const rawTag = readExtraString(item.extra, 'tagType') ?? readExtraString(item.extra, 'listClass');
  const cssClass = readExtraString(item.extra, 'cssClass');
  return {
    label: item.label,
    value: item.code,
    disabled: Boolean(item.disabled),
    tagType: normalizeTagType(rawTag),
    cssClass,
    raw: item,
  };
}

function mapDictDataToDictItem(item: DictDataVO): DictItem {
  const trimmedCss = item.cssClass?.trim();
  return {
    label: item.dictLabel,
    value: item.dictValue,
    disabled: item.status !== 0,
    tagType: normalizeTagType(item.tagType),
    cssClass: trimmedCss ? trimmedCss : undefined,
    raw: item,
  };
}

async function loadSingleDictOrEnum(code: string): Promise<DictItem[]> {
  const trimmed = code.trim();
  if (!trimmed) {
    return [];
  }
  if (isStaticEnumCode(trimmed)) {
    const options = await getEnumByName(trimmed);
    return options.map(mapOptionItemToDictItem);
  }
  const dictItems = await getDictDataByType(trimmed);
  return dictItems.map(mapDictDataToDictItem);
}

async function loadBatchDictOrEnum(codes: string[]): Promise<Record<string, DictItem[]>> {
  const uniqueCodes = Array.from(new Set(codes.map(code => code.trim()).filter(Boolean)));
  const result: Record<string, DictItem[]> = {};
  if (!uniqueCodes.length) {
    return result;
  }

  const enumCodes: string[] = [];
  const dictCodes: string[] = [];
  for (const code of uniqueCodes) {
    if (isStaticEnumCode(code)) {
      enumCodes.push(code);
    } else {
      dictCodes.push(code);
    }
  }

  await Promise.all([
    (async () => {
      if (!enumCodes.length) {
        return;
      }
      const batchMap = await getEnumsBatch(enumCodes);
      for (const enumCode of enumCodes) {
        const rawList = batchMap[enumCode] ?? [];
        result[enumCode] = rawList.map(mapOptionItemToDictItem);
      }
    })(),
    ...dictCodes.map(async dictCode => {
      const dictList = await getDictDataByType(dictCode);
      result[dictCode] = dictList.map(mapDictDataToDictItem);
    }),
  ]);

  return result;
}

/**
 * 注册双轨（静态枚举 + 动态数据字典）单查与批量合并 Provider 至全局 DictManager。
 *
 * @author Ateng
 * @since 2026-11-25
 */
export function setupDictManager(): void {
  DictManager.setProvider(loadSingleDictOrEnum);
  DictManager.setBatchProvider(loadBatchDictOrEnum);
}

/**
 * 在业务数据就绪渲染前并发预热所需字典/枚举缓存，复用 `DictManager.loadDict` 单飞去重避免重复请求。
 * 字典预加载失败时静默降级返回业务数据，不阻断主列表加载。
 *
 * @param codes 需要预加载的静态枚举或动态字典编码集合
 * @param loader 业务数据异步加载函数
 * @returns 业务数据加载函数的返回值
 */
export async function withDictPreload<T>(
  codes: readonly string[],
  loader: () => Promise<T>,
): Promise<T> {
  const uniqueCodes = Array.from(new Set(codes.map(code => code.trim()).filter(Boolean)));
  const preloadPromise = Promise.all(
    uniqueCodes.map(code => DictManager.loadDict(code).catch(() => [] as DictItem[])),
  );
  const [result] = await Promise.all([loader(), preloadPromise]);
  return result;
}
