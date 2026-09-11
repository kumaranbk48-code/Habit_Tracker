import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token — please sign in again' });
  const user_id = user.id;

  try {
    if (req.method === 'GET') {
      const { habit_id, date } = req.query;
      let query = supabase.from('habit_tracking').select('*').eq('user_id', user_id);
      if (habit_id) query = query.eq('habit_id', habit_id);
      if (date) query = query.eq('completion_date', date);
      const { data, error } = await query.order('completion_date', { ascending: false });

      if (error) {
        console.error('[/api/tracking] GET error:', error);
        return res.status(500).json({ error: 'Failed to retrieve tracking data' });
      }

      return res.status(200).json(data ?? []);
    }

    if (req.method === 'POST') {
      const { habit_id, completion_date, status, action, amount, note, mood } = req.body ?? {};
      if (!habit_id) return res.status(400).json({ error: 'habit_id is required' });
      if (!completion_date) return res.status(400).json({ error: 'completion_date is required' });

      // Verify habit belongs to this user
      const { data: habit, error: habitErr } = await supabase
        .from('habits')
        .select('tracking_type, target_quantity')
        .eq('id', habit_id)
        .eq('user_id', user_id)
        .maybeSingle();

      if (habitErr || !habit) return res.status(404).json({ error: 'Habit not found or access denied' });

      const { data: existing } = await supabase
        .from('habit_tracking')
        .select('id, quantity_completed, note, mood')
        .eq('habit_id', habit_id)
        .eq('completion_date', completion_date)
        .eq('user_id', user_id)
        .maybeSingle();

      let newStatus = status !== undefined ? status : true;
      let newQuantity = existing?.quantity_completed || 0;

      if (habit.tracking_type === 'quantity') {
        if (action === 'reset') {
          newQuantity = 0;
        } else {
          const inc = Number(amount);
          if (Number.isFinite(inc)) {
            newQuantity = Math.max(0, newQuantity + inc);
          }
        }
        const target = Number(habit.target_quantity) || 1;
        newStatus = newQuantity >= target;
      }

      // Atomic upsert with unique conflict resolution to prevent race conditions
      const upsertObj = {
        user_id,
        habit_id,
        completion_date,
        status: newStatus,
        quantity_completed: newQuantity
      };
      if (note !== undefined) upsertObj.note = note;
      if (mood !== undefined) upsertObj.mood = mood;

      const { data, error } = await supabase
        .from('habit_tracking')
        .upsert(upsertObj, { onConflict: 'habit_id,completion_date,user_id' })
        .select()
        .single();

      if (error) {
        console.error('[/api/tracking] UPSERT error:', error);
        return res.status(500).json({ error: 'Failed to save tracking record' });
      }

      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for delete' });

      const { error } = await supabase
        .from('habit_tracking')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) {
        console.error('[/api/tracking] DELETE error:', error);
        return res.status(500).json({ error: 'Failed to delete tracking record' });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/tracking] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
