-- ==============================================================================
-- HabitTracker Master Schema Fix & Upgrade
-- Resolves:
--   1. Habit tracking unique constraint (prevents status toggle reversal error 42P10)
--   2. Goals table enhanced columns (goal_type, current_value, target_value, etc.)
--   3. Reminders table polymorphic columns & multi-alert fields (alerts, routine_window, etc.)
--
-- Instructions:
--   Open Supabase Dashboard -> SQL Editor -> New Query -> Paste this script -> Run
-- ==============================================================================

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FIX HABIT TRACKING (Unique Constraint)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1 Remove any potential duplicate tracking entries keeping the most recently updated/created row
DELETE FROM habit_tracking a
USING habit_tracking b
WHERE a.id < b.id
  AND a.habit_id = b.habit_id
  AND a.completion_date = b.completion_date
  AND a.user_id = b.user_id;

-- 1.2 Add unique constraint to support upserts and prevent race conditions
ALTER TABLE IF EXISTS habit_tracking 
  DROP CONSTRAINT IF EXISTS habit_tracking_user_habit_date_unique;

ALTER TABLE IF EXISTS habit_tracking
  DROP CONSTRAINT IF EXISTS habit_tracking_habit_id_completion_date_user_id_key;

ALTER TABLE IF EXISTS habit_tracking
  ADD CONSTRAINT habit_tracking_habit_id_completion_date_user_id_key 
  UNIQUE (habit_id, completion_date, user_id);

-- 1.3 Ensure performance indexes
CREATE INDEX IF NOT EXISTS idx_habit_tracking_user_date ON habit_tracking(user_id, completion_date);
CREATE INDEX IF NOT EXISTS idx_habit_tracking_habit ON habit_tracking(habit_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FIX GOALS (Add Missing Enhanced Columns)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS goals
  ADD COLUMN IF NOT EXISTS goal_type TEXT DEFAULT 'Target',
  ADD COLUMN IF NOT EXISTS current_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS target_value NUMERIC,
  ADD COLUMN IF NOT EXISTS start_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS bad_habit BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Add constraints if not already present
ALTER TABLE IF EXISTS goals DROP CONSTRAINT IF EXISTS check_goal_current_value_non_negative;
ALTER TABLE IF EXISTS goals ADD CONSTRAINT check_goal_current_value_non_negative CHECK (current_value >= 0);

ALTER TABLE IF EXISTS goals DROP CONSTRAINT IF EXISTS check_goal_target_value_positive;
ALTER TABLE IF EXISTS goals ADD CONSTRAINT check_goal_target_value_positive CHECK (target_value IS NULL OR target_value > 0);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(user_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FIX REMINDERS (Polymorphic & Multi-Alert Columns)
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.1 Allow reminders to target goals or learning journeys (habit_id nullable)
ALTER TABLE IF EXISTS reminders ALTER COLUMN habit_id DROP NOT NULL;

-- 3.2 Add all enhanced reminder columns
ALTER TABLE IF EXISTS reminders
  ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'habit',
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES learning_journeys(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES learning_topics(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reminder_mode TEXT NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS days_before_deadline INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alerts TEXT[],
  ADD COLUMN IF NOT EXISTS custom_text TEXT,
  ADD COLUMN IF NOT EXISTS routine_window TEXT DEFAULT 'Morning',
  ADD COLUMN IF NOT EXISTS days_of_week TEXT[] DEFAULT ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

-- 3.3 Ensure existing reminders populate defaults
UPDATE reminders 
SET alerts = ARRAY[reminder_time] 
WHERE alerts IS NULL AND reminder_time IS NOT NULL;

UPDATE reminders 
SET days_of_week = ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] 
WHERE days_of_week IS NULL;

-- 3.4 Constraints for reminders
ALTER TABLE IF EXISTS reminders DROP CONSTRAINT IF EXISTS check_reminder_target_type;
ALTER TABLE IF EXISTS reminders ADD CONSTRAINT check_reminder_target_type 
  CHECK (target_type IN ('habit', 'goal', 'learning_journey', 'learning_topic'));

ALTER TABLE IF EXISTS reminders DROP CONSTRAINT IF EXISTS check_reminder_mode;
ALTER TABLE IF EXISTS reminders ADD CONSTRAINT check_reminder_mode 
  CHECK (reminder_mode IN ('scheduled', 'deadline_proximity', 'smart_nudge'));

-- 3.5 Indexes for reminders
CREATE INDEX IF NOT EXISTS idx_reminders_user_target ON reminders(user_id, target_type);
CREATE INDEX IF NOT EXISTS idx_reminders_goal_id ON reminders(goal_id);
CREATE INDEX IF NOT EXISTS idx_reminders_journey_id ON reminders(journey_id);
CREATE INDEX IF NOT EXISTS idx_reminders_topic_id ON reminders(topic_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS habit_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own habits" ON habits;
CREATE POLICY "Users can manage their own habits"
  ON habits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own tracking" ON habit_tracking;
CREATE POLICY "Users can manage their own tracking"
  ON habit_tracking FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own goals" ON goals;
CREATE POLICY "Users can manage their own goals"
  ON goals FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own milestones" ON goal_milestones;
CREATE POLICY "Users can manage their own milestones"
  ON goal_milestones FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own reminders" ON reminders;
CREATE POLICY "Users can manage their own reminders"
  ON reminders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Refresh Schema Cache Notification
-- ─────────────────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
