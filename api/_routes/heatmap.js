import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';
import { getUserTimeZone, getDateInTimeZone, getDateDaysAgoInTimeZone } from './date-utils.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  try {
    const timeZone = getUserTimeZone(req, user);
    const today = getDateInTimeZone(new Date(), timeZone);
    const fromDate = getDateDaysAgoInTimeZone(365, timeZone);

    const { data: habits, error: hErr } = await supabase
      .from('habits').select('id').eq('user_id', user.id);

    if (hErr) {
      console.error('[/api/heatmap] habits error:', hErr);
      return res.status(500).json({ error: 'Failed to retrieve habits' });
    }

    const totalHabits = habits?.length || 0;
    const habitIds = habits?.map(h => h.id) || [];

    if (!habitIds.length) {
      return res.status(200).json({ data: {}, totalHabits: 0 });
    }

    const { data: tracking, error: tErr } = await supabase
      .from('habit_tracking')
      .select('completion_date, status')
      .eq('user_id', user.id)
      .eq('status', true)
      .in('habit_id', habitIds)
      .gte('completion_date', fromDate)
      .lte('completion_date', today);

    if (tErr) {
      console.error('[/api/heatmap] tracking error:', tErr);
      return res.status(500).json({ error: 'Failed to retrieve heatmap tracking' });
    }

    // Aggregate by date
    const byDate = {};
    for (const row of tracking || []) {
      if (!byDate[row.completion_date]) {
        byDate[row.completion_date] = { completed: 0, total: totalHabits };
      }
      byDate[row.completion_date].completed++;
    }

    return res.status(200).json({ data: byDate, totalHabits });
  } catch (err) {
    console.error('[/api/heatmap] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
