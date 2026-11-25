import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

/**
 * Vitest 离线单元测试配置（依托 happy-dom 与 tests/setup.ts 确定性隔离基线）。
 *
 * @author Ateng
 * @since 2026-11-19
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    // 多 Worker 并发挂载 Element Plus 全量视图时冷启动偶发接近 5s，放宽单测超时避免并发争用抖动
    testTimeout: 15_000,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,js}', 'src/**/*.{test,spec}.{ts,js}'],
    server: {
      deps: {
        // 内联 Element Plus 与 async-validator，避免 Vitest 外部化读取 CJS 入口导致表单校验失效
        inline: [/element-plus/, /async-validator/],
      },
    },
  },
});
