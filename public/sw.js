// ─── HabitTracker Service Worker ──────────────────────────────────────────────
// Handles: offline application shell caching, push notifications, local timer reminders,
// notification click routing, and background sync triggers.
const SW_VERSION = 'habittracker-pwa-v2';
const STATIC_CACHE = `${SW_VERSION}-static`;

/**
 * Verifies response Content-Type matches the requested asset type (G-07 / E10).
 * Prevents caching stale HTML fallback pages under .js/.css/image URLs.
 */
function isMatchingContentType(request, response) {
  if (!response || !response.ok) return false;
  const ct = (response.headers?.get('content-type') || '').toLowerCase();
  const urlStr = typeof request === 'string' ? request : request.url;
  const dest = typeof request === 'string' ? '' : (request.destination || '');
  const mode = typeof request === 'string' ? '' : (request.mode || '');
  const pathname = new URL(urlStr, self.location.origin).pathname.toLowerCase();

  if (mode === 'navigate' || pathname === '/' || pathname.endsWith('.html')) {
    return ct.includes('text/html');
  }
  if (dest === 'script' || pathname.endsWith('.js') || pathname.endsWith('.mjs')) {
    return ct.includes('javascript') || ct.includes('ecmascript');
  }
  if (dest === 'style' || pathname.endsWith('.css')) {
    return ct.includes('text/css');
  }
  if (dest === 'image' || /\.(png|jpe?g|webp|svg|ico|gif)$/i.test(pathname)) {
    return ct.startsWith('image/');
  }
  if (dest === 'font' || /\.(woff2?|ttf|otf|eot)$/i.test(pathname)) {
    return ct.includes('font') || ct.includes('application/octet-stream');
  }
  if (pathname.endsWith('.json') || pathname.endsWith('manifest.json')) {
    return ct.includes('application/json') || ct.includes('application/manifest+json');
  }
  return !ct.includes('text/html');
}

// Core Application Shell assets pre-cached on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.svg',
  '/habiz-logo.png',
  '/habiz-logo-tile.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        return Promise.allSettled(
          PRECACHE_ASSETS.map((asset) =>
            fetch(asset, { cache: 'no-cache' })
              .then((res) => {
                if (res.ok && isMatchingContentType(asset, res)) return cache.put(asset, res);
                return null;
              })
              .catch(() => null)
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('habittracker-') && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch Strategy ─────────────────────────────────────────────────────────────
// - Navigation requests (HTML): Network-First → Cache Fallback (/index.html) → /offline.html
// - Static assets (JS, CSS, images, fonts): Cache-First → Network Fallback
// - Sensitive API requests (/api/*): NEVER cached in Cache API
// - APK installer downloads: ALWAYS bypassed from SW interception
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Only intercept GET requests
  if (request.method !== 'GET') return;

  // 2. Strict Security: NEVER cache or intercept sensitive API endpoints
  if (url.pathname.startsWith('/api/')) return;

  // 2b. APK downloads bypass: never intercept or cache APK installer packages
  if (url.pathname.startsWith('/downloads/') || url.pathname.endsWith('.apk')) return;

  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (!isSameOrigin && !isGoogleFont) return;

  // 3. Navigation requests (Opening pages or switching routes)
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && isMatchingContentType(request, response)) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const indexHtml = await caches.match('/index.html');
          if (indexHtml) return indexHtml;
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;
          const offlinePage = await caches.match('/offline.html');
          if (offlinePage) return offlinePage;
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // 4. Static assets (JS bundles, CSS, icons, images, web fonts)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.ok &&
          (networkResponse.type === 'basic' || networkResponse.type === 'cors') &&
          isMatchingContentType(request, networkResponse)
        ) {
          const clone = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(async () => {
        // Return matching asset from cache if available under alternate path
        const fallback = await caches.match(url.pathname);
        if (fallback) return fallback;
        return new Response('', { status: 408, statusText: 'Request Timed Out / Offline' });
      });
    })
  );
});

