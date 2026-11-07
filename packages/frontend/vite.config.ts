import vue from '@vitejs/plugin-vue';
import vueRouter from 'unplugin-vue-router/vite';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vueRouter(),
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: 'Comiya',
        short_name: 'Comiya',
        description: 'A simple comic site',
        theme_color: '#fff',
        icons: [
          {
            src: 'comiya.svg',
            sizes: '48x48',
            type: 'image/svg+xml',
          },
          {
            src: 'comiya.svg',
            sizes: '96x96',
            type: 'image/svg+xml',
          },
          {
            src: 'comiya.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
          },
          {
            src: 'comiya.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
          {
            src: 'comiya.svg',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'comiya.svg',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        display: 'standalone',
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
