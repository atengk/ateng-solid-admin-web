<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElMessage,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { Check, Close, Warning } from '@element-plus/icons-vue';
import { AtengDialog, AtengDictTag } from '@atengk/element-plus';
import {
  createConfig,
  getConfigDetail,
  updateConfig,
  type ConfigSaveRequest,
  type ConfigType,
} from '@/api/system/config';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import {
  evaluatePasswordPolicy,
  PASSWORD_POLICY_MESSAGE,
  type PasswordPolicyEvaluation,
} from '@/utils/password';

/**
 * 系统参数新增/编辑表单弹窗（560px）：
 * 锁定内置参数键名只读、强制 sys.user.initPassword 遵循全站强口令复杂度并保持配置类型不可越界升降级。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'ConfigFormDialog' });

const CONFIG_KEY_PATTERN = /^[a-zA-Z0-9._-]{2,100}$/;
const INIT_PASSWORD_CONFIG_KEY = 'sys.user.initPassword';

const props = defineProps<{
  /**
   * 弹窗显示状态（v-model）。
   */
  modelValue: boolean;
  /**
   * 操作模式（新增或编辑）。
   */
  mode: 'create' | 'edit';
  /**
   * 编辑模式下的参数主键。
   */
  configId?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved'): void;
}>();

