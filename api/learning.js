import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import { applyCors } from './cors.js';

function calculateTopicCompletion(topicId, tasks) {
  const topicTasks = (tasks || []).filter(t => t.topic_id === topicId);
  if (topicTasks.length === 0) return 0;
  const done = topicTasks.filter(t => t.completed).length;
  return Math.round((done / topicTasks.length) * 100);
}

function calculateJourneyCompletion(journeyId, topics, tasks) {
  const jTopics = (topics || []).filter(t => t.journey_id === journeyId);
  if (jTopics.length === 0) return 0;
  return Math.round(
    jTopics.reduce((total, topic) => total + calculateTopicCompletion(topic.id, tasks), 0) /
      jTopics.length
  );
}

function calculateJourneyMastery(journeyId, topics) {
  const jTopics = (topics || []).filter(t => t.journey_id === journeyId);
  if (jTopics.length === 0) return 0;
  return Math.round(
    jTopics.reduce((total, topic) => total + (Number(topic.understanding_progress) || 0), 0) /
      jTopics.length
  );
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  const userId = user.id;
  const action = req.query.action || req.body?.action || 'dashboard';

  try {
    // ── GET: Dashboard Summary ───────────────────────────────────────────────
    if (req.method === 'GET' && action === 'dashboard') {
      const [jRes, pRes, tRes, tkRes, aRes] = await Promise.all([
        supabase.from('learning_journeys').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('learning_phases').select('*').eq('user_id', userId).order('order_index', { ascending: true }),
        supabase.from('learning_topics').select('*').eq('user_id', userId).order('order_index', { ascending: true }),
        supabase.from('learning_tasks').select('*').eq('user_id', userId).order('order_index', { ascending: true }),
        supabase.from('learning_activities').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50)
      ]);

      if (jRes.error) {
        console.error('[/api/learning] dashboard query error:', jRes.error);
        return res.status(500).json({ error: 'Failed to retrieve learning dashboard data' });
      }

      const journeys = jRes.data || [];
      const phases = pRes.data || [];
      const topics = tRes.data || [];
      const tasks = tkRes.data || [];
      const activities = aRes.data || [];

      const activeJourneys = journeys.map(journey => {
        const journeyTopics = topics.filter(topic => topic.journey_id === journey.id);
        return {
          ...journey,
          completion_progress: calculateJourneyCompletion(journey.id, topics, tasks),
          understanding_progress: calculateJourneyMastery(journey.id, topics),
          topics_count: journeyTopics.length,
          topics_completed: journeyTopics.filter(topic =>
            topic.status === 'Completed' ||
            calculateTopicCompletion(topic.id, tasks) === 100
          ).length,
          current_topic: (
            journeyTopics.find(topic => topic.status === 'In Progress') ||
            journeyTopics.find(topic => topic.status === 'Not Started') ||
            journeyTopics[0]
          )?.title || 'No topic added yet'
        };
      });

      const continueJourney =
        activeJourneys.find(journey => journey.status === 'Active') ||
        activeJourneys[0] ||
        null;

      let focusTasks = [];
      if (continueJourney) {
        const journeyTopics = topics.filter(topic => topic.journey_id === continueJourney.id);
        const activeTopic =
          journeyTopics.find(topic => topic.status === 'In Progress') ||
          journeyTopics[0];

        if (activeTopic) {
          focusTasks.push(
            ...tasks.filter(task =>
              task.topic_id === activeTopic.id && !task.completed
            )
          );
        }

        focusTasks.push(
          ...tasks.filter(task =>
            !task.completed &&
            task.priority === 'High' &&
            !focusTasks.some(existing => existing.id === task.id) &&
            task.journey_id === continueJourney.id
          )
        );
      }

      focusTasks = focusTasks.slice(0, 5).map(task => ({
        ...task,
        topic_title: topics.find(topic => topic.id === task.topic_id)?.title || 'Topic',
        journey_title: journeys.find(journey => journey.id === task.journey_id)?.title || 'Journey'
      }));

      const activityDates = new Set(
        activities
          .filter(activity => activity.created_at)
          .map(activity => new Date(activity.created_at).toISOString().split('T')[0])
      );

      let streak = 0;
      const checkDate = new Date();
      for (let index = 0; index < 365; index += 1) {
        const date = checkDate.toISOString().split('T')[0];
        if (activityDates.has(date)) {
          streak += 1;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (index > 0) {
          break;
        } else {
          break;
        }
      }

      return res.status(200).json({
        db_configured: true,
        journeys: activeJourneys,
        continueJourney,
        todaysFocus: focusTasks,
        stats: {
          streak,
          totalActiveDays: activityDates.size,
          topicsCompleted: topics.filter(topic =>
            topic.status === 'Completed' ||
            calculateTopicCompletion(topic.id, tasks) === 100
          ).length,
          tasksCompleted: tasks.filter(task => task.completed).length,
          activeJourneysCount: activeJourneys.filter(journey => journey.status === 'Active').length
        }
      });
    }

    // ── GET: Journey Detail ──────────────────────────────────────────────────
    if (req.method === 'GET' && action === 'journey_detail') {
      const journeyId = req.query.id;
      if (!journeyId) return res.status(400).json({ error: 'Journey ID is required' });

      const [jRes, pRes, tRes, tkRes, rRes, nRes, hRes] = await Promise.all([
        supabase.from('learning_journeys').select('*').eq('id', journeyId).eq('user_id', userId).maybeSingle(),
        supabase.from('learning_phases').select('*').eq('journey_id', journeyId).eq('user_id', userId).order('order_index', { ascending: true }),
        supabase.from('learning_topics').select('*').eq('journey_id', journeyId).eq('user_id', userId).order('order_index', { ascending: true }),
        supabase.from('learning_tasks').select('*').eq('journey_id', journeyId).eq('user_id', userId).order('order_index', { ascending: true }),
        supabase.from('learning_resources').select('*').eq('journey_id', journeyId).eq('user_id', userId),
        supabase.from('learning_notes').select('*').eq('journey_id', journeyId).eq('user_id', userId),
        supabase.from('journey_habit_connections').select('*').eq('journey_id', journeyId).eq('user_id', userId)
      ]);

      if (jRes.error) {
        console.error('[/api/learning] journey_detail query error:', jRes.error);
        return res.status(500).json({ error: 'Failed to retrieve learning journey' });
      }

      const journey = jRes.data;
      if (!journey) return res.status(404).json({ error: 'Learning Journey not found or access denied' });

      const phases = pRes.data || [];
      const topics = tRes.data || [];
      const tasks = tkRes.data || [];
      const resources = rRes.data || [];
      const notes = nRes.data || [];
      const habitConnections = hRes.data || [];

      const enrichedTopics = topics.map(topic => ({
        ...topic,
        completion_progress: calculateTopicCompletion(topic.id, tasks),
        tasks: tasks.filter(task => task.topic_id === topic.id),
        resources: resources.filter(resource => resource.topic_id === topic.id),
        notes: notes.filter(note => note.topic_id === topic.id)
      }));

      return res.status(200).json({
        db_configured: true,
        journey: {
          ...journey,
          completion_progress: calculateJourneyCompletion(journeyId, topics, tasks),
          understanding_progress: calculateJourneyMastery(journeyId, topics)
        },
        phases: phases.map(phase => ({
          ...phase,
          completion_progress: (() => {
            const phaseTopics = enrichedTopics.filter(topic => topic.phase_id === phase.id);
            return phaseTopics.length
              ? Math.round(phaseTopics.reduce((sum, topic) => sum + topic.completion_progress, 0) / phaseTopics.length)
              : 0;
          })(),
          topics: enrichedTopics.filter(topic => topic.phase_id === phase.id)
        })),
        unphasedTopics: enrichedTopics.filter(topic => !topic.phase_id),
        topics: enrichedTopics,
        tasks,
        resources,
        notes,
        habitConnections
      });
    }

    // ── POST: Create Journey ────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'create_journey') {
      const {
        title,
        description,
        personal_goal,
        category,
        icon,
        target_date,
        structure_type = 'simple',
        phases: inputPhases = [],
        topics: inputTopics = []
      } = req.body || {};

      if (!title?.trim()) {
        return res.status(400).json({ error: 'Journey title is required' });
      }

      const now = new Date().toISOString();
      const journeyId = crypto.randomUUID();
      const journey = {
        id: journeyId,
        user_id: userId,
        title: title.trim(),
        description: description?.trim() || '',
        personal_goal: personal_goal?.trim() || '',
        category: category || 'General',
        icon: icon || 'GraduationCap',
        status: 'Active',
        structure_type,
        start_date: now.split('T')[0],
        target_date: target_date || null,
        created_at: now,
        updated_at: now
      };

      const createdPhases = [];
      const createdTopics = [];
      const createdTasks = [];

      const addTopicRecord = (topic, journeyPhaseId, orderIndex) => {
        const topicId = crypto.randomUUID();
        const topicRecord = {
          id: topicId,
          journey_id: journeyId,
          phase_id: journeyPhaseId,
          user_id: userId,
          title: topic.title?.trim() || 'Topic',
          description: topic.description || '',
          priority: topic.priority || 'Medium',
          status: topic.status || 'Not Started',
          completion_progress: 0,
          understanding_progress: 0,
          order_index: orderIndex,
          last_activity_at: now,
          created_at: now
        };
        createdTopics.push(topicRecord);

        (topic.tasks || []).forEach((task, taskIndex) => {
          createdTasks.push({
            id: crypto.randomUUID(),
            topic_id: topicId,
            journey_id: journeyId,
            user_id: userId,
            title: task.title?.trim() || 'Task',
            description: task.description || '',
            priority: task.priority || 'Medium',
            completed: false,
            order_index: taskIndex,
            created_at: now
          });
        });
      };

      if (structure_type === 'phases') {
        inputPhases.forEach((phase, phaseIndex) => {
          const phaseId = crypto.randomUUID();
          createdPhases.push({
            id: phaseId,
            journey_id: journeyId,
            user_id: userId,
            title: phase.title?.trim() || `Phase ${phaseIndex + 1}`,
            description: phase.description || '',
            order_index: phaseIndex,
            created_at: now
          });
          (phase.topics || []).forEach((topic, topicIndex) => {
            addTopicRecord(topic, phaseId, topicIndex);
          });
        });
      }

      inputTopics.forEach((topic, topicIndex) => {
        addTopicRecord(topic, null, topicIndex);
      });

      // Insert journey
      const { error: jErr } = await supabase.from('learning_journeys').insert(journey);
      if (jErr) {
        console.error('[/api/learning] create_journey insert error:', jErr);
        return res.status(500).json({ error: 'Failed to create learning journey in database' });
      }

      // Insert phases if present
      if (createdPhases.length) {
        const { error: pErr } = await supabase.from('learning_phases').insert(createdPhases);
        if (pErr) {
          console.error('[/api/learning] create phases error:', pErr);
          return res.status(500).json({ error: 'Failed to save journey phases' });
        }
      }

      // Insert topics if present
      if (createdTopics.length) {
        const { error: tErr } = await supabase.from('learning_topics').insert(createdTopics);
        if (tErr) {
          console.error('[/api/learning] create topics error:', tErr);
          return res.status(500).json({ error: 'Failed to save journey topics' });
        }
      }

      // Insert tasks if present
      if (createdTasks.length) {
        const { error: tkErr } = await supabase.from('learning_tasks').insert(createdTasks);
        if (tkErr) {
          console.error('[/api/learning] create tasks error:', tkErr);
          return res.status(500).json({ error: 'Failed to save journey tasks' });
        }
      }

      // Log activity
      await supabase.from('learning_activities').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        journey_id: journeyId,
        activity_type: 'journey_created',
        created_at: now
      }).catch(err => console.warn('Non-fatal activity log warning:', err));

      return res.status(201).json({
        db_configured: true,
        journey,
        phases: createdPhases,
        topics: createdTopics,
        tasks: createdTasks
      });
    }

    // ── POST: Add Topic ─────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'add_topic') {
      const { journey_id, phase_id = null, title, description, priority = 'Medium', estimated_duration } = req.body || {};
      if (!journey_id || !title?.trim()) {
        return res.status(400).json({ error: 'journey_id and title are required' });
      }

      // Verify journey ownership
      const { data: journey, error: jErr } = await supabase
        .from('learning_journeys')
        .select('id')
        .eq('id', journey_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (jErr || !journey) {
        return res.status(404).json({ error: 'Learning Journey not found or access denied' });
      }

      // Verify phase ownership if phase_id provided
      if (phase_id) {
        const { data: phase, error: pErr } = await supabase
          .from('learning_phases')
          .select('id, journey_id, user_id')
          .eq('id', phase_id)
          .eq('journey_id', journey_id)
          .eq('user_id', userId)
          .maybeSingle();

        if (pErr || !phase) {
          return res.status(404).json({ error: 'Learning phase not found or access denied' });
        }
      }

      const now = new Date().toISOString();
      const topic = {
        id: crypto.randomUUID(),
        journey_id,
        phase_id,
        user_id: userId,
        title: title.trim(),
        description: description?.trim() || '',
        priority,
        status: 'Not Started',
        completion_progress: 0,
        understanding_progress: 0,
        estimated_duration: estimated_duration || '',
        order_index: Date.now(),
        last_activity_at: now,
        created_at: now
      };

      const { error: insertErr } = await supabase.from('learning_topics').insert(topic);
      if (insertErr) {
        console.error('[/api/learning] add_topic insert error:', insertErr);
        return res.status(500).json({ error: 'Failed to add topic in database' });
      }

      return res.status(201).json(topic);
    }

    // ── POST: Add Task ──────────────────────────────────────────────────────
    if (req.method === 'POST' && action === 'add_task') {
      const { topic_id, journey_id, title, description, priority = 'Medium', estimated_duration, due_date } = req.body || {};
      if (!topic_id || !journey_id || !title?.trim()) {
        return res.status(400).json({ error: 'topic_id, journey_id and title are required' });
      }

      // Verify topic ownership
      const { data: topic, error: tErr } = await supabase
        .from('learning_topics')
        .select('id, journey_id')
        .eq('id', topic_id)
        .eq('journey_id', journey_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (tErr || !topic) {
        return res.status(404).json({ error: 'Learning topic not found or access denied' });
      }

      const now = new Date().toISOString();
      const task = {
        id: crypto.randomUUID(),
        topic_id,
        journey_id,
        user_id: userId,
        title: title.trim(),
        description: description?.trim() || '',
        priority,
        estimated_duration: estimated_duration || '',
        due_date: due_date || null,
        completed: false,
        completed_at: null,
        order_index: Date.now(),
        created_at: now
      };

      const { error: insertErr } = await supabase.from('learning_tasks').insert(task);
      if (insertErr) {
        console.error('[/api/learning] add_task insert error:', insertErr);
        return res.status(500).json({ error: 'Failed to add task in database' });
      }

      return res.status(201).json(task);
    }

    // ── PUT: Toggle Task ────────────────────────────────────────────────────
    if (req.method === 'PUT' && action === 'toggle_task') {
      const { id, completed } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Task id is required' });

      const now = new Date().toISOString();
      const completedValue = Boolean(completed);

      const { data: updated, error } = await supabase
        .from('learning_tasks')
        .update({
          completed: completedValue,
          completed_at: completedValue ? now : null
        })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id, completed, completed_at')
        .single();

      if (error || !updated) {
        console.error('[/api/learning] toggle_task error:', error);
        return res.status(404).json({ error: 'Task not found or access denied' });
      }

      return res.status(200).json({ ok: true, completed: completedValue });
    }

    // ── DELETE: Delete Journey, Phase, Topic, Task, Resource, Note ──────────
    if (req.method === 'DELETE') {
      const { id, type } = req.body || req.query || {};
      if (!id || !type) return res.status(400).json({ error: 'id and type are required' });

      const tableByType = {
        journey: 'learning_journeys',
        phase: 'learning_phases',
        topic: 'learning_topics',
        task: 'learning_tasks',
        resource: 'learning_resources',
        note: 'learning_notes',
        habit_connection: 'journey_habit_connections'
      };

      const targetTable = tableByType[type];
      if (!targetTable) return res.status(400).json({ error: 'Invalid delete type' });

      const { data: deleted, error } = await supabase
        .from(targetTable)
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select('id');

      if (error) {
        console.error('[/api/learning] DELETE error:', error);
        return res.status(500).json({ error: 'Failed to delete learning item' });
      }

      if (!deleted?.length) return res.status(404).json({ error: 'Learning item not found or access denied' });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/learning] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
