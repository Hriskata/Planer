import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      // By default vite-plugin-pwa does NOT serve the manifest/service worker in `vite dev`
      // (only on `vite build`). We enable it explicitly so PWA installability can be
      // tested locally without doing a build every time.
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Планер',
        short_name: 'Планер',
        description: 'Организиране на задачи за семейството',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Caches static assets (JS/CSS/icons) at build time. API requests (/api/*)
        // are deliberately NOT cached here — offline access to tasks is implemented
        // separately, via localStorage in src/lib/api.js (see the comment there).
        globPatterns: ['**/*.{js,css,html,png,svg}'],
      },
    }),
  ],
  server: {
    // During development the Vite server proxies /api requests to the backend,
    // so there's no need for CORS in dev mode.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
