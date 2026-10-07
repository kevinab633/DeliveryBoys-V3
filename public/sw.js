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

// A registered fetch handler (even a pure passthrough, no caching) is part
// of Chrome's installability check on Android — without one, "Install app"
// can report "This app cannot be installed" even though the manifest and
// HTTPS requirements are met. This intentionally does no caching, just
// hands every request straight to the network, matching the "minimal, no
// offline support" design of this service worker.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
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
    // A real PNG renders reliably as the notification's large icon on
    // Android; SVG (the old value here) is inconsistently supported and
    // often falls back to a blank/generic icon, which reads as "weak" or
    // easy to miss even though the vibration below is firing correctly.
    icon: '/icons/icon-512.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' },
    vibrate: [400, 150, 400, 150, 400],
    tag: data.tag || 'delivery-boys-order',
    renotify: true,
    requireInteraction: true,
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
