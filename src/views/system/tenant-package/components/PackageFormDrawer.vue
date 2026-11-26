<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElAlert,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElTag,
  ElTree,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { AtengDictRadio, AtengDrawer } from '@atengk/element-plus';
import { getMenuTree, type MenuTreeVO } from '@/api/system/menu';
import {
  createTenantPackage,
  getTenantPackageDetail,
  previewPackageShrink,
  updateTenantPackage,
  type TenantPackageSaveRequest,
  type TenantPackageShrinkPreviewVO,
} from '@/api/system/tenant-package';
import FormErrorBanner from '@/components/FormErrorBanner.vue';
import TreeSelectionToolbar from '@/components/TreeSelectionToolbar.vue';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import {
  collectSubmittedMenuIds,
  collectTreeNodeIds,
  resolveInitialCheckedMenuKeys,
} from '@/views/system/role/roleHelper';
import PackageShrinkConfirmDialog from '@/views/system/tenant-package/components/PackageShrinkConfirmDialog.vue';
import {
  buildTenantPackageFormRules,
  buildTenantPackageSavePayload,
  filterPackageAssignableMenus,
  hasRemovedMenuIds,
  type TenantPackageFormState,
} from '@/views/system/tenant-package/tenantPackageHelper';

/**
 * 租户套餐新增/编辑抽屉（600px）：
 * 加载菜单树时主动过滤排除 platformOnly 与停用节点（双防线），编辑态保存检测到菜单缩减时先调用 shrink-preview 并弹出影响确认。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'PackageFormDrawer' });

const props = defineProps<{
  /** 抽屉显示状态（v-model）。 */
  modelValue: boolean;
  /** 操作模式（新增或编辑）。 */
  mode: 'create' | 'edit';
  /** 编辑模式下的目标套餐主键。 */
  packageId?: string;
}>();

const emit = defineEmits<{
  /** 抽屉显示状态更新事件。 */
  (e: 'update:modelValue', value: boolean): void;
  /** 套餐保存成功通知事件。 */
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
  submitError,
  resetDialogState,
  recordSubmitError,
  runDetailLoad,
} = useDetailDialogState();

const assignableMenuTree = ref<MenuTreeVO[]>([]);
const originalMenuIds = ref<string[]>([]);
const treeExpandedAll = ref<boolean>(true);
const treeAllSelected = ref<boolean>(false);
const treeRenderKey = ref<number>(0);

const shrinkDialogVisible = ref<boolean>(false);
const shrinkPreviewData = ref<TenantPackageShrinkPreviewVO | null>(null);
const pendingShrinkPayload = ref<TenantPackageSaveRequest | null>(null);

const form = reactive<TenantPackageFormState>({
  id: undefined,
  packageName: '',
  menuCheckStrictly: true,
  status: 0,
  remark: '',
});

const allMenuIds = computed<string[]>(() => collectTreeNodeIds(assignableMenuTree.value));
const formRules: FormRules = buildTenantPackageFormRules();

function resetShrinkState(): void {
  shrinkDialogVisible.value = false;
  shrinkPreviewData.value = null;
  pendingShrinkPayload.value = null;
}

function resetFormState(): void {
  resetDialogState();
  resetShrinkState();
  Object.assign(form, {
    id: undefined,
    packageName: '',
    menuCheckStrictly: true,
    status: 0,
    remark: '',
  });
  assignableMenuTree.value = [];
  originalMenuIds.value = [];
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
  const preservedIds = readCurrentSubmittedMenuIds(form.menuCheckStrictly);
  treeExpandedAll.value = !treeExpandedAll.value;
  treeRenderKey.value += 1;
  await nextTick();
  menuTreeRef.value?.setCheckedKeys(
    resolveInitialCheckedMenuKeys(assignableMenuTree.value, preservedIds, form.menuCheckStrictly),
  );
}

function handleToggleSelectAll(): void {
  const nextSelected = !treeAllSelected.value;
  treeAllSelected.value = nextSelected;
  menuTreeRef.value?.setCheckedKeys(nextSelected ? allMenuIds.value : []);
}

async function handleMenuStrictlyChange(nextLinked: boolean): Promise<void> {
  const preservedIds = readCurrentSubmittedMenuIds(!nextLinked);
  await nextTick();
  menuTreeRef.value?.setCheckedKeys(
    resolveInitialCheckedMenuKeys(assignableMenuTree.value, preservedIds, nextLinked),
  );
}

