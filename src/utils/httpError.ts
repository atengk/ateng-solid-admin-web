import { BusinessException } from '@atengk/core';

/**
 * HTTP 错误码常量、异常清洗、场景化提示解析与并发请求收敛工具。
 *
 * @author Ateng
 * @since 2026-11-26
 */

export const HTTP_STATUS_UNAUTHORIZED = 401;
export const HTTP_STATUS_FORBIDDEN = 403;
export const HTTP_STATUS_TOO_MANY_REQUESTS = 429;
export const HTTP_STATUS_INTERNAL_ERROR = 500;
export const HTTP_STATUS_BAD_GATEWAY = 502;
export const HTTP_STATUS_SERVICE_UNAVAILABLE = 503;
export const HTTP_STATUS_GATEWAY_TIMEOUT = 504;

export const BIZ_IDEMPOTENT_DUPLICATE = 40003;
export const BIZ_INVALID_TENANT_SWITCH = 100002;
export const BIZ_LOGIN_LOCKED = 101004;
export const BIZ_TENANT_UNAVAILABLE = 101005;

export const SERVER_ERROR_MESSAGE = '系统繁忙，请稍后再试';
export const GATEWAY_ERROR_MESSAGE = '网关或后端服务连接异常，请稍后重试';
export const SERVICE_UNAVAILABLE_MESSAGE = '服务暂不可用，请稍后重试';
export const NETWORK_TIMEOUT_MESSAGE = '网络请求超时或服务连接异常，请稍后重试';

const RAW_TRANSPORT_STATUS_PATTERN =
  /^(?:\d{3}\s+)?(?:Bad Gateway|Gateway Time-?out|Service Temporarily Unavailable|Service Unavailable|Internal Server Error)$/i;

const GLOBAL_HANDLED_ERROR_CODES = new Set<number>([
  HTTP_STATUS_UNAUTHORIZED,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  BIZ_INVALID_TENANT_SWITCH,
  BIZ_TENANT_UNAVAILABLE,
  BIZ_IDEMPOTENT_DUPLICATE,
]);

/**
 * 判断状态码是否属于全局统一托底的 5xx 或连接层异常。
 *
 * @param code HTTP 状态码或业务错误码
 * @returns `500~599` 或 `<= 0`（断网/超时）返回 `true`
 */
export function isServerErrorCode(code: number): boolean {
  return (code >= HTTP_STATUS_INTERNAL_ERROR && code < 600) || code <= 0;
}

/**
 * 判断异常是否为「无效租户切换目标（100002）」业务异常。
 *
 * @param error 捕获到的任意异常对象
 * @returns 错误码为 `100002` 时返回 `true`
 */
export function isInvalidTenantSwitchError(error: unknown): boolean {
  if (error instanceof BusinessException) {
    return error.code === BIZ_INVALID_TENANT_SWITCH;
  }
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: unknown }).code === BIZ_INVALID_TENANT_SWITCH;
  }
  return false;
}

/**
 * 并行等待多个请求全部完成后返回结果列表；若存在失败项，优先抛出非 `100002` 错误以免掩盖 `401` 或服务端故障。
 *
 * @param tasks 并行执行的请求 Promise 元组
 * @returns 与输入顺序一致的已兑现结果元组
 */
export async function awaitAllSettledRequests<const T extends readonly Promise<unknown>[]>(
  tasks: T,
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const results = await Promise.allSettled(tasks);
  const rejected = results.filter(
    (item): item is PromiseRejectedResult => item.status === 'rejected',
  );
  if (rejected.length > 0) {
    const primaryFailure =
      rejected.find(item => !isInvalidTenantSwitchError(item.reason)) ?? rejected[0]!;
    throw primaryFailure.reason;
  }
  return results.map(item => (item as PromiseFulfilledResult<unknown>).value) as {
    [K in keyof T]: Awaited<T[K]>;
  };
}

/**
 * 判断原始异常文案是否属于 Axios/Fetch/网关裸露的英文连接或超时错误。
 *
 * @param raw 原始错误消息文本
 * @returns 属于网络/超时传输错误返回 `true`
 */
export function isNetworkOrTimeoutMessage(raw: string): boolean {
  return (
    raw.startsWith('timeout of ') ||
    raw === 'Network Error' ||
    raw.includes('ERR_NETWORK') ||
    raw.includes('ECONNABORTED') ||
    raw.includes('ECONNREFUSED') ||
    raw.includes('Failed to fetch')
  );
}

