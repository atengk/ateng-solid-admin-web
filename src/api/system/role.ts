import { createPageResult, type PageQuery, type PageResult } from '@atengk/core';
import { normalizeMenuTree, type MenuTreeVO } from '@/api/system/menu';
import type { CommonStatus } from '@/api/types';
import { adminHttpClient, formatBatchPathIds } from '@/utils/http';

/**
 * 角色管理与 5 级数据权限域强类型 API 契约（对齐后端 SysRoleController，路径前缀 /admin/system/role）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 5 级 @DataScope 数据权限范围枚举值（1=全部，2=自定部门，3=本部门，4=本部门及以下，5=仅本人）。
 */
export type DataScopeValue = 1 | 2 | 3 | 4 | 5;

/**
 * 角色分页筛选参数（GET /admin/system/role/page）。
 */
export interface RoleQuery extends PageQuery {
  /**
   * 角色名称模糊匹配
   */
  roleName?: string;
  /**
   * 角色编码模糊匹配
   */
  roleKey?: string;
  /**
   * 角色状态（0=正常，1=停用）
   */
  status?: CommonStatus;
}

/**
 * 角色分页列表视图对象。
 */
export interface RoleVO {
  /**
   * 角色主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 角色名称
   */
  roleName: string;
  /**
   * 角色编码（租户内唯一）
   */
  roleKey: string;
  /**
   * 数据权限范围（1=ALL，2=CUSTOM，3=DEPT，4=DEPT_AND_CHILD，5=SELF）
   */
  dataScope: DataScopeValue;
  /**
   * 菜单权限树是否父子联动
   */
  menuCheckStrictly: boolean;
  /**
   * 自定部门树是否父子联动
   */
  deptCheckStrictly: boolean;
  /**
   * 显示排序（升序）
   */
  sort: number;
  /**
   * 角色状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 备注说明
   */
  remark?: string | null;
  /**
   * 是否为平台内置超级管理员角色
   */
  builtinSuperAdmin: boolean;
  /**
   * 创建时间
   */
  createTime: string;
}

/**
 * 角色详情视图对象（GET /admin/system/role/{id}，含已绑定菜单与自定部门主键列表）。
 */
export interface RoleDetailVO extends RoleVO {
  /**
   * 已授权菜单主键集合
   */
  menuIds: string[];
  /**
   * 自定部门数据权限关联部门主键集合
   */
  deptIds: string[];
}

/**
 * 角色轻量下拉选项视图对象（GET /admin/system/role/options）。
 */
export interface RoleOptionVO {
  /**
   * 角色主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 角色名称
   */
  roleName: string;
  /**
   * 角色编码
   */
  roleKey: string;
}

/**
 * 新增或修改角色请求载荷（POST / PUT /admin/system/role）。
 */
export interface RoleSaveRequest {
  /**
   * 角色主键（新增留空，修改必填）
   */
  id?: string;
  /**
   * 角色名称（2~50 个字符）
   */
  roleName: string;
  /**
   * 角色编码（2~64 位字母、数字、下划线或短横线，禁用 super_admin 与 admin）
   */
  roleKey: string;
  /**
   * 显示排序（0~9999）
   */
  sort: number;
  /**
   * 角色状态（0=正常，1=停用）
   */
  status?: CommonStatus;
  /**
   * 菜单权限树是否父子联动（默认 true）
   */
  menuCheckStrictly?: boolean;
  /**
   * 管理备注（不超过 500 字符）
   */
  remark?: string | null;
  /**
   * 授权菜单主键集合
   */
  menuIds?: string[];
}

/**
 * 角色 5 级数据权限分配请求载荷（PUT /admin/system/role/{id}/data-scope）。
 */
export interface RoleDataScopeRequest {
  /**
   * 数据权限范围类型（1~5）
   */
  dataScope: DataScopeValue;
  /**
   * 自定部门树是否父子联动（默认 false 独立勾选）
   */
  deptCheckStrictly?: boolean;
  /**
   * 自定部门主键集合（当 dataScope 为 2 时至少传 1 个部门）
   */
  deptIds?: string[];
}

