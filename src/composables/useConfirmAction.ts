import { ElMessage, ElMessageBox } from 'element-plus';
import { isGlobalHandledHttpError, resolveErrorMessage } from '@/utils/http';

/**
 * 二次确认受控执行辅助函数（统一处理 ElMessageBox 确认、全局错误防重及成功刷新回调）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export interface ConfirmActionOptions {
  /**
   * 确认弹窗正文
   */
  message: string;
  /**
   * 确认弹窗标题
   */
  title: string;
  /**
   * 确认按钮文案
   */
  confirmButtonText: string;
  /**
   * 执行成功后的提示文案
   */
  successMessage: string;
  /**
   * 非全局拦截异常时的兜底错误文案
   */
  errorFallback: string;
  /**
   * 目标异步写操作
   */
  execute: () => Promise<void>;
  /**
   * 成功后的状态同步回调（如清缓存、刷新表格）
   */
  onSuccess?: () => void | Promise<void>;
}

/**
 * 弹出警告级二次确认弹窗，用户确认后执行受保护写操作并统一收敛异常提示。
 *
 * @param options 确认操作参数配置
 * @returns 用户确认并执行成功返回 `true`，取消或失败返回 `false`
 */
export async function runConfirmedAction(options: ConfirmActionOptions): Promise<boolean> {
  try {
    await ElMessageBox.confirm(options.message, options.title, {
      type: 'warning',
      confirmButtonText: options.confirmButtonText,
      cancelButtonText: '取消',
    });
  } catch {
    return false;
  }

  try {
    await options.execute();
    ElMessage.success(options.successMessage);
    await options.onSuccess?.();
    return true;
  } catch (error) {
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(resolveErrorMessage(error, options.errorFallback));
    }
    return false;
  }
}
