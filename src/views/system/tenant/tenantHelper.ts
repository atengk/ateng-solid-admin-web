import type { FormRules } from 'element-plus';
import type {
  CreateTenantVO,
  TenantCreateRequest,
  TenantUpdateRequest,
  TenantVO,
} from '@/api/system/tenant';
import type { TenantPackageOptionVO } from '@/api/system/tenant-package';
import type { CommonStatus } from '@/api/types';
import { evaluatePasswordPolicy, PASSWORD_POLICY_MESSAGE } from '@/utils/password';

/**
 * 租户管理纯逻辑辅助函数（0 号默认租户保护、配额与过期语义计算、停用套餐回显兜底与初始化凭据文本拼装）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export const PLATFORM_TENANT_ID = '0';
export const PLATFORM_TENANT_CODE = '000000';
export const DEFAULT_TENANT_ACCOUNT_QUOTA = 20;
export const TENANT_PROTECTED_TOOLTIP = '平台内置默认租户受系统保护，不可停用或删除';

const TENANT_CODE_PATTERN = /^[A-Za-z0-9_-]{4,32}$/;
const ADMIN_USERNAME_PATTERN = /^[A-Za-z0-9_]{2,30}$/;
const EXPIRING_SOON_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 租户账号配额展示摘要。
 */
export interface TenantQuotaSummary {
  /**
   * 列表展示文本（如 `2 / 不限` 或 `4 / 4`）
   */
  text: string;
  /**
   * 是否不限配额
   */
  unlimited: boolean;
  /**
   * 是否已达到或超出账号上限
   */
  full: boolean;
}

/**
 * 租户有效期状态枚举值。
 */
export type TenantExpireStatus = 'permanent' | 'expired' | 'expiring' | 'normal';

/**
 * 租户表单可选套餐下拉项模型（兼容回显已停用原绑定套餐）。
 */
export interface SelectablePackageOption {
  id: string;
  packageName: string;
  disabled: boolean;
  status: CommonStatus;
}

/**
 * 租户新增/编辑抽屉表单状态。
 */
export interface TenantDrawerFormState {
  id?: string;
  tenantCode: string;
  tenantName: string;
  packageId: string;
  unlimitedAccount: boolean;
  accountCount: number;
  permanentExpire: boolean;
  expireTime: string;
  status: CommonStatus;
  remark: string;
  adminUsername: string;
  adminPassword: string;
}

/**
 * 判断目标租户是否为受系统绝对保护的平台默认租户（id = '0' 或编码 '000000'）。
 *
 * @param tenant 租户列表行或详情摘要
 * @returns 若为平台内置默认租户返回 `true`
 */
export function isProtectedPlatformTenant(
  tenant: Pick<TenantVO, 'id' | 'tenantCode' | 'platformDefault'>,
): boolean {
  return (
    tenant.id === PLATFORM_TENANT_ID ||
    Boolean(tenant.platformDefault) ||
    tenant.tenantCode === PLATFORM_TENANT_CODE
  );
}

/**
 * 生成 6 位随机数字租户编码，严格避开平台保留编码 `000000`。
 *
 * @returns 6 位数字租户编码字符串
 */
export function generateRandomTenantCode(): string {
  let code = PLATFORM_TENANT_CODE;
  while (code === PLATFORM_TENANT_CODE) {
    code = String(Math.floor(100000 + Math.random() * 900000));
  }
  return code;
}

/**
 * 格式化租户用户配额展示文本并计算是否已满额。
 *
 * @param usedAccountCount 当前已使用有效账号数
 * @param accountCount     配额上限（-1 表示不限）
 * @returns 展示文本、不限标识与满额警示标识
 */
export function formatTenantQuotaSummary(
  usedAccountCount: number,
  accountCount: number,
): TenantQuotaSummary {
  const safeUsed = Number.isFinite(usedAccountCount) ? Math.max(0, Number(usedAccountCount)) : 0;
  if (accountCount === -1) {
    return {
      text: `${safeUsed} / 不限`,
      unlimited: true,
      full: false,
    };
  }
  const safeLimit = Number.isFinite(accountCount) ? Number(accountCount) : 0;
  return {
    text: `${safeUsed} / ${safeLimit}`,
    unlimited: false,
    full: safeLimit > 0 && safeUsed >= safeLimit,
  };
}

