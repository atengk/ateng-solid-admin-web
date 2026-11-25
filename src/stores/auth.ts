import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { Router } from 'vue-router';
import { DictManager } from '@atengk/element-plus';
import { useAuth, type PermissionMatchMode } from '@atengk/vue';
import {
  getAuthInfo,
  login as loginApi,
  logout as logoutApi,
  type AdminLoginRequest,
  type AdminLoginVO,
  type AdminProfileVO,
} from '@/api/auth';
import { adminAuthManager, DEFAULT_TENANT_ID } from '@/utils/http';
import { useAppStore } from '@/stores/app';
import { usePermissionStore } from '@/stores/permission';
import { useTenantStore } from '@/stores/tenant';

const TENANT_ENABLED_STORAGE_KEY = 'solid-tenant-enabled';
const SUPER_ADMIN_ROLES = ['super_admin'];

function readStoredTenantEnabled(): boolean {
  if (typeof localStorage === 'undefined') {
    return false;
  }
  try {
    return localStorage.getItem(TENANT_ENABLED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredTenantEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(TENANT_ENABLED_STORAGE_KEY, String(enabled));
  } catch {
    // 存储空间受限或无权限时静默忽略
  }
}

/**
 * 认证与权限 Pinia Setup Store。
 * 直接代理 @atengk/vue useAuth 底层 WeakMap 响应式状态，保证与 v-permission / v-role 指令单源零漂移。
 *
 * @author Ateng
 * @since 2026-11-25
 */
export const useAuthStore = defineStore('auth', () => {
  const auth = useAuth<AdminProfileVO>({
    authManager: adminAuthManager,
    superAdminRoles: SUPER_ADMIN_ROLES,
  });

  const isInitialized = ref<boolean>(false);
  const tenantEnabled = ref<boolean>(readStoredTenantEnabled());

  /**
   * 同步更新多租户功能开关状态（来源于登录前置 /admin/auth/captcha 或运行期兜底推断）。
   *
   * @param enabled 是否开启 SaaS 多租户
   */
  function setTenantEnabled(enabled: boolean): void {
    tenantEnabled.value = enabled;
    writeStoredTenantEnabled(enabled);
  }

  function inferTenantEnabledFromId(tenantId?: string | null): void {
    if (tenantId && tenantId !== DEFAULT_TENANT_ID && !tenantEnabled.value) {
      setTenantEnabled(true);
    }
  }

  /**
   * 执行管理端登录并将返回令牌与租户 ID 写入三单例上下文。
   *
   * @param dto 登录表单载荷
   * @returns 服务端签发令牌与生效租户摘要
   */
  async function login(dto: AdminLoginRequest): Promise<AdminLoginVO> {
    const result = await loginApi(dto);
    const effectiveTenantId = result.tenantId?.trim() || DEFAULT_TENANT_ID;
    inferTenantEnabledFromId(effectiveTenantId);

    useTenantStore().recordLoginTenant(effectiveTenantId, result.tenantName);
    auth.login({ token: result.tokenValue });
    isInitialized.value = false;
    return result;
  }

  /**
   * 从 /admin/auth/info 拉取当前用户摘要、角色与扁平权限集合，并同步更新租户上下文。
   *
   * @returns 最新认证身份摘要
   */
  async function fetchUserInfo(): Promise<AdminProfileVO> {
    const profile = await getAuthInfo();
    const roles = profile.roles ?? [];
    const permissions = profile.permissions ?? [];

    inferTenantEnabledFromId(profile.tenantId);

    auth.setUser(profile);
    auth.setRoles(roles);
    auth.setPermissions(permissions);
    useTenantStore().initForUser(profile);
    isInitialized.value = true;
    return profile;
  }

  /**
   * 同步执行全端本地会话清理：清除认证态、租户复位 '0'、清空字典缓存并卸载动态路由与页签。
   *
   * @param router 可选 Vue Router 实例（传入时逐一移除动态路由）
   */
  function clearLocalSession(router?: Router): void {
    auth.logout();
    isInitialized.value = false;
    useTenantStore().resetLocalTenant();
    DictManager.clearCache();
    useAppStore().resetNonAffixTabs();
    usePermissionStore().resetRoutes(router);
  }

  /**
   * 注销登录态并在传入路由实例时重定向至 /login（可选携带 redirect 目标）。
   *
   * @param opts 注销参数（remote=false 时跳过服务端注销请求；支持指定 router 与 redirect）
   */
  async function logout(opts?: {
    remote?: boolean;
    redirect?: string;
    router?: Router;
  }): Promise<void> {
    const hasToken = Boolean(auth.token.value || adminAuthManager.getToken());
    if (opts?.remote !== false && hasToken) {
      try {
        await logoutApi();
      } catch {
        // 会话若已过期或网络故障，仍须继续执行本地彻底清理
      }
    }

    clearLocalSession(opts?.router);

    if (opts?.router) {
      const redirect = opts.redirect?.trim();
      await opts.router.replace({
        path: '/login',
        query: redirect && redirect !== '/login' ? { redirect } : undefined,
      });
    }
  }

  /**
   * 校验细粒度权限编码（支持通配符匹配，super_admin 全局放行）。
   *
   * @param code 单个权限标识或权限标识集合
   * @param mode 数组匹配模式（默认 'some'）
   * @returns 是否校验通过
   */
  function hasPermission(code: string | string[], mode?: PermissionMatchMode): boolean {
    return auth.hasPermission(code, mode);
  }

  /**
   * 严格校验用户真实拥有角色编码（super_admin 角色亦按真实数组匹配，不触发免检）。
   *
   * @param role 单个角色编码或角色编码集合
   * @param mode 数组匹配模式（默认 'some'）
   * @returns 是否持有对应角色
   */
  function hasRole(role: string | string[], mode?: PermissionMatchMode): boolean {
    return auth.hasRole(role, mode);
  }

  /**
   * 直接向底层 authManager 同步刷新令牌（供测试或外部初始化补齐 Token 状态）。
   */
  function syncTokenFromManager(): void {
    const persisted = adminAuthManager.getToken();
    if (persisted && auth.token.value !== persisted) {
      auth.login({
        token: persisted,
        roles: [...auth.roles.value],
        permissions: [...auth.permissions.value],
        user: auth.user.value as AdminProfileVO | undefined,
      });
    }
  }

  return {
    token: auth.token,
    isAuthenticated: auth.isAuthenticated,
    user: auth.user,
    roles: auth.roles,
    permissions: auth.permissions,
    isInitialized,
    tenantEnabled,
    setTenantEnabled,
    login,
    fetchUserInfo,
    logout,
    clearLocalSession,
    hasPermission,
    hasRole,
    syncTokenFromManager,
  };
});
