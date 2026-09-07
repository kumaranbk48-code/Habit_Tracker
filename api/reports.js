import supabase from './db-client.js';

function getToday() { return new Date().toISOString().split('T')[0]; }
function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}
function startOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function startOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  return start.toISOString().split('T')[0];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token — please sign in again' });
  const user_id = user.id;

  // Fix: validate type param — the original accepted any string silently
  const { type } = req.query;
  const validTypes = ['daily', 'weekly', 'monthly'];
  if (!validTypes.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
  }

  try {
    const today = getToday();

    const { data: habits, error: habitsErr } = await supabase
      .from('habits').select('*').eq('user_id', user_id);
    if (habitsErr) throw habitsErr;
    const habitIds = habits?.map(h => h.id) || [];

    let fromDate = today;
    if (type === 'weekly')  fromDate = startOfWeek();
    if (type === 'monthly') fromDate = startOfMonth();

    let tracking = [];
    if (habitIds.length > 0) {
      const { data, error } = await supabase
        .from('habit_tracking').select('*')
        .eq('user_id', user_id)
        .eq('status', true)
        .in('habit_id', habitIds)
        .gte('completion_date', fromDate)
        .lte('completion_date', today)
        .order('completion_date', { ascending: true });
      if (error) throw error;
      tracking = data || [];
    }

    // Build per-habit stats map
    const habitStats = {};
    for (const h of habits || []) {
      habitStats[h.id] = { name: h.habit_name, category: h.category, count: 0 };
    }
    for (const t of tracking) {
      if (habitStats[t.habit_id]) habitStats[t.habit_id].count++;
    }

    const { data: goals, error: goalsErr } = await supabase
      .from('goals').select('*').eq('user_id', user_id);
    if (goalsErr) throw goalsErr;

    // Fix: daysCount was wrong for 'daily' (was 1, but also counted weekends for
    // weekly which is correct). However totalPossible is now correctly derived
    // from the actual number of days in the period:
    const fromDateObj = new Date(fromDate + 'T00:00:00');
    const todayObj    = new Date(today    + 'T00:00:00');
    const diffMs = todayObj - fromDateObj;
    const daysCount = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1; // inclusive
    const totalPossible = (habits?.length || 0) * daysCount;
    const completionRate = totalPossible > 0
      ? Math.round((tracking.length / totalPossible) * 100)
      : 0;

    return res.status(200).json({
      type,
      fromDate,
      toDate: today,
      habits: habits || [],
      habitStats: Object.values(habitStats),
      goals: goals || [],
      totalCompletions: tracking.length,
      totalPossible,
      completionRate,
    });
  } catch (err) {
    console.error('[/api/reports] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
