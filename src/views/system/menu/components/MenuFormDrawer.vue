<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElForm,
  ElFormItem,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElRadio,
  ElRadioGroup,
  ElSwitch,
  ElTag,
  ElTreeSelect,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { Warning } from '@element-plus/icons-vue';
import { AtengDictRadio, AtengDrawer, AtengIconSelect } from '@atengk/element-plus';
import {
  createMenu,
  getMenuDetail,
  getMenuTree,
  updateMenu,
  type MenuTreeVO,
} from '@/api/system/menu';
import type { CommonStatus, MenuType, VisibleStatus } from '@/api/types';
import { isGlobalHandledHttpError, resolveErrorMessage } from '@/utils/http';
import { EXTRA_ELEMENT_ICONS, resolveMenuIcon } from '@/utils/icon';
import { buildMenuFormRules } from '@/views/system/menu/menuFormRules';
import {
  buildMenuParentOptions,
  findMenuNodeById,
  getAllowedMenuTypesForEdit,
  isMenuParentPlatformOnly,
  MENU_TYPE_OPTIONS,
  MENU_TYPE_TAG_TYPE,
  ROOT_MENU_ID,
  sanitizeMenuSavePayload,
  type MenuParentSelectorOption,
} from '@/views/system/menu/menuHelper';

/**
 * 菜单权限新增/编辑动态表单抽屉（500px）：
 * 根据节点类型（M 目录 / C 菜单 / F 按钮）与外链开关动态裁剪表单字段，守护父级拓扑安全与平台专属继承约束。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'MenuFormDrawer' });

const props = defineProps<{
  /**
   * 抽屉显示状态（v-model）。
   */
  modelValue: boolean;
  /**
   * 操作模式（新增或编辑）。
   */
  mode: 'create' | 'edit';
  /**
   * 编辑模式下的菜单主键。
   */
  menuId?: string;
  /**
   * 新增模式下预填的上级菜单主键。
   */
  initialParentId?: string;
  /**
   * 新增模式下预填的节点类型。
   */
  initialMenuType?: MenuType;
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
const fullMenuTree = ref<MenuTreeVO[]>([]);
let isInitializing = false;

const form = reactive<{
  id?: string;
  parentId: string;
  menuType: MenuType;
  title: string;
  name: string;
  path: string;
  component: string;
  redirect: string;
  perms: string;
  icon: string;
  sort: number;
  visible: VisibleStatus;
  status: CommonStatus;
  keepAlive: boolean;
  isExternal: boolean;
  platformOnly: boolean;
}>({
  id: undefined,
  parentId: ROOT_MENU_ID,
  menuType: 'M',
  title: '',
  name: '',
  path: '',
  component: '',
  redirect: '',
  perms: '',
  icon: '',
  sort: 0,
  visible: 0,
  status: 0,
  keepAlive: true,
  isExternal: false,
  platformOnly: false,
});

const parentTreeOptions = computed<MenuParentSelectorOption[]>(() =>
  buildMenuParentOptions(
    fullMenuTree.value,
    form.menuType,
    props.mode === 'edit' ? form.id : undefined,
  ),
);

const allowedMenuTypes = computed<MenuType[]>(() => {
  if (props.mode !== 'edit' || !form.id) {
    return ['M', 'C', 'F'];
  }
  const currentNode = findMenuNodeById(fullMenuTree.value, form.id);
  return getAllowedMenuTypesForEdit(currentNode);
});

const parentInheritedPlatformOnly = computed<boolean>(() =>
  isMenuParentPlatformOnly(fullMenuTree.value, form.parentId),
);

const drawerTitle = computed<string>(() => {
  const action = props.mode === 'edit' ? '编辑' : '新增';
  const typeText = form.menuType === 'M' ? '目录' : form.menuType === 'C' ? '菜单' : '按钮权限';
  return `${action}${typeText}`;
});

