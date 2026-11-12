-- Idempotent schema script for missing tables only: profiles & learning_practice_logs
-- Safe to run repeatedly on an existing Supabase database.

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID,
  full_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_id ON profiles(id);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_user_isolation_policy" ON profiles;
CREATE POLICY "profiles_user_isolation_policy" ON profiles
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. Learning Practice Logs Table
CREATE TABLE IF NOT EXISTS learning_practice_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID REFERENCES learning_journeys(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE CASCADE,
  duration_minutes INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_practice_logs_user ON learning_practice_logs(user_id);

ALTER TABLE learning_practice_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "learning_practice_logs_user_isolation_policy" ON learning_practice_logs;
CREATE POLICY "learning_practice_logs_user_isolation_policy" ON learning_practice_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

