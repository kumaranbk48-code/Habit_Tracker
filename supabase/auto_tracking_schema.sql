-- ====================================================
-- FEATURE 2: AUTO-TRACKING SCHEMA MIGRATION
-- Additive only: Adds completion source metadata to habit_tracking
-- and enables seamless one-tap confirmation for Focus Timer & Learning Hub
-- ====================================================

-- 1. Add completion source & reference ID to habit_tracking
ALTER TABLE habit_tracking 
ADD COLUMN IF NOT EXISTS completion_source TEXT DEFAULT 'manual';

ALTER TABLE habit_tracking 
ADD COLUMN IF NOT EXISTS completion_ref_id UUID;

-- 2. Add index for faster query by source if needed
CREATE INDEX IF NOT EXISTS idx_habit_tracking_source 
ON habit_tracking(user_id, completion_source);

-- 3. Ensure journey_habit_connections has index for fast lookup
CREATE INDEX IF NOT EXISTS idx_journey_habit_conn_lookup 
ON journey_habit_connections(journey_id, habit_id);

COMMENT ON COLUMN habit_tracking.completion_source IS 'Source of habit completion: manual, timer, or learning';
COMMENT ON COLUMN habit_tracking.completion_ref_id IS 'Reference ID (e.g. topic ID or session ID) for automated completion';
