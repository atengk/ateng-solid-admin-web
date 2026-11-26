<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElSkeleton,
  ElTag,
  ElTree,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { AtengDictRadio, AtengDrawer } from '@atengk/element-plus';
import type { MenuTreeVO } from '@/api/system/menu';
import {
  createRole,
  getRoleDetail,
  getRoleGrantableMenuTree,
  updateRole,
  type RoleSaveRequest,
} from '@/api/system/role';
import type { CommonStatus } from '@/api/types';
import FormErrorBanner from '@/components/FormErrorBanner.vue';
import TreeSelectionToolbar from '@/components/TreeSelectionToolbar.vue';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import { withDictPreload } from '@/utils/dict';
import {
  buildRoleFormRules,
  collectSubmittedMenuIds,
  collectTreeNodeIds,
  resolveInitialCheckedMenuKeys,
} from '@/views/system/role/roleHelper';

/**
 * 角色新增/编辑表单抽屉（540px）：
 * 对接当前租户套餐收敛后的可授权菜单树，实现展开/全选/父子联动控制、联动切换态重算与叶子节点精确回显。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'RoleFormDrawer' });

const props = defineProps<{
  /** 抽屉显示状态（v-model）。 */
  modelValue: boolean;
  /** 操作模式（新增或编辑）。 */
  mode: 'create' | 'edit';
  /** 编辑模式下的目标角色主键。 */
  roleId?: string;
}>();

const emit = defineEmits<{
  /** 抽屉显示状态更新事件。 */
  (e: 'update:modelValue', value: boolean): void;
  /** 角色保存成功通知事件。 */
  (e: 'saved'): void;
}>();

