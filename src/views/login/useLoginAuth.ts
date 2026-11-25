import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { FormInstance, FormRules } from 'element-plus';
import { BusinessException, type Result } from '@atengk/core';
import { getCaptcha, type CaptchaVO, type LoginLockDetailVO } from '@/api/auth';
import { resolveAuthenticatedRedirectTarget } from '@/router/guards';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';

/**
 * 管理端登录认证编排 Hook：
 * 管理前哨安全配置/图形验证码拉取、记住账号持久化、101004 账户/IP 双维度锁定倒计时与安全跳转。
 *
 * @author Ateng
 * @since 2026-11-25
 */

const DEFAULT_TENANT_CODE = '000000';
const REMEMBER_STORAGE_KEY = 'solid-login-remember';
const CODE_LOGIN_LOCKED = 101004;
const CODE_TENANT_UNAVAILABLE = 101005;

interface RememberedAccount {
  remember: boolean;
  tenantCode: string;
  username: string;
}

export interface UseLoginAuthOptions {
  /** 登录表单实例引用，提交前触发客户端校验 */
  formRef: Ref<FormInstance | undefined>;
  /** 101005 租户不可用错误时聚焦租户输入框的回调 */
  onTenantUnavailable?: () => void;
}

function readRememberedAccount(): RememberedAccount | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(REMEMBER_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<RememberedAccount>;
    if (!parsed || typeof parsed.username !== 'string') {
      return null;
    }
    return {
      remember: Boolean(parsed.remember),
      tenantCode:
        typeof parsed.tenantCode === 'string' && parsed.tenantCode.trim()
          ? parsed.tenantCode.trim()
          : DEFAULT_TENANT_CODE,
      username: parsed.username.trim(),
    };
  } catch {
    return null;
  }
}

function writeRememberedAccount(payload: RememberedAccount | null): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    if (!payload) {
      localStorage.removeItem(REMEMBER_STORAGE_KEY);
      return;
    }
    // 安全底线：仅持久化勾选状态、租户编码与账号名，严禁存储密码
    localStorage.setItem(
      REMEMBER_STORAGE_KEY,
      JSON.stringify({
        remember: payload.remember,
        tenantCode: payload.tenantCode,
        username: payload.username,
      }),
    );
  } catch {
    // 本地存储受限时静默忽略
  }
}

function padTwo(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0');
}

function formatChineseCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${padTwo(mins)}分${padTwo(secs)}秒`;
}

function formatClockCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${padTwo(mins)}:${padTwo(secs)}`;
}

function extractLockDetail(error: unknown): LoginLockDetailVO | undefined {
  if (!(error instanceof BusinessException) || error.code !== CODE_LOGIN_LOCKED) {
    return undefined;
  }
  const causeResult = error.cause as Result<LoginLockDetailVO> | undefined;
  const detail = causeResult?.data;
  if (
    detail &&
    (detail.lockType === 'ACCOUNT' || detail.lockType === 'IP') &&
    typeof detail.remainSeconds === 'number'
  ) {
    return detail;
  }
  return undefined;
}

