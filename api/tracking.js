import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';
import { getUserTimeZone, getDateInTimeZone } from './date-utils.js';

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
      const {
        habit_id,
        completion_date,
        status,
        action,
        amount,
        note,
        mood,
        completion_source = 'manual',
        completion_ref_id = null
      } = req.body ?? {};
      if (!habit_id) return res.status(400).json({ error: 'habit_id is required' });
      if (!completion_date) return res.status(400).json({ error: 'completion_date is required' });

      // Security check: Never allow logging completion for future dates
      const timeZone = getUserTimeZone(req, user);
      const today = getDateInTimeZone(new Date(), timeZone);
      if (completion_date > today && (status === true || action === 'complete' || action === 'add' || action === 'set')) {
        return res.status(400).json({ error: 'Cannot mark habits as completed for future dates' });
      }

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

      let newStatus = status !== undefined ? Boolean(status) : true;
      let newQuantity = existing?.quantity_completed || 0;

      if (habit.tracking_type === 'quantity') {
        const target = Number(habit.target_quantity) || 1;
        if (action === 'reset' || status === false) {
          newQuantity = 0;
          newStatus = false;
        } else if (action === 'complete' || (status === true && (amount === undefined || amount === null) && !action)) {
          // Explicit "mark complete" action (from Alarm Takeover Modal, Calendar, etc.)
          newQuantity = target;
          newStatus = true;
        } else if (action === 'set') {
          const val = Number(amount);
          newQuantity = Number.isFinite(val) ? Math.max(0, val) : target;
          newStatus = newQuantity >= target;
        } else {
          // Increment or add
          const inc = Number(amount);
          if (Number.isFinite(inc)) {
            newQuantity = Math.max(0, newQuantity + inc);
          } else if (status === true) {
            newQuantity = target;
          }
          newStatus = newQuantity >= target;
        }
      }

      // If habit is marked completed, automatically resolve pending re-pings for today
      if (newStatus === true) {
        try {
          await supabase
            .from('reminder_events')
            .update({ event_type: 'completed', next_reping_at: null })
            .eq('user_id', user_id)
            .eq('habit_id', habit_id)
            .eq('event_date', completion_date);
        } catch (repingCleanErr) {
          console.warn('[/api/tracking] Error updating reminder_events:', repingCleanErr);
        }
      }

      // Save tracking record: update existing record if found, otherwise insert
      const recordPayload = {
        user_id,
        habit_id,
        completion_date,
        status: newStatus,
        quantity_completed: newQuantity,
        completion_source,
        ...(completion_ref_id && { completion_ref_id })
      };
      if (note !== undefined) recordPayload.note = note;
      if (mood !== undefined) recordPayload.mood = mood;

      let data, error;

      const attemptSave = async (payloadToUse) => {
        if (existing?.id) {
          return await supabase
            .from('habit_tracking')
            .update(payloadToUse)
            .eq('id', existing.id)
            .select()
            .single();
        } else {
          const insertRes = await supabase
            .from('habit_tracking')
            .insert(payloadToUse)
            .select()
            .single();

          if (insertRes.error && (insertRes.error.code === '23505' || insertRes.error.message?.includes('duplicate'))) {
            return await supabase
              .from('habit_tracking')
              .update(payloadToUse)
              .eq('habit_id', habit_id)
              .eq('completion_date', completion_date)
              .eq('user_id', user_id)
              .select()
              .single();
          }
          return insertRes;
        }
      };

      const result = await attemptSave(recordPayload);
      data = result.data;
      error = result.error;

      // Graceful fallback if new columns don't exist yet in PostgreSQL schema
      if (error && (error.code === 'PGRST204' || error.code === '42703')) {
        const fallbackPayload = {
          user_id,
          habit_id,
          completion_date,
          status: newStatus,
          quantity_completed: newQuantity
        };
        if (note !== undefined) fallbackPayload.note = note;
        if (mood !== undefined) fallbackPayload.mood = mood;

        const retry = await attemptSave(fallbackPayload);
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        console.error('[/api/tracking] Save error:', error);
        return res.status(500).json({ error: error.message || 'Failed to save tracking record' });
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
