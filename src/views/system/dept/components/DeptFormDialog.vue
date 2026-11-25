<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElTag,
  ElTreeSelect,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { Warning } from '@element-plus/icons-vue';
import { AtengDialog, AtengDictRadio } from '@atengk/element-plus';
import {
  createDept,
  getDeptDetail,
  getDeptTree,
  updateDept,
  type DeptSaveRequest,
  type DeptTreeVO,
} from '@/api/system/dept';
import { getUserOptions, type UserOptionVO } from '@/api/system/user';
import type { CommonStatus } from '@/api/types';
import { isGlobalHandledHttpError, resolveErrorMessage } from '@/utils/http';
import {
  buildDeptFormRules,
  buildDeptSelectorOptions,
  ROOT_DEPT_ID,
  type DeptSelectorOption,
} from '@/views/system/dept/deptHelper';

/**
 * 部门新增/编辑表单弹窗（640px）：
 * 维护上级部门防自环树选择、负责人远程搜索与编辑态联系字段内存真明文加载。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'DeptFormDialog' });

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
   * 编辑模式下的目标部门主键。
   */
  deptId?: string;
  /**
   * 新增下级或新建时预设的上级部门主键。
   */
  initialParentId?: string;
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
const leaderLoading = ref<boolean>(false);
const submitError = ref<string>('');
const fullDeptTree = ref<DeptTreeVO[]>([]);
const leaderOptions = ref<UserOptionVO[]>([]);
const originalParentId = ref<string | undefined>(undefined);

const form = reactive<{
  id?: string;
  parentId: string;
  deptName: string;
  sort: number;
  leaderUserId: string;
  phone: string;
  email: string;
  status: CommonStatus;
}>({
  id: undefined,
  parentId: ROOT_DEPT_ID,
  deptName: '',
  sort: 0,
  leaderUserId: '',
  phone: '',
  email: '',
  status: 0,
});

const parentTreeOptions = computed<DeptSelectorOption[]>(() =>
  buildDeptSelectorOptions(
    fullDeptTree.value,
    props.mode === 'edit' ? form.id : undefined,
    props.mode === 'edit' ? originalParentId.value : undefined,
  ),
);

const formRules: FormRules = buildDeptFormRules();

function resetFormState(): void {
  form.id = undefined;
  form.parentId = props.initialParentId?.trim() || ROOT_DEPT_ID;
  form.deptName = '';
  form.sort = 0;
  form.leaderUserId = '';
  form.phone = '';
  form.email = '';
  form.status = 0;
  originalParentId.value = undefined;
  submitError.value = '';
}

function mergeCurrentLeaderOption(
  leaderUserId?: string | null,
  nickname?: string | null,
  username?: string | null,
): void {
  if (!leaderUserId) {
    return;
  }
  if (leaderOptions.value.some(item => item.userId === leaderUserId)) {
    return;
  }
  leaderOptions.value = [
    {
      userId: leaderUserId,
      nickname: nickname?.trim() || leaderUserId,
      username: username?.trim() || '',
    },
    ...leaderOptions.value,
  ];
}

function formatUserOptionLabel(option: UserOptionVO): string {
  return option.username ? `${option.nickname} (${option.username})` : option.nickname;
}

async function handleSearchLeaders(keyword: string): Promise<void> {
  leaderLoading.value = true;
  try {
    leaderOptions.value = await getUserOptions(keyword);
  } catch {
    leaderOptions.value = [];
  } finally {
    leaderLoading.value = false;
  }
}

async function loadDialogData(): Promise<void> {
  resetFormState();
  detailLoading.value = true;
  try {
    const [tree, users] = await Promise.all([
      getDeptTree(),
      getUserOptions().catch(() => [] as UserOptionVO[]),
    ]);
    fullDeptTree.value = tree;
    leaderOptions.value = users;

    if (props.mode === 'edit' && props.deptId) {
      const detail = await getDeptDetail(props.deptId);
      form.id = detail.id;
      form.parentId = detail.parentId || ROOT_DEPT_ID;
      originalParentId.value = detail.parentId || ROOT_DEPT_ID;
      form.deptName = detail.deptName;
      form.sort = detail.sort ?? 0;
      form.leaderUserId = detail.leaderUserId ?? '';
      form.phone = detail.phone ?? '';
      form.email = detail.email ?? '';
      form.status = detail.status;
      mergeCurrentLeaderOption(detail.leaderUserId, detail.leaderNickname, detail.leaderUsername);
    }
  } catch (error) {
    const message = resolveErrorMessage(error, '加载部门详情失败，请关闭重试');
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
    } else {
      submitError.value = '';
    }
  },
);

