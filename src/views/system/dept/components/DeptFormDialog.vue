<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElSkeleton,
  ElTag,
  ElTreeSelect,
  type FormInstance,
  type FormRules,
} from 'element-plus';
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
import FormErrorBanner from '@/components/FormErrorBanner.vue';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import { withDictPreload } from '@/utils/dict';
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
  /**
   * 父视图已加载的全量部门树（非空时免重复拉取）。
   */
  deptTree?: DeptTreeVO[];
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
const leaderLoading = ref<boolean>(false);
const fullDeptTree = ref<DeptTreeVO[]>([]);
const leaderOptions = ref<UserOptionVO[]>([]);
const initialLeaderOptions = ref<UserOptionVO[]>([]);
const originalParentId = ref<string | undefined>(undefined);
let lastLeaderKeyword: string | null = null;
let leaderSearchSeq = 0;

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
  resetDialogState();
  form.id = undefined;
  form.parentId = props.initialParentId?.trim() || ROOT_DEPT_ID;
  form.deptName = '';
  form.sort = 0;
  form.leaderUserId = '';
  form.phone = '';
  form.email = '';
  form.status = 0;
  leaderLoading.value = false;
  leaderOptions.value = [];
  initialLeaderOptions.value = [];
  originalParentId.value = undefined;
  lastLeaderKeyword = null;
  leaderSearchSeq += 1;
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
  const normalized = keyword.trim();
  // 跳过 Element Plus 远程下拉首次展开自动触发的空串重查，保留已有预加载/已合并列表
  if (normalized === '' && lastLeaderKeyword === '') {
    return;
  }
  if (normalized === '' && initialLeaderOptions.value.length > 0) {
    leaderSearchSeq += 1;
    leaderLoading.value = false;
    leaderOptions.value = [...initialLeaderOptions.value];
    lastLeaderKeyword = '';
    return;
  }

  const seq = ++leaderSearchSeq;
  leaderLoading.value = true;
  try {
    const result = await getUserOptions(normalized || undefined);
    if (seq !== leaderSearchSeq) {
      return;
    }
    leaderOptions.value = result;
    lastLeaderKeyword = normalized;
  } catch {
    if (seq === leaderSearchSeq) {
      leaderOptions.value = [];
      lastLeaderKeyword = null;
    }
  } finally {
    if (seq === leaderSearchSeq) {
      leaderLoading.value = false;
    }
  }
}

async function loadDialogData(): Promise<void> {
  resetFormState();
  await runDetailLoad({
    loader: () =>
      withDictPreload(['commonStatus'], async () => {
        let usersLoaded = true;
        const preloadedTree = props.deptTree?.length ? props.deptTree : null;
        const [tree, users] = await Promise.all([
          preloadedTree ? Promise.resolve(preloadedTree) : getDeptTree(),
          getUserOptions().catch(() => {
            usersLoaded = false;
            return [] as UserOptionVO[];
          }),
        ]);
        const detail =
          props.mode === 'edit' && props.deptId ? await getDeptDetail(props.deptId) : null;
        return { tree, users, usersLoaded, detail };
      }),
    onLoaded: ({ tree, users, usersLoaded, detail }) => {
      fullDeptTree.value = tree;
      leaderOptions.value = users;

      if (detail) {
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

      initialLeaderOptions.value = [...leaderOptions.value];
      lastLeaderKeyword = usersLoaded ? '' : null;
    },
    errorFallback: '加载部门详情失败，请关闭重试',
  });
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
    recordSubmitError(error, '保存部门失败，请核对后重试');
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
    :show-confirm="!detailLoadFailed && detailReady"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
    @closed="resetFormState"
  >
    <div class="flex flex-col gap-3">
      <FormErrorBanner :message="submitError" test-id="dept-form-error" />

      <el-skeleton v-if="!detailReady && !detailLoadFailed" :rows="5" animated />

      <el-form
        v-else
        ref="formRef"
        v-loading="detailLoading"
        :model="form"
        :rules="formRules"
        :validate-on-rule-change="false"
        label-width="92px"
      >
        <el-form-item label="上级部门" prop="parentId">
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

        <div class="grid grid-cols-1 items-start gap-x-4 sm:grid-cols-2">
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

          <el-form-item for="" label="部门状态" prop="status">
            <AtengDictRadio v-model="form.status" dict-code="commonStatus" value-type="number" />
          </el-form-item>
        </div>

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
      </el-form>
    </div>
  </AtengDialog>
</template>
