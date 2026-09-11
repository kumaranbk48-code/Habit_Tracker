// Account lifecycle management (GDPR data export & permanent account deletion)
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
    // ── GET: Complete Data Export ─────────────────────────────────────────────
    if (req.method === 'GET') {
      const [
        habitsRes,
        trackingRes,
        goalsRes,
        milestonesRes,
        remindersRes,
        achievementsRes,
        journeysRes,
        phasesRes,
        topicsRes,
        tasksRes,
        resourcesRes,
        notesRes,
        logsRes,
        profileRes
      ] = await Promise.all([
        supabase.from('habits').select('*').eq('user_id', user_id),
        supabase.from('habit_tracking').select('*').eq('user_id', user_id),
        supabase.from('goals').select('*').eq('user_id', user_id),
        supabase.from('goal_milestones').select('*').eq('user_id', user_id),
        supabase.from('reminders').select('*').eq('user_id', user_id),
        supabase.from('user_achievements').select('*').eq('user_id', user_id),
        supabase.from('learning_journeys').select('*').eq('user_id', user_id),
        supabase.from('learning_phases').select('*').eq('user_id', user_id),
        supabase.from('learning_topics').select('*').eq('user_id', user_id),
        supabase.from('learning_tasks').select('*').eq('user_id', user_id),
        supabase.from('learning_resources').select('*').eq('user_id', user_id),
        supabase.from('learning_notes').select('*').eq('user_id', user_id),
        supabase.from('learning_practice_logs').select('*').eq('user_id', user_id),
        supabase.from('profiles').select('*').eq('id', user_id).maybeSingle()
      ]);

      const exportPayload = {
        app: 'HabitTracker',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.created_at,
          metadata: user.user_metadata || {},
          profile: profileRes.data || null
        },
        habits: habitsRes.data || [],
        habitTracking: trackingRes.data || [],
        goals: goalsRes.data || [],
        goalMilestones: milestonesRes.data || [],
        reminders: remindersRes.data || [],
        achievements: achievementsRes.data || [],
        learning: {
          journeys: journeysRes.data || [],
          phases: phasesRes.data || [],
          topics: topicsRes.data || [],
          tasks: tasksRes.data || [],
          resources: resourcesRes.data || [],
          notes: notesRes.data || [],
          practiceLogs: logsRes.data || []
        }
      };

      return res.status(200).json(exportPayload);
    }

    // ── DELETE: Permanent Account & Data Deletion ────────────────────────────
    if (req.method === 'DELETE') {
      // 1. Delete all learning sub-tables and journeys
      await Promise.allSettled([
        supabase.from('learning_practice_logs').delete().eq('user_id', user_id),
        supabase.from('learning_notes').delete().eq('user_id', user_id),
        supabase.from('learning_resources').delete().eq('user_id', user_id),
        supabase.from('learning_tasks').delete().eq('user_id', user_id)
      ]);
      await supabase.from('learning_topics').delete().eq('user_id', user_id);
      await supabase.from('learning_phases').delete().eq('user_id', user_id);
      await supabase.from('learning_journeys').delete().eq('user_id', user_id);

      // 2. Delete tracking, reminders, milestones, goals, habits, achievements, subscriptions
      await Promise.allSettled([
        supabase.from('habit_tracking').delete().eq('user_id', user_id),
        supabase.from('reminders').delete().eq('user_id', user_id),
        supabase.from('goal_milestones').delete().eq('user_id', user_id),
        supabase.from('push_subscriptions').delete().eq('user_id', user_id),
        supabase.from('user_achievements').delete().eq('user_id', user_id)
      ]);
      await supabase.from('goals').delete().eq('user_id', user_id);
      await supabase.from('habits').delete().eq('user_id', user_id);
      await supabase.from('profiles').delete().eq('id', user_id);

      // 3. Delete user authentication identity via Admin API
      const { error: deleteUserErr } = await supabase.auth.admin.deleteUser(user_id);
      if (deleteUserErr) {
        console.warn('[/api/account] Warning during auth.admin.deleteUser:', deleteUserErr.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Your account and all associated personal data have been permanently deleted.'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/account] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error processing account request' });
  }
}
