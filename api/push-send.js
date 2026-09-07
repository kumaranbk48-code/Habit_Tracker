// Called by external cron (e.g. cron-job.org every minute, free plan) or manually.
// Checks reminders whose time matches the current minute and fires push notifications.
import webPush from 'web-push';
import supabase from './db-client.js';

webPush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // Secure with a secret so random people can't spam your users
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (secret !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Forbidden' });
  }

  try {
    const now = new Date();
    const hh  = String(now.getUTCHours()).padStart(2, '0');
    const mm  = String(now.getUTCMinutes()).padStart(2, '0');
    const currentTime = `${hh}:${mm}`;

    // Find all active reminders matching current time
    const { data: reminders, error: remErr } = await supabase
      .from('reminders')
      .select('*, habits(habit_name), users:user_id(id)')
      .eq('notification_status', 'Active')
      .eq('reminder_time', currentTime);

    if (remErr) throw remErr;
    if (!reminders?.length) return res.status(200).json({ sent: 0 });

    const userIds = [...new Set(reminders.map(r => r.user_id))];

    // Get push subscriptions for these users
    const { data: subs, error: subErr } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', userIds);

    if (subErr) throw subErr;

    const subsByUser = {};
    for (const s of subs || []) {
      if (!subsByUser[s.user_id]) subsByUser[s.user_id] = [];
      subsByUser[s.user_id].push(s);
    }

    let sent = 0;
    const stale = [];

    for (const reminder of reminders) {
      const userSubs = subsByUser[reminder.user_id] || [];
      for (const sub of userSubs) {
        const payload = JSON.stringify({
          title: '🔔 Habit Reminder',
          body: `Time for: ${reminder.habits?.habit_name || 'your habit'}!`,
          tag: `reminder-${reminder.id}`,
          url: '/habits',
          habitId: reminder.habit_id,
        });
        try {
          await webPush.sendNotification(sub.subscription, payload);
          sent++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            // Subscription is gone — mark for cleanup
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
    console.error('[/api/push-send] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
