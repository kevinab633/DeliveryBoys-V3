// ── Delivery Boys service worker ─────────────────────────────────────
// Handles Web Push: shows a real system notification even when no tab
// of the app is open, and focuses/opens the app when it's tapped.
// This is intentionally minimal — it does NOT do offline caching or
// asset precaching, only push handling.

self.addEventListener('install', () => {
  // Activate this worker as soon as it's installed, without waiting for
  // old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Delivery Boys', body: 'You have a new update.', url: '/' };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch {
    // Payload wasn't JSON — fall back to the default text above.
    try {
      data.body = event.data.text() || data.body;
    } catch {
      /* ignore — show the generic default */
    }
  }

  const options = {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    tag: data.tag || 'delivery-boys-order',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a tab is already open, focus it and navigate there.
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) {
            try { client.navigate(targetUrl); } catch { /* ignore */ }
          }
          return;
        }
      }
      // Otherwise open a new tab.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    }),
  );
});
