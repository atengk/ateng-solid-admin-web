<script setup lang="ts">
import BrandLogo from '@/components/BrandLogo.vue';

/**
 * 登录页左侧深岩建筑感品牌面板（方案 C · >= 960px 展示）：
 * 以建筑制图细网格与大尺度「三阶精密基座」结构线稿水印为主视觉，呈现克制简洁的品牌定位。
 *
 * @author Ateng
 * @since 2026-11-26
 */
defineOptions({ name: 'LoginBrandPanel' });
</script>

<template>
  <aside
    data-testid="login-brand-panel"
    class="solid-login-aside relative hidden flex-col justify-between overflow-hidden border-r border-border px-9 py-9 min-[960px]:flex min-[960px]:min-h-[460px]"
  >
    <div class="solid-blueprint-grid pointer-events-none absolute inset-0" aria-hidden="true" />

    <svg
      class="pointer-events-none absolute -right-9 bottom-11 h-[360px] w-[360px]"
      viewBox="0 0 360 360"
      fill="none"
      aria-hidden="true"
    >
      <path
        class="solid-watermark-guide"
        d="M24 316L316 24"
        stroke-width="1"
        stroke-dasharray="4 4"
      />
      <path class="solid-watermark-guide" d="M84 336H336V84" stroke-width="1" />
      <circle class="solid-watermark-node" cx="290" cy="70" r="3" />
      <path
        class="solid-watermark-accent"
        d="M132 76H268L238 128H102L132 76Z"
        stroke-width="1.2"
      />
      <path class="solid-watermark-mid" d="M108 158H292L262 210H78L108 158Z" stroke-width="1.2" />
      <path class="solid-watermark-base" d="M84 240H316L286 292H54L84 240Z" stroke-width="1.2" />
    </svg>

    <div class="relative z-10">
      <BrandLogo :size="26" tone="dark-panel" wordmark-size="md" />
    </div>

    <div class="relative z-10 mt-auto max-w-[340px]">
      <h2 class="m-0 text-[22px] font-semibold leading-snug tracking-tight">
        稳固底座 · 精密治理
      </h2>
      <p class="solid-login-aside-sub mt-2 mb-0 text-[13px] leading-relaxed">
        面向企业级二开场景的统一认证、多租户隔离与系统运维工作台。
      </p>
    </div>
  </aside>
</template>

<style scoped>
.solid-login-aside {
  background-color: var(--solid-brand-panel-bg);
  color: var(--solid-brand-panel-text);
}

.solid-blueprint-grid {
  background-image:
    linear-gradient(to right, var(--solid-brand-panel-grid) 1px, transparent 1px),
    linear-gradient(to bottom, var(--solid-brand-panel-grid) 1px, transparent 1px);
  background-size: 40px 40px;
}

.solid-watermark-guide {
  stroke: var(--solid-brand-watermark-guide);
}

.solid-watermark-node {
  fill: var(--solid-brand-watermark-node);
}

.solid-watermark-accent {
  fill: var(--solid-brand-watermark-accent-fill);
  stroke: var(--solid-brand-watermark-accent-stroke);
}

.solid-watermark-mid {
  fill: var(--solid-brand-watermark-mid-fill);
  stroke: var(--solid-brand-watermark-mid-stroke);
}

.solid-watermark-base {
  fill: var(--solid-brand-watermark-base-fill);
  stroke: var(--solid-brand-watermark-base-stroke);
}

.solid-login-aside-sub {
  color: var(--solid-brand-panel-text-secondary);
}
</style>
