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
        .from('goals')
        .select('*')
        .eq('user_id', user_id)
        .order('target_date', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data ?? []);
    }

    if (req.method === 'POST') {
      const {
        goal_name, target_date, status, goal_type = 'Target',
        current_value = 0, target_value = 100, start_value = 0, unit = '',
        start_date = new Date().toISOString().split('T')[0], bad_habit = false
      } = req.body ?? {};
      if (!goal_name?.trim()) return res.status(400).json({ error: 'goal_name is required' });
      if (!target_date) return res.status(400).json({ error: 'target_date is required' });
      
      const payload = {
        user_id,
        goal_name: goal_name.trim(),
        target_date,
        status: status || 'Pending',
        goal_type,
        current_value: Number(current_value) || 0,
        target_value: Number(target_value) || 0,
        start_value: Number(start_value) || 0,
        unit,
        start_date,
        bad_habit: Boolean(bad_habit)
      };

      // Defensively attempt insert with extra fields, fallback if column missing in DB
      let { data, error } = await supabase.from('goals').insert(payload).select().single();
      if (error && error.message?.includes('column')) {
        const fallbackPayload = { user_id, goal_name: goal_name.trim(), target_date, status: status || 'Pending' };
        const fallbackRes = await supabase.from('goals').insert(fallbackPayload).select().single();
        if (fallbackRes.error) throw fallbackRes.error;
        data = { ...fallbackRes.data, ...payload };
      } else if (error) {
        throw error;
      }

      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const {
        id, goal_name, target_date, status, goal_type,
        current_value, target_value, start_value, unit, start_date, bad_habit
      } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for update' });
      if (!goal_name?.trim()) return res.status(400).json({ error: 'goal_name is required' });

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

      const updatePayload = {
        goal_name: goal_name.trim(),
        target_date,
        status: finalStatus,
        ...(goal_type !== undefined && { goal_type }),
        ...(current_value !== undefined && { current_value: Number(current_value) }),
        ...(target_value !== undefined && { target_value: Number(target_value) }),
        ...(start_value !== undefined && { start_value: Number(start_value) }),
        ...(unit !== undefined && { unit }),
        ...(start_date !== undefined && { start_date }),
        ...(bad_habit !== undefined && { bad_habit: Boolean(bad_habit) })
      };

      let { data, error } = await supabase
        .from('goals')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user_id)
        .select()
        .single();

      if (error && error.message?.includes('column')) {
        const fallbackPayload = { goal_name: goal_name.trim(), target_date, status: finalStatus };
        const fallbackRes = await supabase
          .from('goals')
          .update(fallbackPayload)
          .eq('id', id)
          .eq('user_id', user_id)
          .select()
          .single();
        if (fallbackRes.error) throw fallbackRes.error;
        data = { ...fallbackRes.data, ...updatePayload };
      } else if (error) {
        throw error;
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
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/goals] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