const formRules: FormRules = buildMenuFormRules({
  getMenuType: () => form.menuType,
  getIsExternal: () => form.isExternal,
  getMenuTree: () => fullMenuTree.value,
});

function resetFormState(): void {
  const initType = props.initialMenuType ?? 'M';
  const initParent = props.initialParentId?.trim() || (initType === 'F' ? '' : ROOT_MENU_ID);
  form.id = undefined;
  form.parentId = initParent;
  form.menuType = initType;
  form.title = '';
  form.name = '';
  form.path = '';
  form.component = '';
  form.redirect = '';
  form.perms = '';
  form.icon = '';
  form.sort = 0;
  form.visible = 0;
  form.status = 0;
  form.keepAlive = true;
  form.isExternal = false;
  form.platformOnly = false;
  submitError.value = '';
}

function syncPlatformOnlyInheritance(): void {
  if (parentInheritedPlatformOnly.value) {
    form.platformOnly = true;
  }
}

async function loadDrawerData(): Promise<void> {
  isInitializing = true;
  resetFormState();
  detailLoading.value = true;
  try {
    const tree = await getMenuTree();
    fullMenuTree.value = tree;

    if (props.mode === 'edit' && props.menuId) {
      const detail = await getMenuDetail(props.menuId);
      form.id = detail.id;
      form.parentId = detail.parentId || ROOT_MENU_ID;
      form.menuType = detail.menuType;
      form.title = detail.title;
      form.name = detail.name ?? '';
      form.path = detail.path ?? '';
      form.component = detail.component ?? '';
      form.redirect = detail.redirect ?? '';
      form.perms = detail.perms ?? '';
      form.icon = detail.icon ?? '';
      form.sort = detail.sort ?? 0;
      form.visible = detail.visible;
      form.status = detail.status;
      form.keepAlive = detail.keepAlive;
      form.isExternal = detail.isExternal;
      form.platformOnly = detail.platformOnly;
    }

    syncPlatformOnlyInheritance();
  } catch (error) {
    const message = resolveErrorMessage(error, '加载菜单详情失败，请关闭重试');
    submitError.value = message;
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(message);
    }
  } finally {
    detailLoading.value = false;
    isInitializing = false;
    await nextTick();
    formRef.value?.clearValidate();
  }
}

watch(
  () => props.modelValue,
  opened => {
    if (opened) {
      void loadDrawerData();
    }
  },
);

watch(
  () => form.parentId,
  () => {
    if (!isInitializing) {
      syncPlatformOnlyInheritance();
    }
  },
);

watch(
  () => form.menuType,
  async (nextType, prevType) => {
    if (isInitializing) {
      return;
    }
    if (nextType === 'F') {
      const parentNode = findMenuNodeById(fullMenuTree.value, form.parentId);
      if (!parentNode || parentNode.menuType !== 'C') {
        form.parentId = '';
      }
      form.isExternal = false;
      form.keepAlive = false;
    } else {
      const parentNode = findMenuNodeById(fullMenuTree.value, form.parentId);
      if (parentNode && parentNode.menuType !== 'M') {
        form.parentId = ROOT_MENU_ID;
      } else if (!form.parentId) {
        form.parentId = ROOT_MENU_ID;
      }
      if (nextType === 'C' && prevType !== 'C' && props.mode === 'create') {
        form.keepAlive = true;
      }
    }
    await nextTick();
    formRef.value?.clearValidate(['parentId', 'name', 'path', 'component', 'redirect', 'perms']);
  },
);

watch(
  () => form.isExternal,
  async external => {
    if (isInitializing) {
      return;
    }
    if (external) {
      form.keepAlive = false;
    }
    await nextTick();
    formRef.value?.clearValidate(['name', 'path', 'component']);
  },
);

