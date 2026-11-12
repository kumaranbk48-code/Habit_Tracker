import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const isNative = Capacitor.isNativePlatform();
export const NativeAlarmScheduler = registerPlugin('NativeAlarmScheduler');

let initialized = false;

// Convert string ID to a deterministic 32-bit positive integer for Android LocalNotifications
export function hashStringToId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(hash) % 2000000000) + 1;
}

// Extract HH:mm from raw string or object
function cleanTimeStr(val) {
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

/**
 * Initialize Android notification channels with high priority, sound, and vibration.
 */
export async function initNativeNotifications() {
  if (!isNative || initialized) return;
  try {
    // Clean up legacy channel IDs to ensure new settings apply
    await LocalNotifications.deleteChannel({ id: 'habiz-alarms' }).catch(() => {});
    await LocalNotifications.deleteChannel({ id: 'habiz-reminders' }).catch(() => {});

    // Channel for high-priority urgent alarms (heads-up popdown banner + sound + vibration)
    await LocalNotifications.createChannel({
      id: 'habiz_alarm_channel',
      name: 'Habit & Goal Alarms',
      description: 'High-priority alarms with sound, vibration, and heads-up banner',
      importance: 5, // IMPORTANCE_HIGH (heads-up banner)
      visibility: 1, // VISIBILITY_PUBLIC (shows on lock screen)
      sound: 'alarm.wav',
      vibration: true,
      lights: true,
      lightColor: '#178274',
    });

    // Channel for standard daily reminders
    await LocalNotifications.createChannel({
      id: 'habiz_reminder_channel',
      name: 'Habit & Goal Reminders',
      description: 'Daily habit reminders and nudges',
      importance: 4, // IMPORTANCE_DEFAULT
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: '#178274',
    });

    // Register quick actions on notifications (Mark Done, Snooze, Dismiss)
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: 'HABIT_ALARM_ACTIONS',
          actions: [
            { id: 'complete', title: '✅ Mark Done' },
            { id: 'snooze', title: '⏰ Snooze 10m' },
            { id: 'dismiss', title: '❌ Dismiss', destructive: true },
          ],
        },
        {
          id: 'HABIT_REMINDER_ACTIONS',
          actions: [
            { id: 'complete', title: '✅ Mark Done' },
            { id: 'snooze', title: '⏰ Snooze 10m' },
            { id: 'dismiss', title: '❌ Dismiss', destructive: true },
          ],
        },
      ],
    });

    initialized = true;
  } catch (err) {
    console.warn('[NativeNotifications] Init channels error:', err);
  }
}

/**
 * Check native notification permission status ('granted' | 'denied' | 'default')
 */
export async function checkNativePermission() {
  if (!isNative) return 'default';
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === 'granted') return 'granted';
    if (status.display === 'denied') return 'denied';
    return 'default';
  } catch {
    return 'default';
  }
}

/**
 * Request runtime notification permissions from Android OS
 */
export async function requestNativePermission() {
  if (!isNative) return false;
  try {
    await initNativeNotifications();
    const status = await LocalNotifications.requestPermissions();
    const granted = status.display === 'granted';
    if (granted) {
      const exactOk = await checkExactAlarmPermission();
      if (!exactOk) {
        await requestExactAlarmPermission();
      }
    }
    return granted;
  } catch (err) {
    console.warn('[NativeNotifications] Request permissions error:', err);
    return false;
  }
}

/**
 * Check if exact alarms are allowed in Android system settings (Android 12+)
 */
export async function checkExactAlarmPermission() {
  if (!isNative) return true;
  try {
    const nativeRes = await NativeAlarmScheduler.canScheduleExactAlarms().catch(() => null);
    if (nativeRes?.exact_alarm) {
      return nativeRes.exact_alarm === 'granted';
    }
    const status = await LocalNotifications.checkExactNotificationSetting();
    return status?.exact_alarm === 'granted';
  } catch (err) {
    console.warn('[NativeNotifications] checkExactAlarmPermission error:', err);
    return true;
  }
}

