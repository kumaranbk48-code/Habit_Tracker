import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import GoalCard from '../components/GoalCard';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';
import {
  Plus, Target, AlertCircle, Search, Filter, Layers, Activity, Flame, ShieldAlert, Sparkles,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfetti } from '../hooks/useConfetti';
import HabizLoader from '../components/HabizLoader';

const GOALS_META_KEY = 'habit_tracker_goals_meta';

function getLocalGoalsMeta() {
  try {
    return JSON.parse(localStorage.getItem(GOALS_META_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveLocalGoalsMeta(meta) {
  try {
    localStorage.setItem(GOALS_META_KEY, JSON.stringify(meta));
  } catch {}
}

export default function Goals() {
  const { session } = useAuth();
  const [goals, setGoals] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const [form, setForm] = useState({
    goal_name: '',
    target_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    status: 'Pending',
    goal_type: 'Target',
    start_value: '',
    current_value: '',
    target_value: '',
    unit: '',
    start_date: new Date().toISOString().split('T')[0],
    bad_habit: false,
  });

  const { fireMilestone } = useConfetti();

  const fetchGoals = useCallback(async () => {
    if (!session) return;
    setFetchError('');
    try {
      const [goalsRes, milestonesRes] = await Promise.all([
        fetch('/api/goals', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/milestones', { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ]);
      if (!goalsRes.ok) {
        const errData = await goalsRes.json().catch(() => ({}));
        setFetchError(errData.error || 'Failed to load goals. Please refresh.');
        return;
      }
      const data = await goalsRes.json();
      const milestonesData = milestonesRes.ok ? await milestonesRes.json() : [];

      const localMeta = getLocalGoalsMeta();
      const rawGoals = Array.isArray(data) ? data : [];
      const enrichedGoals = rawGoals.map((g) => {
        const meta = localMeta[g.id] || {};
        return {
          ...g,
          goal_type: meta.goal_type || g.goal_type || 'Target',
          target_value: meta.target_value !== undefined ? meta.target_value : (g.target_value !== undefined && g.target_value !== null ? g.target_value : null),
          current_value: meta.current_value !== undefined ? meta.current_value : (g.current_value !== undefined && g.current_value !== null ? g.current_value : 0),
          start_value: meta.start_value !== undefined ? meta.start_value : (g.start_value !== undefined && g.start_value !== null ? g.start_value : 0),
          unit: meta.unit !== undefined ? meta.unit : (g.unit || ''),
          start_date: meta.start_date || g.start_date || (g.created_at ? g.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
          bad_habit: meta.bad_habit !== undefined ? meta.bad_habit : (g.bad_habit !== undefined ? g.bad_habit : false),
        };
      });

      setGoals(enrichedGoals);
      setMilestones(Array.isArray(milestonesData) ? milestonesData : []);
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
    } catch (err) {
      console.error(err);
      setFetchError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) fetchGoals();
  }, [session, fetchGoals]);

  const openAdd = (typeOverride) => {
    setEditing(null);
    const defaultGenre = (typeof typeOverride === 'string' && typeOverride) 
      || (['Target', 'Project', 'Average', 'Habit'].includes(activeFilter) ? activeFilter : 'Target');
    setForm({
      goal_name: '',
      target_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      status: 'Pending',
      goal_type: defaultGenre,
      start_value: '',
      current_value: '',
      target_value: '',
      unit: '',
      start_date: new Date().toISOString().split('T')[0],
      bad_habit: false,
    });
    setModalOpen(true);
  };

  const openEdit = (goal) => {
    setEditing(goal);
    setForm({
      goal_name: goal.goal_name,
      target_date: goal.target_date || '',
      status: goal.status || 'Pending',
      goal_type: goal.goal_type || 'Target',
      start_value: goal.start_value !== null && goal.start_value !== undefined ? goal.start_value : '',
      current_value: goal.current_value !== null && goal.current_value !== undefined ? goal.current_value : '',
      target_value: goal.target_value !== null && goal.target_value !== undefined ? goal.target_value : '',
      unit: goal.unit || '',
      start_date: goal.start_date || (goal.created_at ? goal.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
      bad_habit: Boolean(goal.bad_habit),
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formLoading) return;
    setFormLoading(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const hasQty = form.target_value !== '' && form.target_value !== null && form.target_value !== undefined && !isNaN(Number(form.target_value)) && Number(form.target_value) > 0;
      const cleanForm = {
        ...form,
        target_value: hasQty ? Number(form.target_value) : null,
        current_value: hasQty ? (Number(form.current_value) || 0) : 0,
        start_value: hasQty ? (Number(form.start_value) || 0) : 0,
        unit: hasQty ? (form.unit?.trim() || '') : '',
      };
      const body = editing ? { ...cleanForm, id: editing.id } : cleanForm;
      const res = await fetch('/api/goals', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const savedData = await res.json().catch(() => ({}));
        const goalId = savedData?.id || editing?.id;
        if (goalId) {
          const localMeta = getLocalGoalsMeta();
          localMeta[goalId] = {
            goal_type: form.goal_type || 'Target',
            target_value: hasQty ? Number(form.target_value) : null,
            current_value: hasQty ? (Number(form.current_value) || 0) : 0,
            start_value: hasQty ? (Number(form.start_value) || 0) : 0,
            unit: hasQty ? (form.unit?.trim() || '') : '',
            start_date: form.start_date,
            bad_habit: Boolean(form.bad_habit),
          };
          saveLocalGoalsMeta(localMeta);
        }
        setToast({ message: editing ? 'Goal updated!' : 'Goal created! 🎯', type: 'success' });
        setModalOpen(false);
        if (!editing && activeFilter !== 'All' && activeFilter !== form.goal_type) {
          setActiveFilter(form.goal_type);
        }
        fetchGoals();
      } else {
        const errData = await res.json().catch(() => ({}));
        setToast({ message: errData.error || 'Something went wrong — please try again.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error — check your connection.', type: 'error' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this goal?')) return;
    try {
      const res = await fetch('/api/goals', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const localMeta = getLocalGoalsMeta();
        if (localMeta[id]) {
          delete localMeta[id];
          saveLocalGoalsMeta(localMeta);
        }
        setToast({ message: 'Goal deleted', type: 'success' });
        fetchGoals();
      } else {
        const errData = await res.json().catch(() => ({}));
        setToast({ message: errData.error || 'Failed to delete goal.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error — check your connection.', type: 'error' });
    }
  };

  const handleUpdateProgress = async (id, newValue) => {
    try {
      const targetGoal = goals.find((g) => g.id === id);
      const isCompleted = targetGoal && targetGoal.target_value && Number(newValue) >= Number(targetGoal.target_value);
      const newStatus = isCompleted ? 'Completed' : 'In Progress';

      const localMeta = getLocalGoalsMeta();
      if (localMeta[id]) {
        localMeta[id].current_value = Number(newValue);
        saveLocalGoalsMeta(localMeta);
      }

      const res = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          id,
          goal_name: targetGoal?.goal_name,
          target_date: targetGoal?.target_date,
          goal_type: targetGoal?.goal_type || 'Target',
          current_value: newValue,
          status: newStatus
        }),
      });
      if (res.ok) {
        if (isCompleted && targetGoal?.status !== 'Completed') {
          fireMilestone();
          setToast({ message: 'Goal Reached! 🎉 Excellent job!', type: 'success' });
        }
        fetchGoals();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkComplete = async (id, undo = false) => {
    try {
      const targetGoal = goals.find((g) => g.id === id);
      if (!targetGoal) return;
      const newStatus = undo ? 'In Progress' : 'Completed';

      const res = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          id,
          goal_name: targetGoal.goal_name,
          target_date: targetGoal.target_date,
          goal_type: targetGoal.goal_type || 'Target',
          status: newStatus,
        }),
      });
      if (res.ok) {
        if (!undo) {
          fireMilestone();
          setToast({ message: 'Goal Completed! 🎉 Great work!', type: 'success' });
        } else {
          setToast({ message: 'Goal reverted to In Progress.', type: 'success' });
        }
        fetchGoals();
      } else {
        const errData = await res.json().catch(() => ({}));
        setToast({ message: errData.error || 'Failed to update goal.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error — check your connection.', type: 'error' });
    }
  };

  const handleToggleHold = async (id, currentStatus) => {
    const targetGoal = goals.find((g) => g.id === id);
    if (!targetGoal) return;
    const isHold = currentStatus === 'On Hold' || targetGoal.status === 'On Hold';
    const newStatus = isHold ? 'In Progress' : 'On Hold';

    try {
      const res = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          id,
          goal_name: targetGoal.goal_name,
          target_date: targetGoal.target_date,
          goal_type: targetGoal.goal_type || 'Target',
          status: newStatus,
        }),
      });
      if (res.ok) {
        setToast({
          message: isHold ? 'Goal resumed! Back in progress.' : 'Goal placed on hold.',
          type: 'success',
        });
        fetchGoals();
      } else {
        const errData = await res.json().catch(() => ({}));
        setToast({ message: errData.error || 'Failed to update goal status.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error — check your connection.', type: 'error' });
    }
  };

  const handleAddMilestone = async (goal_id, title) => {
    try {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ goal_id, title }),
      });
      if (res.ok) {
        fetchGoals();
      } else {
        const e = await res.json().catch(() => ({}));
        setToast({ message: e.error || 'Failed to add milestone.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error — check your connection.', type: 'error' });
    }
  };

  const handleToggleMilestone = async (id, completed, goal_id) => {
    const goalMilestones = milestones.filter((m) => m.goal_id === goal_id);
    const willBeDone = goalMilestones.filter((m) => (m.id === id ? completed : m.completed)).length;
    const willComplete = completed && goalMilestones.length > 0 && willBeDone === goalMilestones.length;

    try {
      const res = await fetch('/api/milestones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id, completed }),
      });
      if (res.ok) {
        if (willComplete) {
          fireMilestone();
          setToast({ message: 'Goal completed! 🎉 All milestones done.', type: 'success' });
        }
        fetchGoals();
      } else {
        const e = await res.json().catch(() => ({}));
        setToast({ message: e.error || 'Failed to update milestone.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error — check your connection.', type: 'error' });
    }
  };

  const handleDeleteMilestone = async (id) => {
    try {
      const res = await fetch('/api/milestones', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        fetchGoals();
      } else {
        const e = await res.json().catch(() => ({}));
        setToast({ message: e.error || 'Failed to delete milestone.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error — check your connection.', type: 'error' });
    }
  };

  const milestonesByGoal = {};
  for (const m of milestones) {
    if (!milestonesByGoal[m.goal_id]) milestonesByGoal[m.goal_id] = [];
    milestonesByGoal[m.goal_id].push(m);
  }

  // Filter & Search logic
  const trimmedQuery = searchQuery.trim().toLowerCase();
  const filteredGoals = goals.filter((g) => {
    if (trimmedQuery) {
      const matchName = g.goal_name?.toLowerCase().includes(trimmedQuery);
      const matchType = g.goal_type?.toLowerCase().includes(trimmedQuery);
      const matchUnit = g.unit?.toLowerCase().includes(trimmedQuery);
      const matchStatus = g.status?.toLowerCase().includes(trimmedQuery);
      if (!matchName && !matchType && !matchUnit && !matchStatus) return false;
    }
    if (activeFilter === 'Active') return g.status !== 'Completed' && g.status !== 'On Hold';
    if (activeFilter === 'Completed') return g.status === 'Completed';
    if (activeFilter === 'On Hold') return g.status === 'On Hold';
    return true;
  });

  const counts = {
    All: goals.length,
    Active: goals.filter((g) => g.status !== 'Completed' && g.status !== 'On Hold').length,
    Completed: goals.filter((g) => g.status === 'Completed').length,
    'On Hold': goals.filter((g) => g.status === 'On Hold').length,
  };

  // Calculate overall goal completion percentage for the inspiration gauge
  const totalGoalItems = goals.length;
  const completedGoalsCount = counts.Completed;
  const overallGoalPercent = totalGoalItems > 0 ? Math.round((completedGoalsCount / totalGoalItems) * 100) : 0;

  return (
    <div className="space-y-6 page-enter pb-10">
      {/* ── 1. Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Goals
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Turn intent into progress.
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-[#178274] hover:bg-[#136c60] text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-lg shadow-teal-950/40 flex-shrink-0 cursor-pointer"
        >
          <Plus size={16} /> New Goal
        </motion.button>
      </div>

      {/* ── 2. Filter Pills & Search Bar ── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {['All', 'Active', 'Completed', 'On Hold'].map((tab) => {
            const isSelected = activeFilter === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`relative px-3.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                  isSelected ? 'text-teal-300 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="activeFilterPill"
                    className="absolute inset-0 bg-[#153834] border border-teal-500/35 rounded-xl shadow-xs"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                )}
                {!isSelected && (
                  <div className="absolute inset-0 bg-white/[0.03] border border-white/[0.05] rounded-xl pointer-events-none" />
                )}
                <span className="relative z-10">{tab}</span>
                <span
                  className={`relative z-10 text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none transition-colors ${
                    isSelected
                      ? 'bg-teal-500/25 text-teal-200'
                      : 'bg-white/[0.06] text-slate-400'
                  }`}
                >
                  {counts[tab] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search goals..."
            className="w-full pl-8 pr-8 py-1.5 text-xs bg-black/30 border border-white/[0.08] rounded-xl outline-none focus:border-teal-500/50 text-slate-100 placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer p-0.5"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── 3. Inspiration Feature Banner (Matching Reference) ── */}
      <div className="habiz-panel p-6 sm:p-7 rounded-3xl relative overflow-hidden flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div
          className="absolute right-0 top-0 bottom-0 w-full sm:w-1/2 opacity-25 pointer-events-none bg-cover bg-right mix-blend-screen"
          style={{ backgroundImage: 'url(/assets/hero-landscape.jpg)' }}
        />

        <div className="relative z-10 space-y-2">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/15 border border-teal-500/25 text-teal-300 flex items-center justify-center mb-2">
            <Target size={20} />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Make consistency a lifestyle.
          </h2>
          <p className="text-xs text-slate-400">
            Small steps, big results.
          </p>
        </div>

        {/* Circular Progress Gauge */}
        <div className="relative z-10 flex-shrink-0 flex items-center gap-4">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
              <circle
                cx="50"
                cy="50"
                r="42"
                stroke="#1bb59c"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${(overallGoalPercent / 100) * 264} 264`}
                strokeLinecap="round"
                className="ring-progress"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg sm:text-xl font-bold text-white">{overallGoalPercent}%</span>
            </div>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-3 p-4 bg-red-950/40 border border-red-800/60 rounded-2xl">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-300">{fetchError}</p>
          <button onClick={fetchGoals} className="ml-auto text-xs font-semibold text-red-300 underline">
            Retry
          </button>
        </div>
      )}

      {/* ── 4. Goals Grid (Career Growth, Health & Fitness, etc.) ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-white">
            {activeFilter === 'All'
              ? 'All Goals'
              : activeFilter === 'Active'
              ? 'Active Goals'
              : activeFilter === 'Completed'
              ? 'Completed Goals'
              : 'Goals On Hold'}
          </h3>
          <span className="text-xs text-slate-400">
            {filteredGoals.length} {filteredGoals.length === 1 ? 'Goal' : 'Goals'}
          </span>
        </div>

        {loading ? (
          <HabizLoader size="md" text="Loading goals..." />
        ) : (
          <AnimatePresence mode="wait">
            {filteredGoals.length === 0 ? (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="habiz-panel p-8 text-center rounded-3xl space-y-3"
              >
                <Target size={28} className="mx-auto text-teal-400/70" />
                <h4 className="text-sm font-bold text-white">
                  {searchQuery.trim()
                    ? 'No goals match your search'
                    : activeFilter === 'Completed'
                    ? 'No completed goals yet'
                    : activeFilter === 'On Hold'
                    ? 'No goals currently on hold'
                    : activeFilter === 'Active'
                    ? 'No active goals right now'
                    : 'No goals found'}
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchQuery.trim()
                    ? `No goals found matching "${searchQuery.trim()}". Try searching for another keyword or clear search.`
                    : activeFilter === 'Completed'
                    ? 'Goals you finish will appear here. Keep building momentum!'
                    : activeFilter === 'On Hold'
                    ? 'Goals paused or placed on hold will appear here for you to resume anytime.'
                    : 'Set targets for career growth, fitness routines, personal projects, or habits.'}
                </p>
                {searchQuery.trim() ? (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-xs font-bold text-teal-300 bg-teal-950/70 border border-teal-500/30 px-4 py-2 rounded-xl hover:bg-teal-900 transition-colors cursor-pointer"
                  >
                    Clear Search
                  </button>
                ) : goals.length === 0 && activeFilter === 'All' ? (
                  <button
                    onClick={openAdd}
                    className="text-xs font-bold text-teal-300 bg-teal-950/70 border border-teal-500/30 px-4 py-2 rounded-xl hover:bg-teal-900 transition-colors cursor-pointer"
                  >
                    + Create Your First Goal
                  </button>
                ) : null}
              </motion.div>
            ) : (
              <motion.div
                key="goals-grid"
                layout
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
              >
                <AnimatePresence mode="popLayout">
                  {filteredGoals.map((goal) => (
                    <motion.div
                      key={goal.id}
                      layout
                      initial={{ opacity: 0, scale: 0.92, y: 14 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 10 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                    >
                      <GoalCard
                        goal={goal}
                        milestones={milestonesByGoal[goal.id] || []}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onAddMilestone={handleAddMilestone}
                        onToggleMilestone={handleToggleMilestone}
                        onDeleteMilestone={handleDeleteMilestone}
                        onUpdateProgress={handleUpdateProgress}
                        onMarkComplete={handleMarkComplete}
                        onToggleHold={handleToggleHold}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Add / Edit Goal Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Goal' : 'Add New Tracker Goal'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tracker Type Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Goal Tracker Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { type: 'Target', label: 'Target', desc: 'Number by Date (e.g. Save $5k)', icon: Target },
                { type: 'Project', label: 'Project', desc: 'Actions by Date (Roadmap)', icon: Layers },
                { type: 'Average', label: 'Average', desc: 'Repeating Number (Sleep hrs)', icon: Activity },
                { type: 'Habit', label: 'Habit', desc: 'Repeating Action (Streaks)', icon: Flame },
              ].map((t) => {
                const TIcon = t.icon;
                const selected = form.goal_type === t.type;
                return (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => setForm({ ...form, goal_type: t.type })}
                    className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
                      selected
                        ? 'border-[#3d7a75] bg-[#e2f0ef] dark:bg-[#14302e] text-[#2c6560] dark:text-[#7cc3bb] shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <TIcon size={18} className={selected ? 'text-[#3d7a75] dark:text-[#5fae9e]' : 'text-slate-400'} />
                    <div>
                      <p className="text-xs font-bold">{t.label}</p>
                      <p className="text-[10px] text-slate-400 leading-tight mt-0.5">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Goal Name</label>
            <input
              required
              value={form.goal_name}
              onChange={(e) => setForm({ ...form, goal_name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none dark:bg-slate-800 dark:text-slate-100"
              placeholder={
                form.goal_type === 'Project'
                  ? 'e.g. Launch Portfolio Website or Complete Redesign'
                  : form.goal_type === 'Habit'
                  ? 'e.g. 30-Day Morning Workout or Daily Reading'
                  : form.goal_type === 'Average'
                  ? 'e.g. Sleep 8 Hours or Study 2 Hours Daily'
                  : 'e.g. Save $8,000 or Pass Certification'
              }
            />
          </div>

          {/* Optional Numeric / Quantity Tracker */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Quantity & Progress <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {form.goal_type === 'Project'
                    ? 'Project roadmap tracks milestones. Set quantity only if you need numeric tracking.'
                    : form.goal_type === 'Habit'
                    ? 'Track streak days or count. Leave blank if you only want milestone check-ins.'
                    : 'Leave blank if you don’t need a numerical target (removes the quick log counter).'}
                </p>
              </div>
              {form.target_value && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, target_value: '', start_value: '', current_value: '', unit: '' })}
                  className="text-[11px] text-[#3d7a75] dark:text-[#5fae9e] hover:underline font-medium flex-shrink-0"
                >
                  Clear quantity
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Start Value</label>
                <input
                  type="number"
                  step="any"
                  value={form.start_value}
                  onChange={(e) => setForm({ ...form, start_value: e.target.value })}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-[#3d7a75] dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Current Value</label>
                <input
                  type="number"
                  step="any"
                  value={form.current_value}
                  onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-[#3d7a75] dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Target Value</label>
                <input
                  type="number"
                  step="any"
                  value={form.target_value}
                  onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                  placeholder="e.g. 100"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-[#3d7a75] dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Unit Symbol / Label (optional)</label>
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="e.g. $, kg, hours, books, sessions, days"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-[#3d7a75] dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
              <CustomDatePicker
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Target Due Date</label>
              <CustomDatePicker
                required
                value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Status & Bad Habit */}
          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
              <CustomSelect
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
              </CustomSelect>
            </div>

            <div className="pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.bad_habit}
                  onChange={(e) => setForm({ ...form, bad_habit: e.target.checked })}
                  className="w-4 h-4 text-[#3d7a75] rounded border-slate-300 focus:ring-[#3d7a75] accent-[#3d7a75] dark:accent-[#5fae9e]"
                />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Limit / Bad Habit Goal
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#3d7a75] hover:bg-[#2f5f5b] rounded-xl transition-colors disabled:opacity-60 flex items-center gap-2 shadow-sm"
            >
              {formLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Update Goal' : 'Create Goal'}
            </button>
          </div>
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
