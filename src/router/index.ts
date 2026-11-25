import { createRouter, createWebHistory, type Router, type RouterHistory } from 'vue-router';
import { staticRoutes } from '@/router/routes';

/**
 * 创建管理端 Vue Router 实例（支持传入 MemoryHistory 用于离线测试隔离）。
 *
 * @param history 可选历史模式实现，默认使用 WebHistory
 * @returns 配置完成的 Router 实例
 * @author Ateng
 * @since 2026-11-25
 */
export function createAppRouter(history?: RouterHistory): Router {
  return createRouter({
    history: history ?? createWebHistory(import.meta.env.BASE_URL),
    routes: staticRoutes,
  });
}

export const router = createAppRouter();
export default router;