/**
 * Check if full-screen intents are allowed on Android 14+ (API 34+)
 */
export async function checkFullScreenIntentPermission() {
  if (!isNative) return true;
  try {
    const res = await NativeAlarmScheduler.canUseFullScreenIntent().catch(() => null);
    if (res?.full_screen_intent) {
      return res.full_screen_intent === 'granted';
    }
    return true;
  } catch (err) {
    console.warn('[NativeNotifications] checkFullScreenIntentPermission error:', err);
    return true;
  }
}

/**
 * Direct user to the Android settings screen to configure exact alarms
 */
export async function requestExactAlarmPermission() {
  if (!isNative) return true;
  try {
    const status = await LocalNotifications.changeExactNotificationSetting();
    return status?.exact_alarm === 'granted';
  } catch (err) {
    console.warn('[NativeNotifications] changeExactNotificationSetting error:', err);
    return false;
  }
}

/**
 * Build notification schemas for a reminder over the upcoming week or on a deadline date.
 */
export function buildNotificationsForReminder(reminder, targetName = '', options = {}) {
  const isAlarmEvent = Boolean(
    reminder.is_alarm === true ||
    reminder.is_alarm === 'true' ||
    reminder.is_alarm === 1 ||
    reminder.is_alarm === 't' ||
    reminder.reminder_mode === 'alarm'
  );

  const type = reminder.target_type || 'habit';
  const isDeadlineMode = reminder.reminder_mode === 'deadline_proximity';

  // Parse alert times
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
  const timeList = Array.from(new Set(allTimes.map(cleanTimeStr).filter(Boolean)));
  if (timeList.length === 0) return [];

  // Parse allowed days of week
  let daysList = reminder.days_of_week;
  if (typeof daysList === 'string') {
    try {
      daysList = JSON.parse(daysList);
    } catch {
      daysList = daysList.replace(/[{}"']/g, '').split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  if (Array.isArray(daysList)) {
    daysList = daysList.map((d) => String(d).replace(/[{}"']/g, '').trim().toLowerCase()).filter(Boolean);
  }
  const isEveryday = !Array.isArray(daysList) || daysList.length === 0 || daysList.some((d) => d === 'everyday' || d === 'daily' || d === 'all');

  const itemName = targetName || (
    type === 'habit' ? (reminder.habits?.habit_name || reminder.habit_name || 'Daily Habit')
    : type === 'goal' ? (reminder.goals?.goal_name || reminder.goal_name || 'Goal')
    : (reminder.learning_topics?.title || reminder.learning_journeys?.title || reminder.topic_title || 'Study Session')
  );

  let title = '🔔 HabiZ Reminder';
  let body = reminder.custom_text || `Time for ${itemName}!`;

  if (type === 'habit') {
    title = isAlarmEvent ? `🚨 ALARM: ${itemName}` : `🔥 Habit: ${itemName}`;
    body = reminder.custom_text
      ? `${reminder.custom_text} • Habit: ${itemName}`
      : (isAlarmEvent ? `Urgent: Time to complete "${itemName}"! Protect your streak.` : `Time to complete "${itemName}"! Protect your streak now.`);
  } else if (type === 'goal') {
    title = isAlarmEvent ? `🚨 ALARM: ${itemName}` : `🎯 Goal: ${itemName}`;
    body = reminder.custom_text || `Time to log progress for Goal: "${itemName}"!`;
  } else if (type === 'learning_journey' || type === 'learning_topic') {
    title = isAlarmEvent ? `🚨 ALARM: ${itemName}` : `📚 Learning: ${itemName}`;
    body = reminder.custom_text || `Time for your study session on "${itemName}"!`;
  }

  const now = new Date();
  const notifications = [];
  const shortDayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const longDayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const reminderId = reminder.id || `rem_${reminder.habit_id || reminder.goal_id || Date.now()}`;

  if (isDeadlineMode) {
    // If goal or learning activity is already completed, do not schedule
    if (type === 'goal' && reminder.goal_id && options.completedGoalIds?.has(reminder.goal_id)) {
      return [];
    }
    if ((type === 'learning_journey' || type === 'learning_topic') && options.completedLearningIds?.has(reminder.journey_id || reminder.topic_id)) {
      return [];
    }

    const targetDateStr = reminder.target_date || reminder.goals?.target_date || reminder.learning_topics?.target_date || reminder.learning_journeys?.target_date;
    if (targetDateStr) {
      const daysBefore = Number(reminder.days_before_deadline) || 0;
      const targetParts = targetDateStr.split('-').map((n) => parseInt(n, 10));
      if (targetParts.length === 3) {
        const fireDate = new Date(targetParts[0], targetParts[1] - 1, targetParts[2] - daysBefore);
        for (const timeStr of timeList) {
          const [hh, mm] = timeStr.split(':').map((n) => parseInt(n, 10));
          const scheduleAt = new Date(fireDate.getFullYear(), fireDate.getMonth(), fireDate.getDate(), hh, mm, 0, 0);
          if (scheduleAt.getTime() > now.getTime()) {
            const uniqueKey = `${reminderId}_${scheduleAt.getTime()}`;
            notifications.push({
              id: hashStringToId(uniqueKey),
              title,
              body,
              schedule: {
                at: scheduleAt,
                allowWhileIdle: true,
              },
              channelId: isAlarmEvent ? 'habiz_alarm_channel' : 'habiz_reminder_channel',
              actionTypeId: isAlarmEvent ? 'HABIT_ALARM_ACTIONS' : 'HABIT_REMINDER_ACTIONS',
              sound: isAlarmEvent ? 'alarm.wav' : undefined,
              isExactNotification: true,
              isExactMandatory: false,
              foreground: true,
              isRecurring: false,
              extra: {
                reminderId,
                habitId: reminder.habit_id,
                goalId: reminder.goal_id,
                journeyId: reminder.journey_id,
                topicId: reminder.topic_id,
                isAlarm: isAlarmEvent,
                targetType: type,
                itemName,
                customText: reminder.custom_text || '',
              },
            });
          }
        }
      }
    }
  } else {
    // If goal or learning activity is already completed globally, do not schedule
    if (type === 'goal' && reminder.goal_id && options.completedGoalIds?.has(reminder.goal_id)) {
      return [];
    }
    if ((type === 'learning_journey' || type === 'learning_topic') && options.completedLearningIds?.has(reminder.journey_id || reminder.topic_id)) {
      return [];
    }

    // Schedule occurrences for the next 7 days
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
      const dayIdx = targetDate.getDay();
      const shortName = shortDayNames[dayIdx];
      const longName = longDayNames[dayIdx];

      if (!isEveryday && !daysList.some((d) => d === shortName || d === longName || d.startsWith(shortName))) {
        continue;
      }

      // Check Completion: If habit is already completed today (day 0), suppress today's alert occurrences!
      // (Tomorrow and future days continue normally!)
      if (dayOffset === 0 && type === 'habit' && reminder.habit_id && options.completedHabitIds?.has(reminder.habit_id)) {
        continue;
      }

      for (const timeStr of timeList) {
        const [hh, mm] = timeStr.split(':').map((n) => parseInt(n, 10));
        const scheduleAt = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hh, mm, 0, 0);

        if (scheduleAt.getTime() <= now.getTime()) {
          continue;
        }

        const uniqueKey = `${reminderId}_${scheduleAt.getFullYear()}_${scheduleAt.getMonth()}_${scheduleAt.getDate()}_${timeStr}`;
        notifications.push({
          id: hashStringToId(uniqueKey),
          title,
          body,
          schedule: {
            at: scheduleAt,
            allowWhileIdle: true,
          },
          channelId: isAlarmEvent ? 'habiz_alarm_channel' : 'habiz_reminder_channel',
          actionTypeId: isAlarmEvent ? 'HABIT_ALARM_ACTIONS' : 'HABIT_REMINDER_ACTIONS',
          sound: isAlarmEvent ? 'alarm.wav' : undefined,
          isExactNotification: true,
          isExactMandatory: false,
          foreground: true,
          isRecurring: true,
          timeStr,
          daysOfWeek: Array.isArray(daysList) ? daysList.join(',') : '',
          extra: {
            reminderId,
            habitId: reminder.habit_id,
            goalId: reminder.goal_id,
            journeyId: reminder.journey_id,
            topicId: reminder.topic_id,
            isAlarm: isAlarmEvent,
            targetType: type,
            itemName,
            customText: reminder.custom_text || '',
          },
        });
      }
    }
  }

  return notifications;
}

/**
 * Immediately cancel all pending notifications associated with a reminder.
 */
export async function cancelNativeReminder(reminderId) {
  if (!isNative || !reminderId) return;
  const remIdStr = String(reminderId);
  try {
    // 1. Cancel in NativeAlarmScheduler (dedicated setAlarmClock alarms)
    await NativeAlarmScheduler.cancel({ reminderId: remIdStr }).catch((err) => {
      console.warn('[NativeNotifications] NativeAlarmScheduler.cancel error:', err);
    });

    // 2. Cancel in LocalNotifications (passive reminders or legacy alarms)
    const pending = await LocalNotifications.getPending();
    if (pending?.notifications?.length) {
      const toCancel = pending.notifications.filter((n) => {
        const extra = n.extra || {};
        return (
          extra.reminderId === reminderId ||
          extra.habitId === reminderId ||
          extra.goalId === reminderId ||
          extra.journeyId === reminderId ||
          String(n.id) === remIdStr
        );
      });

      if (toCancel.length > 0) {
        await LocalNotifications.cancel({
          notifications: toCancel.map((n) => ({ id: n.id })),
        });
        console.log(`[NativeNotifications] Cancelled ${toCancel.length} pending LocalNotification(s) for reminder ${reminderId}`);
      }
    }
  } catch (err) {
    console.warn('[NativeNotifications] cancelNativeReminder error:', err);
  }
}

/**
 * Immediately schedule a single reminder directly with Android's system AlarmManager.
 * Called synchronously when the user taps "Save" or toggles an alarm.
 */
export async function scheduleSingleNativeReminder(reminder, targetName = '') {
  if (!isNative) return { success: false, reason: 'not_native' };
  try {
    await initNativeNotifications();

    const status = (reminder.notification_status || 'active').toLowerCase();
    const reminderId = reminder.id || reminder.habit_id;

    // 1. Cancel previous pending notifications for this reminder
    if (reminderId) {
      await cancelNativeReminder(reminderId);
    }

    // If deactivated, do not schedule
    if (status !== 'active') {
      return { success: true, count: 0, status: 'inactive' };
    }

    // 2. Build notifications
    const notifications = buildNotificationsForReminder(reminder, targetName);
    if (notifications.length === 0) {
      console.log('[NativeNotifications] No upcoming future occurrences to schedule for reminder', reminderId);
      return { success: true, count: 0 };
    }

    const isAlarmEvent = Boolean(
      reminder.is_alarm === true ||
      reminder.is_alarm === 'true' ||
      reminder.is_alarm === 1 ||
      reminder.is_alarm === 't' ||
      reminder.reminder_mode === 'alarm'
    );

    if (isAlarmEvent) {
      // 3a. User-facing Alarm: schedule with dedicated native AlarmManager.setAlarmClock()
      const alarms = notifications.map((n) => ({
        id: n.id,
        at: n.schedule.at.getTime(),
        title: n.title,
        body: n.body,
        reminderId: String(reminderId),
        habitId: String(reminder.habit_id || ''),
        targetType: reminder.target_type || 'habit',
      }));

      console.log(`[NativeNotifications] ⏰ Scheduling ${alarms.length} alarm(s) with NativeAlarmScheduler.setAlarmClock:`, alarms);
      const res = await NativeAlarmScheduler.schedule({ alarms });
      console.log(`[NativeNotifications] ⚡ Instantly scheduled ${res?.scheduledCount || alarms.length} native alarms for "${targetName}" with AlarmManager.setAlarmClock()`);
      return { success: true, count: res?.scheduledCount || alarms.length };
    } else {
      // 3b. Standard passive reminders go through LocalNotifications
      await LocalNotifications.schedule({ notifications });
      console.log(`[NativeNotifications] ⚡ Scheduled ${notifications.length} standard reminders for "${targetName}" with LocalNotifications.`);
      return { success: true, count: notifications.length };
    }
  } catch (err) {
    console.warn('[NativeNotifications] scheduleSingleNativeReminder error:', err);
    return { success: false, error: err?.message || String(err) };
  }
}

let lastSyncedFingerprint = null;
let isSyncingNative = false;
let queuedSyncCall = null;

/**
 * Full synchronization helper: schedules all active reminders for the upcoming week.
 * Features single-flight locking, schedule diffing, reason attribution, and completion awareness.
 */
export async function syncNativeReminders(
  reminders,
  completionData = {},
  force = false,
  reason = 'unknown'
) {
  if (!isNative || !Array.isArray(reminders)) return;

  const completedHabitIds = completionData instanceof Set
    ? completionData
    : (completionData?.completedHabitIds || new Set());
  const completedGoalIds = completionData?.completedGoalIds || new Set();
  const completedLearningIds = completionData?.completedLearningIds || new Set();
  const today = completionData?.today || new Date().toISOString().split('T')[0];

  if (isSyncingNative) {
    console.log(`[NativeSync] Native synchronization already in flight. Queuing follow-up sync (reason: '${reason}')`);
    queuedSyncCall = { reminders, completionData, force, reason };
    return;
  }

  isSyncingNative = true;
  try {
    await initNativeNotifications();

    // 1. Sync completions to native SharedPreferences for offline Check A & Check B
    await syncNativeCompletions(
      Array.from(completedHabitIds),
      Array.from(completedGoalIds),
      Array.from(completedLearningIds),
      today
    );

    const perm = await checkNativePermission();
    if (perm !== 'granted') {
      console.log(`[NativeSync] Notification permission not granted, skipping schedule (reason: '${reason}')`);
      return;
    }

    const nativeAlarms = [];
    const passiveNotifs = [];

    for (const reminder of reminders) {
      const status = (reminder.notification_status || 'active').toLowerCase();
      if (status !== 'active') continue;

      const isAlarmEvent = Boolean(
        reminder.is_alarm === true ||
        reminder.is_alarm === 'true' ||
        reminder.is_alarm === 1 ||
        reminder.is_alarm === 't' ||
        reminder.reminder_mode === 'alarm'
      );

      const notifs = buildNotificationsForReminder(reminder, '', {
        completedHabitIds,
        completedGoalIds,
        completedLearningIds,
      });
      if (isAlarmEvent) {
        for (const n of notifs) {
          nativeAlarms.push({
            id: n.id,
            at: n.schedule.at.getTime(),
            title: n.title,
            body: n.body,
            reminderId: String(reminder.id || reminder.habit_id || ''),
            habitId: String(reminder.habit_id || ''),
            targetType: reminder.target_type || 'habit',
            isSnooze: false,
            isRecurring: Boolean(n.isRecurring),
            timeStr: n.timeStr || n.extra?.timeStr || '',
            daysOfWeek: n.daysOfWeek || n.extra?.daysOfWeek || '',
          });
        }
      } else {
        passiveNotifs.push(...notifs);
      }
    }

    // Sort alarms chronologically by trigger time before applying the 50-alarm cap
    const getAlarmAt = (item) => {
      const raw = item?.at ?? item?.schedule?.at;
      if (raw instanceof Date) return raw.getTime();
      const num = Number(raw);
      return Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER;
    };
    nativeAlarms.sort((a, b) => getAlarmAt(a) - getAlarmAt(b));
    const boundedAlarms = nativeAlarms.slice(0, 50);
    const fingerprint = boundedAlarms.map((a) => `${a.id}:${a.at}`).sort().join('|');
    const hasChanged = force || fingerprint !== lastSyncedFingerprint;

    console.log(`[NativeSync] Diff check: changed=${hasChanged}, activeAlarms=${boundedAlarms.length}, reason='${reason}'`);

    if (hasChanged) {
      lastSyncedFingerprint = fingerprint;
      // Atomically replace recurring native alarms (schedules new alarms before cancelling stale ones)
      // Native scheduler preserves all active snooze alarms in a separate partition (G-06)
      await NativeAlarmScheduler.replaceAll({ alarms: boundedAlarms });
      console.log(`[NativeSync] Atomically synced ${boundedAlarms.length} high-priority recurring alarm(s) with AlarmManager.setAlarmClock() (reason: '${reason}').`);
    } else {
      console.log(`[NativeSync] Skipping schedule sync: all ${boundedAlarms.length} native alarms already match schedule (reason: '${reason}').`);
    }

    // Cancel and reschedule passive notifications with LocalNotifications only if schedule changed
    if (hasChanged) {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications?.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }

      if (passiveNotifs.length > 0) {
        const boundedList = passiveNotifs.slice(0, 100);
        await LocalNotifications.schedule({ notifications: boundedList });
        console.log(`[NativeSync] Synced ${boundedList.length} passive reminder(s) with LocalNotifications.`);
      }
    }
  } catch (err) {
    console.warn('[NativeSync] syncNativeReminders error:', err);
  } finally {
    isSyncingNative = false;
    if (queuedSyncCall) {
      const nextCall = queuedSyncCall;
      queuedSyncCall = null;
      console.log(`[NativeSync] Executing queued follow-up sync (reason: '${nextCall.reason}')`);
      syncNativeReminders(nextCall.reminders, nextCall.completionData, nextCall.force, nextCall.reason);
    }
  }
}

/**
 * Record completion of an entity directly to native storage.
 * Automatically cancels any active snooze alarms for this entity.
 */
export async function recordNativeCompletion(targetType, entityId, date, reminderId = '') {
  if (!isNative || !entityId) return;
  try {
    await NativeAlarmScheduler.recordCompletion({
      targetType: targetType || 'habit',
      entityId: String(entityId),
      reminderId: String(reminderId || ''),
      date: date || new Date().toISOString().split('T')[0],
    });
    console.log(`[NativeNotifications] Recorded native completion: type=${targetType || 'habit'}, entityId=${entityId}`);
  } catch (err) {
    console.warn('[NativeNotifications] recordNativeCompletion error:', err);
  }
}

/**
 * Record uncompletion (undo) of an entity in native storage.
 */
export async function recordNativeUncompletion(targetType, entityId, date) {
  if (!isNative || !entityId) return;
  try {
    await NativeAlarmScheduler.recordUncompletion({
      targetType: targetType || 'habit',
      entityId: String(entityId),
      date: date || new Date().toISOString().split('T')[0],
    });
    console.log(`[NativeNotifications] Recorded native uncompletion: type=${targetType || 'habit'}, entityId=${entityId}`);
  } catch (err) {
    console.warn('[NativeNotifications] recordNativeUncompletion error:', err);
  }
}

/**
 * Sync all completed entities (habits, goals, learning) to native storage for offline Check A support.
 */
export async function syncNativeCompletions(completedHabits = [], completedGoals = [], completedLearning = [], today = '') {
  if (!isNative) return;
  try {
    const todayDate = today || new Date().toISOString().split('T')[0];
    await NativeAlarmScheduler.syncCompletions({
      completedHabits: Array.isArray(completedHabits) ? completedHabits.map(String) : [],
      completedGoals: Array.isArray(completedGoals) ? completedGoals.map(String) : [],
      completedLearning: Array.isArray(completedLearning) ? completedLearning.map(String) : [],
      today: todayDate,
    });
  } catch (err) {
    console.warn('[NativeNotifications] syncNativeCompletions error:', err);
  }
}

/**
 * Immediately stop any active native alarm service / sound
 */
export async function stopNativeAlarm() {
  if (!isNative) return;
  try {
    await NativeAlarmScheduler.stopCurrentAlarm().catch(() => {});
  } catch (err) {
    console.warn('[NativeNotifications] stopNativeAlarm error:', err);
  }
}

/**
 * Get recently dismissed native alarms
 */
export async function getNativeDismissedAlarms() {
  if (!isNative) return [];
  try {
    const res = await NativeAlarmScheduler.getDismissedAlarms().catch(() => ({ dismissed: [] }));
    return res?.dismissed || [];
  } catch {
    return [];
  }
}

/**
 * Listen for notification clicks or action buttons (e.g. "Mark Done", "Snooze", "Dismiss")
 */
export function setupNativeNotificationListeners(onAction) {
  if (!isNative) return () => {};

  let actionListener = null;
  let dismissedListener = null;
  let snoozedListener = null;
  let completedListener = null;

  // Listen to native AlarmActionReceiver events (from native AlarmActivity or notification action buttons)
  NativeAlarmScheduler.addListener('alarmCompleted', (data) => {
    console.log('[NativeNotifications] ✅ Native alarm completed event:', data);
    window.dispatchEvent(new CustomEvent('habittracker-alarm-completed', { detail: data }));
    if (typeof onAction === 'function') {
      onAction({
        actionId: 'complete',
        notification: {
          extra: {
            habitId: data.habitId,
            reminderId: data.reminderId,
            targetType: data.targetType || 'habit'
          }
        }
      });
    }
  }).then((l) => { completedListener = l; }).catch(() => {});

  NativeAlarmScheduler.addListener('alarmDismissed', (data) => {
    console.log('[NativeNotifications] 🛑 Native alarm dismissed event:', data);
    window.dispatchEvent(new CustomEvent('habittracker-alarm-dismissed', { detail: data }));
  }).then((l) => { dismissedListener = l; }).catch(() => {});

  NativeAlarmScheduler.addListener('alarmSnoozed', (data) => {
    console.log('[NativeNotifications] ⏰ Native alarm snoozed event:', data);
    window.dispatchEvent(new CustomEvent('habittracker-alarm-snoozed', { detail: data }));
  }).then((l) => { snoozedListener = l; }).catch(() => {});

  LocalNotifications.addListener('localNotificationActionPerformed', async (notificationAction) => {
    console.log('[NativeNotifications] Action performed:', notificationAction);
    const actionId = notificationAction.actionId;
    const notification = notificationAction.notification;
    const extra = notification?.extra || {};

    if (actionId === 'dismiss') {
      console.log('[NativeNotifications] Notification dismissed by user');
      return;
    }

    if (actionId === 'snooze') {
      console.log('[NativeNotifications] Snooze requested (10 minutes)');
      const snoozeAt = new Date(Date.now() + 10 * 60 * 1000);
      const snoozeId = hashStringToId(`snooze_${Date.now()}`);
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: snoozeId,
              title: notification.title || '⏰ Snoozed Habit Alarm',
              body: notification.body || 'Time for your habit!',
              schedule: {
                at: snoozeAt,
                allowWhileIdle: true,
              },
              channelId: 'habiz_alarm_channel',
              actionTypeId: 'HABIT_ALARM_ACTIONS',
              sound: 'alarm.wav',
              isExactNotification: true,
              foreground: true,
              extra: {
                ...extra,
                isSnooze: true,
              },
            },
          ],
        });
        console.log(`[NativeNotifications] Snoozed alarm scheduled at ${snoozeAt.toLocaleTimeString()}`);
      } catch (snoozeErr) {
        console.warn('[NativeNotifications] Failed to schedule snooze:', snoozeErr);
      }
      return;
    }

    if (typeof onAction === 'function') {
      onAction(notificationAction);
    }
  }).then((listener) => {
    actionListener = listener;
  }).catch(() => {});

  return () => {
    if (actionListener && typeof actionListener.remove === 'function') {
      actionListener.remove();
    }
    if (dismissedListener && typeof dismissedListener.remove === 'function') {
      dismissedListener.remove();
    }
    if (snoozedListener && typeof snoozedListener.remove === 'function') {
      snoozedListener.remove();
    }
    if (completedListener && typeof completedListener.remove === 'function') {
      completedListener.remove();
    }
  };
}
