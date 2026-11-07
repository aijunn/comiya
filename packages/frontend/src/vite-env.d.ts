/// <reference types="vite/client" />
/// <reference types="unplugin-vue-router/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** 可选的接口服务地址，例如 http://127.0.0.1:8000；留空表示与前端同源 */
  readonly VITE_API_BASE_URL?: string;
}
