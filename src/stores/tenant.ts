import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { Router } from 'vue-router';
import { BusinessException } from '@atengk/core';
import { DictManager } from '@atengk/element-plus';
import { useTenant } from '@atengk/vue';
import type { AdminProfileVO } from '@/api/auth';
import { getTenantOptions, type TenantOptionVO } from '@/api/system/tenant';
import { ANONYMOUS_WHITELIST_PATHS, STATIC_BUSINESS_PATHS } from '@/router/routes';
import { adminTenantManager, BIZ_INVALID_TENANT_SWITCH, DEFAULT_TENANT_ID } from '@/utils/http';
import { useAppStore } from '@/stores/app';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';

const DEFAULT_TENANT_NAME = '平台默认租户';
const STATIC_ACCESSIBLE_PATHS = new Set([
  ...STATIC_BUSINESS_PATHS,
  ...ANONYMOUS_WHITELIST_PATHS,
  '/404',
]);

function isInvalidTenantSwitchError(error: unknown): boolean {
  if (error instanceof BusinessException) {
    return error.code === BIZ_INVALID_TENANT_SWITCH;
  }
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: unknown }).code === BIZ_INVALID_TENANT_SWITCH;
  }
  return false;
}

/**
 * 多租户上下文与平台超管视角切换 Pinia Setup Store（严格 7 步切租户时序与 100002 安全回退）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
export const useTenantStore = defineStore('tenant', () => {
  const tenant = useTenant({ tenantManager: adminTenantManager });
  const authStore = useAuthStore();
  const appStore = useAppStore();
  const permissionStore = usePermissionStore();

  const ownerTenantId = ref<string>(DEFAULT_TENANT_ID);
  const activeTenantId = computed<string>(() => tenant.tenantId.value || DEFAULT_TENANT_ID);
  const activeTenantName = ref<string>(DEFAULT_TENANT_NAME);
  const tenantOptions = ref<TenantOptionVO[]>([]);
  const switching = ref<boolean>(false);

  let recoveryPromise: Promise<void> | null = null;

  const isSuperAdminTenantSwitchAllowed = computed<boolean>(
    () =>
      authStore.tenantEnabled &&
      ownerTenantId.value === DEFAULT_TENANT_ID &&
      authStore.hasRole('super_admin'),
  );

  const isObservingTenant = computed<boolean>(
    () => isSuperAdminTenantSwitchAllowed.value && activeTenantId.value !== DEFAULT_TENANT_ID,
  );

  function resolveOptionName(tenantId: string, fallback?: string | null): string {
    if (tenantId === DEFAULT_TENANT_ID) {
      return fallback?.trim() || DEFAULT_TENANT_NAME;
    }
    const matched = tenantOptions.value.find(option => option.id === tenantId);
    return fallback?.trim() || matched?.tenantName || tenantId;
  }

  async function applyTenantResetAndReload(
    nextTenantId: string,
    router?: Router,
  ): Promise<AdminProfileVO> {
    // 1. 写入并持久化工作租户 X-Tenant-Id
    tenant.setTenantId(nextTenantId);
    // 2. 清空跨租户字典缓存
    DictManager.clearCache();
    // 3. 清理除 affix 之外的页签缓存
    appStore.resetNonAffixTabs();
    // 4. 卸载旧租户视角的动态路由
    permissionStore.resetRoutes(router);
    // 5. 并行重拉新视角用户身份与动态菜单树并重建路由
    const [profile] = await Promise.all([
      authStore.fetchUserInfo(),
      permissionStore.buildRoutes(router),
    ]);
    return profile;
  }

  /**
   * 登录成功阶段登记原始归属租户标识、同步租户请求头与初始展示名称。
   *
   * @param tenantId 服务端返回的生效租户主键
   * @param tenantName 服务端返回的租户名称
   */
  function recordLoginTenant(tenantId: string, tenantName?: string | null): void {
    const normalizedId = tenantId?.trim() || DEFAULT_TENANT_ID;
    ownerTenantId.value = normalizedId;
    if (tenant.tenantId.value !== normalizedId) {
      tenant.setTenantId(normalizedId);
    }
    activeTenantName.value = resolveOptionName(normalizedId, tenantName);
  }

  /**
   * 根据 /admin/auth/info 返回的用户身份同步归属租户，防范普通用户伪造头并纠正单租户残留态。
   *
   * @param profile 当前用户信息摘要
   */
  function initForUser(profile: AdminProfileVO): void {
    const profileTenantId = profile.tenantId?.trim() || DEFAULT_TENANT_ID;
    const isSuperAdmin = authStore.hasRole('super_admin');

    if (isSuperAdmin) {
      ownerTenantId.value = DEFAULT_TENANT_ID;
      // 单租户模式关闭时清理本地可能残留的非平台租户标识，保证始终工作于 '0'
      if (!authStore.tenantEnabled && tenant.tenantId.value !== DEFAULT_TENANT_ID) {
        tenant.setTenantId(DEFAULT_TENANT_ID);
      }
      activeTenantName.value = resolveOptionName(activeTenantId.value, profile.tenantName);
      return;
    }

    // 普通用户严禁写入或保留非归属 tenantId，强制锁定其真实所属租户
    ownerTenantId.value = profileTenantId;
    if (tenant.tenantId.value !== profileTenantId) {
      tenant.setTenantId(profileTenantId);
    }
    activeTenantName.value = resolveOptionName(profileTenantId, profile.tenantName);
  }

  /**
   * 拉取平台超管可供切换的正常未过期租户列表；无切换权限时保底清空为空数组。
   *
   * @returns 可选租户列表
   */
  async function loadTenantOptions(): Promise<TenantOptionVO[]> {
    if (!isSuperAdminTenantSwitchAllowed.value) {
      tenantOptions.value = [];
      return [];
    }
    const options = await getTenantOptions();
    tenantOptions.value = options;
    return options;
  }

  /**
   * 清空本地多租户状态并复位至平台默认租户 '0'（供登出或 401/101005 会话终止调用）。
   */
  function resetLocalTenant(): void {
    ownerTenantId.value = DEFAULT_TENANT_ID;
    tenant.setTenantId(DEFAULT_TENANT_ID);
    activeTenantName.value = DEFAULT_TENANT_NAME;
    tenantOptions.value = [];
  }

  /**
   * 遇 100002（目标租户不可用）时将视角安全回退至平台租户 '0'，严禁注销平台超管登录态。
   *
   * @param router 可选 Vue Router 实例
   */
  async function recoverFromInvalidTenant(router?: Router): Promise<void> {
    if (recoveryPromise) {
      await recoveryPromise;
      return;
    }

    recoveryPromise = (async () => {
      try {
        await applyTenantResetAndReload(DEFAULT_TENANT_ID, router);
      } finally {
        activeTenantName.value = DEFAULT_TENANT_NAME;
        if (router && router.currentRoute.value.path !== '/dashboard') {
          await router.replace('/dashboard');
        }
      }
    })();

    try {
      await recoveryPromise;
    } finally {
      recoveryPromise = null;
    }
  }

  /**
   * 响应全局 HTTP 100002 拦截回调：当非 switchTenant 内部流程触发时执行单次平台回退。
   *
   * @param router 可选 Vue Router 实例
   */
  async function handleHttpInvalidTenantSwitch(router?: Router): Promise<void> {
    if (switching.value || recoveryPromise) {
      return;
    }
    await recoverFromInvalidTenant(router);
  }

  /**
   * 平台超管按严格 7 步强时序切换工作租户视角；普通租户或越权切换一律拒绝返回 false。
   *
   * @param targetTenantId 目标租户主键（'0' 表示切回平台默认租户）
   * @param router 可选 Vue Router 实例，用于动态路由卸载、重建与不可见路径回退
   * @returns 切换是否成功完成
   */
  async function switchTenant(targetTenantId: string, router?: Router): Promise<boolean> {
    if (!isSuperAdminTenantSwitchAllowed.value) {
      if (tenant.tenantId.value !== ownerTenantId.value) {
        tenant.setTenantId(ownerTenantId.value);
      }
      return false;
    }
    if (switching.value) {
      return false;
    }

    const nextTenantId = targetTenantId.trim() || DEFAULT_TENANT_ID;
    switching.value = true;

    try {
      const profile = await applyTenantResetAndReload(nextTenantId, router);
      // 6. 校验当前所在路由在目标视角下是否仍然可达，不可见时自动回退 /dashboard
      if (router) {
        const currentPath = router.currentRoute.value.path;
        if (
          !STATIC_ACCESSIBLE_PATHS.has(currentPath) &&
          !permissionStore.hasMenuPath(currentPath)
        ) {
          await router.replace('/dashboard');
        }
      }
      // 7. 刷新工作租户展示名称
      activeTenantName.value = resolveOptionName(nextTenantId, profile.tenantName);
      return true;
    } catch (error) {
      if (isInvalidTenantSwitchError(error)) {
        await recoverFromInvalidTenant(router);
        return false;
      }
      throw error;
    } finally {
      switching.value = false;
    }
  }

  /**
   * 平台超管一键切回平台默认租户（'0'）。
   *
   * @param router 可选 Vue Router 实例
   * @returns 是否成功切回
   */
  async function resetToPlatform(router?: Router): Promise<boolean> {
    return switchTenant(DEFAULT_TENANT_ID, router);
  }

  return {
    ownerTenantId,
    activeTenantId,
    activeTenantName,
    tenantOptions,
    switching,
    isSuperAdminTenantSwitchAllowed,
    isObservingTenant,
    recordLoginTenant,
    initForUser,
    loadTenantOptions,
    resetLocalTenant,
    recoverFromInvalidTenant,
    handleHttpInvalidTenantSwitch,
    switchTenant,
    resetToPlatform,
  };
});
