import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';
import type { TabBatchClosePayload, TabItem } from '@atengk/element-plus';
import type { SidebarMenuGroup, SidebarMenuItem } from '@/types/router';

/**
 * 方案 A 布局域公共路由常量、断点标尺与扁平菜单导航助手。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export const ADMIN_HOME_PATH = '/dashboard';
export const ADMIN_PROFILE_PATH = '/profile';
export const DEFAULT_PLATFORM_TENANT_NAME = '平台默认租户';
export const MOBILE_BREAKPOINT_PX = 768;
export const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

/**
 * 带所属领域分组信息的扁平菜单导航条目。
 */
export interface FlattenedMenuNavigationItem extends SidebarMenuItem {
  /**
   * 所属领域分组标题。
   */
  groupTitle: string;
}

/**
 * 将后端下发并分组后的侧边栏树拍平为一维可见导航列表，供侧栏索引与命令面板检索复用。
 *
 * @param groups 侧边栏领域分组列表
 * @returns 附带分组标题的一维可见菜单集合
 */
export function flattenSidebarItems(groups: SidebarMenuGroup[]): FlattenedMenuNavigationItem[] {
  const flattened: FlattenedMenuNavigationItem[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      flattened.push({
        ...item,
        groupTitle: group.title,
      });
    }
  }
  return flattened;
}

/**
 * 安全打开外链或执行站内路由导航。
 *
 * @param router Vue Router 实例
 * @param targetPath 目标站内路径或外部 URL
 * @param isExternal 是否外链
 */
export async function navigateMenuTarget(
  router: Router,
  targetPath: string,
  isExternal = false,
): Promise<void> {
  if (isExternal) {
    window.open(targetPath, '_blank', 'noopener,noreferrer');
    return;
  }
  if (router.currentRoute.value.path !== targetPath) {
    await router.push(targetPath);
  }
}

/**
 * 判断路由是否允许自动同步为多标签页签。
 *
 * @param targetRoute 当前路由位置对象
 * @returns 非异常/登录页且配置了标题时返回 `true`
 */
export function isTabSyncableRoute(targetRoute: RouteLocationNormalizedLoaded): boolean {
  if (targetRoute.path === '/login' || targetRoute.path === '/403' || targetRoute.path === '/404') {
    return false;
  }
  return Boolean(targetRoute.meta.title);
}

/**
 * 解析路由在多标签页签栏中的唯一键（个人中心 `/profile` 统一合并页签以复用子页签切换状态）。
 *
 * @param targetRoute 当前路由位置对象
 * @returns 页签唯一标识 `key`
 */
export function resolveTabKey(targetRoute: RouteLocationNormalizedLoaded): string {
  if (targetRoute.path === ADMIN_PROFILE_PATH) {
    return ADMIN_PROFILE_PATH;
  }
  return targetRoute.fullPath;
}

/**
 * 将当前激活路由映射为标准 `TabItem` 描述。
 *
 * @param targetRoute 当前路由位置对象
 * @returns 标准页签对象
 */
export function resolveTabFromRoute(targetRoute: RouteLocationNormalizedLoaded): TabItem {
  const rawTitle = targetRoute.meta.title;
  const title =
    typeof rawTitle === 'string' && rawTitle.trim().length > 0 ? rawTitle : targetRoute.path;
  const rawIcon = targetRoute.meta.icon;
  const icon =
    typeof rawIcon === 'string' && rawIcon.trim().length > 0
      ? rawIcon
      : targetRoute.path === ADMIN_HOME_PATH
        ? 'HomeFilled'
        : undefined;
  const componentName =
    targetRoute.meta.keepAlive && typeof targetRoute.name === 'string'
      ? targetRoute.name
      : undefined;

  return {
    key: resolveTabKey(targetRoute),
    title,
    icon,
    affix: Boolean(targetRoute.meta.affix) || targetRoute.path === ADMIN_HOME_PATH,
    closable: !(Boolean(targetRoute.meta.affix) || targetRoute.path === ADMIN_HOME_PATH),
    componentName,
    meta: { fullPath: targetRoute.fullPath },
  };
}

/**
 * 从页签对象还原包含查询参数的真实目标跳转路径。
 *
 * @param tab 页签条目
 * @returns 可直接用于 `router.push` 的路径串
 */
export function resolveTabTargetPath(tab: Pick<TabItem, 'key' | 'meta'>): string {
  const storedFullPath = tab.meta?.fullPath;
  return typeof storedFullPath === 'string' && storedFullPath.length > 0 ? storedFullPath : tab.key;
}

/**
 * 依据 `AtengTabsNav` 批量关闭事件载荷计算剩余页签中的锚点键。
 *
 * @param payload 批量关闭载荷
 * @param currentActiveKey 当前激活页签键
 * @returns 用于单源批关闭调用的锚点页签键
 */
export function resolveBatchAnchorKey(
  payload: TabBatchClosePayload,
  currentActiveKey: string,
): string {
  if (payload.command === 'closeOthers') {
    return payload.nextActiveKey || currentActiveKey;
  }
  if (payload.nextActiveKey && payload.nextActiveKey !== currentActiveKey) {
    return payload.nextActiveKey;
  }
  if (payload.command === 'closeLeft') {
    return payload.remainingTabs.find(tab => !tab.affix)?.key ?? currentActiveKey;
  }
  if (payload.command === 'closeRight') {
    const nonAffixTabs = payload.remainingTabs.filter(tab => !tab.affix);
    return nonAffixTabs[nonAffixTabs.length - 1]?.key ?? currentActiveKey;
  }
  return currentActiveKey;
}
