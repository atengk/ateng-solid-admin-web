<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
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
import { Refresh, Warning } from '@element-plus/icons-vue';
import { AtengDictRadio } from '@atengk/element-plus';
import { BusinessException } from '@atengk/core';
import { updatePersonalProfile, type PersonalProfileVO } from '@/api/auth';
import type { GenderValue } from '@/api/types';

/**
 * 个人中心基本资料表单面板：保持表单绑定值为完整未脱敏内存真明文，支持还原与冲突错误就地提示。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'ProfileBasicForm' });

const props = defineProps<{
  /**
   * 服务端拉取的完整个人中心真明文资料对象。
   */
  profile: PersonalProfileVO | null;
  /**
   * 外部资料加载中的禁用状态。
   */
  loading?: boolean;
}>();

const emit = defineEmits<{
  /**
   * 基本资料成功持久化至后端后触发，通知父容器同步刷新展示摘要。
   */
  (e: 'saved'): void;
}>();

const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formRef = ref<FormInstance>();
const saving = ref<boolean>(false);
const submitError = ref<string>('');

const form = reactive<{
  nickname: string;
  phone: string;
  email: string;
  gender: GenderValue;
}>({
  nickname: '',
  phone: '',
  email: '',
  gender: '2',
});

function syncFormFromProfile(source: PersonalProfileVO | null): void {
  form.nickname = source?.nickname ?? '';
  form.phone = source?.phone ?? '';
  form.email = source?.email ?? '';
  form.gender = source?.gender ?? '2';
  submitError.value = '';
  formRef.value?.clearValidate();
}

watch(
  () => props.profile,
  nextProfile => {
    syncFormFromProfile(nextProfile);
  },
  { immediate: true },
);

const formRules: FormRules = {
  nickname: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (trimmed.length < 2 || trimmed.length > 30) {
          callback(new Error('用户昵称长度须为 2~30 个字符'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  phone: [
    {
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (!trimmed) {
          callback();
          return;
        }
        if (!PHONE_PATTERN.test(trimmed)) {
          callback(new Error('请输入正确的 11 位手机号码'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  email: [
    {
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (!trimmed) {
          callback();
          return;
        }
        if (trimmed.length > 64 || !EMAIL_PATTERN.test(trimmed)) {
          callback(new Error('请输入合法电子邮箱（不超过 64 个字符）'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

function handleReset(): void {
  syncFormFromProfile(props.profile);
}

async function handleSave(): Promise<void> {
  if (saving.value || props.loading) {
    return;
  }
  const valid = await formRef.value?.validate().catch(() => false);
  if (valid === false) {
    return;
  }

  saving.value = true;
  submitError.value = '';
  try {
    const trimmedPhone = form.phone.trim();
    const trimmedEmail = form.email.trim();
    await updatePersonalProfile({
      nickname: form.nickname.trim(),
      phone: trimmedPhone || null,
      email: trimmedEmail || null,
      gender: form.gender,
    });
    ElMessage.success('已保存个人资料');
    emit('saved');
  } catch (error) {
    submitError.value =
      error instanceof BusinessException && error.msg
        ? error.msg
        : '保存个人资料失败，请核对手机或邮箱后重试';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div
      v-if="submitError"
      data-testid="profile-basic-error"
      role="alert"
      class="flex items-center gap-2 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2 text-[13px] text-[var(--solid-danger)]"
    >
      <el-icon :size="15"><Warning /></el-icon>
      <span>{{ submitError }}</span>
    </div>

    <el-form ref="formRef" :model="form" :rules="formRules" label-width="96px" class="max-w-xl">
      <el-form-item label="登录账号">
        <el-input :model-value="profile?.username ?? ''" disabled />
        <div class="mt-1 text-xs text-ink-secondary">
          登录账号不可自助修改，如需变更请联系管理员
        </div>
      </el-form-item>

      <el-form-item label="用户昵称" prop="nickname">
        <el-input
          v-model="form.nickname"
          data-testid="profile-nickname-input"
          clearable
          maxlength="30"
          placeholder="请输入 2~30 位用户昵称"
        />
      </el-form-item>

      <el-form-item label="手机号码" prop="phone">
        <el-input
          v-model="form.phone"
          data-testid="profile-phone-input"
          clearable
          maxlength="11"
          placeholder="请输入 11 位手机号码，留空可清空"
        />
      </el-form-item>

      <el-form-item label="电子邮箱" prop="email">
        <el-input
          v-model="form.email"
          data-testid="profile-email-input"
          clearable
          maxlength="64"
          placeholder="请输入电子邮箱，留空可清空"
        />
      </el-form-item>

      <el-form-item label="用户性别" prop="gender">
        <AtengDictRadio v-model="form.gender" dict-code="sys_user_gender" />
      </el-form-item>

      <el-form-item>
        <div class="flex flex-wrap items-center gap-2.5">
          <el-button
            v-idempotent="{ handler: handleSave, feedback: false }"
            data-testid="profile-save-btn"
            type="primary"
            :loading="saving"
            :disabled="loading || !profile"
          >
            保存基本资料
          </el-button>
          <el-button
            data-testid="profile-reset-btn"
            :icon="Refresh"
            :disabled="saving || loading || !profile"
            @click="handleReset"
          >
            重置还原
          </el-button>
        </div>
      </el-form-item>
    </el-form>
  </div>
</template>
