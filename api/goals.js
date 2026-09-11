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
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user_id)
        .order('target_date', { ascending: true });

      if (error) {
        console.error('[/api/goals] GET error:', error);
        return res.status(500).json({ error: 'Failed to retrieve goals from database' });
      }

      return res.status(200).json(data ?? []);
    }

    if (req.method === 'POST') {
      const {
        goal_name, target_date, status, goal_type = 'Target',
        current_value, target_value, start_value, unit = '',
        start_date = new Date().toISOString().split('T')[0], bad_habit = false
      } = req.body ?? {};

      if (!goal_name?.trim() || goal_name.trim().length > 200) {
        return res.status(400).json({ error: 'goal_name must be between 1 and 200 characters' });
      }
      if (!target_date) return res.status(400).json({ error: 'target_date is required' });

      const parsedTargetVal = (target_value !== null && target_value !== undefined && target_value !== '')
        ? Number(target_value) : null;
      const parsedCurrentVal = (current_value !== null && current_value !== undefined && current_value !== '')
        ? Number(current_value) : 0;
      const parsedStartVal = (start_value !== null && start_value !== undefined && start_value !== '')
        ? Number(start_value) : 0;

      if (parsedCurrentVal < 0) {
        return res.status(400).json({ error: 'current_value cannot be negative' });
      }
      if (parsedTargetVal !== null && parsedTargetVal <= 0) {
        return res.status(400).json({ error: 'target_value must be greater than 0' });
      }

      const payload = {
        user_id,
        goal_name: goal_name.trim(),
        target_date,
        status: status || 'Pending',
        goal_type: goal_type || 'Target',
        current_value: parsedCurrentVal,
        target_value: parsedTargetVal,
        start_value: parsedStartVal,
        unit: unit?.trim() || '',
        start_date,
        bad_habit: Boolean(bad_habit)
      };

      const { data, error } = await supabase
        .from('goals')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.error('[/api/goals] POST error:', error);
        return res.status(500).json({ error: 'Failed to create goal in database' });
      }

      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const {
        id, goal_name, target_date, status, goal_type,
        current_value, target_value, start_value, unit, start_date, bad_habit
      } = req.body ?? {};

      if (!id) return res.status(400).json({ error: 'id is required for update' });
      if (goal_name !== undefined && !goal_name?.trim()) return res.status(400).json({ error: 'goal_name cannot be empty' });

      // Check milestones if status is being updated
      const { data: milestones } = await supabase
        .from('goal_milestones')
        .select('completed')
        .eq('goal_id', id)
        .eq('user_id', user_id);

      let finalStatus = status;
      if (milestones && milestones.length > 0) {
        const done = milestones.filter(m => m.completed).length;
        finalStatus = done === milestones.length ? 'Completed' : done > 0 ? 'In Progress' : 'Pending';
      }

      // Preserve omitted fields to prevent accidental resets on partial updates (e.g. progress updates)
      const updatePayload = {
        ...(goal_name !== undefined && { goal_name: goal_name.trim() }),
        ...(target_date !== undefined && { target_date }),
        ...(finalStatus !== undefined && { status: finalStatus }),
        ...(goal_type !== undefined && { goal_type }),
        ...(target_value !== undefined && { target_value: target_value !== null && target_value !== '' ? Number(target_value) : null }),
        ...(current_value !== undefined && { current_value: current_value !== null && current_value !== '' ? Number(current_value) : 0 }),
        ...(start_value !== undefined && { start_value: start_value !== null && start_value !== '' ? Number(start_value) : 0 }),
        ...(unit !== undefined && { unit: unit?.trim() || '' }),
        ...(start_date !== undefined && { start_date }),
        ...(bad_habit !== undefined && { bad_habit: Boolean(bad_habit) })
      };

      const { data, error } = await supabase
        .from('goals')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user_id)
        .select()
        .single();

      if (error) {
        console.error('[/api/goals] PUT error:', error);
        return res.status(500).json({ error: 'Failed to update goal in database' });
      }

      if (!data) return res.status(404).json({ error: 'Goal not found or access denied' });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for delete' });

      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) {
        console.error('[/api/goals] DELETE error:', error);
        return res.status(500).json({ error: 'Failed to delete goal' });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/goals] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