// ── Notification Helper Logic ──────────────────────────────────────────────────
function swFormatLocalYMD(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getSwNotificationActionMode(data) {
  const type = String(data?.targetType || 'habit').toLowerCase();
  if (type === 'habit') return 'complete_habit';
  if (type === 'goal') {
    if (data?.milestoneId) return 'complete_milestone';
    return data?.hasMilestones ? 'ack_goal_day' : 'confirm_goal';
  }
  if (type === 'learning_topic' || data?.topicId) return 'complete_topic';
  if (type === 'learning_journey') return 'confirm_journey';
  return 'complete_habit';
}

function buildSwNotificationActions(data, isAlarm) {
  const targetType = String(data?.targetType || 'habit').toLowerCase();
  if (isAlarm && targetType === 'habit') {
    return [
      { action: 'complete', title: '✅ Done' },
      { action: 'skip',     title: '⏭️ Skip' },
    ];
  }
  const mode = getSwNotificationActionMode(data);
  if (mode === 'confirm_goal' || mode === 'confirm_journey') {
    return [
      { action: 'open',   title: '🔍 Open' },
      { action: 'snooze', title: '⏰ Snooze 10 min' },
    ];
  }
  return [
    { action: 'complete', title: '✅ Mark Done' },
    { action: 'snooze',   title: '⏰ Snooze 10 min' },
  ];
}

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

  const targetType = String(payload.targetType || payload.target_type || 'habit').toLowerCase();
  const isAlarm = Boolean(payload.isAlarm || payload.is_alarm)
    && ['habit', 'goal', 'learning_journey', 'learning_topic'].includes(targetType);
  const habitId = payload.habitId || payload.habit_id || null;
  const goalId = payload.goalId || payload.goal_id || null;
  const milestoneId = payload.milestoneId || payload.milestone_id || null;
  const journeyId = payload.journeyId || payload.journey_id || null;
  const topicId = payload.topicId || payload.topic_id || null;
  const reminderId = payload.reminderId || payload.reminder_id || null;
  const hasMilestones = Boolean(payload.hasMilestones || payload.goal_has_milestones);
  const reminderMode = payload.reminderMode || payload.reminder_mode || 'scheduled';
  const entityId = habitId || goalId || topicId || journeyId || reminderId;

  const data = {
    url: payload.url || (targetType === 'goal' ? '/goals' : targetType.startsWith('learning') ? '/learning' : '/habits'),
    targetType,
    habitId,
    goalId,
    milestoneId,
    journeyId,
    topicId,
    reminderId,
    hasMilestones,
    reminderMode,
    itemName: payload.itemName || '',
    milestoneTitle: payload.milestoneTitle || '',
    isAlarm,
  };

  const options = {
    body: payload.body || 'Time to check your habits!',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || (isAlarm && entityId ? `alarm-${targetType}-${entityId}` : reminderId ? `reminder-${reminderId}` : 'habit-reminder'),
    renotify: true,
    requireInteraction: isAlarm,
    vibrate: isAlarm ? [300, 100, 300, 100, 300] : [200, 100, 200],
    data,
    actions: buildSwNotificationActions(data, isAlarm),
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || '🔥 Habit Reminder', options)
  );
});

