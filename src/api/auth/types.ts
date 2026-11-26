import type { PageQuery } from '@atengk/core';
import type { GenderValue, MenuType, VisibleStatus } from '@/api/types';

/**
 * 管理端认证、个人中心与在线会话域强类型请求/响应契约定义。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 登录防爆破锁定维度字面量。
 */
export type LoginLockType = 'IP' | 'ACCOUNT';

/**
 * 登录图形验证码与运行时多租户开关前置配置响应模型。
 */
export interface CaptchaVO {
  /**
   * 是否开启登录图形验证码
   */
  enabled: boolean;
  /**
   * 是否开启 SaaS 多租户模式
   */
  tenantEnabled: boolean;
  /**
   * 验证码唯一流水键（未开启验证码时为空串）
   */
  captchaKey: string;
  /**
   * Base64 DataURI 图形验证码内容（未开启时为空串）
   */
  imageBase64: string;
  /**
   * 验证码有效时长（秒）
   */
  expireSeconds: number;
}

/**
 * 管理端登录请求载荷。
 */
export interface AdminLoginRequest {
  /**
   * 租户编码（单租户模式固定传入 '000000'）
   */
  tenantCode?: string;
  /**
   * 登录账号
   */
  username: string;
  /**
   * 登录密码（明文经 HTTPS 传输至后端校验）
   */
  password: string;
  /**
   * 图形验证码流水键
   */
  captchaKey?: string;
  /**
   * 用户输入的图形验证码
   */
  captchaCode?: string;
  /**
   * 认证授权模式（默认 'password'）
   */
  grantType?: string;
}

/**
 * 管理端登录成功会话响应模型。
 */
export interface AdminLoginVO {
  /**
   * 认证请求头名称（satoken-admin）
   */
  tokenName: string;
  /**
   * 管理端访问令牌
   */
  tokenValue: string;
  /**
   * 令牌有效秒数
   */
  expireIn: number;
  /**
   * 生效租户主键（64 位雪花 ID 字符串）
   */
  tenantId: string;
  /**
   * 生效租户名称
   */
  tenantName: string;
}

/**
 * 错误码 101004 透传的结构化防爆破锁定倒计时详情。
 */
export interface LoginLockDetailVO {
  /**
   * 锁定维度（IP 熔断或 ACCOUNT 账号锁）
   */
  lockType: LoginLockType;
  /**
   * 剩余解除锁定秒数
   */
  remainSeconds: number;
}

/**
 * 高频鉴权与工作台轻量身份摘要响应模型（GET /admin/auth/info）。
 */
export interface AdminProfileVO {
  /**
   * 用户主键（64 位雪花 ID 字符串）
   */
  userId: string;
  /**
   * 当前生效租户主键（64 位雪花 ID 字符串）
   */
  tenantId: string;
  /**
   * 当前生效租户名称
   */
  tenantName: string;
  /**
   * 登录账号
   */
  username: string;
  /**
   * 用户昵称
   */
  nickname: string;
  /**
   * 已动态签发的可访问头像地址
   */
  avatar?: string | null;
  /**
   * 拥有角色编码集合
   */
  roles: string[];
  /**
   * 拥有细粒度按钮权限标识集合
   */
  permissions: string[];
  /**
   * 当前服务端是否开启多租户模式
   */
  tenantEnabled?: boolean;
  /**
   * 是否仍需自助修改初始/重置密码
   */
  passwordNeedsChange: boolean;
  /**
   * 最近一次登录客户端 IP
   */
  loginIp?: string | null;
  /**
   * 最近一次登录时间（yyyy-MM-dd HH:mm:ss）
   */
  loginDate?: string | null;
}

/**
 * 动态路由菜单树节点模型（GET /admin/auth/routes）。
 */
export interface RouteMenuVO {
  /**
   * 菜单主键（64 位雪花 ID 字符串）
   */
  id: string;
  /**
   * 上级菜单主键（顶级目录为 '0'）
   */
  parentId: string;
  /**
   * 菜单类型（M=目录，C=菜单，F=按钮）
   */
  menuType: MenuType;
  /**
   * 菜单展示标题
   */
  title: string;
  /**
   * 前端组件名称（PascalCase，用于 KeepAlive 精确匹配）
   */
  name?: string | null;
  /**
   * 路由地址或外部 URL
   */
  path: string;
  /**
   * 视图组件相对路径（相对 src/views/，如 'system/user/index'）
   */
  component?: string | null;
  /**
   * 目录默认重定向路径
   */
  redirect?: string | null;
  /**
   * 菜单图标标识
   */
  icon?: string | null;
  /**
   * 显示排序（升序）
   */
  sort?: number | null;
  /**
   * 侧栏显隐状态（0=显示，1=隐藏）
   */
  visible: VisibleStatus;
  /**
   * 是否开启 KeepAlive 缓存
   */
  keepAlive?: boolean | null;
  /**
   * 是否为外部链接
   */
  isExternal?: boolean | null;
  /**
   * 是否平台专属菜单
   */
  platformOnly?: boolean | null;
  /**
   * 子节点集合（保证为数组）
   */
  children: RouteMenuVO[];
}

