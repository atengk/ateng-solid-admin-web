import type { VNode } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElMessage } from 'element-plus';
import { DictManager } from '@atengk/element-plus';
import { BusinessException, type HttpRequestConfig, type Result } from '@atengk/core';
import {
  DEFAULT_API_TIMEOUT_MS,
  adminAuthManager,
  adminHttpClient,
  adminTenantManager,
  isGlobalHandledHttpError,
  registerHttpErrorHandlers,
  resetHttpInterceptorState,
  resetSessionExpiredCooldown,
  resolveApiTimeoutMs,
  resolveContextualErrorMessage,
  resolveErrorMessage,
} from '@/utils/http';

/**
 * HTTP 客户端与全局错误分流器单元测试。
 *
 * @author Ateng
 * @since 2026-11-25
 */

type CustomAdapter = Extract<NonNullable<HttpRequestConfig['adapter']>, (config: never) => unknown>;
type AdapterConfig = Parameters<CustomAdapter>[0];
type AdapterResponse = Awaited<ReturnType<CustomAdapter>>;

function buildAxiosError(config: AdapterConfig, response: AdapterResponse): Error {
  return Object.assign(new Error(`Request failed with status code ${response.status}`), {
    isAxiosError: true,
    config,
    response,
  });
}

function mockJsonResultAdapter(
  status: number,
  body: Partial<Result<unknown>>,
  headers: Record<string, string> = {},
): CustomAdapter {
  return async (config: AdapterConfig): Promise<AdapterResponse> => {
    const response: AdapterResponse = {
      data: {
        code: body.code ?? status,
        msg: body.msg ?? '',
        data: body.data ?? null,
        traceId: body.traceId,
      },
      status,
      statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      config,
    };
    if (status >= 200 && status < 300) {
      return response;
    }
    throw buildAxiosError(config, response);
  };
}

function mockJsonBlobAdapter(status: number, body: Partial<Result<unknown>>): CustomAdapter {
  return async (config: AdapterConfig): Promise<AdapterResponse> => {
    const response: AdapterResponse = {
      data: new Blob([JSON.stringify(body)], { type: 'application/json' }),
      status,
      statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      config,
    };
    if (status >= 200 && status < 300) {
      return response;
    }
    throw buildAxiosError(config, response);
  };
}

function spyElMessage() {
  return {
    warnSpy: vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: vi.fn() })),
    errSpy: vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close: vi.fn() })),
  };
}

