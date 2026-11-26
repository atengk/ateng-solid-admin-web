<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElMessage,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { Warning } from '@element-plus/icons-vue';
import { AtengDialog, AtengDictRadio } from '@atengk/element-plus';
import { createPost, getPostDetail, updatePost, type PostSaveRequest } from '@/api/system/post';
import type { CommonStatus } from '@/api/types';
import { isGlobalHandledHttpError, resolveErrorMessage } from '@/utils/http';

/**
 * 岗位新增/编辑表单弹窗（480px）：
 * 校验岗位编码字母数字与连字符规范、排序边界与 102002 唯一编码冲突内联提示。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'PostFormDialog' });

const POST_CODE_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;

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
   * 编辑模式下的目标岗位主键。
   */
  postId?: string;
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
const detailLoading = ref<boolean>(false);
const submitError = ref<string>('');

const form = reactive<{
  id?: string;
  postCode: string;
  postName: string;
  sort: number;
  status: CommonStatus;
  remark: string;
}>({
  id: undefined,
  postCode: '',
  postName: '',
  sort: 0,
  status: 0,
  remark: '',
});

const formRules: FormRules = {
  postCode: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (!POST_CODE_PATTERN.test(trimmed)) {
          callback(new Error('岗位编码须为 2~64 位字母、数字、下划线或短横线'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  postName: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (trimmed.length < 2 || trimmed.length > 50) {
          callback(new Error('岗位名称长度须在 2~50 个字符之间'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  sort: [{ required: true, type: 'number', message: '请输入显示排序（0~9999）', trigger: 'blur' }],
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
  form.id = undefined;
  form.postCode = '';
  form.postName = '';
  form.sort = 0;
  form.status = 0;
  form.remark = '';
  submitError.value = '';
}

async function loadDialogData(): Promise<void> {
  resetFormState();
  if (props.mode !== 'edit' || !props.postId) {
    await nextTick();
    formRef.value?.clearValidate();
    return;
  }

  detailLoading.value = true;
  try {
    const detail = await getPostDetail(props.postId);
    form.id = detail.id;
    form.postCode = detail.postCode;
    form.postName = detail.postName;
    form.sort = detail.sort ?? 0;
    form.status = detail.status;
    form.remark = detail.remark ?? '';
  } catch (error) {
    const message = resolveErrorMessage(error, '加载岗位详情失败，请关闭重试');
    submitError.value = message;
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(message);
    }
  } finally {
    detailLoading.value = false;
    await nextTick();
    formRef.value?.clearValidate();
  }
}

watch(
  () => props.modelValue,
  opened => {
    if (opened) {
      void loadDialogData();
    }
  },
);

async function handleBeforeConfirm(): Promise<boolean> {
  if (detailLoading.value) {
    return false;
  }
  submitError.value = '';
  const payload: PostSaveRequest = {
    id: props.mode === 'edit' ? form.id : undefined,
    postCode: form.postCode.trim(),
    postName: form.postName.trim(),
    sort: Number(form.sort) || 0,
    status: form.status,
    remark: form.remark.trim() || null,
  };

  try {
    if (props.mode === 'edit') {
      await updatePost(payload);
      ElMessage.success(`已保存岗位【${payload.postName}】`);
    } else {
      await createPost(payload);
      ElMessage.success(`已新增岗位【${payload.postName}】`);
    }
    emit('saved');
    return true;
  } catch (error) {
    const message = resolveErrorMessage(error, '保存岗位失败，请核对后重试');
    submitError.value = message;
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(message);
    }
    return false;
  }
}
</script>

<template>
  <AtengDialog
    v-model="visible"
    :title="mode === 'edit' ? '编辑岗位' : '新增岗位'"
    width="480px"
    confirm-text="保存岗位"
    :form-ref="formRef"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
    @closed="submitError = ''"
  >
    <div class="flex flex-col gap-3">
      <div
        v-if="submitError"
        data-testid="post-form-error"
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
        label-width="88px"
      >
        <el-form-item label="岗位编码" prop="postCode">
          <el-input
            v-model="form.postCode"
            data-testid="post-form-code"
            maxlength="64"
            clearable
            class="font-mono-data"
            placeholder="例如 CTO、PM、HR_BP"
          />
        </el-form-item>

        <el-form-item label="岗位名称" prop="postName">
          <el-input
            v-model="form.postName"
            data-testid="post-form-name"
            maxlength="50"
            clearable
            placeholder="请输入 2~50 个字符"
          />
        </el-form-item>

        <el-form-item label="显示排序" prop="sort">
          <el-input-number
            v-model="form.sort"
            data-testid="post-form-sort"
            :min="0"
            :max="9999"
            controls-position="right"
            class="!w-full tabular-nums"
          />
        </el-form-item>

        <el-form-item for="" label="岗位状态" prop="status">
          <AtengDictRadio v-model="form.status" dict-code="commonStatus" value-type="number" />
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            data-testid="post-form-remark"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="可选填写岗位职责补充说明"
          />
        </el-form-item>
      </el-form>
    </div>
  </AtengDialog>
</template>

<style scoped></style>
