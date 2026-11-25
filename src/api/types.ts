/**
 * 前端通用业务强类型原语与跨模块选项契约。
 *
 * @author Ateng
 * @since 2026-11-25
 */

/**
 * 通用启停状态字面量（0=正常，1=停用）
 */
export type CommonStatus = 0 | 1;

/**
 * 用户性别字典值（0=男，1=女，2=未知）
 */
export type GenderValue = '0' | '1' | '2';

/**
 * 菜单节点类型（M=目录，C=菜单，F=按钮）
 */
export type MenuType = 'M' | 'C' | 'F';

/**
 * 系统内置布尔标识（Y=是/内置，N=否/自建）
 */
export type YesNoValue = 'Y' | 'N';

/**
 * 侧栏显隐状态（0=显示，1=隐藏）
 */
export type VisibleStatus = 0 | 1;

/**
 * Element Plus 标签支持的有效语义类型（严禁传递 'default'）
 */
export type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info' | '';

/**
 * 后端 {@code OptionItem<T>} 静态枚举与通用下拉选项响应模型。
 */
export interface OptionItem<T = string | number> {
  /**
   * 选项值 / 枚举编码
   */
  code: T;
  /**
   * 展示标签文案
   */
  label: string;
  /**
   * 是否禁用
   */
  disabled?: boolean;
  /**
   * 扩展元数据（如 tagType、listClass、sort 等）
   */
  extra?: Record<string, unknown>;
}

/**
 * 前端通用下拉选择器选项模型。
 */
export interface SelectOption<T = string | number> {
  /**
   * 显示文本
   */
  label: string;
  /**
   * 绑定值
   */
  value: T;
  /**
   * 是否禁用
   */
  disabled?: boolean;
}
