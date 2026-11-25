<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElForm, ElFormItem, ElInput, ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { AtengDialog } from '@atengk/element-plus';
import { getConfigByKey } from '@/api/system/config';
import { resetUserPassword, type UserVO } from '@/api/system/user';
import FormErrorBanner from '@/components/FormErrorBanner.vue';
import PasswordPolicyChecklist from '@/components/PasswordPolicyChecklist.vue';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import { evaluatePasswordPolicy, PASSWORD_POLICY_MESSAGE } from '@/utils/password';

/**
 * 管理员重置用户密码弹窗（480px）：
 * 异步预填 sys.user.initPassword，执行强口令复杂度校验，确认后后端置空 pwd_update_time 并强退全端在线会话。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'UserResetPwdDialog' });

const props = defineProps<{
  /** 弹窗显示状态（v-model）。 */
  modelValue: boolean;
  /** 目标用户摘要行。 */
  user?: Pick<UserVO, 'id' | 'username' | 'nickname'> | null;
}>();

const emit = defineEmits<{
  /** 弹窗显示状态更新事件。 */
  (e: 'update:modelValue', value: boolean): void;
  /** 重置密码成功通知事件。 */
  (e: 'saved'): void;
}>();

const visible = computed<boolean>({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

const formRef = ref<FormInstance>();
const { detailLoading, submitError, resetDialogState, recordSubmitError, runDetailLoad } =
  useDetailDialogState();

const form = reactive<{ password: string }>({ password: '' });

const formRules: FormRules = {
  password: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        if (!evaluatePasswordPolicy(value ?? '').valid) {
          callback(new Error(PASSWORD_POLICY_MESSAGE));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

function clearSensitiveForm(): void {
  resetDialogState();
  form.password = '';
}

async function initDefaultPassword(): Promise<void> {
  clearSensitiveForm();
  await runDetailLoad({
    loader: () => getConfigByKey('sys.user.initPassword').catch(() => null),
    onLoaded: value => {
      form.password = value ?? '';
    },
    errorFallback: '读取系统默认初始密码失败，请手动输入强密码',
  });
  await nextTick();
  formRef.value?.clearValidate();
}

watch(
  () => props.modelValue,
  opened => {
    if (opened) {
      void initDefaultPassword();
    } else {
      clearSensitiveForm();
    }
  },
);

async function handleBeforeConfirm(): Promise<boolean> {
  if (!props.user || detailLoading.value) {
    return false;
  }
  submitError.value = '';
  try {
    await resetUserPassword(props.user.id, { password: form.password });
    ElMessage.success(`已重置用户【${props.user.nickname}】的登录密码并通知重新登录`);
    emit('saved');
    return true;
  } catch (error) {
    recordSubmitError(error, '重置用户密码失败，请核对后重试');
    return false;
  }
}
</script>

<template>
  <AtengDialog
    v-model="visible"
    title="重置用户密码"
    width="480px"
    confirm-text="确认重置"
    :form-ref="formRef"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
  >
    <div class="flex flex-col gap-3">
      <FormErrorBanner :message="submitError" test-id="user-reset-pwd-error" />

      <p v-if="user" class="m-0 text-sm text-ink-regular">
        即将重置用户【<span class="font-medium text-ink">{{ user.nickname }}</span>
        （<span class="font-mono-data">{{ user.username }}</span
        >）】的登录密码，重置后其全部在线会话将强制下线。
      </p>

      <el-form
        ref="formRef"
        v-loading="detailLoading"
        :model="form"
        :rules="formRules"
        label-width="80px"
      >
        <el-form-item label="新密码" prop="password">
          <div class="flex w-full flex-col gap-1.5">
            <el-input
              v-model="form.password"
              data-testid="user-reset-pwd-input"
              type="password"
              show-password
              maxlength="20"
              autocomplete="new-password"
              placeholder="请输入符合全站强口令规则的新密码"
            />
            <PasswordPolicyChecklist :password="form.password" />
          </div>
        </el-form-item>
      </el-form>
    </div>
  </AtengDialog>
</template>

<style scoped></style>
