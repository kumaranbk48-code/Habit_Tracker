import { enqueueOfflineAction, getCachedData, saveCachedData } from './offlineDb.js';
import { getOnlineStatus } from './networkStatus.js';
import { formatLocalYMD, getReminderActionMode } from './goalReminderUtils.js';

const ACKED_REMINDER_DATES_KEY = 'habiz_acked_reminder_dates';
const CATCHUP_SHOWN_DATES_KEY = 'habiz_deadline_catchup_dates';

const ackedReminderDatesMemory = new Set();
const catchupShownDatesMemory = new Set();

function safeStorage() {
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function readDateKeySet(storageKey, memorySet, todayYMD, storage = safeStorage()) {
  const result = new Set();
  for (const entry of memorySet) {
    if (entry.endsWith(`:${todayYMD}`)) {
      result.add(entry);
    }
  }
  if (storage) {
    try {
      const raw = JSON.parse(storage.getItem(storageKey) || '[]');
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (item?.key && item?.date === todayYMD) {
            result.add(item.key);
          }
        }
      }
    } catch {}
  }
  return result;
}

function writeDateKey(storageKey, memorySet, reminderId, dateYMD, storage = safeStorage()) {
  if (!reminderId || !dateYMD) return;
  const key = `${reminderId}:${dateYMD}`;
  memorySet.add(key);
  if (storage) {
    try {
      const raw = JSON.parse(storage.getItem(storageKey) || '[]');
      const list = Array.isArray(raw) ? raw.filter((e) => e && e.date === dateYMD && e.key !== key) : [];
      list.push({ key, date: dateYMD, ts: Date.now() });
      storage.setItem(storageKey, JSON.stringify(list.slice(-150)));
    } catch {}
  }
}

function deleteDateKey(storageKey, memorySet, reminderId, dateYMD, storage = safeStorage()) {
  if (!reminderId || !dateYMD) return;
  const key = `${reminderId}:${dateYMD}`;
  memorySet.delete(key);
  if (storage) {
    try {
      const raw = JSON.parse(storage.getItem(storageKey) || '[]');
      if (Array.isArray(raw)) {
        storage.setItem(storageKey, JSON.stringify(raw.filter((e) => e && e.key !== key)));
      }
    } catch {}
  }
}

export function acknowledgeReminderForDate(reminderId, dateYMD = formatLocalYMD(), storage = safeStorage()) {
  writeDateKey(ACKED_REMINDER_DATES_KEY, ackedReminderDatesMemory, reminderId, dateYMD, storage);
}

export function unacknowledgeReminderForDate(reminderId, dateYMD = formatLocalYMD(), storage = safeStorage()) {
  deleteDateKey(ACKED_REMINDER_DATES_KEY, ackedReminderDatesMemory, reminderId, dateYMD, storage);
}

export function getAckedReminderDates(dateYMD = formatLocalYMD(), storage = safeStorage()) {
  return readDateKeySet(ACKED_REMINDER_DATES_KEY, ackedReminderDatesMemory, dateYMD, storage);
}

export function isReminderAckedForDate(reminderId, dateYMD = formatLocalYMD(), storage = safeStorage()) {
  if (!reminderId || !dateYMD) return false;
  return getAckedReminderDates(dateYMD, storage).has(`${reminderId}:${dateYMD}`);
}

export function hasShownCatchUpToday(reminderId, dateYMD = formatLocalYMD(), storage = safeStorage()) {
  if (!reminderId || !dateYMD) return false;
  return readDateKeySet(CATCHUP_SHOWN_DATES_KEY, catchupShownDatesMemory, dateYMD, storage).has(`${reminderId}:${dateYMD}`);
}

export function markCatchUpShownToday(reminderId, dateYMD = formatLocalYMD(), storage = safeStorage()) {
  writeDateKey(CATCHUP_SHOWN_DATES_KEY, catchupShownDatesMemory, reminderId, dateYMD, storage);
}

function emitWindowEvent(name, detail) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));
  }
}

async function updateCachedMilestoneDone(userId, milestoneId, completed, goalId = null) {
  if (!userId || !milestoneId) return;
  try {
    const cachedMs = await getCachedData(userId, 'milestones');
    if (Array.isArray(cachedMs)) {
      const nextMs = cachedMs.map((m) => (m.id === milestoneId ? { ...m, completed } : m));
      await saveCachedData(userId, 'milestones', nextMs);
      if (goalId) {
        const goalMs = nextMs.filter((m) => m.goal_id === goalId);
        if (goalMs.length > 0 && goalMs.every((m) => m.completed)) {
          await updateCachedGoalDone(userId, goalId, 'Completed');
        }
      }
    }
  } catch {}
}

