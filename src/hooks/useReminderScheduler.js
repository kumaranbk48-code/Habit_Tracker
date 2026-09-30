import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

function getTimeValue(val) {
  if (!val) return '';
  const str = typeof val === 'string' ? val : (val.target?.value || val.value || '');
  if (typeof str === 'string' && str.includes(':')) {
    const [h, m] = str.split(':');
    const cleanH = String(parseInt(h, 10) || 0).padStart(2, '0');
    const cleanM = String(parseInt(m, 10) || 0).padStart(2, '0');
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

  // Fetch and cache active reminders
  const refreshReminders = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/reminders', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        const activeOnly = data.filter((r) => r.notification_status === 'Active');
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
    } catch (err) {
      console.warn('[ReminderScheduler] Failed to fetch reminders:', err);
    }
  }, [session]);

  // Listen to custom update events across the app
  useEffect(() => {
    refreshReminders();
    const handleUpdate = () => refreshReminders();
    window.addEventListener('habittracker-reminders-updated', handleUpdate);
    return () => window.removeEventListener('habittracker-reminders-updated', handleUpdate);
  }, [refreshReminders]);

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

      for (const reminder of remindersRef.current) {
        if (reminder.notification_status !== 'Active') continue;

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
          if (Array.isArray(reminder.days_of_week) && reminder.days_of_week.length > 0) {
            if (!reminder.days_of_week.includes(currentDay)) continue;
          }
        }

        // 2. Verify Time Match
        const alertsList = Array.isArray(reminder.alerts) && reminder.alerts.length > 0
          ? reminder.alerts.map(getTimeValue).filter(Boolean)
          : [getTimeValue(reminder.reminder_time)].filter(Boolean);

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
        let title = '🔔 HabitTracker Reminder';
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

        // 5. Fire Native System Notification
        if ('Notification' in window && Notification.permission === 'granted') {
          if (swRegRef.current && swRegRef.current.showNotification) {
            swRegRef.current.showNotification(title, {
              body,
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-192.png',
              tag: `reminder-${reminder.id}-${currentTime}`,
              vibrate: [200, 100, 200],
              data: { url },
            }).catch((err) => {
              console.warn('[ReminderScheduler] showNotification failed, falling back to Notification API:', err);
              try {
                new Notification(title, { body, icon: '/icons/icon-192.png' });
              } catch {}
            });
          } else {
            try {
              new Notification(title, { body, icon: '/icons/icon-192.png' });
            } catch {}
          }
        }

        // Dispatch in-app event
        window.dispatchEvent(new CustomEvent('habittracker-reminder-fired', {
          detail: { reminder, title, body, url }
        }));
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [session]);

  return { refreshReminders };
}
