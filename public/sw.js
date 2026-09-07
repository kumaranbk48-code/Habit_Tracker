// ─── HabitTracker Service Worker ──────────────────────────────────────────────
// Handles: offline caching, push notifications, notification click routing
// Version bump forces browsers to install the updated SW
const SW_VERSION = 'habittracker-v1';
const STATIC_CACHE = `${SW_VERSION}-static`;
const API_CACHE    = `${SW_VERSION}-api`;

// Files to pre-cache for offline use
const PRECACHE_ASSETS = ['/', '/index.html', '/manifest.json'];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const isLocalhost = Boolean(
    self.location.hostname === 'localhost' ||
    self.location.hostname === '[::1]' ||
    self.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
  );

  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => isLocalhost || (k !== STATIC_CACHE && k !== API_CACHE))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim()) // take control of all open tabs
  );
});

// ── Fetch Strategy ─────────────────────────────────────────────────────────────
// Localhost: Bypass caching/intercepting to prevent stale assets in development
// API/Navigation: Network-first → fallback to cache
// Static assets: Cache-first → fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypass service worker caching/intercepting on localhost to prevent stale asset issues in local development
  const isLocalhost = Boolean(
    self.location.hostname === 'localhost' ||
    self.location.hostname === '[::1]' ||
    self.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
  );
  if (isLocalhost) return;

  // Don't intercept non-GET or external requests
  if (request.method !== 'GET') return;
  if (!url.origin.startsWith(self.location.origin) && !url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/api/')) {
    // Network-first for API
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  } else if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    // Network-first for navigation requests (HTML pages) so changes show up immediately when online
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  } else {
    // Cache-first for other static assets (JS, CSS, images, etc.)
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(c => c.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});

// ── Push Notifications ─────────────────────────────────────────────────────────
// Triggered by the server via Web Push API (VAPID)
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'HabitTracker', body: event.data.text() };
  }

  const options = {
    body: payload.body || 'Time to check your habits!',
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    tag: payload.tag || 'habit-reminder',
    renotify: true,
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: {
      url: payload.url || '/habits',
      habitId: payload.habitId || null,
    },
    actions: [
      { action: 'complete', title: '✅ Mark Done' },
      { action: 'snooze',   title: '⏰ Snooze 10 min' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || '🔥 Habit Reminder', options)
  );
});

// ── Notification Click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'snooze') {
    // Re-show notification after 10 minutes
    event.waitUntil(
      new Promise(resolve => {
        setTimeout(() => {
          self.registration.showNotification(event.notification.title, {
            ...event.notification,
            body: '⏰ Snoozed reminder: ' + event.notification.body,
          });
          resolve();
        }, 10 * 60 * 1000);
      })
    );
    return;
  }

  // Open / focus the app on the right page
  const targetUrl = event.notification.data?.url || '/habits';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // If app is already open, focus it and navigate
        for (const client of windowClients) {
          if ('focus' in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        // Otherwise open a new window
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

// ── Message Handler ────────────────────────────────────────────────────────────
// App sends reminders to SW so it can show local notifications at the right time
// (used as fallback when server push is not yet set up)
const scheduledTimers = new Map();

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SCHEDULE_LOCAL_REMINDERS') {
    const reminders = event.data.reminders || [];

    // Clear old timers
    scheduledTimers.forEach(id => clearTimeout(id));
    scheduledTimers.clear();

    reminders.forEach(reminder => {
      if (reminder.notification_status !== 'Active') return;

      const timeList = Array.isArray(reminder.alerts) && reminder.alerts.length > 0
        ? reminder.alerts
        : [reminder.reminder_time || '08:00'];

      timeList.forEach((timeStr, idx) => {
        const [hh, mm] = timeStr.split(':').map(Number);
        if (isNaN(hh) || isNaN(mm)) return;

        const now  = new Date();
        const fire = new Date();
        fire.setHours(hh, mm, 0, 0);

        // If the time has already passed today, skip
        if (fire <= now) return;

        const delay = fire.getTime() - now.getTime();
        const timerId = setTimeout(() => {
          const bodyText = reminder.custom_text || `Time for: ${reminder.habit_name}!`;
          self.registration.showNotification('🔔 Habit Reminder', {
            body: bodyText,
            icon: '/icons/icon-192.svg',
            badge: '/icons/icon-192.svg',
            tag: `local-${reminder.id}-${idx}`,
            vibrate: [200, 100, 200],
            data: { url: '/habits' },
          });
        }, delay);

        scheduledTimers.set(`${reminder.id}-${idx}`, timerId);
      });
    });

    // Confirm scheduling back to the app
    event.source?.postMessage({
      type: 'REMINDERS_SCHEDULED',
      count: scheduledTimers.size,
    });
  }
});
