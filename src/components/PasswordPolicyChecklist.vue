<script setup lang="ts">
import { computed } from 'vue';
import { ElIcon } from 'element-plus';
import { Check, Close } from '@element-plus/icons-vue';
import { evaluatePasswordPolicy, type PasswordPolicyEvaluation } from '@/utils/password';

/**
 * 全站统一强口令复杂度实时校验提示条（复用 evaluatePasswordPolicy 展示三项合规指示）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'PasswordPolicyChecklist' });

const props = defineProps<{
  /**
   * 待评估的原始明文密码。
   */
  password: string;
}>();

const policy = computed<PasswordPolicyEvaluation>(() => evaluatePasswordPolicy(props.password));
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--solid-radius-md)] border border-border bg-surface-subtle px-2.5 py-1.5 text-xs"
  >
    <span
      class="inline-flex items-center gap-1"
      :class="policy.lengthOk ? 'text-[var(--solid-success)]' : 'text-ink-muted'"
    >
      <el-icon><component :is="policy.lengthOk ? Check : Close" /></el-icon>
      8~20 位
    </span>
    <span
      class="inline-flex items-center gap-1"
      :class="policy.noWhitespace ? 'text-[var(--solid-success)]' : 'text-ink-muted'"
    >
      <el-icon><component :is="policy.noWhitespace ? Check : Close" /></el-icon>
      不含空白
    </span>
    <span
      class="inline-flex items-center gap-1"
      :class="policy.categoriesOk ? 'text-[var(--solid-success)]' : 'text-ink-muted'"
    >
      <el-icon><component :is="policy.categoriesOk ? Check : Close" /></el-icon>
      大小写/数字/特殊字符至少 3 类
    </span>
  </div>
</template>

<style scoped></style>
