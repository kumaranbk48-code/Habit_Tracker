-- ==============================================================================
-- HabitTracker Feature 1: Alarm-Style Reminders Migration (Additive Only)
-- Run this script in your Supabase SQL Editor:
-- (Dashboard -> SQL Editor -> New Query -> Paste & Run)
-- ==============================================================================

-- 1. Add is_alarm column to reminders table (defaults to FALSE for safe backward compatibility)
ALTER TABLE IF EXISTS reminders 
  ADD COLUMN IF NOT EXISTS is_alarm BOOLEAN DEFAULT FALSE;

-- 2. Create reminder_events table to persist trigger, skip, and re-ping states across server restarts
CREATE TABLE IF NOT EXISTS reminder_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reminder_id UUID REFERENCES reminders(id) ON DELETE CASCADE,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'triggered', -- 'triggered', 'skipped', 'completed', 'reping'
  reping_count INTEGER DEFAULT 0,
  next_reping_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Add lookup indexes for fast queries by user, habit, and date
CREATE INDEX IF NOT EXISTS idx_reminder_events_lookup 
  ON reminder_events(user_id, habit_id, event_date);

CREATE INDEX IF NOT EXISTS idx_reminder_events_next_reping 
  ON reminder_events(user_id, next_reping_at) 
  WHERE next_reping_at IS NOT NULL;

-- 4. Enable Row Level Security (RLS) on reminder_events
ALTER TABLE IF EXISTS reminder_events ENABLE ROW LEVEL SECURITY;

-- 5. Strict Tenant Isolation Policy
DROP POLICY IF EXISTS "Users can manage their own reminder events" ON reminder_events;
CREATE POLICY "Users can manage their own reminder events"
  ON reminder_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
