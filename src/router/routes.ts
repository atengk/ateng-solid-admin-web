import type { RouteRecordRaw } from 'vue-router';

/**
 * 管理端静态基础路由定义（登录、RootLayout 壳、工作台、个人中心与 403/404 异常页）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 匿名未登录态下允许直接访问的公开白名单路径集合（不含 404，未知路径未登录一律跳登录）。
 */
export const ANONYMOUS_WHITELIST_PATHS = new Set(['/login', '/403']);

/**
 * 静态注册的已登录基础业务路由路径集合（全员可见）。
 */
export const STATIC_BUSINESS_PATHS = new Set(['/dashboard', '/profile']);

export const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: {
      title: '登录',
      public: true,
      hidden: true,
    },
  },
  {
    path: '/',
    name: 'RootLayout',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/dashboard',
    meta: {
      requiresAuth: true,
    },
    children: [
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index.vue'),
        meta: {
          title: '工作台',
          affix: true,
          keepAlive: true,
          requiresAuth: true,
        },
      },
      {
        path: '/profile',
        name: 'Profile',
        component: () => import('@/views/profile/index.vue'),
        meta: {
          title: '个人中心',
          hidden: true,
          requiresAuth: true,
        },
      },
    ],
  },
  {
    path: '/403',
    name: 'Forbidden',
    component: () => import('@/views/error/403.vue'),
    meta: {
      title: '暂无权限',
      public: true,
      hidden: true,
    },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/error/404.vue'),
    meta: {
      title: '页面不存在',
      public: true,
      hidden: true,
    },
  },
];
