import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid token' });

  try {
    // Last 365 days
    const today = new Date().toISOString().split('T')[0];
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const fromDate = yearAgo.toISOString().split('T')[0];

    const { data: habits } = await supabase
      .from('habits').select('id').eq('user_id', user.id);
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

    if (tErr) throw tErr;

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
    console.error('[/api/heatmap] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
