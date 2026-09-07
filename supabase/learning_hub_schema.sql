-- ====================================================
-- LEARNING HUB SUPABASE SCHEMA
-- ====================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Learning Journeys Table
CREATE TABLE IF NOT EXISTS learning_journeys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Learning Topics Table
CREATE TABLE IF NOT EXISTS learning_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  order_index INT DEFAULT 0,
  last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_today_focus BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Learning Tasks Table
CREATE TABLE IF NOT EXISTS learning_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  order_index INT DEFAULT 0,
  is_today_focus BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Learning Resources Table
CREATE TABLE IF NOT EXISTS learning_resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  journey_id UUID REFERENCES learning_journeys(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Learning Activity Table
CREATE TABLE IF NOT EXISTS learning_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  journey_id UUID REFERENCES learning_journeys(id) ON DELETE CASCADE,
  topic_id UUID REFERENCES learning_topics(id) ON DELETE SET NULL,
  task_id UUID REFERENCES learning_tasks(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL, -- 'task_completed', 'mastery_updated', 'topic_started', 'journey_created', 'habit_logged'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Journey Habit Connections Table
CREATE TABLE IF NOT EXISTS journey_habit_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  journey_id UUID NOT NULL REFERENCES learning_journeys(id) ON DELETE CASCADE,
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices for rapid querying
CREATE INDEX IF NOT EXISTS idx_learning_journeys_user ON learning_journeys(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_topics_journey ON learning_topics(journey_id);
CREATE INDEX IF NOT EXISTS idx_learning_tasks_topic ON learning_tasks(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_tasks_journey ON learning_tasks(journey_id);
CREATE INDEX IF NOT EXISTS idx_learning_resources_topic ON learning_resources(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_notes_topic ON learning_notes(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_activities_user ON learning_activities(user_id);
