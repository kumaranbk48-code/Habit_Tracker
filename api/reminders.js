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
        .from('reminders')
        .select('*, habits(habit_name)')
        .eq('user_id', user_id)
        .order('reminder_time', { ascending: true });

      if (error) {
        console.error('[/api/reminders] GET error:', error);
        return res.status(500).json({ error: 'Failed to retrieve reminders' });
      }

      return res.status(200).json(data ?? []);
    }

    if (req.method === 'POST') {
      const {
        habit_id, reminder_time, notification_status, alerts, custom_text, routine_window, days_of_week
      } = req.body ?? {};

      if (!habit_id) return res.status(400).json({ error: 'habit_id is required' });

      // Verify the target habit belongs to this authenticated user
      const { data: habit, error: habitErr } = await supabase
        .from('habits')
        .select('id')
        .eq('id', habit_id)
        .eq('user_id', user_id)
        .maybeSingle();

      if (habitErr || !habit) {
        return res.status(404).json({ error: 'Habit not found or access denied' });
      }

      const mainTime = reminder_time || (Array.isArray(alerts) && alerts.length > 0 ? alerts[0] : '08:00');
      const payload = {
        user_id,
        habit_id,
        reminder_time: mainTime,
        notification_status: notification_status || 'Active',
        alerts: Array.isArray(alerts) ? alerts : [mainTime],
        custom_text: custom_text || '',
        routine_window: routine_window || 'Morning',
        days_of_week: Array.isArray(days_of_week) ? days_of_week : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      };

      const { data, error } = await supabase
        .from('reminders')
        .insert(payload)
        .select('*, habits(habit_name)')
        .single();

      if (error) {
        console.error('[/api/reminders] POST error:', error);
        return res.status(500).json({ error: 'Failed to create reminder' });
      }

      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const {
        id, habit_id, reminder_time, notification_status, alerts, custom_text, routine_window, days_of_week
      } = req.body ?? {};

      if (!id) return res.status(400).json({ error: 'id is required for update' });

      // If habit_id is changing, verify the new habit also belongs to this user
      if (habit_id) {
        const { data: habit, error: habitErr } = await supabase
          .from('habits')
          .select('id')
          .eq('id', habit_id)
          .eq('user_id', user_id)
          .maybeSingle();

        if (habitErr || !habit) {
          return res.status(404).json({ error: 'Habit not found or access denied' });
        }
      }

      const mainTime = reminder_time || (Array.isArray(alerts) && alerts.length > 0 ? alerts[0] : '08:00');
      const updatePayload = {
        ...(habit_id && { habit_id }),
        reminder_time: mainTime,
        ...(notification_status !== undefined && { notification_status }),
        ...(alerts !== undefined && { alerts }),
        ...(custom_text !== undefined && { custom_text }),
        ...(routine_window !== undefined && { routine_window }),
        ...(days_of_week !== undefined && { days_of_week })
      };

      const { data, error } = await supabase
        .from('reminders')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user_id)
        .select('*, habits(habit_name)')
        .single();

      if (error) {
        console.error('[/api/reminders] PUT error:', error);
        return res.status(500).json({ error: 'Failed to update reminder' });
      }

      if (!data) return res.status(404).json({ error: 'Reminder not found or access denied' });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for delete' });

      const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) {
        console.error('[/api/reminders] DELETE error:', error);
        return res.status(500).json({ error: 'Failed to delete reminder' });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/reminders] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
