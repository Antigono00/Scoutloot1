/**
 * ScoutLoot Service Worker
 * Handles push notifications and notification clicks
 */

const CACHE_NAME = 'scoutloot-v1';

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(clients.claim());
});

// Push event - display notification
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  if (!event.data) {
    console.log('[SW] Push event but no data');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
    payload = {
      title: 'ScoutLoot Deal Alert',
      body: event.data.text(),
    };
  }

  const options = {
    body: payload.body || 'New deal found!',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/badge-72.png',
    vibrate: [100, 50, 100],
    data: payload.data || {},
    actions: payload.actions || [
      { action: 'buy', title: '🛒 Buy Now' },
      { action: 'view', title: '👁 View' },
    ],
    requireInteraction: true, // Keep notification visible until user interacts
    tag: payload.data?.alertId ? `alert-${payload.data.alertId}` : 'scoutloot-alert',
    renotify: true, // Vibrate/sound even for same tag
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'ScoutLoot', options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl;

  if (event.action === 'buy' && data.listingUrl) {
    // Open eBay listing directly
    targetUrl = data.listingUrl;
  } else if (event.action === 'view' && data.url) {
    // Open ScoutLoot alert detail page
    targetUrl = data.url;
  } else if (data.url) {
    // Default: open ScoutLoot alert page
    targetUrl = data.url;
  } else if (data.listingUrl) {
    // Fallback: open eBay
    targetUrl = data.listingUrl;
  } else {
    // Last resort: open ScoutLoot home
    targetUrl = '/';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already a ScoutLoot window open
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            // If opening internal URL, navigate existing window
            if (targetUrl.startsWith('/') || targetUrl.includes(self.location.origin)) {
              return client.navigate(targetUrl).then(() => client.focus());
            }
            // If opening external URL (eBay), just focus and open new tab
            client.focus();
            return clients.openWindow(targetUrl);
          }
        }
        // No existing window, open new one
        return clients.openWindow(targetUrl);
      })
  );
});

// Notification close event (for analytics)
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed without action');
  // Could send analytics here
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
