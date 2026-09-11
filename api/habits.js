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

  const isOldBlue = (c) => !c || ['#3b82f6', '#2563eb', '#1d4ed8', '#60a5fa', '#93c5fd', '#1e40af', '#1e3a8a', '#0075ff', '#38bdf8', '#0284c7'].includes(String(c).toLowerCase().trim());

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[/api/habits] GET error:', error);
        return res.status(500).json({ error: 'Failed to retrieve habits' });
      }

      const sanitized = (data ?? []).map(h => ({
        ...h,
        color: isOldBlue(h.color) ? '#3d7a75' : h.color,
      }));
      return res.status(200).json(sanitized);
    }

    if (req.method === 'POST') {
      const { habit_name, category, target_frequency, tracking_type, target_quantity, unit, time_of_day, color, icon, is_archived, timer_duration } = req.body ?? {};

      if (!habit_name?.trim() || habit_name.trim().length > 150) {
        return res.status(400).json({ error: 'habit_name must be between 1 and 150 characters' });
      }
      if (timer_duration !== undefined && timer_duration !== null && timer_duration !== '' && (Number(timer_duration) < 0 || !Number.isFinite(Number(timer_duration)))) {
        return res.status(400).json({ error: 'timer_duration must be positive' });
      }

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
      if (color !== undefined) insertObj.color = isOldBlue(color) ? '#3d7a75' : color;
      if (icon !== undefined) insertObj.icon = icon;
      if (is_archived !== undefined) insertObj.is_archived = is_archived;
      if (timer_duration !== undefined) insertObj.timer_duration = timer_duration ? Number(timer_duration) : null;

      const { data, error } = await supabase
        .from('habits')
        .insert(insertObj)
        .select()
        .single();

      if (error) {
        console.error('[/api/habits] POST error:', error);
        return res.status(500).json({ error: 'Failed to create habit' });
      }

      const sanitizedResult = data ? { ...data, color: isOldBlue(data.color) ? '#3d7a75' : data.color } : data;
      return res.status(201).json(sanitizedResult);
    }

    if (req.method === 'PUT') {
      const { id, habit_name, category, target_frequency, tracking_type, target_quantity, unit, time_of_day, color, icon, is_archived, timer_duration } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for update' });

      if (habit_name !== undefined && (!habit_name.trim() || habit_name.trim().length > 150)) {
        return res.status(400).json({ error: 'habit_name must be between 1 and 150 characters' });
      }
      if (target_quantity !== undefined && target_quantity !== null && target_quantity !== '' && Number(target_quantity) < 0) {
        return res.status(400).json({ error: 'target_quantity cannot be negative' });
      }

      const type = tracking_type === 'quantity' ? 'quantity' : 'boolean';
      let tq = null, unitClean = null;
      if (tracking_type !== undefined) {
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
      }

      const updateObj = {
        ...(habit_name !== undefined && { habit_name: habit_name.trim() }),
        ...(category !== undefined && { category }),
        ...(target_frequency !== undefined && { target_frequency }),
        ...(tracking_type !== undefined && { tracking_type: type, target_quantity: tq, unit: unitClean }),
        ...(time_of_day !== undefined && { time_of_day }),
        ...(color !== undefined && { color: isOldBlue(color) ? '#3d7a75' : color }),
        ...(icon !== undefined && { icon }),
        ...(is_archived !== undefined && { is_archived }),
        ...(timer_duration !== undefined && { timer_duration: timer_duration ? Number(timer_duration) : null })
      };

      const { data, error } = await supabase
        .from('habits')
        .update(updateObj)
        .eq('id', id)
        .eq('user_id', user_id)
        .select()
        .single();

      if (error) {
        console.error('[/api/habits] PUT error:', error);
        return res.status(500).json({ error: 'Failed to update habit' });
      }

      if (!data) return res.status(404).json({ error: 'Habit not found or access denied' });
      const sanitizedResult = { ...data, color: isOldBlue(data.color) ? '#3d7a75' : data.color };
      return res.status(200).json(sanitizedResult);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for delete' });

      const { error } = await supabase
        .from('habits')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) {
        console.error('[/api/habits] DELETE error:', error);
        return res.status(500).json({ error: 'Failed to delete habit' });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/habits] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
