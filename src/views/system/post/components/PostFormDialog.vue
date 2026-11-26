<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElSkeleton,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { AtengDialog, AtengDictRadio } from '@atengk/element-plus';
import { createPost, getPostDetail, updatePost, type PostSaveRequest } from '@/api/system/post';
import type { CommonStatus } from '@/api/types';
import FormErrorBanner from '@/components/FormErrorBanner.vue';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import { withDictPreload } from '@/utils/dict';

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
const {
  detailLoading,
  detailLoadFailed,
  detailReady,
  submitError,
  resetDialogState,
  recordSubmitError,
  runDetailLoad,
} = useDetailDialogState();

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
  resetDialogState();
  form.id = undefined;
  form.postCode = '';
  form.postName = '';
  form.sort = 0;
  form.status = 0;
  form.remark = '';
}

async function loadDialogData(): Promise<void> {
  resetFormState();
  if (props.mode === 'edit' && props.postId) {
    const targetId = props.postId;
    await runDetailLoad({
      loader: () => withDictPreload(['commonStatus'], () => getPostDetail(targetId)),
      onLoaded: detail => {
        form.id = detail.id;
        form.postCode = detail.postCode;
        form.postName = detail.postName;
        form.sort = detail.sort ?? 0;
        form.status = detail.status;
        form.remark = detail.remark ?? '';
      },
      errorFallback: '加载岗位详情失败，请关闭重试',
    });
  } else {
    await withDictPreload(['commonStatus'], async () => undefined);
  }
  await nextTick();
  formRef.value?.clearValidate();
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
  if (detailLoading.value || detailLoadFailed.value) {
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
    recordSubmitError(error, '保存岗位失败，请核对后重试');
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
    :show-confirm="!detailLoadFailed && detailReady"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
    @closed="resetFormState"
  >
    <div class="flex flex-col gap-3">
      <FormErrorBanner :message="submitError" test-id="post-form-error" />

      <el-skeleton v-if="mode === 'edit' && !detailReady && !detailLoadFailed" :rows="4" animated />

      <el-form
        v-else
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
