<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElTag,
  ElTreeSelect,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { AtengDictRadio, AtengDrawer } from '@atengk/element-plus';
import { getConfigByKey } from '@/api/system/config';
import { getDeptOptions, type DeptTreeVO } from '@/api/system/dept';
import { getPostOptions, type PostOptionVO } from '@/api/system/post';
import { getRoleOptions, type RoleOptionVO } from '@/api/system/role';
import { createUser, getUserDetail, updateUser } from '@/api/system/user';
import FormErrorBanner from '@/components/FormErrorBanner.vue';
import PasswordPolicyChecklist from '@/components/PasswordPolicyChecklist.vue';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import { useAuthStore } from '@/stores/auth';
import { useTenantStore } from '@/stores/tenant';
import {
  buildAssignablePostOptions,
  buildUserDeptTreeOptions,
  buildUserDrawerPayload,
  buildUserFormRules,
  filterAssignableRoles,
  type AssignablePostOption,
  type AssignableRoleOption,
  type UserDeptSelectorOption,
  type UserDrawerFormState,
} from '@/views/system/user/userHelper';

/**
 * 用户新增/编辑表单抽屉（500px）：
 * 新增模式预填 sys.user.initPassword 并校验强口令，编辑模式锁定账号只读、回显真明文联系方式及已停用原归属部门/岗位并保护自身角色授权。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'UserFormDrawer' });

const props = defineProps<{
  /** 抽屉显示状态（v-model）。 */
  modelValue: boolean;
  /** 操作模式（新增或编辑）。 */
  mode: 'create' | 'edit';
  /** 编辑模式下的用户主键。 */
  userId?: string;
  /** 新增模式下按左部门树预填的归属部门主键。 */
  initialDeptId?: string;
}>();

const emit = defineEmits<{
  /** 抽屉显示状态更新事件。 */
  (e: 'update:modelValue', value: boolean): void;
  /** 用户保存成功通知事件。 */
  (e: 'saved'): void;
}>();

const visible = computed<boolean>({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});

const authStore = useAuthStore();
const tenantStore = useTenantStore();
const formRef = ref<FormInstance>();
const { detailLoading, detailLoadFailed, submitError, resetDialogState, recordSubmitError, runDetailLoad } =
  useDetailDialogState();

const deptTreeOptionsRaw = ref<DeptTreeVO[]>([]);
const postOptions = ref<PostOptionVO[]>([]);
const rawRoleOptions = ref<RoleOptionVO[]>([]);
const originalDeptId = ref<string | undefined>(undefined);
const originalDeptName = ref<string | undefined>(undefined);
const targetBuiltinSuperAdmin = ref<boolean>(false);

const form = reactive<UserDrawerFormState>({
  id: undefined,
  username: '',
  nickname: '',
  password: '',
  deptId: '',
  postIds: [],
  roleIds: [],
  phone: '',
  email: '',
  gender: '2',
  status: 0,
  remark: '',
});

const allowSuperAdminAssign = computed<boolean>(
  () => tenantStore.activeTenantId === '0' && authStore.hasRole('super_admin'),
);
const isEditingSelf = computed<boolean>(
  () => props.mode === 'edit' && Boolean(form.id && form.id === authStore.user?.userId),
);
const isStatusLocked = computed<boolean>(
  () => props.mode === 'edit' && (targetBuiltinSuperAdmin.value || isEditingSelf.value),
);

const deptSelectorOptions = computed<UserDeptSelectorOption[]>(() =>
  buildUserDeptTreeOptions(
    deptTreeOptionsRaw.value,
    props.mode === 'edit' ? originalDeptId.value : undefined,
    props.mode === 'edit' ? originalDeptName.value : undefined,
  ),
);

const assignablePostOptions = computed<AssignablePostOption[]>(() =>
  buildAssignablePostOptions(postOptions.value, props.mode === 'edit' ? form.postIds : []),
);

const assignableRoleOptions = computed<AssignableRoleOption[]>(() =>
  filterAssignableRoles(
    rawRoleOptions.value,
    allowSuperAdminAssign.value,
    form.roleIds,
    targetBuiltinSuperAdmin.value,
  ),
);

