import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { RouteComponent, RouteRecordRaw, Router } from 'vue-router';
import { getAuthRoutes, type RouteMenuVO } from '@/api/auth';
import type { SidebarMenuGroup, SidebarMenuItem } from '@/types/router';

type AsyncRouteView = () => Promise<RouteComponent>;

// 动态视图扫描映射表（Vite 编译期静态提取 src/views 下全部 SFC）
const VIEW_MODULES = import.meta.glob<RouteComponent>('../views/**/*.vue') as Record<
  string,
  AsyncRouteView
>;
const FALLBACK_NOT_FOUND_VIEW: AsyncRouteView = () => import('@/views/error/404.vue');
const EXTERNAL_URL_PATTERN = /^(https?:)?\/\//i;

function normalizeViewKey(rawComponent?: string | null): string | undefined {
  if (!rawComponent) {
    return undefined;
  }
  const trimmed = rawComponent
    .trim()
    .replace(/^\/+/, '')
    .replace(/\.vue$/i, '');
  return trimmed || undefined;
}

function resolveDynamicViewComponent(rawComponent?: string | null): AsyncRouteView {
  const normalized = normalizeViewKey(rawComponent);
  if (!normalized) {
    return FALLBACK_NOT_FOUND_VIEW;
  }
  const directKey = `../views/${normalized}.vue`;
  const indexKey = `../views/${normalized}/index.vue`;
  return VIEW_MODULES[directKey] ?? VIEW_MODULES[indexKey] ?? FALLBACK_NOT_FOUND_VIEW;
}

