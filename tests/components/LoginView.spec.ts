import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus from 'element-plus';
import AtengElementPlus from '@atengk/element-plus';
import { BusinessException, type Result } from '@atengk/core';
import * as authApi from '@/api/auth';
import type { AdminProfileVO, CaptchaVO, LoginLockDetailVO } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import LoginView from '@/views/login/index.vue';

/**
 * 管理端登录页（/login）Layer 3 组件契约测试：
 * 覆盖多租户显隐、安全配置异常重试、CapsLock 提示、101004 ACCOUNT/IP 锁定倒计时差异化清除、AtengCaptcha `:refresh` 与 redirect 安全跳转。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function createLoginRouter(): Router {
  const EmptyView = defineComponent({ name: 'StubView', template: '<div>stub</div>' });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: LoginView },
      { path: '/dashboard', name: 'Dashboard', component: EmptyView },
      { path: '/profile', name: 'Profile', component: EmptyView },
    ],
  });
}

function createCaptchaPayload(overrides: Partial<CaptchaVO> = {}): CaptchaVO {
  return {
    enabled: true,
    tenantEnabled: false,
    captchaKey: 'cap-key-1',
    imageBase64: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    expireSeconds: 120,
    ...overrides,
  };
}

function createProfile(): AdminProfileVO {
  return {
    userId: '1001',
    tenantId: '0',
    tenantName: '平台默认租户',
    username: 'superadmin',
    nickname: '超级管理员',
    avatar: null,
    roles: ['super_admin'],
    permissions: ['*:*:*'],
    passwordNeedsChange: false,
    loginIp: '127.0.0.1',
    loginDate: '2026-11-25 12:00:00',
  };
}

function createLockError(lockType: 'ACCOUNT' | 'IP', remainSeconds: number): BusinessException {
  const payload: Result<LoginLockDetailVO> = {
    code: 101004,
    msg: lockType === 'IP' ? 'IP 请求失败过多已锁定' : '账号连续失败已锁定',
    data: { lockType, remainSeconds },
  };
  return new BusinessException(101004, payload.msg, 'trace-lock', payload);
}

describe('LoginView (/login)', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    vi.useFakeTimers();
    pinia = createPinia();
    setActivePinia(pinia);
  });

  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides tenant field when tenantEnabled=false and submits 000000 while excluding password from localStorage', async () => {
    const router = createLoginRouter();
    await router.push('/login');
    await router.isReady();

    vi.spyOn(authApi, 'getCaptcha').mockResolvedValue(
      createCaptchaPayload({ enabled: false, tenantEnabled: false }),
    );
    const loginSpy = vi.spyOn(authApi, 'login').mockResolvedValue({
      tokenName: 'satoken-admin',
      tokenValue: 'tok-single',
      expireIn: 7200,
      tenantId: '0',
      tenantName: '平台默认租户',
    });
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue([]);

    const singleWrapper = trackWrapper(
      mount(LoginView, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(singleWrapper.find('[data-testid="login-tenant-input"]').exists()).toBe(false);
    expect(singleWrapper.find('[data-testid="login-captcha-input"]').exists()).toBe(false);

    // 仅输入空格的账号应被去首尾空格校验拦截
    await singleWrapper.find('[data-testid="login-username-input"]').setValue('   ');
    await singleWrapper.find('[data-testid="login-password-input"]').setValue('Ateng@2026');
    await singleWrapper.find('[data-testid="login-submit-btn"]').trigger('click');
    await flushPromises();
    expect(loginSpy).not.toHaveBeenCalled();

    await singleWrapper.find('[data-testid="login-username-input"]').setValue('superadmin');
    await singleWrapper.find('[data-testid="login-submit-btn"]').trigger('click');
    await flushPromises();

    expect(loginSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantCode: '000000', username: 'superadmin' }),
    );
    // 安全约定：localStorage 中绝不写入明文或可逆密码
    const rawSaved = localStorage.getItem('solid-login-remember') ?? '';
    expect(rawSaved).not.toContain('Ateng@2026');
    expect(router.currentRoute.value.path).toBe('/dashboard');
  });

  it('shows prefilled 000000 tenant input, validates whitespace, focuses tenant input on 101005, and refreshes captcha on non-lock error', async () => {
    const router = createLoginRouter();
    await router.push('/login');
    await router.isReady();

    let seq = 0;
    const captchaSpy = vi.spyOn(authApi, 'getCaptcha').mockImplementation(async () => {
      seq += 1;
      return createCaptchaPayload({ enabled: true, tenantEnabled: true, captchaKey: `t-${seq}` });
    });
    const loginSpy = vi
      .spyOn(authApi, 'login')
      .mockRejectedValueOnce(new BusinessException(101005, '租户已被禁用', 'trace-tenant'));

    const multiWrapper = trackWrapper(
      mount(LoginView, {
        attachTo: document.body,
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const tenantInput = multiWrapper.find('[data-testid="login-tenant-input"]');
    expect(tenantInput.exists()).toBe(true);
    expect((tenantInput.element as HTMLInputElement).value).toBe('000000');

    // 仅空格的验证码不可绕过客户端必填校验
    await multiWrapper.find('[data-testid="login-username-input"]').setValue('superadmin');
    await multiWrapper.find('[data-testid="login-password-input"]').setValue('Ateng@2026');
    await multiWrapper.find('[data-testid="login-captcha-input"]').setValue('   ');
    await multiWrapper.find('[data-testid="login-submit-btn"]').trigger('click');
    await flushPromises();
    expect(loginSpy).not.toHaveBeenCalled();

    // 含首尾空格的合法租户编码应去空格后正常提交，并在 101005 时自动聚焦租户框与刷新验证码
    await tenantInput.setValue(' 10002 ');
    await multiWrapper.find('[data-testid="login-captcha-input"]').setValue('8888');
    await multiWrapper.find('[data-testid="login-submit-btn"]').trigger('click');
    await flushPromises();

    expect(loginSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantCode: '10002', captchaCode: '8888' }),
    );
    expect(multiWrapper.find('[data-testid="login-error-alert"]').text()).toContain('租户已被禁用');
    expect(document.activeElement).toBe(tenantInput.element);
    expect(captchaSpy).toHaveBeenCalledTimes(2);
  });

  it('clears ACCOUNT lock countdown when editing username/tenantCode but preserves IP lock countdown', async () => {
    const router = createLoginRouter();
    await router.push('/login');
    await router.isReady();

    let seq = 0;
    const captchaSpy = vi.spyOn(authApi, 'getCaptcha').mockImplementation(async () => {
      seq += 1;
      return createCaptchaPayload({ captchaKey: `cap-${seq}` });
    });

    const wrapper = trackWrapper(
      mount(LoginView, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    await wrapper.find('[data-testid="login-username-input"]').setValue('alice');
    await wrapper.find('[data-testid="login-password-input"]').setValue('wrong');
    await wrapper.find('[data-testid="login-captcha-input"]').setValue('1234');

    // 1. 触发 ACCOUNT 维度 101004 锁定：启动倒计时并自动刷新验证码
    vi.spyOn(authApi, 'login').mockRejectedValueOnce(createLockError('ACCOUNT', 120));
    await wrapper.find('[data-testid="login-submit-btn"]').trigger('click');
    await flushPromises();

    expect(captchaSpy).toHaveBeenCalledTimes(2);
    expect(
      (wrapper.find('[data-testid="login-captcha-input"]').element as HTMLInputElement).value,
    ).toBe('');
    expect(wrapper.find('[data-testid="login-error-alert"]').text()).toContain('02分00秒');
    expect(wrapper.find('[data-testid="login-submit-btn"]').attributes('disabled')).toBeDefined();

    // 推进 1 秒验证实时倒计时跳动
    await vi.advanceTimersByTimeAsync(1_000);
    expect(wrapper.find('[data-testid="login-error-alert"]').text()).toContain('01分59秒');

    // 修改账号即刻解除 ACCOUNT 维度倒计时
    await wrapper.find('[data-testid="login-username-input"]').setValue('bob');
    await flushPromises();
    expect(wrapper.find('[data-testid="login-submit-btn"]').attributes('disabled')).toBeUndefined();

    // 2. 触发 IP 维度 101004 锁定：修改账号仍保持倒计时禁用
    await wrapper.find('[data-testid="login-captcha-input"]').setValue('5678');
    vi.spyOn(authApi, 'login').mockRejectedValueOnce(createLockError('IP', 65));
    await wrapper.find('[data-testid="login-submit-btn"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="login-error-alert"]').text()).toContain('01分05秒');
    await wrapper.find('[data-testid="login-username-input"]').setValue('charlie');
    await flushPromises();
    expect(wrapper.find('[data-testid="login-submit-btn"]').attributes('disabled')).toBeDefined();
  });

  it('refreshes captcha when clicking AtengCaptcha image and respects redirect allowlist after login', async () => {
    const router = createLoginRouter();
    await router.push('/login?redirect=/profile');
    await router.isReady();

    let callNum = 0;
    const captchaSpy = vi.spyOn(authApi, 'getCaptcha').mockImplementation(async () => {
      callNum += 1;
      return createCaptchaPayload({ captchaKey: `k-${callNum}` });
    });

    const wrapper = trackWrapper(
      mount(LoginView, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();
    expect(captchaSpy).toHaveBeenCalledTimes(1);

    await wrapper.find('[data-testid="login-captcha-input"]').setValue('abcd');
    await wrapper.find('.at-captcha__image-box').trigger('click');
    await flushPromises();

    expect(captchaSpy).toHaveBeenCalledTimes(2);
    expect(
      (wrapper.find('[data-testid="login-captcha-input"]').element as HTMLInputElement).value,
    ).toBe('');

    const authStore = useAuthStore();
    vi.spyOn(authStore, 'login').mockResolvedValue({
      tokenName: 'satoken-admin',
      tokenValue: 'tok-ok',
      expireIn: 7200,
      tenantId: '0',
      tenantName: '平台默认租户',
    });
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue([]);

    await wrapper.find('[data-testid="login-username-input"]').setValue('superadmin');
    await wrapper.find('[data-testid="login-password-input"]').setValue('Ateng@2026');
    await wrapper.find('[data-testid="login-captcha-input"]').setValue('wxyz');
    await wrapper.find('[data-testid="login-submit-btn"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/profile');
  });

  it('disables submit when captcha config fails until retried, shows CapsLock warning, and blocks unsafe redirect', async () => {
    const router = createLoginRouter();
    await router.push('/login?redirect=https://evil.example/phish');
    await router.isReady();

    const captchaSpy = vi
      .spyOn(authApi, 'getCaptcha')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(createCaptchaPayload({ enabled: false, tenantEnabled: false }));

    const wrapper = trackWrapper(
      mount(LoginView, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    expect(wrapper.find('[data-testid="login-captcha-config-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="login-submit-btn"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="login-captcha-retry-btn"]').trigger('click');
    await flushPromises();
    expect(captchaSpy).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="login-captcha-config-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="login-submit-btn"]').attributes('disabled')).toBeUndefined();

    // CapsLock 状态提示检测（happy-dom 原生 KeyboardEvent 未实现 getModifierState，显式注入标准方法）
    const pwdInput = wrapper.find('[data-testid="login-password-input"]');
    const capsEvent = new KeyboardEvent('keydown', { key: 'A', bubbles: true });
    Object.defineProperty(capsEvent, 'getModifierState', {
      value: (modifier: string) => modifier === 'CapsLock',
    });
    pwdInput.element.dispatchEvent(capsEvent);
    await flushPromises();
    expect(wrapper.find('[data-testid="login-capslock-hint"]').exists()).toBe(true);

    const authStore = useAuthStore();
    vi.spyOn(authStore, 'login').mockResolvedValue({
      tokenName: 'satoken-admin',
      tokenValue: 'tok-safe',
      expireIn: 7200,
      tenantId: '0',
      tenantName: '平台默认租户',
    });
    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createProfile());
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValue([]);

    await wrapper.find('[data-testid="login-username-input"]').setValue('superadmin');
    await pwdInput.setValue('Ateng@2026');
    await wrapper.find('[data-testid="login-submit-btn"]').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/dashboard');
  });

  it('clears ACCOUNT lock countdown on tenantCode edit and rolls back token if post-login init fails', async () => {
    const router = createLoginRouter();
    await router.push('/login');
    await router.isReady();

    vi.spyOn(authApi, 'getCaptcha').mockResolvedValue(
      createCaptchaPayload({ enabled: false, tenantEnabled: true }),
    );

    const wrapper = trackWrapper(
      mount(LoginView, {
        global: { plugins: [pinia, router, ElementPlus, AtengElementPlus] },
      }),
    );
    await flushPromises();

    await wrapper.find('[data-testid="login-username-input"]').setValue('alice');
    await wrapper.find('[data-testid="login-password-input"]').setValue('Wrong@123');
    vi.spyOn(authApi, 'login').mockRejectedValueOnce(createLockError('ACCOUNT', 90));
    await wrapper.find('[data-testid="login-submit-btn"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="login-submit-btn"]').attributes('disabled')).toBeDefined();

    // 修改租户编码同样立即解除 ACCOUNT 维度锁定倒计时
    await wrapper.find('[data-testid="login-tenant-input"]').setValue('10002');
    await flushPromises();
    expect(wrapper.find('[data-testid="login-submit-btn"]').attributes('disabled')).toBeUndefined();

    // 登录后拉取身份信息失败时应自动回滚已签发的局部 Token，防止滞留半登录态
    vi.spyOn(authApi, 'login').mockResolvedValueOnce({
      tokenName: 'satoken-admin',
      tokenValue: 'tok-half',
      expireIn: 7200,
      tenantId: '10002',
      tenantName: '租赁测试',
    });
    vi.spyOn(authApi, 'getAuthInfo').mockRejectedValueOnce(
      new BusinessException(500, '服务异常', 't-500'),
    );
    vi.spyOn(authApi, 'getAuthRoutes').mockResolvedValueOnce([]);

    await wrapper.find('[data-testid="login-submit-btn"]').trigger('click');
    await flushPromises();

    expect(useAuthStore().isAuthenticated).toBe(false);
    expect(wrapper.find('[data-testid="login-error-alert"]').text()).toContain('服务异常');
    expect(router.currentRoute.value.path).toBe('/login');
  });
});
