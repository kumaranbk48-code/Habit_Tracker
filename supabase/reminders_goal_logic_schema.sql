-- ==============================================================================
-- HabiZ Goal & Learning Hub Reminder Logic Migration (Additive & Idempotent)
-- Run this script in your Supabase SQL Editor BEFORE using milestone-specific
-- or custom-date reminders:
-- (Dashboard -> SQL Editor -> New Query -> Paste & Run)
-- ==============================================================================

ALTER TABLE IF EXISTS reminders
  ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES goal_milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remind_on_date DATE;

CREATE INDEX IF NOT EXISTS idx_reminders_milestone_id ON reminders(milestone_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_on_date ON reminders(remind_on_date);
