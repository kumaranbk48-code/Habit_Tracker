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
        profileRes,
        seasonsRes,
        seasonHabitsRes
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
        supabase.from('profiles').select('*').eq('id', user_id).maybeSingle(),
        supabase.from('seasons').select('*').eq('user_id', user_id),
        supabase.from('season_habits').select('*').eq('user_id', user_id)
      ]);

      // Inspect query errors to avoid silent data loss in GDPR export (F-12)
      const exportErrors = [];
      if (habitsRes.error) exportErrors.push({ section: 'habits', message: habitsRes.error.message });
      if (trackingRes.error) exportErrors.push({ section: 'habitTracking', message: trackingRes.error.message });
      if (goalsRes.error) exportErrors.push({ section: 'goals', message: goalsRes.error.message });
      if (milestonesRes.error) exportErrors.push({ section: 'goalMilestones', message: milestonesRes.error.message });
      if (remindersRes.error) exportErrors.push({ section: 'reminders', message: remindersRes.error.message });
      if (achievementsRes.error) exportErrors.push({ section: 'achievements', message: achievementsRes.error.message });
      if (journeysRes.error) exportErrors.push({ section: 'learningJourneys', message: journeysRes.error.message });
      if (phasesRes.error) exportErrors.push({ section: 'learningPhases', message: phasesRes.error.message });
      if (topicsRes.error) exportErrors.push({ section: 'learningTopics', message: topicsRes.error.message });
      if (tasksRes.error) exportErrors.push({ section: 'learningTasks', message: tasksRes.error.message });
      if (resourcesRes.error) exportErrors.push({ section: 'learningResources', message: resourcesRes.error.message });
      if (notesRes.error) exportErrors.push({ section: 'learningNotes', message: notesRes.error.message });
      if (logsRes.error) exportErrors.push({ section: 'learningPracticeLogs', message: logsRes.error.message });
      if (profileRes.error) exportErrors.push({ section: 'profile', message: profileRes.error.message });
      if (seasonsRes.error) exportErrors.push({ section: 'seasons', message: seasonsRes.error.message });
      if (seasonHabitsRes.error) exportErrors.push({ section: 'seasonHabits', message: seasonHabitsRes.error.message });

      if (exportErrors.length > 0) {
        console.error('[/api/account] Export encountered section query errors:', exportErrors);
        return res.status(500).json({
          error: 'Failed to generate complete data export',
          failedSections: exportErrors
        });
      }

      const exportPayload = {
        app: 'HabiZ',
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
        seasons: seasonsRes.data || [],
        seasonHabits: seasonHabitsRes.data || [],
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
      // Enforce recent authentication (within 15 minutes) before destructive deletion using ONLY user.last_sign_in_at
      const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
      const MAX_AUTH_AGE_MS = 15 * 60 * 1000; // 15 minutes

      if (!lastSignIn || (Date.now() - lastSignIn) > MAX_AUTH_AGE_MS) {
        return res.status(403).json({
          error: 'Recent authentication required. Please sign in again before deleting your account.'
        });
      }

      // 1. Delete user data across all tables in order, verifying each result
      const tablesToDelete = [
        { table: 'learning_practice_logs', col: 'user_id' },
        { table: 'learning_notes', col: 'user_id' },
        { table: 'learning_resources', col: 'user_id' },
        { table: 'learning_tasks', col: 'user_id' },
        { table: 'learning_topics', col: 'user_id' },
        { table: 'learning_phases', col: 'user_id' },
        { table: 'learning_journeys', col: 'user_id' },
        { table: 'reminder_events', col: 'user_id' },
        { table: 'reminders', col: 'user_id' },
        { table: 'habit_tracking', col: 'user_id' },
        { table: 'season_habits', col: 'user_id' },
        { table: 'seasons', col: 'user_id' },
        { table: 'goal_milestones', col: 'user_id' },
        { table: 'goals', col: 'user_id' },
        { table: 'habits', col: 'user_id' },
        { table: 'push_subscriptions', col: 'user_id' },
        { table: 'user_achievements', col: 'user_id' },
        { table: 'profiles', col: 'id' }
      ];

      for (const { table, col } of tablesToDelete) {
        const { error: tableDelErr } = await supabase.from(table).delete().eq(col, user_id);
        if (tableDelErr) {
          console.error(`[/api/account] Error deleting from ${table}:`, tableDelErr.message);
          return res.status(500).json({
            error: `Failed to delete account data from ${table}. Deletion aborted.`,
            details: tableDelErr.message
          });
        }
      }

      // 2. Delete user authentication identity via Admin API
      const { error: deleteUserErr } = await supabase.auth.admin.deleteUser(user_id);
      if (deleteUserErr) {
        console.error('[/api/account] Error during auth.admin.deleteUser:', deleteUserErr.message);
        return res.status(500).json({
          error: 'Failed to delete user authentication record. Account deletion was not completed.',
          details: deleteUserErr.message
        });
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
