import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { enqueueOfflineAction, getCachedData, saveCachedData } from './offlineDb.js';
import { getOnlineStatus } from './networkStatus.js';
import {
  buildReminderDisplayCopy,
  getDeadlineFireDateYMD,
  getReminderActionMode,
  isReminderTargetCompleted,
  parseLocalYMD,
} from './goalReminderUtils.js';
import { executeReminderDone } from './goalReminderActions.js';

export const isNative = Capacitor.isNativePlatform();
export const NativeAlarmScheduler = registerPlugin('NativeAlarmScheduler');

let initialized = false;
let pendingActionsInFlight = null;

const HANDLED_NATIVE_KEY = 'habiz_handled_native_actions';
const RECENT_SNOOZES_KEY = 'habiz_native_snoozes';
const FIRED_ALARM_KEYS_STORAGE = 'habiz_fired_alarm_keys';
const SNOOZE_COOLDOWN_MS = 10 * 60 * 1000;

const handledHabitDatesMemory = new Set();
const recentSnoozesMemory = new Map();
const firedAlarmKeysMemory = new Set();

function safeGetStorage() {
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function formatLocalYmd(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatLocalHm(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function recordNativeHandledAction(action = {}, storage = safeGetStorage()) {
  const type = String(action.type || '').toLowerCase();
  const habitId = action.habitId ? String(action.habitId) : '';
  const reminderId = action.reminderId ? String(action.reminderId) : '';
  const date = action.date || formatLocalYmd();
  const occurrenceMinute = action.occurrenceMinute || formatLocalHm();
  const ts = Number(action.timestamp) || Date.now();

  if (habitId && date && type === 'complete') {
    const key = `${habitId}:${date}`;
    handledHabitDatesMemory.add(key);
    if (storage) {
      try {
        const raw = JSON.parse(storage.getItem(HANDLED_NATIVE_KEY) || '[]');
        const list = Array.isArray(raw) ? raw.filter((e) => e && e.date === date && e.key !== key) : [];
        list.push({ key, date, ts });
        storage.setItem(HANDLED_NATIVE_KEY, JSON.stringify(list.slice(-100)));
      } catch {}
    }
  }

  if (habitId && type === 'snooze') {
    recentSnoozesMemory.set(habitId, ts);
    if (storage) {
      try {
        const raw = JSON.parse(storage.getItem(RECENT_SNOOZES_KEY) || '{}');
        const map = raw && typeof raw === 'object' ? raw : {};
        const cleaned = {};
        for (const [k, v] of Object.entries(map)) {
          if (ts - Number(v) < SNOOZE_COOLDOWN_MS) cleaned[k] = Number(v);
        }
        cleaned[habitId] = ts;
        storage.setItem(RECENT_SNOOZES_KEY, JSON.stringify(cleaned));
      } catch {}
    }
  }

  if (reminderId && date && occurrenceMinute) {
    markFiredAlarmKey(`${reminderId}_${date}_${occurrenceMinute}`, storage);
  }
}

export function clearNativeHandledHabitDate(habitId, date = formatLocalYmd(), storage = safeGetStorage()) {
  if (!habitId || !date) return;
  const key = `${habitId}:${date}`;
  handledHabitDatesMemory.delete(key);
  if (storage) {
    try {
      const raw = JSON.parse(storage.getItem(HANDLED_NATIVE_KEY) || '[]');
      if (Array.isArray(raw)) {
        const filtered = raw.filter((e) => e && e.key !== key);
        storage.setItem(HANDLED_NATIVE_KEY, JSON.stringify(filtered));
      }
    } catch {}
  }
}

export function markFiredAlarmKey(triggerKey, storage = safeGetStorage()) {
  if (!triggerKey) return;
  firedAlarmKeysMemory.add(triggerKey);
  if (firedAlarmKeysMemory.size > 200) {
    const arr = Array.from(firedAlarmKeysMemory);
    firedAlarmKeysMemory.clear();
    for (const item of arr.slice(-100)) firedAlarmKeysMemory.add(item);
  }
  if (storage) {
    try {
      const raw = JSON.parse(storage.getItem(FIRED_ALARM_KEYS_STORAGE) || '[]');
      const list = Array.isArray(raw) ? raw.filter((k) => k !== triggerKey) : [];
      list.push(triggerKey);
      storage.setItem(FIRED_ALARM_KEYS_STORAGE, JSON.stringify(list.slice(-200)));
    } catch {}
  }
}

export function getHandledNativeState(nowMs = Date.now(), storage = safeGetStorage()) {
  const handledHabitDates = new Set(handledHabitDatesMemory);
  const recentSnoozes = new Map(recentSnoozesMemory);
  const firedKeys = new Set(firedAlarmKeysMemory);

  if (storage) {
    const today = formatLocalYmd(new Date(nowMs));
    try {
      const rawHandled = JSON.parse(storage.getItem(HANDLED_NATIVE_KEY) || '[]');
      if (Array.isArray(rawHandled)) {
        for (const item of rawHandled) {
          if (item?.key && item?.date === today) {
            handledHabitDates.add(item.key);
          }
        }
      }
    } catch {}
    try {
      const rawSnoozes = JSON.parse(storage.getItem(RECENT_SNOOZES_KEY) || '{}');
      if (rawSnoozes && typeof rawSnoozes === 'object') {
        for (const [hId, ts] of Object.entries(rawSnoozes)) {
          const t = Number(ts);
          if (Number.isFinite(t) && (nowMs - t) >= 0 && (nowMs - t) < SNOOZE_COOLDOWN_MS) {
            if (!recentSnoozes.has(hId) || t > recentSnoozes.get(hId)) {
              recentSnoozes.set(hId, t);
            }
          }
        }
      }
    } catch {}
    try {
      const rawFired = JSON.parse(storage.getItem(FIRED_ALARM_KEYS_STORAGE) || '[]');
      if (Array.isArray(rawFired)) {
        for (const k of rawFired) {
          if (typeof k === 'string') firedKeys.add(k);
        }
      }
    } catch {}
  }

  for (const [hId, ts] of Array.from(recentSnoozes.entries())) {
    if ((nowMs - ts) < 0 || (nowMs - ts) >= SNOOZE_COOLDOWN_MS) {
      recentSnoozes.delete(hId);
    }
  }

  return { handledHabitDates, recentSnoozes, firedKeys };
}

/**
 * Pure predicate deciding whether the in-app reminder/alarm ticker should suppress firing.
 */
export function shouldSkipInAppAlarmFire(reminder, params = {}) {
  if (!reminder) return { skip: true, reason: 'missing_reminder' };
  const {
    todayYMD = formatLocalYmd(),
    currentTime = formatLocalHm(),
    nowMs = Date.now(),
    completedHabits = new Set(),
    completedGoals = new Set(),
    completedMilestones = new Set(),
    completedLearning = new Set(),
    handledHabitDates = new Set(),
    ackedReminderDates = new Set(),
    recentSnoozes = new Map(),
    firedKeys = new Set(),
  } = params;

  const triggerKey = `${reminder.id}_${todayYMD}_${currentTime}`;
  if (firedKeys?.has(triggerKey)) {
    return { skip: true, reason: 'already_fired_or_handled_minute' };
  }
  if (reminder.id && ackedReminderDates?.has(`${reminder.id}:${todayYMD}`)) {
    return { skip: true, reason: 'acked_today' };
  }

  const type = (reminder.target_type || 'habit').toLowerCase();
  if (type === 'habit' && reminder.habit_id) {
    const habitId = String(reminder.habit_id);
    if (completedHabits?.has(habitId)) {
      return { skip: true, reason: 'completed_habit' };
    }
    if (handledHabitDates?.has(`${habitId}:${todayYMD}`)) {
      return { skip: true, reason: 'pending_or_handled_native_action' };
    }
    const snoozedAt = recentSnoozes instanceof Map ? recentSnoozes.get(habitId) : recentSnoozes?.[habitId];
    if (typeof snoozedAt === 'number' && (nowMs - snoozedAt) >= 0 && (nowMs - snoozedAt) < SNOOZE_COOLDOWN_MS) {
      return { skip: true, reason: 'recent_native_snooze' };
    }
  } else if (type === 'goal') {
    if (reminder.milestone_id && (completedMilestones?.has(reminder.milestone_id) || reminder.goal_milestones?.completed === true)) {
      return { skip: true, reason: 'completed_milestone' };
    }
    if (reminder.goal_id && (completedGoals?.has(reminder.goal_id) || reminder.goals?.status === 'Completed')) {
      return { skip: true, reason: 'completed_goal' };
    }
  } else if (type === 'learning_topic' || (type === 'learning_journey' && reminder.topic_id)) {
    if (
      (reminder.topic_id && (completedLearning?.has(reminder.topic_id) || reminder.learning_topics?.status === 'Completed')) ||
      (reminder.journey_id && (completedLearning?.has(reminder.journey_id) || reminder.learning_journeys?.status === 'Completed'))
    ) {
      return { skip: true, reason: 'completed_learning' };
    }
  } else if (type === 'learning_journey' || type === 'learning') {
    if (reminder.journey_id && (completedLearning?.has(reminder.journey_id) || reminder.learning_journeys?.status === 'Completed')) {
      return { skip: true, reason: 'completed_learning' };
    }
  }

  return { skip: false };
}

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
        {
          id: 'GOAL_OPEN_REMINDER_ACTIONS',
          actions: [
            { id: 'open', title: 'Open' },
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
 * Direct user to the Android 14+ settings screen to allow full-screen alarm intents
 */
export async function requestFullScreenIntentPermission() {
  if (!isNative) return true;
  try {
    await NativeAlarmScheduler.openFullScreenIntentSettings();
    return await checkFullScreenIntentPermission();
  } catch (err) {
    console.warn('[NativeNotifications] openFullScreenIntentSettings error:', err);
    return false;
  }
}

/**
 * Build notification schemas for a reminder over the upcoming week or on a deadline date.
 */
export function buildNotificationsForReminder(reminder, targetName = '', options = {}) {
  const type = reminder.target_type || 'habit';
  const rawIsAlarm = Boolean(
    reminder.is_alarm === true ||
    reminder.is_alarm === 'true' ||
    reminder.is_alarm === 1 ||
    reminder.is_alarm === 't' ||
    reminder.reminder_mode === 'alarm'
  );
  // Keep alarm takeover strictly for habits; goal & learning reminders use normal notifications
  const isAlarmEvent = type === 'habit' && rawIsAlarm;
  const isDeadlineMode = reminder.reminder_mode === 'deadline_proximity';

  // Skip completed goals, milestones, learning topics, or learning journeys
  if (isReminderTargetCompleted(reminder, options)) {
    return [];
  }

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

  let itemName = targetName;
  let title = '🔔 HabiZ Reminder';
  let body = reminder.custom_text || 'Time for your reminder!';
  let milestoneTitle = '';

  if (type === 'habit') {
    itemName = targetName || reminder.habits?.habit_name || reminder.habit_name || 'Daily Habit';
    title = isAlarmEvent ? `🚨 ALARM: ${itemName}` : `🔥 Habit: ${itemName}`;
    body = reminder.custom_text
      ? `${reminder.custom_text} • Habit: ${itemName}`
      : (isAlarmEvent ? `Urgent: Time to complete "${itemName}"! Protect your streak.` : `Time to complete "${itemName}"! Protect your streak now.`);
  } else {
    const copy = buildReminderDisplayCopy(reminder, targetName);
    itemName = copy.itemName;
    title = copy.title;
    body = copy.body;
    milestoneTitle = copy.milestoneTitle || '';
  }

  const hasMilestones = Boolean(
    reminder.goal_has_milestones ||
    reminder.hasMilestones ||
    reminder.milestone_id ||
    (reminder.goal_id && options.goalMilestonesMap?.get?.(reminder.goal_id)?.length > 0)
  );
  const actionMode = getReminderActionMode(reminder, hasMilestones);
  const actionTypeId = isAlarmEvent
    ? 'HABIT_ALARM_ACTIONS'
    : (actionMode === 'confirm_goal' || actionMode === 'confirm_journey')
    ? 'GOAL_OPEN_REMINDER_ACTIONS'
    : 'HABIT_REMINDER_ACTIONS';

  const now = options.now instanceof Date ? options.now : new Date();
  const notifications = [];
  const shortDayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const longDayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const reminderId = reminder.id || `rem_${reminder.habit_id || reminder.goal_id || Date.now()}`;

  const sharedExtra = {
    reminderId,
    habitId: reminder.habit_id || null,
    goalId: reminder.goal_id || null,
    milestoneId: reminder.milestone_id || null,
    journeyId: reminder.journey_id || null,
    topicId: reminder.topic_id || null,
    hasMilestones,
    milestoneTitle,
    reminderMode: reminder.reminder_mode || 'scheduled',
    isAlarm: isAlarmEvent,
    targetType: type,
    itemName,
    customText: reminder.custom_text || '',
  };

  if (isDeadlineMode) {
    const fireYMD = getDeadlineFireDateYMD(reminder);
    const fireDate = fireYMD ? parseLocalYMD(fireYMD) : null;
    if (fireDate) {
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
            actionTypeId,
            sound: isAlarmEvent ? 'alarm.wav' : undefined,
            isExactNotification: true,
            isExactMandatory: false,
            foreground: true,
            isRecurring: false,
            extra: sharedExtra,
          });
        }
      }
    }
  } else {
    // Schedule occurrences for the next 8 days (0..7) so single-weekday reminders
    // whose time already passed today still schedule for next week's same day.
    for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
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
          actionTypeId,
          sound: isAlarmEvent ? 'alarm.wav' : undefined,
          isExactNotification: true,
          isExactMandatory: false,
          foreground: true,
          isRecurring: true,
          timeStr,
          daysOfWeek: Array.isArray(daysList) ? daysList.join(',') : '',
          extra: sharedExtra,
        });
      }
    }
  }

  return notifications;
}

