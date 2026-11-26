<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElForm, ElFormItem, ElMessage, ElSkeleton, ElTree, type FormInstance } from 'element-plus';
import { AtengDialog, AtengDictSelect } from '@atengk/element-plus';
import { getDeptOptions, type DeptTreeVO } from '@/api/system/dept';
import {
  getRoleDetail,
  updateRoleDataScope,
  type DataScopeValue,
  type RoleDataScopeRequest,
} from '@/api/system/role';
import FormErrorBanner from '@/components/FormErrorBanner.vue';
import TreeSelectionToolbar from '@/components/TreeSelectionToolbar.vue';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import { withDictPreload } from '@/utils/dict';
import {
  collectTreeNodeIds,
  DATA_SCOPE_CUSTOM,
  normalizeUniqueIds,
  validateCustomDataScope,
} from '@/views/system/role/roleHelper';

/**
 * 角色 5 级 @DataScope 数据权限分配弹窗（520px）：
 * 仅当选择 CUSTOM（2）自定部门权限时动态展示部门权限树并在树上方强校验至少勾选 1 个部门。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'RoleDataScopeDialog' });

const props = defineProps<{
  /** 弹窗显示状态（v-model）。 */
  modelValue: boolean;
  /** 目标角色主键。 */
  roleId?: string;
}>();

const emit = defineEmits<{
  /** 弹窗显示状态更新事件。 */
  (e: 'update:modelValue', value: boolean): void;
  /** 数据权限保存成功通知事件。 */
  (e: 'saved'): void;
}>();

