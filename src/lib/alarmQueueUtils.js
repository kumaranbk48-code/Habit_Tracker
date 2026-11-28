import { buildReminderDisplayCopy } from './goalReminderUtils.js';

export const ALARM_SUPPORTED_TARGET_TYPES = [
  'habit',
  'goal',
  'learning_journey',
  'learning_topic',
];

/**
 * Normalizes target_type variants into the four canonical reminder target types.
 */
export function normalizeAlarmTargetType(targetType) {
  const raw = String(targetType || 'habit').toLowerCase().trim();
  if (raw === 'learning') return 'learning_journey';
  if (
    raw === 'habit' ||
    raw === 'goal' ||
    raw === 'learning_journey' ||
    raw === 'learning_topic'
  ) {
    return raw;
  }
  return 'habit';
}

/**
 * Returns true for reminder target types that support alarm mode & takeover cards.
 */
export function isAlarmSupportedTargetType(targetType) {
  const raw = String(targetType || 'habit').toLowerCase().trim();
  return raw === 'learning' || ALARM_SUPPORTED_TARGET_TYPES.includes(raw);
}

/**
 * Extracts the primary native/queue entity ID for any reminder target type:
 * - habit -> habit_id
 * - goal -> goal_id
 * - learning_topic -> topic_id (falling back to journey_id)
 * - learning_journey -> journey_id (or topic_id if set)
 */
export function getAlarmEntityId(source = {}) {
  const type = normalizeAlarmTargetType(source?.target_type ?? source?.targetType);
  if (type === 'habit') {
    return String(
      source?.habit_id ||
      source?.habitId ||
      source?.habit?.id ||
      ''
    );
  }
  if (type === 'goal') {
    return String(
      source?.goal_id ||
      source?.goalId ||
      source?.goals?.id ||
      ''
    );
  }
  if (type === 'learning_topic') {
    return String(
      source?.topic_id ||
      source?.topicId ||
      source?.journey_id ||
      source?.journeyId ||
      ''
    );
  }
  if (type === 'learning_journey') {
    return String(
      source?.topic_id ||
      source?.topicId ||
      source?.journey_id ||
      source?.journeyId ||
      ''
    );
  }
  return String(
    source?.entityId ||
    source?.reminder_id ||
    source?.reminderId ||
    source?.id ||
    ''
  );
}

/**
 * Builds the composite takeover queue key `${targetType}:${entityId}` so
 * simultaneous habit, goal, and learning alarms never collide.
 */
export function makeAlarmQueueKey(targetType, entityId, fallbackId = '') {
  const normType = normalizeAlarmTargetType(targetType);
  const idPart = String(entityId || fallbackId || '');
  return `${normType}:${idPart}`;
}

/**
 * Computes the in-app navigation path for an alarm takeover item.
 */
export function getAlarmDeepLink(item = {}) {
  const type = normalizeAlarmTargetType(item?.targetType ?? item?.target_type);
  if (type === 'goal') return '/goals';
  if (type === 'learning_journey' || type === 'learning_topic') {
    const jId = item?.journeyId || item?.journey_id || '';
    return jId ? `/learning/journey/${jId}` : '/learning';
  }
  return '/';
}

/**
 * Normalizes an incoming `habittracker-alarm-fired` event detail into a uniform
 * takeover queue item keyed by `${targetType}:${entityId}`.
 */
