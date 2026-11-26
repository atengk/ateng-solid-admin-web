import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue';
import {
  ATENG_PRO_LAYOUT_KEY,
  type QueryFormResponsiveCols,
  type TableAutoHeightMode,
} from '@atengk/element-plus';
import { MOBILE_BREAKPOINT_PX } from '@/layouts/layoutHelper';

/**
 * 列表页检索列数预设与表格弹性封顶高度组合式状态（对齐 ADR-0005）。
 *
 * @author Ateng
 * @since 2026-11-26
 */

/**
 * 两项精简检索表单响应式列数（768px+ 单行排开两项输入与操作区）。
 */
export const QUERY_COLS_TWO_ITEMS: QueryFormResponsiveCols = {
  xs: 1,
  sm: 3,
  md: 3,
  lg: 4,
  xl: 4,
};

/**
 * 三项精简检索表单响应式列数（992px+ 单行排开三项输入与操作区）。
 */
export const QUERY_COLS_THREE_ITEMS: QueryFormResponsiveCols = {
  xs: 1,
  sm: 2,
  md: 4,
  lg: 4,
  xl: 4,
};

/**
 * 表格弹性封顶距视口底部预留像素（对齐 AdminLayout `<main class="p-4">` 的 16px 下边距）。
 */
export const TABLE_AUTO_HEIGHT_OFFSET = 16;

/**
 * 列表表格默认视口自适应高度模式（`max-height` 弹性封顶）。
 */
export const TABLE_AUTO_HEIGHT_MODE: TableAutoHeightMode = 'max';

/**
 * 列表视口布局控制选项。
 */
export interface UseListTableLayoutOptions {
  /**
   * 触发单列/垂直堆叠并关闭表内封顶滚动的视口宽度阈值（px），默认 768。
   */
  stackedBreakpoint?: number;
  /**
   * 外部受控堆叠态标识（供双栏子面板复用父级分栏阈值）。
   */
  stacked?: MaybeRefOrGetter<boolean>;
}

/**
 * 列表视口布局状态返回值。
 */
export interface UseListTableLayoutResult {
  /**
   * 当前是否处于移动端或垂直堆叠布局态。
   */
  isStacked: ComputedRef<boolean>;
  /**
   * 传给 AtengTable `:auto-height` 的动态值；堆叠态返回 `false` 退回整页自然滚动。
   */
  tableAutoHeight: ComputedRef<number | false>;
  /**
   * 传给 AtengTable `:auto-height-mode` 的固定契约模式（`'max'`）。
   */
  tableAutoHeightMode: TableAutoHeightMode;
}

/**
 * 为列表页提供一致的响应式堆叠判定与 AtengTable 弹性封顶高度控制。
 *
 * @param options 堆叠断点与受控状态配置
 * @returns 响应式堆叠态、`:auto-height` 与 `:auto-height-mode` 绑定值
 */
export function useListTableLayout(
  options: UseListTableLayoutOptions = {},
): UseListTableLayoutResult {
  const breakpoint = options.stackedBreakpoint ?? MOBILE_BREAKPOINT_PX;
  const layoutContext = inject(ATENG_PRO_LAYOUT_KEY, null);
  const viewportWidth = ref<number>(typeof window !== 'undefined' ? window.innerWidth : 1440);

  function syncViewportWidth(): void {
    if (typeof window !== 'undefined') {
      viewportWidth.value = window.innerWidth;
    }
  }

  onMounted(() => {
    syncViewportWidth();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', syncViewportWidth);
    }
  });

  onBeforeUnmount(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', syncViewportWidth);
    }
  });

  const isStacked = computed<boolean>(() =>
    Boolean(
      layoutContext?.isMobile?.value ||
        toValue(options.stacked) ||
        viewportWidth.value < breakpoint,
    ),
  );

  const tableAutoHeight = computed<number | false>(() =>
    isStacked.value ? false : TABLE_AUTO_HEIGHT_OFFSET,
  );

  return {
    isStacked,
    tableAutoHeight,
    tableAutoHeightMode: TABLE_AUTO_HEIGHT_MODE,
  };
}
