import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import GoalCard from '../components/GoalCard';
import {
  Plus, Target, AlertCircle, Search, Filter, Layers, Activity, Flame, ShieldAlert, Sparkles
} from 'lucide-react';
import { useConfetti } from '../hooks/useConfetti';

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
    target_date: '',
    status: 'Pending',
    goal_type: 'Target',
    start_value: 0,
    current_value: 0,
    target_value: 100,
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
      setGoals(Array.isArray(data) ? data : []);
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

  const openAdd = () => {
    setEditing(null);
    setForm({
      goal_name: '',
      target_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      status: 'Pending',
      goal_type: 'Target',
      start_value: 0,
      current_value: 0,
      target_value: 100,
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
      start_value: goal.start_value ?? 0,
      current_value: goal.current_value ?? 0,
      target_value: goal.target_value ?? 100,
      unit: goal.unit || '',
      start_date: goal.start_date || new Date().toISOString().split('T')[0],
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
      const body = editing ? { ...form, id: editing.id } : form;
      const res = await fetch('/api/goals', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setToast({ message: editing ? 'Goal updated!' : 'Goal created! 🎯', type: 'success' });
        setModalOpen(false);
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
      const isCompleted = targetGoal && Number(newValue) >= Number(targetGoal.target_value);
      const newStatus = isCompleted ? 'Completed' : 'In Progress';

      const res = await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id, current_value: newValue, status: newStatus }),
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
  const filteredGoals = goals.filter((g) => {
    const matchesSearch = g.goal_name?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Target') return (g.goal_type || 'Target') === 'Target';
    if (activeFilter === 'Project') return g.goal_type === 'Project';
    if (activeFilter === 'Average') return g.goal_type === 'Average';
    if (activeFilter === 'Habit') return g.goal_type === 'Habit';
    if (activeFilter === 'Completed') return g.status === 'Completed';
    return true;
  });

  const counts = {
    All: goals.length,
    Target: goals.filter((g) => (g.goal_type || 'Target') === 'Target').length,
    Project: goals.filter((g) => g.goal_type === 'Project').length,
    Average: goals.filter((g) => g.goal_type === 'Average').length,
    Habit: goals.filter((g) => g.goal_type === 'Habit').length,
    Completed: goals.filter((g) => g.status === 'Completed').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-10">Goals & Tasks</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              Performance Analytics
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track targets, project roadmaps, rolling averages & habits with pace velocity.
          </p>
        </div>

        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-blue-500/20 active:scale-95 flex-shrink-0"
        >
          <Plus size={18} /> Add Goal
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-800/80 p-2 rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-xs">
        {/* Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'All', label: 'All', icon: Target },
            { id: 'Target', label: 'Target', icon: Target },
            { id: 'Project', label: 'Project', icon: Layers },
            { id: 'Average', label: 'Average', icon: Activity },
            { id: 'Habit', label: 'Habit', icon: Flame },
            { id: 'Completed', label: 'Done', icon: Sparkles },
          ].map((tab) => {
            const TabIcon = tab.icon;
            const active = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                }`}
              >
                <TabIcon size={14} />
                {tab.label}
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                  active ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                }`}>
                  {counts[tab.id] || 0}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search goals..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600">{fetchError}</p>
          <button onClick={fetchGoals} className="ml-auto text-xs font-medium text-red-600 underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              milestones={milestonesByGoal[goal.id] || []}
              onEdit={openEdit}
              onDelete={handleDelete}
              onAddMilestone={handleAddMilestone}
              onToggleMilestone={handleToggleMilestone}
              onDeleteMilestone={handleDeleteMilestone}
              onUpdateProgress={handleUpdateProgress}
            />
          ))}

          {filteredGoals.length === 0 && !fetchError && (
            <div className="col-span-full">
              <div className="bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-100 dark:border-slate-700/60 py-16 flex flex-col items-center gap-3 text-center px-4">
                <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Target size={28} />
                </div>
                <h3 className="text-slate-800 dark:text-slate-100 font-semibold text-lg">No goals found</h3>
                <p className="text-slate-400 text-sm max-w-sm">
                  {searchQuery || activeFilter !== 'All'
                    ? 'No goals match your current filter or search query.'
                    : 'Set a target number, project roadmap, or habit goal to start tracking progress.'}
                </p>
                <button
                  onClick={openAdd}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-xs"
                >
                  Create Goal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <TIcon size={18} className={selected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'} />
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
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-slate-100"
              placeholder="e.g. Save $8,000 or Launch Website"
            />
          </div>

          {/* Numeric fields for Target / Average */}
          {(form.goal_type === 'Target' || form.goal_type === 'Average') && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-xl border border-slate-100 dark:border-slate-700">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Start Value</label>
                <input
                  type="number"
                  step="any"
                  value={form.start_value}
                  onChange={(e) => setForm({ ...form, start_value: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Current Value</label>
                <input
                  type="number"
                  step="any"
                  value={form.current_value}
                  onChange={(e) => setForm({ ...form, current_value: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Target Value</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={form.target_value}
                  onChange={(e) => setForm({ ...form, target_value: e.target.value })}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Unit Symbol / Label (optional)</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="e.g. $, kg, hours, books, steps"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Target Due Date</label>
              <input
                type="date"
                required
                value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Status & Bad Habit */}
          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            <div className="pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.bad_habit}
                  onChange={(e) => setForm({ ...form, bad_habit: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
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
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60 flex items-center gap-2 shadow-sm"
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