async function updateCachedGoalDone(userId, goalId, status = 'Completed') {
  if (!userId || !goalId) return;
  try {
    const cachedGoals = await getCachedData(userId, 'goals');
    if (Array.isArray(cachedGoals)) {
      await saveCachedData(
        userId,
        'goals',
        cachedGoals.map((g) => (g.id === goalId ? { ...g, status } : g))
      );
    }
  } catch {}
}

async function updateCachedLearningTopicDone(userId, topicId, status = 'Completed') {
  if (!userId || !topicId) return;
  try {
    const cachedHub = await getCachedData(userId, 'learning_hub');
    if (!cachedHub || !Array.isArray(cachedHub.journeys)) return;
    const patchJourney = (j) => {
      if (!j) return j;
      if (!Array.isArray(j.topics) || !j.topics.some((t) => t.id === topicId)) return j;
      const topics = j.topics.map((t) => (t.id === topicId ? { ...t, status } : t));
      const topicsCompleted = topics.filter((t) => t.status === 'Completed').length;
      return {
        ...j,
        topics,
        topics_completed: topicsCompleted,
      };
    };
    await saveCachedData(userId, 'learning_hub', {
      ...cachedHub,
      journeys: cachedHub.journeys.map(patchJourney),
      continueJourney: patchJourney(cachedHub.continueJourney),
    });
  } catch {}
}

async function updateCachedLearningJourneyDone(userId, journeyId, status = 'Completed') {
  if (!userId || !journeyId) return;
  try {
    const cachedHub = await getCachedData(userId, 'learning_hub');
    if (!cachedHub || !Array.isArray(cachedHub.journeys)) return;
    const patchJourney = (j) => (j && j.id === journeyId ? { ...j, status, completion_progress: 100 } : j);
    await saveCachedData(userId, 'learning_hub', {
      ...cachedHub,
      journeys: cachedHub.journeys.map(patchJourney),
      continueJourney: patchJourney(cachedHub.continueJourney),
    });
  } catch {}
}

/**
 * Maps explicit confirmation / prompt modes ('confirm_goal', 'confirm_journey') to
 * executable completion modes while leaving all other modes unchanged.
 */
export function normalizeReminderActionMode(mode, reminder, hasMilestones = false) {
  const resolved = mode || getReminderActionMode(reminder, hasMilestones);
  if (resolved === 'confirm_goal') return 'complete_goal';
  if (resolved === 'confirm_journey') return 'complete_journey';
  return resolved;
}

async function updateCachedReminderStatus(userId, reminderId, notification_status) {
  if (!reminderId) return;
  try {
    const cachedRems = await getCachedData(userId, 'reminders');
    if (Array.isArray(cachedRems)) {
      await saveCachedData(
        userId,
        'reminders',
        cachedRems.map((r) => (r.id === reminderId ? { ...r, notification_status } : r))
      );
    }
  } catch {}
}

/**
 * Executes the "Mark Done" or explicit confirm-card action for a non-habit reminder
 * (milestone, whole goal, topic, or journey) online or via native APK offline queue.
 * Never shows a completed toast unless the API call truly succeeded.
 */
