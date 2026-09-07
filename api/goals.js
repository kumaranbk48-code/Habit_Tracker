import supabase from './db-client.js';
import { verifyUserToken } from './auth-helper.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GOALS_STORE_FILE = path.join(__dirname, '..', 'scratch', 'goals_store.json');

function loadGoalsStore() {
  try {
    if (fs.existsSync(GOALS_STORE_FILE)) {
      const content = fs.readFileSync(GOALS_STORE_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Error reading goals store file:', e);
  }
  return {};
}

function saveGoalsStore(store) {
  try {
    const dir = path.dirname(GOALS_STORE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GOALS_STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving goals store file:', e);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });

  const { user, error: userErr } = await verifyUserToken(token);
  if (userErr || !user) return res.status(401).json({ error: 'Invalid or expired token — please sign in again' });
  const user_id = user.id;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user_id)
        .order('target_date', { ascending: true });
      if (error) throw error;

      const store = loadGoalsStore();
      const userMeta = store[user_id] || {};
      const enriched = (data ?? []).map((g) => {
        const meta = userMeta[g.id] || {};
        const goal_type = g.goal_type || meta.goal_type || 'Target';
        const target_value = g.target_value !== undefined && g.target_value !== null ? g.target_value : (meta.target_value !== undefined ? meta.target_value : null);
        const current_value = g.current_value !== undefined && g.current_value !== null ? g.current_value : (meta.current_value !== undefined ? meta.current_value : 0);
        const start_value = g.start_value !== undefined && g.start_value !== null ? g.start_value : (meta.start_value !== undefined ? meta.start_value : 0);
        const unit = g.unit !== undefined && g.unit !== null ? g.unit : (meta.unit || '');
        const start_date = g.start_date || meta.start_date || (g.created_at ? g.created_at.split('T')[0] : new Date().toISOString().split('T')[0]);
        const bad_habit = g.bad_habit !== undefined && g.bad_habit !== null ? g.bad_habit : Boolean(meta.bad_habit);

        return {
          ...g,
          goal_type,
          target_value,
          current_value,
          start_value,
          unit,
          start_date,
          bad_habit,
        };
      });

      return res.status(200).json(enriched);
    }

    if (req.method === 'POST') {
      const {
        goal_name, target_date, status, goal_type = 'Target',
        current_value, target_value, start_value, unit = '',
        start_date = new Date().toISOString().split('T')[0], bad_habit = false
      } = req.body ?? {};
      if (!goal_name?.trim()) return res.status(400).json({ error: 'goal_name is required' });
      if (!target_date) return res.status(400).json({ error: 'target_date is required' });

      const hasQty = target_value !== null && target_value !== undefined && target_value !== '' && !isNaN(Number(target_value)) && Number(target_value) > 0;
      const parsedTargetVal = hasQty ? Number(target_value) : null;
      const parsedCurrentVal = hasQty ? (Number(current_value) || 0) : 0;
      const parsedStartVal = hasQty ? (Number(start_value) || 0) : 0;
      const parsedUnit = hasQty ? (unit?.trim() || '') : '';

      const payload = {
        user_id,
        goal_name: goal_name.trim(),
        target_date,
        status: status || 'Pending',
        goal_type,
        current_value: parsedCurrentVal,
        target_value: parsedTargetVal,
        start_value: parsedStartVal,
        unit: parsedUnit,
        start_date,
        bad_habit: Boolean(bad_habit)
      };

      // Defensively attempt insert with extra fields, fallback if column missing in DB
      let { data, error } = await supabase.from('goals').insert(payload).select().single();
      if (error && error.message?.includes('column')) {
        const fallbackPayload = { user_id, goal_name: goal_name.trim(), target_date, status: status || 'Pending', goal_type };
        let fallbackRes = await supabase.from('goals').insert(fallbackPayload).select().single();
        if (fallbackRes.error && fallbackRes.error.message?.includes('column')) {
          const basePayload = { user_id, goal_name: goal_name.trim(), target_date, status: status || 'Pending' };
          fallbackRes = await supabase.from('goals').insert(basePayload).select().single();
        }
        if (fallbackRes.error) throw fallbackRes.error;
        data = { ...fallbackRes.data, ...payload };
      } else if (error) {
        throw error;
      }

      // Persist in metadata store
      if (data?.id) {
        const store = loadGoalsStore();
        if (!store[user_id]) store[user_id] = {};
        store[user_id][data.id] = {
          goal_type: goal_type || 'Target',
          target_value: parsedTargetVal,
          current_value: parsedCurrentVal,
          start_value: parsedStartVal,
          unit: parsedUnit,
          start_date,
          bad_habit: Boolean(bad_habit)
        };
        saveGoalsStore(store);
        data = { ...data, ...store[user_id][data.id] };
      }

      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const {
        id, goal_name, target_date, status, goal_type,
        current_value, target_value, start_value, unit, start_date, bad_habit
      } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for update' });
      if (goal_name !== undefined && !goal_name?.trim()) return res.status(400).json({ error: 'goal_name is required' });

      const { data: milestones } = await supabase
        .from('goal_milestones')
        .select('completed')
        .eq('goal_id', id)
        .eq('user_id', user_id);

      let finalStatus = status;
      if (milestones && milestones.length > 0) {
        const done = milestones.filter(m => m.completed).length;
        finalStatus = done === milestones.length ? 'Completed' : done > 0 ? 'In Progress' : 'Pending';
      }

      const hasQty = target_value !== null && target_value !== undefined && target_value !== '' && !isNaN(Number(target_value)) && Number(target_value) > 0;
      const parsedTargetVal = hasQty ? Number(target_value) : null;
      const parsedCurrentVal = hasQty ? (Number(current_value) || 0) : 0;
      const parsedStartVal = hasQty ? (Number(start_value) || 0) : 0;
      const parsedUnit = hasQty ? (unit?.trim() || '') : '';

      const updatePayload = {
        ...(goal_name !== undefined && { goal_name: goal_name.trim() }),
        ...(target_date !== undefined && { target_date }),
        ...(finalStatus !== undefined && { status: finalStatus }),
        ...(goal_type !== undefined && { goal_type }),
        ...(target_value !== undefined && { target_value: parsedTargetVal }),
        ...(current_value !== undefined && { current_value: parsedCurrentVal }),
        ...(start_value !== undefined && { start_value: parsedStartVal }),
        ...(unit !== undefined && { unit: parsedUnit }),
        ...(start_date !== undefined && { start_date }),
        ...(bad_habit !== undefined && { bad_habit: Boolean(bad_habit) })
      };

      let { data, error } = await supabase
        .from('goals')
        .update(updatePayload)
        .eq('id', id)
        .eq('user_id', user_id)
        .select()
        .single();

      if (error && error.message?.includes('column')) {
        const fallbackPayload = {
          ...(goal_name !== undefined && { goal_name: goal_name.trim() }),
          ...(target_date !== undefined && { target_date }),
          ...(finalStatus !== undefined && { status: finalStatus }),
          ...(goal_type !== undefined && { goal_type })
        };
        let fallbackRes = await supabase
          .from('goals')
          .update(fallbackPayload)
          .eq('id', id)
          .eq('user_id', user_id)
          .select()
          .single();
        if (fallbackRes.error && fallbackRes.error.message?.includes('column')) {
          const basePayload = {
            ...(goal_name !== undefined && { goal_name: goal_name.trim() }),
            ...(target_date !== undefined && { target_date }),
            ...(finalStatus !== undefined && { status: finalStatus })
          };
          fallbackRes = await supabase
            .from('goals')
            .update(basePayload)
            .eq('id', id)
            .eq('user_id', user_id)
            .select()
            .single();
        }
        if (fallbackRes.error) throw fallbackRes.error;
        data = { ...fallbackRes.data, ...updatePayload };
      } else if (error) {
        throw error;
      }

      // Update in metadata store
      const store = loadGoalsStore();
      if (!store[user_id]) store[user_id] = {};
      const existing = store[user_id][id] || {};
      store[user_id][id] = {
        ...existing,
        ...(goal_type !== undefined && { goal_type }),
        ...(target_value !== undefined && { target_value: parsedTargetVal }),
        ...(current_value !== undefined && { current_value: parsedCurrentVal }),
        ...(start_value !== undefined && { start_value: parsedStartVal }),
        ...(unit !== undefined && { unit: parsedUnit }),
        ...(start_date !== undefined && { start_date }),
        ...(bad_habit !== undefined && { bad_habit: Boolean(bad_habit) })
      };
      saveGoalsStore(store);
      data = { ...data, ...store[user_id][id] };

      if (!data) return res.status(404).json({ error: 'Goal not found or access denied' });
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body ?? {};
      if (!id) return res.status(400).json({ error: 'id is required for delete' });
      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);
      if (error) throw error;

      const store = loadGoalsStore();
      if (store[user_id]?.[id]) {
        delete store[user_id][id];
        saveGoalsStore(store);
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/goals] error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
