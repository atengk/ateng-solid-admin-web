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
import { Warning } from '@element-plus/icons-vue';
import { AtengDialog, AtengDictRadio, DictManager } from '@atengk/element-plus';
import {
  createDictType,
  getDictTypeDetail,
  updateDictType,
  type DictTypeSaveRequest,
} from '@/api/system/dict';
import type { CommonStatus } from '@/api/types';
import { useDetailDialogState } from '@/composables/useDetailDialogState';

/**
 * 动态字典类型新增/编辑弹窗（480px）：
 * 校验小写 snake_case 编码格式，并在编辑态锁定 dictType 只读及保存后精准清理客户端缓存。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'DictTypeFormDialog' });

const DICT_TYPE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

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
   * 编辑模式下的字典类型主键。
   */
  dictTypeId?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved', dictType: string): void;
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
  dictName: string;
  dictType: string;
  status: CommonStatus;
  remark: string;
}>({
  id: undefined,
  dictName: '',
  dictType: '',
  status: 0,
  remark: '',
});

const formRules: FormRules = {
  dictName: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (trimmed.length < 2 || trimmed.length > 50) {
          callback(new Error('字典名称长度须在 2~50 个字符之间'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  dictType: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        if (props.mode === 'edit') {
          callback();
          return;
        }
        const trimmed = (value ?? '').trim();
        if (!DICT_TYPE_PATTERN.test(trimmed)) {
          callback(new Error('字典类型须为小写字母开头的 2~64 位小写字母、数字或下划线'));
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
  form.dictName = '';
  form.dictType = '';
  form.status = 0;
  form.remark = '';
}

async function loadDialogData(): Promise<void> {
  resetFormState();
  if (props.mode === 'edit' && props.dictTypeId) {
    const targetId = props.dictTypeId;
    await runDetailLoad({
      loader: () => getDictTypeDetail(targetId),
      onLoaded: detail => {
        form.id = detail.id;
        form.dictName = detail.dictName;
        form.dictType = detail.dictType;
        form.status = detail.status;
        form.remark = detail.remark ?? '';
      },
      errorFallback: '加载字典类型详情失败，请关闭重试',
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
  const payload: DictTypeSaveRequest = {
    id: props.mode === 'edit' ? form.id : undefined,
    dictName: form.dictName.trim(),
    dictType: form.dictType.trim(),
    status: form.status,
    remark: form.remark.trim() || null,
  };

  try {
    if (props.mode === 'edit') {
      await updateDictType(payload);
      ElMessage.success(`已保存字典类型【${payload.dictName}】`);
    } else {
      await createDictType(payload);
      ElMessage.success(`已新增字典类型【${payload.dictName}】`);
    }
    if (payload.dictType) {
      DictManager.clearCache(payload.dictType);
    }
    emit('saved', payload.dictType ?? '');
    return true;
  } catch (error) {
    recordSubmitError(error, '保存字典类型失败，请核对后重试');
    return false;
  }
}
</script>

<template>
  <AtengDialog
    v-model="visible"
    :title="mode === 'edit' ? '编辑字典类型' : '新增字典类型'"
    width="480px"
    confirm-text="保存字典类型"
    :form-ref="formRef"
    :show-confirm="!detailLoadFailed"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
  >
    <div class="flex flex-col gap-3">
      <div
        v-if="submitError"
        data-testid="dict-type-form-error"
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
        <el-form-item label="字典名称" prop="dictName">
          <el-input
            v-model="form.dictName"
            data-testid="dict-type-form-name"
            maxlength="50"
            clearable
            placeholder="例如 用户性别"
          />
        </el-form-item>

        <el-form-item label="字典类型" prop="dictType">
          <el-input
            v-model="form.dictType"
            data-testid="dict-type-form-code"
            :disabled="mode === 'edit'"
            maxlength="64"
            clearable
            class="font-mono-data"
            placeholder="小写下划线格式，例如 sys_user_gender"
          />
          <p v-if="mode === 'edit'" class="mt-1 text-xs text-ink-muted">
            字典类型编码创建后锁定只读，避免破坏业务引用一致性
          </p>
        </el-form-item>

        <el-form-item label="状态" prop="status">
          <AtengDictRadio v-model="form.status" dict-code="commonStatus" value-type="number" />
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            data-testid="dict-type-form-remark"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="可选填写该字典用途与消费模块说明"
          />
        </el-form-item>
      </el-form>
    </div>
  </AtengDialog>
</template>

<style scoped></style>
