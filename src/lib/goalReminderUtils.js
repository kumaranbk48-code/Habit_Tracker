const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatLocalYMD(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseLocalYMD(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const d = new Date(year, month - 1, day);
  if (
    Number.isNaN(d.getTime()) ||
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

export function isValidYMD(dateStr) {
  return parseLocalYMD(dateStr) !== null;
}

export function formatDDMonYYYY(dateStr) {
  const d = parseLocalYMD(dateStr);
  if (!d) return String(dateStr || '');
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Validates deadline / custom remind_on_date rules (local dates, no UTC shift).
 * @param {object} params
 * @param {string} params.reminderMode
 * @param {string|null|undefined} params.remindOnDate
 * @param {boolean} [params.useCustomDate]
 * @param {string|null|undefined} params.targetDate
 * @param {string} [params.todayStr]
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateReminderDeadline({
  reminderMode,
  remindOnDate,
  useCustomDate = false,
  targetDate = null,
  todayStr = formatLocalYMD(),
} = {}) {
  if (reminderMode !== 'deadline_proximity') {
    return { valid: true };
  }

  const trimmedCustom = typeof remindOnDate === 'string' ? remindOnDate.trim() : '';
  const hasCustomDate = useCustomDate || Boolean(trimmedCustom);

  if (hasCustomDate) {
    if (!isValidYMD(trimmedCustom)) {
      return { valid: false, error: 'Please pick a valid date for this reminder.' };
    }
    if (trimmedCustom < todayStr) {
      return { valid: false, error: 'Reminder date cannot be in the past.' };
    }
    if (targetDate && isValidYMD(targetDate) && trimmedCustom > targetDate) {
      return {
        valid: false,
        error: `Pick a date on or before the deadline (${formatDDMonYYYY(targetDate)})`,
      };
    }
    return { valid: true };
  }

  // Relative days_before_deadline requires target entity to have a target_date
  if (!targetDate || !isValidYMD(targetDate)) {
    return {
      valid: false,
      error: 'This goal has no deadline yet. Pick a date for the reminder or switch to Recurring Routine.',
    };
  }

  return { valid: true };
}

/**
 * Computes the local YYYY-MM-DD date on which a deadline_proximity reminder fires.
 * When remind_on_date is present, it takes precedence and ignores days_before_deadline.
 */
export function getDeadlineFireDateYMD(reminder) {
  if (!reminder) return null;
  if (reminder.remind_on_date && isValidYMD(String(reminder.remind_on_date))) {
    return String(reminder.remind_on_date).trim();
  }
  const targetDateStr =
    reminder.target_date ||
    reminder.goals?.target_date ||
    reminder.learning_topics?.target_date ||
    reminder.learning_journeys?.target_date ||
    null;
  const targetDate = parseLocalYMD(targetDateStr);
  if (!targetDate) return null;
  const days = Number(reminder.days_before_deadline) || 0;
  const fireDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() - days);
  return formatLocalYMD(fireDate);
}

/**
 * Returns true if the deadline on a goal/journey/topic changed such that an active deadline reminder can no longer fire on time.
 */
export function isReminderDeadlineInvalidated(reminder, entityTargetDate, todayStr = formatLocalYMD()) {
  if (!reminder || reminder.reminder_mode !== 'deadline_proximity') return false;
  const status = String(reminder.notification_status || 'Active').toLowerCase();
  if (status !== 'active') return false;
  if (isReminderTargetCompleted(reminder)) return false;

  const trimmedCustom = reminder.remind_on_date ? String(reminder.remind_on_date).trim() : '';
  if (trimmedCustom) {
    if (entityTargetDate && isValidYMD(entityTargetDate) && trimmedCustom > entityTargetDate) {
      return true;
    }
    return false;
  }

  if (!entityTargetDate || !isValidYMD(entityTargetDate)) {
    return true;
  }
  const fireYMD = getDeadlineFireDateYMD({ ...reminder, target_date: entityTargetDate });
  if (fireYMD && fireYMD < todayStr) {
    return true;
  }
  return false;
}

/**
 * Returns true when the non-habit target attached to a reminder is already completed.
 */
export function isReminderTargetCompleted(reminder, completionSets = {}) {
  if (!reminder) return false;
  const type = String(reminder.target_type || 'habit').toLowerCase();
  if (type === 'habit') return false;

  const {
    completedGoalIds,
    completedMilestoneIds,
    completedLearningIds,
  } = completionSets || {};

  if (type === 'goal') {
    if (reminder.milestone_id) {
      if (completedMilestoneIds?.has(reminder.milestone_id)) return true;
      if (reminder.goal_milestones?.completed === true) return true;
    }
    if (reminder.goal_id) {
      if (completedGoalIds?.has(reminder.goal_id)) return true;
      if (reminder.goals?.status === 'Completed') return true;
    }
    return false;
  }

  if (type === 'learning_topic' || (type === 'learning_journey' && reminder.topic_id)) {
    if (reminder.topic_id) {
      if (completedLearningIds?.has(reminder.topic_id)) return true;
      if (reminder.learning_topics?.status === 'Completed') return true;
    }
    if (reminder.journey_id) {
      if (completedLearningIds?.has(reminder.journey_id)) return true;
      if (reminder.learning_journeys?.status === 'Completed') return true;
    }
    return false;
  }

  if (type === 'learning_journey') {
    if (reminder.journey_id) {
      if (completedLearningIds?.has(reminder.journey_id)) return true;
      if (reminder.learning_journeys?.status === 'Completed') return true;
    }
    return false;
  }

  return false;
}

/**
 * Determines action button behavior for a reminder notification / prompt:
 * - 'complete_habit': Habit reminder/alarm
 * - 'complete_milestone': Goal reminder tied to a specific milestone
 * - 'ack_goal_day': Goal WITH milestones, set to Whole goal (ack today + open Goals)
 * - 'confirm_goal': Goal WITHOUT milestones (Open + Snooze -> in-app confirm card)
 * - 'complete_topic': Learning topic reminder
 * - 'confirm_journey': Learning journey (Whole journey -> Open + Snooze -> in-app confirm card)
 */
export function getReminderActionMode(reminder, goalHasMilestones = false) {
  const type = String(reminder?.target_type || 'habit').toLowerCase();
  if (type === 'habit') return 'complete_habit';
  if (type === 'goal') {
    if (reminder?.milestone_id || reminder?.milestoneId) return 'complete_milestone';
    const hasMs = Boolean(
      goalHasMilestones ||
      reminder?.goal_has_milestones ||
      reminder?.hasMilestones
    );
    return hasMs ? 'ack_goal_day' : 'confirm_goal';
  }
  if (type === 'learning_topic' || reminder?.topic_id || reminder?.topicId) {
    return 'complete_topic';
  }
  if (type === 'learning_journey') {
    return 'confirm_journey';
  }
  return 'complete_habit';
}

export function buildReminderDisplayCopy(reminder, explicitTargetName = '') {
  const type = String(reminder?.target_type || 'habit').toLowerCase();
  const isDeadlineMode = reminder?.reminder_mode === 'deadline_proximity';
  const customText = reminder?.custom_text ? String(reminder.custom_text).trim() : '';

  if (type === 'goal') {
    const goalName = explicitTargetName || reminder?.goals?.goal_name || reminder?.goal_name || 'Goal';
    const milestoneTitle = reminder?.goal_milestones?.title || reminder?.milestone_title || '';
    if (reminder?.milestone_id && milestoneTitle) {
      return {
        title: `🎯 Goal: "${goalName}" - Milestone: "${milestoneTitle}"`,
        body: customText || `Time to finish Milestone "${milestoneTitle}" for Goal "${goalName}".`,
        url: '/goals',
        goalName,
        milestoneTitle,
        itemName: `${goalName} - ${milestoneTitle}`,
      };
    }
    if (isDeadlineMode) {
      const days = Number(reminder?.days_before_deadline) || 0;
      const onCustomDate = Boolean(reminder?.remind_on_date);
      return {
        title: `🎯 Goal Deadline: ${goalName}`,
        body: customText || (onCustomDate
          ? `Goal deadline reminder for "${goalName}".`
          : days === 0
          ? `🚨 Today is the target deadline for Goal: "${goalName}"!`
          : days === 1
          ? `🚨 Tomorrow is the final day for Goal: "${goalName}"!`
          : `⏳ Only ${days} days remaining for Goal: "${goalName}"!`),
        url: '/goals',
        goalName,
        milestoneTitle: '',
        itemName: goalName,
      };
    }
    return {
      title: `🎯 Goal: ${goalName}`,
      body: customText ? `${customText} • Goal: ${goalName}` : `Time to check in on Goal: "${goalName}"!`,
      url: '/goals',
      goalName,
      milestoneTitle: '',
      itemName: goalName,
    };
  }

  if (type === 'learning_topic' || (type === 'learning_journey' && reminder?.topic_id)) {
    const topicTitle = explicitTargetName || reminder?.learning_topics?.title || reminder?.topic_title || 'Topic';
    const journeyTitle = reminder?.learning_journeys?.title || reminder?.journey_title || '';
    const titleLabel = journeyTitle ? `${journeyTitle} - ${topicTitle}` : topicTitle;
    return {
      title: `📚 Learning: ${titleLabel}`,
      body: customText || (isDeadlineMode
        ? `Target deadline reminder for topic "${topicTitle}"!`
        : `Time to study "${topicTitle}"${journeyTitle ? ` (${journeyTitle})` : ''}!`),
      url: reminder?.journey_id ? `/learning/journey/${reminder.journey_id}` : '/learning',
      journeyTitle,
      topicTitle,
      itemName: topicTitle,
    };
  }

  const journeyTitle = explicitTargetName || reminder?.learning_journeys?.title || reminder?.journey_title || 'Learning Roadmap';
  return {
    title: `📚 Learning Hub: ${journeyTitle}`,
    body: customText || (isDeadlineMode
      ? `Target deadline approaching for Learning Roadmap: "${journeyTitle}"!`
      : `Time for your Learning Hub session on "${journeyTitle}"!`),
    url: reminder?.journey_id ? `/learning/journey/${reminder.journey_id}` : '/learning',
    journeyTitle,
    topicTitle: '',
    itemName: journeyTitle,
  };
}
