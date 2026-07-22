import { precacheAndRoute } from 'workbox-precaching';

// Injected at build time by vite-plugin-pwa (injectManifest) — same static-asset
// precaching generateSW used to do automatically. API requests (/api/*) are
// deliberately NOT cached here — offline access to tasks is implemented separately,
// via localStorage in src/lib/api.js (see the comment there).
precacheAndRoute(self.__WB_MANIFEST);

// Task reminders (~10 min before a task's time), sent by the backend's scheduler —
// this is what actually displays them, including while the app itself is closed.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() ?? '' };
  }
  const title = data.title || 'Планер';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Focuses an already-open tab instead of opening a duplicate one, if possible.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
