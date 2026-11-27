<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  ElButton,
  ElCheckbox,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  type FormInstance,
} from 'element-plus';
import { Key, Lock, OfficeBuilding, RefreshRight, User, Warning } from '@element-plus/icons-vue';
import { AtengCaptcha } from '@atengk/element-plus';
import BrandLogo from '@/components/BrandLogo.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import LoginBrandPanel from './components/LoginBrandPanel.vue';
import { useLoginAuth } from './useLoginAuth';

/**
 * 管理端登录视图（/login · 方案 C 建筑感大画幅双栏卡）：
 * 承载 1040px 舒展建筑双栏舞台、深岩「三阶精密基座」结构线稿面板、前哨安全配置/验证码联动、
 * 101004 维度差异化倒计时与窄屏单卡自适应。
 *
 * @author Ateng
 * @since 2026-11-26
 */
defineOptions({ name: 'Login' });

const formRef = ref<FormInstance>();
const tenantInputRef = ref<InstanceType<typeof ElInput>>();
const capsLockActive = ref<boolean>(false);

const {
  captchaLoading,
  captchaConfigError,
  captcha,
  tenantModeResolved,
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
} = useLoginAuth({
  formRef,
  onTenantUnavailable: () => tenantInputRef.value?.focus(),
});

const subtitleText = computed<string>(() =>
  captcha.tenantEnabled
    ? '请输入租户编码与账号凭据以进入控制台'
    : '请输入账号凭据以进入控制台',
);

const runtimeModeText = computed<string>(() => {
  if (!tenantModeResolved.value) {
    return '运行模式检测中...';
  }
  return captcha.tenantEnabled ? 'SaaS 多租户模式' : '单租户默认态 (000000)';
});

function detectCapsLock(event: Event): void {
  if (event instanceof KeyboardEvent && typeof event.getModifierState === 'function') {
    capsLockActive.value = event.getModifierState('CapsLock');
  }
}

function handleEnterKey(event: Event): void {
  if (event instanceof KeyboardEvent && event.isComposing) {
    return;
  }
  void handleSubmit();
}
</script>

