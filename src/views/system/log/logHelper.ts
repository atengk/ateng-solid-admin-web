import { computed, type WritableComputedRef } from 'vue';
import { ElMessage } from 'element-plus';

/**
 * 审计日志共享纯逻辑工具（JSON 美化缩进、时间区间快捷选择、双向区间绑定与安全剪贴板复制）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export interface DateRangeQueryShape {
  beginTime?: string;
  endTime?: string;
}

export type AuditDateRangeValue = string | number | Date;

export const DEFAULT_AUDIT_PICKER_TIME: [Date, Date] = [
  new Date(2000, 0, 1, 0, 0, 0),
  new Date(2000, 0, 1, 23, 59, 59),
];

/**
 * 构造适用于 `AtengDateRange` 与 `usePagination().query`（`beginTime`/`endTime`）的双向区间绑定。
 * 清空时同步接收 `null` 或 `undefined`，统一把起止时间复位为 `undefined`，防止默认值 `null` 残留进查询参数。
 *
 * @param query 分页查询状态对象
 * @returns 可写计算属性，用于 `v-model` 绑定时间区间选择器
 */
export function createTimeRangeBinding<T extends DateRangeQueryShape>(
  query: T,
): WritableComputedRef<[AuditDateRangeValue, AuditDateRangeValue] | null> {
  return computed<[AuditDateRangeValue, AuditDateRangeValue] | null>({
    get: (): [AuditDateRangeValue, AuditDateRangeValue] | null =>
      query.beginTime && query.endTime ? [query.beginTime, query.endTime] : null,
    set: (value: [AuditDateRangeValue, AuditDateRangeValue] | null | undefined) => {
      const start = value?.[0];
      const end = value?.[1];
      query.beginTime = typeof start === 'string' && start.trim() ? start : undefined;
      query.endTime = typeof end === 'string' && end.trim() ? end : undefined;
    },
  });
}

/**
 * 重置查询对象上的起止时间区间字段。
 *
 * @param query 包含 `beginTime` 与 `endTime` 的查询对象
 */
export function resetAuditDateRange(query: DateRangeQueryShape): void {
  query.beginTime = undefined;
  query.endTime = undefined;
}

export interface AuditPayloadFormatResult {
  /**
   * 格式化后展示文本（合法 JSON 执行 2 空格美化缩进，否则保持原串）
   */
  formatted: string;
  /**
   * 是否为合法 JSON 结构
   */
  isJson: boolean;
}

/**
 * 格式化操作日志请求参数与响应报文，仅对合法 JSON 执行 2 空格缩进美化。
 *
 * @param raw 原始报文字符串
 * @returns 格式化结果；为空或纯空白时 `formatted` 为 `'--'`
 */
export function formatAuditPayload(raw?: string | null): AuditPayloadFormatResult {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return { formatted: '--', isJson: false };
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return {
        formatted: JSON.stringify(parsed, null, 2),
        isJson: true,
      };
    } catch {
      return { formatted: raw ?? '', isJson: false };
    }
  }
  return { formatted: raw ?? '', isJson: false };
}

/**
 * 构造审计日志时间区间检索快捷选项（今天、最近 7 天、最近 30 天）。
 *
 * @returns 适配 Element Plus ElDatePicker datetimerange 的快捷选项列表
 */
export function buildAuditTimeShortcuts(): Array<{
  text: string;
  value: () => [Date, Date];
}> {
  const createRange = (daysBack: number): [Date, Date] => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setDate(start.getDate() - daysBack);
    start.setHours(0, 0, 0, 0);
    return [start, end];
  };

  return [
    { text: '今天', value: () => createRange(0) },
    { text: '最近 7 天', value: () => createRange(6) },
    { text: '最近 30 天', value: () => createRange(29) },
  ];
}

/**
 * 格式化操作人与用户 ID 组合展示文案，确保姓名缺失但存在 userId 时仍保留 ID。
 *
 * @param userName 操作人名称
 * @param userId   操作人主键 ID
 * @returns 组合文案（如 `张敏 (1001)`、`-- (1001)`），全为空时返回 `'--'`
 */
export function formatAuditOperator(userName?: string | null, userId?: string | null): string {
  const cleanName = userName?.trim() ?? '';
  const cleanId = userId?.trim() ?? '';
  if (!cleanName && !cleanId) {
    return '--';
  }
  const displayName = cleanName || '--';
  return cleanId ? `${displayName} (${cleanId})` : displayName;
}

/**
 * 格式化浏览器与操作系统组合展示字符串。
 *
 * @param browser 浏览器名称
 * @param os      操作系统名称
 * @returns 组合文案；均为空时返回 `'--'`
 */
export function formatAuditClientEnv(browser?: string | null, os?: string | null): string {
  const parts = [browser?.trim(), os?.trim()].filter((val): val is string => Boolean(val));
  return parts.length > 0 ? parts.join(' / ') : '--';
}

/**
 * 复制追踪标识或脱敏报文到系统剪贴板。
 *
 * @param text         待复制文本
 * @param label        提示文案前缀（如 `TraceId` 或 `请求参数`）
 */
export async function copyAuditText(text?: string | null, label = '内容'): Promise<void> {
  const value = text?.trim() ?? '';
  if (!value) {
    return;
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      ElMessage.success(`已复制${label}`);
      return;
    }
  } catch {
    // 浏览器未授权剪贴板时回落警告提示，不抛出未捕获 Promise
  }
  ElMessage.warning('当前环境不支持自动写入剪贴板，请手动复制');
}
