import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import {
  Plus, Check, Calendar, AlertCircle, PartyPopper, Sun, Sunset, Moon, CalendarDays, CalendarRange,
  Sparkles, BookOpen, Palette, Clock, Search, LayoutGrid, ListFilter, Play, RotateCcw, Flame
} from 'lucide-react';
import { useConfetti } from '../hooks/useConfetti';
import QuantityTracker from '../components/QuantityTracker';
import HabitGroupTable from '../components/HabitGroupTable';
import HabitTemplatesModal from '../components/HabitTemplatesModal';
import AIPromptModal from '../components/AIPromptModal';
import FocusTimerModal from '../components/FocusTimerModal';

const PRESET_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

const CATEGORY_BADGES = {
  Health: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200/60',
  Fitness: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200/60',
  Learning: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200/60',
  Productivity: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200/60',
  Mindfulness: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 border-teal-200/60',
  Other: 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200/60',
};

export default function Habits() {
  const { session } = useAuth();
  const [habits, setHabits] = useState([]);
  const [tracking, setTracking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [focusModalOpen, setFocusModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [poppingHabit, setPoppingHabit] = useState(null);
  const [perfectDay, setPerfectDay] = useState(false);

  // Filters & Layout View state
  const [activeRoutine, setActiveRoutine] = useState('All');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'grouped'
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState({
    habit_name: '',
    category: 'Health',
    target_frequency: 'Daily',
    tracking_type: 'boolean',
    target_quantity: '',
    unit: '',
    time_of_day: 'anytime',
    color: '#3b82f6',
    timer_duration: '',
  });

  const today = new Date().toISOString().split('T')[0];
  const { firePerfectDay, fireSmall } = useConfetti();

  const fetchData = useCallback(async () => {
    if (!session) return;
    setFetchError('');
    try {
      const [habitsRes, trackingRes] = await Promise.all([
        fetch('/api/habits', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch(`/api/tracking?date=${today}`, { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ]);
      if (!habitsRes.ok || !trackingRes.ok) {
        const e = await (!habitsRes.ok ? habitsRes : trackingRes).json().catch(() => ({}));
        setFetchError(e.error || 'Failed to load data. Please refresh.');
        return;
      }
      const habitsData = await habitsRes.json();
      const trackingData = await trackingRes.json();
      const h = Array.isArray(habitsData) ? habitsData : [];
      const t = Array.isArray(trackingData) ? trackingData : [];
      setHabits(h);
      setTracking(t);

      const completed = t.filter((r) => r.status === true).length;
      const wasPerfect = perfectDay;
      const nowPerfect = h.length > 0 && completed === h.length;
      setPerfectDay(nowPerfect);
      if (!wasPerfect && nowPerfect) {
        firePerfectDay();
      }
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
    } catch (err) {
      console.error(err);
      setFetchError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [session, today, perfectDay, firePerfectDay]);

  useEffect(() => {
    if (session) fetchData();
  }, [session]); // eslint-disable-line

  const openAdd = () => {
    setEditing(null);
    setForm({
      habit_name: '',
      category: 'Health',
      target_frequency: 'Daily',
      tracking_type: 'boolean',
      target_quantity: '',
      unit: '',
      time_of_day: 'anytime',
      color: '#3b82f6',
      timer_duration: '',
    });
    setModalOpen(true);
  };

  const openEdit = (habit) => {
    setEditing(habit);
    setForm({
      habit_name: habit.habit_name,
      category: habit.category,
      target_frequency: habit.target_frequency,
      tracking_type: habit.tracking_type || 'boolean',
      target_quantity: habit.target_quantity ?? '',
      unit: habit.unit || '',
      time_of_day: habit.time_of_day || 'anytime',
      color: habit.color || '#3b82f6',
      timer_duration: habit.timer_duration ?? '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formLoading) return;

    if (form.tracking_type === 'quantity') {
      if (!form.target_quantity || Number(form.target_quantity) <= 0) {
        setToast({ message: 'Please enter a target amount greater than 0.', type: 'error' });
        return;
      }
      if (!form.unit?.trim()) {
        setToast({ message: 'Please enter a unit (e.g. liters, pages, minutes).', type: 'error' });
        return;
      }
    }

    setFormLoading(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { ...form, id: editing.id } : form;
      const res = await fetch('/api/habits', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setToast({ message: editing ? 'Habit updated!' : 'Habit created! 🎯', type: 'success' });
        setModalOpen(false);
        fetchData();
      } else {
        const e = await res.json().catch(() => ({}));
        setToast({ message: e.error || 'Something went wrong — please try again.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error — check your connection.', type: 'error' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this habit?')) return;
    try {
      const res = await fetch('/api/habits', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setToast({ message: 'Habit deleted', type: 'success' });
        fetchData();
      } else {
        const e = await res.json().catch(() => ({}));
        setToast({ message: e.error || 'Failed to delete.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error.', type: 'error' });
    }
  };

  const toggleHabit = async (habitId) => {
    const existing = tracking.find((t) => t.habit_id === habitId);
    const newStatus = existing ? !existing.status : true;

    setPoppingHabit(habitId);
    setTimeout(() => setPoppingHabit(null), 400);

    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ habit_id: habitId, completion_date: today, status: newStatus }),
      });
      if (res.ok) {
        if (newStatus) fireSmall();
        fetchData();
      } else {
        setToast({ message: 'Failed to update habit status.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error.', type: 'error' });
    }
  };

  const handleLogQuantity = async (habitId, amount, reset = false) => {
    const wasComplete = tracking.find((t) => t.habit_id === habitId)?.status === true;
    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          habit_id: habitId,
          completion_date: today,
          action: reset ? 'reset' : 'add',
          amount: reset ? undefined : amount,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        if (!wasComplete && updated.status === true) fireSmall();
        fetchData();
      } else {
        const e = await res.json().catch(() => ({}));
        setToast({ message: e.error || 'Failed to update progress.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error — check your connection.', type: 'error' });
    }
  };

  const getQuantity = (habitId) => tracking.find((t) => t.habit_id === habitId)?.quantity_completed || 0;
  const isCompleted = (habitId) => tracking.find((t) => t.habit_id === habitId)?.status === true;

  const completedCount = tracking.filter((t) => t.status === true).length;
  const categories = ['Health', 'Fitness', 'Learning', 'Productivity', 'Mindfulness', 'Other'];
  const frequencies = ['Daily', 'Weekly', 'Monthly'];

  // Filtered Habits by Routine Window & Search
  const filteredHabits = habits.filter((h) => {
    const matchesSearch = h.habit_name?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeRoutine === 'All') return true;
    return (h.time_of_day || 'anytime') === activeRoutine.toLowerCase();
  });

  const dailyHabits = filteredHabits.filter((h) => h.target_frequency !== 'Weekly' && h.target_frequency !== 'Monthly');
  const weeklyHabits = filteredHabits.filter((h) => h.target_frequency === 'Weekly');
  const monthlyHabits = filteredHabits.filter((h) => h.target_frequency === 'Monthly');

  return (
    <div className="space-y-6">
      {/* Header & Main Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">My Routines & Habits</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              {habits.length} Habits Active
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track daily rituals, focus sessions, and build sustainable long-term streaks.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFocusModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl font-semibold text-xs transition-all shadow-md shadow-blue-500/20 active:scale-95"
          >
            <Play size={14} className="fill-white text-white" /> Focus Timer
          </button>

          <button
            onClick={() => setTemplatesOpen(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl font-semibold text-xs transition-all shadow-md shadow-blue-500/20 active:scale-95"
          >
            <BookOpen size={14} className="text-white" /> Templates
          </button>

          <button
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl font-semibold text-xs transition-all shadow-md shadow-blue-500/20 active:scale-95"
          >
            <Sparkles size={14} className="text-white" /> AI Assistant
          </button>

          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-2 rounded-xl font-semibold text-xs transition-all shadow-md shadow-blue-500/20 active:scale-95"
          >
            <Plus size={16} /> Add Habit
          </button>
        </div>
      </div>

      {/* Routine Time of Day Tabs & Layout View Switcher */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-800/80 p-2 rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-xs">
        {/* Routine Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'All', label: 'All Routines', icon: Clock },
            { id: 'Morning', label: 'Morning 🌅', icon: Sun },
            { id: 'Afternoon', label: 'Afternoon ☀️', icon: Sunset },
            { id: 'Evening', label: 'Evening 🌙', icon: Moon },
            { id: 'Anytime', label: 'Anytime', icon: Calendar },
          ].map((tab) => {
            const TabIcon = tab.icon;
            const active = activeRoutine === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveRoutine(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                }`}
              >
                <TabIcon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* View Switcher & Search Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search habits..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grouped' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Table Routine View"
            >
              <ListFilter size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Progress banner */}
      {habits.length > 0 && (
        <div
          className={`p-4 rounded-2xl border transition-all duration-300 ${
            perfectDay
              ? 'shimmer-bg text-white border-transparent shadow-lg'
              : 'bg-white dark:bg-slate-800/90 border-slate-100 dark:border-slate-700/60 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-semibold ${perfectDay ? 'text-white' : 'text-slate-700 dark:text-slate-200'}`}>
              {perfectDay ? (
                <span className="flex items-center gap-2">
                  <PartyPopper size={18} /> Perfect Day Achieved! All routines completed 🎉
                </span>
              ) : (
                `Today's Routine Progress — ${completedCount} of ${habits.length} completed`
              )}
            </span>
            <span className={`text-sm font-bold ${perfectDay ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`}>
              {habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0}%
            </span>
          </div>
          {!perfectDay && (
            <div className="h-2 bg-slate-100 dark:bg-slate-700/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-teal-400 rounded-full transition-all duration-500"
                style={{ width: `${habits.length > 0 ? (completedCount / habits.length) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>
      )}

      {fetchError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600">{fetchError}</p>
          <button onClick={fetchData} className="ml-auto text-xs font-medium text-red-600 underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {filteredHabits.length === 0 && !fetchError ? (
            <div className="bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-100 dark:border-slate-700/60 py-16 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Calendar size={28} />
                </div>
                <h3 className="text-slate-800 dark:text-slate-100 font-semibold text-lg">No habits found</h3>
                <p className="text-slate-400 text-sm max-w-sm">
                  {searchQuery || activeRoutine !== 'All'
                    ? `No habits match your ${activeRoutine} filter or search query.`
                    : 'Click "Add Habit" or choose from Templates to start building your routine.'}
                </p>
                <button
                  onClick={openAdd}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-xs"
                >
                  Create Habit
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            /* Visual Card Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredHabits.map((habit) => {
                const done = isCompleted(habit.id);
                const quantityDone = getQuantity(habit.id);

                return (
                  <div
                    key={habit.id}
                    className={`bg-white dark:bg-slate-800/90 rounded-2xl p-5 shadow-sm border transition-all duration-200 flex flex-col justify-between group ${
                      done
                        ? 'border-blue-200/80 dark:border-blue-900/40 bg-gradient-to-b from-blue-50/20 to-transparent'
                        : 'border-slate-100 dark:border-slate-700/60 hover:shadow-md'
                    } ${poppingHabit === habit.id ? 'habit-pop' : ''}`}
                  >
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: habit.color || '#3b82f6' }}
                          />
                          <div>
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold border mb-1 ${
                              CATEGORY_BADGES[habit.category] || CATEGORY_BADGES.Other
                            }`}>
                              {habit.category}
                            </span>
                            <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-base leading-tight">
                              {habit.habit_name}
                            </h3>
                          </div>
                        </div>

                        {habit.time_of_day && habit.time_of_day !== 'anytime' && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] uppercase font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                            {habit.time_of_day}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500 mb-4">
                        <span className="flex items-center gap-1">
                          <Flame size={13} className="text-amber-500" />
                          {habit.target_frequency}
                        </span>
                        {habit.timer_duration && (
                          <span className="flex items-center gap-1 text-blue-500">
                            <Clock size={13} />
                            {habit.timer_duration}m Focus
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Completion Action */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                      {habit.tracking_type === 'quantity' ? (
                        <QuantityTracker
                          current={quantityDone}
                          target={habit.target_quantity}
                          unit={habit.unit}
                          onAdd={(amt) => handleLogQuantity(habit.id, amt)}
                          onReset={() => handleLogQuantity(habit.id, null, true)}
                        />
                      ) : (
                        <button
                          onClick={() => toggleHabit(habit.id)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 border ${
                            done
                              ? 'bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500 text-white shadow-md shadow-blue-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          <Check size={15} className={done ? 'text-white' : 'text-slate-400'} />
                          {done ? 'Completed ✓' : 'Mark Done'}
                        </button>
                      )}

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(habit)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          title="Edit Habit"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(habit.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          title="Delete Habit"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table Routine View */
            <>
              <HabitGroupTable
                title="Daily Habits"
                icon={Sun}
                habits={dailyHabits}
                poppingHabit={poppingHabit}
                isCompleted={isCompleted}
                getQuantity={getQuantity}
                onToggle={toggleHabit}
                onLogQuantity={handleLogQuantity}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
              <HabitGroupTable
                title="Weekly Habits"
                icon={CalendarDays}
                habits={weeklyHabits}
                poppingHabit={poppingHabit}
                isCompleted={isCompleted}
                getQuantity={getQuantity}
                onToggle={toggleHabit}
                onLogQuantity={handleLogQuantity}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
              <HabitGroupTable
                title="Monthly Habits"
                icon={CalendarRange}
                habits={monthlyHabits}
                poppingHabit={poppingHabit}
                isCompleted={isCompleted}
                getQuantity={getQuantity}
                onToggle={toggleHabit}
                onLogQuantity={handleLogQuantity}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            </>
          )}
        </>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Habit' : 'Add New Habit'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Habit Name</label>
            <input
              required
              value={form.habit_name}
              onChange={(e) => setForm({ ...form, habit_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm dark:bg-slate-800 dark:text-slate-100"
              placeholder="e.g. Morning Exercise or Read 20 Pages"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Routine Time</label>
              <select
                value={form.time_of_day || 'anytime'}
                onChange={(e) => setForm({ ...form, time_of_day: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="anytime">Anytime</option>
                <option value="morning">Morning 🌅</option>
                <option value="afternoon">Afternoon ☀️</option>
                <option value="evening">Evening 🌙</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Frequency</label>
              <select
                value={form.target_frequency}
                onChange={(e) => setForm({ ...form, target_frequency: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
              >
                {frequencies.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Focus Timer (Mins)</label>
              <input
                type="number"
                min="1"
                max="180"
                value={form.timer_duration || ''}
                onChange={(e) => setForm({ ...form, timer_duration: e.target.value })}
                placeholder="e.g. 25"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Color Palette Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Accent Color</label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    form.color === c ? 'scale-125 ring-2 ring-offset-2 ring-blue-500' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Evaluation Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Evaluation Type</label>
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setForm({ ...form, tracking_type: 'boolean' })}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  form.tracking_type === 'boolean'
                    ? 'bg-white dark:bg-slate-700 shadow-xs text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Simple (Done/Not Done)
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, tracking_type: 'quantity' })}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  form.tracking_type === 'quantity'
                    ? 'bg-white dark:bg-slate-700 shadow-xs text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Numeric (e.g. liters, pages)
              </button>
            </div>
          </div>

          {form.tracking_type === 'quantity' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Amount</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  value={form.target_quantity}
                  onChange={(e) => setForm({ ...form, target_quantity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
                  placeholder="e.g. 3"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Unit</label>
                <input
                  required
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
                  placeholder="e.g. liters, pages"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60 flex items-center gap-2 shadow-xs"
            >
              {formLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {editing ? 'Update Habit' : 'Save Habit'}
            </button>
          </div>
        </form>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <HabitTemplatesModal
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        onAddHabit={async (habitObj) => {
          await fetch('/api/habits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify(habitObj),
          });
          fetchData();
        }}
      />

      <AIPromptModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onAddHabits={async (newHabits) => {
          for (const h of newHabits) {
            await fetch('/api/habits', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify(h),
            });
          }
          fetchData();
        }}
      />

      <FocusTimerModal
        open={focusModalOpen}
        onClose={() => setFocusModalOpen(false)}
        habits={habits}
        onCompleteHabit={(habit) => {
          toggleHabit(habit.id);
          setFocusModalOpen(false);
        }}
      />
    </div>
  );
}
