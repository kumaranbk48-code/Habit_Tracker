import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';

const columnCache = new Map();

async function hasColumn(table, column) {
  const cacheKey = `${table}.${column}`;
  if (columnCache.has(cacheKey)) return columnCache.get(cacheKey);

  const { error } = await supabase.from(table).select(column).limit(0);
  const exists = !error;
  columnCache.set(cacheKey, exists);
  return exists;
}

async function sanitizePayload(table, payload) {
  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    // Always keep standard base columns
    if ([
      'user_id', 'id', 'target_type', 'habit_id', 'goal_id', 'journey_id',
      'topic_id', 'reminder_mode', 'days_before_deadline', 'reminder_time', 'notification_status'
    ].includes(key)) {
      sanitized[key] = value;
      continue;
    }
    const exists = await hasColumn(table, key);
    if (exists) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

const REMINDER_SELECT = `
  *,
  habits(id, habit_name, color, icon),
  goals(id, goal_name, target_date, status),
  learning_journeys:journey_id(id, title, target_date, status),
  learning_topics:topic_id(id, title, target_date, status)
`;

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token — please sign in again' });
  const user_id = user.id;

  try {
    // ── GET: Fetch reminders (with optional target_type filter) ────────────────
    if (req.method === 'GET') {
      const targetType = req.query?.target_type;

      // Attempt polymorphic select with joined relations
      try {
        let query = supabase
          .from('reminders')
          .select(REMINDER_SELECT)
          .eq('user_id', user_id)
          .order('reminder_time', { ascending: true });

        if (targetType && ['habit', 'goal', 'learning_journey', 'learning_topic'].includes(targetType)) {
          query = query.eq('target_type', targetType);
        }

        const { data, error } = await query;

        if (!error && data) {
          return res.status(200).json(data);
        }

        // If schema hasn't been migrated yet (e.g. column target_type or relations missing / PGRST200)
        if (error) {
          console.warn('[/api/reminders] Enhanced select failed, attempting fallback to habit reminders schema:', error.message || error);
          try {
            const legacyQuery = await supabase
              .from('reminders')
              .select('*, habits(id, habit_name, color, icon)')
              .eq('user_id', user_id)
              .order('reminder_time', { ascending: true });

            if (legacyQuery.data) {
              const fallbackData = (legacyQuery.data || []).map(r => ({
                ...r,
                target_type: r.target_type || 'habit',
                reminder_mode: r.reminder_mode || 'scheduled',
                days_before_deadline: r.days_before_deadline || 0,
              }));

              return res.status(200).json(fallbackData);
            }
          } catch (legacyErr) {
            console.error('[/api/reminders] Legacy query exception:', legacyErr);
          }

          console.error('[/api/reminders] GET error:', error);
          return res.status(500).json({ error: 'Failed to retrieve reminders' });
        }
      } catch (err) {
        console.error('[/api/reminders] GET query exception:', err);
        return res.status(500).json({ error: 'Failed to retrieve reminders' });
      }
    }

    // ── POST: Create new reminder (Habit, Goal, or Learning Roadmap) ───────────
    if (req.method === 'POST') {
      const {
        target_type = 'habit',
        habit_id,
        goal_id,
        journey_id,
        topic_id,
        reminder_mode = 'scheduled',
        days_before_deadline = 0,
        reminder_time,
        notification_status = 'Active',
        alerts,
        custom_text,
        routine_window = 'Morning',
        days_of_week = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      } = req.body ?? {};

      // 1. Validate Target Entity Ownership
      if (target_type === 'habit') {
        if (!habit_id) return res.status(400).json({ error: 'habit_id is required for habit reminders' });
        const { data: habit, error: habitErr } = await supabase
          .from('habits').select('id, habit_name').eq('id', habit_id).eq('user_id', user_id).maybeSingle();
        if (habitErr || !habit) return res.status(404).json({ error: 'Habit not found or access denied' });
      } else if (target_type === 'goal') {
        if (!goal_id) return res.status(400).json({ error: 'goal_id is required for goal reminders' });
        const { data: goal, error: goalErr } = await supabase
          .from('goals').select('id, goal_name, target_date').eq('id', goal_id).eq('user_id', user_id).maybeSingle();
        if (goalErr || !goal) return res.status(404).json({ error: 'Goal not found or access denied' });
      } else if (target_type === 'learning_journey') {
        if (!journey_id) return res.status(400).json({ error: 'journey_id is required for learning roadmap reminders' });
        const { data: journey, error: journeyErr } = await supabase
          .from('learning_journeys').select('id, title, target_date').eq('id', journey_id).eq('user_id', user_id).maybeSingle();
        if (journeyErr || !journey) return res.status(404).json({ error: 'Learning journey not found or access denied' });
      } else if (target_type === 'learning_topic') {
        if (!topic_id) return res.status(400).json({ error: 'topic_id is required for topic reminders' });
        const { data: topic, error: topicErr } = await supabase
          .from('learning_topics').select('id, title, target_date').eq('id', topic_id).eq('user_id', user_id).maybeSingle();
        if (topicErr || !topic) return res.status(404).json({ error: 'Learning topic not found or access denied' });
      } else {
        return res.status(400).json({ error: 'Invalid target_type. Must be habit, goal, learning_journey, or learning_topic' });
      }

      const mainTime = reminder_time || (Array.isArray(alerts) && alerts.length > 0 ? alerts[0] : '09:00');

      const rawPayload = {
        user_id,
        target_type,
        habit_id: target_type === 'habit' ? habit_id : null,
        goal_id: target_type === 'goal' ? goal_id : null,
        journey_id: target_type === 'learning_journey' ? journey_id : null,
        topic_id: target_type === 'learning_topic' ? topic_id : null,
        reminder_mode,
        days_before_deadline: Number(days_before_deadline) || 0,
        reminder_time: mainTime,
        notification_status,
        alerts: Array.isArray(alerts) ? alerts : [mainTime],
        custom_text: custom_text || '',
        routine_window,
        days_of_week: Array.isArray(days_of_week) ? days_of_week : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      };

      const payload = await sanitizePayload('reminders', rawPayload);

      let { data, error } = await supabase
        .from('reminders')
        .insert(payload)
        .select(REMINDER_SELECT)
        .single();

      // Retry with minimal columns if schema cache error occurs
      if (error && (error.code === 'PGRST204' || error.code === '42703')) {
        console.warn('[/api/reminders] POST schema mismatch, retrying with base columns:', error.message);
        const basePayload = {
          user_id,
          target_type,
          habit_id: target_type === 'habit' ? habit_id : null,
          goal_id: target_type === 'goal' ? goal_id : null,
          journey_id: target_type === 'learning_journey' ? journey_id : null,
          topic_id: target_type === 'learning_topic' ? topic_id : null,
          reminder_mode,
          days_before_deadline: Number(days_before_deadline) || 0,
          reminder_time: mainTime,
          notification_status
        };
        const retryRes = await supabase
          .from('reminders')
          .insert(basePayload)
          .select(REMINDER_SELECT)
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error) {
        console.error('[/api/reminders] POST error:', error);
        return res.status(500).json({ error: error.message || 'Failed to create reminder' });
      }

      return res.status(201).json({ ...rawPayload, ...data });
    }

    // ── PUT: Update existing reminder ─────────────────────────────────────────
    if (req.method === 'PUT') {
      const {
        id,
        target_type,
        habit_id,
        goal_id,
        journey_id,
        topic_id,
        reminder_mode,
        days_before_deadline,
        reminder_time,
        notification_status,
        alerts,
        custom_text,
        routine_window,
        days_of_week,
      } = req.body ?? {};

      if (!id) return res.status(400).json({ error: 'id is required for update' });

      // Verify the reminder exists and belongs to this user
      const { data: existing, error: findErr } = await supabase
        .from('reminders')
        .select('id, target_type, habit_id, goal_id, journey_id, topic_id')
        .eq('id', id)
        .eq('user_id', user_id)
        .maybeSingle();

      if (findErr || !existing) {
        return res.status(404).json({ error: 'Reminder not found or access denied' });
      }

      // If target entity changed, verify ownership
      const effectiveType = target_type || existing.target_type || 'habit';
      if (effectiveType === 'habit' && habit_id) {
        const { data: h } = await supabase.from('habits').select('id').eq('id', habit_id).eq('user_id', user_id).maybeSingle();
        if (!h) return res.status(404).json({ error: 'Target habit not found' });
      } else if (effectiveType === 'goal' && goal_id) {
        const { data: g } = await supabase.from('goals').select('id').eq('id', goal_id).eq('user_id', user_id).maybeSingle();
        if (!g) return res.status(404).json({ error: 'Target goal not found' });
      } else if (effectiveType === 'learning_journey' && journey_id) {
        const { data: j } = await supabase.from('learning_journeys').select('id').eq('id', journey_id).eq('user_id', user_id).maybeSingle();
        if (!j) return res.status(404).json({ error: 'Target journey not found' });
      } else if (effectiveType === 'learning_topic' && topic_id) {
        const { data: t } = await supabase.from('learning_topics').select('id').eq('id', topic_id).eq('user_id', user_id).maybeSingle();
        if (!t) return res.status(404).json({ error: 'Target topic not found' });
      }

      const mainTime = reminder_time || (Array.isArray(alerts) && alerts.length > 0 ? alerts[0] : undefined);
      const rawUpdatePayload = {
        ...(target_type && { target_type }),
        ...(habit_id !== undefined && { habit_id }),
        ...(goal_id !== undefined && { goal_id }),
        ...(journey_id !== undefined && { journey_id }),
        ...(topic_id !== undefined && { topic_id }),
        ...(reminder_mode && { reminder_mode }),
        ...(days_before_deadline !== undefined && { days_before_deadline: Number(days_before_deadline) }),
        ...(mainTime && { reminder_time: mainTime }),
        ...(notification_status !== undefined && { notification_status }),
        ...(alerts !== undefined && { alerts }),
        ...(custom_text !== undefined && { custom_text }),
        ...(routine_window !== undefined && { routine_window }),
        ...(days_of_week !== undefined && { days_of_week }),
      };

      const updatePayload = await sanitizePayload('reminders', rawUpdatePayload);

      let { data, error } = await supabase
        .from('reminders')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user_id)
        .select(REMINDER_SELECT)
        .single();

      // Retry with minimal columns if schema cache error occurs
      if (error && (error.code === 'PGRST204' || error.code === '42703')) {
        console.warn('[/api/reminders] PUT schema mismatch, retrying with base columns:', error.message);
        const fallbackUpdate = {
          ...(target_type && { target_type }),
          ...(habit_id !== undefined && { habit_id }),
          ...(goal_id !== undefined && { goal_id }),
          ...(journey_id !== undefined && { journey_id }),
          ...(topic_id !== undefined && { topic_id }),
          ...(reminder_mode && { reminder_mode }),
          ...(days_before_deadline !== undefined && { days_before_deadline: Number(days_before_deadline) }),
          ...(mainTime && { reminder_time: mainTime }),
          ...(notification_status !== undefined && { notification_status })
        };
        const retryRes = await supabase
          .from('reminders')
          .update(fallbackUpdate)
          .eq('id', id)
          .eq('user_id', user_id)
          .select(REMINDER_SELECT)
          .single();
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error) {
        console.error('[/api/reminders] PUT error:', error);
        return res.status(500).json({ error: error.message || 'Failed to update reminder' });
      }

      return res.status(200).json({ ...rawUpdatePayload, ...data });
    }

    // ── DELETE: Delete reminder ───────────────────────────────────────────────
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
