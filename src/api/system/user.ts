import { adminHttpClient } from '@/utils/http';

/**
 * 用户管理域轻量选项契约（Spec 3 首版导出部门负责人远程下拉选项，完整 CRUD 于后续工单补全）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 部门负责人与轻量选择器下拉用户选项模型（GET /admin/system/user/options）。
 */
export interface UserOptionVO {
  /**
   * 用户主键（64 位雪花 ID 字符串）
   */
  userId: string;
  /**
   * 登录账号
   */
  username: string;
  /**
   * 用户昵称
   */
  nickname: string;
}

/**
 * 模糊检索当前租户下正常启用状态的用户选项列表（不依赖 system:user:list 权限）。
 *
 * @param keyword 账号或昵称模糊关键字（可选）
 * @returns 匹配的用户选项列表，无匹配时返回空数组
 */
export async function getUserOptions(keyword?: string): Promise<UserOptionVO[]> {
  const trimmed = keyword?.trim();
  const list = await adminHttpClient.get<UserOptionVO[]>('/admin/system/user/options', {
    params: trimmed ? { keyword: trimmed } : undefined,
  });
  return list ?? [];
}