/**
 * Compute the earliest upcoming fire Date for a reminder using the exact same
 * rules as buildNotificationsForReminder (days, times, deadline, completion suppression).
 * Returns a Date or null if no upcoming time is found within the scheduling window.
 */
export function getNextFireTime(reminder, now = new Date(), options = {}) {
  if (!reminder) return null;
  const notifications = buildNotificationsForReminder(reminder, '', { ...options, now });
  if (!notifications || notifications.length === 0) return null;
  let earliest = null;
  for (const n of notifications) {
    const at = n?.schedule?.at ? new Date(n.schedule.at) : null;
    if (at && !Number.isNaN(at.getTime())) {
      if (!earliest || at.getTime() < earliest.getTime()) {
        earliest = at;
      }
    }
  }
  return earliest;
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

    const rawIsAlarm = Boolean(
      reminder.is_alarm === true ||
      reminder.is_alarm === 'true' ||
      reminder.is_alarm === 1 ||
      reminder.is_alarm === 't' ||
      reminder.reminder_mode === 'alarm'
    );
    const isAlarmEvent = (reminder.target_type || 'habit') === 'habit' && rawIsAlarm;

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
      const fsiAllowed = await checkFullScreenIntentPermission();
      return {
        success: true,
        count: res?.scheduledCount || alarms.length,
        ...(fsiAllowed ? {} : { fullScreenIntentDenied: true }),
      };
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
  const completedMilestoneIds = completionData?.completedMilestoneIds || new Set();
  const completedLearningIds = completionData?.completedLearningIds || new Set();
  const goalMilestonesMap = completionData?.goalMilestonesMap || null;
  const today = completionData?.today || formatLocalYmd();

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

      const rawIsAlarm = Boolean(
        reminder.is_alarm === true ||
        reminder.is_alarm === 'true' ||
        reminder.is_alarm === 1 ||
        reminder.is_alarm === 't' ||
        reminder.reminder_mode === 'alarm'
      );
      const isAlarmEvent = (reminder.target_type || 'habit') === 'habit' && rawIsAlarm;

      const notifs = buildNotificationsForReminder(reminder, '', {
        completedHabitIds,
        completedGoalIds,
        completedMilestoneIds,
        completedLearningIds,
        goalMilestonesMap,
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
  const resolvedDate = date || formatLocalYmd();
  if ((targetType || 'habit').toLowerCase() === 'habit') {
    clearNativeHandledHabitDate(String(entityId), resolvedDate);
  }
  try {
    await NativeAlarmScheduler.recordUncompletion({
      targetType: targetType || 'habit',
      entityId: String(entityId),
      date: resolvedDate,
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

async function updateOfflineTrackingCaches(userId, habitId, date, quantityCompleted) {
  const applyEntry = (arr) => {
    const list = Array.isArray(arr) ? arr : [];
    const idx = list.findIndex((t) => t.habit_id === habitId && (!t.completion_date || t.completion_date === date));
    const entry = {
      habit_id: habitId,
      completion_date: date,
      status: true,
      ...(quantityCompleted !== undefined ? { quantity_completed: quantityCompleted } : {}),
    };
    if (idx !== -1) {
      const updated = [...list];
      updated[idx] = { ...updated[idx], ...entry };
      return updated;
    }
    return [...list, entry];
  };

  try {
    const cachedByDate = await getCachedData(userId, 'tracking', date);
    if (cachedByDate !== null) {
      await saveCachedData(userId, 'tracking', applyEntry(cachedByDate), date);
    }
    const cachedDefault = await getCachedData(userId, 'tracking');
    if (cachedDefault !== null) {
      await saveCachedData(userId, 'tracking', applyEntry(cachedDefault));
    }
  } catch (err) {
    console.warn('[NativeNotifications] Failed updating offline tracking cache:', err);
  }
}

async function runProcessPendingAlarmActions(session, options = {}) {
  const userId = session?.user?.id;
  const accessToken = session?.access_token;
  if (!userId) {
    return { processed: 0, completedHabitIds: [], snoozedActions: [], ackedIds: [] };
  }

  const scheduler = options.scheduler || NativeAlarmScheduler;
  const fetchFn = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const enqueueFn = options.enqueueAction || enqueueOfflineAction;
  const getOnlineFn = options.getOnlineStatusImpl || getOnlineStatus;
  const storage = options.storage !== undefined ? options.storage : safeGetStorage();

  let actions = [];
  try {
    const res = await scheduler.getPendingAlarmActions();
    actions = Array.isArray(res?.actions) ? res.actions : [];
  } catch (err) {
    console.warn('[NativeNotifications] getPendingAlarmActions failed:', err);
    return { processed: 0, completedHabitIds: [], snoozedActions: [], ackedIds: [] };
  }

  if (actions.length === 0) {
    return { processed: 0, completedHabitIds: [], snoozedActions: [], ackedIds: [] };
  }

  // Immediately record all pending native actions so in-app ticker suppresses duplicate popups
  for (const act of actions) {
    recordNativeHandledAction(act, storage);
  }

  let habitsList = Array.isArray(options.habits) ? options.habits : null;
  if (!habitsList && !options.skipCacheLookup) {
    try {
      const cached = await getCachedData(userId, 'habits');
      if (Array.isArray(cached)) habitsList = cached;
    } catch {}
  }

  const ackIds = [];
  const ackTimestamps = [];
  const completedItems = [];
  const snoozedActions = [];

  for (const act of actions) {
    const type = String(act.type || '').toLowerCase();
    const targetType = String(act.targetType || 'habit').toLowerCase();

    if (type === 'snooze') {
      snoozedActions.push(act);
      if (act.id) ackIds.push(act.id);
      if (act.timestamp) ackTimestamps.push(act.timestamp);
      continue;
    }

    if (type === 'complete' && targetType === 'habit' && act.habitId) {
      const habitId = String(act.habitId);
      const date = act.date || formatLocalYmd();
      const habitMeta = habitsList?.find((h) => String(h.id) === habitId);
      const isQuantity = habitMeta?.tracking_type === 'quantity';
      const targetQty = Number(habitMeta?.target_quantity) || 1;

      const serverBody = {
        habit_id: habitId,
        completion_date: date,
        status: true,
        action: 'complete',
        ...(isQuantity ? { amount: targetQty } : {}),
      };

      const offlineBody = {
        habit_id: habitId,
        completion_date: date,
        status: true,
        action: 'complete',
        ...(isQuantity ? { amount: targetQty, quantity_completed: targetQty } : {}),
      };

      let sentOrQueued = false;
      let shouldFallbackOffline = !getOnlineFn() || !accessToken || !fetchFn;

      if (!shouldFallbackOffline) {
        try {
          const resp = await fetchFn('/api/tracking', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(serverBody),
          });

          if (resp.ok) {
            sentOrQueued = true;
          } else {
            const errJson = await resp.json().catch(() => ({}));
            const errMsg = String(errJson?.error || '');
            if (resp.status === 409 || /already completed/i.test(errMsg)) {
              sentOrQueued = true;
            } else if (resp.status >= 500 || resp.status === 429 || resp.status === 408 || resp.status === 401) {
              shouldFallbackOffline = true;
            }
          }
        } catch {
          shouldFallbackOffline = true;
        }
      }

      if (!sentOrQueued && shouldFallbackOffline) {
        try {
          const queuedId = await enqueueFn(userId, 'TRACK_HABIT', offlineBody);
          if (queuedId) {
            sentOrQueued = true;
          }
        } catch (qErr) {
          console.warn('[NativeNotifications] Offline enqueue failed:', qErr);
        }
      }

      if (sentOrQueued) {
        if (!options.skipCacheUpdate) {
          await updateOfflineTrackingCaches(userId, habitId, date, isQuantity ? targetQty : undefined);
        }
        completedItems.push({ habitId, date });
        if (act.id) ackIds.push(act.id);
        if (act.timestamp) ackTimestamps.push(act.timestamp);
      }
    } else if (type === 'complete' && (targetType === 'goal' || targetType === 'learning_topic' || targetType === 'learning_journey')) {
      const doneResult = await executeReminderDone({
        reminder: {
          id: act.reminderId || null,
          target_type: targetType,
          goal_id: act.goalId || null,
          milestone_id: act.milestoneId || null,
          journey_id: act.journeyId || null,
          topic_id: act.topicId || null,
          hasMilestones: Boolean(act.hasMilestones),
          reminder_mode: act.reminderMode || 'scheduled',
        },
        session,
        isNativePlatform: true,
        isOnline: Boolean(getOnlineFn()),
        hasMilestones: Boolean(act.hasMilestones),
        fetchImpl: fetchFn,
        enqueueAction: enqueueFn,
        storage,
        todayYMD: act.date || formatLocalYmd(),
      });
      if (doneResult?.ok) {
        if (act.id) ackIds.push(act.id);
        if (act.timestamp) ackTimestamps.push(act.timestamp);
      }
    }
  }

  if (ackIds.length > 0 || ackTimestamps.length > 0) {
    await scheduler.ackPendingAlarmActions({ ids: ackIds, timestamps: ackTimestamps });

    if (typeof window !== 'undefined' && completedItems.length > 0) {
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated', { detail: { source: 'native-alarm-complete' } }));
      for (const item of completedItems) {
        window.dispatchEvent(
          new CustomEvent('habittracker-entity-completed', {
            detail: { targetType: 'habit', entityId: item.habitId, date: item.date },
          })
        );
      }
    }
  }

  return {
    processed: ackIds.length,
    completedHabitIds: completedItems.map((c) => c.habitId),
    snoozedActions,
    ackedIds: ackIds,
  };
}

/**
 * Process durable pending native alarm actions (Mark Done / Snooze) with single-flight locking.
 * APK-only (returns empty no-op on web browsers).
 */
export async function processPendingAlarmActions(session, options = {}) {
  const nativeActive = options.isNativeOverride !== undefined ? options.isNativeOverride : isNative;
  if (!nativeActive) {
    return { processed: 0, completedHabitIds: [], snoozedActions: [], ackedIds: [] };
  }
  if (pendingActionsInFlight) {
    return pendingActionsInFlight;
  }
  pendingActionsInFlight = runProcessPendingAlarmActions(session, options).finally(() => {
    pendingActionsInFlight = null;
  });
  return pendingActionsInFlight;
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
    recordNativeHandledAction({
      type: 'complete',
      habitId: data.habitId,
      reminderId: data.reminderId,
      date: formatLocalYmd(),
      occurrenceMinute: formatLocalHm(),
      timestamp: data.timestamp || Date.now(),
    });
    window.dispatchEvent(new CustomEvent('habittracker-alarm-completed', { detail: data }));
    if (typeof onAction === 'function') {
      onAction({
        actionId: 'complete',
        notification: {
          extra: {
            habitId: data.habitId,
            reminderId: data.reminderId,
            targetType: data.targetType || 'habit',
            fromNativeAlarmEvent: true,
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
    recordNativeHandledAction({
      type: 'snooze',
      habitId: data.habitId,
      reminderId: data.reminderId,
      date: formatLocalYmd(),
      occurrenceMinute: formatLocalHm(),
      timestamp: data.timestamp || Date.now(),
    });
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
