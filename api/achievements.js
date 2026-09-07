import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid token' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('user_achievements')
        .select('badge_id, earned_at')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data ?? []);
    }

    if (req.method === 'POST') {
      const { badge_ids } = req.body ?? {};
      if (!Array.isArray(badge_ids) || badge_ids.length === 0) {
        return res.status(400).json({ error: 'badge_ids array is required' });
      }
      // Upsert — ignore if already exists (no duplicate unlocks)
      const rows = badge_ids.map(id => ({ user_id: user.id, badge_id: id }));
      const { data, error } = await supabase
        .from('user_achievements')
        .upsert(rows, { onConflict: 'user_id,badge_id', ignoreDuplicates: true })
        .select('badge_id, earned_at');
      if (error) throw error;
      return res.status(200).json(data ?? []);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/achievements] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
