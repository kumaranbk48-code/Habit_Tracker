import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';
import { getUserTimeZone, getDateInTimeZone } from './date-utils.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token — please sign in again' });
  const user_id = user.id;

  const { type = 'weekly', fromDate: queryFrom, toDate: queryTo } = req.query || {};
  const validTypes = ['daily', 'weekly', 'monthly', 'custom'];
  if (type && !validTypes.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
  }

  try {
    const timeZone = getUserTimeZone(req, user);
    const today = getDateInTimeZone(new Date(), timeZone);
    const [y, m, d] = today.split('-').map(Number);
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

    const nowLocal = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = nowLocal.getUTCDay(); // 0 is Sunday
    const weekStartObj = new Date(Date.UTC(y, m - 1, d - dayOfWeek));
    const weekStart = getDateInTimeZone(weekStartObj, timeZone);
    const weekEndObj = new Date(Date.UTC(y, m - 1, d - dayOfWeek + 6));
    const weekEnd = getDateInTimeZone(weekEndObj, timeZone);

    let fromDate = today;
    let toDate = today;

    if (queryFrom && queryTo) {
      fromDate = queryFrom;
      toDate = queryTo;
    } else if (type === 'weekly') {
      fromDate = weekStart;
      toDate = weekEnd;
    } else if (type === 'monthly') {
      fromDate = monthStart;
      toDate = monthEnd;
    }

    // Ensure fromDate <= toDate
    if (fromDate > toDate) {
      const temp = fromDate;
      fromDate = toDate;
      toDate = temp;
    }

    const { data: habits, error: habitsErr } = await supabase
      .from('habits').select('*').eq('user_id', user_id);
    if (habitsErr) throw habitsErr;
    const habitIds = habits?.map(h => h.id) || [];

    let tracking = [];
    if (habitIds.length > 0) {
      const { data, error } = await supabase
        .from('habit_tracking').select('*')
        .eq('user_id', user_id)
        .eq('status', true)
        .in('habit_id', habitIds)
        .gte('completion_date', fromDate)
        .lte('completion_date', toDate)
        .order('completion_date', { ascending: true });
      if (error) throw error;
      tracking = data || [];
    }

    // Build per-habit stats map
    const fromDateObj = new Date(fromDate + 'T00:00:00');
    const toDateObj = new Date(toDate + 'T00:00:00');
    const diffMs = toDateObj - fromDateObj;
    const daysCount = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1);

    const habitStats = {};
    for (const h of habits || []) {
      habitStats[h.id] = {
        id: h.id,
        name: h.habit_name,
        category: h.category,
        status: h.status || 'active',
        count: 0,
      };
    }
    for (const t of tracking) {
      if (habitStats[t.habit_id]) habitStats[t.habit_id].count++;
    }

    const activeHabits = (habits || []).filter(h => h.status !== 'paused');
    const activeHabitsCount = activeHabits.length > 0 ? activeHabits.length : (habits?.length || 0);

    // Calculate individual habit completion rates
    const habitStatsList = Object.values(habitStats).map(h => ({
      ...h,
      rate: Math.min(100, Math.round((h.count / daysCount) * 100)),
    }));

    // Build daily breakdown timeline
    const dailyMap = {};
    for (const t of tracking) {
      dailyMap[t.completion_date] = (dailyMap[t.completion_date] || 0) + 1;
    }

    const dailyBreakdown = [];
    const iterDate = new Date(fromDateObj);
    while (iterDate <= toDateObj) {
      const dStr = iterDate.toISOString().split('T')[0];
      const count = dailyMap[dStr] || 0;
      const rate = activeHabitsCount > 0 ? Math.min(100, Math.round((count / activeHabitsCount) * 100)) : 0;
      const dayName = iterDate.toLocaleDateString('en-US', { weekday: 'short' });
      const dayLabel = iterDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dailyBreakdown.push({
        date: dStr,
        name: type === 'monthly' ? `${iterDate.getDate()}` : dayName,
        label: dayLabel,
        completed: count,
        rate,
      });
      iterDate.setDate(iterDate.getDate() + 1);
    }

    const { data: goals, error: goalsErr } = await supabase
      .from('goals').select('*').eq('user_id', user_id);
    if (goalsErr) throw goalsErr;

    const totalPossible = activeHabitsCount * daysCount;
    const completionRate = totalPossible > 0
      ? Math.round((tracking.length / totalPossible) * 100)
      : 0;

    return res.status(200).json({
      type,
      fromDate,
      toDate,
      daysCount,
      habits: habits || [],
      habitStats: habitStatsList,
      dailyBreakdown,
      goals: goals || [],
      totalCompletions: tracking.length,
      totalPossible,
      completionRate,
    });
  } catch (err) {
    console.error('[/api/reports] unexpected error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
