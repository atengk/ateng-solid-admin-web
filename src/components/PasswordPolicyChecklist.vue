<script setup lang="ts">
import { computed } from 'vue';
import { ElIcon } from 'element-plus';
import { Check, Close } from '@element-plus/icons-vue';
import { evaluatePasswordPolicy, type PasswordPolicyEvaluation } from '@/utils/password';

/**
 * 全站统一强口令复杂度实时校验提示条（复用 evaluatePasswordPolicy 展示合规指示，支持弹窗横向与个人中心纵向布局）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'PasswordPolicyChecklist' });

export interface PasswordExtraRuleItem {
  key: string;
  label: string;
  passed: boolean;
}

const props = withDefaults(
  defineProps<{
    /** 待评估的原始明文密码。 */
    password: string;
    /** 布局模式：inline 紧凑横排（弹窗/抽屉）或 list 纵向列表（个人中心改密）。 */
    layout?: 'inline' | 'list';
    /** 额外追加的自定义合规条目（如不能与当前密码一致）。 */
    extraRules?: PasswordExtraRuleItem[];
    /** 测试定位标识。 */
    testId?: string;
  }>(),
  {
    layout: 'inline',
    extraRules: undefined,
    testId: undefined,
  },
);

const policy = computed<PasswordPolicyEvaluation>(() => evaluatePasswordPolicy(props.password));

const ruleItems = computed<PasswordExtraRuleItem[]>(() => {
  const base: PasswordExtraRuleItem[] = [
    { key: 'length', label: '8~20 位', passed: policy.value.lengthOk },
    { key: 'whitespace', label: '不含空白', passed: policy.value.noWhitespace },
    { key: 'categories', label: '大小写/数字/特殊字符至少 3 类', passed: policy.value.categoriesOk },
  ];
  return props.extraRules?.length ? [...base, ...props.extraRules] : base;
});
</script>

<template>
  <ul
    v-if="layout === 'list'"
    :data-testid="testId"
    class="box-border mt-2 mb-0 flex w-full list-none flex-col gap-1 rounded-[var(--solid-radius-md)] border border-border-subtle bg-canvas/70 px-3 py-2 text-xs"
  >
    <li
      v-for="item in ruleItems"
      :key="item.key"
      class="flex items-center gap-1.5"
      :class="item.passed ? 'text-[var(--solid-success)]' : 'text-ink-secondary'"
    >
      <el-icon :size="13"><component :is="item.passed ? Check : Close" /></el-icon>
      <span>{{ item.label }}</span>
    </li>
  </ul>

  <div
    v-else
    :data-testid="testId"
    class="box-border flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle px-2.5 py-1.5 text-xs"
  >
    <span
      v-for="item in ruleItems"
      :key="item.key"
      class="inline-flex items-center gap-1"
      :class="item.passed ? 'text-[var(--solid-success)]' : 'text-ink-muted'"
    >
      <el-icon><component :is="item.passed ? Check : Close" /></el-icon>
      {{ item.label }}
    </span>
  </div>
</template>

<style scoped></style>
