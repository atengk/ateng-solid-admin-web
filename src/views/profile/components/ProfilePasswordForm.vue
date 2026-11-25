<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ElButton,
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElMessage,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { Check, Close, Lock, Warning } from '@element-plus/icons-vue';
import { BusinessException } from '@atengk/core';
import { updatePassword } from '@/api/auth';
import { useAuthStore } from '@/stores/auth';
import { evaluatePasswordPolicy, PASSWORD_POLICY_MESSAGE } from '@/utils/password';

/**
 * 个人中心修改密码面板：提供实时 4 项强口令规则达成指示，修改成功后强制注销全端会话重登。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'ProfilePasswordForm' });

const router = useRouter();
const authStore = useAuthStore();

const formRef = ref<FormInstance>();
const submitting = ref<boolean>(false);
const submitError = ref<string>('');

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const policyEval = computed(() => evaluatePasswordPolicy(form.newPassword));
const isDifferentFromOld = computed<boolean>(
  () => form.newPassword.length > 0 && form.newPassword !== form.oldPassword,
);

const checklistItems = computed(() => [
  { key: 'length', label: '长度为 8~20 个字符', passed: policyEval.value.lengthOk },
  { key: 'whitespace', label: '不能包含空格或控制字符', passed: policyEval.value.noWhitespace },
  {
    key: 'categories',
    label: '至少包含大写字母、小写字母、数字、特殊字符中的 3 类',
    passed: policyEval.value.categoriesOk,
  },
  { key: 'different', label: '不能与当前密码完全一致', passed: isDifferentFromOld.value },
]);

const formRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        if (!value) {
          callback(new Error('请输入新密码'));
          return;
        }
        const evaluated = evaluatePasswordPolicy(value);
        if (!evaluated.valid) {
          callback(new Error(PASSWORD_POLICY_MESSAGE));
          return;
        }
        if (value === form.oldPassword) {
          callback(new Error('新密码不能与当前密码完全一致'));
          return;
        }
        callback();
      },
      trigger: ['blur', 'change'],
    },
  ],
  confirmPassword: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        if (!value) {
          callback(new Error('请再次确认新密码'));
          return;
        }
        if (value !== form.newPassword) {
          callback(new Error('两次输入的新密码不一致'));
          return;
        }
        callback();
      },
      trigger: ['blur', 'change'],
    },
  ],
};

watch(
  () => form.oldPassword,
  () => {
    if (form.newPassword) {
      void formRef.value?.validateField('newPassword').catch(() => undefined);
    }
  },
);

watch(
  () => form.newPassword,
  () => {
    if (form.confirmPassword) {
      void formRef.value?.validateField('confirmPassword').catch(() => undefined);
    }
  },
);

async function handleSubmit(): Promise<void> {
  if (submitting.value) {
    return;
  }
  if (!formRef.value) {
    return;
  }
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) {
    return;
  }

  submitting.value = true;
  submitError.value = '';
  try {
    await updatePassword({
      oldPassword: form.oldPassword,
      newPassword: form.newPassword,
    });
    ElMessage.success('密码已修改，请使用新密码重新登录');
    // 后端已全端注销该账号会话，前端直接清理本地凭据并跳转 /login
    await authStore.logout({ remote: false, router });
  } catch (error) {
    submitError.value =
      error instanceof BusinessException && error.msg
        ? error.msg
        : '修改密码失败，请核对当前密码后重试';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="submitError"
      data-testid="profile-password-error"
      role="alert"
      class="flex items-center gap-2 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2 text-[13px] text-[var(--solid-danger)]"
    >
      <el-icon :size="15"><Warning /></el-icon>
      <span>{{ submitError }}</span>
    </div>

    <el-form ref="formRef" :model="form" :rules="formRules" label-width="104px" class="max-w-xl">
      <el-form-item label="当前密码" prop="oldPassword">
        <el-input
          v-model="form.oldPassword"
          data-testid="profile-old-password-input"
          type="password"
          show-password
          maxlength="64"
          autocomplete="current-password"
          placeholder="请输入当前密码"
          :prefix-icon="Lock"
        />
      </el-form-item>

      <el-form-item label="新密码" prop="newPassword">
        <el-input
          v-model="form.newPassword"
          data-testid="profile-new-password-input"
          type="password"
          show-password
          maxlength="20"
          autocomplete="new-password"
          placeholder="请输入 8~20 位强口令"
          :prefix-icon="Lock"
        />

        <ul
          class="mt-2 mb-0 flex list-none flex-col gap-1 rounded-[var(--solid-radius-md)] border border-border-subtle bg-canvas/70 px-3 py-2 text-xs"
        >
          <li
            v-for="rule in checklistItems"
            :key="rule.key"
            class="flex items-center gap-1.5"
            :class="rule.passed ? 'text-success' : 'text-ink-secondary'"
          >
            <el-icon :size="13">
              <Check v-if="rule.passed" />
              <Close v-else />
            </el-icon>
            <span>{{ rule.label }}</span>
          </li>
        </ul>
      </el-form-item>

      <el-form-item label="确认新密码" prop="confirmPassword">
        <el-input
          v-model="form.confirmPassword"
          data-testid="profile-confirm-password-input"
          type="password"
          show-password
          maxlength="20"
          autocomplete="new-password"
          placeholder="请再次输入新密码"
          :prefix-icon="Lock"
        />
      </el-form-item>

      <el-form-item>
        <el-button
          v-idempotent="{ handler: handleSubmit, feedback: false }"
          data-testid="profile-password-submit-btn"
          type="primary"
          :loading="submitting"
        >
          修改密码
        </el-button>
      </el-form-item>
    </el-form>
  </div>
</template>
