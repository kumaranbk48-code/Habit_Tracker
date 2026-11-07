import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  isNative,
  syncNativeReminders,
  setupNativeNotificationListeners,
  hashStringToId,
  recordNativeCompletion,
  recordNativeUncompletion,
} from '../lib/nativeNotifications';
import { LocalNotifications } from '@capacitor/local-notifications';

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
  const completedGoalsRef = useRef(new Set());
  const completedLearningRef = useRef(new Set());
  const repingEventsRef = useRef([]);
  const statsRef = useRef(null);
  const lastMinuteLoggedRef = useRef('');
  const isRefreshingRef = useRef(false);
  const pendingRefreshReasonRef = useRef(null);

  // Fetch and cache active reminders, today's completions, and reping statuses
  const refreshReminders = useCallback(async (reason = 'manual') => {
    if (!session?.access_token) return;

    if (isRefreshingRef.current) {
      console.log(`[ReminderScheduler] Refresh already in flight, queuing reason: '${reason}'`);
      pendingRefreshReasonRef.current = reason;
      return;
    }

    isRefreshingRef.current = true;
    console.log(`[ReminderScheduler] Starting refresh (reason: '${reason}')`);

    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    try {
      const [remRes, trackRes, repingRes, dashRes, goalsRes] = await Promise.all([
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
        fetch('/api/goals', {
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

          // Extract completed learning journeys and topics
          const completedLearning = new Set();
          for (const r of activeOnly) {
            if (r.learning_journeys?.status === 'Completed' && r.journey_id) {
              completedLearning.add(r.journey_id);
            }
            if (r.learning_topics?.status === 'Completed' && r.topic_id) {
              completedLearning.add(r.topic_id);
            }
          }
          completedLearningRef.current = completedLearning;

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

      if (goalsRes.ok) {
        const goalsData = await goalsRes.json().catch(() => []);
        if (Array.isArray(goalsData)) {
          completedGoalsRef.current = new Set(
            goalsData.filter((g) => g.status === 'Completed').map((g) => g.id)
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

      // Synchronize native Android AlarmManager schedules with reason and complete completion sets
      if (isNative && Array.isArray(remindersRef.current)) {
        await syncNativeReminders(
          remindersRef.current,
          {
            completedHabitIds: completedHabitsRef.current,
            completedGoalIds: completedGoalsRef.current,
            completedLearningIds: completedLearningRef.current,
            today,
          },
          false,
          reason
        );
      }
    } catch (err) {
      console.warn('[ReminderScheduler] Failed to refresh scheduler data:', err);
    } finally {
      isRefreshingRef.current = false;
      if (pendingRefreshReasonRef.current) {
        const nextReason = pendingRefreshReasonRef.current;
        pendingRefreshReasonRef.current = null;
        console.log(`[ReminderScheduler] Executing pending refresh (reason: '${nextReason}')`);
        refreshReminders(nextReason);
      }
    }
  }, [session]);

  // Listen to custom update events across the app
  useEffect(() => {
    refreshReminders('mount');

    let debounceTimer = null;
    const handleUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refreshReminders('event_update');
      }, 400);
    };

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
      handleUpdate();
    };

    const handleEntityCompleted = (e) => {
      const { targetType, entityId, date, reminderId } = e.detail || {};
      const type = (targetType || 'habit').toLowerCase();
      if (entityId) {
        if (type === 'habit') {
          completedHabitsRef.current.add(entityId);
        } else if (type === 'goal') {
          completedGoalsRef.current.add(entityId);
        } else if (type === 'learning_journey' || type === 'learning_topic' || type === 'learning') {
          completedLearningRef.current.add(entityId);
        }
        recordNativeCompletion(type, entityId, date, reminderId);
      }
      handleUpdate();
    };

    const handleEntityUncompleted = (e) => {
      const { targetType, entityId, date } = e.detail || {};
      const type = (targetType || 'habit').toLowerCase();
      if (entityId) {
        if (type === 'habit') {
          completedHabitsRef.current.delete(entityId);
        } else if (type === 'goal') {
          completedGoalsRef.current.delete(entityId);
        } else if (type === 'learning_journey' || type === 'learning_topic' || type === 'learning') {
          completedLearningRef.current.delete(entityId);
        }
        recordNativeUncompletion(type, entityId, date);
      }
      handleUpdate();
    };

    window.addEventListener('habittracker-reminders-updated', handleUpdate);
    window.addEventListener('habittracker-stats-updated', handleUpdate);
    window.addEventListener('habittracker-reping-scheduled', handleRepingScheduled);
    window.addEventListener('habittracker-entity-completed', handleEntityCompleted);
    window.addEventListener('habittracker-entity-uncompleted', handleEntityUncompleted);

    const handleNativeAlarmHandled = (e) => {
      const { reminderId, habitId } = e.detail || {};
      if (reminderId) firedRef.current.add(reminderId);
      if (habitId) firedRef.current.add(habitId);
      const currentTime = lastMinuteLoggedRef.current;
      if (currentTime) {
        if (reminderId) firedRef.current.add(`${reminderId}-${currentTime}`);
        if (habitId) firedRef.current.add(`${habitId}-${currentTime}`);
      }
    };
    window.addEventListener('habittracker-alarm-dismissed', handleNativeAlarmHandled);
    window.addEventListener('habittracker-alarm-snoozed', handleNativeAlarmHandled);
    window.addEventListener('habittracker-alarm-completed', handleNativeAlarmHandled);

    // Periodic refresh every 30 seconds only when tab/app is visible
    const syncInterval = setInterval(() => {
      if (typeof document !== 'undefined' && !document.hidden) {
        refreshReminders('periodic_interval');
      }
    }, 30000);

    // Refresh immediately when returning to foreground
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        refreshReminders('app_foregrounded');
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('habittracker-reminders-updated', handleUpdate);
      window.removeEventListener('habittracker-stats-updated', handleUpdate);
      window.removeEventListener('habittracker-reping-scheduled', handleRepingScheduled);
      window.removeEventListener('habittracker-entity-completed', handleEntityCompleted);
      window.removeEventListener('habittracker-entity-uncompleted', handleEntityUncompleted);
      window.removeEventListener('habittracker-alarm-dismissed', handleNativeAlarmHandled);
      window.removeEventListener('habittracker-alarm-snoozed', handleNativeAlarmHandled);
      window.removeEventListener('habittracker-alarm-completed', handleNativeAlarmHandled);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
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

  // Listen to native Android notification actions (Mark Done, Snooze, Tap)
  useEffect(() => {
    if (!isNative) return;

    const cleanup = setupNativeNotificationListeners(async (action) => {
      const extra = action.notification?.extra || {};
      const actionId = action.actionId;

      if (actionId === 'dismiss') {
        return;
      }

      if (actionId === 'complete' && extra.habitId && session?.access_token) {
        const today = new Date().toISOString().split('T')[0];
        try {
          await fetch('/api/tracking', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              habit_id: extra.habitId,
              completion_date: today,
              status: true,
            }),
          });
          window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
          refreshReminders();
        } catch (err) {
          console.warn('[NativeNotifications] Failed to mark complete:', err);
        }
      } else if (actionId === 'snooze') {
        // Already rescheduled by setupNativeNotificationListeners
        console.log('[NativeNotifications] Snooze handled');
      } else {
        // Tapped or opened from notification
        if (extra.isAlarm) {
          const matchedReminder = remindersRef.current?.find((r) => r.id === extra.reminderId);
          window.dispatchEvent(
            new CustomEvent('habittracker-alarm-fired', {
              detail: {
                reminder: matchedReminder || { id: extra.reminderId, habit_id: extra.habitId, is_alarm: true },
                habit: matchedReminder?.habits || { id: extra.habitId, habit_name: extra.itemName || 'Habit' },
                streak: statsRef.current?.currentStreak || 0,
              },
            })
          );
        }
      }
    });

    return cleanup;
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

        // Check A for in-app / ticker: Suppress alert if activity is already completed
        if (type === 'habit' && reminder.habit_id && completedHabitsRef.current.has(reminder.habit_id)) {
          console.log(`[ReminderScheduler] Skipping notification/alarm for already-completed habit "${reminder.habits?.habit_name || reminder.habit_id}"`);
          continue;
        }

        if (type === 'goal' && reminder.goal_id && completedGoalsRef.current.has(reminder.goal_id)) {
          console.log(`[ReminderScheduler] Skipping notification/alarm for already-completed goal "${reminder.goals?.goal_name || reminder.goal_id}"`);
          continue;
        }

        if ((type === 'learning_journey' || type === 'learning_topic') && completedLearningRef.current.has(reminder.journey_id || reminder.topic_id)) {
          console.log(`[ReminderScheduler] Skipping notification/alarm for already-completed learning activity`);
          continue;
        }

        console.log(`[ReminderScheduler] 🔔 Triggering reminder/alarm at ${currentTime}:`, {
          id: reminder.id,
          type,
          isAlarm: isAlarmEvent,
          name: reminder.habits?.habit_name || reminder.goals?.goal_name || reminder.custom_text || 'Reminder'
        });

        // 5. Fire Native System Notification (in web browsers; on native Android, LocalNotifications handles it)
        if (!isNative && 'Notification' in window && Notification.permission === 'granted') {
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