export async function executeReminderDone({
  reminder,
  modeOverride = null,
  session,
  isNativePlatform = false,
  isOnline = typeof getOnlineStatus === 'function' ? getOnlineStatus() : true,
  hasMilestones = false,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  enqueueAction = enqueueOfflineAction,
  storage = safeStorage(),
  todayYMD = formatLocalYMD(),
} = {}) {
  if (!reminder) {
    return { ok: false, error: 'Missing reminder details.' };
  }

  const reminderId = reminder.id || reminder.reminderId || null;
  const goalId = reminder.goal_id || reminder.goalId || null;
  const milestoneId = reminder.milestone_id || reminder.milestoneId || null;
  const journeyId = reminder.journey_id || reminder.journeyId || null;
  const topicId = reminder.topic_id || reminder.topicId || null;

  const rawMode = modeOverride || getReminderActionMode(reminder, hasMilestones);
  const mode = normalizeReminderActionMode(rawMode, reminder, hasMilestones);
  const accessToken = session?.access_token;
  const userId = session?.user?.id;

  // Goal with milestones set to "Whole goal": acknowledge today only & open Goals page
  if (mode === 'ack_goal_day') {
    acknowledgeReminderForDate(reminderId, todayYMD, storage);
    emitWindowEvent('habittracker-reminders-updated');
    return {
      ok: true,
      mode,
      navigateTo: '/goals',
      toast: { message: 'Reminder acknowledged for today.', type: 'success' },
    };
  }

  const canAttemptOnline = Boolean(isOnline && accessToken && fetchImpl);

  // 1. Specific milestone tied to a goal reminder -> complete milestone & finish reminder
  if (mode === 'complete_milestone') {
    if (!milestoneId) return { ok: false, error: 'Milestone ID is missing.' };

    let networkFailed = !canAttemptOnline;
    if (canAttemptOnline) {
      try {
        const msRes = await fetchImpl('/api/milestones', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ id: milestoneId, completed: true }),
        });

        if (!msRes.ok) {
          const errJson = await msRes.json().catch(() => ({}));
          return {
            ok: false,
            error: errJson?.error || 'Failed to mark milestone done.',
          };
        }

        if (reminderId) {
          const remRes = await fetchImpl('/api/reminders', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ id: reminderId, notification_status: 'Done' }),
          });
          if (!remRes.ok) {
            emitWindowEvent('habittracker-stats-updated', { source: 'reminder-milestone' });
            return {
              ok: false,
              partial: true,
              error: 'Milestone completed, but failed to update reminder status.',
            };
          }
        }

        if (userId) {
          await updateCachedMilestoneDone(userId, milestoneId, true, goalId);
          if (reminderId) {
            await updateCachedReminderStatus(userId, reminderId, 'Done');
          }
        }
        acknowledgeReminderForDate(reminderId, todayYMD, storage);
        emitWindowEvent('habittracker-entity-completed', { targetType: 'goal', entityId: milestoneId, goalId, reminderId, date: todayYMD });
        emitWindowEvent('habittracker-stats-updated', { source: 'reminder-milestone' });
        emitWindowEvent('habittracker-reminders-updated');

        return {
          ok: true,
          mode,
          toast: { message: 'Milestone done', type: 'success', actionLabel: 'Undo' },
          undoData: {
            mode: 'complete_milestone',
            milestoneId,
            reminderId,
            previousReminderStatus: reminder.notification_status || 'Active',
            todayYMD,
          },
        };
      } catch {
        networkFailed = true;
      }
    }

    if (networkFailed && isNativePlatform && userId) {
      const queuedMs = await enqueueAction(userId, 'UPDATE_MILESTONE', {
        id: milestoneId,
        goal_id: goalId,
        completed: true,
      });
      if (queuedMs) {
        if (reminderId) {
          await enqueueAction(userId, 'UPDATE_REMINDER', {
            id: reminderId,
            notification_status: 'Done',
          });
          await updateCachedReminderStatus(userId, reminderId, 'Done');
        }
        await updateCachedMilestoneDone(userId, milestoneId, true, goalId);
        acknowledgeReminderForDate(reminderId, todayYMD, storage);
        emitWindowEvent('habittracker-stats-updated', { source: 'reminder-milestone-offline' });
        emitWindowEvent('habittracker-reminders-updated');
        return {
          ok: true,
          queued: true,
          mode,
          toast: { message: 'Saved offline. Will sync when online.', type: 'success' },
        };
      }
    }

    return { ok: false, error: 'Failed to mark milestone done. Check your connection.' };
  }

  // 2. Learning topic reminder -> complete topic (and finish deadline reminder)
  if (mode === 'complete_topic') {
    if (!topicId) return { ok: false, error: 'Topic ID is missing.' };
    const isDeadline = reminder.reminder_mode === 'deadline_proximity' || reminder.reminderMode === 'deadline_proximity';

    let networkFailed = !canAttemptOnline;
    if (canAttemptOnline) {
      try {
        const topicRes = await fetchImpl('/api/learning?action=update_topic', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ id: topicId, status: 'Completed' }),
        });

        if (!topicRes.ok) {
          const errJson = await topicRes.json().catch(() => ({}));
          return { ok: false, error: errJson?.error || 'Failed to mark topic completed.' };
        }

        if (reminderId && isDeadline) {
          const remRes = await fetchImpl('/api/reminders', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ id: reminderId, notification_status: 'Done' }),
          });
          if (!remRes.ok) {
            emitWindowEvent('habittracker-stats-updated', { source: 'reminder-topic' });
            return {
              ok: false,
              partial: true,
              error: 'Topic updated, but failed to finish reminder.',
            };
          }
        }

        if (userId) {
          await updateCachedLearningTopicDone(userId, topicId, 'Completed');
          if (reminderId && isDeadline) {
            await updateCachedReminderStatus(userId, reminderId, 'Done');
          }
        }
        acknowledgeReminderForDate(reminderId, todayYMD, storage);
        emitWindowEvent('habittracker-entity-completed', { targetType: 'learning_topic', entityId: topicId, journeyId, reminderId, date: todayYMD });
        emitWindowEvent('habittracker-stats-updated', { source: 'reminder-topic' });
        emitWindowEvent('habittracker-reminders-updated');

        return {
          ok: true,
          mode,
          toast: { message: 'Topic completed', type: 'success', actionLabel: 'Undo' },
          undoData: {
            mode: 'complete_topic',
            topicId,
            previousTopicStatus: reminder.learning_topics?.status || 'In Progress',
            reminderId,
            previousReminderStatus: reminder.notification_status || 'Active',
            isDeadline,
            todayYMD,
          },
        };
      } catch {
        networkFailed = true;
      }
    }

    if (networkFailed && isNativePlatform && userId) {
      const queuedTopic = await enqueueAction(userId, 'UPDATE_TOPIC', {
        id: topicId,
        status: 'Completed',
      });
      if (queuedTopic) {
        if (reminderId && isDeadline) {
          await enqueueAction(userId, 'UPDATE_REMINDER', {
            id: reminderId,
            notification_status: 'Done',
          });
          await updateCachedReminderStatus(userId, reminderId, 'Done');
        }
        if (userId) {
          await updateCachedLearningTopicDone(userId, topicId, 'Completed');
        }
        acknowledgeReminderForDate(reminderId, todayYMD, storage);
        emitWindowEvent('habittracker-stats-updated', { source: 'reminder-topic-offline' });
        emitWindowEvent('habittracker-reminders-updated');
        return {
          ok: true,
          queued: true,
          mode,
          toast: { message: 'Saved offline. Will sync when online.', type: 'success' },
        };
      }
    }

    return { ok: false, error: 'Failed to mark topic completed. Check your connection.' };
  }

  // 3. Whole Goal without milestones (explicit confirmation)
  if (mode === 'complete_goal') {
    if (!goalId) return { ok: false, error: 'Goal ID is missing.' };

    let networkFailed = !canAttemptOnline;
    if (canAttemptOnline) {
      try {
        const res = await fetchImpl('/api/goals', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ id: goalId, status: 'Completed' }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          return { ok: false, error: errJson?.error || 'Failed to complete goal.' };
        }

        if (userId) {
          await updateCachedGoalDone(userId, goalId, 'Completed');
        }
        acknowledgeReminderForDate(reminderId, todayYMD, storage);
        emitWindowEvent('habittracker-entity-completed', { targetType: 'goal', entityId: goalId, reminderId, date: todayYMD });
        emitWindowEvent('habittracker-stats-updated', { source: 'reminder-goal' });
        emitWindowEvent('habittracker-reminders-updated');

        return {
          ok: true,
          mode,
          toast: { message: 'Goal completed!', type: 'success' },
        };
      } catch {
        networkFailed = true;
      }
    }

    if (networkFailed && isNativePlatform && userId) {
      const queuedGoal = await enqueueAction(userId, 'UPDATE_GOAL', {
        id: goalId,
        status: 'Completed',
      });
      if (queuedGoal) {
        await updateCachedGoalDone(userId, goalId, 'Completed');
        acknowledgeReminderForDate(reminderId, todayYMD, storage);
        emitWindowEvent('habittracker-stats-updated', { source: 'reminder-goal-offline' });
        emitWindowEvent('habittracker-reminders-updated');
        return {
          ok: true,
          queued: true,
          mode,
          toast: { message: 'Saved offline. Will sync when online.', type: 'success' },
        };
      }
    }

    return { ok: false, error: 'Failed to complete goal. Check your connection.' };
  }

  // 4. Learning Journey whole confirmation
  if (mode === 'complete_journey') {
    if (!journeyId) return { ok: false, error: 'Journey ID is missing.' };

    let networkFailed = !canAttemptOnline;
    if (canAttemptOnline) {
      try {
        const res = await fetchImpl('/api/learning?action=update_journey', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ id: journeyId, status: 'Completed' }),
        });

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          return { ok: false, error: errJson?.error || 'Failed to complete journey.' };
        }

        if (userId) {
          await updateCachedLearningJourneyDone(userId, journeyId, 'Completed');
        }
        acknowledgeReminderForDate(reminderId, todayYMD, storage);
        emitWindowEvent('habittracker-entity-completed', { targetType: 'learning_journey', entityId: journeyId, reminderId, date: todayYMD });
        emitWindowEvent('habittracker-stats-updated', { source: 'reminder-journey' });
        emitWindowEvent('habittracker-reminders-updated');

        return {
          ok: true,
          mode,
          toast: { message: 'Learning journey completed!', type: 'success' },
        };
      } catch {
        networkFailed = true;
      }
    }

    if (networkFailed && isNativePlatform && userId) {
      const queuedJourney = await enqueueAction(userId, 'UPDATE_JOURNEY', {
        id: journeyId,
        status: 'Completed',
      });
      if (queuedJourney) {
        await updateCachedLearningJourneyDone(userId, journeyId, 'Completed');
        acknowledgeReminderForDate(reminderId, todayYMD, storage);
        emitWindowEvent('habittracker-stats-updated', { source: 'reminder-journey-offline' });
        emitWindowEvent('habittracker-reminders-updated');
        return {
          ok: true,
          queued: true,
          mode,
          toast: { message: 'Saved offline. Will sync when online.', type: 'success' },
        };
      }
    }

    return { ok: false, error: 'Failed to complete learning journey. Check your connection.' };
  }

  return { ok: false, error: `Unsupported reminder action mode: ${String(mode)}` };
}

