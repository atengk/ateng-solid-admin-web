import { ElMessage } from 'element-plus';
import {
  buildDateTimeShortcuts,
  createDateTimeRangeBinding,
  DEFAULT_RANGE_PICKER_TIME,
  resetQueryDateRange,
  type DateRangePickerValue,
  type DateRangeQueryShape,
} from '@/utils/dateRange';

/**
 * 审计日志共享纯逻辑工具（JSON 美化缩进、时间区间快捷选择、双向区间绑定与安全剪贴板复制）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export type { DateRangeQueryShape };
export type AuditDateRangeValue = DateRangePickerValue;

export const DEFAULT_AUDIT_PICKER_TIME = DEFAULT_RANGE_PICKER_TIME;
export const createTimeRangeBinding = createDateTimeRangeBinding;
export const resetAuditDateRange = resetQueryDateRange;
export const buildAuditTimeShortcuts = buildDateTimeShortcuts;

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