/**
 * 判断原始错误消息是否为空白、HTML 错误页或未经翻译的底层传输层/网关报文。
 *
 * @param raw 原始错误消息文本
 * @returns 需要被友好中文提示替换时返回 `true`
 */
export function isRawTransportErrorMessage(raw: string): boolean {
  if (!raw) {
    return true;
  }
  return (
    isNetworkOrTimeoutMessage(raw) ||
    raw.startsWith('Request failed with status code ') ||
    raw.startsWith('HTTP Request Failed') ||
    raw.startsWith('<') ||
    RAW_TRANSPORT_STATUS_PATTERN.test(raw)
  );
}

/**
 * 将 `5xx`/断网类 `BusinessException` 收敛为面向用户的分层中文提示。
 *
 * @param exception 已封装的业务异常实例
 * @returns 清洗传输层英文后的中文友好文案
 */
export function resolveFriendlyServerErrorMessage(exception: BusinessException): string {
  const raw = exception.msg?.trim() ?? '';
  if (!isRawTransportErrorMessage(raw)) {
    return raw;
  }
  if (exception.code <= 0 || isNetworkOrTimeoutMessage(raw)) {
    return NETWORK_TIMEOUT_MESSAGE;
  }
  if (
    exception.code === HTTP_STATUS_BAD_GATEWAY ||
    exception.code === HTTP_STATUS_GATEWAY_TIMEOUT
  ) {
    return GATEWAY_ERROR_MESSAGE;
  }
  if (exception.code === HTTP_STATUS_SERVICE_UNAVAILABLE) {
    return SERVICE_UNAVAILABLE_MESSAGE;
  }
  return SERVER_ERROR_MESSAGE;
}

/**
 * 判断异常是否已由全局 HTTP 拦截器统一弹窗或跳页处理，避免组件局部重复提示。
 *
 * @param error 捕获到的异常对象
 * @returns 已由全局拦截器处理返回 `true`
 */
export function isGlobalHandledHttpError(error: unknown): boolean {
  if (!(error instanceof BusinessException)) {
    return false;
  }
  return GLOBAL_HANDLED_ERROR_CODES.has(error.code) || isServerErrorCode(error.code);
}

/**
 * 从捕获的业务或网络异常中提取可安全展示给用户的诊断提示文案。
 *
 * @param error 捕获到的异常对象
 * @param fallback 未携带具体业务文案时的兜底提示
 * @returns 面向用户的可读提示字符串
 */
export function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof BusinessException) {
    const raw = error.msg?.trim() ?? '';
    if (isRawTransportErrorMessage(raw)) {
      return isServerErrorCode(error.code) ? resolveFriendlyServerErrorMessage(error) : fallback;
    }
    return raw;
  }
  if (error instanceof Error) {
    const raw = error.message?.trim() ?? '';
    if (raw && !isRawTransportErrorMessage(raw)) {
      return raw;
    }
    if (raw) {
      return isNetworkOrTimeoutMessage(raw) ? NETWORK_TIMEOUT_MESSAGE : fallback;
    }
  }
  return fallback;
}

/**
 * 解析面向弹窗/表单内联横幅的场景化错误文案：
 * 对 4xx 业务异常返回精确服务端说明；对已由全局拦截器（5xx/429/403/断网）提示的异常优先呈现当前操作上下文兜底文案，防止重复“系统繁忙”与英文底层异常泄漏。
 *
 * @param error 捕获到的异常对象
 * @param contextualFallback 当前操作场景兜底文案
 * @returns 适合直接渲染在表单内联横幅中的中文文案
 */
export function resolveContextualErrorMessage(error: unknown, contextualFallback: string): string {
  if (isGlobalHandledHttpError(error)) {
    return contextualFallback;
  }
  return resolveErrorMessage(error, contextualFallback);
}

/**
 * 将单个或数组形式的主键集合归一化为逗号分隔 URL 路径段。
 *
 * @param ids 单个主键、逗号串或主键数组
 * @returns 经过 `encodeURIComponent` 编码的逗号分隔路径串；有效 ID 为空时返回空串
 */
export function formatBatchPathIds(ids: string | string[]): string {
  const rawList = Array.isArray(ids) ? ids : ids.split(',');
  return rawList
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => encodeURIComponent(item))
    .join(',');
}
