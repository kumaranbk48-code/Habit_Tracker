import webPush from 'web-push';
import supabase from './db-client.js';
import { applyCors } from './cors.js';

if (process.env.VAPID_EMAIL && process.env.VITE_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // Secure with a secret so unauthorized callers cannot trigger mass push notifications
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing cron secret' });
  }

  try {
    const now = new Date();
    const hh  = String(now.getUTCHours()).padStart(2, '0');
    const mm  = String(now.getUTCMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;

    // Find all active reminders matching current time
    let reminders = [];
    try {
      const { data, error: remErr } = await supabase
        .from('reminders')
        .select(`
          *,
          habits(id, habit_name),
          goals(id, goal_name, target_date, status),
          learning_journeys:journey_id(id, title, target_date, status),
          learning_topics:topic_id(id, title, target_date, status)
        `)
        .eq('notification_status', 'Active')
        .eq('reminder_time', currentTime);

      if (remErr) {
        // Fallback to legacy habits schema if enhanced polymorphic query fails
        console.warn('[/api/push-send] Enhanced query failed, falling back to legacy habits query:', remErr.message);
        const legacyRes = await supabase
          .from('reminders')
          .select('*, habits(habit_name)')
          .eq('notification_status', 'Active')
          .eq('reminder_time', currentTime);
        reminders = (legacyRes.data || []).map(r => ({ ...r, target_type: 'habit' }));
      } else {
        reminders = data || [];
      }
    } catch (queryEx) {
      console.error('[/api/push-send] Query exception:', queryEx);
      return res.status(500).json({ error: 'Failed to query reminders' });
    }

    if (!reminders?.length) return res.status(200).json({ sent: 0 });

    // Validate days_of_week and deadline proximity
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = dayNames[now.getUTCDay()];
    const todayYMD = now.toISOString().split('T')[0];

    const activeReminders = reminders.filter(r => {
      // If deadline proximity mode, check if target date matches today + days_before_deadline
      if (r.reminder_mode === 'deadline_proximity') {
        const targetDateStr = r.goals?.target_date || r.learning_topics?.target_date || r.learning_journeys?.target_date;
        if (!targetDateStr) return false;
        const days = r.days_before_deadline || 0;
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() + days);
        const checkYMD = checkDate.toISOString().split('T')[0];
        return targetDateStr === checkYMD;
      }

      // Scheduled routine check
      if (!r.days_of_week || !Array.isArray(r.days_of_week) || r.days_of_week.length === 0) {
        return true;
      }
      return r.days_of_week.includes(currentDay);
    });

    if (!activeReminders.length) return res.status(200).json({ sent: 0, dayFiltered: true });

    const userIds = [...new Set(activeReminders.map(r => r.user_id))];

    // Get push subscriptions for these users
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds);

    if (subErr) {
      console.error('[/api/push-send] subscriptions query error:', subErr);
      return res.status(500).json({ error: 'Failed to retrieve push subscriptions' });
    }

    const subsByUser = {};
    for (const s of subs || []) {
      if (!subsByUser[s.user_id]) subsByUser[s.user_id] = [];
      subsByUser[s.user_id].push(s);
    }

    let sent = 0;
    const stale = [];

    for (const reminder of activeReminders) {
      const userSubs = subsByUser[reminder.user_id] || [];
      if (!userSubs.length) continue;

      let title = '🔔 Reminder';
      let body = reminder.custom_text || 'You have an active reminder scheduled.';
      let url = '/dashboard';

      const type = reminder.target_type || 'habit';

      if (type === 'habit') {
        title = '🔔 Habit Reminder';
        body = reminder.custom_text || `Time for: ${reminder.habits?.habit_name || 'your habit'}!`;
        url = '/habits';
      } else if (type === 'goal') {
        if (reminder.reminder_mode === 'deadline_proximity') {
          const days = reminder.days_before_deadline || 0;
          title = '⚠️ Goal Deadline Alert';
          body = days === 0
            ? `🚨 Today is the target deadline for "${reminder.goals?.goal_name || 'your goal'}"!`
            : days === 1
            ? `🚨 Tomorrow is the final day for "${reminder.goals?.goal_name || 'your goal'}"!`
            : `⏳ Only ${days} days remaining for "${reminder.goals?.goal_name || 'your goal'}"!`;
        } else {
          title = '🎯 Goal Check-in';
          body = reminder.custom_text || `Time to log progress for: ${reminder.goals?.goal_name || 'your goal'}!`;
        }
        url = '/goals';
      } else if (type === 'learning_journey' || type === 'learning_topic') {
        const itemTitle = reminder.learning_topics?.title || reminder.learning_journeys?.title || 'your learning roadmap';
        if (reminder.reminder_mode === 'deadline_proximity') {
          const days = reminder.days_before_deadline || 0;
          title = '⏳ Roadmap Deadline';
          body = days === 0
            ? `📚 Due Today: Complete "${itemTitle}" in your Learning Hub!`
            : `⏳ Due Tomorrow: Keep up the pace on "${itemTitle}"!`;
        } else {
          title = '📚 Study Session Reminder';
          body = reminder.custom_text || `Ready to learn? Continue: "${itemTitle}"!`;
        }
        url = '/learning';
      }

      for (const sub of userSubs) {
        const payload = JSON.stringify({
          title,
          body,
          tag: `reminder-${reminder.id}`,
          url,
          reminderId: reminder.id,
          targetType: type,
        });

        try {
          await webPush.sendNotification(sub.subscription, payload);
          sent++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            stale.push(sub.endpoint);
          } else {
            console.error('[push-send] webPush error:', err.message);
          }
        }
      }
    }

    // Clean up dead subscriptions
    if (stale.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', stale);
    }

    return res.status(200).json({ sent, staleCleaned: stale.length });
  } catch (err) {
    console.error('[/api/push-send] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
