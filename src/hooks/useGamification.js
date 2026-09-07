// ─── Gamification Engine ──────────────────────────────────────────────────────
// Pure client-side: XP is calculated from existing stats data.
// Badges are checked here and saved to Supabase via /api/achievements.
// No external API keys needed.

// ── XP / Level config ────────────────────────────────────────────────────────
export const LEVELS = [
  { level: 1,  xpRequired: 0,     title: 'Beginner',   color: '#7c8894' },
  { level: 2,  xpRequired: 100,   title: 'Apprentice', color: '#5c7fa3' },
  { level: 3,  xpRequired: 250,   title: 'Consistent', color: '#7570ab' },
  { level: 4,  xpRequired: 500,   title: 'Dedicated',  color: '#c99a52' },
  { level: 5,  xpRequired: 1000,  title: 'Motivated',  color: '#c07b52' },
  { level: 6,  xpRequired: 2000,  title: 'Committed',  color: '#b3574f' },
  { level: 7,  xpRequired: 3500,  title: 'Habitual',   color: '#b6708f' },
  { level: 8,  xpRequired: 5500,  title: 'Master',     color: '#3d7a75' },
  { level: 9,  xpRequired: 8000,  title: 'Elite',      color: '#6b8e6a' },
  { level: 10, xpRequired: 11000, title: 'Legend',     color: '#b5934a' },
];

export function calculateXP(stats) {
  if (!stats) return 0;
  const base         = (stats.totalAllTimeCompletions || 0) * 10;
  const streakBonus  = (stats.currentStreak || 0) * 2;
  const goalBonus    = (stats.completedGoals || 0) * 100;
  const perfectBonus = (stats.perfectDayCount || 0) * 50;
  return base + streakBonus + goalBonus + perfectBonus;
}

export function getLevelInfo(xp) {
  let current = LEVELS[0];
  let next    = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xpRequired) {
      current = LEVELS[i];
      next    = LEVELS[i + 1] || null;
      break;
    }
  }
  const xpIntoLevel = xp - current.xpRequired;
  const xpNeeded    = next ? next.xpRequired - current.xpRequired : 0;
  const progress    = next ? Math.round((xpIntoLevel / xpNeeded) * 100) : 100;
  return { current, next, xpIntoLevel, xpNeeded, progress };
}

// ── Tier metadata (visual only — colors for the badge grid) ───────────────────
export const TIERS = {
  bronze:   { label: 'Bronze',   bg: '#f5ecdb', ring: '#c99a52', text: '#8a5a24' },
  silver:   { label: 'Silver',   bg: '#eef1f3', ring: '#94a0aa', text: '#4b5563' },
  gold:     { label: 'Gold',     bg: '#faf3d9', ring: '#b5934a', text: '#8a6d24' },
  platinum: { label: 'Platinum', bg: '#eae7f5', ring: '#7570ab', text: '#4b4a8a' },
};