describe('http client & global error dispatcher', () => {
  beforeEach(() => {
    adminTenantManager.setTenantId('0');
    registerHttpErrorHandlers({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('injects satoken-admin and X-Tenant-Id headers from isolated managers', async () => {
    adminAuthManager.setToken('token-abc');
    adminTenantManager.setTenantId('10086');
    let capturedHeaders: Record<string, unknown> = {};

    const result = await adminHttpClient.get<{ ok: boolean }>('/admin/auth/info', {
      adapter: async (config: AdapterConfig) => {
        capturedHeaders = { ...(config.headers as Record<string, unknown>) };
        return mockJsonResultAdapter(200, { code: 200, msg: 'ok', data: { ok: true } })(config);
      },
    });

    expect(result).toEqual({ ok: true });
    expect(capturedHeaders['satoken-admin']).toBe('token-abc');
    expect(capturedHeaders['X-Tenant-Id']).toBe('10086');
  });

  it('ignores abort errors silently without prompting or resetting session', async () => {
    const { warnSpy, errSpy } = spyElMessage();
    const onSessionExpired = vi.fn();
    registerHttpErrorHandlers({ onSessionExpired });

    await expect(
      adminHttpClient.get('/admin/system/user/page', {
        adapter: async () => {
          throw Object.assign(new Error('canceled'), {
            name: 'CanceledError',
            code: 'ERR_CANCELED',
          });
        },
      }),
    ).rejects.toThrow();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('coalesces concurrent 401 responses via re-entrancy lock to trigger logout once', async () => {
    adminAuthManager.setToken('expired-token');
    adminTenantManager.setTenantId('2001');
    const clearCacheSpy = vi.spyOn(DictManager, 'clearCache');
    const { warnSpy } = spyElMessage();
    const onSessionExpired = vi.fn();
    registerHttpErrorHandlers({ onSessionExpired });

    const adapter = mockJsonResultAdapter(401, { code: 401, msg: '未登录' });
    const [r1, r2] = await Promise.allSettled([
      adminHttpClient.get('/admin/auth/info', { adapter }),
      adminHttpClient.get('/admin/auth/routes', { adapter }),
    ]);

    expect(r1.status).toBe('rejected');
    expect(r2.status).toBe('rejected');
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(adminAuthManager.getToken()).toBeNull();
    expect(adminTenantManager.getTenantId()).toBe('0');
    expect(clearCacheSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('treats 101005 as session termination only on authenticated non-login requests', async () => {
    const { warnSpy } = spyElMessage();
    const onSessionExpired = vi.fn();
    registerHttpErrorHandlers({ onSessionExpired });

    // 1. 登录接口即使存在残留旧令牌也应按表单错误透传，不得误触登出清理
    adminAuthManager.setToken('stale-token');
    await expect(
      adminHttpClient.post('/admin/auth/login', undefined, {
        adapter: mockJsonResultAdapter(200, { code: 101005, msg: '租户已停用' }),
      }),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(adminAuthManager.getToken()).toBe('stale-token');

    // 2. 已认证非登录业务请求：触发会话清理与重新登录回调
    adminAuthManager.setToken('active-token');
    adminTenantManager.setTenantId('3001');
    await expect(
      adminHttpClient.get('/admin/system/user/page', {
        adapter: mockJsonResultAdapter(200, { code: 101005, msg: '当前所属租户已过期' }),
      }),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledWith('101005', '当前所属租户已过期');
    expect(adminAuthManager.getToken()).toBeNull();
    expect(adminTenantManager.getTenantId()).toBe('0');
    expect(warnSpy).toHaveBeenCalledWith('当前所属租户已过期');
  });

  it('handles 100002 by resetting active tenant to 0 without logging out super admin', async () => {
    vi.useFakeTimers();
    try {
      adminAuthManager.setToken('super-admin-token');
      adminTenantManager.setTenantId('9999');
      const clearCacheSpy = vi.spyOn(DictManager, 'clearCache');
      const { warnSpy } = spyElMessage();
      const onSessionExpired = vi.fn();
      const onTenantInvalid = vi.fn();
      registerHttpErrorHandlers({ onSessionExpired, onTenantInvalid });

      await expect(
        adminHttpClient.get('/admin/auth/routes', {
          adapter: mockJsonResultAdapter(200, { code: 100002, msg: '目标租户不存在' }),
        }),
      ).rejects.toBeInstanceOf(BusinessException);

      expect(adminAuthManager.getToken()).toBe('super-admin-token');
      expect(onSessionExpired).not.toHaveBeenCalled();
      expect(adminTenantManager.getTenantId()).toBe('0');
      expect(clearCacheSpy).toHaveBeenCalled();
      expect(onTenantInvalid).toHaveBeenCalledWith('目标租户不存在');
      expect(warnSpy).toHaveBeenCalledWith('目标租户不存在');

      // 并发 100002 在 2s 节流窗口内仅提示一次警告弹窗
      await expect(
        adminHttpClient.get('/admin/auth/info', {
          adapter: mockJsonResultAdapter(200, { code: 100002, msg: '目标租户不存在' }),
        }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // 超过 2s 节流窗口后，新的 100002 告警恢复正常弹出
      vi.advanceTimersByTime(2100);
      await expect(
        adminHttpClient.get('/admin/auth/info', {
          adapter: mockJsonResultAdapter(200, { code: 100002, msg: '目标租户不存在' }),
        }),
      ).rejects.toBeInstanceOf(BusinessException);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes 101004 lock payload silently without global toast messages', async () => {
    const { warnSpy, errSpy } = spyElMessage();

    let caught: unknown;
    try {
      await adminHttpClient.post('/admin/auth/login', undefined, {
        adapter: mockJsonResultAdapter(200, {
          code: 101004,
          msg: '账号已锁定',
          data: { lockType: 'ACCOUNT', remainSeconds: 885 },
        }),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BusinessException);
    const biz = caught as BusinessException;
    expect(biz.code).toBe(101004);
    expect((biz.cause as Result<{ lockType: string; remainSeconds: number }>)?.data).toEqual({
      lockType: 'ACCOUNT',
      remainSeconds: 885,
    });
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('shows warning on 403 and coalesces 429/40003 warnings within a 2s window', async () => {
    vi.useFakeTimers();
    const { warnSpy } = spyElMessage();

    await expect(
      adminHttpClient.get('/admin/system/user/1', {
        adapter: mockJsonResultAdapter(403, { code: 403, msg: '无权访问该资源' }),
      }),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(warnSpy).toHaveBeenCalledWith('无权访问该资源');
    warnSpy.mockClear();

    await expect(
      adminHttpClient.post('/admin/system/user', undefined, {
        adapter: mockJsonResultAdapter(429, { code: 429, msg: '请求过快' }),
      }),
    ).rejects.toBeInstanceOf(BusinessException);
    await expect(
      adminHttpClient.post('/admin/system/user', undefined, {
        adapter: mockJsonResultAdapter(200, { code: 40003, msg: '请勿重复提交' }),
      }),
    ).rejects.toBeInstanceOf(BusinessException);

    expect(warnSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2100);
    await expect(
      adminHttpClient.post('/admin/system/user', undefined, {
        adapter: mockJsonResultAdapter(200, { code: 40003, msg: '请勿重复提交' }),
      }),
    ).rejects.toBeInstanceOf(BusinessException);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('displays friendly copy on 503/timeout and copies traceId via message action button', async () => {
    const { errSpy } = spyElMessage();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText: writeTextMock } });

    await expect(
      adminHttpClient.get('/admin/system/config/page', {
        adapter: async (config: AdapterConfig) => {
          throw Object.assign(new Error('timeout of 15000ms exceeded'), {
            isAxiosError: true,
            config,
            response: {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'x-trace-id': 'trace-gw-503-8f2c' },
              data: null,
              config,
            },
          });
        },
      }),
    ).rejects.toBeInstanceOf(BusinessException);

    expect(errSpy).toHaveBeenCalledTimes(1);
    const toastArg = errSpy.mock.calls[0]?.[0] as { message?: VNode } | undefined;
    const messageVNode = toastArg?.message;
    const children = Array.isArray(messageVNode?.children)
      ? (messageVNode.children as VNode[])
      : [];
    const textNode = children[0];
    const copyButtonNode = children[1];

    expect(String(textNode?.children)).toContain('网络请求超时或服务连接异常');
    expect(String(textNode?.children)).not.toContain('15000ms');
    expect(String(textNode?.children)).toContain('trace-gw-503-8f2c');

    const onClick = copyButtonNode?.props?.onClick as (() => void) | undefined;
    expect(onClick).toBeTypeOf('function');
    onClick?.();
    expect(writeTextMock).toHaveBeenCalledWith('trace-gw-503-8f2c');
  });

  it('translates JSON error blobs into BusinessException on both 200 and 4xx/5xx blob responses', async () => {
    const { warnSpy, errSpy } = spyElMessage();

    let err200: unknown;
    try {
      await adminHttpClient.get('/admin/system/user/export', {
        responseType: 'blob',
        adapter: mockJsonBlobAdapter(200, { code: 403, msg: '无导出权限', traceId: 't-blob-1' }),
      });
    } catch (error) {
      err200 = error;
    }
    expect(err200).toBeInstanceOf(BusinessException);
    expect((err200 as BusinessException).code).toBe(403);
    expect((err200 as BusinessException).msg).toBe('无导出权限');
    expect(warnSpy).toHaveBeenCalledWith('无导出权限');

    let err500: unknown;
    try {
      await adminHttpClient.get('/admin/system/user/export', {
        responseType: 'blob',
        adapter: mockJsonBlobAdapter(500, {
          code: 500,
          msg: '导出生成失败',
          traceId: 't-blob-500',
        }),
      });
    } catch (error) {
      err500 = error;
    }
    expect(err500).toBeInstanceOf(BusinessException);
    expect((err500 as BusinessException).code).toBe(500);
    expect((err500 as BusinessException).msg).toBe('导出生成失败');
    expect((err500 as BusinessException).traceId).toBe('t-blob-500');
    expect(errSpy).toHaveBeenCalledTimes(1);
  });

  it('passes 102002/102005 domain errors silently so form dialogs and actions handle them inline', async () => {
    const { warnSpy, errSpy } = spyElMessage();

    await expect(
      adminHttpClient.delete('/admin/system/dept/1', {
        adapter: mockJsonResultAdapter(200, { code: 102005, msg: '存在下级部门，禁止删除' }),
      }),
    ).rejects.toBeInstanceOf(BusinessException);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errSpy).not.toHaveBeenCalled();
    expect(isGlobalHandledHttpError(new BusinessException(102002, '重复'))).toBe(false);
    expect(isGlobalHandledHttpError(new BusinessException(102005, '占用'))).toBe(false);
    expect(isGlobalHandledHttpError(new BusinessException(503, '网关异常'))).toBe(true);
    expect(isGlobalHandledHttpError(new BusinessException(403, '无权限'))).toBe(true);
  });

  it('parses VITE_API_TIMEOUT with safe positive-integer fallback to 15_000ms', () => {
    expect(resolveApiTimeoutMs(undefined)).toBe(DEFAULT_API_TIMEOUT_MS);
    expect(resolveApiTimeoutMs('')).toBe(DEFAULT_API_TIMEOUT_MS);
    expect(resolveApiTimeoutMs('   ')).toBe(DEFAULT_API_TIMEOUT_MS);
    expect(resolveApiTimeoutMs('invalid')).toBe(DEFAULT_API_TIMEOUT_MS);
    expect(resolveApiTimeoutMs('0')).toBe(DEFAULT_API_TIMEOUT_MS);
    expect(resolveApiTimeoutMs('-500')).toBe(DEFAULT_API_TIMEOUT_MS);
    expect(resolveApiTimeoutMs('30000')).toBe(30_000);
    expect(resolveApiTimeoutMs(' 20000.8 ')).toBe(20_000);
  });

  it('distinguishes 500/502/503/504, coalesces burst 5xx toasts within 2s, and strips raw English transport errors', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T12:00:00Z'));
    resetHttpInterceptorState();
    const { errSpy } = spyElMessage();

    let caught502: unknown;
    try {
      await adminHttpClient.get('/admin/system/tenant/1', {
        adapter: async (config: AdapterConfig) => {
          throw buildAxiosError(config, {
            data: '<html><body>502 Bad Gateway</body></html>',
            status: 502,
            statusText: 'Bad Gateway',
            headers: { 'content-type': 'text/html' },
            config,
          });
        },
      });
    } catch (error) {
      caught502 = error;
    }

    expect(caught502).toBeInstanceOf(BusinessException);
    expect((caught502 as BusinessException).msg).toBe('网关或后端服务连接异常，请稍后重试');
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenLastCalledWith('网关或后端服务连接异常，请稍后重试');
    expect(resolveContextualErrorMessage(caught502, '加载租户信息失败，请关闭重试')).toBe(
      '加载租户信息失败，请关闭重试',
    );

    // 2 秒防抖合并窗口内再次触发 500 不重复弹出全屏 toast
    await expect(
      adminHttpClient.get('/admin/system/config/page', {
        adapter: async (config: AdapterConfig) => {
          throw buildAxiosError(config, {
            data: null,
            status: 500,
            statusText: 'Internal Server Error',
            headers: {},
            config,
          });
        },
      }),
    ).rejects.toMatchObject({ msg: '系统繁忙，请稍后再试' });
    expect(errSpy).toHaveBeenCalledTimes(1);

    // 越过 2 秒窗口后恢复展示新一次 5xx 错误（且 500 统一对齐“请稍后再试”）
    vi.advanceTimersByTime(2_100);
    await expect(
      adminHttpClient.get('/admin/system/user/page', {
        adapter: async (config: AdapterConfig) => {
          throw buildAxiosError(config, {
            data: null,
            status: 500,
            statusText: 'Internal Server Error',
            headers: {},
            config,
          });
        },
      }),
    ).rejects.toMatchObject({ msg: '系统繁忙，请稍后再试' });
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(errSpy).toHaveBeenLastCalledWith('系统繁忙，请稍后再试');

    // 域内 4xx/102002 报错保留真实服务端说明，而裸英文 Error 不透传给用户
    expect(
      resolveContextualErrorMessage(new BusinessException(102002, '参数键名已存在'), '保存失败'),
    ).toBe('参数键名已存在');
    expect(
      resolveErrorMessage(new Error('Request failed with status code 502'), '操作失败，请重试'),
    ).toBe('操作失败，请重试');
    expect(
      resolveErrorMessage(new BusinessException(502, '502 Bad Gateway'), '操作失败，请重试'),
    ).toBe('网关或后端服务连接异常，请稍后重试');
    expect(resolveErrorMessage(new Error('Network Error'), '操作失败，请重试')).toBe(
      '网络请求超时或服务连接异常，请稍后重试',
    );
  });

  it('aborts in-flight requests, holds lock across async session teardown & cooldown, and resets via resetSessionExpiredCooldown', async () => {
    vi.useFakeTimers();
    const unauthListener = vi.fn();
    const unsubscribe = adminAuthManager.onUnauthorized(unauthListener);
    try {
      const cancelAllSpy = vi.spyOn(adminHttpClient.abortCoordinator, 'cancelAll');
      const handleUnauthSpy = vi.spyOn(adminAuthManager, 'handleUnauthorized');
      const { warnSpy } = spyElMessage();

      let releaseLogout!: () => void;
      const logoutGate = new Promise<void>(resolve => {
        releaseLogout = resolve;
      });
      const onSessionExpired = vi.fn().mockReturnValue(logoutGate);
      registerHttpErrorHandlers({ onSessionExpired });

      adminAuthManager.setToken('tok-expired');
      adminTenantManager.setTenantId('10002');

      await expect(
        adminHttpClient.get('/admin/auth/info', {
          adapter: mockJsonResultAdapter(401, { code: 401, msg: '未登录' }),
        }),
      ).rejects.toBeInstanceOf(BusinessException);

      expect(cancelAllSpy).toHaveBeenCalledWith('SESSION_EXPIRED');
      expect(handleUnauthSpy).toHaveBeenCalled();
      expect(unauthListener).toHaveBeenCalled();
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(adminAuthManager.getToken()).toBeNull();
      expect(adminTenantManager.getTenantId()).toBe('0');

      // 跨越宏任务边界但异步 logout 尚未完成时，后续晚到 401 不得重入强退或二次弹窗
      await vi.advanceTimersByTimeAsync(10);
      await expect(
        adminHttpClient.get('/admin/system/user/page', {
          adapter: mockJsonResultAdapter(401, { code: 401, msg: '未登录' }),
        }),
      ).rejects.toBeInstanceOf(BusinessException);

      expect(onSessionExpired).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // logout 完成后处于 2 秒冷却窗口内时仍合并去重
      releaseLogout();
      await vi.advanceTimersByTimeAsync(500);
      await expect(
        adminHttpClient.get('/admin/system/dept/list', {
          adapter: mockJsonResultAdapter(401, { code: 401, msg: '未登录' }),
        }),
      ).rejects.toBeInstanceOf(BusinessException);

      expect(onSessionExpired).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // 重新登录清空冷却态后，新会话遇到 401 可正常触发强退
      resetSessionExpiredCooldown();
      adminAuthManager.setToken('tok-relogin');
      await expect(
        adminHttpClient.get('/admin/auth/info', {
          adapter: mockJsonResultAdapter(401, { code: 401, msg: '未登录' }),
        }),
      ).rejects.toBeInstanceOf(BusinessException);

      expect(onSessionExpired).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
      vi.useRealTimers();
    }
  });

  it('cancels in-flight requests and invokes handleUnauthorized synchronously on 101005 session termination', async () => {
    const unauthListener = vi.fn();
    const unsubscribe = adminAuthManager.onUnauthorized(unauthListener);
    try {
      const cancelAllSpy = vi.spyOn(adminHttpClient.abortCoordinator, 'cancelAll');
      const handleUnauthSpy = vi.spyOn(adminAuthManager, 'handleUnauthorized');
      const { warnSpy } = spyElMessage();
      const onSessionExpired = vi.fn();
      registerHttpErrorHandlers({ onSessionExpired });

      adminAuthManager.setToken('active-token');
      adminTenantManager.setTenantId('3001');
      await expect(
        adminHttpClient.get('/admin/system/user/page', {
          adapter: mockJsonResultAdapter(200, { code: 101005, msg: '当前所属租户已过期' }),
        }),
      ).rejects.toBeInstanceOf(BusinessException);

      expect(cancelAllSpy).toHaveBeenCalledWith('SESSION_EXPIRED');
      expect(handleUnauthSpy).toHaveBeenCalledTimes(1);
      expect(unauthListener).toHaveBeenCalledTimes(1);
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith('当前所属租户已过期');
    } finally {
      unsubscribe();
    }
  });
});
