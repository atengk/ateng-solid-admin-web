import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

/**
 * Vite 6 构建与本地开发代理配置（集成 TailwindCSS v4 无 Preflight、直通 /admin 代理与底座分包）。
 *
 * @author Ateng
 * @since 2026-11-19
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8080';

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true,
      port: Number(env.VITE_PORT || 5173),
      proxy: {
        '/admin': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) {
              return undefined;
            }
            if (id.includes('/node_modules/element-plus/') || id.includes('/node_modules/@element-plus/')) {
              return 'vendor-element-plus';
            }
            if (id.includes('/node_modules/@atengk/')) {
              return 'vendor-ateng-ui';
            }
            if (
              id.includes('/node_modules/vue/') ||
              id.includes('/node_modules/@vue/') ||
              id.includes('/node_modules/vue-router/') ||
              id.includes('/node_modules/pinia/')
            ) {
              return 'vendor-vue';
            }
            return 'vendor-misc';
          },
        },
      },
    },
  };
});