const visible = computed<boolean>({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

const formRef = ref<FormInstance>();
const deptTreeRef = ref<InstanceType<typeof ElTree>>();
const {
  detailLoading,
  detailLoadFailed,
  detailReady,
  submitError,
  resetDialogState,
  recordSubmitError,
  runDetailLoad,
} = useDetailDialogState();

const deptTreeOptions = ref<DeptTreeVO[]>([]);
const cachedCustomDeptIds = ref<string[]>([]);
const treeValidationError = ref<string>('');
const treeExpandedAll = ref<boolean>(true);
const treeAllSelected = ref<boolean>(false);
const treeRenderKey = ref<number>(0);

const form = reactive<{
  id: string;
  roleName: string;
  roleKey: string;
  dataScope: DataScopeValue;
  deptCheckStrictly: boolean;
}>({
  id: '',
  roleName: '',
  roleKey: '',
  dataScope: 1,
  deptCheckStrictly: false,
});

const allDeptIds = computed<string[]>(() => collectTreeNodeIds(deptTreeOptions.value));

function resetState(): void {
  resetDialogState();
  form.id = '';
  form.roleName = '';
  form.roleKey = '';
  form.dataScope = 1;
  form.deptCheckStrictly = false;
  deptTreeOptions.value = [];
  cachedCustomDeptIds.value = [];
  treeValidationError.value = '';
  treeExpandedAll.value = true;
  treeAllSelected.value = false;
}

function readCurrentDeptIds(): string[] {
  return normalizeUniqueIds((deptTreeRef.value?.getCheckedKeys(false) ?? []).map(String));
}

async function handleToggleExpandAll(): Promise<void> {
  const preserved = readCurrentDeptIds();
  treeExpandedAll.value = !treeExpandedAll.value;
  treeRenderKey.value += 1;
  await nextTick();
  deptTreeRef.value?.setCheckedKeys(preserved);
}

function handleToggleSelectAll(): void {
  const nextSelected = !treeAllSelected.value;
  treeAllSelected.value = nextSelected;
  treeValidationError.value = '';
  deptTreeRef.value?.setCheckedKeys(nextSelected ? allDeptIds.value : []);
}

async function syncDeptTreeSelection(): Promise<void> {
  await nextTick();
  if (form.dataScope === DATA_SCOPE_CUSTOM && deptTreeRef.value) {
    deptTreeRef.value.setCheckedKeys(cachedCustomDeptIds.value);
  }
}

watch(
  () => form.dataScope,
  async (nextScope, prevScope) => {
    if (prevScope === DATA_SCOPE_CUSTOM && deptTreeRef.value) {
      cachedCustomDeptIds.value = readCurrentDeptIds();
    }
    treeValidationError.value = '';
    submitError.value = '';
    if (nextScope === DATA_SCOPE_CUSTOM) {
      await syncDeptTreeSelection();
    }
  },
);

async function loadDialogData(): Promise<void> {
  resetState();
  if (!props.roleId) {
    return;
  }
  const targetId = props.roleId;
  await runDetailLoad({
    loader: () =>
      withDictPreload(
        ['dataScopeType'],
        () => Promise.all([getDeptOptions(), getRoleDetail(targetId)] as const),
      ),
    onLoaded: ([depts, detail]) => {
      deptTreeOptions.value = depts;
      form.id = detail.id;
      form.roleName = detail.roleName;
      form.roleKey = detail.roleKey;
      form.dataScope = detail.dataScope;
      form.deptCheckStrictly = Boolean(detail.deptCheckStrictly);
      cachedCustomDeptIds.value = normalizeUniqueIds(detail.deptIds);
    },
    errorFallback: '加载角色数据权限失败，请关闭重试',
  });

  await syncDeptTreeSelection();
}

watch(
  () => props.modelValue,
  opened => {
    if (opened) {
      void loadDialogData();
    }
  },
);

function handleDeptCheckChange(): void {
  if (treeValidationError.value && readCurrentDeptIds().length > 0) {
    treeValidationError.value = '';
  }
}

async function handleBeforeConfirm(): Promise<boolean> {
  if (detailLoading.value || detailLoadFailed.value || !form.id) {
    return false;
  }
  submitError.value = '';
  treeValidationError.value = '';

  const deptIds = form.dataScope === DATA_SCOPE_CUSTOM ? readCurrentDeptIds() : [];
  const validationError = validateCustomDataScope(form.dataScope, deptIds);
  if (validationError) {
    treeValidationError.value = validationError;
    return false;
  }

  const payload: RoleDataScopeRequest = {
    dataScope: form.dataScope,
    deptCheckStrictly: form.deptCheckStrictly,
    deptIds: form.dataScope === DATA_SCOPE_CUSTOM ? deptIds : [],
  };

  try {
    await updateRoleDataScope(form.id, payload);
    ElMessage.success(`已更新角色【${form.roleName}】的数据权限`);
    emit('saved');
    return true;
  } catch (error) {
    recordSubmitError(error, '分配角色数据权限失败，请稍后重试');
    return false;
  }
}
</script>

<template>
  <AtengDialog
    v-model="visible"
    title="分配数据权限"
    width="520px"
    confirm-text="保存权限"
    :show-confirm="!detailLoadFailed && detailReady"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
    @closed="resetState"
  >
    <div class="flex flex-col gap-3">
      <FormErrorBanner :message="submitError" test-id="role-data-scope-api-error" />

      <el-skeleton v-if="!detailReady && !detailLoadFailed" :rows="4" animated />

      <el-form v-else ref="formRef" v-loading="detailLoading" :model="form" label-width="88px">
        <el-form-item label="角色名称">
          <span class="font-medium text-ink">{{ form.roleName || '--' }}</span>
        </el-form-item>

        <el-form-item label="角色编码">
          <span class="font-mono-data text-ink-secondary">{{ form.roleKey || '--' }}</span>
        </el-form-item>

        <el-form-item label="权限范围" prop="dataScope">
          <AtengDictSelect
            v-model="form.dataScope"
            data-testid="role-data-scope-select"
            dict-code="dataScopeType"
            value-type="number"
            :clearable="false"
            placeholder="请选择数据权限范围"
            class="w-full"
          />
        </el-form-item>

        <el-form-item v-if="form.dataScope === DATA_SCOPE_CUSTOM" label="自定部门">
          <div class="flex w-full flex-col gap-2">
            <TreeSelectionToolbar
              v-model:strictly="form.deptCheckStrictly"
              :expanded-all="treeExpandedAll"
              :all-selected="treeAllSelected"
              test-id-prefix="role-dept"
              @toggle-expand="handleToggleExpandAll"
              @toggle-select-all="handleToggleSelectAll"
            />

            <FormErrorBanner :message="treeValidationError" test-id="role-data-scope-error" />

            <div
              class="max-h-[240px] overflow-y-auto rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle p-2"
            >
              <el-tree
                :key="treeRenderKey"
                ref="deptTreeRef"
                data-testid="role-data-scope-dept-tree"
                :data="deptTreeOptions"
                node-key="id"
                show-checkbox
                :default-expand-all="treeExpandedAll"
                :check-strictly="!form.deptCheckStrictly"
                :props="{ label: 'deptName', children: 'children' }"
                empty-text="暂无可用部门节点"
                @check="handleDeptCheckChange"
              />
            </div>
          </div>
        </el-form-item>
      </el-form>
    </div>
  </AtengDialog>
</template>

<style scoped></style>
