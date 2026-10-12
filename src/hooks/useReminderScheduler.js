import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

function getTimeValue(val) {
  if (!val) return '';
  if (typeof val === 'object' && val !== null) {
    val = val.value || val.time || val.target?.value || '';
  }
  const clean = String(val).replace(/[{}"'\s]/g, '').trim();
  if (clean.includes(':')) {
    const parts = clean.split(':');
    const cleanH = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
    const cleanM = String(parseInt(parts[1], 10) || 0).padStart(2, '0');
    return `${cleanH}:${cleanM}`;
  }
  return '';
}

export function useReminderScheduler() {
  const { session } = useAuth();
  const remindersRef = useRef([]);
  const firedRef = useRef(new Set());
  const swRegRef = useRef(null);

  // Initialize service worker reference
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        swRegRef.current = reg;
      }).catch(() => {});
    }
  }, []);

  const completedHabitsRef = useRef(new Set());
  const repingEventsRef = useRef([]);
  const statsRef = useRef(null);
  const lastMinuteLoggedRef = useRef('');

  // Fetch and cache active reminders, today's completions, and reping statuses
  const refreshReminders = useCallback(async () => {
    if (!session?.access_token) return;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    try {
      const [remRes, trackRes, repingRes, dashRes] = await Promise.all([
        fetch('/api/reminders', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch(`/api/tracking?date=${today}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/reminders?action=reping_status', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
        fetch('/api/dashboard', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }),
      ]);

      if (remRes.ok) {
        const data = await remRes.json();
        if (Array.isArray(data)) {
          const activeOnly = data.filter((r) => {
            const s = (r.notification_status || 'active').toLowerCase();
            return s === 'active';
          });
          remindersRef.current = activeOnly;

          // Also post to SW as fallback
          if ('serviceWorker' in navigator && swRegRef.current) {
            const target = swRegRef.current.active || navigator.serviceWorker.controller;
            if (target) {
              target.postMessage({
                type: 'SCHEDULE_LOCAL_REMINDERS',
                reminders: activeOnly,
              });
            }
          }
        }
      }

      if (trackRes.ok) {
        const trackData = await trackRes.json();
        if (Array.isArray(trackData)) {
          completedHabitsRef.current = new Set(
            trackData.filter((t) => t.status === true).map((t) => t.habit_id)
          );
        }
      }

      if (repingRes.ok) {
        const repings = await repingRes.json();
        if (Array.isArray(repings)) {
          // Keep active repings for habits that haven't been completed yet
          repingEventsRef.current = repings.filter(
            (ev) => ev.next_reping_at && !completedHabitsRef.current.has(ev.habit_id)
          );
        }
      }

      if (dashRes.ok) {
        statsRef.current = await dashRes.json();
      }
    } catch (err) {
      console.warn('[ReminderScheduler] Failed to refresh scheduler data:', err);
    }
  }, [session]);

  // Listen to custom update events across the app
  useEffect(() => {
    refreshReminders();
    const handleUpdate = () => refreshReminders();
    const handleRepingScheduled = (e) => {
      const { habitId, reminderId, nextRepingAt, habitName } = e.detail || {};
      if (habitId && nextRepingAt) {
        repingEventsRef.current = [
          ...(repingEventsRef.current || []).filter((r) => r.habit_id !== habitId),
          {
            id: `local_${Date.now()}`,
            habit_id: habitId,
            reminder_id: reminderId,
            next_reping_at: nextRepingAt,
            reping_count: 1,
            habit_name: habitName,
          },
        ];
      }
      refreshReminders();
    };

    window.addEventListener('habittracker-reminders-updated', handleUpdate);
    window.addEventListener('habittracker-stats-updated', handleUpdate);
    window.addEventListener('habittracker-reping-scheduled', handleRepingScheduled);

    // Periodic refresh every 30 seconds to keep repings and sync in lockstep
    const syncInterval = setInterval(() => {
      refreshReminders();
    }, 30000);

    return () => {
      window.removeEventListener('habittracker-reminders-updated', handleUpdate);
      window.removeEventListener('habittracker-stats-updated', handleUpdate);
      window.removeEventListener('habittracker-reping-scheduled', handleRepingScheduled);
      clearInterval(syncInterval);
    };
  }, [refreshReminders]);

  // Listen to messages from Service Worker (e.g. notification action buttons)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSwMessage = async (event) => {
      if (event.data?.type === 'HABIT_MARK_COMPLETE' && event.data?.habitId && session?.access_token) {
        const today = event.data.today || new Date().toISOString().split('T')[0];
        try {
          await fetch('/api/tracking', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              habit_id: event.data.habitId,
              completion_date: today,
              status: true,
            }),
          });
          window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
        } catch (err) {
          console.warn('[ReminderScheduler] SW HABIT_MARK_COMPLETE error:', err);
        }
      }

      if (event.data?.type === 'HABIT_ALARM_SKIPPED' && event.data?.habitId && session?.access_token) {
        try {
          await fetch('/api/reminders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              action: 'skip',
              reminder_id: event.data.reminderId,
              habit_id: event.data.habitId,
            }),
          });
          refreshReminders();
        } catch (err) {
          console.warn('[ReminderScheduler] SW HABIT_ALARM_SKIPPED error:', err);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [session, refreshReminders]);

  // Main active interval ticker (checks every 5 seconds)
  useEffect(() => {
    if (!session) return;

    const intervalId = setInterval(() => {
      if (!remindersRef.current || remindersRef.current.length === 0) return;

      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${hh}:${mm}`;

      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const date = String(now.getDate()).padStart(2, '0');
      const todayYMD = `${year}-${month}-${date}`;

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const currentDay = dayNames[now.getDay()];

      if (lastMinuteLoggedRef.current !== currentTime) {
        lastMinuteLoggedRef.current = currentTime;
        console.log(`[ReminderScheduler] Checking ${remindersRef.current.length} active reminder(s) at ${currentTime} (${currentDay})`);
      }

      for (const reminder of remindersRef.current) {
        const status = (reminder.notification_status || 'active').toLowerCase();
        if (status !== 'active') continue;

        const isDeadlineMode = reminder.reminder_mode === 'deadline_proximity';

        // 1. Verify Date / Day Eligibility
        if (isDeadlineMode) {
          const targetDateStr = reminder.goals?.target_date || reminder.learning_topics?.target_date || reminder.learning_journeys?.target_date || reminder.target_date;
          if (!targetDateStr) continue;
          const days = Number(reminder.days_before_deadline) || 0;
          const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
          const checkYMD = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
          if (targetDateStr !== checkYMD) continue;
        } else {
          let daysList = reminder.days_of_week;
          if (typeof daysList === 'string') {
            try {
              daysList = JSON.parse(daysList);
            } catch {
              daysList = daysList.replace(/[{}"']/g, '').split(',').map((s) => s.trim()).filter(Boolean);
            }
          }
          if (Array.isArray(daysList)) {
            daysList = daysList.map((d) => String(d).replace(/[{}"']/g, '').trim()).filter(Boolean);
          }
          if (Array.isArray(daysList) && daysList.length > 0) {
            const dayIndex = now.getDay();
            const shortName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dayIndex];
            const longName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayIndex];
            const normalizedDays = daysList.map((d) => String(d).trim().toLowerCase());
            const isEveryday = normalizedDays.some((d) => d === 'everyday' || d === 'daily' || d === 'all');
            const matchesDay = isEveryday || normalizedDays.some((d) => d === shortName || d === longName || d.startsWith(shortName));
            if (!matchesDay) continue;
          }
        }

        // 2. Verify Time Match
        let rawAlerts = reminder.alerts;
        if (typeof rawAlerts === 'string') {
          try {
            rawAlerts = JSON.parse(rawAlerts);
          } catch {
            rawAlerts = rawAlerts.replace(/[{}"']/g, '').split(',').map((s) => s.trim()).filter(Boolean);
          }
        }
        const alertsArr = Array.isArray(rawAlerts) ? rawAlerts : (rawAlerts ? [rawAlerts] : []);
        const allTimes = [...alertsArr, reminder.reminder_time];
        const alertsList = Array.from(new Set(allTimes.map(getTimeValue).filter(Boolean)));

        const timeMatches = alertsList.some((t) => t === currentTime);
        if (!timeMatches) continue;

        // 3. Deduplication: Only fire once per minute per reminder
        const triggerKey = `${reminder.id}_${todayYMD}_${currentTime}`;
        if (firedRef.current.has(triggerKey)) continue;
        firedRef.current.add(triggerKey);

        // Keep firedRef bounded
        if (firedRef.current.size > 200) {
          const arr = Array.from(firedRef.current);
          firedRef.current = new Set(arr.slice(arr.length - 100));
        }

        // 4. Build Detailed Notification Title & Body displaying Category & Item Name
        const type = reminder.target_type || 'habit';
        let title = '🔔 HabiZ Reminder';
        let body = reminder.custom_text || 'You have an active reminder.';
        let url = '/dashboard';

        if (type === 'habit') {
          const habitName = reminder.habits?.habit_name || reminder.habit_name || 'Daily Habit';
          title = `🔥 Habit: ${habitName}`;
          body = reminder.custom_text
            ? `${reminder.custom_text} • Habit: ${habitName}`
            : `Time to complete your habit "${habitName}"! Keep your streak going.`;
          url = '/habits';
        } else if (type === 'goal') {
          const goalName = reminder.goals?.goal_name || reminder.goal_name || 'Goal';
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
          url = '/goals';
        } else if (type === 'learning_journey' || type === 'learning_topic') {
          const topicName = reminder.learning_topics?.title || reminder.learning_journeys?.title || reminder.topic_title || reminder.journey_title || 'Study Session';
          if (isDeadlineMode) {
            title = `📚 Learning Hub: ${topicName}`;
            body = reminder.custom_text || `Target deadline approaching for Learning Roadmap: "${topicName}"!`;
          } else {
            title = `📚 Learning Hub: ${topicName}`;
            body = reminder.custom_text
              ? `${reminder.custom_text} • Topic: ${topicName}`
              : `Time for your Learning Hub study session on "${topicName}"!`;
          }
          url = '/learning';
        }

        const isAlarmEvent = Boolean(
          reminder.is_alarm === true ||
          reminder.is_alarm === 'true' ||
          reminder.is_alarm === 1 ||
          reminder.is_alarm === 't' ||
          reminder.reminder_mode === 'alarm'
        );
        const isHabitEvent = (type || '').toLowerCase() === 'habit' || Boolean(reminder.habit_id);

        // If this is a habit reminder and the habit was already completed today:
        // Passive reminders can be skipped to avoid spam, but EXPLICIT ALARMS must always ring!
        if (type === 'habit' && reminder.habit_id && completedHabitsRef.current.has(reminder.habit_id)) {
          if (!isAlarmEvent) {
            console.log(`[ReminderScheduler] Skipping passive notification for already-completed habit "${reminder.habits?.habit_name || reminder.habit_id}"`);
            continue;
          }
        }

        console.log(`[ReminderScheduler] 🔔 Triggering reminder/alarm at ${currentTime}:`, {
          id: reminder.id,
          type,
          isAlarm: isAlarmEvent,
          name: reminder.habits?.habit_name || reminder.goals?.goal_name || reminder.custom_text || 'Reminder'
        });

        // 5. Fire Native System Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          const isAlarm = isAlarmEvent;
          const notificationOptions = {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: isAlarm ? `alarm-habit-${reminder.habit_id || reminder.id}` : `reminder-${reminder.id}-${currentTime}`,
            renotify: true,
            requireInteraction: isAlarm,
            vibrate: isAlarm ? [300, 100, 300, 100, 300] : [200, 100, 200],
            data: {
              url,
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
          };

          if (swRegRef.current && swRegRef.current.showNotification) {
            swRegRef.current.showNotification(title, notificationOptions).catch((err) => {
              console.warn('[ReminderScheduler] showNotification failed, falling back:', err);
              try {
                new Notification(title, { body, icon: '/icons/icon-192.png' });
              } catch {}
            });
          } else {
            try {
              new Notification(title, notificationOptions);
            } catch {}
          }
        }

        // 6. Dispatch in-app events
        window.dispatchEvent(new CustomEvent('habittracker-reminder-fired', {
          detail: { reminder, title, body, url }
        }));

        if (isAlarmEvent && isHabitEvent) {
          window.dispatchEvent(new CustomEvent('habittracker-alarm-fired', {
            detail: {
              reminder: { ...reminder, is_alarm: true },
              habit: reminder.habits || { id: reminder.habit_id, habit_name: reminder.habit_name || 'Habit' },
              streak: statsRef.current?.currentStreak || 0
            }
          }));
        }
      }

      // Check Re-ping events that are due
      const repings = repingEventsRef.current || [];
      for (const ev of repings) {
        if (!ev.next_reping_at) continue;
        if (completedHabitsRef.current.has(ev.habit_id)) continue;

        const dueAt = new Date(ev.next_reping_at).getTime();
        if (dueAt <= now.getTime()) {
          const repingKey = `reping_${ev.id}_${ev.reping_count}`;
          if (firedRef.current.has(repingKey)) continue;
          firedRef.current.add(repingKey);

          // Find associated reminder
          const matchedReminder = remindersRef.current?.find((r) => r.habit_id === ev.habit_id);
          const habitData = matchedReminder?.habits || {
            id: ev.habit_id,
            habit_name: ev.habit_name || matchedReminder?.habit_name || 'Habit',
            color: '#3d7a75',
            tracking_type: 'boolean',
            target_quantity: 1,
            unit: '',
          };
          const habitName = habitData.habit_name || 'Habit';
          const urgentTitle = `🚨 Re-ping (${ev.reping_count || 1}/3): ${habitName}`;
          const urgentBody = (ev.reping_count || 1) >= 3
            ? `Final call today for "${habitName}"! Protect your streak now.`
            : `Reminder re-ping for "${habitName}". Keep your momentum.`;

          // Fire in-app alarm takeover
          window.dispatchEvent(new CustomEvent('habittracker-alarm-fired', {
            detail: {
              reminder: matchedReminder || { id: ev.reminder_id || `reping_${ev.habit_id}`, habit_id: ev.habit_id, is_alarm: true },
              habit: habitData,
              streak: statsRef.current?.currentStreak || 0
            }
          }));

          // Fire sticky push notification
          if ('Notification' in window && Notification.permission === 'granted') {
            const opts = {
              body: urgentBody,
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              tag: `alarm-habit-${ev.habit_id}`,
              renotify: true,
              requireInteraction: true,
              vibrate: [300, 100, 300, 100, 300],
              data: {
                url: '/habits',
                habitId: ev.habit_id,
                reminderId: ev.reminder_id,
                isAlarm: true,
              },
              actions: [
                { action: 'complete', title: '✅ Done' },
                { action: 'skip',     title: '⏭️ Skip' },
              ],
            };
            if (swRegRef.current?.showNotification) {
              swRegRef.current.showNotification(urgentTitle, opts).catch(() => {});
            }
          }
        }
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [session]);

  return { refreshReminders };
}
