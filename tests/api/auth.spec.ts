import { describe, expect, it } from 'vitest';
import type { HttpRequestConfig, Result } from '@atengk/core';
import { adminHttpClient } from '@/utils/http';
import {
  getAuthInfo,
  getAuthRoutes,
  getCaptcha,
  getOnlineSessionPage,
  getPersonalProfile,
  kickoutOnlineSession,
  login,
  logout,
  updatePassword,
  updatePersonalProfile,
  uploadProfileAvatar,
} from '@/api/auth';
import { getTenantOptions } from '@/api/system/tenant';

/**
 * 认证中心 11 端点与租户下拉选项 API 契约单元测试（校验 URL、HTTP 方法、请求载荷与空集合兜底）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

type CustomAdapter = Extract<NonNullable<HttpRequestConfig['adapter']>, (config: never) => unknown>;
type AdapterConfig = Parameters<CustomAdapter>[0];

interface CapturedCall {
  method?: string;
  url?: string;
  params?: unknown;
  data?: unknown;
}

function captureAdapter<T>(data: T, out: CapturedCall[]): CustomAdapter {
  return async (config: AdapterConfig) => {
    out.push({
      method: config.method?.toUpperCase(),
      url: config.url,
      params: config.params,
      data: config.data,
    });
    const body: Result<T> = { code: 200, msg: 'ok', data };
    return {
      data: body,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      config,
    };
  };
}

describe('auth & tenant options API contracts', () => {
  it('invokes all 11 /admin/auth/** endpoints and /admin/system/tenant/options with null-safe fallbacks', async () => {
    const calls: CapturedCall[] = [];
    const origAdapter = adminHttpClient.instance.defaults.adapter;

    try {
      // 1. /captcha
      adminHttpClient.instance.defaults.adapter = captureAdapter(
        {
          enabled: true,
          tenantEnabled: false,
          captchaKey: 'k1',
          imageBase64: 'data:image/svg+xml;base64,PHN2Zz4=',
          expireSeconds: 120,
        },
        calls,
      );
      const captcha = await getCaptcha();
      expect(captcha.expireSeconds).toBe(120);

      // 2. /login
      adminHttpClient.instance.defaults.adapter = captureAdapter(
        {
          tokenName: 'satoken-admin',
          tokenValue: 'tok-1',
          expireIn: 7200,
          tenantId: '0',
          tenantName: '平台默认租户',
        },
        calls,
      );
      const loginVo = await login({
        tenantCode: '000000',
        username: 'superadmin',
        password: 'Password@123',
        captchaKey: 'k1',
        captchaCode: 'ab12',
      });
      expect(loginVo.tokenValue).toBe('tok-1');

      // 3. /logout
      adminHttpClient.instance.defaults.adapter = captureAdapter(null, calls);
      await logout();

      // 4. /info（数组缺失时兜底为 []）
      adminHttpClient.instance.defaults.adapter = captureAdapter(
        {
          userId: '100',
          tenantId: '0',
          tenantName: '平台默认租户',
          username: 'superadmin',
          nickname: '超级管理员',
          roles: undefined,
          permissions: undefined,
          passwordNeedsChange: true,
        },
        calls,
      );
      const info = await getAuthInfo();
      expect(info.roles).toEqual([]);
      expect(info.permissions).toEqual([]);

      // 5. /routes（空值与缺失 children 递归兜底为 []）
      adminHttpClient.instance.defaults.adapter = captureAdapter(
        [
          {
            id: '1000',
            parentId: '0',
            menuType: 'M',
            title: '组织权限',
            path: '/system',
            visible: 0,
            children: undefined,
          },
        ],
        calls,
      );
      const routes = await getAuthRoutes();
      expect(routes[0]?.children).toEqual([]);

      // 6-7. GET / PUT /profile
      adminHttpClient.instance.defaults.adapter = captureAdapter(
        {
          userId: '100',
          tenantId: '0',
          tenantName: '平台默认租户',
          username: 'superadmin',
          nickname: '超级管理员',
          gender: '0',
          createTime: '2026-01-01 00:00:00',
          passwordNeedsChange: false,
          postNames: undefined,
          roles: undefined,
        },
        calls,
      );
      const profile = await getPersonalProfile();
      expect(profile.postNames).toEqual([]);
      expect(profile.roles).toEqual([]);

      adminHttpClient.instance.defaults.adapter = captureAdapter(null, calls);
      await updatePersonalProfile({
        nickname: '超级管理员',
        gender: '0',
        email: null,
        phone: null,
      });

      // 8. POST /profile/avatar (FormData)
      adminHttpClient.instance.defaults.adapter = captureAdapter(
        { avatarUrl: 'https://cdn.example.com/a.png', objectPath: 'avatar/0/100/a.png' },
        calls,
      );
      const avatarRes = await uploadProfileAvatar(
        new File(['png'], 'avatar.png', { type: 'image/png' }),
      );
      expect(avatarRes.objectPath).toBe('avatar/0/100/a.png');

      // 9. PUT /password
      adminHttpClient.instance.defaults.adapter = captureAdapter(null, calls);
      await updatePassword({ oldPassword: 'Old@1234', newPassword: 'New@1234' });

      // 10. GET /online/page（空 records 兜底 []）
      adminHttpClient.instance.defaults.adapter = captureAdapter(
        { records: null, total: 0, current: 1, size: 10 },
        calls,
      );
      const page = await getOnlineSessionPage({ current: 1, size: 10, username: 'admin' });
      expect(page.records).toEqual([]);
      expect(page.total).toBe(0);

      // 11. DELETE /online/{sessionId}（空句柄静默忽略，有效句柄 URL 编码）
      await kickoutOnlineSession('   ');
      await kickoutOnlineSession('handle/abc+1');

      // 12. GET /admin/system/tenant/options
      adminHttpClient.instance.defaults.adapter = captureAdapter(null, calls);
      const tenantOpts = await getTenantOptions();
      expect(tenantOpts).toEqual([]);

      expect(calls.map(c => `${c.method} ${c.url}`)).toEqual([
        'GET /admin/auth/captcha',
        'POST /admin/auth/login',
        'POST /admin/auth/logout',
        'GET /admin/auth/info',
        'GET /admin/auth/routes',
        'GET /admin/auth/profile',
        'PUT /admin/auth/profile',
        'POST /admin/auth/profile/avatar',
        'PUT /admin/auth/password',
        'GET /admin/auth/online/page',
        'DELETE /admin/auth/online/handle%2Fabc%2B1',
        'GET /admin/system/tenant/options',
      ]);
      expect(calls[7]?.data).toBeInstanceOf(FormData);
    } finally {
      adminHttpClient.instance.defaults.adapter = origAdapter;
    }
  });
});
