-- ====================================================
-- PUSH NOTIFICATIONS SCHEMA
-- Run this script in your Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New Query -> Paste & Run)
-- ====================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint     TEXT        NOT NULL UNIQUE,         -- browser push endpoint URL
    subscription JSONB       NOT NULL,                -- full PushSubscription JSON
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Row-level security: users can only see/edit their own subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop policy if it already exists to avoid ERROR 42710
DROP POLICY IF EXISTS "Users manage own push subscriptions" ON push_subscriptions;

CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify existing tables have Row Level Security enabled.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS habits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS goals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS reminders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS habit_tracking  ENABLE ROW LEVEL SECURITY;
