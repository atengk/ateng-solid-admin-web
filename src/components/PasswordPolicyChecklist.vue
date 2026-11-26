<script setup lang="ts">
import { computed } from 'vue';
import { ElIcon } from 'element-plus';
import { Check, Warning } from '@element-plus/icons-vue';
import {
  evaluatePasswordPolicy,
  PASSWORD_MAX_LENGTH,
  type PasswordPolicyEvaluation,
} from '@/utils/password';

/**
 * 全站统一强口令复杂度实时校验提示组件（分层矩阵 + 4 类字符芯片，实时展示长度、空白告警及字符类别命中进度）。
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
    /** 布局模式：inline 紧凑展示（弹窗/抽屉）或 list 独立上间距（个人中心改密）。 */
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

const lengthStatusClass = computed<string>(() => {
  if (policy.value.lengthOk) {
    return 'text-[var(--solid-success)] font-medium';
  }
  if (policy.value.length > PASSWORD_MAX_LENGTH) {
    return 'text-[var(--solid-danger)] font-medium';
  }
  return 'text-ink-secondary';
});

const lengthBadgeClass = computed<string>(() => {
  if (policy.value.lengthOk) {
    return 'bg-[var(--solid-success-soft)] text-[var(--solid-success)]';
  }
  if (policy.value.length > PASSWORD_MAX_LENGTH) {
    return 'bg-[var(--solid-danger-soft)] text-[var(--solid-danger)]';
  }
  return 'bg-surface-subtle text-ink-secondary';
});

const whitespaceState = computed<'error' | 'passed' | 'clean' | 'idle'>(() => {
  if (policy.value.hasWhitespace) {
    return 'error';
  }
  if (policy.value.valid) {
    return 'passed';
  }
  if (policy.value.length > 0) {
    return 'clean';
  }
  return 'idle';
});

const whitespaceLabel = computed<string>(() => {
  if (whitespaceState.value === 'error') {
    return '检测到空白字符，请删除';
  }
  if (whitespaceState.value === 'idle') {
    return '不含空白字符';
  }
  return '无空白字符';
});

const categoryChips = computed(() => [
  { key: 'upper', label: '大写 A-Z', hit: policy.value.hasUpper },
  { key: 'lower', label: '小写 a-z', hit: policy.value.hasLower },
  { key: 'digit', label: '数字 0-9', hit: policy.value.hasDigit },
  { key: 'special', label: '符号 !@#', hit: policy.value.hasSpecial },
]);
</script>

<template>
  <div
    :data-testid="testId"
    class="box-border flex w-full flex-col gap-1.5 text-xs"
    :class="layout === 'list' ? 'mt-2' : ''"
  >
    <!-- 基础硬性约束行：长度计数器 + 空白字符防护 -->
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span class="inline-flex items-center gap-1.5 leading-snug" :class="lengthStatusClass">
        <el-icon v-if="policy.lengthOk" :size="13"><Check /></el-icon>
        <el-icon v-else-if="policy.length > PASSWORD_MAX_LENGTH" :size="13"><Warning /></el-icon>
        <span
          v-else
          aria-hidden="true"
          class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-current opacity-65"
        />
        <span>8~20 位</span>
        <span
          class="font-mono-data inline-flex h-[18px] items-center rounded-[var(--solid-radius-sm)] px-1.5 text-xs leading-none"
          :class="lengthBadgeClass"
        >
          {{ policy.length }}/{{ PASSWORD_MAX_LENGTH }}
        </span>
      </span>

      <span
        class="inline-flex items-center gap-1.5 leading-snug"
        :class="
          whitespaceState === 'error'
            ? 'text-[var(--solid-danger)] font-medium'
            : whitespaceState === 'passed'
              ? 'text-[var(--solid-success)] font-medium'
              : 'text-ink-secondary'
        "
      >
        <el-icon v-if="whitespaceState === 'error'" :size="13"><Warning /></el-icon>
        <el-icon
          v-else-if="whitespaceState === 'passed' || whitespaceState === 'clean'"
          :size="13"
        >
          <Check />
        </el-icon>
        <span
          v-else
          aria-hidden="true"
          class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-current opacity-65"
        />
        <span>{{ whitespaceLabel }}</span>
      </span>
    </div>

    <!-- 4 选 3 字符组合矩阵 -->
    <div
      class="flex flex-col gap-1.5 rounded-[var(--solid-radius-md)] border border-border-subtle bg-canvas/70 px-2.5 py-2"
    >
      <div
        class="flex items-center justify-between gap-2 leading-snug"
        :class="policy.categoriesOk ? 'text-[var(--solid-success)] font-medium' : 'text-ink-secondary'"
      >
        <span class="inline-flex items-center gap-1.5">
          <el-icon v-if="policy.categoriesOk" :size="13"><Check /></el-icon>
          <span
            v-else
            aria-hidden="true"
            class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-current opacity-65"
          />
          <span>字符组合至少 3 类</span>
        </span>
        <span class="tabular-nums">
          {{ policy.categoryCount }} / 3 类{{ policy.categoriesOk ? ' · 已达标' : '' }}
        </span>
      </div>

      <div class="grid grid-cols-[repeat(auto-fit,minmax(74px,1fr))] gap-1.5">
        <span
          v-for="chip in categoryChips"
          :key="chip.key"
          :data-testid="testId ? `${testId}-${chip.key}` : undefined"
          class="inline-flex h-6 items-center justify-center gap-1 whitespace-nowrap rounded-[var(--solid-radius-sm)] border px-1.5 text-xs transition-colors"
          :class="
            chip.hit
              ? 'border-[var(--solid-success-border)] bg-[var(--solid-success-soft)] text-[var(--solid-success)] font-medium'
              : policy.categoriesOk
                ? 'border-dashed border-border bg-surface text-ink-muted opacity-70'
                : 'border-border bg-surface text-ink-secondary'
          "
        >
          <el-icon v-if="chip.hit" :size="12"><Check /></el-icon>
          <span>{{ chip.label }}</span>
        </span>
      </div>
    </div>

    <!-- 场景追加约束（如个人中心不能与当前密码一致） -->
    <ul
      v-if="extraRules?.length"
      class="m-0 flex list-none flex-col gap-1 p-0 pt-0.5"
    >
      <li
        v-for="item in extraRules"
        :key="item.key"
        class="flex items-center gap-1.5 leading-snug"
        :class="item.passed ? 'text-[var(--solid-success)] font-medium' : 'text-ink-secondary'"
      >
        <el-icon v-if="item.passed" :size="13"><Check /></el-icon>
        <span
          v-else
          aria-hidden="true"
          class="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-current opacity-65"
        />
        <span>{{ item.label }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped></style>
