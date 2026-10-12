// ─── HabitTracker Service Worker ──────────────────────────────────────────────
// Handles: offline caching, push notifications, notification click routing
// Version bump forces browsers to install the updated SW
const SW_VERSION = 'habittracker-v5';
const STATIC_CACHE = `${SW_VERSION}-static`;

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
          .filter(k => isLocalhost || k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim()) // take control of all open tabs
  );
});

// ── Fetch Strategy ─────────────────────────────────────────────────────────────
// Localhost: Bypass caching/intercepting to prevent stale assets in development
// Navigation: Network-first → fallback to cache
// Static assets: Cache-first → fallback to network
// API requests: NEVER cached or intercepted — go straight to network
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

  // Don't intercept non-GET, external requests, or authenticated API calls
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (!url.origin.startsWith(self.location.origin)) return;

  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
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
        .catch(() => caches.match(request).then(cached => cached || caches.match('/index.html') || caches.match('/')))
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

  const isAlarm = Boolean(payload.isAlarm || payload.is_alarm);
  const habitId = payload.habitId || payload.habit_id || null;

  const options = {
    body: payload.body || 'Time to check your habits!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || (isAlarm && habitId ? `alarm-habit-${habitId}` : 'habit-reminder'),
    renotify: true,
    requireInteraction: isAlarm,
    vibrate: isAlarm ? [300, 100, 300, 100, 300] : [200, 100, 200],
    data: {
      url: payload.url || '/habits',
      habitId,
      reminderId: payload.reminderId || payload.reminder_id || null,
      isAlarm,
    },
    actions: isAlarm
      ? [
          { action: 'complete', title: '✅ Done' },
          { action: 'skip',     title: '⏭️ Skip' },
        ]
      : [
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

  if (event.action === 'skip') {
    const habitId = event.notification.data?.habitId;
    const reminderId = event.notification.data?.reminderId;
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(async (windowClients) => {
          let clientNotified = false;
          for (const client of windowClients) {
            client.postMessage({ type: 'HABIT_ALARM_SKIPPED', habitId, reminderId });
            clientNotified = true;
          }
          if (!clientNotified) {
            // Re-show notification after 25 minutes
            setTimeout(() => {
              self.registration.showNotification(event.notification.title, {
                ...event.notification,
                body: '⏰ Re-ping (1/3): ' + event.notification.body,
                tag: event.notification.tag,
                requireInteraction: true,
              });
            }, 25 * 60 * 1000);
          }
        })
    );
    return;
  }

  if (event.action === 'complete') {
    const habitId = event.notification.data?.habitId;
    if (habitId) {
      const today = new Date().toISOString().split('T')[0];
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(async (windowClients) => {
            let clientHandled = false;
            for (const client of windowClients) {
              client.postMessage({ type: 'HABIT_MARK_COMPLETE', habitId, today });
              clientHandled = true;
            }

            if (!clientHandled) {
              // Open app with auto-complete query param
              const targetUrl = (event.notification.data?.url || '/habits') + `?auto_complete=${habitId}`;
              if (clients.openWindow) return clients.openWindow(targetUrl);
            } else {
              self.registration.showNotification('🎉 Habit Completed!', {
                body: 'Your streak has been protected.',
                icon: '/icons/icon-192.png',
                tag: 'completion-toast',
              });
            }
          })
      );
      return;
    }
  }

  // Open / focus the app on the right page
  let targetUrl = event.notification.data?.url || '/habits';
  if (event.notification.data?.isAlarm && event.notification.data?.habitId) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + `alarm_habit_id=${event.notification.data.habitId}`;
  }

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

    const now = new Date();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = dayNames[now.getDay()];

    reminders.forEach(reminder => {
      if (reminder.notification_status !== 'Active') return;

      const targetType = reminder.target_type || 'habit';
      const isDeadlineMode = reminder.reminder_mode === 'deadline_proximity';

      // 1. Check if eligible for today
      if (isDeadlineMode) {
        const targetDateStr = reminder.target_date;
        if (!targetDateStr) return;
        const days = Number(reminder.days_before_deadline) || 0;
        const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
        const checkYMD = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
        if (targetDateStr !== checkYMD) return;
      } else {
        // Scheduled mode: check days of week
        let daysList = reminder.days_of_week;
        if (typeof daysList === 'string') {
          try {
            daysList = JSON.parse(daysList);
          } catch {
            daysList = daysList.replace(/[{}"']/g, '').split(',').map((s) => s.trim()).filter(Boolean);
          }
        }
        if (Array.isArray(daysList) && daysList.length > 0) {
          const cleanDays = daysList.map((d) => String(d).replace(/[{}"']/g, '').trim().toLowerCase());
          const isAll = cleanDays.some((d) => d === 'everyday' || d === 'all' || d === 'daily');
          if (!isAll && !cleanDays.includes(currentDay.toLowerCase())) return;
        }
      }

      const rawAlerts = Array.isArray(reminder.alerts) && reminder.alerts.length > 0
        ? reminder.alerts
        : [reminder.reminder_time || '08:00'];
      const timeList = rawAlerts.map((t) => String(t).replace(/[{}"'\s]/g, '').trim()).filter(Boolean);

      timeList.forEach((timeStr, idx) => {
        if (!timeStr || typeof timeStr !== 'string') return;
        const [hh, mm] = timeStr.split(':').map(Number);
        if (isNaN(hh) || isNaN(mm)) return;

        const fire = new Date();
        fire.setHours(hh, mm, 0, 0);

        // If the time has already passed today, skip
        if (fire <= now) return;

        const delay = fire.getTime() - now.getTime();

        let title = '🔔 Reminder';
        let body = reminder.custom_text || 'Time for your scheduled reminder!';
        let targetUrl = '/dashboard';

        if (targetType === 'habit') {
          const habitName = reminder.habit_name || 'Habit';
          title = `🔥 Habit: ${habitName}`;
          body = reminder.custom_text
            ? `${reminder.custom_text} • Habit: ${habitName}`
            : `Time to complete your habit "${habitName}"! Keep your streak going.`;
          targetUrl = '/habits';
        } else if (targetType === 'goal') {
          const goalName = reminder.goal_name || 'Goal';
          if (isDeadlineMode) {
            const days = Number(reminder.days_before_deadline) || 0;
            title = `🎯 Goal Deadline: ${goalName}`;
            body = reminder.custom_text || (days === 0
              ? `🚨 Today is the target deadline for Goal: "${goalName}"!`
              : days === 1
              ? `🚨 Tomorrow is the final day for Goal: "${goalName}"!`
              : `⏳ Only ${days} days remaining for Goal: "${goalName}"!`);
          } else {
            title = `🎯 Goal: ${goalName}`;
            body = reminder.custom_text
              ? `${reminder.custom_text} • Goal: ${goalName}`
              : `Time to log progress for Goal: "${goalName}"!`;
          }
          targetUrl = '/goals';
        } else if (targetType === 'learning_journey' || targetType === 'learning_topic') {
          const itemTitle = reminder.topic_title || reminder.journey_title || 'Study Session';
          if (isDeadlineMode) {
            title = `📚 Learning Hub: ${itemTitle}`;
            body = reminder.custom_text || `Target deadline approaching for Learning Roadmap: "${itemTitle}"!`;
          } else {
            title = `📚 Learning Hub: ${itemTitle}`;
            body = reminder.custom_text
              ? `${reminder.custom_text} • Topic: ${itemTitle}`
              : `Time for your Learning Hub study session on "${itemTitle}"!`;
          }
          targetUrl = '/learning';
        }

        const isAlarm = Boolean(reminder.is_alarm || reminder.reminder_mode === 'alarm');
        const timerId = setTimeout(() => {
          self.registration.showNotification(title, {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: isAlarm ? `alarm-habit-${reminder.habit_id || reminder.id}` : `local-${reminder.id}-${idx}`,
            vibrate: isAlarm ? [300, 100, 300, 100, 300] : [200, 100, 200],
            requireInteraction: isAlarm,
            data: {
              url: isAlarm && reminder.habit_id ? `/habits?alarm_habit_id=${reminder.habit_id}` : targetUrl,
              habitId: reminder.habit_id,
              reminderId: reminder.id,
              isAlarm,
            },
            actions: isAlarm
              ? [
                  { action: 'complete', title: '✅ Done' },
                  { action: 'skip',     title: '⏭️ Skip' },
                ]
              : [
                  { action: 'complete', title: '✅ Mark Done' },
                  { action: 'snooze',   title: '⏰ Snooze 10 min' },
                ],
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

// ── Background Sync ───────────────────────────────────────────────────────────
// Automatically retries queued habit tracking actions when connectivity is restored
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-habit-tracking' || event.tag === 'habit-sync') {
    event.waitUntil(
      clients.matchAll().then((clientList) => {
        clientList.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_BACKGROUND_SYNC' });
        });
      })
    );
  }
});

// ── Periodic Background Sync ──────────────────────────────────────────────────
// Periodically refreshes daily habit status and updates streaks in background
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-daily-habits' || event.tag === 'daily-habit-check') {
    event.waitUntil(
      caches.open(STATIC_CACHE).then((cache) => cache.add('/api/dashboard').catch(() => {}))
    );
  }
});

