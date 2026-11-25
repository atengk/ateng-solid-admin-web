import type { InjectionKey } from 'vue';
import 'vue-router';

/**
 * 管理后台动态路由元信息与侧边栏分组展示契约类型。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 方案 A 布局页签关闭协调上下文（供子孙异常页关闭当前失效页签使用）。
 */
export interface SolidLayoutTabsContext {
  /**
   * 关闭指定路径页签（省略时关闭当前激活页签）并在关闭当前页签后自动激活回退路由。
   */
  closeCurrentTab: (key?: string) => Promise<void> | void;
}

/**
 * 方案 A 布局页签协同注入标识。
 */
export const SOLID_LAYOUT_TABS_KEY: InjectionKey<SolidLayoutTabsContext> =
  Symbol('SOLID_LAYOUT_TABS_KEY');

/**
 * 侧边栏叶子菜单项结构（由 RouteMenuVO 中可见的 C 节点规范化映射）。
 */
export interface SidebarMenuItem {
  /**
   * 菜单主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 菜单标题
   */
  title: string;
  /**
   * 前端路由组件名称（PascalCase，用于 KeepAlive 精确缓存）
   */
  name?: string | null;
  /**
   * 路由路径或外链 URL
   */
  path: string;
  /**
   * 菜单图标标识
   */
  icon?: string | null;
  /**
   * 同级排序值（升序）
   */
  sort: number;
  /**
   * 是否为平台专属菜单
   */
  platformOnly: boolean;
  /**
   * 是否启用页面 KeepAlive 缓存
   */
  keepAlive: boolean;
  /**
   * 是否为外链跳转节点
   */
  isExternal: boolean;
}

/**
 * 方案 A 侧边栏平铺领域分组头结构（对应后端 M 目录及其下的 C 菜单集合）。
 */
export interface SidebarMenuGroup {
  /**
   * 目录主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 分组标题
   */
  title: string;
  /**
   * 目录路径前缀
   */
  path: string;
  /**
   * 目录图标标识
   */
  icon?: string | null;
  /**
   * 同级排序值（升序）
   */
  sort: number;
  /**
   * 是否为平台专属目录
   */
  platformOnly: boolean;
  /**
   * 当前分组下可见的子菜单项集合
   */
  items: SidebarMenuItem[];
}

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * 页面与标签栏展示标题
     */
    title?: string;
    /**
     * 菜单/页签图标名称
     */
    icon?: string;
    /**
     * 公开路由标记（登录页及异常页标记为 true）
     */
    public?: boolean;
    /**
     * 是否不在侧边栏菜单展示
     */
    hidden?: boolean;
    /**
     * 是否需要登录后访问
     */
    requiresAuth?: boolean;
    /**
     * 是否在多页签栏固定不可关闭
     */
    affix?: boolean;
    /**
     * 是否开启 KeepAlive 缓存（对应路由组件 PascalCase name）
     */
    keepAlive?: boolean;
    /**
     * 是否为外部链接节点
     */
    isExternal?: boolean;
    /**
     * 是否平台租户专属视图
     */
    platformOnly?: boolean;
    /**
     * 关联的后端菜单主键
     */
    menuId?: string;
    /**
     * 所属领域分组标题（供顶栏面包屑渲染）
     */
    groupTitle?: string;
  }
}
