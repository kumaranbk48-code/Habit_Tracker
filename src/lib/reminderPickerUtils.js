/**
 * Pure helper utilities for sorting, defaulting, and labeling Targets (Goals,
 * Milestones, Learning Journeys, Topics) in the Reminders picker.
 */

export function isGoalCompleted(goal) {
  return goal?.status === 'Completed';
}

export function isMilestoneCompleted(milestone) {
  return milestone?.completed === true;
}

export function isJourneyCompleted(journey) {
  return journey?.status === 'Completed';
}

export function isTopicCompleted(topic) {
  return topic?.status === 'Completed';
}

/**
 * Returns a copy of `items` with active (incomplete) items first,
 * followed by completed items, preserving relative order within each group.
 */
export function sortTargetsActiveFirst(items = [], isCompleted = () => false) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const active = [];
  const completed = [];
  for (const item of items) {
    if (isCompleted(item)) {
      completed.push(item);
    } else {
      active.push(item);
    }
  }
  return [...active, ...completed];
}

/**
 * Returns the id of the first incomplete target, or '' if all targets are completed
 * or the list is empty.
 */
export function getFirstActiveTargetId(items = [], isCompleted = () => false) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const firstActive = items.find((item) => !isCompleted(item));
  return firstActive?.id ?? '';
}

/**
 * Resolves the selected target id when opening an existing reminder for edit.
 * Preserves `existingId` if the target still exists in `items` (even if it became
 * completed after the reminder was created, so the "(Completed)" label displays),
 * otherwise falls back to the first active target id.
 */
export function resolveEditedTargetId(items = [], existingId = '', isCompleted = () => false) {
  if (existingId && Array.isArray(items) && items.some((item) => String(item?.id) === String(existingId))) {
    return existingId;
  }
  return getFirstActiveTargetId(items, isCompleted);
}

/**
 * Formats Goal picker option text, appending " (Completed)" for completed goals.
 */
export function formatGoalPickerLabel(goal) {
  if (!goal) return '';
  const name = goal.goal_name || 'Goal';
  const deadline = goal.target_date ? ` (Deadline: ${goal.target_date})` : '';
  const suffix = isGoalCompleted(goal) ? ' (Completed)' : '';
  return `${name}${deadline}${suffix}`;
}

/**
 * Formats Learning Roadmap (journey) picker option text, appending " (Completed)"
 * for completed journeys.
 */
export function formatJourneyPickerLabel(journey) {
  if (!journey) return '';
  const title = journey.title || 'Learning Roadmap';
  const deadline = journey.target_date ? ` (Deadline: ${journey.target_date})` : '';
  const suffix = isJourneyCompleted(journey) ? ' (Completed)' : '';
  return `${title}${deadline}${suffix}`;
}
