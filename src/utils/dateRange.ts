import { computed, type WritableComputedRef } from 'vue';

/**
 * 分页查询起止时间区间双向绑定与快捷预设工具（供用户管理与审计日志视图共享）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 含起止边界字段的标准查询参数形状。
 */
export interface DateRangeQueryShape {
  beginTime?: string;
  endTime?: string;
}

export type DateRangePickerValue = string | number | Date;

export const DEFAULT_RANGE_PICKER_TIME: [Date, Date] = [
  new Date(2000, 0, 1, 0, 0, 0),
  new Date(2000, 0, 1, 23, 59, 59),
];

/**
 * 构造适用于 `AtengDateRange` 与 `usePagination().query`（`beginTime`/`endTime`）的双向区间绑定。
 * 清空时将 `null`/`undefined` 归一化为 `undefined`，防止空值残留查询串。
 *
 * @param query 分页查询状态对象
 * @returns 可写计算属性，用于 `v-model` 绑定时间区间选择器
 */
export function createDateTimeRangeBinding<T extends DateRangeQueryShape>(
  query: T,
): WritableComputedRef<[DateRangePickerValue, DateRangePickerValue] | null> {
  return computed<[DateRangePickerValue, DateRangePickerValue] | null>({
    get: (): [DateRangePickerValue, DateRangePickerValue] | null =>
      query.beginTime && query.endTime ? [query.beginTime, query.endTime] : null,
    set: (value: [DateRangePickerValue, DateRangePickerValue] | null | undefined) => {
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
export function resetQueryDateRange(query: DateRangeQueryShape): void {
  query.beginTime = undefined;
  query.endTime = undefined;
}

/**
 * 构造常用日期时间范围检索快捷选项（今天、最近 7 天、最近 30 天）。
 *
 * @returns 适配 Element Plus `datetimerange` 的快捷选项列表
 */
export function buildDateTimeShortcuts(): Array<{
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
