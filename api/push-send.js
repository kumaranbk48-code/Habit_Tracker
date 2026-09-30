import webPush from 'web-push';
import supabase from './db-client.js';
import { applyCors } from './cors.js';

if (process.env.VAPID_EMAIL && process.env.VITE_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  try {
    webPush.setVapidDetails(
      process.env.VAPID_EMAIL,
      process.env.VITE_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
  } catch (err) {
    console.warn('[Push] VAPID initialization warning:', err.message);
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  // Verify cron secret for background trigger
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing cron secret' });
  }

  try {
    const now = new Date();

    // Query all active reminders with their joined entities
    const { data: reminders, error: remErr } = await supabase
      .from('reminders')
      .select(`
        *,
        habits(id, habit_name),
        goals(id, goal_name, target_date, status),
        learning_journeys:journey_id(id, title, target_date, status),
        learning_topics:topic_id(id, title, target_date, status)
      `)
      .eq('notification_status', 'Active');

    if (remErr || !reminders?.length) {
      return res.status(200).json({ sent: 0, message: 'No active reminders found' });
    }

    // Query all push subscriptions
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (subErr || !subs?.length) {
      return res.status(200).json({ sent: 0, message: 'No push subscriptions registered' });
    }

    const subsByUser = {};
    for (const s of subs) {
      if (!subsByUser[s.user_id]) subsByUser[s.user_id] = [];
      subsByUser[s.user_id].push(s);
    }

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let sent = 0;
    const stale = [];

    for (const reminder of reminders) {
      const userSubs = subsByUser[reminder.user_id] || [];
      if (!userSubs.length) continue;

      // Extract user timezone or fallback
      const userTz = req.headers['x-timezone'] || 'UTC';
      let userNow;
      try {
        const userTimeStr = new Intl.DateTimeFormat('en-US', {
          timeZone: userTz,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: false,
        }).format(now);
        const [, timePart] = userTimeStr.split(', ');
        const [uH, uM] = timePart.split(':');
        userNow = {
          currentTime: `${uH.padStart(2, '0')}:${uM.padStart(2, '0')}`,
          dayName: dayNames[now.getDay()],
        };
      } catch {
        const hh = String(now.getUTCHours()).padStart(2, '0');
        const mm = String(now.getUTCMinutes()).padStart(2, '0');
        userNow = {
          currentTime: `${hh}:${mm}`,
          dayName: dayNames[now.getUTCDay()],
        };
      }

      const isDeadlineMode = reminder.reminder_mode === 'deadline_proximity';

      // Check time match (either reminder_time or within alerts list)
      const alertsList = Array.isArray(reminder.alerts) && reminder.alerts.length > 0
        ? reminder.alerts
        : [reminder.reminder_time];

      const timeMatches = alertsList.some((t) => t && t.slice(0, 5) === userNow.currentTime);
      if (!timeMatches) continue;

      // Check day / deadline eligibility
      if (isDeadlineMode) {
        const targetDateStr = reminder.goals?.target_date || reminder.learning_topics?.target_date || reminder.learning_journeys?.target_date;
        if (!targetDateStr) continue;
        const days = Number(reminder.days_before_deadline) || 0;
        const checkDate = new Date(now);
        checkDate.setDate(checkDate.getDate() + days);
        const checkYMD = checkDate.toISOString().split('T')[0];
        if (targetDateStr !== checkYMD) continue;
      } else {
        if (Array.isArray(reminder.days_of_week) && reminder.days_of_week.length > 0) {
          if (!reminder.days_of_week.includes(userNow.dayName)) continue;
        }
      }

      // Build Notification Content specifying Category & Exact Name
      const type = reminder.target_type || 'habit';
      let title = '🔔 HabitTracker Reminder';
      let body = reminder.custom_text || 'You have an active reminder.';
      let url = '/dashboard';

      if (type === 'habit') {
        const habitName = reminder.habits?.habit_name || 'Habit';
        title = `🔥 Habit: ${habitName}`;
        body = reminder.custom_text
          ? `${reminder.custom_text} • Habit: ${habitName}`
          : `Time to complete your habit "${habitName}"! Keep your streak going.`;
        url = '/habits';
      } else if (type === 'goal') {
        const goalName = reminder.goals?.goal_name || 'Goal';
        if (isDeadlineMode) {
          const days = Number(reminder.days_before_deadline) || 0;
          title = `🎯 Goal Deadline: ${goalName}`;
          body = reminder.custom_text || (days === 0
            ? `🚨 Today is the target deadline for Goal: "${goalName}"!`
            : days === 1
            ? `🚨 Tomorrow is the final day for Goal: "${goalName}"!`
            : `⏳ Only ${days} days remaining for Goal: "${goalName}"!`);
        } else {
          title = `🎯 Goal: ${goalName}`;
          body = reminder.custom_text
            ? `${reminder.custom_text} • Goal: ${goalName}`
            : `Time to log progress for Goal: "${goalName}"!`;
        }
        url = '/goals';
      } else if (type === 'learning_journey' || type === 'learning_topic') {
        const topicName = reminder.learning_topics?.title || reminder.learning_journeys?.title || 'Study Session';
        if (isDeadlineMode) {
          title = `📚 Learning Hub: ${topicName}`;
          body = reminder.custom_text || `Target deadline approaching for Learning Roadmap: "${topicName}"!`;
        } else {
          title = `📚 Learning Hub: ${topicName}`;
          body = reminder.custom_text
            ? `${reminder.custom_text} • Topic: ${topicName}`
            : `Time for your Learning Hub study session on "${topicName}"!`;
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

    if (stale.length) {
      await supabase.from('push_subscriptions').delete().in('endpoint', stale);
    }

    return res.status(200).json({ sent, staleCleaned: stale.length });
  } catch (err) {
    console.error('[/api/push-send] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
