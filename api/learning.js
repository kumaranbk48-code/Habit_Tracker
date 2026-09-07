import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';

import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORE_FILE = path.join(__dirname, '..', 'scratch', 'learning_store.json');

function loadStoreFromFile() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const data = fs.readFileSync(STORE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      return new Map(Object.entries(parsed));
    }
  } catch (e) {
    console.error('Error reading learning store file:', e);
  }
  return new Map();
}

let memStore = loadStoreFromFile();

function saveStoreToFile() {
  try {
    const dir = path.dirname(STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj = Object.fromEntries(memStore.entries());
    fs.writeFileSync(STORE_FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving learning store file:', e);
  }
}

function getUserStore(userId) {
  // Always ensure memStore has the latest data from disk if missing
  if (!memStore.has(userId)) {
    const fresh = loadStoreFromFile();
    if (fresh.has(userId)) {
      memStore.set(userId, fresh.get(userId));
    } else {
      memStore.set(userId, {
        journeys: [],
        phases: [],
        topics: [],
        tasks: [],
        resources: [],
        notes: [],
        activities: [],
        habitConnections: []
      });
      saveStoreToFile();
    }
  }
  return memStore.get(userId);
}

function calculateTopicCompletion(topicId, tasks) {
  const topicTasks = tasks.filter(t => t.topic_id === topicId);
  if (topicTasks.length === 0) return 0;
  const done = topicTasks.filter(t => t.completed).length;
  return Math.round((done / topicTasks.length) * 100);
}

function calculateJourneyCompletion(journeyId, topics, tasks) {
  const jTopics = topics.filter(t => t.journey_id === journeyId);
  if (jTopics.length === 0) return 0;
  let totalComp = 0;
  jTopics.forEach(t => {
    totalComp += calculateTopicCompletion(t.id, tasks);
  });
  return Math.round(totalComp / jTopics.length);
}

function calculateJourneyMastery(journeyId, topics) {
  const jTopics = topics.filter(t => t.journey_id === journeyId);
  if (jTopics.length === 0) return 0;
  const totalMastery = jTopics.reduce((acc, t) => acc + (Number(t.understanding_progress) || 0), 0);
  return Math.round(totalMastery / jTopics.length);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token' });
  const userId = user.id;

  const action = req.query.action || req.body?.action || 'dashboard';

  try {
    // Attempt to test if Supabase tables exist
    let useDb = true;
    try {
      const { error } = await supabase.from('learning_journeys').select('id').limit(1);
      if (error && (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist'))) {
        useDb = false;
      }
    } catch {
      useDb = false;
    }

    const store = getUserStore(userId);

    // ── GET ACTIONS ──────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      if (action === 'dashboard') {
        let journeys = [], phases = [], topics = [], tasks = [], activities = [];

        if (useDb) {
          try {
            const [jRes, pRes, tRes, tkRes, actRes] = await Promise.all([
              supabase.from('learning_journeys').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
              supabase.from('learning_phases').select('*').eq('user_id', userId).order('order_index', { ascending: true }),
              supabase.from('learning_topics').select('*').eq('user_id', userId).order('order_index', { ascending: true }),
              supabase.from('learning_tasks').select('*').eq('user_id', userId).order('order_index', { ascending: true }),
              supabase.from('learning_activities').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
            ]);
            journeys = jRes.data || [];
            phases = pRes.data || [];
            topics = tRes.data || [];
            tasks = tkRes.data || [];
            activities = actRes.data || [];
          } catch {
            useDb = false;
          }
        }

        if (!useDb || (journeys.length === 0 && store.journeys.length > 0)) {
          journeys = journeys.length > 0 ? journeys : store.journeys;
          phases = phases.length > 0 ? phases : store.phases;
          topics = topics.length > 0 ? topics : store.topics;
          tasks = tasks.length > 0 ? tasks : store.tasks;
          activities = activities.length > 0 ? activities : store.activities;
        }

        // Augment journeys with completion & mastery percentages
        const activeJourneys = journeys.map(j => {
          const comp = calculateJourneyCompletion(j.id, topics, tasks);
          const mast = calculateJourneyMastery(j.id, topics);
          const jTopics = topics.filter(t => t.journey_id === j.id);
          const currentTopic = jTopics.find(t => t.status === 'In Progress') || jTopics.find(t => t.status === 'Not Started') || jTopics[0] || null;
          return {
            ...j,
            completion_progress: comp,
            understanding_progress: mast,
            topics_count: jTopics.length,
            topics_completed: jTopics.filter(t => t.status === 'Completed' || calculateTopicCompletion(t.id, tasks) === 100).length,
            current_topic: currentTopic ? currentTopic.title : 'No topic added yet'
          };
        });

        // Current primary journey for "Continue Learning" hero section
        const continueJourney = activeJourneys.find(j => j.status === 'Active') || activeJourneys[0] || null;

        // Today's Focus Recommendation logic:
        // 1. Tasks explicitly marked as today's focus or belong to current active topic
        // 2. High priority incomplete tasks
        // 3. Neglected topics (last activity > 3 days ago)
        let focusTasks = [];
        let focusTopics = [];

        if (continueJourney) {
          const jTopics = topics.filter(t => t.journey_id === continueJourney.id);
          const activeTopic = jTopics.find(t => t.status === 'In Progress') || jTopics[0];
          
          if (activeTopic) {
            focusTopics.push(activeTopic);
            const topicTasks = tasks.filter(t => t.topic_id === activeTopic.id && !t.completed);
            focusTasks.push(...topicTasks);
          }

          // Add other high priority incomplete tasks across journeys
          const highPriority = tasks.filter(t => !t.completed && t.priority === 'High' && !focusTasks.some(ft => ft.id === t.id));
          focusTasks.push(...highPriority);
        }

        // Limit focus items to top 5 for clarity
        focusTasks = focusTasks.slice(0, 5).map(t => {
          const topic = topics.find(tp => tp.id === t.topic_id);
          const journey = journeys.find(j => j.id === t.journey_id);
          return {
            ...t,
            topic_title: topic?.title || 'Topic',
            journey_title: journey?.title || 'Journey'
          };
        });

        // Calculate consistency statistics
        const completedTasksCount = tasks.filter(t => t.completed).length;
        const completedTopicsCount = topics.filter(t => t.status === 'Completed' || calculateTopicCompletion(t.id, tasks) === 100).length;

        // Streak calculation from activity dates
        const activityDates = new Set(activities.map(a => new Date(a.created_at).toISOString().split('T')[0]));
        const today = new Date().toISOString().split('T')[0];
        let streak = 0;
        let checkDate = new Date();

        for (let i = 0; i < 365; i++) {
          const dStr = checkDate.toISOString().split('T')[0];
          if (activityDates.has(dStr)) {
            streak++;
          } else if (i > 0) {
            break;
          }
          checkDate.setDate(checkDate.getDate() - 1);
        }

        return res.status(200).json({
          journeys: activeJourneys,
          continueJourney,
          todaysFocus: focusTasks,
          stats: {
            streak,
            totalActiveDays: activityDates.size || (journeys.length > 0 ? 1 : 0),
            topicsCompleted: completedTopicsCount,
            tasksCompleted: completedTasksCount,
            activeJourneysCount: activeJourneys.filter(j => j.status === 'Active').length
          }
        });
      }

      if (action === 'journey_detail') {
        const journeyId = req.query.id;
        if (!journeyId) return res.status(400).json({ error: 'Journey ID is required' });

        let journey = null, phases = [], topics = [], tasks = [], resources = [], notes = [], habitConnections = [];

        if (useDb) {
          try {
            const [jRes, pRes, tRes, tkRes, rRes, nRes, hcRes] = await Promise.all([
              supabase.from('learning_journeys').select('*').eq('id', journeyId).eq('user_id', userId).single(),
              supabase.from('learning_phases').select('*').eq('journey_id', journeyId).order('order_index', { ascending: true }),
              supabase.from('learning_topics').select('*').eq('journey_id', journeyId).order('order_index', { ascending: true }),
              supabase.from('learning_tasks').select('*').eq('journey_id', journeyId).order('order_index', { ascending: true }),
              supabase.from('learning_resources').select('*').eq('journey_id', journeyId),
              supabase.from('learning_notes').select('*').eq('journey_id', journeyId),
              supabase.from('journey_habit_connections').select('*').eq('journey_id', journeyId),
            ]);
            journey = jRes.data;
            phases = pRes.data || [];
            topics = tRes.data || [];
            tasks = tkRes.data || [];
            resources = rRes.data || [];
            notes = nRes.data || [];
            habitConnections = hcRes.data || [];
          } catch {
            useDb = false;
          }
        }

        if (!journey || !useDb) {
          journey = store.journeys.find(j => j.id === journeyId) || null;
          phases = store.phases.filter(p => p.journey_id === journeyId);
          topics = store.topics.filter(t => t.journey_id === journeyId);
          tasks = store.tasks.filter(t => t.journey_id === journeyId);
          resources = store.resources.filter(r => r.journey_id === journeyId);
          notes = store.notes.filter(n => n.journey_id === journeyId);
          habitConnections = store.habitConnections.filter(hc => hc.journey_id === journeyId);
        }

        if (!journey) return res.status(404).json({ error: 'Learning Journey not found' });

        // Calculate progress for each topic
        const enrichedTopics = topics.map(t => {
          const topicTasks = tasks.filter(tk => tk.topic_id === t.id);
          const compProgress = calculateTopicCompletion(t.id, tasks);
          return {
            ...t,
            completion_progress: compProgress,
            tasks: topicTasks,
            resources: resources.filter(r => r.topic_id === t.id),
            notes: notes.filter(n => n.topic_id === t.id)
          };
        });

        // Enriched phases
        const enrichedPhases = phases.map(p => {
          const phaseTopics = enrichedTopics.filter(t => t.phase_id === p.id);
          const comp = phaseTopics.length > 0
            ? Math.round(phaseTopics.reduce((acc, t) => acc + t.completion_progress, 0) / phaseTopics.length)
            : 0;
          return {
            ...p,
            completion_progress: comp,
            topics: phaseTopics
          };
        });

        const overallComp = calculateJourneyCompletion(journeyId, topics, tasks);
        const overallMast = calculateJourneyMastery(journeyId, topics);

        return res.status(200).json({
          journey: {
            ...journey,
            completion_progress: overallComp,
            understanding_progress: overallMast
          },
          phases: enrichedPhases,
          unphasedTopics: enrichedTopics.filter(t => !t.phase_id),
          topics: enrichedTopics,
          tasks,
          resources,
          notes,
          habitConnections
        });
      }
    }

    // ── POST / CREATION ACTIONS ──────────────────────────────────────────────
    if (req.method === 'POST') {
      if (action === 'create_journey') {
        const {
          title, description, personal_goal, category, icon, target_date,
          structure_type = 'simple', phases = [], topics = []
        } = req.body ?? {};

        if (!title?.trim()) return res.status(400).json({ error: 'Journey title is required' });

        const journeyId = crypto.randomUUID();
        const now = new Date().toISOString();

        const journeyObj = {
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

        // Parse phases if structure is 'phases'
        if (structure_type === 'phases' && Array.isArray(phases)) {
          phases.forEach((p, pIdx) => {
            const pId = crypto.randomUUID();
            createdPhases.push({
              id: pId,
              journey_id: journeyId,
              user_id: userId,
              title: p.title?.trim() || `Phase ${pIdx + 1}`,
              description: p.description || '',
              order_index: pIdx,
              created_at: now
            });

            if (Array.isArray(p.topics)) {
              p.topics.forEach((t, tIdx) => {
                const tId = crypto.randomUUID();
                createdTopics.push({
                  id: tId,
                  journey_id: journeyId,
                  phase_id: pId,
                  user_id: userId,
                  title: t.title?.trim() || 'Topic',
                  description: t.description || '',
                  priority: t.priority || 'Medium',
                  status: t.status || 'Not Started',
                  completion_progress: 0,
                  understanding_progress: 0,
                  order_index: tIdx,
                  last_activity_at: now,
                  created_at: now
                });

                if (Array.isArray(t.tasks)) {
                  t.tasks.forEach((tk, tkIdx) => {
                    createdTasks.push({
                      id: crypto.randomUUID(),
                      topic_id: tId,
                      journey_id: journeyId,
                      user_id: userId,
                      title: tk.title?.trim() || 'Task',
                      description: tk.description || '',
                      priority: tk.priority || 'Medium',
                      completed: false,
                      order_index: tkIdx,
                      created_at: now
                    });
                  });
                }
              });
            }
          });
        }

        // Direct topics if simple or top-level topics
        if (Array.isArray(topics)) {
          topics.forEach((t, tIdx) => {
            const tId = crypto.randomUUID();
            createdTopics.push({
              id: tId,
              journey_id: journeyId,
              phase_id: null,
              user_id: userId,
              title: t.title?.trim() || 'Topic',
              description: t.description || '',
              priority: t.priority || 'Medium',
              status: t.status || 'Not Started',
              completion_progress: 0,
              understanding_progress: 0,
              order_index: tIdx,
              last_activity_at: now,
              created_at: now
            });

            if (Array.isArray(t.tasks)) {
              t.tasks.forEach((tk, tkIdx) => {
                createdTasks.push({
                  id: crypto.randomUUID(),
                  topic_id: tId,
                  journey_id: journeyId,
                  user_id: userId,
                  title: tk.title?.trim() || 'Task',
                  description: tk.description || '',
                  priority: tk.priority || 'Medium',
                  completed: false,
                  order_index: tkIdx,
                  created_at: now
                });
              });
            }
          });
        }

        if (useDb) {
          try {
            const { error: insErr } = await supabase.from('learning_journeys').insert(journeyObj);
            if (insErr) {
              useDb = false;
            } else {
              if (createdPhases.length > 0) await supabase.from('learning_phases').insert(createdPhases);
              if (createdTopics.length > 0) await supabase.from('learning_topics').insert(createdTopics);
              if (createdTasks.length > 0) await supabase.from('learning_tasks').insert(createdTasks);
              await supabase.from('learning_activities').insert({
                id: crypto.randomUUID(),
                user_id: userId,
                journey_id: journeyId,
                activity_type: 'journey_created',
                created_at: now
              });
            }
          } catch {
            useDb = false;
          }
        }

        if (!useDb) {
          store.journeys.unshift(journeyObj);
          store.phases.push(...createdPhases);
          store.topics.push(...createdTopics);
          store.tasks.push(...createdTasks);
          store.activities.unshift({
            id: crypto.randomUUID(),
            user_id: userId,
            journey_id: journeyId,
            activity_type: 'journey_created',
            created_at: now
          });
          saveStoreToFile();
        }

        return res.status(201).json({
          journey: journeyObj,
          phases: createdPhases,
          topics: createdTopics,
          tasks: createdTasks
        });
      }

      if (action === 'add_topic') {
        const { journey_id, phase_id = null, title, description, priority = 'Medium', estimated_duration } = req.body;
        if (!journey_id || !title?.trim()) return res.status(400).json({ error: 'journey_id and title are required' });

        const now = new Date().toISOString();
        const topicObj = {
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

        if (useDb) {
          try {
            await supabase.from('learning_topics').insert(topicObj);
          } catch { useDb = false; }
        }
        store.topics.push(topicObj);
        saveStoreToFile();

        return res.status(201).json(topicObj);
      }

      if (action === 'add_task') {
        const { topic_id, journey_id, title, description, priority = 'Medium', estimated_duration, due_date } = req.body;
        if (!topic_id || !journey_id || !title?.trim()) return res.status(400).json({ error: 'topic_id, journey_id and title are required' });

        const now = new Date().toISOString();
        const taskObj = {
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

        if (useDb) {
          try {
            await supabase.from('learning_tasks').insert(taskObj);
          } catch { useDb = false; }
        }
        store.tasks.push(taskObj);
        saveStoreToFile();

        return res.status(201).json(taskObj);
      }

      if (action === 'add_resource') {
        const { journey_id, topic_id, title, url, resource_type = 'Website', description } = req.body;
        if (!title?.trim() || !url?.trim()) return res.status(400).json({ error: 'Title and URL are required' });

        const resObj = {
          id: crypto.randomUUID(),
          user_id: userId,
          journey_id: journey_id || null,
          topic_id: topic_id || null,
          title: title.trim(),
          url: url.trim(),
          resource_type,
          description: description || '',
          created_at: new Date().toISOString()
        };

        if (useDb) {
          try { await supabase.from('learning_resources').insert(resObj); } catch { useDb = false; }
        }
        store.resources.push(resObj);
        saveStoreToFile();

        return res.status(201).json(resObj);
      }

      if (action === 'add_note') {
        const { journey_id, topic_id, content } = req.body;
        if (!content?.trim()) return res.status(400).json({ error: 'Note content is required' });

        const now = new Date().toISOString();
        const noteObj = {
          id: crypto.randomUUID(),
          user_id: userId,
          journey_id: journey_id || null,
          topic_id: topic_id || null,
          content: content.trim(),
          created_at: now,
          updated_at: now
        };

        if (useDb) {
          try { await supabase.from('learning_notes').insert(noteObj); } catch { useDb = false; }
        }
        store.notes.push(noteObj);
        saveStoreToFile();

        return res.status(201).json(noteObj);
      }

      if (action === 'connect_habit') {
        const { journey_id, habit_id } = req.body;
        if (!journey_id || !habit_id) return res.status(400).json({ error: 'journey_id and habit_id are required' });

        const connObj = {
          id: crypto.randomUUID(),
          user_id: userId,
          journey_id,
          habit_id,
          created_at: new Date().toISOString()
        };

        if (useDb) {
          try { await supabase.from('journey_habit_connections').insert(connObj); } catch { useDb = false; }
        }
        store.habitConnections.push(connObj);
        saveStoreToFile();

        return res.status(201).json(connObj);
      }
    }

    // ── PUT / UPDATE ACTIONS ────────────────────────────────────────────────
    if (req.method === 'PUT') {
      if (action === 'toggle_task') {
        const { id, completed } = req.body;
        if (!id) return res.status(400).json({ error: 'Task id is required' });

        const now = new Date().toISOString();
        const isComp = Boolean(completed);

        if (useDb) {
          try {
            const updateRes = await supabase.from('learning_tasks').update({
              completed: isComp,
              completed_at: isComp ? now : null
            }).eq('id', id).eq('user_id', userId).select();
            console.log('[/api/learning toggle_task] Supabase updateRes:', JSON.stringify(updateRes));
            if (updateRes.error) {
              console.error('[/api/learning toggle_task] Supabase error:', updateRes.error);
            }

            if (isComp) {
              const { data: taskData } = await supabase.from('learning_tasks').select('journey_id, topic_id').eq('id', id).single();
              if (taskData) {
                await supabase.from('learning_activities').insert({
                  id: crypto.randomUUID(),
                  user_id: userId,
                  journey_id: taskData.journey_id,
                  topic_id: taskData.topic_id,
                  task_id: id,
                  activity_type: 'task_completed',
                  created_at: now
                });
              }
            }
          } catch (e) {
            console.error('[/api/learning toggle_task] Exception:', e);
            useDb = false;
          }
        }

        const task = store.tasks.find(t => t.id === id);
        if (task) {
          task.completed = isComp;
          task.completed_at = isComp ? now : null;
          if (isComp) {
            store.activities.unshift({
              id: crypto.randomUUID(),
              user_id: userId,
              journey_id: task.journey_id,
              topic_id: task.topic_id,
              task_id: id,
              activity_type: 'task_completed',
              created_at: now
            });
          }
          saveStoreToFile();
        }

        return res.status(200).json({ ok: true, completed: isComp });
      }

      if (action === 'update_topic') {
        const { id, status, understanding_progress, title, description, priority } = req.body;
        if (!id) return res.status(400).json({ error: 'Topic id is required' });

        const now = new Date().toISOString();
        const updateData = { last_activity_at: now };
        if (status !== undefined) updateData.status = status;
        if (understanding_progress !== undefined) updateData.understanding_progress = Math.min(100, Math.max(0, Number(understanding_progress) || 0));
        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (priority !== undefined) updateData.priority = priority;

        if (useDb) {
          try {
            await supabase.from('learning_topics').update(updateData).eq('id', id).eq('user_id', userId);
            if (understanding_progress !== undefined) {
              const { data: topicData } = await supabase.from('learning_topics').select('journey_id').eq('id', id).single();
              await supabase.from('learning_activities').insert({
                id: crypto.randomUUID(),
                user_id: userId,
                journey_id: topicData?.journey_id,
                topic_id: id,
                activity_type: 'mastery_updated',
                created_at: now
              });
            }
          } catch { useDb = false; }
        }

        const topic = store.topics.find(t => t.id === id);
        if (topic) {
          Object.assign(topic, updateData);
          if (understanding_progress !== undefined) {
            store.activities.unshift({
              id: crypto.randomUUID(),
              user_id: userId,
              journey_id: topic.journey_id,
              topic_id: id,
              activity_type: 'mastery_updated',
              created_at: now
            });
          }
          saveStoreToFile();
        }

        return res.status(200).json({ ok: true });
      }

      if (action === 'update_journey') {
        const { id, title, description, personal_goal, status, target_date } = req.body;
        if (!id) return res.status(400).json({ error: 'Journey id is required' });

        const updateData = { updated_at: new Date().toISOString() };
        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description.trim();
        if (personal_goal !== undefined) updateData.personal_goal = personal_goal.trim();
        if (status !== undefined) updateData.status = status;
        if (target_date !== undefined) updateData.target_date = target_date;

        if (useDb) {
          try {
            await supabase.from('learning_journeys').update(updateData).eq('id', id).eq('user_id', userId);
          } catch { useDb = false; }
        }

        const journey = store.journeys.find(j => j.id === id);
        if (journey) {
          Object.assign(journey, updateData);
          saveStoreToFile();
        }

        return res.status(200).json({ ok: true });
      }
    }

    // ── DELETE ACTIONS ──────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { id, type } = req.body ?? req.query ?? {};
      if (!id || !type) return res.status(400).json({ error: 'id and type are required' });

      if (useDb) {
        try {
          if (type === 'journey') {
            await Promise.all([
              supabase.from('learning_journeys').delete().eq('id', id).eq('user_id', userId),
              supabase.from('learning_phases').delete().eq('journey_id', id).eq('user_id', userId),
              supabase.from('learning_topics').delete().eq('journey_id', id).eq('user_id', userId),
              supabase.from('learning_tasks').delete().eq('journey_id', id).eq('user_id', userId),
              supabase.from('learning_resources').delete().eq('journey_id', id).eq('user_id', userId),
              supabase.from('learning_notes').delete().eq('journey_id', id).eq('user_id', userId),
              supabase.from('journey_habit_connections').delete().eq('journey_id', id).eq('user_id', userId),
            ]);
          }
          if (type === 'phase') {
            await supabase.from('learning_phases').delete().eq('id', id).eq('user_id', userId);
          }
          if (type === 'topic') {
            await Promise.all([
              supabase.from('learning_topics').delete().eq('id', id).eq('user_id', userId),
              supabase.from('learning_tasks').delete().eq('topic_id', id).eq('user_id', userId),
              supabase.from('learning_resources').delete().eq('topic_id', id).eq('user_id', userId),
              supabase.from('learning_notes').delete().eq('topic_id', id).eq('user_id', userId),
            ]);
          }
          if (type === 'task') await supabase.from('learning_tasks').delete().eq('id', id).eq('user_id', userId);
          if (type === 'resource') await supabase.from('learning_resources').delete().eq('id', id).eq('user_id', userId);
          if (type === 'note') await supabase.from('learning_notes').delete().eq('id', id).eq('user_id', userId);
          if (type === 'habit_connection') await supabase.from('journey_habit_connections').delete().eq('id', id).eq('user_id', userId);
        } catch { useDb = false; }
      }

      // Always update local store to keep disk store in sync
      if (type === 'journey') {
        store.journeys = store.journeys.filter(j => j.id !== id);
        store.phases = store.phases.filter(p => p.journey_id !== id);
        store.topics = store.topics.filter(t => t.journey_id !== id);
        store.tasks = store.tasks.filter(t => t.journey_id !== id);
        store.resources = store.resources.filter(r => r.journey_id !== id);
        store.notes = store.notes.filter(n => n.journey_id !== id);
        store.habitConnections = store.habitConnections.filter(hc => hc.journey_id !== id);
        saveStoreToFile();
      }
      if (type === 'phase') {
        store.phases = store.phases.filter(p => p.id !== id);
        store.topics.forEach(t => { if (t.phase_id === id) t.phase_id = null; });
        saveStoreToFile();
      }
      if (type === 'topic') {
        store.topics = store.topics.filter(t => t.id !== id);
        store.tasks = store.tasks.filter(t => t.topic_id !== id);
        store.resources = store.resources.filter(r => r.topic_id !== id);
        store.notes = store.notes.filter(n => n.topic_id !== id);
        saveStoreToFile();
      }
      if (type === 'task') {
        store.tasks = store.tasks.filter(t => t.id !== id);
        saveStoreToFile();
      }
      if (type === 'resource') {
        store.resources = store.resources.filter(r => r.id !== id);
        saveStoreToFile();
      }
      if (type === 'note') {
        store.notes = store.notes.filter(n => n.id !== id);
        saveStoreToFile();
      }
      if (type === 'habit_connection') {
        store.habitConnections = store.habitConnections.filter(hc => hc.id !== id);
        saveStoreToFile();
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/learning] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