function resolveFriendlyLoginError(error: unknown): string {
  if (error instanceof BusinessException) {
    return error.msg || '登录认证失败，请核对后重试';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '登录认证失败，请稍后重试';
}

/**
 * 构建登录认证流程所需的响应式状态、校验规则与提交流程动作。
 *
 * @param options 表单引用与异常聚焦回调配置
 * @returns 登录表单模型、验证码状态、错误倒计时文案与提交/刷新动作
 */
export function useLoginAuth(options: UseLoginAuthOptions) {
  const route = useRoute();
  const router = useRouter();
  const authStore = useAuthStore();
  const permissionStore = usePermissionStore();

  const captchaReady = ref<boolean>(false);
  const captchaLoading = ref<boolean>(false);
  const captchaConfigError = ref<string>('');
  const captcha = reactive<CaptchaVO>({
    enabled: false,
    tenantEnabled: false,
    captchaKey: '',
    imageBase64: '',
    expireSeconds: 120,
  });

  const remembered = readRememberedAccount();
  const form = reactive({
    tenantCode: remembered?.tenantCode ?? DEFAULT_TENANT_CODE,
    username: remembered?.username ?? '',
    password: '',
    captchaCode: '',
  });
  const rememberAccount = ref<boolean>(remembered ? remembered.remember : true);
  const tenantCodeTouched = ref<boolean>(false);

  const submitting = ref<boolean>(false);
  const loginErrorMessage = ref<string>('');
  const lockDetail = reactive<{ type: 'ACCOUNT' | 'IP' | null; remainSeconds: number }>({
    type: null,
    remainSeconds: 0,
  });
  let lockIntervalTimer: ReturnType<typeof setInterval> | undefined;

  const formRules = computed<FormRules>(() => ({
    tenantCode: captcha.tenantEnabled
      ? [
          {
            required: true,
            validator: (_rule, value: string, callback) => {
              const trimmed = (value ?? '').trim();
              if (!trimmed) {
                callback(new Error('请输入租户编码'));
                return;
              }
              if (!/^[A-Za-z0-9_-]{1,32}$/.test(trimmed)) {
                callback(new Error('租户编码须为 1~32 位字母、数字、下划线或连字符'));
                return;
              }
              callback();
            },
            trigger: 'blur',
          },
        ]
      : [],
    username: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (!trimmed) {
            callback(new Error('请输入登录账号'));
            return;
          }
          if (trimmed.length < 2 || trimmed.length > 64) {
            callback(new Error('账号长度为 2~64 个字符'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    password: [
      { required: true, message: '请输入登录密码', trigger: 'blur' },
      { max: 64, message: '密码长度不能超过 64 个字符', trigger: 'blur' },
    ],
    captchaCode: captcha.enabled
      ? [
          {
            required: true,
            validator: (_rule, value: string, callback) => {
              if (!(value ?? '').trim()) {
                callback(new Error('请输入图形验证码'));
                return;
              }
              callback();
            },
            trigger: 'blur',
          },
        ]
      : [],
  }));

  const isLocked = computed<boolean>(() => lockDetail.remainSeconds > 0);
  const submitDisabled = computed<boolean>(
    () => !captchaReady.value || submitting.value || isLocked.value,
  );

  const activeErrorText = computed<string>(() => {
    if (isLocked.value) {
      const scopeLabel =
        lockDetail.type === 'IP'
          ? '当前客户端 IP 请求失败过多'
          : '连续登录失败次数过多，当前账号已锁定';
      return `${scopeLabel}，请在 ${formatChineseCountdown(lockDetail.remainSeconds)} 后重试`;
    }
    return loginErrorMessage.value;
  });

  const submitButtonText = computed<string>(() => {
    if (submitting.value) {
      return '登录中...';
    }
    if (isLocked.value) {
      return `已锁定 (${formatClockCountdown(lockDetail.remainSeconds)})`;
    }
    return '登录';
  });

  function clearLockTimer(): void {
    if (lockIntervalTimer !== undefined) {
      clearInterval(lockIntervalTimer);
      lockIntervalTimer = undefined;
    }
  }

  function resetLockState(): void {
    clearLockTimer();
    lockDetail.type = null;
    lockDetail.remainSeconds = 0;
  }

  function startLockCountdown(detail: LoginLockDetailVO): void {
    clearLockTimer();
    lockDetail.type = detail.lockType;
    lockDetail.remainSeconds = Math.max(1, Math.ceil(detail.remainSeconds));
    lockIntervalTimer = setInterval(() => {
      if (lockDetail.remainSeconds <= 1) {
        resetLockState();
        loginErrorMessage.value = '';
        return;
      }
      lockDetail.remainSeconds -= 1;
    }, 1_000);
  }

  watch([() => form.username, () => form.tenantCode], () => {
    // 账号维度锁定：一旦用户修改账号或租户编码，立即解除客户端倒计时恢复可提交态；IP 维度锁保持至归零
    if (lockDetail.type === 'ACCOUNT' && lockDetail.remainSeconds > 0) {
      resetLockState();
      loginErrorMessage.value = '';
    }
  });

  async function loadCaptcha(): Promise<void> {
    if (captchaLoading.value) {
      return;
    }
    captchaLoading.value = true;
    captchaConfigError.value = '';
    try {
      const res = await getCaptcha();
      captcha.enabled = Boolean(res.enabled);
      captcha.tenantEnabled = Boolean(res.tenantEnabled);
      captcha.captchaKey = res.captchaKey ?? '';
      captcha.imageBase64 = res.imageBase64 ?? '';
      captcha.expireSeconds = res.expireSeconds ?? 120;
      captchaReady.value = true;
      form.captchaCode = '';
      authStore.setTenantEnabled(captcha.tenantEnabled);

      if (captcha.tenantEnabled && !tenantCodeTouched.value && !form.tenantCode) {
        form.tenantCode = remembered?.tenantCode ?? DEFAULT_TENANT_CODE;
      }
    } catch {
      captchaReady.value = false;
      captchaConfigError.value = '获取登录安全配置失败，请检查服务连接后点击重试';
    } finally {
      captchaLoading.value = false;
    }
  }

  async function handleSubmit(): Promise<void> {
    if (submitDisabled.value) {
      return;
    }

    const valid = await options.formRef.value?.validate().catch(() => false);
    if (valid === false) {
      return;
    }

    submitting.value = true;
    loginErrorMessage.value = '';
    const effectiveTenantCode = captcha.tenantEnabled
      ? form.tenantCode.trim()
      : DEFAULT_TENANT_CODE;
    const trimmedUsername = form.username.trim();

    let loginSucceeded = false;
    try {
      // 1. 发起认证请求写入 Token 与生效租户上下文
      await authStore.login({
        tenantCode: effectiveTenantCode,
        username: trimmedUsername,
        password: form.password,
        captchaKey: captcha.enabled ? captcha.captchaKey : undefined,
        captchaCode: captcha.enabled ? form.captchaCode.trim() : undefined,
        grantType: 'password',
      });
      loginSucceeded = true;

      writeRememberedAccount(
        rememberAccount.value
          ? {
              remember: true,
              tenantCode: effectiveTenantCode,
              username: trimmedUsername,
            }
          : null,
      );

      // 2. 并行拉取认证身份与动态路由表，并经白名单与权限可达校验后安全跳转
      await Promise.all([authStore.fetchUserInfo(), permissionStore.buildRoutes(router)]);
      const targetPath = resolveAuthenticatedRedirectTarget(route.query.redirect, permissionStore);
      await router.replace(targetPath);
    } catch (error) {
      // 凭据签发成功但身份或动态菜单拉取失败时回滚局部会话，避免登录页残留半登录态 Token
      if (loginSucceeded && authStore.isAuthenticated) {
        authStore.clearLocalSession(router);
      }

      const lockInfo = extractLockDetail(error);
      if (lockInfo) {
        startLockCountdown(lockInfo);
      } else {
        loginErrorMessage.value = resolveFriendlyLoginError(error);
      }

      if (error instanceof BusinessException && error.code === CODE_TENANT_UNAVAILABLE) {
        options.onTenantUnavailable?.();
      }

      if (captcha.enabled) {
        form.captchaCode = '';
        await loadCaptcha();
      }
    } finally {
      submitting.value = false;
    }
  }

  onMounted(() => {
    void loadCaptcha();
  });

  onBeforeUnmount(() => {
    clearLockTimer();
  });

  return {
    captchaLoading,
    captchaConfigError,
    captcha,
    form,
    formRules,
    rememberAccount,
    tenantCodeTouched,
    submitting,
    submitDisabled,
    activeErrorText,
    submitButtonText,
    loadCaptcha,
    handleSubmit,
  };
}
