import type { Pinia } from 'pinia';
import type { RouteLocationRaw, Router } from 'vue-router';
import { AtengLoadingBar } from '@atengk/element-plus';
import { ANONYMOUS_WHITELIST_PATHS, STATIC_BUSINESS_PATHS } from '@/router/routes';
import { useAuthStore } from '@/stores/auth';
import { usePermissionStore } from '@/stores/permission';
import { useTenantStore } from '@/stores/tenant';
import { awaitAllSettledRequests, isInvalidTenantSwitchError } from '@/utils/http';

const REJECTED_REDIRECT_PREFIXES = ['/login', '/403', '/404'];
const SAFE_HOST_BASE = 'http://localhost';

function tryDecodeRecursively(raw: string, maxRounds = 2): string | undefined {
  let current = raw;
  for (let i = 0; i < maxRounds; i += 1) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) {
        return current;
      }
      current = next;
    } catch {
      return undefined;
    }
  }
  return current;
}

function hasUnsafeControlOrSlash(candidate: string): boolean {
  if (!candidate.startsWith('/')) {
    return true;
  }
  if (candidate.startsWith('//') || candidate.startsWith('/\\') || candidate.includes('\\')) {
    return true;
  }
  return /[\r\n\t\0]/.test(candidate);
}

/**
 * 校验登录或会话回跳的 redirect 参数，严格限制为站内单斜杠相对路径，阻断 Open Redirect 漏洞。
 *
 * @param rawRedirect 路由 Query 中的原始 redirect 值
 * @returns 校验合法的站内相对路径（保留查询串与哈希）；非法、外链或命中登录/错误页时返回 undefined
 * @author Ateng
 * @since 2026-11-25
 */
export function sanitizeRedirectTarget(rawRedirect: unknown): string | undefined {
  const candidate = Array.isArray(rawRedirect) ? rawRedirect[0] : rawRedirect;
  if (typeof candidate !== 'string') {
    return undefined;
  }
  const trimmed = candidate.trim();
  if (!trimmed || hasUnsafeControlOrSlash(trimmed)) {
    return undefined;
  }

  const decoded = tryDecodeRecursively(trimmed);
  if (!decoded || hasUnsafeControlOrSlash(decoded)) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed, SAFE_HOST_BASE);
    if (parsed.origin !== SAFE_HOST_BASE) {
      return undefined;
    }
    const decodedPathname = tryDecodeRecursively(parsed.pathname);
    if (!decodedPathname || hasUnsafeControlOrSlash(decodedPathname)) {
      return undefined;
    }
    if (/^\/[a-z][a-z0-9+.-]*:/i.test(decodedPathname)) {
      return undefined;
    }
    const isRejectedPage = REJECTED_REDIRECT_PREFIXES.some(
      prefix => decodedPathname === prefix || decodedPathname.startsWith(`${prefix}/`),
    );
    if (isRejectedPage) {
      return undefined;
    }
    return trimmed;
  } catch {
    return undefined;
  }
}

function buildLoginRedirectLocation(fullPath: string): RouteLocationRaw {
  const safeRedirect = sanitizeRedirectTarget(fullPath);
  return {
    path: '/login',
    query: safeRedirect ? { redirect: safeRedirect } : undefined,
  };
}

/**
 * 解析登录或会话恢复后的最终站内重定向目标：须满足同源单斜杠白名单且具备访问权限，否则安全回落 `/dashboard`。
 *
 * @param rawRedirect 路由 Query 中的原始 redirect 值
 * @param permissionStore 当前权限菜单状态仓库
 * @returns 可安全跳转的站内路径
 */
export function resolveAuthenticatedRedirectTarget(
  rawRedirect: unknown,
  permissionStore: ReturnType<typeof usePermissionStore>,
): string {
  const safeTarget = sanitizeRedirectTarget(rawRedirect);
  if (!safeTarget) {
    return '/dashboard';
  }
  const pathname = new URL(safeTarget, SAFE_HOST_BASE).pathname;
  if (STATIC_BUSINESS_PATHS.has(pathname) || permissionStore.hasMenuPath(pathname)) {
    return safeTarget;
  }
  // 切换低权限账号或原菜单失效时，统一安全回落 /dashboard 而非直接落入 403/404
  return '/dashboard';
}

