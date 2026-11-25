import { createPageResult, type PageQuery, type PageResult } from '@atengk/core';
import { adminHttpClient } from '@/utils/http';

/**
 * 审计日志严格只读强类型 API 契约（对齐后端 SysLogController，路径前缀 /admin/system/log）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 审计执行状态字面量（0=成功，1=失败）。
 */
export type LogStatus = 0 | 1;

/**
 * 操作审计日志分页检索参数（GET /admin/system/log/oper/page）。
 */
export interface OperLogQuery extends PageQuery {
  /**
   * 操作模块名模糊匹配
   */
  module?: string;
  /**
   * 操作人账号或昵称模糊匹配
   */
  userName?: string;
  /**
   * 操作类型编码（对齐 OperateTypeEnum.code）
   */
  operateType?: number;
  /**
   * 执行状态（0=成功，1=失败）
   */
  status?: LogStatus;
  /**
   * 全链路追踪标识精确匹配
   */
  traceId?: string;
  /**
   * 操作时间起始边界（yyyy-MM-dd HH:mm:ss）
   */
  beginTime?: string;
  /**
   * 操作时间截止边界（yyyy-MM-dd HH:mm:ss）
   */
  endTime?: string;
}

/**
 * 操作审计日志列表与详情视图对象。
 */
export interface OperLogVO {
  /**
   * 操作日志主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 全链路追踪标识
   */
  traceId?: string | null;
  /**
   * 操作人用户主键（64 位雪花 ID 字符串）
   */
  userId?: string | null;
  /**
   * 操作人真实账号或昵称
   */
  userName?: string | null;
  /**
   * 操作模块名
   */
  module?: string | null;
  /**
   * 操作类型编码
   */
  operateType: number;
  /**
   * 操作语义描述
   */
  description?: string | null;
  /**
   * HTTP 请求方法
   */
  requestMethod?: string | null;
  /**
   * HTTP 请求路径
   */
  requestUrl?: string | null;
  /**
   * 客户端来源 IP
   */
  clientIp?: string | null;
  /**
   * 操作归属地（首期可空）
   */
  operateLocation?: string | null;
  /**
   * 解析后的浏览器标识
   */
  browser?: string | null;
  /**
   * 解析后的操作系统标识
   */
  os?: string | null;
  /**
   * 脱敏后请求参数 JSON
   */
  requestParams?: string | null;
  /**
   * 响应摘要 JSON
   */
  responseResult?: string | null;
  /**
   * 执行状态（0=成功，1=失败）
   */
  status: LogStatus;
  /**
   * 执行耗时（毫秒）
   */
  costTime?: number | null;
  /**
   * 脱敏后错误摘要
   */
  errorMsg?: string | null;
  /**
   * 扩展 JSON
   */
  extraJson?: string | null;
  /**
   * 操作发生时间
   */
  operateTime: string;
}

/**
 * 操作审计日志详情视图对象（与后端 OperLogVO 保持同构）。
 */
export type OperLogDetailVO = OperLogVO;

/**
 * 登录审计日志分页检索参数（GET /admin/system/log/login/page）。
 */
export interface LoginLogQuery extends PageQuery {
  /**
   * 登录尝试账号模糊匹配
   */
  username?: string;
  /**
   * 客户端来源 IP 模糊匹配
   */
  clientIp?: string;
  /**
   * 登录状态（0=成功，1=失败）
   */
  status?: LogStatus;
  /**
   * 全链路追踪标识精确匹配
   */
  traceId?: string;
  /**
   * 登录时间起始边界（yyyy-MM-dd HH:mm:ss）
   */
  beginTime?: string;
  /**
   * 登录时间截止边界（yyyy-MM-dd HH:mm:ss）
   */
  endTime?: string;
}

/**
 * 登录审计日志分页视图对象。
 */
export interface LoginLogVO {
  /**
   * 登录日志主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 全链路追踪标识
   */
  traceId?: string | null;
  /**
   * 登录尝试账号
   */
  username?: string | null;
  /**
   * 登录账号体系标识
   */
  loginType?: string | null;
  /**
   * 客户端来源 IP
   */
  clientIp?: string | null;
  /**
   * 登录归属地（首期可空）
   */
  loginLocation?: string | null;
  /**
   * 解析后的浏览器标识
   */
  browser?: string | null;
  /**
   * 解析后的操作系统标识
   */
  os?: string | null;
  /**
   * 登录执行状态（0=成功，1=失败）
   */
  status: LogStatus;
  /**
   * 登录结果提示消息
   */
  msg?: string | null;
  /**
   * 登录发生时间
   */
  loginTime: string;
}

/**
 * 只读分页查询当前工作租户下的操作审计日志。
 *
 * @param params 分页与筛选参数
 * @returns 空安全操作日志分页结果
 */
export async function getOperLogPage(params?: OperLogQuery): Promise<PageResult<OperLogVO>> {
  const page = await adminHttpClient.get<PageResult<OperLogVO>>('/admin/system/log/oper/page', {
    params,
  });
  return createPageResult(page?.records, page?.total, {
    current: page?.current,
    size: page?.size,
    pages: page?.pages,
  });
}

/**
 * 查询当前工作租户下单条操作审计日志详情。
 *
 * @param id 操作日志主键（64 位雪花 ID 字符串）
 * @returns 操作审计日志完整详情对象
 */
export async function getOperLogDetail(id: string): Promise<OperLogDetailVO> {
  return adminHttpClient.get<OperLogDetailVO>(
    `/admin/system/log/oper/${encodeURIComponent(id.trim())}`,
  );
}

/**
 * 只读分页查询当前工作租户下的登录审计日志。
 *
 * @param params 分页与筛选参数
 * @returns 空安全登录日志分页结果
 */
export async function getLoginLogPage(params?: LoginLogQuery): Promise<PageResult<LoginLogVO>> {
  const page = await adminHttpClient.get<PageResult<LoginLogVO>>('/admin/system/log/login/page', {
    params,
  });
  return createPageResult(page?.records, page?.total, {
    current: page?.current,
    size: page?.size,
    pages: page?.pages,
  });
}
