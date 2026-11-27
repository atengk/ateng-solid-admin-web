import { defineComponent, h, KeepAlive, ref } from 'vue';
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
import { staticRoutes } from '@/router/routes';
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

    // 上传失败时不得向 el-upload 外抛拒绝（避免控制台输出红字），同时展示错误横幅并保持已有头像
    vi.spyOn(authApi, 'uploadProfileAvatar').mockRejectedValueOnce(new Error('invalid magic'));
    await expect(
      httpRequest({
        file: validFile,
        onSuccess: vi.fn(),
        onError: vi.fn(),
      }),
    ).resolves.toBeUndefined();
    expect(wrapper.find('[data-testid="profile-avatar-error"]').exists()).toBe(true);
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

  it('keeps /profile route alive and avoids flashing role key or placeholder rows while loading initial profile', async () => {
    const rootLayoutRoute = staticRoutes.find(item => item.path === '/');
    const profileRoute = rootLayoutRoute?.children?.find(item => item.path === '/profile');
    expect(profileRoute?.meta?.keepAlive).toBe(true);

    const router = createProfileRouter();
    await router.push('/profile');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(
      createAuthProfile({ roles: ['super_admin'], nickname: '超级管理员', username: 'superadmin' }),
    );
    let resolveProfile!: (val: PersonalProfileVO) => void;
    vi.spyOn(authApi, 'getPersonalProfile').mockImplementation(
      () =>
        new Promise<PersonalProfileVO>(resolve => {
          resolveProfile = resolve;
        }),
    );
    await useAuthStore().fetchUserInfo();

    const wrapper = trackWrapper(
      mount(ProfileView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );

    // 首次请求返回前，展示加载占位而非先闪出英文 roleKey (super_admin) 或大面积 '--' 表格
    const overview = wrapper.find('[data-testid="profile-overview-card"]');
    expect(overview.find('[data-testid="profile-overview-loading"]').exists()).toBe(true);
    expect(overview.text()).not.toContain('super_admin');
    expect(overview.findAll('.at-descriptions')).toHaveLength(0);

    resolveProfile(createPersonalProfile({ roles: ['超级管理员'] }));
    await flushPromises();

    expect(overview.find('[data-testid="profile-overview-loading"]').exists()).toBe(false);
    expect(overview.text()).toContain('超级管理员');
    expect(overview.text()).toContain('核心架构部');

    // 性别单选组采用 ARIA group + aria-labelledby，不再输出指向 div[role="radiogroup"] 的无效 <label for>（#52）
    const radioGroup = wrapper.find('.at-dict-radio[role="radiogroup"]');
    expect(radioGroup.exists()).toBe(true);
    const genderFormItem = radioGroup.element.closest('.el-form-item');
    expect(genderFormItem?.getAttribute('role')).toBe('group');
    const labelEl = genderFormItem?.querySelector('.el-form-item__label');
    expect(labelEl?.tagName).toBe('DIV');
    expect(genderFormItem?.querySelectorAll('label[for]')).toHaveLength(0);
  });

  it('syncs inner el-tabs selection with route.query.tab so header password shortcut works repeatedly', async () => {
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

    expect(wrapper.find('[data-testid="profile-password-panel"]').exists()).toBe(true);

    // 点击内部“基本资料”子页签，应同步清除 URL ?tab=password
    const basicTabItem = wrapper.find('#tab-basic');
    await basicTabItem.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe('/profile');

    // 再次通过菜单路由推入 /profile?tab=password，应可正常切回修改密码子页签
    await router.push('/profile?tab=password');
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-password-panel"]').exists()).toBe(true);
  });

  it('reuses PasswordPolicyChecklist list layout and translates 502 raw error into contextual Chinese banner', async () => {
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

    const policyBox = wrapper.find('[data-testid="profile-password-policy"]');
    expect(policyBox.exists()).toBe(true);
    expect(policyBox.text()).toContain('不能与当前密码完全一致');

    vi.spyOn(authApi, 'updatePassword').mockRejectedValueOnce(
      new BusinessException(502, 'Request failed with status code 502'),
    );
    await wrapper.find('[data-testid="profile-old-password-input"]').setValue('Old@2026');
    await wrapper.find('[data-testid="profile-new-password-input"]').setValue('NewStrong@2026');
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('NewStrong@2026');
    await wrapper.find('[data-testid="profile-password-submit-btn"]').trigger('click');
    await flushPromises();

    const errorBanner = wrapper.find('[data-testid="profile-password-error"]').text();
    expect(errorBanner).toBe('修改密码失败，请核对当前密码后重试');
    expect(errorBanner).not.toContain('Request failed');
  });

  it('allows manually closing avatarError and clears avatarError/submitError on tab changes while keeping drafts (#75)', async () => {
    const router = createProfileRouter();
    await router.push('/profile');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createAuthProfile());
    vi.spyOn(authApi, 'getPersonalProfile').mockResolvedValue(createPersonalProfile());
    vi.spyOn(authApi, 'updatePersonalProfile').mockRejectedValue(
      new BusinessException(102002, '手机号码已被其他用户占用'),
    );
    vi.spyOn(authApi, 'updatePassword').mockRejectedValue(
      new BusinessException(101006, '当前密码不正确'),
    );
    await useAuthStore().fetchUserInfo();

    const wrapper = trackWrapper(
      mount(ProfileView, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    // 1. 触发头像错误并校验手动关闭按钮可用且具 aria-label
    const uploadComponent = wrapper.findComponent({ name: 'AtengUpload' });
    uploadComponent.vm.$emit('type-reject', new File(['x'], 'bad.gif'), '.jpg,.jpeg,.png,.webp');
    await flushPromises();
    const avatarAlert = wrapper.find('[data-testid="profile-avatar-error"]');
    const closeBtn = wrapper.find('[data-testid="profile-avatar-error-close"]');
    expect(avatarAlert.exists()).toBe(true);
    expect(closeBtn.exists()).toBe(true);
    expect(closeBtn.attributes('aria-label')).toBeTruthy();

    await closeBtn.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-avatar-error"]').exists()).toBe(false);

    // 2. 再次触发头像错误与基本资料提交错误，编辑未保存草稿后点击 #tab-password：清错误不丢草稿
    uploadComponent.vm.$emit('type-reject', new File(['x'], 'bad2.gif'), '.jpg,.jpeg,.png,.webp');
    const nicknameInput = wrapper.find('[data-testid="profile-nickname-input"]');
    await nicknameInput.setValue('未保存昵称草稿');
    await wrapper.find('[data-testid="profile-save-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-avatar-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="profile-basic-error"]').exists()).toBe(true);

    await wrapper.find('#tab-password').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-avatar-error"]').exists()).toBe(false);

    // 3. 在修改密码 Tab 触发错误并保留输入草稿后，通过路由切换往返 /profile 与 /profile?tab=password：两侧错误均清空且草稿完整保留
    await wrapper.find('[data-testid="profile-old-password-input"]').setValue('TempOld@2026');
    await wrapper.find('[data-testid="profile-new-password-input"]').setValue('NewStrong@2026');
    await wrapper.find('[data-testid="profile-confirm-password-input"]').setValue('NewStrong@2026');
    await wrapper.find('[data-testid="profile-password-submit-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-password-error"]').exists()).toBe(true);

    uploadComponent.vm.$emit('type-reject', new File(['x'], 'bad3.gif'), '.jpg,.jpeg,.png,.webp');
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-avatar-error"]').exists()).toBe(true);

    await router.push('/profile');
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-avatar-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="profile-basic-error"]').exists()).toBe(false);
    expect((wrapper.find('[data-testid="profile-nickname-input"]').element as HTMLInputElement).value).toBe(
      '未保存昵称草稿',
    );

    await router.push('/profile?tab=password');
    await flushPromises();
    expect(wrapper.find('[data-testid="profile-password-error"]').exists()).toBe(false);
    expect(
      (wrapper.find('[data-testid="profile-old-password-input"]').element as HTMLInputElement).value,
    ).toBe('TempOld@2026');
  });

  it('clears avatarError and submitError on KeepAlive deactivation while preserving unsaved form drafts (#75)', async () => {
    const router = createProfileRouter();
    await router.push('/profile');
    await router.isReady();

    vi.spyOn(authApi, 'getAuthInfo').mockResolvedValue(createAuthProfile());
    vi.spyOn(authApi, 'getPersonalProfile').mockResolvedValue(createPersonalProfile());
    vi.spyOn(authApi, 'updatePersonalProfile').mockRejectedValueOnce(
      new BusinessException(102002, '邮箱已被占用'),
    );
    await useAuthStore().fetchUserInfo();

    const activeView = ref<'profile' | 'other'>('profile');
    const OtherView = defineComponent({ name: 'OtherView', template: '<div>other</div>' });
    const Host = defineComponent({
      setup() {
        return { activeView };
      },
      render() {
        return h(KeepAlive, null, {
          default: () => (activeView.value === 'profile' ? h(ProfileView) : h(OtherView)),
        });
      },
    });

    const wrapper = trackWrapper(
      mount(Host, {
        global: { plugins: [pinia, router, ElementPlus, atengVue, AtengElementPlus] },
      }),
    );
    await flushPromises();

    wrapper.findComponent({ name: 'AtengUpload' }).vm.$emit(
      'type-reject',
      new File(['x'], 'bad.gif'),
      '.jpg,.jpeg,.png,.webp',
    );
    const nicknameInput = wrapper.find('[data-testid="profile-nickname-input"]');
    await nicknameInput.setValue('离页保留草稿');
    await wrapper.find('[data-testid="profile-save-btn"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="profile-avatar-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="profile-basic-error"]').exists()).toBe(true);

    // 模拟 KeepAlive 切离 /profile 再切回：错误横幅已自动清理，未保存草稿完整保留
    activeView.value = 'other';
    await flushPromises();
    activeView.value = 'profile';
    await flushPromises();

    expect(wrapper.find('[data-testid="profile-avatar-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="profile-basic-error"]').exists()).toBe(false);
    expect((wrapper.find('[data-testid="profile-nickname-input"]').element as HTMLInputElement).value).toBe(
      '离页保留草稿',
    );
  });
});
