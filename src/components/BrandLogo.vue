<script setup lang="ts">
import { computed } from 'vue';

/**
 * 全工作区统一品牌图形主标与组合标（方案 B · 三阶精密基座），
 * 随 Precision Slate & Cobalt 语义令牌自适应浅色表面、深岩登录栏与 Dark 模式呈色。
 *
 * @author Ateng
 * @since 2026-11-26
 */
defineOptions({ name: 'BrandLogo' });

type BrandTone = 'primary' | 'dark-panel' | 'inverse';
type WordmarkSize = 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{
    /**
     * 品牌图形主标尺寸（像素）。
     */
    size?: number;
    /**
     * 是否展示横向品牌短名（如侧栏折叠态置为 false 仅显示居中图形）。
     */
    showWordmark?: boolean;
    /**
     * 渲染场景语义色阶：primary（常规表面）、dark-panel（深岩面板）、inverse（纯白反白）。
     */
    tone?: BrandTone;
    /**
     * 品牌文字标字号档位。
     */
    wordmarkSize?: WordmarkSize;
    /**
     * 品牌短名文案（默认统一为工作区短名 ateng-solid，供二开集中替换）。
     */
    wordmark?: string;
  }>(),
  {
    size: 24,
    showWordmark: true,
    tone: 'primary',
    wordmarkSize: 'md',
    wordmark: 'ateng-solid',
  },
);

const TONE_CLASS_MAP: Record<BrandTone, { mark: string; text: string }> = {
  primary: { mark: 'brand-mark-primary', text: 'brand-wordmark-primary' },
  'dark-panel': { mark: 'brand-mark-dark-panel', text: 'brand-wordmark-dark-panel' },
  inverse: { mark: 'brand-mark-inverse', text: 'brand-wordmark-inverse' },
};

const WORDMARK_SIZE_CLASS_MAP: Record<WordmarkSize, string> = {
  sm: 'text-[14px]',
  md: 'text-[15px]',
  lg: 'text-base',
};

const toneClasses = computed(() => TONE_CLASS_MAP[props.tone]);
const wordmarkSizeClass = computed(() => WORDMARK_SIZE_CLASS_MAP[props.wordmarkSize]);
</script>

<template>
  <span
    data-testid="brand-logo"
    class="inline-flex min-w-0 shrink-0 items-center gap-2.5 select-none"
  >
    <svg
      data-testid="brand-logo-mark"
      :class="['block shrink-0', toneClasses.mark]"
      :width="size"
      :height="size"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path d="M11 5H24L21 10H8L11 5Z" fill="currentColor" />
      <path d="M9 13.5H26L23 18.5H6L9 13.5Z" fill="currentColor" class="brand-mark-tier-mid" />
      <path d="M7 22H28L25 27H4L7 22Z" fill="currentColor" class="brand-mark-tier-base" />
    </svg>

    <span
      v-if="showWordmark"
      data-testid="brand-logo-wordmark"
      :class="[
        'truncate font-semibold leading-none tracking-tight whitespace-nowrap',
        wordmarkSizeClass,
        toneClasses.text,
      ]"
    >
      {{ wordmark }}
    </span>
  </span>
</template>

<style scoped>
.brand-mark-primary {
  color: var(--solid-primary);
}

.brand-mark-dark-panel {
  color: var(--solid-brand-panel-dot);
}

.brand-mark-inverse {
  color: var(--solid-brand-panel-on-primary);
}

.brand-mark-tier-mid {
  opacity: var(--solid-mark-tertiary-opacity, 0.8);
}

.brand-mark-tier-base {
  opacity: var(--solid-mark-secondary-opacity, 0.62);
}

.brand-wordmark-primary {
  color: var(--solid-text-primary);
}

.brand-wordmark-dark-panel {
  color: var(--solid-brand-panel-text);
}

.brand-wordmark-inverse {
  color: var(--solid-brand-panel-on-primary);
}
</style>
