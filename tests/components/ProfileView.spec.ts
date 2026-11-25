import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import ElementPlus from 'element-plus';
import AtengElementPlus, { DictManager } from '@atengk/element-plus';
import { BusinessException } from '@atengk/core';
import { createAtengVue } from '@atengk/vue';
import * as authApi from '@/api/auth';
import type { AdminProfileVO, PersonalProfileVO } from '@/api/auth';
import { setupDictManager } from '@/utils/dict';
import { adminAuthManager, adminHttpClient, adminTenantManager } from '@/utils/http';
import { useAuthStore } from '@/stores/auth';
import ProfileView from '@/views/profile/index.vue';

/**
 * 个人中心（/profile）Layer 3 组件契约测试：
 * 覆盖左栏 AtengDescriptions 脱敏+真明文复制、右栏真明文基本资料编辑、AtengUpload 头像校验与直传、强口令 4 规则校验及改密强制重登。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const wrappers: VueWrapper[] = [];

function trackWrapper(wrapper: VueWrapper): VueWrapper {
  wrappers.push(wrapper);
  return wrapper;
}

function createProfileRouter(): Router {
  const EmptyView = defineComponent({ name: 'StubView', template: '<div>stub</div>' });
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', name: 'Login', component: EmptyView },
      { path: '/dashboard', name: 'Dashboard', component: EmptyView },
      { path: '/profile', name: 'Profile', component: ProfileView },
    ],
  });
}

function createAuthProfile(overrides: Partial<AdminProfileVO> = {}): AdminProfileVO {
  return {
    userId: '1859201948101000001',
    tenantId: '0',
    tenantName: '平台默认租户',
    username: 'alice',
    nickname: '张敏',
    avatar: 'https://cdn.example.com/avatar/old.png',
    roles: ['tenant_admin'],
    permissions: ['system:user:list'],
    passwordNeedsChange: false,
    loginIp: '10.1.2.3',
    loginDate: '2026-11-25 14:00:00',
    ...overrides,
  };
}

function createPersonalProfile(overrides: Partial<PersonalProfileVO> = {}): PersonalProfileVO {
  return {
    userId: '1859201948101000001',
    tenantId: '0',
    tenantName: '平台默认租户',
    username: 'alice',
    nickname: '张敏',
    email: 'alice@example.com',
    phone: '13812345678',
    gender: '1',
    avatar: 'https://cdn.example.com/avatar/old.png',
    deptName: '核心架构部',
    postNames: ['首席工程师', '架构师'],
    roles: ['tenant_admin'],
    loginIp: '10.1.2.3',
    loginDate: '2026-11-25 14:00:00',
    createTime: '2026-01-10 09:00:00',
    passwordNeedsChange: false,
    ...overrides,
  };
}

describe('ProfileView (/profile)', () => {
  let pinia: ReturnType<typeof createPinia>;
  let atengVue: ReturnType<typeof createAtengVue>;
  const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    adminAuthManager.setToken('valid-token');
    useAuthStore().syncTokenFromManager();
    adminTenantManager.setTenantId('0');
    atengVue = createAtengVue({
      httpClient: adminHttpClient,
      authManager: adminAuthManager,
      tenantManager: adminTenantManager,
      superAdminRoles: ['super_admin'],
      defaultSize: 10,
    });
    DictManager.setProvider(async () => [
      { label: '男', value: '0' },
      { label: '女', value: '1' },
      { label: '未知', value: '2' },
    ]);
  });

  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount();
    }
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
    } else {
      delete (navigator as unknown as { clipboard?: unknown }).clipboard;
    }
    setupDictManager();
    vi.restoreAllMocks();
  });

  it('handles loadProfile error recovery, masked overview with raw copy, reset restore, and 102002 field retention', async () => {
    const router = createProfileRouter();
    await router.push('/profile');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createAuthProfile());
    const profileSpy = vi
      .spyOn(authApi, 'getPersonalProfile')
      .mockRejectedValueOnce(new Error('profile fetch failed'))
      .mockResolvedValueOnce(createPersonalProfile())
      .mockResolvedValueOnce(createPersonalProfile({ nickname: '张敏-已更新' }));
    await useAuthStore().fetchUserInfo();

    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeTextSpy },
    });

    const wrapper = trackWrapper(
      mount(ProfileView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    // 1. 首次拉取失败展示错误提示并禁用保存按钮，点击重试恢复加载
    expect(wrapper.find('[data-testid="profile-load-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="profile-save-btn"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="profile-retry-btn"]').trigger('click');
    await flushPromises();
    expect(profileSpy).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="profile-load-error"]').exists()).toBe(false);

    // 左栏只读脱敏渲染且等宽数字 className 生效：显示 138****5678，不直接显示完整明文手机号
    const overview = wrapper.find('[data-testid="profile-overview-card"]');
    expect(overview.text()).toContain('138****5678');
    expect(overview.text()).not.toContain('13812345678');
    expect(overview.text()).toContain('核心架构部');
    expect(overview.text()).toContain('首席工程师 / 架构师');
    expect(overview.findAll('.tabular-nums').length).toBeGreaterThanOrEqual(4);

    // 左栏一键复制应写入内存真明文 13812345678
    const copyBtns = overview.findAll('.at-descriptions__copy-btn');
    expect(copyBtns.length).toBeGreaterThanOrEqual(2);
    await copyBtns[0]?.trigger('click');
    await flushPromises();
    expect(writeTextSpy).toHaveBeenCalledWith('13812345678');

    // 右栏基本资料表单严格加载内存真明文
    const nicknameInput = wrapper.find('[data-testid="profile-nickname-input"]');
    const phoneInput = wrapper.find('[data-testid="profile-phone-input"]');
    const emailInput = wrapper.find('[data-testid="profile-email-input"]');
    expect((phoneInput.element as HTMLInputElement).value).toBe('13812345678');
    expect((emailInput.element as HTMLInputElement).value).toBe('alice@example.com');

    // [重置还原] 应把未保存修改还原为当前档案值
    await nicknameInput.setValue('临时修改');
    await wrapper.find('[data-testid="profile-reset-btn"]').trigger('click');
    await flushPromises();
    expect((nicknameInput.element as HTMLInputElement).value).toBe('张敏');

    // 102002 手机/邮箱唯一冲突保留已编辑输入现场并展示错误横幅
    const updateSpy = vi
      .spyOn(authApi, 'updatePersonalProfile')
      .mockRejectedValueOnce(
        new BusinessException(102002, '手机号码已被其他用户占用', 'trace-102002'),
      )
      .mockResolvedValueOnce();
    await nicknameInput.setValue('张敏-已更新');
    await wrapper.find('[data-testid="profile-save-btn"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="profile-basic-error"]').text()).toContain(
      '手机号码已被其他用户占用',
    );
    expect((nicknameInput.element as HTMLInputElement).value).toBe('张敏-已更新');

    // 纠正后保存成功并同步更新 authStore.user
    await wrapper.find('[data-testid="profile-save-btn"]').trigger('click');
    await flushPromises();

    expect(updateSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nickname: '张敏-已更新',
        phone: '13812345678',
        email: 'alice@example.com',
        gender: '1',
      }),
    );
    expect(useAuthStore().user?.nickname).toBe('张敏-已更新');
  });

  it('handles AtengUpload avatar bridge, client guard hints, and preserves old avatar on error', async () => {
    const router = createProfileRouter();
    await router.push('/profile');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createAuthProfile());
    vi.spyOn(authApi, 'getPersonalProfile').mockResolvedValue(createPersonalProfile());
    await useAuthStore().fetchUserInfo();

    const wrapper = trackWrapper(
      mount(ProfileView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const uploadComponent = wrapper.findComponent({ name: 'AtengUpload' });
    expect(uploadComponent.exists()).toBe(true);
    expect(uploadComponent.props('accept')).toBe('.jpg,.jpeg,.png,.webp');
    expect(uploadComponent.props('maxSize')).toBe(2 * 1024 * 1024);

    // 格式/超限事件触发展示内联校验提示
    uploadComponent.vm.$emit('type-reject', new File(['x'], 'bad.gif'), '.jpg,.jpeg,.png,.webp');
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-avatar-error"]').text()).toContain(
      '仅支持 JPG、PNG、WEBP',
    );

    uploadComponent.vm.$emit('size-exceed', new File(['x'], 'huge.png'), 2 * 1024 * 1024);
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-avatar-error"]').text()).toContain('2MB');

    // 通过 httpRequest 桥接上传新头像成功后刷新本地 store 头像
    const uploadSpy = vi.spyOn(authApi, 'uploadProfileAvatar').mockResolvedValue({
      avatarUrl: 'https://cdn.example.com/avatar/new.png',
      objectPath: 'avatar/0/1001/new.png',
    });
    const httpRequest = uploadComponent.props('httpRequest') as (opts: {
      file: File;
      onSuccess: (res: unknown) => void;
      onError: (err: unknown) => void;
    }) => Promise<unknown>;

    const validFile = new File(['png-bytes'], 'avatar.png', { type: 'image/png' });
    await httpRequest({
      file: validFile,
      onSuccess: vi.fn(),
      onError: vi.fn(),
    });
    await flushPromises();

    expect(uploadSpy).toHaveBeenCalledWith(validFile);
    expect(useAuthStore().user?.avatar).toBe('https://cdn.example.com/avatar/new.png');

    // 上传失败时必须保持已有头像不清空
    vi.spyOn(authApi, 'uploadProfileAvatar').mockRejectedValueOnce(new Error('invalid magic'));
    await expect(
      httpRequest({
        file: validFile,
        onSuccess: vi.fn(),
        onError: vi.fn(),
      }),
    ).rejects.toThrow();
    expect(useAuthStore().user?.avatar).toBe('https://cdn.example.com/avatar/new.png');
  });

  it('activates password tab from query, enforces 3-category password policy, and logs out to /login on success', async () => {
    const router = createProfileRouter();
    await router.push('/profile?tab=password');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createAuthProfile());
    vi.spyOn(authApi, 'getPersonalProfile').mockResolvedValue(createPersonalProfile());
    await useAuthStore().fetchUserInfo();

    const wrapper = trackWrapper(
      mount(ProfileView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    const pwdPanel = wrapper.find('[data-testid="profile-password-panel"]');
    expect(pwdPanel.exists()).toBe(true);

    // 1. 弱口令、含空白字符以及与当前密码一致均不可提交修改请求
    const updatePwdSpy = vi
      .spyOn(authApi, 'updatePassword')
      .mockRejectedValueOnce(new BusinessException(101006, '当前密码不正确', 'trace-101006'))
      .mockResolvedValueOnce();
    await wrapper.find('[data-testid="profile-old-password-input"]').setValue('Old@2026');

    await wrapper.find('[data-testid="profile-new-password-input"]').setValue('weakpass');
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('weakpass');
    await wrapper.find('[data-testid="profile-password-submit-btn"]').trigger('click');
    await flushPromises();
    expect(updatePwdSpy).not.toHaveBeenCalled();

    await wrapper.find('[data-testid="profile-new-password-input"]').setValue('Abcd 1234!');
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('Abcd 1234!');
    await wrapper.find('[data-testid="profile-password-submit-btn"]').trigger('click');
    await flushPromises();
    expect(updatePwdSpy).not.toHaveBeenCalled();

    await wrapper.find('[data-testid="profile-new-password-input"]').setValue('Old@2026');
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('Old@2026');
    await wrapper.find('[data-testid="profile-password-submit-btn"]').trigger('click');
    await flushPromises();
    expect(updatePwdSpy).not.toHaveBeenCalled();

    // 2. 服务端返回 101006 旧密码错误时保留表单提示错误，不清除本地会话
    await wrapper.find('[data-testid="profile-new-password-input"]').setValue('NewStrong@2026');
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('NewStrong@2026');
    await wrapper.find('[data-testid="profile-password-submit-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-password-error"]').text()).toContain(
      '当前密码不正确',
    );
    expect(useAuthStore().isAuthenticated).toBe(true);

    // 3. 符合强口令要求再次提交成功后强制清空会话并跳转 /login
    await wrapper.find('[data-testid="profile-password-submit-btn"]').trigger('click');
    await flushPromises();

    expect(updatePwdSpy).toHaveBeenCalledWith({
      oldPassword: 'Old@2026',
      newPassword: 'NewStrong@2026',
    });
    expect(useAuthStore().isAuthenticated).toBe(false);
    expect(router.currentRoute.value.path).toBe('/login');
  });
});