const formRules: FormRules = buildUserFormRules(() => props.mode === 'create');

function resetFormState(): void {
  resetDialogState();
  Object.assign(form, {
    id: undefined,
    username: '',
    nickname: '',
    password: '',
    deptId: props.initialDeptId?.trim() || '',
    postIds: [],
    roleIds: [],
    phone: '',
    email: '',
    gender: '2',
    status: 0,
    remark: '',
  });
  deptTreeOptionsRaw.value = [];
  postOptions.value = [];
  rawRoleOptions.value = [];
  originalDeptId.value = undefined;
  originalDeptName.value = undefined;
  targetBuiltinSuperAdmin.value = false;
}

async function loadDrawerData(): Promise<void> {
  resetFormState();
  const isEdit = props.mode === 'edit' && Boolean(props.userId);
  const targetUserId = props.userId ?? '';

  await runDetailLoad({
    loader: async () => {
      const [depts, posts, roles] = await Promise.all([
        getDeptOptions().catch(() => [] as DeptTreeVO[]),
        getPostOptions().catch(() => [] as PostOptionVO[]),
        getRoleOptions().catch(() => [] as RoleOptionVO[]),
      ]);
      if (isEdit) {
        const detail = await getUserDetail(targetUserId);
        return { depts, posts, roles, detail, initPassword: null };
      }
      const initPassword = await getConfigByKey('sys.user.initPassword').catch(() => null);
      return { depts, posts, roles, detail: null, initPassword };
    },
    onLoaded: ({ depts, posts, roles, detail, initPassword }) => {
      deptTreeOptionsRaw.value = depts;
      postOptions.value = posts;
      rawRoleOptions.value = roles;

      if (detail) {
        Object.assign(form, {
          id: detail.id,
          username: detail.username,
          nickname: detail.nickname,
          deptId: detail.deptId ?? '',
          postIds: [...detail.postIds],
          roleIds: [...detail.roleIds],
          phone: detail.phone ?? '',
          email: detail.email ?? '',
          gender: detail.gender === '0' || detail.gender === '1' || detail.gender === '2' ? detail.gender : '2',
          status: detail.status,
          remark: detail.remark ?? '',
        });
        originalDeptId.value = detail.deptId ?? undefined;
        originalDeptName.value = detail.deptName ?? undefined;
        targetBuiltinSuperAdmin.value = detail.builtinSuperAdmin;
      } else if (initPassword) {
        form.password = initPassword;
      }
    },
    errorFallback: '加载用户信息失败，请关闭重试',
  });

  await nextTick();
  formRef.value?.clearValidate();
}

watch(
  () => props.modelValue,
  opened => {
    if (opened) {
      void loadDrawerData();
    } else {
      resetFormState();
    }
  },
);

async function handleBeforeConfirm(): Promise<boolean> {
  if (detailLoading.value || detailLoadFailed.value) {
    return false;
  }
  submitError.value = '';
  const action = buildUserDrawerPayload(props.mode, form);
  try {
    if (action.mode === 'edit') {
      await updateUser(action.data);
      ElMessage.success(`已保存用户【${action.data.nickname}】`);
    } else {
      await createUser(action.data);
      ElMessage.success(`已新增用户【${action.data.nickname}】`);
    }
    emit('saved');
    return true;
  } catch (error) {
    recordSubmitError(error, '保存用户失败，请核对后重试');
    return false;
  }
}
</script>

