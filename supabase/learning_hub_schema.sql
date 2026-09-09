-- ====================================================
-- LEARNING HUB SUPABASE SCHEMA
-- Run this entire script in your Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New Query -> Paste & Run)
-- ====================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Learning Journeys Table
CREATE TABLE IF NOT EXISTS learning_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  personal_goal TEXT,
  category TEXT DEFAULT 'General',
  icon TEXT DEFAULT 'GraduationCap',
  status TEXT DEFAULT 'Active', -- 'Active', 'Paused', 'Completed', 'Archived'
  structure_type TEXT DEFAULT 'simple', -- 'simple' (Journey->Topic) or 'phases' (Journey->Phase->Topic)
  start_date DATE DEFAULT CURRENT_DATE,
  target_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Learning Phases Table (Optional)
CREATE TABLE IF NOT EXISTS learning_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  order_index BIGINT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Learning Topics Table
CREATE TABLE IF NOT EXISTS learning_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES learning_phases(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'Medium', -- 'Low', 'Medium', 'High'
  status TEXT DEFAULT 'Not Started', -- 'Not Started', 'In Progress', 'Completed', 'Paused'
  completion_progress INT DEFAULT 0, -- 0 to 100 auto-calculated from tasks
  understanding_progress INT DEFAULT 0, -- 0 to 100 manually entered by user
  estimated_duration TEXT,
  target_date DATE,
  order_index BIGINT DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_today_focus BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Learning Tasks Table
CREATE TABLE IF NOT EXISTS learning_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES learning_topics(id) ON DELETE CASCADE,
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'Medium',
  estimated_duration TEXT,
  due_date DATE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,
  order_index BIGINT DEFAULT 0,
  is_today_focus BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Learning Resources Table
CREATE TABLE IF NOT EXISTS learning_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID REFERENCES learning_journeys(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  resource_type TEXT DEFAULT 'Website', -- 'Video', 'Article', 'Documentation', 'Course', 'Website', 'Other'
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Learning Notes Table
CREATE TABLE IF NOT EXISTS learning_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID REFERENCES learning_journeys(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Learning Activity Table
CREATE TABLE IF NOT EXISTS learning_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID REFERENCES learning_journeys(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE SET NULL,
  task_id UUID REFERENCES learning_tasks(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL, -- 'task_completed', 'mastery_updated', 'topic_started', 'journey_created', 'habit_logged'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Journey Habit Connections Table
CREATE TABLE IF NOT EXISTS journey_habit_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE learning_journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_habit_connections ENABLE ROW LEVEL SECURITY;

-- Idempotent RLS Policies (allows users to read and modify only their own data)
DROP POLICY IF EXISTS "Users manage own learning_journeys" ON learning_journeys;
CREATE POLICY "Users manage own learning_journeys" ON learning_journeys FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own learning_phases" ON learning_phases;
CREATE POLICY "Users manage own learning_phases" ON learning_phases FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own learning_topics" ON learning_topics;
CREATE POLICY "Users manage own learning_topics" ON learning_topics FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own learning_tasks" ON learning_tasks;
CREATE POLICY "Users manage own learning_tasks" ON learning_tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own learning_resources" ON learning_resources;
CREATE POLICY "Users manage own learning_resources" ON learning_resources FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own learning_notes" ON learning_notes;
CREATE POLICY "Users manage own learning_notes" ON learning_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own learning_activities" ON learning_activities;
CREATE POLICY "Users manage own learning_activities" ON learning_activities FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own journey_habit_connections" ON journey_habit_connections;
CREATE POLICY "Users manage own journey_habit_connections" ON journey_habit_connections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Indices for rapid querying
CREATE INDEX IF NOT EXISTS idx_learning_journeys_user ON learning_journeys(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_phases_journey ON learning_phases(journey_id);
CREATE INDEX IF NOT EXISTS idx_learning_topics_journey ON learning_topics(journey_id);
CREATE INDEX IF NOT EXISTS idx_learning_topics_user ON learning_topics(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_tasks_topic ON learning_tasks(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_tasks_journey ON learning_tasks(journey_id);
CREATE INDEX IF NOT EXISTS idx_learning_tasks_user ON learning_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_resources_topic ON learning_resources(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_notes_topic ON learning_notes(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_activities_user ON learning_activities(user_id);
