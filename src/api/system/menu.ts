import type { CommonStatus, MenuType, VisibleStatus } from '@/api/types';
import { adminHttpClient } from '@/utils/http';

/**
 * 菜单权限管理域强类型 API 契约（仅平台默认租户 0 维护，对齐后端 SysMenuController）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 菜单树检索筛选参数（GET /admin/system/menu/tree）。
 */
export interface MenuQuery {
  /**
   * 菜单或按钮名称模糊匹配
   */
  title?: string;
  /**
   * 启停状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 是否仅平台专属筛选（undefined=全部，true=仅平台专属，false=通用可分发）
   */
  platformOnly?: boolean;
}

/**
 * 菜单权限树节点响应模型。
 */
export interface MenuTreeVO {
  /**
   * 菜单主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 父菜单主键（顶级节点为 '0'）
   */
  parentId: string;
  /**
   * 节点类型（M=目录，C=页面菜单，F=按钮权限）
   */
  menuType: MenuType;
  /**
   * 菜单或按钮显示名称
   */
  title: string;
  /**
   * 前端路由组件名称（C 非外链必填 PascalCase，全树唯一）
   */
  name?: string | null;
  /**
   * 路由路径或外链地址（F 节点为 null）
   */
  path?: string | null;
  /**
   * 前端视图组件相对路径（如 'system/dept/index'）
   */
  component?: string | null;
  /**
   * 目录默认重定向路径（仅 M 节点有效）
   */
  redirect?: string | null;
  /**
   * 三段式权限标识（如 'system:dept:list'）
   */
  perms?: string | null;
  /**
   * 图标名称
   */
  icon?: string | null;
  /**
   * 显示排序（升序）
   */
  sort: number;
  /**
   * 侧栏显隐状态（0=显示，1=隐藏）
   */
  visible: VisibleStatus;
  /**
   * 启停状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 是否开启 KeepAlive 页面缓存
   */
  keepAlive: boolean;
  /**
   * 是否为外部链接
   */
  isExternal: boolean;
  /**
   * 是否仅平台默认租户可见维护
   */
  platformOnly: boolean;
  /**
   * 创建时间
   */
  createTime: string;
  /**
   * 下级菜单权限子树集合（保底为空数组）
   */
  children: MenuTreeVO[];
}

/**
 * 菜单节点详情响应模型（GET /admin/system/menu/{id}）。
 */
export interface MenuVO {
  /**
   * 菜单主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 父菜单主键（顶级节点为 '0'）
   */
  parentId: string;
  /**
   * 节点类型（M=目录，C=页面菜单，F=按钮权限）
   */
  menuType: MenuType;
  /**
   * 菜单或按钮显示名称
   */
  title: string;
  /**
   * 前端路由组件名称
   */
  name?: string | null;
  /**
   * 路由路径或外链地址
   */
  path?: string | null;
  /**
   * 前端视图组件相对路径
   */
  component?: string | null;
  /**
   * 目录默认重定向路径
   */
  redirect?: string | null;
  /**
   * 三段式权限标识
   */
  perms?: string | null;
  /**
   * 图标名称
   */
  icon?: string | null;
  /**
   * 显示排序
   */
  sort: number;
  /**
   * 侧栏显隐状态（0=显示，1=隐藏）
   */
  visible: VisibleStatus;
  /**
   * 启停状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 是否开启 KeepAlive 页面缓存
   */
  keepAlive: boolean;
  /**
   * 是否为外部链接
   */
  isExternal: boolean;
  /**
   * 是否仅平台默认租户可见维护
   */
  platformOnly: boolean;
  /**
   * 创建时间
   */
  createTime: string;
}

/**
 * 菜单与按钮权限新增/修改请求载荷（POST / PUT /admin/system/menu）。
 */
export interface MenuSaveRequest {
  /**
   * 菜单主键（新增留空，修改必填）
   */
  id?: string;
  /**
   * 父菜单主键（顶级传 '0'）
   */
  parentId: string;
  /**
   * 节点类型（M=目录，C=页面菜单，F=按钮权限）
   */
  menuType: MenuType;
  /**
   * 菜单或按钮名称
   */
  title: string;
  /**
   * 路由组件名称（C 非外链必填 PascalCase）
   */
  name?: string | null;
  /**
   * 路由路径或外链地址
   */
  path?: string | null;
  /**
   * 前端视图组件路径
   */
  component?: string | null;
  /**
   * 目录默认重定向路径
   */
  redirect?: string | null;
  /**
   * 三段式权限标识
   */
  perms?: string | null;
  /**
   * 图标名称
   */
  icon?: string | null;
  /**
   * 显示排序
   */
  sort: number;
  /**
   * 侧栏显隐状态（0=显示，1=隐藏）
   */
  visible?: VisibleStatus;
  /**
   * 启停状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 是否开启 KeepAlive 页面缓存
   */
  keepAlive?: boolean;
  /**
   * 是否为外链菜单
   */
  isExternal?: boolean;
  /**
   * 是否仅平台默认租户可见维护
   */
  platformOnly?: boolean;
}

function normalizeMenuTree(nodes?: MenuTreeVO[] | null): MenuTreeVO[] {
  if (!Array.isArray(nodes)) {
    return [];
  }
  return nodes.map(node => ({
    ...node,
    children: normalizeMenuTree(node.children),
  }));
}

/**
 * 查询平台菜单与按钮权限树。
 *
 * @param params 菜单名称、状态与平台专属筛选条件
 * @returns 空安全菜单树集合
 */
export async function getMenuTree(params?: MenuQuery): Promise<MenuTreeVO[]> {
  const tree = await adminHttpClient.get<MenuTreeVO[]>('/admin/system/menu/tree', { params });
  return normalizeMenuTree(tree);
}

/**
 * 查询指定菜单节点详情。
 *
 * @param id 菜单主键
 * @returns 菜单详情对象
 */
export async function getMenuDetail(id: string): Promise<MenuVO> {
  return adminHttpClient.get<MenuVO>(`/admin/system/menu/${encodeURIComponent(id.trim())}`);
}

/**
 * 新增菜单或按钮权限节点。
 *
 * @param data 菜单保存请求
 * @returns 新建菜单主键（64 位雪花 ID 字符串）
 */
export async function createMenu(data: MenuSaveRequest): Promise<string> {
  return adminHttpClient.post<string, MenuSaveRequest>('/admin/system/menu', data);
}

/**
 * 修改菜单或按钮权限节点。
 *
 * @param data 菜单修改请求
 * @returns 空完成 Promise
 */
export async function updateMenu(data: MenuSaveRequest): Promise<void> {
  await adminHttpClient.put<void, MenuSaveRequest>('/admin/system/menu', data);
}

/**
 * 切换菜单启停状态。
 *
 * @param id 菜单主键
 * @param status 目标状态（0=正常，1=停用）
 * @returns 空完成 Promise
 */
export async function updateMenuStatus(id: string, status: CommonStatus): Promise<void> {
  await adminHttpClient.put<void, { status: CommonStatus }>(
    `/admin/system/menu/${encodeURIComponent(id.trim())}/status`,
    { status },
  );
}

/**
 * 删除指定菜单或按钮权限节点（存在子节点或角色/套餐引用时由后端抛出 102005）。
 *
 * @param id 菜单主键
 * @returns 空完成 Promise
 */
export async function deleteMenu(id: string): Promise<void> {
  await adminHttpClient.delete<void>(`/admin/system/menu/${encodeURIComponent(id.trim())}`);
}
