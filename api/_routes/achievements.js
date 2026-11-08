import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('user_achievements')
        .select('badge_id, earned_at')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: true });

      if (error) {
        console.error('[/api/achievements] GET error:', error);
        return res.status(500).json({ error: 'Failed to retrieve achievements' });
      }

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

      if (error) {
        console.error('[/api/achievements] POST error:', error);
        return res.status(500).json({ error: 'Failed to save achievements' });
      }

      return res.status(200).json(data ?? []);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/achievements] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
