const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Safely extracts the local YYYY-MM-DD start date for a habit from start_date, created_at, or aliases.
 */
export function getHabitStartDateStr(habit) {
  if (!habit) return null;

  const raw = habit.start_date || habit.startDate || habit.created_at || habit.createdAt || habit.creation_date;
  if (!raw) {
    // If habit has no creation date recorded, default to today's local date so it never appears on past dates
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    try {
      const normalized = trimmed.includes(' ') && !trimmed.includes('T')
        ? trimmed.replace(' ', 'T')
        : trimmed;
      const d = new Date(normalized);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    } catch {
      // ignore
    }
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  } else if (raw instanceof Date && !isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const day = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } else if (typeof raw === 'number') {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Determines whether a habit is scheduled to run on a specific date.
 * Habits are NEVER scheduled on dates prior to their creation or start date.
 */
export function isHabitScheduledOnDate(habit, dateStr) {
  if (!habit || !dateStr) return false;

  // A habit cannot be scheduled before it was created / started
  const startDateStr = getHabitStartDateStr(habit);
  if (startDateStr && dateStr < startDateStr) {
    return false;
  }

  const d = new Date(dateStr + 'T00:00:00');
  const dayIndex = d.getDay(); // 0 = Sun, 1 = Mon ...
  const dayNameShort = WEEKDAY_NAMES[dayIndex];
  const dayNameFull = FULL_WEEKDAY_NAMES[dayIndex];

  // Custom days of week array check if defined
  if (Array.isArray(habit.days_of_week) && habit.days_of_week.length > 0) {
    const customDays = habit.days_of_week.map(day => String(day).toLowerCase());
    return customDays.includes(dayNameShort.toLowerCase()) ||
           customDays.includes(dayNameFull.toLowerCase()) ||
           customDays.includes(String(dayIndex));
  }

  const freq = habit.target_frequency || 'Daily';

  if (freq === 'Daily') return true;

  if (freq === 'Weekly') {
    // Default weekly habit schedule to Monday unless days_of_week specified
    return dayIndex === 1;
  }

  if (freq === 'Monthly') {
    // Default monthly habit schedule to the 1st of the month
    return d.getDate() === 1;
  }

  return true;
}

/**
 * Returns precise cell status and metadata for a habit on a given date.
 */
export function getCellStatus(habit, dateStr, log, todayStr) {
  const isFuture = dateStr > todayStr;
  const isToday = dateStr === todayStr;

  // 1. Days before the habit existed are NOT_CREATED (never missed, never scheduled, never displayed)
  const startDateStr = getHabitStartDateStr(habit);
  if (startDateStr && dateStr < startDateStr) {
    return {
      type: 'NOT_CREATED',
      symbol: '',
      label: 'Not Created',
      scheduled: false,
      isDone: false,
      isPartial: false,
      isMissed: false,
      isNotScheduled: true,
      isFuture: false,
      quantityDone: 0,
      targetQuantity: habit?.target_quantity || 1,
      progressPct: 0,
    };
  }

  // 2. Future Dates
  if (isFuture) {
    const scheduled = isHabitScheduledOnDate(habit, dateStr);
    return {
      type: 'FUTURE',
      symbol: '',
      label: 'Future Date',
      scheduled,
      isDone: false,
      isPartial: false,
      isMissed: false,
      isNotScheduled: !scheduled,
      isFuture: true,
      quantityDone: 0,
      targetQuantity: habit?.target_quantity || 1,
      progressPct: 0,
    };
  }

  // 3. Paused Habits
  if (habit?.status === 'paused') {
    return {
      type: 'PAUSED',
      symbol: '⏸',
      label: 'Paused for Season',
      scheduled: false,
      isDone: false,
      isPartial: false,
      isMissed: false,
      isNotScheduled: true,
      isFuture: false,
      quantityDone: 0,
      targetQuantity: habit?.target_quantity || 1,
      progressPct: 0,
    };
  }

  const scheduled = isHabitScheduledOnDate(habit, dateStr);
  if (!scheduled) {
    return {
      type: 'NOT_SCHEDULED',
      symbol: '·',
      label: 'Not Scheduled',
      scheduled: false,
      isDone: false,
      isPartial: false,
      isMissed: false,
      isNotScheduled: true,
      isFuture: false,
      quantityDone: 0,
      targetQuantity: habit?.target_quantity || 1,
      progressPct: 0,
    };
  }

  const statusDone = log?.status === true;
  const isQuantity = habit?.tracking_type === 'quantity';
  const target = habit?.target_quantity || 1;
  const quantityDone = log?.quantity_completed || 0;

  if (isQuantity) {
    const isFullyDone = statusDone || quantityDone >= target;
    const progressPct = Math.min(100, Math.round((quantityDone / target) * 100));

    if (isFullyDone) {
      return {
        type: 'COMPLETED',
        symbol: '✓',
        label: 'Completed',
        scheduled: true,
        isDone: true,
        isPartial: false,
        isMissed: false,
        isNotScheduled: false,
        isFuture: false,
        quantityDone,
        targetQuantity: target,
        progressPct: 100,
      };
    }

    if (quantityDone > 0) {
      return {
        type: 'PARTIAL',
        symbol: '◐',
        label: `Partial (${progressPct}%)`,
        scheduled: true,
        isDone: false,
        isPartial: true,
        isMissed: false,
        isNotScheduled: false,
        isFuture: false,
        quantityDone,
        targetQuantity: target,
        progressPct,
      };
    }

    return {
      type: isToday ? 'PENDING' : 'INCOMPLETE',
      symbol: '○',
      label: isToday ? 'Pending Today' : 'Missed',
      scheduled: true,
      isDone: false,
      isPartial: false,
      isMissed: !isToday,
      isNotScheduled: false,
      isFuture: false,
      quantityDone: 0,
      targetQuantity: target,
      progressPct: 0,
    };
  }

  // Boolean Habit
  if (statusDone) {
    return {
      type: 'COMPLETED',
      symbol: '✓',
      label: 'Completed',
      scheduled: true,
      isDone: true,
      isPartial: false,
      isMissed: false,
      isNotScheduled: false,
      isFuture: false,
      quantityDone: 1,
      targetQuantity: 1,
      progressPct: 100,
    };
  }

  return {
    type: isToday ? 'PENDING' : 'INCOMPLETE',
    symbol: '○',
    label: isToday ? 'Pending Today' : 'Missed',
    scheduled: true,
    isDone: false,
    isPartial: false,
    isMissed: !isToday,
    isNotScheduled: false,
    isFuture: false,
    quantityDone: 0,
    targetQuantity: 1,
    progressPct: 0,
  };
}

/**
 * Calculates monthly habit analytics considering ONLY scheduled opportunities.
 */
export function calculateMonthlyAnalytics(habits = [], trackingLogs = [], viewYear, viewMonth, todayStr) {
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const trackingMap = new Map();

  trackingLogs.forEach(t => {
    trackingMap.set(`${t.habit_id}_${t.completion_date}`, t);
  });

  let totalScheduledOpportunities = 0;
  let completedScheduledOpportunities = 0;

  const habitPerformance = habits.map(habit => {
    let scheduledDays = 0;
    let completedDays = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const mm = String(viewMonth + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const dateStr = `${viewYear}-${mm}-${dd}`;

      // Only count days up to today for historical accuracy
      if (dateStr > todayStr) continue;

      const startDate = getHabitStartDateStr(habit);
      if (startDate && dateStr < startDate) {
        continue;
      }

      if (isHabitScheduledOnDate(habit, dateStr)) {
        const log = trackingMap.get(`${habit.id}_${dateStr}`);
        const status = getCellStatus(habit, dateStr, log, todayStr);
        if (status.type === 'PAUSED' || status.type === 'NOT_CREATED') {
          // Feature 3 & Uncreated Habits: Excluded from completion-rate math
          continue;
        }
        scheduledDays++;
        totalScheduledOpportunities++;

        if (status.isDone) {
          completedDays++;
          completedScheduledOpportunities++;
        }
      }
    }

    const rate = scheduledDays > 0 ? Math.round((completedDays / scheduledDays) * 100) : 0;
    return { habit, scheduledDays, completedDays, rate };
  });

  const completionRate = totalScheduledOpportunities > 0
    ? Math.round((completedScheduledOpportunities / totalScheduledOpportunities) * 100)
    : 0;

  // Best performing habit (with at least 1 scheduled day)
  const sortedHabits = [...habitPerformance]
    .filter(h => h.scheduledDays > 0)
    .sort((a, b) => b.rate - a.rate);

  const bestHabit = sortedHabits.length > 0 ? sortedHabits[0] : null;

  // Daily summary map
  const dailySummaryMap = {};
  for (let day = 1; day <= daysInMonth; day++) {
    const mm = String(viewMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateStr = `${viewYear}-${mm}-${dd}`;

    let dayScheduled = 0;
    let dayCompleted = 0;

    habits.forEach(habit => {
      const startDate = getHabitStartDateStr(habit);
      if (startDate && dateStr < startDate) {
        return;
      }

      if (isHabitScheduledOnDate(habit, dateStr)) {
        const log = trackingMap.get(`${habit.id}_${dateStr}`);
        const status = getCellStatus(habit, dateStr, log, todayStr);
        if (status.type !== 'PAUSED' && status.type !== 'NOT_CREATED') {
          dayScheduled++;
          if (status.isDone) dayCompleted++;
        }
      }
    });

    const rate = dayScheduled > 0 ? Math.round((dayCompleted / dayScheduled) * 100) : 0;
    dailySummaryMap[dateStr] = {
      scheduled: dayScheduled,
      completed: dayCompleted,
      rate,
      isAllDone: dayScheduled > 0 && dayCompleted === dayScheduled,
    };
  }

  return {
    totalActiveHabits: habits.length,
    totalScheduledOpportunities,
    completedScheduledOpportunities,
    completionRate,
    bestHabit,
    dailySummaryMap,
  };
}
