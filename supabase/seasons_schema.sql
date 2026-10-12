-- ==============================================================================
-- HabitTracker Feature 3: Seasons Migration (Additive Only)
-- Run this script in your Supabase SQL Editor:
-- (Dashboard -> SQL Editor -> New Query -> Paste & Run)
-- ==============================================================================

-- 1. Add status and season_id to habits table (Additive only with safe defaults)
-- Existing habits automatically stay 'active' and visible exactly as today.
ALTER TABLE IF EXISTS habits 
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS season_id UUID;

-- 2. Create seasons table
CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create season_habits join table
-- Ensures history is never lost when habits carry across multiple seasons
CREATE TABLE IF NOT EXISTS season_habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(season_id, habit_id)
);

-- 4. Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_seasons_user_status 
  ON seasons(user_id, status);

CREATE INDEX IF NOT EXISTS idx_season_habits_season 
  ON season_habits(season_id);

CREATE INDEX IF NOT EXISTS idx_season_habits_habit 
  ON season_habits(habit_id);

CREATE INDEX IF NOT EXISTS idx_habits_user_status 
  ON habits(user_id, status);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE IF EXISTS seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS season_habits ENABLE ROW LEVEL SECURITY;

-- 6. Strict Tenant Isolation Policies
DROP POLICY IF EXISTS "Users can manage their own seasons" ON seasons;
CREATE POLICY "Users can manage their own seasons"
  ON seasons FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own season habits" ON season_habits;
CREATE POLICY "Users can manage their own season habits"
  ON season_habits FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