export function normalizeIncomingAlarmItem(detail = {}) {
  const { reminder = {}, habit = null, targetType, entityId, hasMilestones = false } = detail || {};
  const resolvedType = normalizeAlarmTargetType(
    targetType ||
    reminder?.target_type ||
    (habit ? 'habit' : 'habit')
  );

  const resolvedEntityId = String(
    entityId ||
    getAlarmEntityId({ ...reminder, target_type: resolvedType, habit }) ||
    reminder?.id ||
    ''
  );

  const queueKey = makeAlarmQueueKey(resolvedType, resolvedEntityId, reminder?.id || '');
  const isHabit = resolvedType === 'habit';

  if (isHabit) {
    const habitObj = habit || {
      id: resolvedEntityId,
      habit_name: reminder?.habits?.habit_name || reminder?.habit_name || 'Habit Alarm',
      daily_goal: reminder?.habits?.daily_goal || 1,
      goal_unit: reminder?.habits?.goal_unit || 'times',
      type: reminder?.habits?.type || 'build',
      frequency: reminder?.habits?.frequency || 'Daily',
    };
    return {
      queueKey,
      targetType: 'habit',
      entityId: resolvedEntityId,
      isHabit: true,
      id: resolvedEntityId,
      habit: habitObj,
      reminder: {
        ...reminder,
        habit_id: resolvedEntityId,
        target_type: 'habit',
      },
      title: habitObj.habit_name || 'Habit Alarm',
      subtitle: reminder?.custom_text || '',
      deepLinkUrl: '/',
    };
  }

  const copy = buildReminderDisplayCopy({
    ...reminder,
    target_type: resolvedType,
  });

  const journeyId = reminder?.journey_id || reminder?.journeyId || (resolvedType === 'learning_journey' ? resolvedEntityId : '') || '';
  const topicId = reminder?.topic_id || reminder?.topicId || (resolvedType === 'learning_topic' ? resolvedEntityId : '') || '';
  const milestoneId = reminder?.milestone_id || reminder?.milestoneId || '';

  return {
    queueKey,
    targetType: resolvedType,
    entityId: resolvedEntityId,
    isHabit: false,
    id: resolvedEntityId,
    habit: null,
    reminder: {
      ...reminder,
      target_type: resolvedType,
      goal_id: reminder?.goal_id || (resolvedType === 'goal' ? resolvedEntityId : undefined),
      milestone_id: milestoneId || undefined,
      journey_id: journeyId || undefined,
      topic_id: topicId || undefined,
      hasMilestones: Boolean(hasMilestones || reminder?.hasMilestones || reminder?.goal_has_milestones),
    },
    reminderId: reminder?.id || reminder?.reminderId || '',
    milestoneId,
    journeyId,
    topicId,
    hasMilestones: Boolean(hasMilestones || reminder?.hasMilestones || reminder?.goal_has_milestones),
    title: copy.itemName || copy.title || 'Alarm Reminder',
    subtitle: copy.body || '',
    badgeLabel: resolvedType === 'goal' ? 'Goal Alarm' : 'Learning Alarm',
    deepLinkUrl: getAlarmDeepLink({ targetType: resolvedType, journeyId }),
  };
}

/**
 * Inserts or updates a queue item keyed strictly by `queueKey` (`${targetType}:${entityId}`).
 * Preserves existing items of different types or IDs (no collisions at the same minute).
 */
export function upsertAlarmQueueItem(queue = [], nextItem) {
  if (!nextItem || !nextItem.queueKey) return Array.isArray(queue) ? [...queue] : [];
  const list = Array.isArray(queue) ? [...queue] : [];
  const existingIdx = list.findIndex((item) => item.queueKey === nextItem.queueKey);
  if (existingIdx >= 0) {
    list[existingIdx] = nextItem;
    return list;
  }
  return [...list, nextItem];
}

/**
 * Removes an item by its `queueKey`.
 */
export function removeAlarmQueueItem(queue = [], queueKey) {
  if (!Array.isArray(queue)) return [];
  return queue.filter((item) => item.queueKey !== queueKey);
}

/**
 * Guards habit completion side effects so goal/learning takeover actions
 * ('open', 'snooze', 'dismiss') NEVER call /api/tracking or touch habit streaks.
 */
export function shouldCallHabitTrackingForTakeoverAction(item, action) {
  if (!item || item.targetType !== 'habit' || item.isHabit !== true) {
    return false;
  }
  return action === 'mark_done' || action === 'increment';
}