/**
 * 分页查询当前工作租户下的角色列表。
 *
 * @param params 分页与筛选参数
 * @returns 空安全角色分页结果
 */
export async function getRolePage(params?: RoleQuery): Promise<PageResult<RoleVO>> {
  const page = await adminHttpClient.get<PageResult<RoleVO>>('/admin/system/role/page', {
    params,
  });
  return createPageResult(page?.records, page?.total, {
    current: page?.current,
    size: page?.size,
    pages: page?.pages,
  });
}

/**
 * 获取当前工作租户下正常启用状态的角色下拉选项（非平台超管视角已过滤 super_admin）。
 *
 * @returns 空安全角色选项数组
 */
export async function getRoleOptions(): Promise<RoleOptionVO[]> {
  const list = await adminHttpClient.get<RoleOptionVO[]>('/admin/system/role/options');
  return list ?? [];
}

/**
 * 获取当前工作租户角色授权可勾选的启用菜单树（普通租户仅返回绑定套餐交集且不含 platform_only 菜单）。
 *
 * @returns 空安全可授权菜单树
 */
export async function getRoleGrantableMenuTree(): Promise<MenuTreeVO[]> {
  const tree = await adminHttpClient.get<MenuTreeVO[]>('/admin/system/role/menu-tree');
  return normalizeMenuTree(tree);
}

/**
 * 查询指定角色详情及绑定的菜单、自定部门主键集合。
 *
 * @param id 角色主键
 * @returns 角色详情视图对象
 */
export async function getRoleDetail(id: string): Promise<RoleDetailVO> {
  const detail = await adminHttpClient.get<RoleDetailVO>(
    `/admin/system/role/${encodeURIComponent(id.trim())}`,
  );
  return {
    ...detail,
    menuIds: detail.menuIds ?? [],
    deptIds: detail.deptIds ?? [],
  };
}

/**
 * 新增角色并绑定菜单权限。
 *
 * @param data 角色新增请求
 * @returns 新建角色主键（64 位雪花 ID 字符串）
 */
export async function createRole(data: RoleSaveRequest): Promise<string> {
  return adminHttpClient.post<string, RoleSaveRequest>('/admin/system/role', data);
}

/**
 * 修改角色基本信息与菜单授权（超管角色受后端 102007 保护）。
 *
 * @param data 角色修改请求
 * @returns 空完成 Promise
 */
export async function updateRole(data: RoleSaveRequest): Promise<void> {
  await adminHttpClient.put<void, RoleSaveRequest>('/admin/system/role', data);
}

/**
 * 切换角色启停状态（超管角色受后端 102007 保护）。
 *
 * @param id 角色主键
 * @param status 目标状态（0=正常，1=停用）
 * @returns 空完成 Promise
 */
export async function updateRoleStatus(id: string, status: CommonStatus): Promise<void> {
  await adminHttpClient.put<void, { status: CommonStatus }>(
    `/admin/system/role/${encodeURIComponent(id.trim())}/status`,
    { status },
  );
}

/**
 * 分配角色 5 级 @DataScope 数据权限范围（CUSTOM 模式须至少传入 1 个部门）。
 *
 * @param id 角色主键
 * @param data 数据权限配置请求
 * @returns 空完成 Promise
 */
export async function updateRoleDataScope(id: string, data: RoleDataScopeRequest): Promise<void> {
  await adminHttpClient.put<void, RoleDataScopeRequest>(
    `/admin/system/role/${encodeURIComponent(id.trim())}/data-scope`,
    data,
  );
}

/**
 * 批量逻辑删除角色（受保护角色或已被用户占用时由后端拦截返回错误）。
 *
 * @param ids 单个或数组形式的角色主键集合
 * @returns 空完成 Promise
 */
export async function deleteRoles(ids: string | string[]): Promise<void> {
  const pathIds = formatBatchPathIds(ids);
  if (!pathIds) {
    return;
  }
  await adminHttpClient.delete<void>(`/admin/system/role/${pathIds}`);
}