async function handleBeforeConfirm(): Promise<boolean> {
  if (detailLoading.value) {
    return false;
  }
  submitError.value = '';
  const payload: DeptSaveRequest = {
    id: props.mode === 'edit' ? form.id : undefined,
    parentId: form.parentId || ROOT_DEPT_ID,
    deptName: form.deptName.trim(),
    sort: Number(form.sort) || 0,
    leaderUserId: form.leaderUserId.trim() || null,
    phone: form.phone.trim() || null,
    email: form.email.trim() || null,
    status: form.status,
  };

  try {
    if (props.mode === 'edit') {
      await updateDept(payload);
      ElMessage.success(`已保存部门【${payload.deptName}】`);
    } else {
      await createDept(payload);
      ElMessage.success(`已新增部门【${payload.deptName}】`);
    }
    emit('saved');
    return true;
  } catch (error) {
    const message = resolveErrorMessage(error, '保存部门失败，请核对后重试');
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
    :title="mode === 'edit' ? '编辑部门' : '新增部门'"
    width="640px"
    confirm-text="保存部门"
    :form-ref="formRef"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
  >
    <div class="flex flex-col gap-3">
      <div
        v-if="submitError"
        data-testid="dept-form-error"
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
        <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <el-form-item label="上级部门" prop="parentId" class="sm:col-span-2">
            <el-tree-select
              v-model="form.parentId"
              data-testid="dept-form-parent"
              :data="parentTreeOptions"
              node-key="id"
              :props="{ label: 'label', children: 'children', disabled: 'disabled' }"
              check-strictly
              filterable
              :render-after-expand="false"
              class="w-full"
              placeholder="请选择上级部门"
            >
              <template #default="{ data }">
                <div class="flex items-center justify-between gap-2">
                  <span>{{ data.label }}</span>
                  <el-tag v-if="data.status === 1" size="small" type="info">已停用</el-tag>
                </div>
              </template>
            </el-tree-select>
          </el-form-item>

          <el-form-item label="部门名称" prop="deptName">
            <el-input
              v-model="form.deptName"
              data-testid="dept-form-name"
              maxlength="50"
              clearable
              placeholder="请输入 2~50 个字符"
            />
          </el-form-item>

          <el-form-item label="显示排序" prop="sort">
            <el-input-number
              v-model="form.sort"
              data-testid="dept-form-sort"
              :min="0"
              :max="9999"
              controls-position="right"
              class="!w-full tabular-nums"
            />
          </el-form-item>

          <el-form-item label="部门负责人" prop="leaderUserId">
            <el-select
              v-model="form.leaderUserId"
              data-testid="dept-form-leader"
              filterable
              remote
              clearable
              reserve-keyword
              :loading="leaderLoading"
              :remote-method="handleSearchLeaders"
              placeholder="输入昵称或账号搜索"
              class="w-full"
            >
              <el-option
                v-for="item in leaderOptions"
                :key="item.userId"
                :label="formatUserOptionLabel(item)"
                :value="item.userId"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="部门状态" prop="status">
            <AtengDictRadio v-model="form.status" dict-code="commonStatus" value-type="number" />
          </el-form-item>

          <el-form-item label="联系电话" prop="phone">
            <el-input
              v-model="form.phone"
              data-testid="dept-form-phone"
              maxlength="20"
              clearable
              class="font-mono-data"
              placeholder="请输入联系电话"
            />
          </el-form-item>

          <el-form-item label="电子邮箱" prop="email">
            <el-input
              v-model="form.email"
              data-testid="dept-form-email"
              maxlength="64"
              clearable
              class="font-mono-data"
              placeholder="请输入电子邮箱"
            />
          </el-form-item>
        </div>
      </el-form>
    </div>
  </AtengDialog>
</template>
