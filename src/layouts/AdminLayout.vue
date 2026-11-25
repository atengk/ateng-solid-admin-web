<script setup lang="ts">
/**
 * 方案 A 管理后台布局壳最小路由占位组件（完整实现于后续布局工单补充）。
 *
 * @author Ateng
 * @since 2026-11-25
 */
defineOptions({ name: 'RootLayout' });
</script>

<template>
  <div class="min-h-screen bg-canvas text-ink">
    <router-view />
  </div>
</template>

<style scoped></style>