/**
 * 评估租户授权过期时间的展示语义（永久有效 / 已过期 / 7 日内即将到期 / 正常）。
 *
 * @param expireTime  过期时间字符串（yyyy-MM-dd HH:mm:ss）或空值
 * @param now         用于对比的当前基准时间
 * @param expiredFlag 后端返回的是否已过期标志（优先对齐服务端时钟）
 * @returns 有效期语义状态
 */
export function resolveTenantExpireStatus(
  expireTime?: string | null,
  now: Date = new Date(),
  expiredFlag?: boolean | null,
): TenantExpireStatus {
  const trimmed = expireTime?.trim() ?? '';
  if (!trimmed) {
    return 'permanent';
  }
  const parsed = new Date(trimmed.replace(' ', 'T')).getTime();
  if (expiredFlag === true || (!Number.isNaN(parsed) && parsed <= now.getTime())) {
    return 'expired';
  }
  if (!Number.isNaN(parsed) && parsed - now.getTime() <= EXPIRING_SOON_THRESHOLD_MS) {
    return 'expiring';
  }
  return 'normal';
}

/**
 * 构造租户表单下拉套餐选项；编辑老租户若原绑定套餐已停用且未在启用选项中返回，保留禁用回显项。
 *
 * @param activePackages 正常启用套餐下拉列表
 * @param bound          当前编辑租户的既绑套餐摘要
 * @returns 适配 ElSelect 的套餐选项集合
 */
export function buildSelectablePackageOptions(
  activePackages: readonly TenantPackageOptionVO[],
  bound?: {
    packageId?: string | null;
    packageName?: string | null;
  },
): SelectablePackageOption[] {
  const options: SelectablePackageOption[] = activePackages.map(pkg => ({
    id: pkg.id,
    packageName: pkg.packageName,
    disabled: false,
    status: 0,
  }));

  const boundId = bound?.packageId?.trim() ?? '';
  if (boundId && !options.some(item => item.id === boundId)) {
    const rawName = bound?.packageName?.trim();
    const displayName = rawName ? `${rawName} (已停用)` : `套餐 #${boundId} (已停用)`;
    options.push({
      id: boundId,
      packageName: displayName,
      disabled: true,
      status: 1,
    });
  }
  return options;
}

/**
 * 将租户新增抽屉表单状态收敛为 `POST /admin/system/tenant` 请求载荷。
 *
 * @param form 租户抽屉表单状态
 * @returns 新增租户请求体
 */
export function buildTenantCreatePayload(form: TenantDrawerFormState): TenantCreateRequest {
  return {
    tenantCode: form.tenantCode.trim(),
    tenantName: form.tenantName.trim(),
    packageId: form.packageId.trim(),
    accountCount: form.unlimitedAccount ? -1 : Number(form.accountCount),
    expireTime: form.permanentExpire ? null : form.expireTime.trim() || null,
    status: form.status,
    remark: form.remark.trim() || null,
    adminUsername: form.adminUsername.trim(),
    adminPassword: form.adminPassword,
  };
}

/**
 * 将租户编辑抽屉表单状态收敛为 `PUT /admin/system/tenant` 请求载荷；
 * 0 号平台默认租户严格仅传 `{ id, tenantName, remark }`，杜绝越界篡改受保护字段。
 *
 * @param form              编辑态表单状态
 * @param isPlatformDefault 是否为 0 号平台默认租户
 * @returns 编辑租户请求体
 */
export function buildTenantUpdatePayload(
  form: Omit<TenantDrawerFormState, 'adminUsername' | 'adminPassword'> & { id: string },
  isPlatformDefault: boolean,
): TenantUpdateRequest {
  const tenantName = form.tenantName.trim();
  const remark = form.remark.trim() || null;
  if (isPlatformDefault) {
    return {
      id: form.id,
      tenantName,
      remark,
    };
  }
  return {
    id: form.id,
    tenantName,
    packageId: form.packageId.trim() || null,
    accountCount: form.unlimitedAccount ? -1 : Number(form.accountCount),
    expireTime: form.permanentExpire ? null : form.expireTime.trim() || null,
    status: form.status,
    remark,
  };
}

/**
 * 构造租户表单抽屉初始默认状态。
 *
 * @returns 空白默认表单状态对象
 */
export function createInitialTenantFormState(): TenantDrawerFormState {
  return {
    id: undefined,
    tenantCode: '',
    tenantName: '',
    packageId: '',
    unlimitedAccount: false,
    accountCount: DEFAULT_TENANT_ACCOUNT_QUOTA,
    permanentExpire: false,
    expireTime: '',
    status: 0,
    remark: '',
    adminUsername: '',
    adminPassword: '',
  };
}