export async function undoReminderDone({
  undoData,
  session,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  storage = safeStorage(),
} = {}) {
  const accessToken = session?.access_token;
  if (!undoData || !accessToken || !fetchImpl) {
    return { ok: false, error: 'Cannot undo while signed out or offline.' };
  }

  try {
    if (undoData.mode === 'complete_milestone') {
      const msRes = await fetchImpl('/api/milestones', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: undoData.milestoneId, completed: false }),
      });
      if (!msRes.ok) {
        return { ok: false, error: 'Failed to undo milestone completion.' };
      }

      if (undoData.reminderId) {
        const remRes = await fetchImpl('/api/reminders', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            id: undoData.reminderId,
            notification_status: undoData.previousReminderStatus || 'Active',
          }),
        });
        if (!remRes.ok) {
          return { ok: false, error: 'Milestone reverted, but failed to reactivate reminder.' };
        }
        unacknowledgeReminderForDate(undoData.reminderId, undoData.todayYMD || formatLocalYMD(), storage);
      }

      emitWindowEvent('habittracker-entity-uncompleted', { targetType: 'goal', entityId: undoData.milestoneId });
      emitWindowEvent('habittracker-stats-updated', { source: 'reminder-milestone-undo' });
      emitWindowEvent('habittracker-reminders-updated');
      return { ok: true, toast: { message: 'Undo complete', type: 'success' } };
    }

    if (undoData.mode === 'complete_topic') {
      const topicRes = await fetchImpl('/api/learning?action=update_topic', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: undoData.topicId, status: undoData.previousTopicStatus || 'In Progress' }),
      });
      if (!topicRes.ok) {
        return { ok: false, error: 'Failed to undo topic completion.' };
      }

      if (undoData.reminderId && undoData.isDeadline) {
        const remRes = await fetchImpl('/api/reminders', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            id: undoData.reminderId,
            notification_status: undoData.previousReminderStatus || 'Active',
          }),
        });
        if (!remRes.ok) {
          return { ok: false, error: 'Topic reverted, but failed to reactivate reminder.' };
        }
      }

      if (undoData.reminderId) {
        unacknowledgeReminderForDate(undoData.reminderId, undoData.todayYMD || formatLocalYMD(), storage);
      }
      emitWindowEvent('habittracker-entity-uncompleted', { targetType: 'learning_topic', entityId: undoData.topicId });
      emitWindowEvent('habittracker-stats-updated', { source: 'reminder-topic-undo' });
      emitWindowEvent('habittracker-reminders-updated');
      return { ok: true, toast: { message: 'Undo complete', type: 'success' } };
    }
  } catch {
    return { ok: false, error: 'Network error while undoing action.' };
  }

  return { ok: false, error: 'Nothing to undo.' };
}
