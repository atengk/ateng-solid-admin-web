<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElButton, ElIcon, ElMessage, type UploadRequestOptions } from 'element-plus';
import { Download, UploadFilled } from '@element-plus/icons-vue';
import { AtengDialog, AtengExcelFeedback, AtengUpload } from '@atengk/element-plus';
import {
  downloadImportFeedback,
  downloadUserImportTemplate,
  importUsers,
  type ImportErrorVO,
} from '@/api/system/user';
import FormErrorBanner from '@/components/FormErrorBanner.vue';
import {
  isGlobalHandledHttpError,
  resolveContextualErrorMessage,
  resolveErrorMessage,
} from '@/utils/http';
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from '@/views/system/user/userHelper';

/**
 * 用户 Excel 批量导入弹窗（560px）与 Fesod 标红批注反馈弹窗（AtengExcelFeedback 720px）：
 * 强制通过 adminHttpClient（timeout: 120_000）执行整批原子导入，失败时展示行级明细并优先遵循响应头动态文件名下载批注。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'UserImportDialog' });

const props = defineProps<{
  /** 导入上传弹窗显示状态（v-model）。 */
  modelValue: boolean;
}>();

const emit = defineEmits<{
  /** 导入上传弹窗显示状态更新事件。 */
  (e: 'update:modelValue', value: boolean): void;
  /** 批量导入成功入库通知事件。 */
  (e: 'imported'): void;
}>();

const visible = computed<boolean>({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

const uploading = ref<boolean>(false);
const templateDownloading = ref<boolean>(false);
const uploadError = ref<string>('');

const feedbackVisible = ref<boolean>(false);
const feedbackTotalCount = ref<number>(0);
const feedbackErrors = ref<ImportErrorVO[]>([]);
const feedbackToken = ref<string>('');

const feedbackTitle = computed<string>(
  () =>
    `导入校验失败（共解析 ${feedbackTotalCount.value} 行，校验失败 ${feedbackErrors.value.length} 条）`,
);

watch(
  () => props.modelValue,
  opened => {
    if (opened) {
      uploadError.value = '';
    }
  },
);

function clearFeedbackState(): void {
  feedbackTotalCount.value = 0;
  feedbackErrors.value = [];
  feedbackToken.value = '';
}

function handleImportActionError(error: unknown, fallback: string): void {
  const message = resolveContextualErrorMessage(error, fallback);
  uploadError.value = message;
  if (!isGlobalHandledHttpError(error)) {
    ElMessage.error(message);
  }
}

async function handleDownloadTemplate(): Promise<void> {
  if (templateDownloading.value) {
    return;
  }
  templateDownloading.value = true;
  uploadError.value = '';
  try {
    await downloadUserImportTemplate();
  } catch (error) {
    handleImportActionError(error, '下载导入模板失败，请稍后重试');
  } finally {
    templateDownloading.value = false;
  }
}

function handleUploadTypeReject(): void {
  uploadError.value = '仅支持上传 .xlsx 格式的 Excel 工作簿';
}

function handleUploadSizeExceed(): void {
  uploadError.value = '上传文件体积不能超过 2MB';
}

async function handleImportRequest(options: UploadRequestOptions): Promise<unknown> {
  uploading.value = true;
  uploadError.value = '';
  try {
    const result = await importUsers(options.file);
    if (result.failCount > 0) {
      feedbackTotalCount.value = result.totalCount;
      feedbackErrors.value = result.errors;
      feedbackToken.value = result.feedbackToken ?? '';
      visible.value = false;
      feedbackVisible.value = true;
      return result;
    }

    ElMessage.success(`已成功批量导入 ${result.successCount} 条用户数据`);
    visible.value = false;
    emit('imported');
    return result;
  } catch (error) {
    handleImportActionError(error, '批量导入用户失败，请核对模板表头及行数限制');
    throw error;
  } finally {
    uploading.value = false;
  }
}

async function downloadFeedbackBlob(): Promise<Blob> {
  return downloadImportFeedback(feedbackToken.value);
}

function handleFeedbackDownloadError(error: unknown): void {
  const message = resolveErrorMessage(error, '批注文件已过期或无权下载，请重新执行导入');
  if (!isGlobalHandledHttpError(error)) {
    ElMessage.error(message);
  }
}
</script>

<template>
  <AtengDialog
    v-model="visible"
    title="批量导入用户"
    width="560px"
    :show-confirm="false"
    cancel-text="关闭"
    @closed="uploadError = ''"
  >
    <div class="flex flex-col gap-3">
      <div
        class="flex flex-wrap items-center justify-between gap-2 rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle px-3 py-2.5 text-xs leading-relaxed text-ink-regular"
      >
        <span>
          最多支持 {{ IMPORT_MAX_ROWS }} 行 · 文件不超过 2MB（仅 `.xlsx`）· 统一预置默认密码 ·
          任一行校验失败整批不入库
        </span>
        <el-button
          data-testid="user-import-template-btn"
          type="primary"
          link
          size="small"
          :icon="Download"
          :loading="templateDownloading"
          @click="handleDownloadTemplate"
        >
          下载导入模板
        </el-button>
      </div>

      <FormErrorBanner :message="uploadError" test-id="user-import-error" />

      <AtengUpload
        data-testid="user-import-upload"
        :chunk="false"
        drag
        accept=".xlsx"
        :max-size="IMPORT_MAX_BYTES"
        :show-file-list="false"
        :disabled="uploading"
        :http-request="handleImportRequest"
        @type-reject="handleUploadTypeReject"
        @size-exceed="handleUploadSizeExceed"
      >
        <div class="flex flex-col items-center justify-center gap-2 py-6 text-center">
          <el-icon :size="36" class="text-brand"><UploadFilled /></el-icon>
          <p class="m-0 text-sm font-medium text-ink">
            {{ uploading ? '正在校验并并行导入，请耐心等待...' : '将 .xlsx 文件拖到此处，或点击选取文件' }}
          </p>
          <p class="m-0 text-xs text-ink-muted">
            支持 9 列标准用户模板（单次最多 {{ IMPORT_MAX_ROWS }} 行）
          </p>
        </div>
      </AtengUpload>
    </div>
  </AtengDialog>

  <AtengExcelFeedback
    v-model="feedbackVisible"
    :title="feedbackTitle"
    width="720px"
    :errors="feedbackErrors"
    :download-action="feedbackToken ? downloadFeedbackBlob : undefined"
    csv-file-name="用户导入错误清单.csv"
    download-text="下载标红批注 Excel"
    :page-size="10"
    :allow-csv-fallback="true"
    @download-error="handleFeedbackDownloadError"
    @closed="clearFeedbackState"
  />
</template>

<style scoped></style>
