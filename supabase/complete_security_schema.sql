-- ==============================================================================
-- HabitTracker Complete Security & Row Level Security (RLS) Migration
-- Run this migration in your Supabase SQL Editor to enforce strict tenant isolation.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CORE HABIT TRACKER TABLES
-- Habits Table
CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  habit_name TEXT NOT NULL,
  category TEXT DEFAULT 'Health',
  target_frequency TEXT DEFAULT 'Daily',
  tracking_type TEXT DEFAULT 'boolean',
  target_quantity NUMERIC,
  unit TEXT,
  time_of_day TEXT,
  color TEXT DEFAULT '#3d7a75',
  icon TEXT,
  is_archived BOOLEAN DEFAULT FALSE,
  timer_duration INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT check_habit_name_not_empty CHECK (length(trim(habit_name)) > 0 AND length(habit_name) <= 150),
  CONSTRAINT check_target_quantity_non_negative CHECK (target_quantity IS NULL OR target_quantity >= 0),
  CONSTRAINT check_timer_duration_positive CHECK (timer_duration IS NULL OR timer_duration > 0)
);
CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);

-- Habit Tracking Table
CREATE TABLE IF NOT EXISTS habit_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  completion_date DATE NOT NULL,
  status BOOLEAN DEFAULT TRUE,
  quantity_completed NUMERIC DEFAULT 0,
  note TEXT,
  mood TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(habit_id, completion_date, user_id),
  CONSTRAINT check_quantity_completed_non_negative CHECK (quantity_completed >= 0)
);
CREATE INDEX IF NOT EXISTS idx_habit_tracking_user_date ON habit_tracking(user_id, completion_date);
CREATE INDEX IF NOT EXISTS idx_habit_tracking_habit ON habit_tracking(habit_id);

-- Goals Table
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  goal_name TEXT NOT NULL,
  target_date DATE NOT NULL,
  status TEXT DEFAULT 'Pending',
  goal_type TEXT DEFAULT 'Target',
  current_value NUMERIC DEFAULT 0,
  target_value NUMERIC,
  start_value NUMERIC DEFAULT 0,
  unit TEXT,
  start_date DATE DEFAULT CURRENT_DATE,
  bad_habit BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT check_goal_name_not_empty CHECK (length(trim(goal_name)) > 0 AND length(goal_name) <= 200),
  CONSTRAINT check_goal_current_value_non_negative CHECK (current_value >= 0),
  CONSTRAINT check_goal_target_value_positive CHECK (target_value IS NULL OR target_value > 0)
);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);

-- Goal Milestones Table
CREATE TABLE IF NOT EXISTS goal_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT check_milestone_title_not_empty CHECK (length(trim(title)) > 0 AND length(title) <= 200)
);
CREATE INDEX IF NOT EXISTS idx_goal_milestones_user_goal ON goal_milestones(user_id, goal_id);

-- Reminders Table
CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  reminder_time TEXT NOT NULL,
  notification_status TEXT DEFAULT 'Active',
  alerts TEXT[],
  custom_text TEXT,
  routine_window TEXT DEFAULT 'Morning',
  days_of_week TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT check_reminder_time_format CHECK (reminder_time ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$')
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);

-- User Achievements Table
CREATE TABLE IF NOT EXISTS user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  badge_id TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);

-- Push Subscriptions Table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- 3. LEARNING HUB TABLES
CREATE TABLE IF NOT EXISTS learning_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  personal_goal TEXT,
  category TEXT DEFAULT 'General',
  icon TEXT DEFAULT 'GraduationCap',
  status TEXT DEFAULT 'Active',
  structure_type TEXT DEFAULT 'simple',
  start_date DATE DEFAULT CURRENT_DATE,
  target_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_journeys_user ON learning_journeys(user_id);

CREATE TABLE IF NOT EXISTS learning_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_phases_journey ON learning_phases(journey_id, user_id);

CREATE TABLE IF NOT EXISTS learning_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES learning_phases(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Not Started',
  completion_progress INTEGER DEFAULT 0,
  understanding_progress INTEGER DEFAULT 0,
  estimated_duration TEXT,
  order_index INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_topics_journey ON learning_topics(journey_id, user_id);

CREATE TABLE IF NOT EXISTS learning_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES learning_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'Medium',
  estimated_duration TEXT,
  due_date DATE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_tasks_topic ON learning_tasks(topic_id, user_id);

CREATE TABLE IF NOT EXISTS learning_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'Article',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_resources_user ON learning_resources(user_id);

CREATE TABLE IF NOT EXISTS learning_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_notes_user ON learning_notes(user_id);

CREATE TABLE IF NOT EXISTS learning_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID REFERENCES learning_journeys(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_activities_user ON learning_activities(user_id);

CREATE TABLE IF NOT EXISTS journey_habit_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(journey_id, habit_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_journey_habit_user ON journey_habit_connections(user_id);

-- ==============================================================================
-- 4. ENABLE ROW LEVEL SECURITY (RLS) ON ALL USER TABLES
-- ==============================================================================
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_habit_connections ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 5. CREATE STRICT TENANT ISOLATION POLICIES (Users access only their own data)
-- ==============================================================================

-- Macro helper: Drop existing policies before creating to ensure idempotency
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'habits', 'habit_tracking', 'goals', 'goal_milestones', 'reminders',
    'user_achievements', 'push_subscriptions', 'learning_journeys',
    'learning_phases', 'learning_topics', 'learning_tasks', 'learning_resources',
    'learning_notes', 'learning_activities', 'journey_habit_connections'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_user_isolation_policy" ON %I;', t, t);
    EXECUTE format('
      CREATE POLICY "%s_user_isolation_policy" ON %I
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
    ', t, t);
  END LOOP;
END $$;
