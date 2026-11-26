<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElDatePicker,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMessage,
  ElOption,
  ElSelect,
  ElSkeleton,
  ElTag,
  type FormInstance,
  type FormRules,
} from 'element-plus';
import { AtengDictRadio, AtengDrawer } from '@atengk/element-plus';
import { getConfigByKey } from '@/api/system/config';
import { createTenant, getTenantDetail, updateTenant, type CreateTenantVO } from '@/api/system/tenant';
import { getTenantPackageOptions, type TenantPackageOptionVO } from '@/api/system/tenant-package';
import FormErrorBanner from '@/components/FormErrorBanner.vue';
import PasswordPolicyChecklist from '@/components/PasswordPolicyChecklist.vue';
import { useDetailDialogState } from '@/composables/useDetailDialogState';
import { withDictPreload } from '@/utils/dict';
import {
  buildSelectablePackageOptions,
  buildTenantCreatePayload,
  buildTenantFormRules,
  buildTenantUpdatePayload,
  createInitialTenantFormState,
  DEFAULT_TENANT_ACCOUNT_QUOTA,
  generateRandomTenantCode,
  hydrateTenantEditForm,
  isProtectedPlatformTenant,
  type SelectablePackageOption,
  type TenantDrawerFormState,
} from '@/views/system/tenant/tenantHelper';

/**
 * SaaS 租户新增/编辑抽屉（560px）：
 * 新增态采集原子初始化配置（含初始强口令预填与随机编码生成），
 * 编辑态保护 0 号默认租户仅允许维护名称与备注，并兼容已停用既绑套餐的回显。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'TenantFormDrawer' });

const props = defineProps<{
  /** 抽屉显示状态（v-model）。 */
  modelValue: boolean;
  /** 操作模式（新增或编辑）。 */
  mode: 'create' | 'edit';
  /** 编辑模式下的目标租户主键。 */
  tenantId?: string;
}>();

