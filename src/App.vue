<script setup lang="ts">
/**
 * 管理后台根组件骨架（业务路由与布局壳待前置底座闭环后按 Spec 装配）。
 *
 * @author Ateng
 * @since 2026-11-19
 */
const appTitle = import.meta.env.VITE_APP_TITLE || 'ateng-solid 管理后台';
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-page p-6 text-main">
    <section class="w-full max-w-lg rounded-lg border border-subtle bg-card p-6">
      <h1 class="text-xl font-semibold">{{ appTitle }}</h1>
      <p class="mt-2 text-sm text-secondary">
        前端工程基础骨架已就绪（Vue 3.5 + Vite 6 + ateng-ui + TailwindCSS v4 无 Preflight）。
      </p>
    </section>
  </main>
</template>

<style scoped></style>
