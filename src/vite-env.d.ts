/// <reference types="vite/client" />

/**
 * Vite 构建与运行时环境变量契约声明。
 *
 * @author Ateng
 * @since 2026-11-26
 */
interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string;
  readonly VITE_PORT?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_TIMEOUT?: string;
  readonly VITE_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
