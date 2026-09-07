import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token — please sign in again' });
  const user_id = user.id;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Fix: always return an array, never null
      return res.status(200).json(data ?? []);
    }

    if (req.method === 'POST') {
      const { habit_name, category, target_frequency, tracking_type, target_quantity, unit, time_of_day, color, icon, is_archived, timer_duration } = req.body ?? {};
      // Fix: validate required fields and return a clear 400 instead of letting
      // Supabase throw a cryptic constraint error
      if (!habit_name?.trim()) {
        return res.status(400).json({ error: 'habit_name is required' });
      }

      // Phase 1: quantity-based habits (e.g. "drink 3 liters", "read 30 pages")
      const type = tracking_type === 'quantity' ? 'quantity' : 'boolean';
      let tq = null, unitClean = null;
      if (type === 'quantity') {
        tq = Number(target_quantity);
        if (!Number.isFinite(tq) || tq <= 0) {
          return res.status(400).json({ error: 'target_quantity must be a positive number for quantity habits' });
        }
        if (!unit?.trim()) {
          return res.status(400).json({ error: 'unit is required for quantity habits (e.g. liters, pages)' });
        }
        unitClean = unit.trim();
      }

      const insertObj = {
        user_id,
        habit_name: habit_name.trim(),
        category: category || 'Health',
        target_frequency: target_frequency || 'Daily',
        tracking_type: type,
        target_quantity: tq,
        unit: unitClean,
      };

      if (time_of_day !== undefined) insertObj.time_of_day = time_of_day;
      if (color !== undefined) insertObj.color = color;
      if (icon !== undefined) insertObj.icon = icon;
      if (is_archived !== undefined) insertObj.is_archived = is_archived;
      if (timer_duration !== undefined) insertObj.timer_duration = timer_duration ? Number(timer_duration) : null;

      const { data, error } = await supabase
        .from('habits')
        .insert(insertObj)
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, habit_name, category, target_frequency, tracking_type, target_quantity, unit, time_of_day, color, icon, is_archived, timer_duration } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for update' });
      if (!habit_name?.trim()) return res.status(400).json({ error: 'habit_name is required' });

      // Phase 1: quantity-based habits — same validation as create
      const type = tracking_type === 'quantity' ? 'quantity' : 'boolean';
      let tq = null, unitClean = null;
      if (type === 'quantity') {
        tq = Number(target_quantity);
        if (!Number.isFinite(tq) || tq <= 0) {
          return res.status(400).json({ error: 'target_quantity must be a positive number for quantity habits' });
        }
        if (!unit?.trim()) {
          return res.status(400).json({ error: 'unit is required for quantity habits (e.g. liters, pages)' });
        }
        unitClean = unit.trim();
      }

      const updateObj = {
        habit_name: habit_name.trim(),
        category,
        target_frequency,
        tracking_type: type,
        target_quantity: tq,
        unit: unitClean,
      };

      if (time_of_day !== undefined) updateObj.time_of_day = time_of_day;
      if (color !== undefined) updateObj.color = color;
      if (icon !== undefined) updateObj.icon = icon;
      if (is_archived !== undefined) updateObj.is_archived = is_archived;
      if (timer_duration !== undefined) updateObj.timer_duration = timer_duration ? Number(timer_duration) : null;

      const { data, error } = await supabase
        .from('habits')
        .update(updateObj)
        .eq('id', id)
        .eq('user_id', user_id)
        .select()
        .single();
      if (error) throw error;
      // Fix: .single() returns null if the row didn't match (wrong id or wrong user)
      if (!data) return res.status(404).json({ error: 'Habit not found or access denied' });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for delete' });
      const { error } = await supabase
        .from('habits')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/habits] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
