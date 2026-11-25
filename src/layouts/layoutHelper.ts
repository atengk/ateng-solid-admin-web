import type { Router } from 'vue-router';
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
