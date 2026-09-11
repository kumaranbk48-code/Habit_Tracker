import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';
import { getUserTimeZone, getDateInTimeZone, getDateDaysAgoInTimeZone } from './date-utils.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token' });
  const user_id = user.id;

  try {
    const timeZone = getUserTimeZone(req, user);
    const today = getDateInTimeZone(new Date(), timeZone);

    const { data: habits } = await supabase
      .from('habits').select('id').eq('user_id', user_id);
    const totalHabits = habits?.length || 0;
    const habitIds    = habits?.map(h => h.id) || [];

    let completedToday = 0;
    let allTracking    = [];

    if (habitIds.length > 0) {
      const [todayRes, allRes] = await Promise.all([
        supabase.from('habit_tracking').select('id')
          .eq('user_id', user_id).eq('completion_date', today).eq('status', true).in('habit_id', habitIds),
        supabase.from('habit_tracking').select('completion_date, habit_id')
          .eq('user_id', user_id).eq('status', true).in('habit_id', habitIds)
          .order('completion_date', { ascending: false }),
      ]);
      completedToday = todayRes.data?.length || 0;
      allTracking    = allRes.data || [];
    }

    // ── Total all-time completions (for XP) ──────────────────────────────
    const totalAllTimeCompletions = allTracking.length;

    // ── Streak calculation ────────────────────────────────────────────────
    const dateSet = new Set(allTracking.map(t => t.completion_date));
    let currentStreak = 0;
    for (let i = 0; i < 365; i++) {
      const d = getDateDaysAgoInTimeZone(i, timeZone);
      if (dateSet.has(d)) {
        currentStreak++;
      } else {
        if (i === 0) continue; // don't penalise if today not done yet
        break;
      }
    }

    let longestStreak = 0;
    let temp = 0;
    let prev = null;
    const sorted = Array.from(dateSet).sort();
    for (const d of sorted) {
      if (prev) {
        const p = new Date(prev); p.setDate(p.getDate() + 1);
        temp = p.toISOString().split('T')[0] === d ? temp + 1 : 1;
      } else { temp = 1; }
      if (temp > longestStreak) longestStreak = temp;
      prev = d;
    }

    // ── Perfect days count (for XP bonus) ────────────────────────────────
    // A "perfect day" = every habit was completed on that date
    let perfectDayCount = 0;
    if (totalHabits > 0 && allTracking.length > 0) {
      const countByDate = {};
      for (const row of allTracking) {
        countByDate[row.completion_date] = (countByDate[row.completion_date] || 0) + 1;
      }
      perfectDayCount = Object.values(countByDate).filter(c => c >= totalHabits).length;
    }

    // ── Goals ─────────────────────────────────────────────────────────────
    const { data: goals } = await supabase
      .from('goals').select('status').eq('user_id', user_id);
    const totalGoals     = goals?.length || 0;
    const completedGoals = goals?.filter(g => g.status === 'Completed').length || 0;

    // ── Weekly chart data (single query) ─────────────────────────────────
    const fromDate = getDateDaysAgoInTimeZone(6, timeZone);
    let weeklyMap  = {};
    if (habitIds.length > 0) {
      const { data: weekData } = await supabase
        .from('habit_tracking').select('completion_date')
        .eq('user_id', user_id).eq('status', true)
        .in('habit_id', habitIds)
        .gte('completion_date', fromDate).lte('completion_date', today);
      for (const row of weekData || []) {
        weeklyMap[row.completion_date] = (weeklyMap[row.completion_date] || 0) + 1;
      }
    }
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = getDateDaysAgoInTimeZone(i, timeZone);
      last7.push({ date: d, completed: weeklyMap[d] || 0, total: totalHabits });
    }

    return res.status(200).json({
      totalHabits,
      completedToday,
      pendingToday: totalHabits - completedToday,
      currentStreak,
      longestStreak,
      completionPercentage: totalHabits > 0 ? Math.round((completedToday / totalHabits) * 100) : 0,
      totalGoals,
      completedGoals,
      goalProgress: totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0,
      weeklyData: last7,
      // ── New in Round 2 (gamification) ─────────────────────────────────
      totalAllTimeCompletions,
      perfectDayCount,
    });
  } catch (err) {
    console.error('[/api/dashboard] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
