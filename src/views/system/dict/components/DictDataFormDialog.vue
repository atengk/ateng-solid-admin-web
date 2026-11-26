<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElRadio,
  ElRadioGroup,
  ElSkeleton,
  ElSwitch,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import {
  AtengDialog,
  AtengDictRadio,
  AtengDictTag,
  DictManager,
  type DictItem,
} from '@atengk/element-plus';
import {
  createDictData,
  getDictDataDetail,
  updateDictData,
  type DictDataSaveRequest,
} from '@/api/system/dict';
import type { CommonStatus, TagType } from '@/api/types';
import FormErrorBanner from '@/components/FormErrorBanner.vue';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import { normalizeTagType, withDictPreload } from '@/utils/dict';

/**
 * 动态字典明细新增/编辑弹窗（520px）：
 * 集成 6 档语义色彩选择器、AtengDictTag 实时预览区与同类型互斥默认项开关，保存成功后精确清理客户端字典缓存。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'DictDataFormDialog' });

const TAG_TYPE_OPTIONS: Array<{ label: string; value: TagType }> = [
  { label: '默认中性', value: '' },
  { label: 'primary（钴蓝）', value: 'primary' },
  { label: 'success（翡翠绿）', value: 'success' },
  { label: 'warning（琥珀橙）', value: 'warning' },
  { label: 'danger（警示红）', value: 'danger' },
  { label: 'info（灰中性）', value: 'info' },
];

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
   * 所属字典类型编码（锁定只读）。
   */
  dictType: string;
  /**
   * 编辑模式下的字典明细主键。
   */
  dictDataId?: string;
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
  detailReady,
  submitError,
  resetDialogState,
  recordSubmitError,
  runDetailLoad,
} = useDetailDialogState();

const form = reactive<{
  id?: string;
  dictType: string;
  dictLabel: string;
  dictValue: string;
  tagType: TagType;
  cssClass: string;
  sort: number;
  isDefault: CommonStatus;
  status: CommonStatus;
  remark: string;
}>({
  id: undefined,
  dictType: '',
  dictLabel: '',
  dictValue: '',
  tagType: '',
  cssClass: '',
  sort: 0,
  isDefault: 0,
  status: 0,
  remark: '',
});

const previewKey = computed<string>(() => form.dictValue.trim() || '__preview__');

const previewOptions = computed<DictItem[]>(() => [
  {
    label: form.dictLabel.trim() || '预览标签效果',
    value: previewKey.value,
    tagType: normalizeTagType(form.tagType),
    cssClass: form.cssClass.trim() || undefined,
  },
]);