<template>
  <AtengDrawer
    v-model="visible"
    :title="mode === 'edit' ? '编辑用户' : '新增用户'"
    size="500px"
    confirm-text="保存用户"
    :form-ref="formRef"
    :show-confirm="!detailLoadFailed"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
  >
    <div class="flex flex-col gap-3">
      <FormErrorBanner :message="submitError" test-id="user-form-error" />

      <el-form
        ref="formRef"
        v-loading="detailLoading"
        :model="form"
        :rules="formRules"
        :validate-on-rule-change="false"
        label-width="88px"
      >
        <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <el-form-item label="登录账号" prop="username">
            <el-input v-model="form.username" data-testid="user-form-username" :disabled="mode === 'edit'" maxlength="30" clearable class="font-mono-data" placeholder="2~30 位字母、数字或下划线" />
          </el-form-item>
          <el-form-item label="用户昵称" prop="nickname">
            <el-input v-model="form.nickname" data-testid="user-form-nickname" maxlength="30" clearable placeholder="请输入 2~30 个字符" />
          </el-form-item>
        </div>

        <el-form-item v-if="mode === 'create'" label="初始密码" prop="password">
          <div class="flex w-full flex-col gap-1.5">
            <el-input v-model="form.password" data-testid="user-form-password" type="password" show-password maxlength="20" autocomplete="new-password" placeholder="已自动预填系统初始密码，可按强口令规则修改" />
            <PasswordPolicyChecklist :password="form.password" />
          </div>
        </el-form-item>

        <el-form-item label="归属部门" prop="deptId">
          <el-tree-select
            v-model="form.deptId"
            data-testid="user-form-dept"
            :data="deptSelectorOptions"
            node-key="id"
            :props="{ label: 'label', children: 'children', disabled: 'disabled' }"
            check-strictly
            filterable
            clearable
            :render-after-expand="false"
            class="w-full"
            placeholder="请选择归属部门"
          >
            <template #default="{ data }">
              <div class="flex items-center justify-between gap-2">
                <span>{{ data.label }}</span>
                <el-tag v-if="data.status === 1" size="small" type="info">已停用</el-tag>
              </div>
            </template>
          </el-tree-select>
        </el-form-item>

        <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <el-form-item label="手机号码" prop="phone">
            <el-input v-model="form.phone" data-testid="user-form-phone" maxlength="11" clearable class="font-mono-data" placeholder="请输入 11 位手机号" />
          </el-form-item>
          <el-form-item label="电子邮箱" prop="email">
            <el-input v-model="form.email" data-testid="user-form-email" maxlength="64" clearable class="font-mono-data" placeholder="请输入电子邮箱" />
          </el-form-item>
        </div>

        <el-form-item label="所属岗位" prop="postIds">
          <el-select v-model="form.postIds" data-testid="user-form-posts" multiple filterable clearable collapse-tags collapse-tags-tooltip class="w-full" placeholder="请选择所属岗位">
            <el-option v-for="item in assignablePostOptions" :key="item.id" :label="item.postName" :value="item.id" :disabled="item.disabled">
              <div class="flex items-center justify-between gap-2">
                <span>{{ item.postName }}</span>
                <el-tag v-if="item.status === 1" size="small" type="info">已停用</el-tag>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="分配角色" prop="roleIds">
          <div class="flex w-full flex-col gap-1">
            <el-select v-model="form.roleIds" data-testid="user-form-roles" multiple filterable clearable collapse-tags collapse-tags-tooltip :disabled="isEditingSelf" class="w-full" placeholder="请选择分配角色">
              <el-option v-for="item in assignableRoleOptions" :key="item.id" :label="item.roleName" :value="item.id" :disabled="item.disabled" />
            </el-select>
            <p v-if="isEditingSelf" data-testid="user-self-role-lock-hint" class="m-0 text-xs text-ink-muted">
              当前登录账号不可自行修改角色授权
            </p>
          </div>
        </el-form-item>

        <div class="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <el-form-item label="用户性别" prop="gender">
            <AtengDictRadio v-model="form.gender" dict-code="sys_user_gender" />
          </el-form-item>
          <el-form-item label="账号状态" prop="status">
            <AtengDictRadio v-model="form.status" dict-code="commonStatus" value-type="number" :disabled="isStatusLocked" />
          </el-form-item>
        </div>

        <el-form-item label="备注" prop="remark">
          <el-input v-model="form.remark" data-testid="user-form-remark" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="可选填写账号备注说明" />
        </el-form-item>
      </el-form>
    </div>
  </AtengDrawer>
</template>

<style scoped></style>