const visible = computed<boolean>({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

const formRef = ref<FormInstance>();
const menuTreeRef = ref<InstanceType<typeof ElTree>>();
const {
  detailLoading,
  detailLoadFailed,
  detailReady,
  submitError,
  resetDialogState,
  recordSubmitError,
  runDetailLoad,
} = useDetailDialogState();

const grantableMenuTree = ref<MenuTreeVO[]>([]);
const treeExpandedAll = ref<boolean>(true);
const treeAllSelected = ref<boolean>(false);
const treeRenderKey = ref<number>(0);

const form = reactive<{
  id?: string;
  roleName: string;
  roleKey: string;
  sort: number;
  status: CommonStatus;
  menuCheckStrictly: boolean;
  remark: string;
}>({
  id: undefined,
  roleName: '',
  roleKey: '',
  sort: 0,
  status: 0,
  menuCheckStrictly: true,
  remark: '',
});

const allMenuIds = computed<string[]>(() => collectTreeNodeIds(grantableMenuTree.value));
const formRules: FormRules = buildRoleFormRules();

function resetFormState(): void {
  resetDialogState();
  form.id = undefined;
  form.roleName = '';
  form.roleKey = '';
  form.sort = 0;
  form.status = 0;
  form.menuCheckStrictly = true;
  form.remark = '';
  grantableMenuTree.value = [];
  treeExpandedAll.value = true;
  treeAllSelected.value = false;
  menuTreeRef.value?.setCheckedKeys([]);
}

function readCurrentSubmittedMenuIds(linked: boolean): string[] {
  const checked = (menuTreeRef.value?.getCheckedKeys(false) ?? []).map(String);
  const halfChecked = (menuTreeRef.value?.getHalfCheckedKeys() ?? []).map(String);
  return collectSubmittedMenuIds(checked, halfChecked, linked);
}

async function handleToggleExpandAll(): Promise<void> {
  // 切换前先保留当前勾选集，再通过公共 default-expand-all + key 重建展开态
  const preservedIds = readCurrentSubmittedMenuIds(form.menuCheckStrictly);
  treeExpandedAll.value = !treeExpandedAll.value;
  treeRenderKey.value += 1;
  await nextTick();
  menuTreeRef.value?.setCheckedKeys(
    resolveInitialCheckedMenuKeys(grantableMenuTree.value, preservedIds, form.menuCheckStrictly),
  );
}

function handleToggleSelectAll(): void {
  const nextSelected = !treeAllSelected.value;
  treeAllSelected.value = nextSelected;
  menuTreeRef.value?.setCheckedKeys(nextSelected ? allMenuIds.value : []);
}

async function handleMenuStrictlyChange(nextLinked: boolean): Promise<void> {
  // 切换联动开关时，按切换前模式收拢完整已选集合，再重算回显入新模式防止丢失半选父目录或误全选兄弟
  const preservedIds = readCurrentSubmittedMenuIds(!nextLinked);
  await nextTick();
  menuTreeRef.value?.setCheckedKeys(
    resolveInitialCheckedMenuKeys(grantableMenuTree.value, preservedIds, nextLinked),
  );
}

async function loadDrawerData(): Promise<void> {
  resetFormState();
  let boundMenuIds: string[] = [];

  await runDetailLoad({
    loader: () =>
      withDictPreload(['commonStatus'], async () => {
        if (props.mode === 'edit' && props.roleId) {
          return Promise.all([getRoleGrantableMenuTree(), getRoleDetail(props.roleId)] as const);
        }
        const tree = await getRoleGrantableMenuTree();
        return [tree, null] as const;
      }),
    onLoaded: ([tree, detail]) => {
      grantableMenuTree.value = tree;
      if (detail) {
        form.id = detail.id;
        form.roleName = detail.roleName;
        form.roleKey = detail.roleKey;
        form.sort = detail.sort ?? 0;
        form.status = detail.status;
        form.menuCheckStrictly = Boolean(detail.menuCheckStrictly);
        form.remark = detail.remark ?? '';
        boundMenuIds = detail.menuIds;
      }
    },
    errorFallback: '加载角色信息失败，请关闭重试',
  });

  await nextTick();
  const initialKeys = resolveInitialCheckedMenuKeys(
    grantableMenuTree.value,
    boundMenuIds,
    form.menuCheckStrictly,
  );
  menuTreeRef.value?.setCheckedKeys(initialKeys);
  formRef.value?.clearValidate();
}

watch(
  () => props.modelValue,
  opened => {
    if (opened) {
      void loadDrawerData();
    }
  },
);

async function handleBeforeConfirm(): Promise<boolean> {
  if (detailLoading.value || detailLoadFailed.value) {
    return false;
  }
  submitError.value = '';
  const payload: RoleSaveRequest = {
    id: props.mode === 'edit' ? form.id : undefined,
    roleName: form.roleName.trim(),
    roleKey: form.roleKey.trim(),
    sort: Number(form.sort) || 0,
    status: form.status,
    menuCheckStrictly: form.menuCheckStrictly,
    remark: form.remark.trim() || null,
    menuIds: readCurrentSubmittedMenuIds(form.menuCheckStrictly),
  };

  try {
    if (props.mode === 'edit') {
      await updateRole(payload);
      ElMessage.success(`已保存角色【${payload.roleName}】`);
    } else {
      await createRole(payload);
      ElMessage.success(`已新增角色【${payload.roleName}】`);
    }
    emit('saved');
    return true;
  } catch (error) {
    recordSubmitError(error, '保存角色失败，请核对后重试');
    return false;
  }
}
</script>

<template>
  <AtengDrawer
    v-model="visible"
    :title="mode === 'edit' ? '编辑角色' : '新增角色'"
    size="540px"
    confirm-text="保存角色"
    :form-ref="formRef"
    :show-confirm="!detailLoadFailed && detailReady"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
    @closed="resetFormState"
  >
    <div class="flex flex-col gap-3">
      <FormErrorBanner :message="submitError" test-id="role-form-error" />

      <el-skeleton v-if="!detailReady && !detailLoadFailed" :rows="6" animated />

      <el-form
        v-else
        ref="formRef"
        v-loading="detailLoading"
        :model="form"
        :rules="formRules"
        :validate-on-rule-change="false"
        label-width="88px"
      >
        <el-form-item label="角色名称" prop="roleName">
          <el-input
            v-model="form.roleName"
            data-testid="role-form-name"
            maxlength="50"
            clearable
            placeholder="请输入 2~50 个字符"
          />
        </el-form-item>

        <el-form-item label="角色编码" prop="roleKey">
          <el-input
            v-model="form.roleKey"
            data-testid="role-form-key"
            maxlength="64"
            clearable
            class="font-mono-data"
            placeholder="例如 dept_manager（禁填 super_admin / admin）"
          />
        </el-form-item>

        <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <el-form-item label="显示排序" prop="sort">
            <el-input-number
              v-model="form.sort"
              data-testid="role-form-sort"
              :min="0"
              :max="9999"
              controls-position="right"
              class="role-sort-input tabular-nums"
            />
          </el-form-item>

          <el-form-item for="" label="角色状态" prop="status">
            <AtengDictRadio v-model="form.status" dict-code="commonStatus" value-type="number" />
          </el-form-item>
        </div>

        <el-form-item label="菜单权限">
          <div class="flex w-full flex-col gap-2">
            <TreeSelectionToolbar
              v-model:strictly="form.menuCheckStrictly"
              :expanded-all="treeExpandedAll"
              :all-selected="treeAllSelected"
              test-id-prefix="role-menu"
              @toggle-expand="handleToggleExpandAll"
              @toggle-select-all="handleToggleSelectAll"
              @strictly-change="handleMenuStrictlyChange"
            />

            <div
              class="max-h-[280px] overflow-y-auto rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle p-2"
            >
              <!-- Element Plus check-strictly=true 表示父子不联动，与后端 menuCheckStrictly=true（联动态）语义取反 -->
              <el-tree
                :key="treeRenderKey"
                ref="menuTreeRef"
                data-testid="role-form-menu-tree"
                :data="grantableMenuTree"
                node-key="id"
                show-checkbox
                :default-expand-all="treeExpandedAll"
                :check-strictly="!form.menuCheckStrictly"
                :props="{ label: 'title', children: 'children' }"
                empty-text="暂无可授权菜单"
              >
                <template #default="{ data }">
                  <div class="flex items-center gap-1.5 text-xs">
                    <span class="text-ink">{{ data.title }}</span>
                    <el-tag
                      v-if="data.menuType"
                      size="small"
                      :type="
                        data.menuType === 'M'
                          ? 'primary'
                          : data.menuType === 'C'
                            ? 'success'
                            : 'info'
                      "
                    >
                      {{ data.menuType }}
                    </el-tag>
                  </div>
                </template>
              </el-tree>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="备注" prop="remark">
          <el-input
            v-model="form.remark"
            data-testid="role-form-remark"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="可选填写角色职责与授权范围说明"
          />
        </el-form-item>
      </el-form>
    </div>
  </AtengDrawer>
</template>

<style scoped>
.role-sort-input {
  width: 100%;
}
</style>
