/**
 * 全站统一强口令复杂度校验工具（与后端 PasswordPolicyValidator 保持 1:1 等价规则）。
 *
 * @author Ateng
 * @since 2026-11-25
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;
export const PASSWORD_MIN_CATEGORIES = 3;
export const PASSWORD_POLICY_MESSAGE =
  '密码须为 8~20 位，不能包含空白字符，且至少包含大写字母、小写字母、数字、特殊字符中的 3 类';
export const PASSWORD_POLICY_SHORT_MESSAGE = '请满足上述全部强口令规则要求';

/**
 * 口令复杂度各条目实时校验评估结果。
 */
export interface PasswordPolicyEvaluation {
  /**
   * 原始密码字符长度。
   */
  length: number;
  /**
   * 长度是否处于 8~20 位闭区间。
   */
  lengthOk: boolean;
  /**
   * 是否实际输入了空白或控制字符（用于前端精准高亮非法空白警示）。
   */
  hasWhitespace: boolean;
  /**
   * 是否不含空格、制表符、换行或控制字符。
   */
  noWhitespace: boolean;
  /**
   * 是否包含 ASCII 大写字母（A-Z）。
   */
  hasUpper: boolean;
  /**
   * 是否包含 ASCII 小写字母（a-z）。
   */
  hasLower: boolean;
  /**
   * 是否包含 ASCII 数字（0-9）。
   */
  hasDigit: boolean;
  /**
   * 是否包含 ASCII 特殊字符。
   */
  hasSpecial: boolean;
  /**
   * 已命中的字符类别数量（大写、小写、数字、ASCII 特殊字符）。
   */
  categoryCount: number;
  /**
   * 是否满足至少 3 类字符要求。
   */
  categoriesOk: boolean;
  /**
   * 整体是否完全符合平台强口令策略。
   */
  valid: boolean;
}

function isAsciiSpecialCode(code: number): boolean {
  const isUpper = code >= 65 && code <= 90;
  const isLower = code >= 97 && code <= 122;
  const isDigit = code >= 48 && code <= 57;
  return code > 32 && code < 127 && !isUpper && !isLower && !isDigit;
}

function isDisallowedControlOrSpace(ch: string, code: number): boolean {
  // 对齐 Java Character.isISOControl (0x00~0x1F, 0x7F~0x9F) 及空白字符校验
  if (code <= 32 || (code >= 0x7f && code <= 0x9f)) {
    return true;
  }
  return /\s/.test(ch);
}

/**
 * 评估候选明文口令的各项合规状态。
 *
 * @param password 待检查的原始密码文本（不执行 trim，保留首尾空白严格拦截）
 * @returns 分项状态与整体合法性判定结果
 */
export function evaluatePasswordPolicy(password: string): PasswordPolicyEvaluation {
  const lengthOk = password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
  let hasWhitespaceOrControl = false;
  let hasUpper = false;
  let hasLower = false;
  let hasDigit = false;
  let hasSpecial = false;

  for (let idx = 0; idx < password.length; idx += 1) {
    const ch = password.charAt(idx);
    const code = password.charCodeAt(idx);
    if (isDisallowedControlOrSpace(ch, code)) {
      hasWhitespaceOrControl = true;
      continue;
    }
    if (code >= 65 && code <= 90) {
      hasUpper = true;
    } else if (code >= 97 && code <= 122) {
      hasLower = true;
    } else if (code >= 48 && code <= 57) {
      hasDigit = true;
    } else if (isAsciiSpecialCode(code)) {
      hasSpecial = true;
    }
  }

  const categoryCount = Number(hasUpper) + Number(hasLower) + Number(hasDigit) + Number(hasSpecial);
  // 空串尚未输入有效口令，checklist 该项保持未达标态直至用户输入非空白字符
  const noWhitespace = password.length > 0 && !hasWhitespaceOrControl;
  const categoriesOk = categoryCount >= PASSWORD_MIN_CATEGORIES;

  return {
    length: password.length,
    lengthOk,
    hasWhitespace: hasWhitespaceOrControl,
    noWhitespace,
    hasUpper,
    hasLower,
    hasDigit,
    hasSpecial,
    categoryCount,
    categoriesOk,
    valid: lengthOk && noWhitespace && categoriesOk,
  };
}
