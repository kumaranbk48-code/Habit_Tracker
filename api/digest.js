// Weekly Email Digest
// Triggered by cron-job.org (free): GET /api/digest?secret=YOUR_CRON_SECRET
// Uses Resend free tier (3,000 emails/month — more than enough).
import { Resend } from 'resend';
import supabase from './db-client.js';

const resend = new Resend(process.env.RESEND_API_KEY);

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

// Beautiful HTML email template
function buildEmailHtml({ displayName, streak, longestStreak, completionsThisWeek, totalHabits, completedGoals, totalGoals, level, xp }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);padding:36px 32px 28px;">
      <div style="font-size:13px;font-weight:700;color:#93c5fd;letter-spacing:1px;margin-bottom:8px;">HABITTRACKER</div>
      <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:4px;">Weekly Digest 📊</div>
      <div style="font-size:14px;color:#bfdbfe;">Here's how you did this week, ${displayName}!</div>
    </div>

    <!-- Streak hero -->
    <div style="padding:28px 32px 20px;border-bottom:1px solid #f1f5f9;">
      <div style="display:flex;align-items:center;gap:16px;">
        <div style="width:64px;height:64px;background:linear-gradient(135deg,#f97316,#ef4444);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:32px;flex-shrink:0;">🔥</div>
        <div>
          <div style="font-size:36px;font-weight:800;color:#111827;line-height:1;">${streak}</div>
          <div style="font-size:14px;color:#6b7280;margin-top:2px;">Day streak${streak >= 7 ? ' — amazing!' : ''}</div>
          ${streak > 0 ? `<div style="font-size:12px;color:#9ca3af;margin-top:1px;">Personal best: ${longestStreak} days</div>` : ''}
        </div>
      </div>
    </div>

    <!-- Stats grid -->
    <div style="padding:24px 32px;display:grid;grid-template-columns:1fr 1fr;gap:16px;border-bottom:1px solid #f1f5f9;">
      <div style="background:#eff6ff;border-radius:12px;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:#1d4ed8;">${completionsThisWeek}</div>
        <div style="font-size:12px;color:#60a5fa;font-weight:600;margin-top:2px;">HABITS COMPLETED</div>
        <div style="font-size:11px;color:#93c5fd;">this week</div>
      </div>
      <div style="background:#f0fdf4;border-radius:12px;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:#16a34a;">${completedGoals}/${totalGoals}</div>
        <div style="font-size:12px;color:#4ade80;font-weight:600;margin-top:2px;">GOALS DONE</div>
        <div style="font-size:11px;color:#86efac;">keep pushing!</div>
      </div>
      <div style="background:#fefce8;border-radius:12px;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:#ca8a04;">${xp.toLocaleString()}</div>
        <div style="font-size:12px;color:#facc15;font-weight:600;margin-top:2px;">TOTAL XP</div>
        <div style="font-size:11px;color:#fde68a;">Level ${level}</div>
      </div>
      <div style="background:#fdf4ff;border-radius:12px;padding:16px;">
        <div style="font-size:28px;font-weight:800;color:#9333ea;">${totalHabits}</div>
        <div style="font-size:12px;color:#c084fc;font-weight:600;margin-top:2px;">ACTIVE HABITS</div>
        <div style="font-size:11px;color:#e9d5ff;">being tracked</div>
      </div>
    </div>

    <!-- Motivational message -->
    <div style="padding:24px 32px;border-bottom:1px solid #f1f5f9;">
      <div style="background:#f8fafc;border-radius:12px;padding:16px;border-left:4px solid #2563eb;">
        <div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:4px;">💡 This Week's Insight</div>
        <div style="font-size:13px;color:#475569;line-height:1.6;">
          ${streak >= 7
            ? `You're on a ${streak}-day streak — that's exceptional! Research shows habits maintained for 21+ days become automatic. You're building something lasting.`
            : streak >= 3
              ? `A ${streak}-day streak is a great start! The first week is always the hardest. Keep showing up daily and it will soon feel effortless.`
              : `Every expert was once a beginner. Complete today's habits to start building your streak. One day at a time is all it takes.`
          }
        </div>
      </div>
    </div>

    <!-- CTA -->
    <div style="padding:28px 32px;text-align:center;">
      <a href="${process.env.VITE_APP_URL || 'https://your-app.vercel.app'}"
        style="display:inline-block;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:15px;box-shadow:0 4px 12px rgba(37,99,235,0.3);">
        Open HabitTracker →
      </a>
      <div style="font-size:11px;color:#9ca3af;margin-top:20px;">
        You're receiving this because you enabled weekly digests.<br/>
        <a href="${process.env.VITE_APP_URL || 'https://your-app.vercel.app'}/reminders" style="color:#60a5fa;">Manage preferences</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-cron-secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Secure the endpoint
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Forbidden' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  try {
    // Fetch all users who have habits (only send to active users)
    const { data: users, error: usersErr } = await supabase
      .from('habits')
      .select('user_id')
      .order('user_id');
    if (usersErr) throw usersErr;

    // Unique user IDs
    const userIds = [...new Set((users || []).map(u => u.user_id))];
    if (!userIds.length) return res.status(200).json({ sent: 0, message: 'No users found' });

    const weekAgo = getDateDaysAgo(7);
    const today   = new Date().toISOString().split('T')[0];

    let sent = 0;
    const errors = [];

    for (const userId of userIds) {
      try {
        // Get user email from auth
        const { data: { user } } = await supabase.auth.admin.getUserById(userId);
        if (!user?.email) continue;

        // Get user stats
        const [habitsRes, trackingRes, goalsRes] = await Promise.all([
          supabase.from('habits').select('id').eq('user_id', userId),
          supabase.from('habit_tracking').select('completion_date')
            .eq('user_id', userId).eq('status', true)
            .gte('completion_date', weekAgo).lte('completion_date', today),
          supabase.from('goals').select('status').eq('user_id', userId),
        ]);

        const totalHabits         = habitsRes.data?.length  || 0;
        const completionsThisWeek = trackingRes.data?.length || 0;
        const goals               = goalsRes.data || [];
        const completedGoals      = goals.filter(g => g.status === 'Completed').length;

        // Simple streak calc from tracking dates
        const allDates  = new Set((trackingRes.data || []).map(t => t.completion_date));
        let streak = 0;
        for (let i = 0; i < 365; i++) {
          const d = getDateDaysAgo(i);
          if (allDates.has(d)) { streak++; } else { if (i === 0) continue; break; }
        }

        const displayName = user.user_metadata?.full_name || user.email.split('@')[0];
        const xp = completionsThisWeek * 10 + completedGoals * 100;
        const level = xp >= 11000 ? 10 : xp >= 8000 ? 9 : xp >= 5500 ? 8 :
          xp >= 3500 ? 7 : xp >= 2000 ? 6 : xp >= 1000 ? 5 :
          xp >= 500 ? 4 : xp >= 250 ? 3 : xp >= 100 ? 2 : 1;

        await resend.emails.send({
          from: 'HabitTracker <digest@habittracker.app>',
          to: user.email,
          subject: streak > 0
            ? `🔥 ${streak}-day streak — Your weekly digest`
            : `📊 Your weekly HabitTracker digest`,
          html: buildEmailHtml({
            displayName,
            streak,
            longestStreak: streak, // simplified
            completionsThisWeek,
            totalHabits,
            completedGoals,
            totalGoals: goals.length,
            level,
            xp,
          }),
        });
        sent++;
      } catch (err) {
        errors.push({ userId, error: err.message });
      }
    }

    console.log(`[digest] Sent ${sent}/${userIds.length} emails`);
    return res.status(200).json({ sent, total: userIds.length, errors });
  } catch (err) {
    console.error('[/api/digest] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
