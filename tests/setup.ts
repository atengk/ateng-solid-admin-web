import { afterEach, beforeEach, vi } from 'vitest';
import { useAuth } from '@atengk/vue';
import { DictManager } from '@atengk/element-plus';
import { adminAuthManager, adminTenantManager, resetHttpInterceptorState } from '@/utils/http';

/**
 * Vitest 全量用例确定性隔离钩子（在每个测试前后强制重置本地存储、字典缓存、单态凭据与 Mock 状态）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
function cleanupTestIsolationState(): void {
  localStorage.clear();
  sessionStorage.clear();
  DictManager.clearCache();
  useAuth({ authManager: adminAuthManager, superAdminRoles: ['super_admin'] }).logout();
  adminTenantManager.clearTenantId();
  resetHttpInterceptorState();
  vi.restoreAllMocks();
}

beforeEach(cleanupTestIsolationState);
afterEach(cleanupTestIsolationState);
