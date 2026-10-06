// Service worker: shows the "your order is ready" notification.
// It does nothing else. It does not cache pages, so the site is never stale.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// The push itself carries no details. We ask our own server what to say.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let message = { title: 'Volcano Street Food', body: 'There is news about your order.', url: '/' };
      try {
        const subscription = await self.registration.pushManager.getSubscription();
        if (subscription) {
          const response = await fetch('/api/push/message', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          if (response.ok) message = { ...message, ...(await response.json()) };
        }
      } catch {
        /* show the general message */
      }
      await self.registration.showNotification(message.title, {
        body: message.body,
        icon: '/img/icon-192.png',
        badge: '/img/icon-192.png',
        tag: message.tag || 'volcano-order',
        renotify: true,
        vibrate: [300, 150, 300, 150, 300],
        data: { url: message.url || '/' },
      });
    })()
  );
});

// Tapping the notification opens the order page (or brings it to the front).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => w.url === url);
      if (open) return open.focus();
      return self.clients.openWindow(url);
    })()
  );
});
