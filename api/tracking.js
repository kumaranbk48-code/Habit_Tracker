import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

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
      if (error) throw error;
      return res.status(200).json(data ?? []);
    }

    if (req.method === 'POST') {
      const { habit_id, completion_date, status, action, amount, note, mood } = req.body ?? {};
      // Fix: validate required fields
      if (!habit_id) return res.status(400).json({ error: 'habit_id is required' });
      if (!completion_date) return res.status(400).json({ error: 'completion_date is required' });

      // Phase 1: look up the habit to see if it's a quantity habit (e.g. "3 liters")
      // or a simple boolean habit. This decides how we compute the new status.
      const { data: habit, error: habitErr } = await supabase
        .from('habits')
        .select('tracking_type, target_quantity')
        .eq('id', habit_id)
        .eq('user_id', user_id)
        .single();
      if (habitErr || !habit) return res.status(404).json({ error: 'Habit not found' });

      // Upsert: update existing record or insert a new one
      const { data: existing } = await supabase
        .from('habit_tracking')
        .select('id, quantity_completed, note, mood')
        .eq('habit_id', habit_id)
        .eq('completion_date', completion_date)
        .eq('user_id', user_id)
        .maybeSingle();

      let newStatus = status;
      let newQuantity = existing?.quantity_completed || 0;

      if (habit.tracking_type === 'quantity') {
        if (action === 'reset') {
          newQuantity = 0;
        } else {
          const inc = Number(amount);
          if (!Number.isFinite(inc) || inc <= 0) {
            return res.status(400).json({ error: 'amount must be a positive number' });
          }
          newQuantity = Math.max(0, newQuantity + inc);
        }
        newStatus = habit.target_quantity > 0 && newQuantity >= habit.target_quantity;
      }

      const updateObj = { status: newStatus, quantity_completed: newQuantity };
      if (note !== undefined) updateObj.note = note;
      if (mood !== undefined) updateObj.mood = mood;

      if (existing) {
        const { data, error } = await supabase
          .from('habit_tracking')
          .update(updateObj)
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }

      const insertObj = { user_id, habit_id, completion_date, status: newStatus, quantity_completed: newQuantity };
      if (note !== undefined) insertObj.note = note;
      if (mood !== undefined) insertObj.mood = mood;

      const { data, error } = await supabase
        .from('habit_tracking')
        .insert(insertObj)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for delete' });
      const { error } = await supabase
        .from('habit_tracking')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/tracking] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