<template>
  <main
    class="solid-login-stage box-border flex min-h-screen flex-col items-center justify-center gap-4.5 bg-canvas px-4 py-7 sm:px-6"
  >
    <!-- 窄屏精简品牌头 (< 960px) -->
    <div
      data-testid="login-mobile-brand"
      class="flex w-full max-w-[420px] items-center justify-center min-[960px]:hidden"
    >
      <BrandLogo :size="24" wordmark-size="lg" />
    </div>

    <section
      data-testid="login-card"
      class="solid-login-card w-full max-w-[420px] overflow-hidden rounded-[var(--solid-radius-lg)] border border-border bg-surface min-[960px]:grid min-[960px]:max-w-[1040px] min-[960px]:grid-cols-[44%_56%]"
    >
      <LoginBrandPanel />

      <!-- 右侧认证表单区 -->
      <div
        class="flex flex-col justify-between gap-4 px-6 py-6 sm:px-8 sm:py-7 min-[960px]:px-11 min-[960px]:py-7"
      >
        <div class="flex items-center justify-end">
          <ThemeToggle />
        </div>

        <div class="mx-auto my-auto w-full max-w-[368px]">
          <header class="mb-6">
            <h1 class="m-0 text-[22px] font-semibold leading-tight tracking-tight text-ink">
              登录管理后台
            </h1>
            <p class="mt-1.5 mb-0 text-[13px] text-ink-secondary">
              {{ subtitleText }}
            </p>
          </header>

          <!-- 前置配置异常重试区 -->
          <div
            v-if="captchaConfigError"
            data-testid="login-captcha-config-error"
            role="alert"
            class="mb-4 flex items-center justify-between gap-2 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2.5 text-[13px] text-[var(--solid-danger)]"
          >
            <span class="flex items-center gap-2">
              <el-icon :size="15"><Warning /></el-icon>
              <span>{{ captchaConfigError }}</span>
            </span>
            <el-button
              data-testid="login-captcha-retry-btn"
              size="small"
              type="danger"
              plain
              :icon="RefreshRight"
              :loading="captchaLoading"
              @click="loadCaptcha"
            >
              重新获取
            </el-button>
          </div>

          <!-- 系统级登录错误 / 101004 防爆破倒计时槽位 -->
          <div
            v-else-if="activeErrorText"
            data-testid="login-error-alert"
            role="alert"
            class="mb-4 flex items-start gap-2 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2.5 text-[13px] text-[var(--solid-danger)]"
          >
            <el-icon :size="15" class="mt-0.5 shrink-0"><Warning /></el-icon>
            <span class="tabular-nums leading-snug">{{ activeErrorText }}</span>
          </div>

          <el-form
            ref="formRef"
            class="solid-login-form"
            :model="form"
            :rules="formRules"
            :validate-on-rule-change="false"
            :hide-required-asterisk="true"
            label-position="top"
            @submit.prevent="handleSubmit"
          >
            <el-form-item v-if="captcha.tenantEnabled" label="租户编码" prop="tenantCode">
              <el-input
                ref="tenantInputRef"
                v-model="form.tenantCode"
                data-testid="login-tenant-input"
                size="large"
                clearable
                maxlength="32"
                placeholder="请输入租户编码（默认 000000）"
                :prefix-icon="OfficeBuilding"
                @input="tenantCodeTouched = true"
                @keydown.enter="handleEnterKey"
              />
            </el-form-item>

            <el-form-item label="登录账号" prop="username">
              <el-input
                v-model="form.username"
                data-testid="login-username-input"
                size="large"
                clearable
                maxlength="64"
                autocomplete="username"
                placeholder="请输入登录账号"
                :prefix-icon="User"
                @keydown.enter="handleEnterKey"
              />
            </el-form-item>

            <el-form-item label="登录密码" prop="password">
              <el-input
                v-model="form.password"
                data-testid="login-password-input"
                size="large"
                type="password"
                show-password
                maxlength="64"
                autocomplete="current-password"
                placeholder="请输入登录密码"
                :prefix-icon="Lock"
                @keydown="detectCapsLock"
                @keyup="detectCapsLock"
                @blur="capsLockActive = false"
                @keydown.enter="handleEnterKey"
              />
              <div
                v-if="capsLockActive"
                data-testid="login-capslock-hint"
                class="mt-1 flex items-center gap-1 text-xs text-warning"
              >
                <el-icon :size="13"><Warning /></el-icon>
                <span>大写锁定 (Caps Lock) 已开启</span>
              </div>
            </el-form-item>

            <el-form-item v-if="captcha.enabled" label="图形验证码" prop="captchaCode">
              <div class="grid w-full grid-cols-[1fr_130px] items-start gap-2.5">
                <el-input
                  v-model="form.captchaCode"
                  data-testid="login-captcha-input"
                  size="large"
                  clearable
                  maxlength="8"
                  placeholder="请输入验证码"
                  :prefix-icon="Key"
                  @keydown.enter="handleEnterKey"
                />
                <AtengCaptcha
                  type="image"
                  :image-src="captcha.imageBase64"
                  :refresh="loadCaptcha"
                  image-width="130px"
                  image-height="40px"
                />
              </div>
            </el-form-item>

            <div class="mb-5 flex items-center justify-start text-[13px] text-ink-regular">
              <el-checkbox v-model="rememberAccount" name="rememberAccount" data-testid="login-remember-checkbox">
                记住登录账号
              </el-checkbox>
            </div>

            <el-button
              v-idempotent="{ handler: handleSubmit, feedback: false }"
              data-testid="login-submit-btn"
              type="primary"
              size="large"
              native-type="button"
              class="tabular-nums w-full"
              :loading="submitting"
              :disabled="submitDisabled"
            >
              {{ submitButtonText }}
            </el-button>
          </el-form>
        </div>

        <div class="hidden h-2 min-[960px]:block" aria-hidden="true" />
      </div>
    </section>

    <footer
      data-testid="login-footer"
      class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-muted"
    >
      <span class="font-mono-data">v0.1.0</span>
      <span aria-hidden="true">·</span>
      <span>{{ runtimeModeText }}</span>
      <span aria-hidden="true">·</span>
      <span>ateng-solid 管理控制台</span>
    </footer>
  </main>
</template>

<style scoped>
.solid-login-stage {
  background-image:
    linear-gradient(to right, var(--solid-border-light) 1px, transparent 1px),
    linear-gradient(to bottom, var(--solid-border-light) 1px, transparent 1px);
  background-size: 48px 48px;
}

.solid-login-card {
  box-shadow: var(--solid-shadow-floating);
}

.solid-login-form {
  --el-form-item-label-font-size: 13px;
}
</style>