// ── Badge definitions ─────────────────────────────────────────────────────────
// `check` receives the full stats object and returns true when earned.
// IMPORTANT: `id` values are permanent — they're stored per-user in the
// database once unlocked, so existing ids are never renamed or removed here,
// only ever added to. `category`/`tier` are purely cosmetic (grid grouping
// and colour) and don't affect who has already earned what.
export const BADGES = [
  {
    id: 'first_habit',
    name: 'First Step',
    emoji: '🌱',
    description: 'Created your first habit',
    category: 'General',
    tier: 'bronze',
    check: (s) => (s.totalHabits || 0) >= 1,
  },
  {
    id: 'first_goal',
    name: 'Goal Setter',
    emoji: '🎯',
    description: 'Created your first goal',
    category: 'General',
    tier: 'bronze',
    check: (s) => (s.totalGoals || 0) >= 1,
  },
  {
    id: 'completions_10',
    name: 'Habit Rookie',
    emoji: '🌟',
    description: '10 total habit completions',
    category: 'General',
    tier: 'bronze',
    check: (s) => (s.totalAllTimeCompletions || 0) >= 10,
  },
  {
    id: 'completions_50',
    name: 'Habit Regular',
    emoji: '💫',
    description: '50 total habit completions',
    category: 'General',
    tier: 'silver',
    check: (s) => (s.totalAllTimeCompletions || 0) >= 50,
  },
  {
    id: 'completions_100',
    name: 'Habit Pro',
    emoji: '💎',
    description: '100 total habit completions',
    category: 'General',
    tier: 'gold',
    check: (s) => (s.totalAllTimeCompletions || 0) >= 100,
  },
  {
    id: 'streak_3',
    name: 'Getting Started',
    emoji: '✨',
    description: '3-day streak',
    category: 'General',
    tier: 'bronze',
    check: (s) => (s.currentStreak || 0) >= 3,
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    emoji: '⚡',
    description: '7-day streak',
    category: 'General',
    tier: 'silver',
    check: (s) => (s.currentStreak || 0) >= 7,
  },
  {
    id: 'streak_30',
    name: 'Monthly Hero',
    emoji: '🔥',
    description: '30-day streak',
    category: 'General',
    tier: 'gold',
    check: (s) => (s.currentStreak || 0) >= 30,
  },
  {
    id: 'streak_100',
    name: 'Century Club',
    emoji: '👑',
    description: '100-day streak',
    category: 'General',
    tier: 'platinum',
    check: (s) => (s.currentStreak || 0) >= 100,
  },
  {
    id: 'perfect_day',
    name: 'Perfect Day',
    emoji: '🎉',
    description: 'Completed all habits in a day',
    category: 'General',
    tier: 'silver',
    check: (s) => (s.perfectDayCount || 0) >= 1,
  },
  {
    id: 'goal_crusher',
    name: 'Goal Crusher',
    emoji: '🏆',
    description: 'Completed a goal',
    category: 'General',
    tier: 'gold',
    check: (s) => (s.completedGoals || 0) >= 1,
  },
  {
    id: 'habit_builder',
    name: 'Habit Builder',
    emoji: '🏗️',
    description: 'Tracking 5+ habits at once',
    category: 'General',
    tier: 'bronze',
    check: (s) => (s.totalHabits || 0) >= 5,
  },

  // ── Daily Mastery — consecutive days with a Daily-frequency habit done ────
  {
    id: 'daily_bronze',
    name: 'Daily Bronze',
    emoji: '🥉',
    description: '3-day daily habit streak',
    category: 'Daily',
    tier: 'bronze',
    check: (s) => (s.dailyStreak || 0) >= 3,
  },
  {
    id: 'daily_silver',
    name: 'Daily Silver',
    emoji: '🥈',
    description: '14-day daily habit streak',
    category: 'Daily',
    tier: 'silver',
    check: (s) => (s.dailyStreak || 0) >= 14,
  },
  {
    id: 'daily_gold',
    name: 'Daily Gold',
    emoji: '🥇',
    description: '30-day daily habit streak',
    category: 'Daily',
    tier: 'gold',
    check: (s) => (s.dailyStreak || 0) >= 30,
  },
  {
    id: 'daily_platinum',
    name: 'Daily Platinum',
    emoji: '💠',
    description: '90-day daily habit streak',
    category: 'Daily',
    tier: 'platinum',
    check: (s) => (s.dailyStreak || 0) >= 90,
  },

  // ── Weekly Mastery — consecutive weeks with a Weekly-frequency habit done ─
  {
    id: 'weekly_bronze',
    name: 'Weekly Bronze',
    emoji: '🥉',
    description: '2-week weekly habit streak',
    category: 'Weekly',
    tier: 'bronze',
    check: (s) => (s.weeklyStreak || 0) >= 2,
  },
  {
    id: 'weekly_silver',
    name: 'Weekly Silver',
    emoji: '🥈',
    description: '4-week weekly habit streak',
    category: 'Weekly',
    tier: 'silver',
    check: (s) => (s.weeklyStreak || 0) >= 4,
  },
  {
    id: 'weekly_gold',
    name: 'Weekly Gold',
    emoji: '🥇',
    description: '12-week weekly habit streak',
    category: 'Weekly',
    tier: 'gold',
    check: (s) => (s.weeklyStreak || 0) >= 12,
  },
  {
    id: 'weekly_platinum',
    name: 'Weekly Platinum',
    emoji: '💠',
    description: '26-week weekly habit streak',
    category: 'Weekly',
    tier: 'platinum',
    check: (s) => (s.weeklyStreak || 0) >= 26,
  },

  // ── Monthly Mastery — consecutive months with a Monthly-frequency habit ───
  {
    id: 'monthly_bronze',
    name: 'Monthly Bronze',
    emoji: '🥉',
    description: '2-month monthly habit streak',
    category: 'Monthly',
    tier: 'bronze',
    check: (s) => (s.monthlyStreak || 0) >= 2,
  },
  {
    id: 'monthly_silver',
    name: 'Monthly Silver',
    emoji: '🥈',
    description: '3-month monthly habit streak',
    category: 'Monthly',
    tier: 'silver',
    check: (s) => (s.monthlyStreak || 0) >= 3,
  },
  {
    id: 'monthly_gold',
    name: 'Monthly Gold',
    emoji: '🥇',
    description: '6-month monthly habit streak',
    category: 'Monthly',
    tier: 'gold',
    check: (s) => (s.monthlyStreak || 0) >= 6,
  },
  {
    id: 'monthly_platinum',
    name: 'Monthly Platinum',
    emoji: '💠',
    description: '12-month monthly habit streak',
    category: 'Monthly',
    tier: 'platinum',
    check: (s) => (s.monthlyStreak || 0) >= 12,
  },
];

