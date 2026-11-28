import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  isNative,
  syncNativeReminders,
  setupNativeNotificationListeners,
  recordNativeCompletion,
  recordNativeUncompletion,
  processPendingAlarmActions,
  recordNativeHandledAction,
  getHandledNativeState,
  markFiredAlarmKey,
  shouldSkipInAppAlarmFire,
} from '../lib/nativeNotifications';
import {
  buildReminderDisplayCopy,
  formatLocalYMD,
  getDeadlineFireDateYMD,
  getReminderActionMode,
  isReminderTargetCompleted,
} from '../lib/goalReminderUtils';
import {
  executeReminderDone,
  getAckedReminderDates,
  hasShownCatchUpToday,
  isReminderAckedForDate,
  markCatchUpShownToday,
} from '../lib/goalReminderActions';
import { getOnlineStatus } from '../lib/networkStatus';
import { getCachedData } from '../lib/offlineDb';

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

function getReminderAlertsList(reminder) {
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
  return Array.from(new Set(allTimes.map(getTimeValue).filter(Boolean)));
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
  const completedMilestonesRef = useRef(new Set());
  const completedLearningRef = useRef(new Set());
  const goalMilestonesMapRef = useRef(new Map());
  const repingEventsRef = useRef([]);
  const statsRef = useRef(null);
  const lastMinuteLoggedRef = useRef('');
  const isRefreshingRef = useRef(false);
  const pendingRefreshReasonRef = useRef(null);

  const runDeadlineCatchUps = useCallback((activeReminders, now = new Date()) => {
    if (!Array.isArray(activeReminders) || activeReminders.length === 0) return;
    const todayYMD = formatLocalYMD(now);
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const nativeState = getHandledNativeState(now.getTime());

    for (const rem of activeReminders) {
      if ((rem.notification_status || 'Active').toLowerCase() !== 'active') continue;
      if (rem.reminder_mode !== 'deadline_proximity') continue;
      const type = (rem.target_type || 'habit').toLowerCase();
      if (type === 'habit') continue;

      if (
        isReminderTargetCompleted(rem, {
          completedGoalIds: completedGoalsRef.current,
          completedMilestoneIds: completedMilestonesRef.current,
          completedLearningIds: completedLearningRef.current,
        })
      ) {
        continue;
      }

      const fireYMD = getDeadlineFireDateYMD(rem);
      if (fireYMD !== todayYMD) continue;

      if (isReminderAckedForDate(rem.id, todayYMD)) continue;
      if (hasShownCatchUpToday(rem.id, todayYMD)) continue;

      const alertsList = getReminderAlertsList(rem);
      const passedTime = alertsList.find((t) => t < currentTime);
      const dueNow = alertsList.includes(currentTime);
      // Only trigger catch-up for alerts that already passed earlier today (not already fired while open)
      if (!passedTime || dueNow) continue;

      const alreadyFiredEarlier = alertsList.some((t) => {
        const k = `${rem.id}_${todayYMD}_${t}`;
        return firedRef.current.has(k) || nativeState.firedKeys.has(k);
      });
      if (alreadyFiredEarlier) continue;

      markCatchUpShownToday(rem.id, todayYMD);

      const copy = buildReminderDisplayCopy(rem);
      const hasMilestones = Boolean(
        rem.goal_has_milestones ||
        rem.milestone_id ||
        (rem.goal_id && goalMilestonesMapRef.current.get(rem.goal_id)?.length > 0)
      );

      window.dispatchEvent(
        new CustomEvent('habittracker-reminder-fired', {
          detail: {
            reminder: rem,
            title: copy.title,
            body: copy.body,
            url: copy.url,
            hasMilestones,
            isCatchUp: true,
          },
        })
      );
    }
  }, []);

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
    const today = formatLocalYMD(d);

    try {
      // Process durable native alarm actions FIRST and wait before server fetch / syncNativeCompletions
      let pendingCompletedIds = [];
      if (isNative) {
        const pendingRes = await processPendingAlarmActions(session).catch(() => null);
        if (pendingRes?.completedHabitIds?.length) {
          pendingCompletedIds = pendingRes.completedHabitIds;
          for (const hId of pendingCompletedIds) {
            completedHabitsRef.current.add(hId);
          }
        }
      }

      const [remRes, trackRes, repingRes, dashRes, goalsRes, milestonesRes] = await Promise.all([
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
        fetch('/api/milestones', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => null),
      ]);

      let activeRemindersList = remindersRef.current || [];

      if (remRes.ok) {
        const data = await remRes.json();
        if (Array.isArray(data)) {
          const activeOnly = data.filter((r) => {
            const s = (r.notification_status || 'active').toLowerCase();
            return s === 'active';
          });
          remindersRef.current = activeOnly;
          activeRemindersList = activeOnly;

          const completedLearning = new Set();
          const completedMsFromReminders = new Set();
          for (const r of activeOnly) {
            if (r.learning_journeys?.status === 'Completed' && r.journey_id) {
              completedLearning.add(r.journey_id);
            }
            if (r.learning_topics?.status === 'Completed' && r.topic_id) {
              completedLearning.add(r.topic_id);
            }
            if (r.goal_milestones?.completed === true && r.milestone_id) {
              completedMsFromReminders.add(r.milestone_id);
            }
          }
          completedLearningRef.current = completedLearning;
          for (const msId of completedMsFromReminders) {
            completedMilestonesRef.current.add(msId);
          }

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
          const serverDone = new Set(
            trackData.filter((t) => t.status === true).map((t) => t.habit_id)
          );
          for (const hId of pendingCompletedIds) {
            serverDone.add(hId);
          }
          completedHabitsRef.current = serverDone;
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

      if (milestonesRes && milestonesRes.ok) {
        const milestonesData = await milestonesRes.json().catch(() => []);
        if (Array.isArray(milestonesData)) {
          const completedMs = new Set();
          const byGoal = new Map();
          for (const m of milestonesData) {
            if (m.completed === true && m.id) completedMs.add(m.id);
            if (m.goal_id) {
              const list = byGoal.get(m.goal_id) || [];
              list.push(m);
              byGoal.set(m.goal_id, list);
            }
          }
          completedMilestonesRef.current = completedMs;
          goalMilestonesMapRef.current = byGoal;
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

      // Synchronize native Android AlarmManager & LocalNotifications schedules
      if (isNative && Array.isArray(activeRemindersList)) {
        await syncNativeReminders(
          activeRemindersList,
          {
            completedHabitIds: completedHabitsRef.current,
            completedGoalIds: completedGoalsRef.current,
            completedMilestoneIds: completedMilestonesRef.current,
            completedLearningIds: completedLearningRef.current,
            goalMilestonesMap: goalMilestonesMapRef.current,
            today,
          },
          false,
          reason
        );
      }

      // Missed-day catch-up safety for deadline / remind-on-date reminders scheduled for earlier today
      runDeadlineCatchUps(activeRemindersList, new Date());
    } catch (err) {
      console.warn('[ReminderScheduler] Failed to refresh scheduler data:', err);
      // When offline, populate completions from local cached IndexedDB
      if (session?.user?.id) {
        try {
          const [cachedTrack, cachedMilestones, cachedGoals] = await Promise.all([
            getCachedData(session.user.id, 'tracking', today),
            getCachedData(session.user.id, 'milestones'),
            getCachedData(session.user.id, 'goals'),
          ]);
          if (Array.isArray(cachedTrack)) {
            for (const row of cachedTrack) {
              if (row?.status === true && row?.habit_id) {
                completedHabitsRef.current.add(row.habit_id);
              }
            }
          }
          if (Array.isArray(cachedMilestones)) {
            const byGoal = new Map();
            for (const m of cachedMilestones) {
              if (m?.completed && m?.id) completedMilestonesRef.current.add(m.id);
              if (m?.goal_id) {
                const arr = byGoal.get(m.goal_id) || [];
                arr.push(m);
                byGoal.set(m.goal_id, arr);
              }
            }
            goalMilestonesMapRef.current = byGoal;
          }
          if (Array.isArray(cachedGoals)) {
            for (const g of cachedGoals) {
              if (g?.status === 'Completed' && g?.id) completedGoalsRef.current.add(g.id);
            }
          }
        } catch {}
      }
    } finally {
      isRefreshingRef.current = false;
      if (pendingRefreshReasonRef.current) {
        const nextReason = pendingRefreshReasonRef.current;
        pendingRefreshReasonRef.current = null;
        console.log(`[ReminderScheduler] Executing pending refresh (reason: '${nextReason}')`);
        refreshReminders(nextReason);
      }
    }
  }, [session, runDeadlineCatchUps]);

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
          completedMilestonesRef.current.add(entityId);
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
          completedMilestonesRef.current.delete(entityId);
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
      const { reminderId, habitId, timestamp } = e.detail || {};
      const nowD = new Date();
      const todayYmd = formatLocalYMD(nowD);
      const currentTime = lastMinuteLoggedRef.current || `${String(nowD.getHours()).padStart(2, '0')}:${String(nowD.getMinutes()).padStart(2, '0')}`;
      const type = e.type === 'habittracker-alarm-snoozed' ? 'snooze' : 'complete';

      if (type === 'complete' && habitId) {
        completedHabitsRef.current.add(habitId);
      }
      recordNativeHandledAction({
        type,
        habitId,
        reminderId,
        date: todayYmd,
        occurrenceMinute: currentTime,
        timestamp: timestamp || Date.now(),
      });

      if (reminderId) firedRef.current.add(reminderId);
      if (habitId) firedRef.current.add(habitId);
      if (currentTime && reminderId) {
        firedRef.current.add(`${reminderId}_${todayYmd}_${currentTime}`);
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

    // Refresh immediately when returning to foreground (visibilitychange + Capacitor WebView resume)
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        refreshReminders('app_foregrounded');
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('resume', handleVisibilityChange);
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
        document.removeEventListener('resume', handleVisibilityChange);
      }
      clearInterval(syncInterval);
    };
  }, [refreshReminders]);

  const handleNonHabitCompleteAction = useCallback(async (rawData) => {
    if (!session?.access_token && !isNative) return;
    const matchedReminder = remindersRef.current?.find((r) => r.id === rawData?.reminderId) || null;
    const reminderObj = matchedReminder || {
      id: rawData?.reminderId || null,
      target_type: rawData?.targetType || 'goal',
      goal_id: rawData?.goalId || null,
      milestone_id: rawData?.milestoneId || null,
      journey_id: rawData?.journeyId || null,
      topic_id: rawData?.topicId || null,
      reminder_mode: rawData?.reminderMode || 'scheduled',
      hasMilestones: Boolean(rawData?.hasMilestones),
    };
    const hasMs = Boolean(
      rawData?.hasMilestones ||
      reminderObj.goal_has_milestones ||
      reminderObj.milestone_id ||
      (reminderObj.goal_id && goalMilestonesMapRef.current.get(reminderObj.goal_id)?.length > 0)
    );

    const result = await executeReminderDone({
      reminder: reminderObj,
      session,
      isNativePlatform: isNative,
      isOnline: getOnlineStatus(),
      hasMilestones: hasMs,
    });

    if (result?.ok) {
      if (result.toast) {
        window.dispatchEvent(
          new CustomEvent('habittracker-reminder-toast', {
            detail: { toast: result.toast, undoData: result.undoData || null },
          })
        );
      }
      if (result.navigateTo) {
        window.dispatchEvent(new CustomEvent('habittracker-navigate', { detail: { path: result.navigateTo } }));
      }
      refreshReminders('reminder_done');
    } else if (result?.error) {
      window.dispatchEvent(
        new CustomEvent('habittracker-reminder-toast', {
          detail: { toast: { message: result.error, type: 'error' } },
        })
      );
    }
  }, [session, refreshReminders]);

  // Listen to messages from Service Worker (e.g. notification action buttons)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleSwMessage = async (event) => {
      if (event.data?.type === 'HABIT_MARK_COMPLETE' && event.data?.habitId && session?.access_token) {
        const today = event.data.today || formatLocalYMD();
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
        return;
      }

      if (event.data?.type === 'REMINDER_MARK_COMPLETE' && event.data?.data) {
        await handleNonHabitCompleteAction(event.data.data);
        return;
      }

      if (event.data?.type === 'OPEN_REMINDER_CONFIRM' && event.data?.data) {
        const data = event.data.data;
        const matchedReminder = remindersRef.current?.find((r) => r.id === data.reminderId) || {
          id: data.reminderId,
          target_type: data.targetType || 'goal',
          goal_id: data.goalId || null,
          milestone_id: data.milestoneId || null,
          journey_id: data.journeyId || null,
          topic_id: data.topicId || null,
          goal_name: data.itemName || '',
          journey_title: data.itemName || '',
          reminder_mode: data.reminderMode || 'scheduled',
        };
        window.dispatchEvent(
          new CustomEvent('habittracker-goal-confirm-open', {
            detail: { reminder: matchedReminder },
          })
        );
        return;
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
  }, [session, refreshReminders, handleNonHabitCompleteAction]);

  // Listen to native Android notification actions (Mark Done, Open, Snooze, Tap)
  useEffect(() => {
    if (!isNative) return;

    const cleanup = setupNativeNotificationListeners(async (action) => {
      const extra = action.notification?.extra || {};
      const actionId = action.actionId;

      if (actionId === 'dismiss') {
        return;
      }

      if (actionId === 'complete' && extra.habitId && session?.access_token) {
        if (extra.fromNativeAlarmEvent) {
          await processPendingAlarmActions(session);
          refreshReminders('alarm_completed');
          return;
        }
        const today = formatLocalYMD();
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
              action: 'complete',
            }),
          });
          window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
          refreshReminders();
        } catch (err) {
          console.warn('[NativeNotifications] Failed to mark complete:', err);
        }
        return;
      }

      if (actionId === 'complete' && (extra.goalId || extra.milestoneId || extra.topicId || extra.journeyId || (extra.targetType && extra.targetType !== 'habit'))) {
        if (extra.fromNativeAlarmEvent) {
          await processPendingAlarmActions(session);
          refreshReminders('native_reminder_completed');
          return;
        }
        await handleNonHabitCompleteAction(extra);
        return;
      }

      if (actionId === 'snooze') {
        console.log('[NativeNotifications] Snooze handled');
        return;
      }

      // Tapped or clicked 'open'
      const tappedTargetType = String(extra.targetType || 'habit').toLowerCase();
      if (extra.isAlarm && (extra.habitId || tappedTargetType !== 'habit')) {
        const matchedReminder = remindersRef.current?.find((r) => r.id === extra.reminderId);
        const entityId = extra.habitId || extra.goalId || extra.topicId || extra.journeyId || extra.reminderId || '';
        window.dispatchEvent(
          new CustomEvent('habittracker-alarm-fired', {
            detail: {
              reminder: matchedReminder || {
                id: extra.reminderId,
                target_type: tappedTargetType,
                habit_id: extra.habitId || null,
                goal_id: extra.goalId || null,
                milestone_id: extra.milestoneId || null,
                journey_id: extra.journeyId || null,
                topic_id: extra.topicId || null,
                is_alarm: true,
              },
              habit: tappedTargetType === 'habit'
                ? (matchedReminder?.habits || { id: extra.habitId, habit_name: extra.itemName || 'Habit' })
                : null,
              streak: statsRef.current?.currentStreak || 0,
              targetType: tappedTargetType,
              entityId,
              hasMilestones: Boolean(extra.hasMilestones || matchedReminder?.milestone_id),
            },
          })
        );
      } else if (extra.targetType && extra.targetType !== 'habit') {
        const matchedReminder = remindersRef.current?.find((r) => r.id === extra.reminderId);
        const remObj = matchedReminder || {
          id: extra.reminderId,
          target_type: extra.targetType,
          goal_id: extra.goalId || null,
          milestone_id: extra.milestoneId || null,
          journey_id: extra.journeyId || null,
          topic_id: extra.topicId || null,
          goal_name: extra.itemName || '',
          journey_title: extra.itemName || '',
          hasMilestones: Boolean(extra.hasMilestones),
          reminder_mode: extra.reminderMode || 'scheduled',
        };
        const hasMs = Boolean(
          extra.hasMilestones ||
          remObj.goal_has_milestones ||
          remObj.milestone_id ||
          (remObj.goal_id && goalMilestonesMapRef.current.get(remObj.goal_id)?.length > 0)
        );
        const mode = getReminderActionMode(remObj, hasMs);
        if (mode === 'confirm_goal' || mode === 'confirm_journey') {
          window.dispatchEvent(new CustomEvent('habittracker-goal-confirm-open', { detail: { reminder: remObj } }));
        } else if (mode === 'ack_goal_day') {
          window.dispatchEvent(new CustomEvent('habittracker-navigate', { detail: { path: '/goals' } }));
        } else {
          window.dispatchEvent(
            new CustomEvent('habittracker-goal-confirm-open', { detail: { reminder: remObj } })
          );
        }
      }
    });

    return cleanup;
  }, [session, refreshReminders, handleNonHabitCompleteAction]);

  // Main active interval ticker (checks every 5 seconds)
  useEffect(() => {
    if (!session) return;

    const intervalId = setInterval(() => {
      if (!remindersRef.current || remindersRef.current.length === 0) return;

      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const currentTime = `${hh}:${mm}`;

      const todayYMD = formatLocalYMD(now);
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const currentDay = dayNames[now.getDay()];

      if (lastMinuteLoggedRef.current !== currentTime) {
        lastMinuteLoggedRef.current = currentTime;
        console.log(`[ReminderScheduler] Checking ${remindersRef.current.length} active reminder(s) at ${currentTime} (${currentDay})`);
      }

      const nativeState = getHandledNativeState(now.getTime());
      const combinedFiredKeys = new Set([...firedRef.current, ...nativeState.firedKeys]);
      const ackedReminderDates = getAckedReminderDates(todayYMD);

      for (const reminder of remindersRef.current) {
        const status = (reminder.notification_status || 'active').toLowerCase();
        if (status !== 'active') continue;

        const isDeadlineMode = reminder.reminder_mode === 'deadline_proximity';

        // 1. Verify Date / Day Eligibility
        if (isDeadlineMode) {
          const fireYMD = getDeadlineFireDateYMD(reminder);
          if (!fireYMD || fireYMD !== todayYMD) continue;
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
        const alertsList = getReminderAlertsList(reminder);
        const timeMatches = alertsList.some((t) => t === currentTime);
        if (!timeMatches) continue;

        // 3. Deduplication & Check A / native-handled / daily-ack skip
        const triggerKey = `${reminder.id}_${todayYMD}_${currentTime}`;
        const skipCheck = shouldSkipInAppAlarmFire(reminder, {
          todayYMD,
          currentTime,
          nowMs: now.getTime(),
          completedHabits: completedHabitsRef.current,
          completedGoals: completedGoalsRef.current,
          completedMilestones: completedMilestonesRef.current,
          completedLearning: completedLearningRef.current,
          handledHabitDates: nativeState.handledHabitDates,
          ackedReminderDates,
          recentSnoozes: nativeState.recentSnoozes,
          firedKeys: combinedFiredKeys,
        });
        if (skipCheck.skip) {
          if (skipCheck.reason !== 'already_fired_or_handled_minute') {
            console.log(`[ReminderScheduler] Skipping reminder "${reminder.habits?.habit_name || reminder.id}" (${skipCheck.reason})`);
          }
          continue;
        }
        firedRef.current.add(triggerKey);
        markFiredAlarmKey(triggerKey);

        // Keep firedRef bounded
        if (firedRef.current.size > 200) {
          const arr = Array.from(firedRef.current);
          firedRef.current = new Set(arr.slice(arr.length - 100));
        }

        // 4. Build Detailed Notification Title & Body displaying Category, Milestone/Topic & Item Name
        const type = reminder.target_type || 'habit';
        let title = '🔔 HabiZ Reminder';
        let body = reminder.custom_text || 'You have an active reminder.';
        let url = '/';

        if (type === 'habit') {
          const habitName = reminder.habits?.habit_name || reminder.habit_name || 'Daily Habit';
          title = `🔥 Habit: ${habitName}`;
          body = reminder.custom_text
            ? `${reminder.custom_text} • Habit: ${habitName}`
            : `Time to complete your habit "${habitName}"! Keep your streak going.`;
          url = '/habits';
        } else {
          const copy = buildReminderDisplayCopy(reminder);
          title = copy.title;
          body = copy.body;
          url = copy.url;
        }

        const rawIsAlarmEvent = Boolean(
          reminder.is_alarm === true ||
          reminder.is_alarm === 'true' ||
          reminder.is_alarm === 1 ||
          reminder.is_alarm === 't' ||
          reminder.reminder_mode === 'alarm'
        );
        const normType = String(type || 'habit').toLowerCase();
        const isHabitEvent = normType === 'habit' || Boolean(reminder.habit_id);
        const isSupportedAlarmType = isHabitEvent || normType === 'goal' || normType === 'learning_journey' || normType === 'learning_topic';
        const isAlarmEvent = isSupportedAlarmType && rawIsAlarmEvent;

        const hasMilestones = Boolean(
          reminder.goal_has_milestones ||
          reminder.milestone_id ||
          (reminder.goal_id && goalMilestonesMapRef.current.get(reminder.goal_id)?.length > 0)
        );
        const actionMode = getReminderActionMode(reminder, hasMilestones);
        const entityId = reminder.habit_id || reminder.goal_id || reminder.topic_id || reminder.journey_id || reminder.id;

        console.log(`[ReminderScheduler] 🔔 Triggering reminder/alarm at ${currentTime}:`, {
          id: reminder.id,
          type,
          isAlarm: isAlarmEvent,
          actionMode,
          name: reminder.habits?.habit_name || reminder.goals?.goal_name || reminder.learning_topics?.title || reminder.learning_journeys?.title || reminder.custom_text || 'Reminder',
        });

        // 5. Fire System Notification (in web browsers; on native Android, LocalNotifications handles it)
        if (!isNative && 'Notification' in window && Notification.permission === 'granted') {
          const isAlarm = isAlarmEvent;
          const actions = (isAlarm && isHabitEvent)
            ? [
                { action: 'complete', title: '✅ Done' },
                { action: 'skip',     title: '⏭️ Skip' },
              ]
            : (actionMode === 'confirm_goal' || actionMode === 'confirm_journey')
            ? [
                { action: 'open',   title: '🔍 Open' },
                { action: 'snooze', title: '⏰ Snooze 10 min' },
              ]
            : [
                { action: 'complete', title: '✅ Mark Done' },
                { action: 'snooze',   title: '⏰ Snooze 10 min' },
              ];

          const notificationOptions = {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: isAlarm ? `alarm-${normType}-${entityId}` : `reminder-${reminder.id}-${currentTime}`,
            renotify: true,
            requireInteraction: isAlarm,
            vibrate: isAlarm ? [300, 100, 300, 100, 300] : [200, 100, 200],
            data: {
              url,
              targetType: type,
              habitId: reminder.habit_id || null,
              goalId: reminder.goal_id || null,
              milestoneId: reminder.milestone_id || null,
              journeyId: reminder.journey_id || null,
              topicId: reminder.topic_id || null,
              hasMilestones,
              reminderMode: reminder.reminder_mode || 'scheduled',
              reminderId: reminder.id,
              isAlarm,
            },
            actions,
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
        if (isAlarmEvent) {
          window.dispatchEvent(new CustomEvent('habittracker-alarm-fired', {
            detail: {
              reminder: { ...reminder, is_alarm: true },
              habit: isHabitEvent ? (reminder.habits || { id: reminder.habit_id, habit_name: reminder.habit_name || 'Habit' }) : null,
              streak: statsRef.current?.currentStreak || 0,
              targetType: normType,
              entityId,
              hasMilestones,
            }
          }));
        } else {
          window.dispatchEvent(new CustomEvent('habittracker-reminder-fired', {
            detail: { reminder, title, body, url, hasMilestones }
          }));
        }
      }

      // Check Re-ping events that are due (habits only, untouched)
      const repings = repingEventsRef.current || [];
      for (const ev of repings) {
        if (!ev.next_reping_at) continue;
        if (completedHabitsRef.current.has(ev.habit_id)) continue;
        if (nativeState.handledHabitDates.has(`${ev.habit_id}:${todayYMD}`)) continue;
        const snoozeTs = nativeState.recentSnoozes.get(ev.habit_id);
        if (typeof snoozeTs === 'number' && (now.getTime() - snoozeTs) < 10 * 60 * 1000) continue;

        const dueAt = new Date(ev.next_reping_at).getTime();
        if (dueAt <= now.getTime()) {
          const repingKey = `reping_${ev.id}_${ev.reping_count}`;
          if (combinedFiredKeys.has(repingKey)) continue;
          firedRef.current.add(repingKey);
          markFiredAlarmKey(repingKey);

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

          window.dispatchEvent(new CustomEvent('habittracker-alarm-fired', {
            detail: {
              reminder: matchedReminder || { id: ev.reminder_id || `reping_${ev.habit_id}`, habit_id: ev.habit_id, is_alarm: true },
              habit: habitData,
              streak: statsRef.current?.currentStreak || 0
            }
          }));

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