const emit = defineEmits<{
  /** 抽屉显示状态更新事件。 */
  (e: 'update:modelValue', value: boolean): void;
  /** 编辑保存成功通知事件。 */
  (e: 'saved'): void;
  /** 新建原子初始化成功通知事件（携带一次性登录凭据）。 */
  (e: 'created', payload: CreateTenantVO): void;
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

const activePackages = ref<TenantPackageOptionVO[]>([]);
const isPlatformZero = ref<boolean>(false);
const boundPackageSnapshot = ref<{
  packageId?: string | null;
  packageName?: string | null;
}>({});
const form = reactive<TenantDrawerFormState>(createInitialTenantFormState());

const packageSelectOptions = computed<SelectablePackageOption[]>(() =>
  buildSelectablePackageOptions(
    activePackages.value,
    props.mode === 'edit' ? boundPackageSnapshot.value : undefined,
  ),
);

const drawerTitle = computed<string>(() => {
  if (props.mode === 'create') {
    return '新增租户（原子初始化）';
  }
  return isPlatformZero.value ? '编辑平台默认租户 (0)' : '编辑租户';
});

const formRules: FormRules = buildTenantFormRules({
  isCreate: () => props.mode === 'create',
  isPlatformDefault: () => isPlatformZero.value,
  isUnlimitedAccount: () => form.unlimitedAccount,
  isPermanentExpire: () => form.permanentExpire,
});

function resetFormState(): void {
  resetDialogState();
  Object.assign(form, createInitialTenantFormState());
  activePackages.value = [];
  isPlatformZero.value = false;
  boundPackageSnapshot.value = {};
}

function handleGenerateTenantCode(): void {
  form.tenantCode = generateRandomTenantCode();
  formRef.value?.clearValidate('tenantCode');
}

function handleUnlimitedChange(checked: string | number | boolean): void {
  if (checked) {
    formRef.value?.clearValidate('accountCount');
  } else if (!Number.isInteger(form.accountCount) || form.accountCount < 1) {
    form.accountCount = DEFAULT_TENANT_ACCOUNT_QUOTA;
  }
}

function handlePermanentChange(checked: string | number | boolean): void {
  if (checked) {
    formRef.value?.clearValidate('expireTime');
  }
}

async function loadDrawerData(): Promise<void> {
  resetFormState();
  const isEdit = props.mode === 'edit' && Boolean(props.tenantId);
  const targetId = props.tenantId ?? '';

  await runDetailLoad({
    loader: () =>
      withDictPreload(['commonStatus'], async () => {
        if (isEdit) {
          const detail = await getTenantDetail(targetId);
          // 0 号默认租户不展示套餐下拉，跳过无意义的选项请求
          const packages = isProtectedPlatformTenant(detail)
            ? ([] as TenantPackageOptionVO[])
            : await getTenantPackageOptions();
          return { packages, detail, initPassword: null };
        }
        const [packages, initPassword] = await Promise.all([
          getTenantPackageOptions(),
          getConfigByKey('sys.user.initPassword').catch(() => null),
        ]);
        return { packages, detail: null, initPassword };
      }),
    onLoaded: ({ packages, detail, initPassword }) => {
      activePackages.value = packages;
      if (detail) {
        isPlatformZero.value = isProtectedPlatformTenant(detail);
        boundPackageSnapshot.value = {
          packageId: detail.packageId,
          packageName: detail.packageName,
        };
        hydrateTenantEditForm(form, detail);
      } else if (initPassword) {
        form.adminPassword = initPassword;
      }
    },
    errorFallback: '加载租户信息失败，请关闭重试',
  });

  await nextTick();
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
  try {
    if (props.mode === 'edit' && form.id) {
      const payload = buildTenantUpdatePayload({ ...form, id: form.id }, isPlatformZero.value);
      await updateTenant(payload);
      ElMessage.success(
        isPlatformZero.value ? '已更新平台默认租户名称与备注' : `已保存租户【${payload.tenantName}】`,
      );
      emit('saved');
      return true;
    }

    const created = await createTenant(buildTenantCreatePayload(form));
    ElMessage.success(`已新增并初始化租户【${created.tenantName}】`);
    emit('created', created);
    return true;
  } catch (error) {
    recordSubmitError(error, '保存租户信息失败，请核对后重试');
    return false;
  }
}
</script>

<template>
  <AtengDrawer
    v-model="visible"
    :title="drawerTitle"
    size="560px"
    :confirm-text="mode === 'create' ? '创建租户' : '保存租户'"
    :form-ref="formRef"
    :show-confirm="!detailLoadFailed && detailReady"
    :confirm-loading="detailLoading ? true : undefined"
    :before-confirm="handleBeforeConfirm"
    @closed="resetFormState"
  >
    <div class="flex flex-col gap-3">
      <FormErrorBanner :message="submitError" test-id="tenant-form-error" />

      <el-skeleton v-if="!detailReady && !detailLoadFailed" :rows="6" animated />

      <div v-else class="flex flex-col gap-3">
        <el-alert
          v-if="isPlatformZero"
          type="warning"
          :closable="false"
          show-icon
          title="平台内置默认租户（000000）受系统保护，仅允许修改租户名称与备注"
        />

        <el-form ref="formRef" v-loading="detailLoading" :model="form" :rules="formRules" :validate-on-rule-change="false" label-width="96px">
          <el-form-item label="租户编码" prop="tenantCode">
            <div class="flex w-full items-center gap-1.5">
              <el-input v-model="form.tenantCode" data-testid="tenant-form-code" :disabled="mode === 'edit'" maxlength="32" clearable class="font-mono-data" placeholder="4~32 位，禁填 000000" />
              <el-button v-if="mode === 'create'" data-testid="tenant-form-gen-code-btn" size="small" plain @click="handleGenerateTenantCode">
                随机生成
              </el-button>
            </div>
          </el-form-item>

          <el-form-item label="租户名称" prop="tenantName">
            <el-input v-model="form.tenantName" data-testid="tenant-form-name" maxlength="50" clearable placeholder="请输入 2~50 个字符" />
          </el-form-item>

          <template v-if="!isPlatformZero">
            <el-form-item label="关联套餐" prop="packageId">
              <el-select v-model="form.packageId" data-testid="tenant-form-package" popper-class="tenant-form-package-popper" filterable class="w-full" placeholder="请选择正常启用的租户套餐">
                <el-option
                  v-for="item in packageSelectOptions"
                  :key="item.id"
                  :data-testid="`tenant-form-package-option-${item.id}`"
                  :label="item.packageName"
                  :value="item.id"
                  :disabled="item.disabled"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span>{{ item.packageName }}</span>
                    <el-tag v-if="item.status === 1" size="small" type="warning">已停用</el-tag>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>

            <el-form-item label="账号配额" prop="accountCount">
              <div class="flex w-full flex-col gap-1.5">
                <el-checkbox v-model="form.unlimitedAccount" name="unlimitedAccount" data-testid="tenant-form-unlimited-account" @change="handleUnlimitedChange">
                  不限制账号数
                </el-checkbox>
                <el-input-number v-model="form.accountCount" data-testid="tenant-form-account-count" :disabled="form.unlimitedAccount" :min="1" :precision="0" controls-position="right" class="tenant-number-input tabular-nums" />
              </div>
            </el-form-item>

            <el-form-item label="过期时间" prop="expireTime">
              <div class="flex w-full flex-col gap-1.5">
                <el-checkbox v-model="form.permanentExpire" name="permanentExpire" data-testid="tenant-form-permanent-expire" @change="handlePermanentChange">
                  永久有效
                </el-checkbox>
                <el-date-picker v-model="form.expireTime" data-testid="tenant-form-expire-time" type="datetime" :disabled="form.permanentExpire" value-format="YYYY-MM-DD HH:mm:ss" format="YYYY-MM-DD HH:mm:ss" class="tenant-date-picker" placeholder="选择授权到期时间" />
              </div>
            </el-form-item>

            <el-form-item for="" label="租户状态" prop="status">
              <AtengDictRadio v-model="form.status" data-testid="tenant-form-status" dict-code="commonStatus" value-type="number" />
            </el-form-item>
          </template>

          <template v-if="mode === 'create'">
            <div class="mb-3 border-t border-border-subtle pt-3 text-xs font-medium text-ink-secondary">
              默认租户管理员初始化（与租户同一事务原子落库）
            </div>

            <el-form-item label="管理员账号" prop="adminUsername">
              <el-input v-model="form.adminUsername" data-testid="tenant-form-admin-username" maxlength="30" clearable class="font-mono-data" placeholder="默认如 admin（2~30 位字母/数字/下划线）" />
            </el-form-item>

            <el-form-item label="初始密码" prop="adminPassword">
              <div class="flex w-full flex-col gap-1.5">
                <el-input v-model="form.adminPassword" data-testid="tenant-form-admin-password" type="password" show-password maxlength="20" autocomplete="new-password" placeholder="已预填系统初始密码，可按强口令规则修改" />
                <PasswordPolicyChecklist :password="form.adminPassword" />
              </div>
            </el-form-item>
          </template>

          <el-form-item label="备注" prop="remark">
            <el-input v-model="form.remark" data-testid="tenant-form-remark" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="可选填写租户业务背景与授权备注" />
          </el-form-item>
        </el-form>
      </div>
    </div>
  </AtengDrawer>
</template>

<style scoped>
.tenant-number-input,
.tenant-date-picker {
  width: 100%;
}
</style>