/**
 * 将后端返回的租户详情回填至表单抽屉响应式状态。
 *
 * @param form   抽屉表单状态对象
 * @param detail 后端租户详情视图
 */
export function hydrateTenantEditForm(form: TenantDrawerFormState, detail: TenantVO): void {
  const unlimited = detail.accountCount === -1;
  const permanent = !detail.expireTime;
  Object.assign(form, {
    id: detail.id,
    tenantCode: detail.tenantCode,
    tenantName: detail.tenantName,
    packageId: detail.packageId ?? '',
    unlimitedAccount: unlimited,
    accountCount: unlimited ? DEFAULT_TENANT_ACCOUNT_QUOTA : detail.accountCount,
    permanentExpire: permanent,
    expireTime: detail.expireTime ?? '',
    status: detail.status,
    remark: detail.remark ?? '',
  });
}

/**
 * 生成新建租户完成后的可复制登录指引纯文本（仅包含租户编码与管理员账号，不落存明文密码）。
 *
 * @param created 后端返回的 `CreateTenantVO`
 * @returns 格式化的多行登录指引文本
 */
export function buildTenantInitCopyText(created: CreateTenantVO): string {
  return [
    `租户名称：${created.tenantName}`,
    `登录租户编码：${created.tenantCode}`,
    `管理员账号：${created.adminUsername}`,
    '初始密码：按创建时设置的初始密码生效（首次登录将提示修改）',
  ].join('\n');
}

/**
 * 构造租户新增/编辑表单校验规则（覆盖编码格式、保留码 000000、配额非 0 正整数与强口令策略）。
 *
 * @param flags 动态状态回调集合
 * @returns Element Plus 表单校验规则对象
 */
export function buildTenantFormRules(flags: {
  isCreate: () => boolean;
  isPlatformDefault: () => boolean;
  isUnlimitedAccount: () => boolean;
  isPermanentExpire: () => boolean;
}): FormRules {
  return {
    tenantCode: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          if (!flags.isCreate()) {
            callback();
            return;
          }
          const trimmed = (value ?? '').trim();
          if (!TENANT_CODE_PATTERN.test(trimmed)) {
            callback(new Error('租户编码须为 4~32 位字母、数字、下划线或短横线'));
            return;
          }
          if (trimmed === PLATFORM_TENANT_CODE) {
            callback(new Error('禁止使用平台默认租户保留编码 000000'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    tenantName: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          const trimmed = (value ?? '').trim();
          if (trimmed.length < 2 || trimmed.length > 50) {
            callback(new Error('租户名称长度须在 2~50 个字符之间'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    packageId: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          if (flags.isPlatformDefault()) {
            callback();
            return;
          }
          if (!(value ?? '').trim()) {
            callback(new Error('请选择关联租户套餐'));
            return;
          }
          callback();
        },
        trigger: 'change',
      },
    ],
    accountCount: [
      {
        validator: (_rule, value: number, callback) => {
          if (flags.isPlatformDefault() || flags.isUnlimitedAccount()) {
            callback();
            return;
          }
          const num = Number(value);
          if (!Number.isInteger(num) || num < 1) {
            callback(new Error('账号配额须为 >= 1 的正整数（或勾选“不限制”）'));
            return;
          }
          callback();
        },
        trigger: 'change',
      },
    ],
    expireTime: [
      {
        validator: (_rule, value: string, callback) => {
          if (flags.isPlatformDefault() || flags.isPermanentExpire()) {
            callback();
            return;
          }
          if (!(value ?? '').trim()) {
            callback(new Error('请选择租户授权过期时间（或勾选“永久有效”）'));
            return;
          }
          callback();
        },
        trigger: 'change',
      },
    ],
    adminUsername: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          if (!flags.isCreate()) {
            callback();
            return;
          }
          if (!ADMIN_USERNAME_PATTERN.test((value ?? '').trim())) {
            callback(new Error('管理员账号须为 2~30 位字母、数字或下划线'));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
    adminPassword: [
      {
        required: true,
        validator: (_rule, value: string, callback) => {
          if (!flags.isCreate()) {
            callback();
            return;
          }
          if (!evaluatePasswordPolicy(value ?? '').valid) {
            callback(new Error(PASSWORD_POLICY_MESSAGE));
            return;
          }
          callback();
        },
        trigger: 'blur',
      },
    ],
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
}
