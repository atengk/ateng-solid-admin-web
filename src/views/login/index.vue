<script setup lang="ts">
import { ref } from 'vue';
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
import ThemeToggle from '@/components/ThemeToggle.vue';
import LoginBrandPanel from './components/LoginBrandPanel.vue';
import { useLoginAuth } from './useLoginAuth';

/**
 * 管理端双栏工程登录视图（/login）：
 * 挂载拉取前哨安全配置与图形验证码、支持多租户动态显隐、101004 维度差异化锁定倒计时与同源白名单 redirect。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'Login' });

const formRef = ref<FormInstance>();
const tenantInputRef = ref<InstanceType<typeof ElInput>>();
const capsLockActive = ref<boolean>(false);

const {
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
} = useLoginAuth({
  formRef,
  onTenantUnavailable: () => tenantInputRef.value?.focus(),
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
    class="solid-login-stage flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10"
  >
    <div class="fixed top-3.5 right-4 z-20 flex items-center gap-2">
      <ThemeToggle />
    </div>

    <!-- 窄屏精简品牌头 (< 960px) -->
    <div class="mb-4 flex items-center gap-2.5 min-[960px]:hidden">
      <span
        class="solid-brand-badge inline-flex h-8 w-8 items-center justify-center rounded-[var(--solid-radius-md)] bg-primary text-sm font-bold"
      >
        S
      </span>
      <span class="text-base font-semibold text-ink">ateng-solid 管理后台</span>
    </div>

    <section
      data-testid="login-card"
      class="solid-login-card w-full max-w-[420px] overflow-hidden rounded-[var(--solid-radius-lg)] border border-border bg-surface min-[960px]:grid min-[960px]:min-h-[520px] min-[960px]:max-w-[920px] min-[960px]:grid-cols-[42%_58%]"
    >
      <LoginBrandPanel :tenant-enabled="captcha.tenantEnabled" />

      <!-- 右侧认证表单区 -->
      <div class="flex flex-col justify-center gap-4 px-7 py-8 sm:px-9 sm:py-9">
        <header>
          <h1 class="m-0 text-xl font-semibold text-ink">登录管理后台</h1>
          <p class="mt-1 mb-0 text-[13px] text-ink-secondary">
            请输入账号凭据与安全校验信息以进入系统
          </p>
        </header>

        <!-- 前置配置异常重试区 -->
        <div
          v-if="captchaConfigError"
          data-testid="login-captcha-config-error"
          role="alert"
          class="flex items-center justify-between gap-2 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2.5 text-[13px] text-[var(--solid-danger)]"
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
          class="flex items-start gap-2 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2.5 text-[13px] text-[var(--solid-danger)]"
        >
          <el-icon :size="15" class="mt-0.5 shrink-0"><Warning /></el-icon>
          <span class="tabular-nums leading-snug">{{ activeErrorText }}</span>
        </div>

        <el-form
          ref="formRef"
          :model="form"
          :rules="formRules"
          :validate-on-rule-change="false"
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
                image-height="38px"
              />
            </div>
          </el-form-item>

          <div class="mb-4 flex items-center justify-between text-[13px] text-ink-regular">
            <el-checkbox v-model="rememberAccount" data-testid="login-remember-checkbox">
              记住登录账号
            </el-checkbox>
            <span class="text-xs text-ink-secondary">会话令牌严格按租户作用域隔离</span>
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
    </section>
  </main>
</template>

<style scoped>
.solid-login-stage {
  background-image: radial-gradient(var(--solid-border) 1px, transparent 1px);
  background-size: 20px 20px;
}

.solid-login-card {
  box-shadow: var(--solid-shadow-floating);
}

.solid-brand-badge {
  color: var(--solid-brand-panel-on-primary);
}
</style>
