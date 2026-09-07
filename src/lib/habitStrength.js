/**
 * Exponential decay Habit Strength Calculation Algorithm
 * Evaluates historical consistency over the past N days.
 * 
 * Strength formula:
 * - Strength starts at 0.
 * - For each day from (today - N) to today:
 *   If completed: strength = (strength * decayFactor) + (100 * (1 - decayFactor))
 *   If missed:    strength = (strength * decayFactor)
 * 
 * Result is a bounded score between 0% and 100%.
 */

export function calculateHabitStrength(habitId, trackingLogs, days = 30) {
  if (!habitId || !Array.isArray(trackingLogs)) return 0;

  // Build a set or map of completion dates for this habit
  const completedDates = new Set(
    trackingLogs
      .filter(t => t.habit_id === habitId && t.status === true)
      .map(t => t.completion_date)
  );

  let strength = 0;
  const decayFactor = 0.92; // Half-life of approx 8.3 days

  const now = new Date();
  
  // Iterate from `days` ago up to today
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const isCompleted = completedDates.has(dateStr);

    if (isCompleted) {
      strength = strength * decayFactor + (100 * (1 - decayFactor));
    } else {
      strength = strength * decayFactor;
    }
  }

  return Math.min(100, Math.max(0, Math.round(strength)));
}

/**
 * Calculates overall user habit strength score across all habits.
 */
export function calculateOverallHabitStrength(habits, trackingLogs, days = 30) {
  if (!Array.isArray(habits) || habits.length === 0) return 0;
  
  const scores = habits.map(h => calculateHabitStrength(h.id, trackingLogs, days));
  const total = scores.reduce((acc, score) => acc + score, 0);
  return Math.round(total / habits.length);
}

/**
 * Get human readable rating & color for a strength score
 */
export function getStrengthBadge(score) {
  if (score >= 80) return { label: 'Mastered', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200' };
  if (score >= 60) return { label: 'Strong', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200' };
  if (score >= 35) return { label: 'Building', color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200' };
  return { label: 'Forming', color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200' };
}
