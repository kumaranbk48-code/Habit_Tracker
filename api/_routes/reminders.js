import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';
import { getDateInTimeZone, getUserTimeZone } from './date-utils.js';

const columnCache = new Map();
const idempotencyCache = new Map();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function resetColumnCache() {
  columnCache.clear();
}

function isValidYMD(str) {
  if (typeof str !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str.trim());
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return !Number.isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

function formatDDMonYYYY(ymd) {
  if (!isValidYMD(ymd)) return String(ymd || '');
  const [y, m, d] = ymd.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTH_ABBR[m - 1]} ${y}`;
}

export function validateDeadlineFields({ reminderMode, remindOnDate, targetDate, todayLocal }) {
  if (reminderMode !== 'deadline_proximity') return { valid: true };

  if (remindOnDate !== undefined && remindOnDate !== null && String(remindOnDate).trim() !== '') {
    const cleanDate = String(remindOnDate).trim();
    if (!isValidYMD(cleanDate)) {
      return { valid: false, status: 400, error: 'Invalid remind_on_date format. Use YYYY-MM-DD.' };
    }
    if (todayLocal && cleanDate < todayLocal) {
      return { valid: false, status: 400, error: 'Reminder date cannot be in the past.' };
    }
    if (targetDate && isValidYMD(targetDate) && cleanDate > targetDate) {
      return {
        valid: false,
        status: 400,
        error: `Pick a date on or before the deadline (${formatDDMonYYYY(targetDate)})`,
      };
    }
    return { valid: true, remindOnDate: cleanDate };
  }

  if (!targetDate) {
    return {
      valid: false,
      status: 400,
      error: 'This goal has no deadline yet. Pick a date for the reminder or switch to Recurring Routine.',
    };
  }
  return { valid: true, remindOnDate: null };
}

async function hasColumn(table, column) {
  const cacheKey = `${table}.${column}`;
  if (columnCache.has(cacheKey)) return columnCache.get(cacheKey);

  try {
    const q = supabase.from(table).select(column);
    const { error } = typeof q?.limit === 'function' ? await q.limit(0) : await q;
    const exists = !error;
    columnCache.set(cacheKey, exists);
    return exists;
  } catch {
    return false;
  }
}

async function sanitizePayload(table, payload) {
  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    // Always keep standard base columns
    if ([
      'user_id', 'id', 'target_type', 'habit_id', 'goal_id', 'journey_id',
      'topic_id', 'reminder_mode', 'days_before_deadline', 'reminder_time',
      'notification_status', 'is_alarm', 'alerts', 'custom_text', 'routine_window', 'days_of_week'
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

function cleanTime(val) {
  if (!val) return null;
  const str = typeof val === 'string' ? val : (val.target?.value || val.value || '');
  const clean = String(str).replace(/[{}"'\s]/g, '').trim();
  if (clean.includes(':')) {
    const parts = clean.split(':');
    const h = String(parseInt(parts[0], 10) || 0).padStart(2, '0');
    const m = String(parseInt(parts[1], 10) || 0).padStart(2, '0');
    return `${h}:${m}`;
  }
  return null;
}

const REMINDER_SELECT = `
  *,
  habits(id, habit_name, color, icon, tracking_type, target_quantity, unit),
  goals(id, goal_name, target_date, status),
  goal_milestones:milestone_id(id, title, completed, goal_id),
  learning_journeys:journey_id(id, title, target_date, status),
  learning_topics:topic_id(id, title, target_date, status, journey_id)
`;

const REMINDER_SELECT_NO_MILESTONE = `
  *,
  habits(id, habit_name, color, icon, tracking_type, target_quantity, unit),
  goals(id, goal_name, target_date, status),
  learning_journeys:journey_id(id, title, target_date, status),
  learning_topics:topic_id(id, title, target_date, status, journey_id)
`;

function stripOptionalExtendedFields(payload) {
  const copy = { ...payload };
  delete copy.milestone_id;
  delete copy.remind_on_date;
  return copy;
}

async function fetchUserGoalMilestoneCounts(user_id) {
  try {
    const { data, error } = await supabase
      .from('goal_milestones')
      .select('goal_id')
      .eq('user_id', user_id);
    if (error || !Array.isArray(data)) return new Set();
    return new Set(data.map((m) => m.goal_id).filter(Boolean));
  } catch {
    return new Set();
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token — please sign in again' });
  const user_id = user.id;
  const userTz = getUserTimeZone(req, user);
  const todayLocal = getDateInTimeZone(new Date(), userTz);

  try {
    // ── GET: Fetch reminders (with optional target_type filter or reping_status) ────────────────
    if (req.method === 'GET') {
      if (req.query?.action === 'reping_status') {
        try {
          const { data } = await supabase
            .from('reminder_events')
            .select('*')
            .eq('user_id', user_id)
            .eq('event_date', todayLocal)
            .order('created_at', { ascending: false });
          return res.status(200).json(data || []);
        } catch {
          return res.status(200).json([]);
        }
      }

      const targetType = req.query?.target_type;
      const rawLimit = parseInt(req.query?.limit, 10);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 1000;
      const rawPage = parseInt(req.query?.page, 10);
      const rawOffset = parseInt(req.query?.offset, 10);
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0
        ? rawOffset
        : (Number.isFinite(rawPage) && rawPage > 0 ? (rawPage - 1) * limit : 0);

      // Attempt polymorphic select with joined relations (including goal_milestones)
      try {
        let query = supabase
          .from('reminders')
          .select(REMINDER_SELECT, { count: 'exact' })
          .eq('user_id', user_id)
          .order('reminder_time', { ascending: true })
          .range(offset, offset + limit - 1);

        if (targetType && ['habit', 'goal', 'learning_journey', 'learning_topic'].includes(targetType)) {
          query = query.eq('target_type', targetType);
        }

        let { data, error, count } = await query;

        // If milestone_id migration isn't applied yet, retry polymorphic select without goal_milestones
        if (error) {
          let fallbackPoly = supabase
            .from('reminders')
            .select(REMINDER_SELECT_NO_MILESTONE, { count: 'exact' })
            .eq('user_id', user_id)
            .order('reminder_time', { ascending: true })
            .range(offset, offset + limit - 1);
          if (targetType && ['habit', 'goal', 'learning_journey', 'learning_topic'].includes(targetType)) {
            fallbackPoly = fallbackPoly.eq('target_type', targetType);
          }
          const polyRes = await fallbackPoly;
          if (!polyRes.error && polyRes.data) {
            data = polyRes.data;
            count = polyRes.count;
            error = null;
          }
        }

        if (!error && data) {
          if (count !== null && count !== undefined) {
            res.setHeader('X-Total-Count', String(count));
            res.setHeader('X-Limit', String(limit));
            res.setHeader('X-Offset', String(offset));
          }
          const goalsWithMilestones = await fetchUserGoalMilestoneCounts(user_id);
          const mapped = data.map((r) => ({
            ...r,
            reminder_mode: r.reminder_mode === 'alarm' ? 'scheduled' : (r.reminder_mode || 'scheduled'),
            is_alarm: Boolean(r.is_alarm || r.reminder_mode === 'alarm'),
            ...(r.goal_id ? { goal_has_milestones: goalsWithMilestones.has(r.goal_id) } : {}),
          }));
          return res.status(200).json(mapped);
        }

        // If schema hasn't been migrated yet (e.g. column target_type or relations missing / PGRST200)
        if (error) {
          console.warn('[/api/reminders] Enhanced select failed, attempting fallback to habit reminders schema:', error.message || error);
          try {
            const legacyQuery = await supabase
              .from('reminders')
              .select('*, habits(id, habit_name, color, icon, tracking_type, target_quantity, unit)')
              .eq('user_id', user_id)
              .order('reminder_time', { ascending: true });

            if (legacyQuery.data) {
              const fallbackData = (legacyQuery.data || []).map((r) => ({
                ...r,
                target_type: r.target_type || 'habit',
                reminder_mode: r.reminder_mode || 'scheduled',
                days_before_deadline: r.days_before_deadline || 0,
                is_alarm: Boolean(r.is_alarm || r.reminder_mode === 'alarm'),
              }));

              return res.status(200).json(fallbackData);
            }
          } catch (legacyErr) {
            console.error('[/api/reminders] Legacy query exception:', legacyErr);
          }

          // Second fallback: plain select without table relations
          try {
            const plainQuery = await supabase
              .from('reminders')
              .select('*')
              .eq('user_id', user_id)
              .order('reminder_time', { ascending: true });

            if (plainQuery.data) {
              const fallbackData = (plainQuery.data || []).map((r) => ({
                ...r,
                target_type: r.target_type || 'habit',
                reminder_mode: r.reminder_mode || 'scheduled',
                days_before_deadline: r.days_before_deadline || 0,
                is_alarm: Boolean(r.is_alarm || r.reminder_mode === 'alarm'),
              }));
              return res.status(200).json(fallbackData);
            }
          } catch (plainErr) {
            console.error('[/api/reminders] Plain query exception:', plainErr);
          }

          console.error('[/api/reminders] GET error:', error);
          return res.status(200).json([]);
        }
      } catch (err) {
        console.error('[/api/reminders] GET query exception:', err);
        return res.status(200).json([]);
      }
    }

    // ── POST: Create new reminder or handle skip action ─────────────────────────
    if (req.method === 'POST') {
      if (req.body?.action === 'skip') {
        const { reminder_id, habit_id, delay_minutes } = req.body;
        if (!habit_id) return res.status(400).json({ error: 'habit_id is required for skip' });

        const REPING_DELAY_MINUTES = Number(delay_minutes) > 0 ? Number(delay_minutes) : 25;
        const maxRepings = 3;

        // Verify habit exists and belongs to user
        const { data: habitRecord } = await supabase
          .from('habits')
          .select('id')
          .eq('id', habit_id)
          .eq('user_id', user_id)
          .maybeSingle();

        if (!habitRecord) {
          return res.status(404).json({ error: 'Habit not found' });
        }

        // Verify reminder_id actually exists in reminders table before using as FK
        let validReminderId = null;
        if (reminder_id) {
          const { data: remCheck } = await supabase
            .from('reminders')
            .select('id')
            .eq('id', reminder_id)
            .eq('user_id', user_id)
            .maybeSingle();
          if (remCheck) validReminderId = remCheck.id;
        }

        let skipCount = 1;
        try {
          const { data: existingEvents } = await supabase
            .from('reminder_events')
            .select('*')
            .eq('user_id', user_id)
            .eq('habit_id', habit_id)
            .eq('event_date', todayLocal);

          if (Array.isArray(existingEvents)) {
            skipCount = existingEvents.filter(e => e.event_type === 'skipped').length + 1;
          }
        } catch (err) {
          console.warn('[/api/reminders] Error checking reminder_events:', err);
        }

        let nextRepingAt = null;
        if (skipCount <= maxRepings) {
          nextRepingAt = new Date(Date.now() + REPING_DELAY_MINUTES * 60 * 1000).toISOString();
        }

        try {
          const { error: insErr } = await supabase.from('reminder_events').insert({
            user_id,
            reminder_id: validReminderId,
            habit_id,
            event_date: todayLocal,
            event_type: 'skipped',
            reping_count: skipCount,
            next_reping_at: nextRepingAt,
          });
          if (insErr) {
            console.error('[/api/reminders] Error inserting reminder_event:', insErr);
          }
        } catch (err) {
          console.warn('[/api/reminders] Error inserting reminder_event:', err);
        }

        return res.status(200).json({
          ok: true,
          reping_count: skipCount,
          max_reached: skipCount > maxRepings,
          next_reping_at: nextRepingAt,
          delay_minutes: REPING_DELAY_MINUTES,
        });
      }

      // Read X-Client-Idempotency-Key for offline replay deduplication (E14)
      const idempotencyKey = req.headers['x-client-idempotency-key'];
      if (idempotencyKey && typeof idempotencyKey === 'string') {
        const cacheKey = `${user_id}:${idempotencyKey}`;
        const cached = idempotencyCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < IDEMPOTENCY_TTL_MS) {
          return res.status(200).json(cached.response);
        }
      }

      const {
        target_type = 'habit',
        habit_id,
        goal_id,
        milestone_id = null,
        journey_id,
        topic_id,
        reminder_mode = 'scheduled',
        days_before_deadline = 0,
        remind_on_date = null,
        reminder_time,
        notification_status = 'Active',
        alerts,
        custom_text,
        routine_window = 'Morning',
        days_of_week = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        is_alarm = false,
      } = req.body ?? {};

      let entityTargetDate = null;
      let resolvedJourneyId = null;

      // 1. Validate Target Entity Ownership & Relations
      if (target_type === 'habit') {
        if (!habit_id) return res.status(400).json({ error: 'habit_id is required for habit reminders' });
        if (milestone_id) return res.status(400).json({ error: 'milestone_id is only valid for goal reminders' });
        const { data: habit, error: habitErr } = await supabase
          .from('habits').select('id, habit_name').eq('id', habit_id).eq('user_id', user_id).maybeSingle();
        if (habitErr || !habit) return res.status(404).json({ error: 'Habit not found or access denied' });
      } else if (target_type === 'goal') {
        if (!goal_id) return res.status(400).json({ error: 'goal_id is required for goal reminders' });
        const { data: goal, error: goalErr } = await supabase
          .from('goals').select('id, goal_name, target_date').eq('id', goal_id).eq('user_id', user_id).maybeSingle();
        if (goalErr || !goal) return res.status(404).json({ error: 'Goal not found or access denied' });
        entityTargetDate = goal.target_date || null;

        if (milestone_id) {
          const { data: ms, error: msErr } = await supabase
            .from('goal_milestones').select('id, goal_id').eq('id', milestone_id).eq('user_id', user_id).maybeSingle();
          if (msErr || !ms) return res.status(404).json({ error: 'Milestone not found or access denied' });
          if (ms.goal_id !== goal_id) {
            return res.status(400).json({ error: 'Milestone does not belong to the selected goal' });
          }
        }
      } else if (target_type === 'learning_journey') {
        if (!journey_id) return res.status(400).json({ error: 'journey_id is required for learning roadmap reminders' });
        if (milestone_id) return res.status(400).json({ error: 'milestone_id is only valid for goal reminders' });
        const { data: journey, error: journeyErr } = await supabase
          .from('learning_journeys').select('id, title, target_date').eq('id', journey_id).eq('user_id', user_id).maybeSingle();
        if (journeyErr || !journey) return res.status(404).json({ error: 'Learning journey not found or access denied' });
        entityTargetDate = journey.target_date || null;
        resolvedJourneyId = journey.id;
      } else if (target_type === 'learning_topic') {
        if (!topic_id) return res.status(400).json({ error: 'topic_id is required for topic reminders' });
        if (milestone_id) return res.status(400).json({ error: 'milestone_id is only valid for goal reminders' });
        const { data: topic, error: topicErr } = await supabase
          .from('learning_topics').select('id, title, target_date, journey_id').eq('id', topic_id).eq('user_id', user_id).maybeSingle();
        if (topicErr || !topic) return res.status(404).json({ error: 'Learning topic not found or access denied' });
        if (journey_id && topic.journey_id !== journey_id) {
          return res.status(400).json({ error: 'Topic does not belong to the selected learning journey' });
        }
        resolvedJourneyId = topic.journey_id || journey_id || null;
        entityTargetDate = topic.target_date || null;
        if (!entityTargetDate && resolvedJourneyId) {
          const { data: parentJourney } = await supabase
            .from('learning_journeys').select('target_date').eq('id', resolvedJourneyId).eq('user_id', user_id).maybeSingle();
          entityTargetDate = parentJourney?.target_date || null;
        }
      } else {
        return res.status(400).json({ error: 'Invalid target_type. Must be habit, goal, learning_journey, or learning_topic' });
      }

      const effectiveMode = ['scheduled', 'deadline_proximity', 'smart_nudge'].includes(reminder_mode)
        ? reminder_mode
        : (target_type === 'goal' ? 'deadline_proximity' : 'scheduled');

      const deadlineCheck = validateDeadlineFields({
        reminderMode: effectiveMode,
        remindOnDate: remind_on_date,
        targetDate: entityTargetDate,
        todayLocal,
      });
      if (!deadlineCheck.valid) {
        return res.status(deadlineCheck.status).json({ error: deadlineCheck.error });
      }

      const timeFromAlerts = Array.isArray(alerts) && alerts.length > 0 ? cleanTime(alerts[0]) : null;
      const mainTime = cleanTime(reminder_time) || timeFromAlerts || '08:00';
      const cleanAlerts = Array.isArray(alerts) && alerts.length > 0
        ? alerts.map(cleanTime).filter(Boolean)
        : [mainTime];

      const rawPayload = {
        user_id,
        target_type,
        habit_id: target_type === 'habit' ? (habit_id || null) : null,
        goal_id: target_type === 'goal' ? (goal_id || null) : null,
        milestone_id: target_type === 'goal' ? (milestone_id || null) : null,
        journey_id: (target_type === 'learning_journey' || target_type === 'learning_topic') ? resolvedJourneyId : null,
        topic_id: target_type === 'learning_topic' ? (topic_id || null) : null,
        reminder_mode: effectiveMode,
        days_before_deadline: deadlineCheck.remindOnDate ? 0 : (Number(days_before_deadline) || 0),
        remind_on_date: effectiveMode === 'deadline_proximity' ? (deadlineCheck.remindOnDate || null) : null,
        reminder_time: mainTime,
        notification_status: notification_status || 'Active',
        alerts: cleanAlerts.length > 0 ? cleanAlerts : [mainTime],
        custom_text: custom_text || '',
        routine_window: routine_window || 'Morning',
        days_of_week: Array.isArray(days_of_week) && days_of_week.length > 0 ? days_of_week : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        is_alarm: Boolean(is_alarm),
      };

      const payload = await sanitizePayload('reminders', rawPayload);

      let { data, error } = await supabase
        .from('reminders')
        .insert(payload)
        .select(REMINDER_SELECT)
        .single();

      // Fall back gracefully if schema migration hasn't been run yet or join fails
      if (error && (error.code === 'PGRST204' || error.code === '42703' || error.code === 'PGRST200')) {
        console.warn('[/api/reminders] POST schema fallback without extended columns:', error.message);
        const safePayload = stripOptionalExtendedFields(payload);
        const retryRes = await supabase
          .from('reminders')
          .insert(safePayload)
          .select(REMINDER_SELECT_NO_MILESTONE)
          .single();
        if (!retryRes.error) {
          data = retryRes.data;
          error = null;
        }
      }

      if (error) {
        console.warn('[/api/reminders] POST initial select failed, retrying with fallback select:', error.message);
        const retryRes = await supabase
          .from('reminders')
          .insert(payload)
          .select('*, habits(id, habit_name, color, icon)')
          .single();
        if (!retryRes.error) {
          data = retryRes.data;
          error = null;
        } else {
          const minimalRes = await supabase
            .from('reminders')
            .insert(stripOptionalExtendedFields(payload))
            .select('*')
            .single();
          if (!minimalRes.error) {
            data = minimalRes.data;
            error = null;
          }
        }
      }

      if (error) {
        console.error('[/api/reminders] POST error:', error);
        return res.status(500).json({ error: 'Failed to create reminder' });
      }

      const responseObj = { ...rawPayload, ...data };
      if (idempotencyKey && typeof idempotencyKey === 'string') {
        const cacheKey = `${user_id}:${idempotencyKey}`;
        idempotencyCache.set(cacheKey, { response: responseObj, timestamp: Date.now() });
        if (idempotencyCache.size > 1000) {
          const cutoff = Date.now() - IDEMPOTENCY_TTL_MS;
          for (const [k, v] of idempotencyCache.entries()) {
            if (v.timestamp < cutoff) idempotencyCache.delete(k);
          }
        }
      }

      return res.status(201).json(responseObj);
    }

    // ── PUT: Update existing reminder ─────────────────────────────────────────
    if (req.method === 'PUT') {
      const {
        id,
        target_type,
        habit_id,
        goal_id,
        milestone_id,
        journey_id,
        topic_id,
        reminder_mode,
        days_before_deadline,
        remind_on_date,
        reminder_time,
        notification_status,
        alerts,
        custom_text,
        routine_window,
        days_of_week,
        is_alarm,
      } = req.body ?? {};

      if (!id) return res.status(400).json({ error: 'id is required for update' });

      // Verify the reminder exists and belongs to this user
      const { data: existing, error: findErr } = await supabase
        .from('reminders')
        .select('*')
        .eq('id', id)
        .eq('user_id', user_id)
        .maybeSingle();

      if (findErr || !existing) {
        return res.status(404).json({ error: 'Reminder not found or access denied' });
      }

      const effectiveType = target_type || existing.target_type || 'habit';
      const effectiveHabitId = effectiveType === 'habit' ? (habit_id || existing.habit_id) : null;
      const effectiveGoalId = effectiveType === 'goal' ? (goal_id || existing.goal_id) : null;
      const goalChanged = effectiveType === 'goal' && goal_id !== undefined && goal_id !== existing.goal_id;
      const effectiveJourneyId =
        (effectiveType === 'learning_journey' || effectiveType === 'learning_topic')
          ? (journey_id || existing.journey_id)
          : null;
      const effectiveTopicId = effectiveType === 'learning_topic' ? (topic_id || existing.topic_id) : null;

      let effectiveMilestoneId = existing.milestone_id || null;
      if (effectiveType !== 'goal') {
        effectiveMilestoneId = null;
      } else if (milestone_id === null || milestone_id === '') {
        effectiveMilestoneId = null;
      } else if (milestone_id !== undefined) {
        effectiveMilestoneId = milestone_id;
      } else if (goalChanged) {
        // Clear stale milestone link when goal changes and no new milestone is explicitly selected
        effectiveMilestoneId = null;
      }

      let entityTargetDate = null;
      let resolvedJourneyId = effectiveJourneyId;

      if (effectiveType === 'habit' && effectiveHabitId) {
        const { data: h } = await supabase.from('habits').select('id').eq('id', effectiveHabitId).eq('user_id', user_id).maybeSingle();
        if (!h) return res.status(404).json({ error: 'Target habit not found' });
      } else if (effectiveType === 'goal' && effectiveGoalId) {
        const { data: g } = await supabase.from('goals').select('id, target_date').eq('id', effectiveGoalId).eq('user_id', user_id).maybeSingle();
        if (!g) return res.status(404).json({ error: 'Target goal not found' });
        entityTargetDate = g.target_date || null;

        if (effectiveMilestoneId) {
          const { data: ms } = await supabase
            .from('goal_milestones').select('id, goal_id').eq('id', effectiveMilestoneId).eq('user_id', user_id).maybeSingle();
          if (!ms) return res.status(404).json({ error: 'Milestone not found or access denied' });
          if (ms.goal_id !== effectiveGoalId) {
            return res.status(400).json({ error: 'Milestone does not belong to the selected goal' });
          }
        }
      } else if (effectiveType === 'learning_journey' && effectiveJourneyId) {
        const { data: j } = await supabase.from('learning_journeys').select('id, target_date').eq('id', effectiveJourneyId).eq('user_id', user_id).maybeSingle();
        if (!j) return res.status(404).json({ error: 'Target journey not found' });
        entityTargetDate = j.target_date || null;
      } else if (effectiveType === 'learning_topic' && effectiveTopicId) {
        const { data: t } = await supabase.from('learning_topics').select('id, target_date, journey_id').eq('id', effectiveTopicId).eq('user_id', user_id).maybeSingle();
        if (!t) return res.status(404).json({ error: 'Target topic not found' });
        if (effectiveJourneyId && t.journey_id && t.journey_id !== effectiveJourneyId) {
          return res.status(400).json({ error: 'Topic does not belong to the selected learning journey' });
        }
        resolvedJourneyId = t.journey_id || effectiveJourneyId || null;
        entityTargetDate = t.target_date || null;
        if (!entityTargetDate && resolvedJourneyId) {
          const { data: j } = await supabase.from('learning_journeys').select('target_date').eq('id', resolvedJourneyId).eq('user_id', user_id).maybeSingle();
          entityTargetDate = j?.target_date || null;
        }
      }

      const effectiveMode = reminder_mode && ['scheduled', 'deadline_proximity', 'smart_nudge'].includes(reminder_mode)
        ? reminder_mode
        : (existing.reminder_mode || (effectiveType === 'goal' ? 'deadline_proximity' : 'scheduled'));

      const effectiveRemindOnDate = remind_on_date !== undefined
        ? remind_on_date
        : existing.remind_on_date;

      const isStatusOnlyUpdate =
        notification_status !== undefined &&
        remind_on_date === undefined &&
        reminder_mode === undefined &&
        days_before_deadline === undefined &&
        goal_id === undefined &&
        journey_id === undefined &&
        topic_id === undefined &&
        reminder_time === undefined;

      const deactivating = notification_status === 'Done' || notification_status === 'Inactive';

      let cleanCustomDate = effectiveMode === 'deadline_proximity' ? (effectiveRemindOnDate || null) : null;
      if (
        effectiveMode === 'deadline_proximity' &&
        !isStatusOnlyUpdate &&
        !deactivating &&
        (remind_on_date !== undefined || reminder_mode !== undefined || days_before_deadline !== undefined || goalChanged)
      ) {
        const deadlineCheck = validateDeadlineFields({
          reminderMode: effectiveMode,
          remindOnDate: effectiveRemindOnDate,
          targetDate: entityTargetDate,
          todayLocal,
        });
        if (!deadlineCheck.valid) {
          return res.status(deadlineCheck.status).json({ error: deadlineCheck.error });
        }
        cleanCustomDate = deadlineCheck.remindOnDate;
      }

      const putTimeFromAlerts = Array.isArray(alerts) && alerts.length > 0 ? cleanTime(alerts[0]) : null;
      const putMainTime = cleanTime(reminder_time) || putTimeFromAlerts;
      const putCleanAlerts = Array.isArray(alerts) ? alerts.map(cleanTime).filter(Boolean) : undefined;

      const rawUpdatePayload = {
        target_type: effectiveType,
        habit_id: effectiveType === 'habit' ? (effectiveHabitId || null) : null,
        goal_id: effectiveType === 'goal' ? (effectiveGoalId || null) : null,
        milestone_id: effectiveType === 'goal' ? effectiveMilestoneId : null,
        journey_id: (effectiveType === 'learning_journey' || effectiveType === 'learning_topic') ? (resolvedJourneyId || null) : null,
        topic_id: effectiveType === 'learning_topic' ? (effectiveTopicId || null) : null,
        reminder_mode: effectiveMode,
        ...(days_before_deadline !== undefined && { days_before_deadline: cleanCustomDate ? 0 : Number(days_before_deadline) }),
        ...(remind_on_date !== undefined || effectiveMode !== 'deadline_proximity'
          ? { remind_on_date: effectiveMode === 'deadline_proximity' ? cleanCustomDate : null }
          : {}),
        ...(putMainTime && { reminder_time: putMainTime }),
        ...(notification_status !== undefined && { notification_status }),
        ...(putCleanAlerts !== undefined && { alerts: putCleanAlerts }),
        ...(custom_text !== undefined && { custom_text: custom_text || '' }),
        ...(routine_window !== undefined && { routine_window }),
        ...(days_of_week !== undefined && { days_of_week }),
        ...(is_alarm !== undefined && { is_alarm: Boolean(is_alarm) }),
      };

      const updatePayload = await sanitizePayload('reminders', rawUpdatePayload);

      let { data, error } = await supabase
        .from('reminders')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user_id)
        .select(REMINDER_SELECT)
        .single();

      if (error && (error.code === 'PGRST204' || error.code === '42703' || error.code === 'PGRST200')) {
        console.warn('[/api/reminders] PUT schema fallback without extended columns:', error.message);
        const retryRes = await supabase
          .from('reminders')
          .update(stripOptionalExtendedFields(updatePayload))
          .eq('id', id)
          .eq('user_id', user_id)
          .select(REMINDER_SELECT_NO_MILESTONE)
          .single();
        if (!retryRes.error) {
          data = retryRes.data;
          error = null;
        }
      }

      // Retry with simpler select if complex joined select encounters error
      if (error) {
        console.warn('[/api/reminders] PUT initial select failed, retrying with fallback select:', error.message);
        const retryRes = await supabase
          .from('reminders')
          .update(updatePayload)
          .eq('id', id)
          .eq('user_id', user_id)
          .select('*, habits(id, habit_name, color, icon)')
          .single();
        if (!retryRes.error) {
          data = retryRes.data;
          error = null;
        } else {
          const minimalRes = await supabase
            .from('reminders')
            .update(stripOptionalExtendedFields(updatePayload))
            .eq('id', id)
            .eq('user_id', user_id)
            .select('*')
            .single();
          if (!minimalRes.error) {
            data = minimalRes.data;
            error = null;
          }
        }
      }

      if (error) {
        console.error('[/api/reminders] PUT error:', error);
        return res.status(500).json({ error: 'Failed to update reminder' });
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
