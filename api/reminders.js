import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';

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
      const { data, error } = await supabase
        .from('reminders')
        .select('*, habits(habit_name)')
        .eq('user_id', user_id)
        .order('reminder_time', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data ?? []);
    }

    if (req.method === 'POST') {
      const {
        habit_id, reminder_time, notification_status, alerts, custom_text, routine_window, days_of_week
      } = req.body ?? {};
      if (!habit_id) return res.status(400).json({ error: 'habit_id is required' });
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

      let { data, error } = await supabase.from('reminders').insert(payload).select('*, habits(habit_name)').single();
      if (error && error.message?.includes('column')) {
        const fallbackPayload = { user_id, habit_id, reminder_time: mainTime, notification_status: notification_status || 'Active' };
        const fallbackRes = await supabase.from('reminders').insert(fallbackPayload).select('*, habits(habit_name)').single();
        if (fallbackRes.error) throw fallbackRes.error;
        data = { ...fallbackRes.data, ...payload };
      } else if (error) {
        throw error;
      }

      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const {
        id, habit_id, reminder_time, notification_status, alerts, custom_text, routine_window, days_of_week
      } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for update' });
      const mainTime = reminder_time || (Array.isArray(alerts) && alerts.length > 0 ? alerts[0] : '08:00');

      const updatePayload = {
        habit_id,
        reminder_time: mainTime,
        notification_status,
        ...(alerts !== undefined && { alerts }),
        ...(custom_text !== undefined && { custom_text }),
        ...(routine_window !== undefined && { routine_window }),
        ...(days_of_week !== undefined && { days_of_week })
      };

      let { data, error } = await supabase
        .from('reminders')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user_id)
        .select('*, habits(habit_name)')
        .single();

      if (error && error.message?.includes('column')) {
        const fallbackPayload = { habit_id, reminder_time: mainTime, notification_status };
        const fallbackRes = await supabase
          .from('reminders')
          .update(fallbackPayload)
          .eq('id', id)
          .eq('user_id', user_id)
          .select('*, habits(habit_name)')
          .single();
        if (fallbackRes.error) throw fallbackRes.error;
        data = { ...fallbackRes.data, ...updatePayload };
      } else if (error) {
        throw error;
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
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/reminders] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