// ── Category streaks (Daily / Weekly / Monthly mastery) ───────────────────────
// Computed client-side from the same habits + tracking data already fetched
// on the Dashboard (Phase 3). Uses the same lenient "at least one completion"
// streak philosophy as the main streak, just scoped to one frequency group,
// and the same "don't penalize today/this week/this month if not done yet"
// rule as the existing streak calculation.
function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  return toDateStr(sunday);
}

function getMonthKey(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

export function calculateCategoryStreaks(habitsList = [], allTracking = []) {
  // Same fallback rule as the Habits page grouping: anything not explicitly
  // Weekly/Monthly counts as Daily, so no habit is silently excluded.
  const dailyIds   = new Set(habitsList.filter(h => h.target_frequency !== 'Weekly' && h.target_frequency !== 'Monthly').map(h => h.id));
  const weeklyIds  = new Set(habitsList.filter(h => h.target_frequency === 'Weekly').map(h => h.id));
  const monthlyIds = new Set(habitsList.filter(h => h.target_frequency === 'Monthly').map(h => h.id));

  const completedRows = allTracking.filter(t => t.status === true);
  const dailyDates    = new Set(completedRows.filter(t => dailyIds.has(t.habit_id)).map(t => t.completion_date));
  const weeklyWeeks   = new Set(completedRows.filter(t => weeklyIds.has(t.habit_id)).map(t => getWeekKey(t.completion_date)));
  const monthlyMonths = new Set(completedRows.filter(t => monthlyIds.has(t.habit_id)).map(t => getMonthKey(t.completion_date)));

  let dailyStreak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (dailyDates.has(toDateStr(d))) { dailyStreak++; }
    else { if (i === 0) continue; break; }
  }

  let weeklyStreak = 0;
  for (let i = 0; i < 104; i++) {
    const d = new Date(); d.setDate(d.getDate() - i * 7);
    if (weeklyWeeks.has(getWeekKey(toDateStr(d)))) { weeklyStreak++; }
    else { if (i === 0) continue; break; }
  }

  let monthlyStreak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (monthlyMonths.has(key)) { monthlyStreak++; }
    else { if (i === 0) continue; break; }
  }

  return { dailyStreak, weeklyStreak, monthlyStreak };
}

// Returns array of newly unlocked badge IDs (ones earned but not yet saved)
export function checkNewBadges(stats, alreadyUnlocked = []) {
  return BADGES
    .filter(b => !alreadyUnlocked.includes(b.id) && b.check(stats))
    .map(b => b.id);
}
