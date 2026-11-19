/// <reference types="vite/client" />

/**
 * 前端 Vite 环境变量强类型声明。
 *
 * @author Ateng
 * @since 2026-11-19
 */
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_PORT?: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_PROXY_TARGET?: string;
  readonly VITE_MONITOR_ENABLED?: string;
  readonly VITE_MONITOR_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