const visible = computed<boolean>({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

const formRef = ref<FormInstance>();
const {
  detailLoading,
  detailLoadFailed,
  submitError,
  resetDialogState,
  recordSubmitError,
  runDetailLoad,
} = useDetailDialogState();

const form = reactive<{
  id?: string;
  configName: string;
  configKey: string;
  configValue: string;
  configType: ConfigType;
  remark: string;
}>({
  id: undefined,
  configName: '',
  configKey: '',
  configValue: '',
  configType: 'N',
  remark: '',
});

const isBuiltinLocked = computed<boolean>(() => props.mode === 'edit' && form.configType === 'Y');
const isInitPasswordKey = computed<boolean>(
  () => form.configKey.trim() === INIT_PASSWORD_CONFIG_KEY,
);
const passwordPolicy = computed<PasswordPolicyEvaluation>(() =>
  evaluatePasswordPolicy(form.configValue),
);

const formRules: FormRules = {
  configName: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (trimmed.length < 2 || trimmed.length > 100) {
          callback(new Error('参数名称长度须在 2~100 个字符之间'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  configKey: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        if (isBuiltinLocked.value) {
          callback();
          return;
        }
        const trimmed = (value ?? '').trim();
        if (!CONFIG_KEY_PATTERN.test(trimmed)) {
          callback(new Error('参数键名仅支持 2~100 位字母、数字、点、下划线和短横线'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  configValue: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        const raw = value ?? '';
        if (isInitPasswordKey.value) {
          // 初始默认口令须按原始未裁剪文本执行强口令校验，防止首尾空白绕过
          if (!evaluatePasswordPolicy(raw).valid) {
            callback(new Error(PASSWORD_POLICY_MESSAGE));
            return;
          }
          callback();
          return;
        }
        const trimmed = raw.trim();
        if (trimmed.length < 1 || trimmed.length > 2000) {
          callback(new Error('参数键值长度须在 1~2000 个字符之间'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  remark: [
    {
      validator: (_rule, value: string, callback) => {
        if ((value ?? '').trim().length > 500) {
          callback(new Error('备注长度不能超过 500 个字符'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
};

function resetFormState(): void {
  resetDialogState();
  form.id = undefined;
  form.configName = '';
  form.configKey = '';
  form.configValue = '';
  form.configType = 'N';
  form.remark = '';
}

async function loadDialogData(): Promise<void> {
  resetFormState();
  if (props.mode === 'edit' && props.configId) {
    const targetId = props.configId;
    await runDetailLoad({
      loader: () => getConfigDetail(targetId),
      onLoaded: detail => {
        form.id = detail.id;
        form.configName = detail.configName;
        form.configKey = detail.configKey;
        form.configValue = detail.configValue;
        form.configType = detail.configType;
        form.remark = detail.remark ?? '';
      },
      errorFallback: '加载系统参数详情失败，请关闭重试',
    });
  }
  await nextTick();
  formRef.value?.clearValidate();
}

watch(
  () => props.modelValue,
  opened => {
    if (opened) {
      void loadDialogData();
    } else {
      resetDialogState();
    }
  },
);

async function handleBeforeConfirm(): Promise<boolean> {
  if (detailLoading.value || detailLoadFailed.value) {
    return false;
  }
  submitError.value = '';
  const configKey = form.configKey.trim();
  const payload: ConfigSaveRequest = {
    id: props.mode === 'edit' ? form.id : undefined,
    configName: form.configName.trim(),
    configKey,
    configValue:
      configKey === INIT_PASSWORD_CONFIG_KEY ? form.configValue : form.configValue.trim(),
    configType: props.mode === 'create' ? 'N' : form.configType,
    remark: form.remark.trim() || null,
  };

  try {
    if (props.mode === 'edit') {
      await updateConfig(payload);
      ElMessage.success(`已保存参数【${payload.configName}】`);
    } else {
      await createConfig(payload);
      ElMessage.success(`已新增参数【${payload.configName}】`);
    }
    emit('saved');
    return true;
  } catch (error) {
    recordSubmitError(error, '保存系统参数失败，请核对后重试');
    return false;
  }
}
</script>

<template>
  <AtengDialog
    v-model="visible"
    :title="mode === 'edit' ? '编辑系统参数' : '新增系统参数'"
    width="560px"
    confirm-text="保存参数"
    :form-ref="formRef"
    :show-confirm="!detailLoadFailed"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
  >
    <div class="flex flex-col gap-3">
      <div
        v-if="submitError"
        data-testid="config-form-error"
        role="alert"
        class="flex items-center gap-2 rounded-[var(--solid-radius-md)] border border-[var(--solid-danger-border)] bg-[var(--solid-danger-soft)] px-3 py-2 text-[13px] text-[var(--solid-danger)]"
      >
        <el-icon :size="15"><Warning /></el-icon>
        <span>{{ submitError }}</span>
      </div>

      <el-form
        ref="formRef"
        v-loading="detailLoading"
        :model="form"
        :rules="formRules"
        :validate-on-rule-change="false"
        label-width="92px"
      >
        <el-form-item label="参数名称" prop="configName">
          <el-input
            v-model="form.configName"
            data-testid="config-form-name"
            maxlength="100"
            clearable
            placeholder="例如 用户管理-初始默认密码"
          />
        </el-form-item>

        <el-form-item label="参数键名" prop="configKey">
          <el-input
            v-model="form.configKey"
            data-testid="config-form-key"
            :disabled="isBuiltinLocked"
            maxlength="100"
            clearable
            class="font-mono-data"
            placeholder="例如 sys.user.initPassword 或 portal.welcome.title"
          />
          <p v-if="isBuiltinLocked" class="mt-1 text-xs text-ink-muted">
            系统内置核心参数（Y）受保护，禁止修改参数键名或降级
          </p>
        </el-form-item>

        <el-form-item label="参数键值" prop="configValue">
          <div class="flex w-full flex-col gap-2">
            <el-input
              v-model="form.configValue"
              data-testid="config-form-value"
              type="textarea"
              :rows="3"
              maxlength="2000"
              show-word-limit
              class="font-mono-data"
              :placeholder="
                isInitPasswordKey ? '请输入符合平台强口令规则的初始默认密码' : '请输入参数键值'
              "
            />
            <div
              v-if="isInitPasswordKey"
              data-testid="config-password-policy"
              class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle px-3 py-2 text-xs"
            >
              <span
                class="inline-flex items-center gap-1"
                :class="passwordPolicy.lengthOk ? 'text-[var(--solid-success)]' : 'text-ink-muted'"
              >
                <el-icon><component :is="passwordPolicy.lengthOk ? Check : Close" /></el-icon>
                8~20 位长度
              </span>
              <span
                class="inline-flex items-center gap-1"
                :class="
                  passwordPolicy.noWhitespace ? 'text-[var(--solid-success)]' : 'text-ink-muted'
                "
              >
                <el-icon><component :is="passwordPolicy.noWhitespace ? Check : Close" /></el-icon>
                不含空白或控制字符
              </span>
              <span
                class="inline-flex items-center gap-1"
                :class="
                  passwordPolicy.categoriesOk ? 'text-[var(--solid-success)]' : 'text-ink-muted'
                "
              >
                <el-icon><component :is="passwordPolicy.categoriesOk ? Check : Close" /></el-icon>
                大小写/数字/特殊字符至少 3 类
              </span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="参数类型">
          <AtengDictTag dict-code="configType" :value="form.configType" />
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            data-testid="config-form-remark"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="可选填写该参数用途及生效范围说明"
          />
        </el-form-item>
      </el-form>
    </div>
  </AtengDialog>
</template>

<style scoped></style>
