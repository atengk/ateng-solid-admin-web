import type { CommonStatus } from '@/api/types';
import { adminHttpClient } from '@/utils/http';

/**
 * 部门管理域强类型 API 契约（对齐后端 SysDeptController，路径前缀 /admin/system/dept）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 部门树检索筛选参数（GET /admin/system/dept/tree）。
 */
export interface DeptQuery {
  /**
   * 部门名称模糊匹配关键字
   */
  deptName?: string;
  /**
   * 部门状态（0=正常，1=停用）
   */
  status?: CommonStatus;
}

/**
 * 部门树节点响应模型（列表与选项统一使用，联系字段在详情及管理列表保持内存真明文）。
 */
export interface DeptTreeVO {
  /**
   * 部门主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 上级部门主键（顶级部门为 '0'）
   */
  parentId: string;
  /**
   * 祖级路径链（如 '0,100'）
   */
  ancestors: string;
  /**
   * 部门名称
   */
  deptName: string;
  /**
   * 显示排序（升序）
   */
  sort: number;
  /**
   * 部门负责人用户主键（64 位雪花 ID 字符串）
   */
  leaderUserId?: string | null;
  /**
   * 部门负责人昵称
   */
  leaderNickname?: string | null;
  /**
   * 部门负责人账号
   */
  leaderUsername?: string | null;
  /**
   * 联系电话（内存真明文，表格渲染层脱敏）
   */
  phone?: string | null;
  /**
   * 电子邮箱（内存真明文）
   */
  email?: string | null;
  /**
   * 部门状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 创建时间
   */
  createTime: string;
  /**
   * 子部门集合（保底为空数组）
   */
  children: DeptTreeVO[];
}

/**
 * 部门详情响应模型（GET /admin/system/dept/{id}，编辑态加载内存真明文）。
 */
export interface DeptVO {
  /**
   * 部门主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 上级部门主键（顶级部门为 '0'）
   */
  parentId: string;
  /**
   * 祖级路径链
   */
  ancestors: string;
  /**
   * 部门名称
   */
  deptName: string;
  /**
   * 显示排序
   */
  sort: number;
  /**
   * 部门负责人用户主键（64 位雪花 ID 字符串）
   */
  leaderUserId?: string | null;
  /**
   * 部门负责人昵称
   */
  leaderNickname?: string | null;
  /**
   * 部门负责人账号
   */
  leaderUsername?: string | null;
  /**
   * 联系电话（内存真明文）
   */
  phone?: string | null;
  /**
   * 电子邮箱（内存真明文）
   */
  email?: string | null;
  /**
   * 部门状态（0=正常，1=停用）
   */
  status: CommonStatus;
  /**
   * 创建时间
   */
  createTime: string;
}

/**
 * 新增与修改部门请求载荷（POST / PUT /admin/system/dept）。
 */
export interface DeptSaveRequest {
  /**
   * 部门主键（新增留空，修改必填）
   */
  id?: string;
  /**
   * 上级部门主键（顶级部门传 '0'）
   */
  parentId: string;
  /**
   * 部门名称
   */
  deptName: string;
  /**
   * 显示排序
   */
  sort: number;
  /**
   * 部门负责人用户主键（可为空表示清除负责人）
   */
  leaderUserId?: string | null;
  /**
   * 联系电话真明文（传空可清空）
   */
  phone?: string | null;
  /**
   * 电子邮箱真明文（传空可清空）
   */
  email?: string | null;
  /**
   * 部门状态（0=正常，1=停用）
   */
  status?: CommonStatus;
}

function normalizeDeptTree(nodes?: DeptTreeVO[] | null): DeptTreeVO[] {
  if (!Array.isArray(nodes)) {
    return [];
  }
  return nodes.map(node => ({
    ...node,
    children: normalizeDeptTree(node.children),
  }));
}

/**
 * 查询当前工作租户下的部门树列表（存在筛选条件时后端自动保留祖先链路）。
 *
 * @param params 部门名称与状态筛选条件
 * @returns 空安全部门树集合
 */
export async function getDeptTree(params?: DeptQuery): Promise<DeptTreeVO[]> {
  const tree = await adminHttpClient.get<DeptTreeVO[]>('/admin/system/dept/tree', { params });
  return normalizeDeptTree(tree);
}

/**
 * 获取当前工作租户下正常启用状态的部门下拉选项树（不依赖 system:dept:list 权限）。
 *
 * @returns 空安全正常部门树集合
 */
export async function getDeptOptions(): Promise<DeptTreeVO[]> {
  const options = await adminHttpClient.get<DeptTreeVO[]>('/admin/system/dept/options');
  return normalizeDeptTree(options);
}

/**
 * 查询指定部门详情（含联系电话与电子邮箱内存真明文）。
 *
 * @param id 部门主键
 * @returns 部门详情对象
 */
export async function getDeptDetail(id: string): Promise<DeptVO> {
  return adminHttpClient.get<DeptVO>(`/admin/system/dept/${encodeURIComponent(id.trim())}`);
}

/**
 * 新增部门节点。
 *
 * @param data 部门保存请求
 * @returns 新建部门主键（64 位雪花 ID 字符串）
 */
export async function createDept(data: DeptSaveRequest): Promise<string> {
  return adminHttpClient.post<string, DeptSaveRequest>('/admin/system/dept', data);
}

/**
 * 修改部门信息（变更上级时由后端事务级联重算子孙 ancestors）。
 *
 * @param data 部门修改请求
 * @returns 空完成 Promise
 */
export async function updateDept(data: DeptSaveRequest): Promise<void> {
  await adminHttpClient.put<void, DeptSaveRequest>('/admin/system/dept', data);
}

/**
 * 切换部门启停状态。
 *
 * @param id 部门主键
 * @param status 目标状态（0=正常，1=停用）
 * @returns 空完成 Promise
 */
export async function updateDeptStatus(id: string, status: CommonStatus): Promise<void> {
  await adminHttpClient.put<void, { status: CommonStatus }>(
    `/admin/system/dept/${encodeURIComponent(id.trim())}/status`,
    { status },
  );
}

/**
 * 删除指定部门节点（存在子部门或关联用户时由后端抛出 102005）。
 *
 * @param id 部门主键
 * @returns 空完成 Promise
 */
export async function deleteDept(id: string): Promise<void> {
  await adminHttpClient.delete<void>(`/admin/system/dept/${encodeURIComponent(id.trim())}`);
}
