import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import {
  isGlobalHandledHttpError,
  resolveContextualErrorMessage,
} from '@/utils/http';

/**
 * 异步详情弹窗状态与并发竞态序号守卫（供编辑/新增表单弹窗复用）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export interface DialogRunOptions<T> {
  /**
   * 异步拉取详情请求
   */
  loader: () => Promise<T>;
  /**
   * 回填表单逻辑
   */
  onLoaded: (data: T) => void;
  /**
   * 拉取失败兜底提示文案
   */
  errorFallback: string;
}

/**
 * 管理异步详情弹窗的加载状态、失败阻断标记、内联错误提示及最新请求序号防串行覆盖。
 *
 * @returns 弹窗详情加载状态与受控执行器
 */
export function useDetailDialogState() {
  const detailLoading = ref<boolean>(false);
  const detailLoadFailed = ref<boolean>(false);
  const detailReady = ref<boolean>(true);
  const submitError = ref<string>('');
  let loadSeq = 0;

  function resetDialogState(): void {
    loadSeq += 1;
    detailLoading.value = false;
    detailLoadFailed.value = false;
    detailReady.value = true;
    submitError.value = '';
  }

  function recordSubmitError(error: unknown, fallback: string): void {
    const message = resolveContextualErrorMessage(error, fallback);
    submitError.value = message;
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(message);
    }
  }

  async function runDetailLoad<T>(options: DialogRunOptions<T>): Promise<void> {
    const currentSeq = ++loadSeq;
    detailLoading.value = true;
    detailLoadFailed.value = false;
    detailReady.value = false;
    submitError.value = '';

    try {
      const data = await options.loader();
      if (currentSeq !== loadSeq) {
        return;
      }
      options.onLoaded(data);
      detailReady.value = true;
    } catch (error) {
      if (currentSeq !== loadSeq) {
        return;
      }
      detailLoadFailed.value = true;
      detailReady.value = false;
      recordSubmitError(error, options.errorFallback);
    } finally {
      if (currentSeq === loadSeq) {
        detailLoading.value = false;
      }
    }
  }

  return {
    detailLoading,
    detailLoadFailed,
    detailReady,
    submitError,
    resetDialogState,
    recordSubmitError,
    runDetailLoad,
  };
}
