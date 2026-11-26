import { h } from 'vue';
import { ElMessage } from 'element-plus';
import { DictManager } from '@atengk/element-plus';
import {
  BusinessException,
  checkBlobForJsonError,
  createAuthManager,
  createHttpClient,
  createTenantManager,
  isAbortError,
} from '@atengk/core';
import {
  BIZ_IDEMPOTENT_DUPLICATE,
  BIZ_INVALID_TENANT_SWITCH,
  BIZ_LOGIN_LOCKED,
  BIZ_TENANT_UNAVAILABLE,
  HTTP_STATUS_FORBIDDEN,
  HTTP_STATUS_INTERNAL_ERROR,
  HTTP_STATUS_TOO_MANY_REQUESTS,
  HTTP_STATUS_UNAUTHORIZED,
  SERVER_ERROR_MESSAGE,
  awaitAllSettledRequests,
  formatBatchPathIds,
  isGlobalHandledHttpError,
  isInvalidTenantSwitchError,
  isServerErrorCode,
  resolveContextualErrorMessage,
  resolveErrorMessage,
  resolveFriendlyServerErrorMessage,
} from '@/utils/httpError';

/**
 * 默认平台租户标识
 */
export const DEFAULT_TENANT_ID = '0';

export {
  BIZ_INVALID_TENANT_SWITCH,
  awaitAllSettledRequests,
  formatBatchPathIds,
  isGlobalHandledHttpError,
  isInvalidTenantSwitchError,
  resolveContextualErrorMessage,
  resolveErrorMessage,
};

const SESSION_EXPIRED_MESSAGE = '登录状态已失效，请重新登录';
const TENANT_EXPIRED_MESSAGE = '当前所属租户已停用或已过期，请联系平台管理员';
const INVALID_TENANT_SWITCH_MESSAGE = '目标租户不存在、已停用或已过期，已自动切回平台默认租户';
const RATE_LIMIT_MESSAGE = '操作过于频繁，请稍后再试';
const WARNING_COALESCE_MS = 2_000;

interface AxiosLikeError {
  isAxiosError?: boolean;
  config?: {
    url?: string;
    headers?: Record<string, unknown> | { get?: (key: string) => unknown };
  };
  response?: {
    status?: number;
    headers?: Record<string, string>;
    data?: unknown;
    config?: {
      url?: string;
      headers?: Record<string, unknown> | { get?: (key: string) => unknown };
    };
  };
}

/**
 * 全局异常分发注册回调，用于解耦 http 工具层与 Store / Router 循环依赖。
 */
export interface HttpErrorHandlers {
  onSessionExpired?: (reason: '401' | '101005', message: string) => void | Promise<void>;
  onTenantInvalid?: (message: string) => void | Promise<void>;
}

/**
 * 管理端会话凭据单例（对齐后端 satoken-admin 多账号体系）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
export const adminAuthManager = createAuthManager({
  tokenKey: 'satoken-admin',
  headerName: 'satoken-admin',
});

/**
 * 管理端工作租户单例（对齐后端 X-Tenant-Id，空值初始化为平台租户 "0"）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
export const adminTenantManager = createTenantManager({
  tenantKey: 'solid-tenant-id',
  headerName: 'X-Tenant-Id',
});

if (!adminTenantManager.getTenantId()) {
  adminTenantManager.setTenantId(DEFAULT_TENANT_ID);
}

interface RequestMeta {
  url: string;
  authenticated: boolean;
}

const RESULT_REQUEST_META = new WeakMap<object, RequestMeta>();

let registeredHandlers: HttpErrorHandlers = {};
let isHandlingAuthReset = false;
let authResetReleaseTimer: ReturnType<typeof setTimeout> | undefined;
let lastRateLimitToastAt = -WARNING_COALESCE_MS;
let lastInvalidTenantToastAt = -WARNING_COALESCE_MS;
let lastServerErrorToastAt = -WARNING_COALESCE_MS;

/**
 * 注册会话失效与租户回退的上层协调回调（通常在 main.ts 完成 Store/Router 挂载后调用）。
 *
 * @param handlers 异常分发回调集合
 */
export function registerHttpErrorHandlers(handlers: HttpErrorHandlers): void {
  registeredHandlers = handlers;
}

/**
 * 重置拦截器内部防重入、节流与注册回调状态（专供离线单元测试在用例间重置现场）。
 */
export function resetHttpInterceptorState(): void {
  if (authResetReleaseTimer !== undefined) {
    clearTimeout(authResetReleaseTimer);
    authResetReleaseTimer = undefined;
  }
  registeredHandlers = {};
  isHandlingAuthReset = false;
  lastRateLimitToastAt = -WARNING_COALESCE_MS;
  lastInvalidTenantToastAt = -WARNING_COALESCE_MS;
  lastServerErrorToastAt = -WARNING_COALESCE_MS;
}