/**
 * 个人中心完整内存真明文资料响应模型（GET /admin/auth/profile）。
 */
export interface PersonalProfileVO {
  /**
   * 用户主键（64 位雪花 ID 字符串）
   */
  userId: string;
  /**
   * 所属租户主键（64 位雪花 ID 字符串）
   */
  tenantId: string;
  /**
   * 所属租户名称
   */
  tenantName: string;
  /**
   * 登录账号
   */
  username: string;
  /**
   * 用户昵称
   */
  nickname: string;
  /**
   * 电子邮箱内存真明文
   */
  email?: string | null;
  /**
   * 手机号码内存真明文
   */
  phone?: string | null;
  /**
   * 用户性别（0=男，1=女，2=未知）
   */
  gender: GenderValue;
  /**
   * 已动态签发的可访问头像地址
   */
  avatar?: string | null;
  /**
   * 所属部门名称
   */
  deptName?: string | null;
  /**
   * 所属岗位名称集合
   */
  postNames: string[];
  /**
   * 拥有角色展示集合
   */
  roles: string[];
  /**
   * 最近一次登录客户端 IP
   */
  loginIp?: string | null;
  /**
   * 最近一次登录时间
   */
  loginDate?: string | null;
  /**
   * 账号创建时间
   */
  createTime: string;
  /**
   * 是否仍需自助修改初始/重置密码
   */
  passwordNeedsChange: boolean;
}

/**
 * 更新本人基本资料请求载荷（PUT /admin/auth/profile）。
 */
export interface UpdateProfileRequest {
  /**
   * 用户昵称
   */
  nickname: string;
  /**
   * 电子邮箱真明文（传空可清空）
   */
  email?: string | null;
  /**
   * 手机号码真明文（传空可清空）
   */
  phone?: string | null;
  /**
   * 用户性别（0=男，1=女，2=未知）
   */
  gender: GenderValue;
}

/**
 * 个人中心头像直传响应模型（POST /admin/auth/profile/avatar）。
 */
export interface AvatarUploadVO {
  /**
   * 动态签发的 inline 预览访问 URL
   */
  avatarUrl: string;
  /**
   * 持久化于 sys_user.avatar 的相对对象键
   */
  objectPath: string;
}

/**
 * 自助修改密码请求载荷（PUT /admin/auth/password）。
 */
export interface UpdatePasswordRequest {
  /**
   * 当前旧密码
   */
  oldPassword: string;
  /**
   * 新密码（须符合 8~20 位无空白且至少含 3 类字符规则）
   */
  newPassword: string;
}

/**
 * 在线会话分页筛选参数（GET /admin/auth/online/page）。
 */
export interface OnlineSessionQuery extends PageQuery {
  /**
   * 登录账号模糊过滤条件
   */
  username?: string;
  /**
   * 客户端 IP 或 CIDR 网段过滤条件
   */
  clientIp?: string;
}

/**
 * 在线会话只读列表项响应模型（严禁返回原始 Token）。
 */
export interface OnlineSessionVO {
  /**
   * 服务端签密的不透明会话操作句柄（仅用于强退路径参数）
   */
  sessionId: string;
  /**
   * 脱敏会话令牌展示串（如 a1b2c3****9x8y）
   */
  tokenMask: string;
  /**
   * 是否为当前登录请求所属会话
   */
  currentSession: boolean;
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
  /**
   * 所属租户主键（64 位雪花 ID 字符串）
   */
  tenantId: string;
  /**
   * 登录终端类型
   */
  loginDevice?: string | null;
  /**
   * 客户端 IP
   */
  clientIp?: string | null;
  /**
   * 登录时间
   */
  loginTime?: string | null;
  /**
   * 令牌剩余有效期（秒，-1 表示永久有效）
   */
  tokenTimeout: number;
}