const formRules: FormRules = {
  dictLabel: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (trimmed.length < 1 || trimmed.length > 64) {
          callback(new Error('字典标签长度须在 1~64 个字符之间'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  dictValue: [
    {
      required: true,
      validator: (_rule, value: string, callback) => {
        const trimmed = (value ?? '').trim();
        if (trimmed.length < 1 || trimmed.length > 64) {
          callback(new Error('字典键值长度须在 1~64 个字符之间'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  cssClass: [
    {
      validator: (_rule, value: string, callback) => {
        if ((value ?? '').trim().length > 100) {
          callback(new Error('自定义样式类名长度不能超过 100 个字符'));
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
  form.dictType = props.dictType;
  form.dictLabel = '';
  form.dictValue = '';
  form.tagType = '';
  form.cssClass = '';
  form.sort = 0;
  form.isDefault = 0;
  form.status = 0;
  form.remark = '';
}

async function loadDialogData(): Promise<void> {
  resetFormState();
  if (props.mode === 'edit' && props.dictDataId) {
    const targetId = props.dictDataId;
    await runDetailLoad({
      loader: () => withDictPreload(['commonStatus'], () => getDictDataDetail(targetId)),
      onLoaded: detail => {
        form.id = detail.id;
        form.dictType = detail.dictType;
        form.dictLabel = detail.dictLabel;
        form.dictValue = detail.dictValue;
        form.tagType = normalizeTagType(detail.tagType) ?? '';
        form.cssClass = detail.cssClass ?? '';
        form.sort = detail.sort ?? 0;
        form.isDefault = detail.isDefault;
        form.status = detail.status;
        form.remark = detail.remark ?? '';
      },
      errorFallback: '加载字典数据详情失败，请关闭重试',
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
  const payload: DictDataSaveRequest = {
    id: props.mode === 'edit' ? form.id : undefined,
    dictType: form.dictType.trim() || props.dictType,
    dictLabel: form.dictLabel.trim(),
    dictValue: form.dictValue.trim(),
    tagType: form.tagType,
    cssClass: form.cssClass.trim() || null,
    sort: Number(form.sort) || 0,
    isDefault: form.isDefault,
    status: form.status,
    remark: form.remark.trim() || null,
  };

  try {
    if (props.mode === 'edit') {
      await updateDictData(payload);
      ElMessage.success(`已保存字典项【${payload.dictLabel}】`);
    } else {
      await createDictData(payload);
      ElMessage.success(`已新增字典项【${payload.dictLabel}】`);
    }
    DictManager.clearCache(payload.dictType);
    emit('saved', payload.dictType);
    return true;
  } catch (error) {
    recordSubmitError(error, '保存字典数据失败，请核对后重试');
    return false;
  }
}
</script>

<template>
  <AtengDialog
    v-model="visible"
    :title="mode === 'edit' ? '编辑字典数据' : '新增字典数据'"
    width="520px"
    confirm-text="保存字典数据"
    :form-ref="formRef"
    :show-confirm="!detailLoadFailed && detailReady"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
    @closed="resetFormState"
  >
    <div class="flex flex-col gap-3">
      <FormErrorBanner :message="submitError" test-id="dict-data-form-error" />

      <el-skeleton v-if="mode === 'edit' && !detailReady && !detailLoadFailed" :rows="6" animated />

      <div v-else class="flex flex-col gap-3">
        <div
          data-testid="dict-data-preview"
          class="flex items-center justify-between rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle px-3 py-2"
        >
          <span class="text-xs font-medium text-ink-secondary">样式实时预览</span>
          <AtengDictTag :options="previewOptions" :value="previewKey" />
        </div>

        <el-form
          ref="formRef"
          v-loading="detailLoading"
          :model="form"
          :rules="formRules"
          :validate-on-rule-change="false"
          label-width="92px"
        >
        <el-form-item label="字典类型">
          <el-input :model-value="form.dictType" disabled class="font-mono-data" />
        </el-form-item>

        <el-form-item label="字典标签" prop="dictLabel">
          <el-input
            v-model="form.dictLabel"
            data-testid="dict-data-form-label"
            maxlength="64"
            clearable
            placeholder="例如 男 / 正常 / 启用"
          />
        </el-form-item>

        <el-form-item label="字典键值" prop="dictValue">
          <el-input
            v-model="form.dictValue"
            data-testid="dict-data-form-value"
            maxlength="64"
            clearable
            class="font-mono-data"
            placeholder="例如 0 / Y / PENDING"
          />
        </el-form-item>

        <el-form-item for="" label="回显样式" prop="tagType">
          <el-radio-group v-model="form.tagType" data-testid="dict-data-form-tag-type">
            <el-radio v-for="opt in TAG_TYPE_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="扩展类名" prop="cssClass">
          <el-input
            v-model="form.cssClass"
            data-testid="dict-data-form-css"
            maxlength="100"
            clearable
            class="font-mono-data"
            placeholder="可选自定义 CSS 类名"
          />
        </el-form-item>

        <el-form-item label="显示排序" prop="sort">
          <el-input-number
            v-model="form.sort"
            data-testid="dict-data-form-sort"
            :min="0"
            :max="9999"
            controls-position="right"
            class="!w-full tabular-nums"
          />
        </el-form-item>

        <el-form-item label="默认选项" prop="isDefault">
          <div class="flex flex-col gap-1">
            <el-switch
              v-model="form.isDefault"
              data-testid="dict-data-form-default"
              :active-value="1"
              :inactive-value="0"
              inline-prompt
              active-text="默认"
              inactive-text="否"
            />
            <span class="text-xs text-ink-muted">
              同一字典类型下仅允许一个默认项，开启后保存时将自动取消同类型其他默认项
            </span>
          </div>
        </el-form-item>

        <el-form-item for="" label="状态" prop="status">
          <AtengDictRadio v-model="form.status" dict-code="commonStatus" value-type="number" />
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            data-testid="dict-data-form-remark"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="可选填写该字典项业务含义"
          />
        </el-form-item>
      </el-form>
      </div>
    </div>
  </AtengDialog>
</template>

<style scoped></style>