function asAxiosLikeError(value: unknown): AxiosLikeError | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  if ('isAxiosError' in value || 'response' in value) {
    return value as AxiosLikeError;
  }
  return undefined;
}

function clearClientSessionState(): void {
  adminAuthManager.clearToken();
  adminTenantManager.setTenantId(DEFAULT_TENANT_ID);
  DictManager.clearCache();
}

function triggerSessionExpired(reason: '401' | '101005', message: string): void {
  if (isHandlingAuthReset) {
    return;
  }
  isHandlingAuthReset = true;
  clearClientSessionState();
  ElMessage.warning(message);

  try {
    void Promise.resolve(registeredHandlers.onSessionExpired?.(reason, message)).catch(() => {
      // 上层跳转异常隔离，避免阻断后续会话状态恢复
    });
  } finally {
    // 延迟至下一宏任务释放防重入锁，保证同一批并发 401/101005 仅触发一次退出流转
    authResetReleaseTimer = globalThis.setTimeout(() => {
      isHandlingAuthReset = false;
      authResetReleaseTimer = undefined;
    }, 0);
  }
}

/**
 * 默认请求超时时长（毫秒）
 */
export const DEFAULT_API_TIMEOUT_MS = 15_000;

/**
 * 解析全局接口超时时长，非法值自动回退至 15_000ms。
 *
 * @param raw 原始环境变量字符串
 * @returns 合法的正整数超时毫秒数
 */
export function resolveApiTimeoutMs(raw?: string): number {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return DEFAULT_API_TIMEOUT_MS;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_API_TIMEOUT_MS;
  }
  return Math.trunc(parsed);
}

/**
 * 管理端唯一 HTTP 客户端单例。
 *
 * @author Ateng
 * @since 2026-11-25
 */
export const adminHttpClient = createHttpClient({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: resolveApiTimeoutMs(import.meta.env.VITE_API_TIMEOUT),
  authManager: adminAuthManager,
  tenantManager: adminTenantManager,
  unwrap: true,
  onUnauthorized: () => {
    triggerSessionExpired('401', SESSION_EXPIRED_MESSAGE);
  },
});

async function resolveBusinessException(error: unknown): Promise<BusinessException> {
  if (!(error instanceof BusinessException)) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const wrapped = new BusinessException(
      HTTP_STATUS_INTERNAL_ERROR,
      rawMessage || SERVER_ERROR_MESSAGE,
      undefined,
      error,
    );
    const friendlyMessage = resolveFriendlyServerErrorMessage(wrapped);
    return friendlyMessage === wrapped.msg
      ? wrapped
      : new BusinessException(wrapped.code, friendlyMessage, wrapped.traceId, wrapped.cause);
  }

  let resolved = error;
  // @atengk/core 对 200+Blob JSON 错误已提前转译；此处兜底处理 HTTP 4xx/5xx 状态下的 Blob JSON 错误体
  const axiosCause = asAxiosLikeError(error.cause);
  const response = axiosCause?.response;
  if (response && typeof Blob !== 'undefined' && response.data instanceof Blob) {
    const contentType = response.headers?.['content-type'] ?? null;
    try {
      await checkBlobForJsonError(response.data, contentType, response.status);
    } catch (translated) {
      if (translated instanceof BusinessException) {
        resolved = translated;
      }
    }
  }

  if (isServerErrorCode(resolved.code)) {
    const friendlyMessage = resolveFriendlyServerErrorMessage(resolved);
    if (friendlyMessage !== resolved.msg) {
      return new BusinessException(resolved.code, friendlyMessage, resolved.traceId, resolved.cause);
    }
  }
  return resolved;
}

