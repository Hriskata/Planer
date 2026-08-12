import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      // widget.html is the compact "today's tasks" view the Electron desktop widget
      // loads (see ../desktop-widget/) — a second, much smaller entry point alongside
      // the main app, reusing the same api.js/stores.js/colors.js modules.
      input: {
        main: resolve(__dirname, 'index.html'),
        widget: resolve(__dirname, 'widget.html'),
      },
    },
  },
  plugins: [
    svelte(),
    VitePWA({
      // injectManifest (not the default generateSW) because task reminders need a
      // custom `push` / `notificationclick` handler in the service worker — generateSW
      // only knows how to build caching routes, it has no hook for arbitrary event
      // listeners. src/sw.js is ours; this just injects the precache manifest into it.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
      },
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
    }),
  ],
  server: {
    // During development the Vite server proxies /api requests to the backend,
    // so there's no need for CORS in dev mode. Overridable via BACKEND_PORT for the
    // rare case the frontend dev server itself needs to sit on the backend's usual
    // port (e.g. a quick preview on :3000 while the backend runs alongside on a
    // different port) — defaults to the normal setup otherwise.
    proxy: {
      '/api': `http://localhost:${process.env.BACKEND_PORT || 3000}`,
      // Task images live under /uploads, served by the backend's own express.static
      // (see backend/src/app.js) — same-origin in production (one server for
      // everything) but never proxied here, so every task photo 404'd whenever this
      // was actually tested against `vite dev` instead of the Docker build.
      '/uploads': `http://localhost:${process.env.BACKEND_PORT || 3000}`,
    },
  },
});