function normalizeInternalPath(rawPath?: string | null): string {
  const trimmed = rawPath?.trim() ?? '';
  if (!trimmed) {
    return '/';
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function isExternalMenu(node: RouteMenuVO): boolean {
  return Boolean(node.isExternal) || EXTERNAL_URL_PATTERN.test(node.path.trim());
}

function sortByOrder<T extends { sort?: number | null }>(items: T[]): T[] {
  return [...items].sort((left, right) => (left.sort ?? 0) - (right.sort ?? 0));
}

function collectVisibleItems(nodes: RouteMenuVO[]): SidebarMenuItem[] {
  const items: SidebarMenuItem[] = [];
  for (const node of sortByOrder(nodes)) {
    if (node.visible !== 0) {
      continue;
    }
    if (node.menuType === 'C') {
      items.push({
        id: node.id,
        title: node.title,
        name: node.name,
        path: isExternalMenu(node) ? node.path.trim() : normalizeInternalPath(node.path),
        icon: node.icon,
        sort: node.sort ?? 0,
        platformOnly: Boolean(node.platformOnly),
        keepAlive: Boolean(node.keepAlive),
        isExternal: isExternalMenu(node),
      });
    } else if (node.menuType === 'M' && node.children.length > 0) {
      items.push(...collectVisibleItems(node.children));
    }
  }
  return items;
}

interface DynamicRouteNode {
  menu: RouteMenuVO;
  groupTitle?: string;
}

function collectRoutableMenus(nodes: RouteMenuVO[], groupTitle?: string): DynamicRouteNode[] {
  const collected: DynamicRouteNode[] = [];
  for (const node of sortByOrder(nodes)) {
    if (node.menuType === 'M') {
      collected.push(...collectRoutableMenus(node.children, node.title));
      continue;
    }
    if (node.menuType === 'C' && !isExternalMenu(node)) {
      collected.push({ menu: node, groupTitle });
    }
  }
  return collected;
}

/**
 * 权限菜单与动态路由 Pinia Setup Store（纯内存状态，禁止写入本地持久存储）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
export const usePermissionStore = defineStore('permission', () => {
  const rawMenus = ref<RouteMenuVO[]>([]);
  const routesLoaded = ref(false);
  const registeredRouteNames = ref<string[]>([]);

  const sidebarGroups = computed<SidebarMenuGroup[]>(() => {
    const groups: SidebarMenuGroup[] = [];
    const rootItems: SidebarMenuItem[] = [];

    for (const node of sortByOrder(rawMenus.value)) {
      if (node.visible !== 0) {
        continue;
      }
      if (node.menuType === 'M') {
        const items = collectVisibleItems(node.children);
        if (items.length === 0) {
          continue;
        }
        groups.push({
          id: node.id,
          title: node.title,
          path: normalizeInternalPath(node.path),
          icon: node.icon,
          sort: node.sort ?? 0,
          platformOnly: Boolean(node.platformOnly),
          items,
        });
      } else if (node.menuType === 'C') {
        rootItems.push(...collectVisibleItems([node]));
      }
    }

    if (rootItems.length > 0) {
      groups.unshift({
        id: 'root',
        title: '快捷功能',
        path: '/',
        sort: -1,
        platformOnly: false,
        items: rootItems,
      });
    }

    return groups;
  });

  const accessibleRoutePaths = computed<string[]>(() =>
    collectRoutableMenus(rawMenus.value).map(({ menu }) => normalizeInternalPath(menu.path)),
  );

  const hasAccessibleMenus = computed<boolean>(() => accessibleRoutePaths.value.length > 0);

  function unregisterDynamicRoutes(router?: Router): void {
    if (router) {
      for (const name of registeredRouteNames.value) {
        if (router.hasRoute(name)) {
          router.removeRoute(name);
        }
      }
    }
    registeredRouteNames.value = [];
  }

  /**
   * 从后端拉取动态菜单树、构建侧栏分组并注册动态路由至 Vue Router。
   *
   * @param router Vue Router 实例（单测无路由实例时可省略）
   * @returns 规范化后的嵌套菜单树集合
   */
  async function buildRoutes(router?: Router): Promise<RouteMenuVO[]> {
    const menus = await getAuthRoutes();
    unregisterDynamicRoutes(router);

    const routableNodes = collectRoutableMenus(menus);
    const addedNames: string[] = [];

    if (router) {
      const parentName = router.hasRoute('RootLayout') ? 'RootLayout' : undefined;
      for (const { menu, groupTitle } of routableNodes) {
        const routeName = menu.name?.trim() || `DynamicMenu_${menu.id}`;
        const routeRecord: RouteRecordRaw = {
          name: routeName,
          path: normalizeInternalPath(menu.path),
          component: resolveDynamicViewComponent(menu.component),
          meta: {
            title: menu.title,
            icon: menu.icon ?? undefined,
            hidden: menu.visible !== 0,
            requiresAuth: true,
            keepAlive: Boolean(menu.keepAlive),
            isExternal: false,
            platformOnly: Boolean(menu.platformOnly),
            menuId: menu.id,
            groupTitle,
          },
        };
        if (parentName) {
          router.addRoute(parentName, routeRecord);
        } else {
          router.addRoute(routeRecord);
        }
        addedNames.push(routeName);
      }
    }

    rawMenus.value = menus;
    registeredRouteNames.value = addedNames;
    routesLoaded.value = true;
    return menus;
  }

  /**
   * 精确卸载所有动态注册路由并重置纯内存菜单状态。
   *
   * @param router Vue Router 实例（可选）
   */
  function resetRoutes(router?: Router): void {
    unregisterDynamicRoutes(router);
    rawMenus.value = [];
    routesLoaded.value = false;
  }

  /**
   * 判断指定业务路径是否在当前动态菜单视角内可见（供切租户后路由校准使用）。
   *
   * @param path 目标路由路径
   * @returns 是否属于当前菜单表内的有效路径
   */
  function hasMenuPath(path: string): boolean {
    const normalized = normalizeInternalPath(path);
    return accessibleRoutePaths.value.includes(normalized);
  }

  return {
    rawMenus,
    routesLoaded,
    registeredRouteNames,
    sidebarGroups,
    accessibleRoutePaths,
    hasAccessibleMenus,
    buildRoutes,
    resetRoutes,
    hasMenuPath,
  };
});