function isLoginEndpointUrl(url?: string): boolean {
  return Boolean(url && /\/admin\/auth\/login(?:[/?#]|$)/.test(url));
}

function hasAuthHeader(headers: unknown): boolean {
  if (!headers || typeof headers !== 'object') {
    return false;
  }
  if (typeof (headers as { get?: (key: string) => unknown }).get === 'function') {
    return Boolean((headers as { get: (key: string) => unknown }).get('satoken-admin'));
  }
  return Object.entries(headers as Record<string, unknown>).some(
    ([key, val]) => key.toLowerCase() === 'satoken-admin' && Boolean(val),
  );
}

function wasAuthenticatedRequest(exception: BusinessException): boolean {
  if (exception.cause && typeof exception.cause === 'object') {
    const meta = RESULT_REQUEST_META.get(exception.cause);
    if (meta) {
      return meta.authenticated;
    }
  }
  const axiosCause = asAxiosLikeError(exception.cause);
  const config = axiosCause?.config ?? axiosCause?.response?.config;
  const url = config?.url ?? '';
  // 登录提交入口属于未认证阶段（即使本地存在残留旧令牌也应按表单错误透传，禁误判登出）
  if (isLoginEndpointUrl(url)) {
    return false;
  }
  if (hasAuthHeader(config?.headers)) {
    return true;
  }
  return Boolean(adminAuthManager.getToken());
}

adminHttpClient.instance.interceptors.request.use(config => {
  const url = config.url ?? '';
  const authenticated =
    !isLoginEndpointUrl(url) &&
    (hasAuthHeader(config.headers) || Boolean(adminAuthManager.getToken()));
  const baseSource =
    config.transformResponse ?? adminHttpClient.instance.defaults.transformResponse;
  const baseTransformers = Array.isArray(baseSource) ? baseSource : baseSource ? [baseSource] : [];
  config.transformResponse = [
    ...baseTransformers,
    (data: unknown) => {
      if (data && typeof data === 'object') {
        RESULT_REQUEST_META.set(data, { url, authenticated });
      }
      return data;
    },
  ];
  return config;
});

function emitCoalescedToast(lastAt: number, emit: () => void): number {
  const now = Date.now();
  if (now - lastAt < WARNING_COALESCE_MS) {
    return lastAt;
  }
  emit();
  return now;
}

function notifyRateLimited(): void {
  lastRateLimitToastAt = emitCoalescedToast(lastRateLimitToastAt, () => {
    ElMessage.warning(RATE_LIMIT_MESSAGE);
  });
}

function copyTraceId(traceId: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(traceId).catch(() => {
      // 忽略剪贴板权限拒绝
    });
  }
}

function notifyServerError(exception: BusinessException): void {
  lastServerErrorToastAt = emitCoalescedToast(lastServerErrorToastAt, () => {
    const friendlyMessage = resolveFriendlyServerErrorMessage(exception);
    const traceId = exception.traceId?.trim();
    if (!traceId) {
      ElMessage.error(friendlyMessage);
      return;
    }

    ElMessage.error({
      showClose: true,
      duration: 5_000,
      message: h('span', { class: 'inline-flex items-center gap-2' }, [
        h('span', `${friendlyMessage}（TraceId: ${traceId}）`),
        h(
          'button',
          {
            type: 'button',
            class: 'cursor-pointer underline text-xs font-medium',
            onClick: () => copyTraceId(traceId),
          },
          '复制 TraceId',
        ),
      ]),
    });
  });
}

function handleInvalidTenantSwitch(exception: BusinessException): void {
  // 平台超管切换目标租户失效：仅回退至平台租户 "0"，绝不注销超管自身会话
  adminTenantManager.setTenantId(DEFAULT_TENANT_ID);
  DictManager.clearCache();
  const message = exception.msg || INVALID_TENANT_SWITCH_MESSAGE;
  lastInvalidTenantToastAt = emitCoalescedToast(lastInvalidTenantToastAt, () => {
    ElMessage.warning(message);
  });
  void Promise.resolve(registeredHandlers.onTenantInvalid?.(message)).catch(() => {
    // 隔离上层刷新回调异常
  });
}

const ERROR_DISPATCH_TABLE: Record<number, (exception: BusinessException) => void> = {
  [HTTP_STATUS_UNAUTHORIZED]: () => triggerSessionExpired('401', SESSION_EXPIRED_MESSAGE),
  [BIZ_TENANT_UNAVAILABLE]: exception => {
    if (wasAuthenticatedRequest(exception)) {
      triggerSessionExpired('101005', exception.msg || TENANT_EXPIRED_MESSAGE);
    }
  },
  [BIZ_INVALID_TENANT_SWITCH]: handleInvalidTenantSwitch,
  [BIZ_LOGIN_LOCKED]: () => {
    // 防爆破锁定由登录页从 BusinessException.cause 读取结构化倒计时载荷，跳过全局弹窗
  },
  [HTTP_STATUS_FORBIDDEN]: exception => {
    ElMessage.warning(exception.msg || '暂无操作权限');
  },
  [HTTP_STATUS_TOO_MANY_REQUESTS]: () => notifyRateLimited(),
  [BIZ_IDEMPOTENT_DUPLICATE]: () => notifyRateLimited(),
};

adminHttpClient.instance.interceptors.response.use(
  response => response,
  async (error: unknown) => {
    if (isAbortError(error)) {
      return Promise.reject(error);
    }

    const exception = await resolveBusinessException(error);
    const handler = ERROR_DISPATCH_TABLE[exception.code];
    if (handler) {
      handler(exception);
    } else if (isServerErrorCode(exception.code)) {
      notifyServerError(exception);
    }

    return Promise.reject(exception);
  },
);
