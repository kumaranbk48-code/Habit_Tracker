-- ==============================================================================
-- HabitTracker Unified Reminders Migration (Habits, Goals & Learning Roadmaps)
-- Run this script in your Supabase SQL Editor:
-- (Dashboard -> SQL Editor -> New Query -> Paste & Run)
-- ==============================================================================

-- 1. Alter reminders table to make habit_id nullable
ALTER TABLE IF EXISTS reminders ALTER COLUMN habit_id DROP NOT NULL;

-- 2. Add polymorphic columns to reminders
ALTER TABLE IF EXISTS reminders 
  ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'habit',
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS journey_id UUID REFERENCES learning_journeys(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES learning_topics(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reminder_mode TEXT NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS days_before_deadline INTEGER DEFAULT 0;

-- 3. Add CHECK constraints for target_type and reminder_mode
ALTER TABLE IF EXISTS reminders DROP CONSTRAINT IF EXISTS check_reminder_target_type;
ALTER TABLE IF EXISTS reminders ADD CONSTRAINT check_reminder_target_type 
  CHECK (target_type IN ('habit', 'goal', 'learning_journey', 'learning_topic'));

ALTER TABLE IF EXISTS reminders DROP CONSTRAINT IF EXISTS check_reminder_mode;
ALTER TABLE IF EXISTS reminders ADD CONSTRAINT check_reminder_mode 
  CHECK (reminder_mode IN ('scheduled', 'deadline_proximity', 'smart_nudge'));

-- 4. Enforce that at least one valid parent entity is linked
ALTER TABLE IF EXISTS reminders DROP CONSTRAINT IF EXISTS check_reminder_target;
ALTER TABLE IF EXISTS reminders ADD CONSTRAINT check_reminder_target CHECK (
  (target_type = 'habit' AND habit_id IS NOT NULL) OR
  (target_type = 'goal' AND goal_id IS NOT NULL) OR
  (target_type = 'learning_journey' AND journey_id IS NOT NULL) OR
  (target_type = 'learning_topic' AND topic_id IS NOT NULL)
);

-- 5. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_reminders_target_type ON reminders(user_id, target_type);
CREATE INDEX IF NOT EXISTS idx_reminders_goal_id ON reminders(goal_id);
CREATE INDEX IF NOT EXISTS idx_reminders_journey_id ON reminders(journey_id);
CREATE INDEX IF NOT EXISTS idx_reminders_topic_id ON reminders(topic_id);
CREATE INDEX IF NOT EXISTS idx_reminders_reminder_mode ON reminders(reminder_mode);

-- 6. Ensure RLS is active on reminders
ALTER TABLE IF EXISTS reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own reminders" ON reminders;
CREATE POLICY "Users can manage their own reminders"
  ON reminders
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