async function loadDrawerData(): Promise<void> {
  resetFormState();
  let boundMenuIds: string[] = [];

  await runDetailLoad({
    loader: async () => {
      if (props.mode === 'edit' && props.packageId) {
        return Promise.all([
          getMenuTree({ platformOnly: false, status: 0 }),
          getTenantPackageDetail(props.packageId),
        ] as const);
      }
      const tree = await getMenuTree({ platformOnly: false, status: 0 });
      return [tree, null] as const;
    },
    onLoaded: ([rawTree, detail]) => {
      assignableMenuTree.value = filterPackageAssignableMenus(rawTree);
      if (detail) {
        form.id = detail.id;
        form.packageName = detail.packageName;
        form.menuCheckStrictly = Boolean(detail.menuCheckStrictly);
        form.status = detail.status;
        form.remark = detail.remark ?? '';
        boundMenuIds = detail.menuIds;
        originalMenuIds.value = [...detail.menuIds];
      }
    },
    errorFallback: '加载租户套餐信息失败，请关闭重试',
  });

  await nextTick();
  const initialKeys = resolveInitialCheckedMenuKeys(
    assignableMenuTree.value,
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

async function executePendingShrinkSave(): Promise<boolean> {
  const payload = pendingShrinkPayload.value;
  if (!payload) {
    return false;
  }
  try {
    await updateTenantPackage(payload);
    ElMessage.success(`已保存租户套餐【${payload.packageName}】，并同步裁剪关联租户越界权限`);
    resetShrinkState();
    visible.value = false;
    emit('saved');
    return true;
  } catch (error) {
    recordSubmitError(error, '保存租户套餐失败，请核对后重试');
    resetShrinkState();
    return false;
  }
}

async function handleBeforeConfirm(): Promise<boolean> {
  if (detailLoading.value || detailLoadFailed.value) {
    return false;
  }
  submitError.value = '';
  const selectedMenuIds = readCurrentSubmittedMenuIds(form.menuCheckStrictly);
  const payload = buildTenantPackageSavePayload(props.mode, form, selectedMenuIds);

  try {
    if (props.mode === 'create') {
      await createTenantPackage(payload);
      ElMessage.success(`已新增租户套餐【${payload.packageName}】`);
      emit('saved');
      return true;
    }

    if (form.id && hasRemovedMenuIds(originalMenuIds.value, payload.menuIds ?? [])) {
      const preview = await previewPackageShrink({
        packageId: form.id,
        newMenuIds: payload.menuIds ?? [],
      });
      if (preview.affectedTenantCount > 0 || preview.affectedTenants.length > 0) {
        pendingShrinkPayload.value = payload;
        shrinkPreviewData.value = preview;
        shrinkDialogVisible.value = true;
        return false;
      }
    }

    await updateTenantPackage(payload);
    ElMessage.success(`已保存租户套餐【${payload.packageName}】`);
    emit('saved');
    return true;
  } catch (error) {
    recordSubmitError(error, '保存租户套餐失败，请核对后重试');
    return false;
  }
}
</script>

<template>
  <AtengDrawer
    v-model="visible"
    :title="mode === 'edit' ? '编辑租户套餐' : '新增租户套餐'"
    size="720px"
    confirm-text="保存套餐"
    :form-ref="formRef"
    :show-confirm="!detailLoadFailed"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
    @closed="resetFormState"
  >
    <div class="flex flex-col gap-3">
      <FormErrorBanner :message="submitError" test-id="pkg-form-error" />

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="已自动排除平台专属菜单（租户管理、租户套餐、菜单管理、数据字典）及停用节点"
      />

      <el-form
        ref="formRef"
        v-loading="detailLoading"
        :model="form"
        :rules="formRules"
        :validate-on-rule-change="false"
        label-width="88px"
      >
        <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <el-form-item label="套餐名称" prop="packageName">
            <el-input
              v-model="form.packageName"
              data-testid="pkg-form-name"
              maxlength="50"
              clearable
              placeholder="请输入 2~50 个字符"
            />
          </el-form-item>

          <el-form-item for="" label="套餐状态" prop="status">
            <AtengDictRadio
              v-model="form.status"
              data-testid="pkg-form-status"
              dict-code="commonStatus"
              value-type="number"
            />
          </el-form-item>
        </div>

        <el-form-item label="菜单权限">
          <div class="flex w-full flex-col gap-2">
            <TreeSelectionToolbar
              v-model:strictly="form.menuCheckStrictly"
              :expanded-all="treeExpandedAll"
              :all-selected="treeAllSelected"
              test-id-prefix="pkg-menu"
              @toggle-expand="handleToggleExpandAll"
              @toggle-select-all="handleToggleSelectAll"
              @strictly-change="handleMenuStrictlyChange"
            />

            <div
              class="max-h-[300px] overflow-y-auto rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle p-2"
            >
              <!-- Element Plus check-strictly=true 表示父子不联动，与后端 menuCheckStrictly=true（联动态）语义取反 -->
              <el-tree
                :key="treeRenderKey"
                ref="menuTreeRef"
                data-testid="pkg-form-menu-tree"
                :data="assignableMenuTree"
                node-key="id"
                show-checkbox
                :default-expand-all="treeExpandedAll"
                :check-strictly="!form.menuCheckStrictly"
                :props="{ label: 'title', children: 'children' }"
                empty-text="暂无可分发业务菜单"
              >
                <template #default="{ data }">
                  <div :data-testid="`pkg-menu-node-${data.id}`" class="flex items-center gap-1.5 text-xs">
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
            data-testid="pkg-form-remark"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            placeholder="可选填写套餐适用客户群体与权限说明"
          />
        </el-form-item>
      </el-form>
    </div>

    <PackageShrinkConfirmDialog
      v-model="shrinkDialogVisible"
      :preview="shrinkPreviewData"
      :confirm-action="executePendingShrinkSave"
      @cancel="resetShrinkState"
    />
  </AtengDrawer>
</template>

<style scoped></style>
