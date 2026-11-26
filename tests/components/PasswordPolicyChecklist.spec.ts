import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import PasswordPolicyChecklist from '@/components/PasswordPolicyChecklist.vue';
import { evaluatePasswordPolicy } from '@/utils/password';

/**
 * 强口令评估工具与 PasswordPolicyChecklist 分层矩阵组件单元测试。
 *
 * @author Ateng
 * @since 2026-11-27
 */
describe('evaluatePasswordPolicy & PasswordPolicyChecklist', () => {
  it('evaluates length, whitespace/control chars, and 4 ASCII character categories accurately', () => {
    expect(evaluatePasswordPolicy('')).toEqual({
      length: 0,
      lengthOk: false,
      hasWhitespace: false,
      noWhitespace: false,
      hasUpper: false,
      hasLower: false,
      hasDigit: false,
      hasSpecial: false,
      categoryCount: 0,
      categoriesOk: false,
      valid: false,
    });

    expect(evaluatePasswordPolicy('abc')).toMatchObject({
      length: 3,
      lengthOk: false,
      hasWhitespace: false,
      noWhitespace: true,
      hasUpper: false,
      hasLower: true,
      hasDigit: false,
      hasSpecial: false,
      categoryCount: 1,
      categoriesOk: false,
      valid: false,
    });

    expect(evaluatePasswordPolicy('Abc 1234')).toMatchObject({
      length: 8,
      lengthOk: true,
      hasWhitespace: true,
      noWhitespace: false,
      hasUpper: true,
      hasLower: true,
      hasDigit: true,
      hasSpecial: false,
      categoryCount: 3,
      categoriesOk: true,
      valid: false,
    });

    expect(evaluatePasswordPolicy('Abc@1234')).toMatchObject({
      length: 8,
      lengthOk: true,
      hasWhitespace: false,
      noWhitespace: true,
      hasUpper: true,
      hasLower: true,
      hasDigit: true,
      hasSpecial: true,
      categoryCount: 4,
      categoriesOk: true,
      valid: true,
    });
  });

  it('renders live counter, whitespace warning, 4 category chips, and extraRules', async () => {
    const wrapper = mount(PasswordPolicyChecklist, {
      props: {
        password: 'abc',
        layout: 'list',
        testId: 'pwd-checklist',
        extraRules: [{ key: 'different', label: '不能与当前密码完全一致', passed: true }],
      },
      global: { plugins: [ElementPlus] },
    });

    expect(wrapper.text()).toContain('3/20');
    expect(wrapper.text()).toContain('1 / 3 类');
    expect(wrapper.text()).toContain('无空白字符');
    expect(wrapper.text()).toContain('不能与当前密码完全一致');
    expect(wrapper.find('[data-testid="pwd-checklist-lower"]').classes()).toContain('font-medium');
    expect(wrapper.find('[data-testid="pwd-checklist-upper"]').classes()).not.toContain('font-medium');

    await wrapper.setProps({ password: 'Abc 1234' });
    expect(wrapper.text()).toContain('8/20');
    expect(wrapper.text()).toContain('检测到空白字符，请删除');
    expect(wrapper.text()).toContain('3 / 3 类 · 已达标');
    expect(wrapper.find('[data-testid="pwd-checklist-upper"]').classes()).toContain('font-medium');
    expect(wrapper.find('[data-testid="pwd-checklist-digit"]').classes()).toContain('font-medium');
  });
});