// ── Notification Click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const today = swFormatLocalYMD(new Date());

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
    const habitId = data.habitId;
    const reminderId = data.reminderId;
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
    const habitId = data.habitId;
    if (habitId) {
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
              const targetUrl = (data.url || '/habits') + `?auto_complete=${habitId}`;
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

    const mode = getSwNotificationActionMode(data);
    if (data.goalId || data.milestoneId || data.topicId || data.journeyId || data.reminderId) {
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(async (windowClients) => {
            let clientHandled = false;
            for (const client of windowClients) {
              client.postMessage({
                type: 'REMINDER_MARK_COMPLETE',
                data,
                today,
              });
              if (mode === 'ack_goal_day' && 'navigate' in client) {
                client.focus?.();
                client.navigate('/goals');
              } else if ('focus' in client) {
                client.focus();
              }
              clientHandled = true;
            }

            if (!clientHandled) {
              const baseUrl = mode === 'ack_goal_day' ? '/goals' : (data.url || '/');
              const qp = new URLSearchParams({
                action: 'complete_reminder',
                reminder_id: String(data.reminderId || ''),
                target_type: String(data.targetType || ''),
                goal_id: String(data.goalId || ''),
                milestone_id: String(data.milestoneId || ''),
                journey_id: String(data.journeyId || ''),
                topic_id: String(data.topicId || ''),
                has_milestones: data.hasMilestones ? '1' : '0',
                reminder_mode: String(data.reminderMode || 'scheduled'),
              });
              const targetUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${qp.toString()}`;
              if (clients.openWindow) return clients.openWindow(targetUrl);
            }
          })
      );
      return;
    }
  }

  // Open / focus the app (or prompt confirm card for Goals without milestones / Whole Learning Journeys)
  const actionMode = getSwNotificationActionMode(data);
  let targetUrl = data.url || '/habits';
  if (data.isAlarm && data.habitId) {
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + `alarm_habit_id=${data.habitId}`;
  } else if (actionMode === 'confirm_goal' || actionMode === 'confirm_journey') {
    const qp = new URLSearchParams({
      confirm_reminder: String(data.reminderId || ''),
      target_type: String(data.targetType || ''),
      goal_id: String(data.goalId || ''),
      journey_id: String(data.journeyId || ''),
    });
    targetUrl += (targetUrl.includes('?') ? '&' : '?') + qp.toString();
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if (actionMode === 'confirm_goal' || actionMode === 'confirm_journey') {
            client.postMessage({ type: 'OPEN_REMINDER_CONFIRM', data });
          }
          if ('focus' in client) {
            client.focus();
            if (!(actionMode === 'confirm_goal' || actionMode === 'confirm_journey')) {
              client.navigate(targetUrl);
            }
            return;
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});

// ── Message Handler ────────────────────────────────────────────────────────────
// App sends reminders to SW so it can show local notifications at the right time
// (used as fallback when server push is not yet set up)
const scheduledTimers = new Map();

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data?.type === 'SCHEDULE_LOCAL_REMINDERS') {
    const reminders = event.data.reminders || [];

    // Clear old timers
    scheduledTimers.forEach(id => clearTimeout(id));
    scheduledTimers.clear();

    const now = new Date();
    const todayYMD = swFormatLocalYMD(now);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = dayNames[now.getDay()];

    reminders.forEach(reminder => {
      if (reminder.notification_status !== 'Active') return;

      const targetType = reminder.target_type || 'habit';
      const isDeadlineMode = reminder.reminder_mode === 'deadline_proximity';

      // Skip already-completed non-habit targets
      if (targetType === 'goal') {
        if (reminder.milestone_id && reminder.goal_milestones?.completed === true) return;
        if (reminder.goals?.status === 'Completed') return;
      } else if (targetType === 'learning_topic' || (targetType === 'learning_journey' && reminder.topic_id)) {
        if (reminder.learning_topics?.status === 'Completed' || reminder.learning_journeys?.status === 'Completed') return;
      } else if (targetType === 'learning_journey') {
        if (reminder.learning_journeys?.status === 'Completed') return;
      }

      // 1. Check if eligible for today
      if (isDeadlineMode) {
        if (reminder.remind_on_date) {
          if (String(reminder.remind_on_date).trim() !== todayYMD) return;
        } else {
          const targetDateStr = reminder.target_date || reminder.goals?.target_date || reminder.learning_topics?.target_date || reminder.learning_journeys?.target_date;
          if (!targetDateStr) return;
          const days = Number(reminder.days_before_deadline) || 0;
          const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
          const checkYMD = swFormatLocalYMD(checkDate);
          if (targetDateStr !== checkYMD) return;
        }
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
        let targetUrl = '/';
        const milestoneTitle = reminder.goal_milestones?.title || reminder.milestone_title || '';
        const hasMilestones = Boolean(reminder.goal_has_milestones || reminder.milestone_id);

        if (targetType === 'habit') {
          const habitName = reminder.habit_name || 'Habit';
          title = `🔥 Habit: ${habitName}`;
          body = reminder.custom_text
            ? `${reminder.custom_text} • Habit: ${habitName}`
            : `Time to complete your habit "${habitName}"! Keep your streak going.`;
          targetUrl = '/habits';
        } else if (targetType === 'goal') {
          const goalName = reminder.goal_name || reminder.goals?.goal_name || 'Goal';
          if (reminder.milestone_id && milestoneTitle) {
            title = `🎯 Goal: "${goalName}" - Milestone: "${milestoneTitle}"`;
            body = reminder.custom_text || `Time to finish Milestone "${milestoneTitle}" for Goal "${goalName}".`;
          } else if (isDeadlineMode) {
            const days = Number(reminder.days_before_deadline) || 0;
            title = `🎯 Goal Deadline: ${goalName}`;
            body = reminder.custom_text || (reminder.remind_on_date
              ? `Goal deadline reminder for "${goalName}".`
              : days === 0
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
          const topicTitle = reminder.topic_title || reminder.learning_topics?.title || '';
          const journeyTitle = reminder.journey_title || reminder.learning_journeys?.title || 'Study Session';
          const itemTitle = topicTitle ? `${journeyTitle} - ${topicTitle}` : journeyTitle;
          title = `📚 Learning Hub: ${itemTitle}`;
          if (isDeadlineMode) {
            body = reminder.custom_text || `Target deadline reminder for "${topicTitle || journeyTitle}"!`;
          } else {
            body = reminder.custom_text
              ? `${reminder.custom_text} • ${itemTitle}`
              : `Time for your Learning Hub study session on "${topicTitle || journeyTitle}"!`;
          }
          targetUrl = reminder.journey_id ? `/learning/journey/${reminder.journey_id}` : '/learning';
        }

        const normTargetType = String(targetType || 'habit').toLowerCase();
        const isAlarm = Boolean(reminder.is_alarm || reminder.reminder_mode === 'alarm')
          && ['habit', 'goal', 'learning_journey', 'learning_topic'].includes(normTargetType);
        const entityIdForTag = reminder.habit_id || reminder.goal_id || reminder.topic_id || reminder.journey_id || reminder.id;
        if (isAlarm && normTargetType !== 'habit' && !String(title).startsWith('🚨 ALARM:')) {
          const alarmLabel = reminder.goal_name || reminder.goals?.goal_name || reminder.topic_title || reminder.learning_topics?.title || reminder.journey_title || reminder.learning_journeys?.title || title;
          title = `🚨 ALARM: ${alarmLabel}`;
        }
        const data = {
          url: isAlarm && reminder.habit_id ? `/habits?alarm_habit_id=${reminder.habit_id}` : targetUrl,
          targetType: normTargetType,
          habitId: reminder.habit_id || null,
          goalId: reminder.goal_id || null,
          milestoneId: reminder.milestone_id || null,
          journeyId: reminder.journey_id || null,
          topicId: reminder.topic_id || null,
          hasMilestones,
          reminderMode: reminder.reminder_mode || 'scheduled',
          milestoneTitle,
          itemName: reminder.goal_name || reminder.topic_title || reminder.journey_title || reminder.habit_name || '',
          reminderId: reminder.id,
          isAlarm,
        };

        const timerId = setTimeout(() => {
          self.registration.showNotification(title, {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: isAlarm ? `alarm-${normTargetType}-${entityIdForTag}` : `local-${reminder.id}-${idx}`,
            vibrate: isAlarm ? [300, 100, 300, 100, 300] : [200, 100, 200],
            requireInteraction: isAlarm,
            data,
            actions: buildSwNotificationActions(data, isAlarm),
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
      fetch('/api/dashboard').catch(() => {})
    );
  }
});