/**
 * 挂载管理端全域导航守卫：处理匿名白名单、同源且有权 redirect、首次认证与动态路由拉取、零菜单保护及加载进度条。
 *
 * @param router Vue Router 实例
 * @param pinia Pinia 实例（确保脱离组件 setup() 准确解析全局 Store）
 * @returns 用于清理已挂载守卫钩子的卸载函数
 * @author Ateng
 * @since 2026-11-25
 */
export function setupRouterGuards(router: Router, pinia: Pinia): () => void {
  let initializingPromise: Promise<void> | null = null;

  async function ensureSessionInitialized(): Promise<void> {
    if (initializingPromise) {
      return initializingPromise;
    }

    const authStore = useAuthStore(pinia);
    const permissionStore = usePermissionStore(pinia);

    initializingPromise = (async () => {
      await awaitAllSettledRequests([
        authStore.fetchUserInfo(),
        permissionStore.buildRoutes(router),
      ]);
    })();

    try {
      await initializingPromise;
    } finally {
      initializingPromise = null;
    }
  }

  async function initializeSessionWithRecovery(): Promise<'ok' | 'recovered' | 'failed'> {
    const tenantStore = useTenantStore(pinia);
    tenantStore.setGuardInitializationActive(true);
    try {
      await ensureSessionInitialized();
      return 'ok';
    } catch (error) {
      if (!isInvalidTenantSwitchError(error)) {
        return 'failed';
      }
      try {
        // 100002（本地残留失效租户 ID）：待并发初始化全量结算后复位至平台租户 '0' 重拉，绝不注销超管会话
        await tenantStore.recoverFromInvalidTenant(router, { skipRedirect: true });
        return 'recovered';
      } catch {
        return 'failed';
      }
    } finally {
      tenantStore.setGuardInitializationActive(false);
    }
  }

  const removeBeforeEach = router.beforeEach(async to => {
    AtengLoadingBar.start();

    const authStore = useAuthStore(pinia);
    const permissionStore = usePermissionStore(pinia);
    authStore.syncTokenFromManager();

    // 1. 未登录态：仅放行公开白名单（/login、/403），其余路径（含未知路径）统一跳转登录页
    if (!authStore.isAuthenticated) {
      if (ANONYMOUS_WHITELIST_PATHS.has(to.path)) {
        return true;
      }
      return buildLoginRedirectLocation(to.fullPath);
    }

    const isErrorFallbackPath = to.path === '/403' || to.path === '/404';

    // 2. 首次进入或浏览器刷新后，并行拉取当前用户身份与动态路由表（含直达 /403、/404 时补齐菜单与布局状态）
    if (!authStore.isInitialized || !permissionStore.routesLoaded) {
      const initStatus = await initializeSessionWithRecovery();
      if (initStatus === 'failed') {
        AtengLoadingBar.error();
        authStore.clearLocalSession(router);
        return buildLoginRedirectLocation(to.fullPath);
      }

      if (initStatus === 'recovered') {
        return to.fullPath === '/dashboard' ? true : { path: '/dashboard', replace: true };
      }

      if (to.path === '/login') {
        return resolveAuthenticatedRedirectTarget(to.query.redirect, permissionStore);
      }

      if (isErrorFallbackPath) {
        return true;
      }

      // 动态 addRoute 生效后触发原地址替换重匹配，确保深链刷新命中真实业务视图
      return {
        path: to.path,
        query: to.query,
        hash: to.hash,
        replace: true,
      };
    }

    // 3. 已完成初始化态访问错误兜底页直接放行，避免触发冗余拉取或死循环
    if (isErrorFallbackPath) {
      return true;
    }

    // 4. 已完成初始化且访问登录页：按同源且权限可达校验后跳转回目标页或默认工作台
    if (to.path === '/login') {
      return resolveAuthenticatedRedirectTarget(to.query.redirect, permissionStore);
    }

    // 5. 零菜单保护：无任何可用动态菜单时访问未命中路径统一引导至 /403（附退出出口）
    if (!permissionStore.hasAccessibleMenus && to.name === 'NotFound') {
      return '/403';
    }

    return true;
  });

  const removeAfterEach = router.afterEach(() => {
    AtengLoadingBar.finish();
  });

  const removeOnError = router.onError(() => {
    AtengLoadingBar.error();
  });

  return () => {
    removeBeforeEach();
    removeAfterEach();
    removeOnError();
  };
}
