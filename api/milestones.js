import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';

// Recomputes a goal's status from its milestones. Only runs when milestones
// exist — a goal with zero milestones keeps its status fully manual, exactly
// as it worked before this feature existed.
async function recomputeGoalStatus(goal_id, user_id) {
  const { data: milestones } = await supabase
    .from('goal_milestones')
    .select('completed')
    .eq('goal_id', goal_id)
    .eq('user_id', user_id);

  if (!milestones || milestones.length === 0) return;

  const total = milestones.length;
  const done  = milestones.filter(m => m.completed).length;
  const status = done === total ? 'Completed' : done > 0 ? 'In Progress' : 'Pending';

  await supabase.from('goals').update({ status }).eq('id', goal_id).eq('user_id', user_id);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token — please sign in again' });
  const user_id = user.id;

  try {
    if (req.method === 'GET') {
      const { goal_id } = req.query;
      let query = supabase.from('goal_milestones').select('*').eq('user_id', user_id);
      if (goal_id) query = query.eq('goal_id', goal_id);
      const { data, error } = await query.order('order_index', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data ?? []);
    }

    if (req.method === 'POST') {
      const { goal_id, title } = req.body ?? {};
      if (!goal_id) return res.status(400).json({ error: 'goal_id is required' });
      if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

      // Verify the goal belongs to this user before attaching a milestone
      const { data: goal } = await supabase
        .from('goals').select('id').eq('id', goal_id).eq('user_id', user_id).maybeSingle();
      if (!goal) return res.status(404).json({ error: 'Goal not found or access denied' });

      const { data: existing } = await supabase
        .from('goal_milestones').select('order_index')
        .eq('goal_id', goal_id).eq('user_id', user_id)
        .order('order_index', { ascending: false }).limit(1);
      const nextOrder = (existing?.[0]?.order_index ?? -1) + 1;

      const { data, error } = await supabase
        .from('goal_milestones')
        .insert({ user_id, goal_id, title: title.trim(), order_index: nextOrder })
        .select()
        .single();
      if (error) throw error;

      await recomputeGoalStatus(goal_id, user_id);
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, title, completed } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for update' });

      const updateFields = {};
      if (typeof title === 'string') {
        if (!title.trim()) return res.status(400).json({ error: 'title cannot be empty' });
        updateFields.title = title.trim();
      }
      if (typeof completed === 'boolean') updateFields.completed = completed;
      if (Object.keys(updateFields).length === 0) {
        return res.status(400).json({ error: 'Nothing to update — provide title and/or completed' });
      }

      const { data, error } = await supabase
        .from('goal_milestones')
        .update(updateFields)
        .eq('id', id)
        .eq('user_id', user_id)
        .select()
        .single();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Milestone not found or access denied' });

      await recomputeGoalStatus(data.goal_id, user_id);
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for delete' });

      const { data: existing } = await supabase
        .from('goal_milestones').select('goal_id').eq('id', id).eq('user_id', user_id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Milestone not found or access denied' });

      const { error } = await supabase.from('goal_milestones').delete().eq('id', id).eq('user_id', user_id);
      if (error) throw error;

      await recomputeGoalStatus(existing.goal_id, user_id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/milestones] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