async function handleBeforeConfirm(): Promise<boolean> {
  if (detailLoading.value) {
    return false;
  }
  submitError.value = '';
  const payload = sanitizeMenuSavePayload({
    mode: props.mode,
    id: form.id,
    parentId: form.parentId,
    menuType: form.menuType,
    title: form.title,
    name: form.name,
    path: form.path,
    component: form.component,
    redirect: form.redirect,
    perms: form.perms,
    icon: form.icon,
    sort: form.sort,
    visible: form.visible,
    status: form.status,
    keepAlive: form.keepAlive,
    isExternal: form.isExternal,
    platformOnly: form.platformOnly,
  });

  try {
    if (props.mode === 'edit') {
      await updateMenu(payload);
      ElMessage.success(`已保存菜单【${payload.title}】`);
    } else {
      await createMenu(payload);
      ElMessage.success(`已新增菜单【${payload.title}】`);
    }
    emit('saved');
    return true;
  } catch (error) {
    const message = resolveErrorMessage(error, '保存菜单失败，请核对后重试');
    submitError.value = message;
    if (!isGlobalHandledHttpError(error)) {
      ElMessage.error(message);
    }
    return false;
  }
}
</script>

<template>
  <AtengDrawer
    v-model="visible"
    :title="drawerTitle"
    size="500px"
    confirm-text="保存菜单"
    :form-ref="formRef"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
    @closed="submitError = ''"
  >
    <div class="flex flex-col gap-3">
      <div
        v-if="submitError"
        data-testid="menu-form-error"
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
        label-width="96px"
      >
        <el-form-item for="" label="节点类型" prop="menuType">
          <el-radio-group v-model="form.menuType" data-testid="menu-form-type">
            <el-radio
              v-for="item in MENU_TYPE_OPTIONS"
              :key="item.value"
              :value="item.value"
              :disabled="!allowedMenuTypes.includes(item.value)"
            >
              {{ item.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="上级节点" prop="parentId">
          <el-tree-select
            v-model="form.parentId"
            data-testid="menu-form-parent"
            :data="parentTreeOptions"
            node-key="id"
            :props="{ label: 'label', children: 'children', disabled: 'disabled' }"
            check-strictly
            filterable
            :render-after-expand="false"
            class="w-full"
            :placeholder="form.menuType === 'F' ? '请选择所属页面菜单' : '请选择上级目录或根目录'"
          >
            <template #default="{ data }">
              <div class="flex items-center justify-between gap-2">
                <span>{{ data.label }}</span>
                <div class="flex items-center gap-1">
                  <el-tag
                    v-if="data.id !== ROOT_MENU_ID"
                    size="small"
                    :type="MENU_TYPE_TAG_TYPE[data.menuType as MenuType]"
                  >
                    {{ data.menuType === 'M' ? '目录' : '菜单' }}
                  </el-tag>
                  <el-tag v-if="data.platformOnly" size="small" type="warning">平台专属</el-tag>
                </div>
              </div>
            </template>
          </el-tree-select>
        </el-form-item>

        <el-form-item label="显示名称" prop="title">
          <el-input
            v-model="form.title"
            data-testid="menu-form-title"
            maxlength="50"
            clearable
            placeholder="请输入 1~50 个字符"
          />
        </el-form-item>

        <el-form-item v-if="form.menuType !== 'F'" label="菜单图标" prop="icon">
          <AtengIconSelect
            v-model="form.icon"
            data-testid="menu-form-icon"
            :custom-icons="EXTRA_ELEMENT_ICONS"
            clearable
            placeholder="点击检索或选择线性图标"
            class="w-full"
          >
            <template #icon="{ item }">
              <el-icon v-if="item.component || resolveMenuIcon(item.name)" :size="16">
                <component :is="item.component ?? resolveMenuIcon(item.name)" />
              </el-icon>
            </template>
          </AtengIconSelect>
        </el-form-item>

        <el-form-item v-if="form.menuType === 'C'" label="外链菜单" prop="isExternal">
          <el-switch
            v-model="form.isExternal"
            data-testid="menu-form-external"
            inline-prompt
            active-text="外链"
            inactive-text="内页"
          />
        </el-form-item>

        <el-form-item
          v-if="form.menuType !== 'F'"
          :label="form.menuType === 'C' && form.isExternal ? '外链地址' : '路由路径'"
          prop="path"
        >
          <el-input
            v-model="form.path"
            data-testid="menu-form-path"
            maxlength="255"
            clearable
            class="font-mono-data"
            :placeholder="
              form.menuType === 'C' && form.isExternal
                ? '请输入 https:// 开头的完整外部链接'
                : form.menuType === 'M'
                  ? '例如 /system'
                  : '例如 /system/dept'
            "
          />
        </el-form-item>

        <el-form-item v-if="form.menuType === 'C' && !form.isExternal" label="路由名称" prop="name">
          <el-input
            v-model="form.name"
            data-testid="menu-form-name"
            maxlength="64"
            clearable
            class="font-mono-data"
            placeholder="PascalCase 组件标识，例如 SysDept"
          />
        </el-form-item>

        <el-form-item
          v-if="form.menuType === 'C' && !form.isExternal"
          label="组件路径"
          prop="component"
        >
          <el-input
            v-model="form.component"
            data-testid="menu-form-component"
            maxlength="255"
            clearable
            class="font-mono-data"
            placeholder="views 相对路径，例如 system/dept/index"
          />
        </el-form-item>

        <el-form-item v-if="form.menuType === 'M'" label="默认跳转" prop="redirect">
          <el-input
            v-model="form.redirect"
            data-testid="menu-form-redirect"
            maxlength="255"
            clearable
            class="font-mono-data"
            placeholder="可选默认重定向路径，如 /system/user"
          />
        </el-form-item>

        <el-form-item v-if="form.menuType !== 'M'" label="权限标识" prop="perms">
          <el-input
            v-model="form.perms"
            data-testid="menu-form-perms"
            maxlength="100"
            clearable
            class="font-mono-data"
            placeholder="三段式小写格式，如 system:dept:list"
          />
        </el-form-item>

        <el-form-item label="显示排序" prop="sort">
          <el-input-number
            v-model="form.sort"
            data-testid="menu-form-sort"
            :min="0"
            :max="9999"
            controls-position="right"
            class="!w-full tabular-nums"
          />
        </el-form-item>

        <el-form-item v-if="form.menuType !== 'F'" for="" label="侧栏显隐" prop="visible">
          <AtengDictRadio v-model="form.visible" dict-code="visibleStatus" value-type="number" />
        </el-form-item>

        <el-form-item
          v-if="form.menuType === 'C' && !form.isExternal"
          label="页面缓存"
          prop="keepAlive"
        >
          <el-switch
            v-model="form.keepAlive"
            data-testid="menu-form-keep-alive"
            inline-prompt
            active-text="缓存"
            inactive-text="不缓存"
          />
        </el-form-item>

        <el-form-item for="" label="菜单状态" prop="status">
          <AtengDictRadio v-model="form.status" dict-code="commonStatus" value-type="number" />
        </el-form-item>

        <el-form-item label="平台专属" prop="platformOnly">
          <div class="flex flex-col gap-1">
            <el-switch
              v-model="form.platformOnly"
              data-testid="menu-form-platform-only"
              :disabled="parentInheritedPlatformOnly"
              inline-prompt
              active-text="仅平台"
              inactive-text="通用"
            />
            <p
              v-if="parentInheritedPlatformOnly"
              data-testid="menu-platform-locked-hint"
              class="text-xs leading-relaxed text-[var(--solid-warning)]"
            >
              继承自上级平台专属节点，不可降级为通用可分发菜单
            </p>
          </div>
        </el-form-item>
      </el-form>
    </div>
  </AtengDrawer>
</template>

<style scoped></style>
