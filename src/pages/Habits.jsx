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
import CustomSelect from '../components/CustomSelect';

const PRESET_COLORS = ['#3d7a75', '#6b8e6a', '#c99a52', '#b3574f', '#7570ab', '#b6708f', '#4a95a3', '#6b7785'];

const isOldBlue = (c) => !c || ['#3b82f6', '#2563eb', '#1d4ed8', '#60a5fa', '#93c5fd', '#1e40af', '#1e3a8a', '#0075ff', '#38bdf8', '#0284c7'].includes(String(c).toLowerCase().trim());
const getHabitColor = (h) => (!h?.color || isOldBlue(h.color)) ? '#3d7a75' : h.color;

const CATEGORY_BADGES = {
  Health: 'bg-[#e3f3ee] text-[#2f6b5c] dark:bg-[#1c3a32] dark:text-[#7fd1b9] border border-[#e3f3ee] dark:border-[#1c3a32]',
  Fitness: 'bg-[#f5ecdb] text-[#8a5a24] dark:bg-[#3a2c14] dark:text-[#dcb579] border border-[#f5ecdb] dark:border-[#3a2c14]',
  Learning: 'bg-[#eae7f5] text-[#4b4a8a] dark:bg-[#232042] dark:text-[#b0aee0] border border-[#eae7f5] dark:border-[#232042]',
  Productivity: 'bg-[#e4ecf5] text-[#2f5378] dark:bg-[#182a40] dark:text-[#8fb4d9] border border-[#e4ecf5] dark:border-[#182a40]',
  Mindfulness: 'bg-[#e2f0ef] text-[#2c6560] dark:bg-[#14302e] dark:text-[#7cc3bb] border border-[#e2f0ef] dark:border-[#14302e]',
  Other: 'bg-[#f1f3f5] text-[#4b5563] dark:bg-[#2a343d] dark:text-[#cbd5e1] border border-[#f1f3f5] dark:border-[#2a343d]',
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
    color: '#3d7a75',
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
      setPerfectDay(h.length > 0 && completed === h.length);
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
    } catch (err) {
      console.error(err);
      setFetchError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [session, today]);

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
      color: '#3d7a75',
      timer_duration: '',
    });
    setModalOpen(true);
  };

  const openEdit = (habit) => {
    const isOldBlue = (c) => !c || ['#3b82f6', '#2563eb', '#1d4ed8', '#60a5fa', '#93c5fd', '#1e40af', '#1e3a8a', '#0075ff', '#38bdf8', '#0284c7'].includes(String(c).toLowerCase().trim());
    setEditing(habit);
    setForm({
      habit_name: habit.habit_name,
      category: habit.category,
      target_frequency: habit.target_frequency,
      tracking_type: habit.tracking_type || 'boolean',
      target_quantity: habit.target_quantity ?? '',
      unit: habit.unit || '',
      time_of_day: habit.time_of_day || 'anytime',
      color: (!habit.color || isOldBlue(habit.color)) ? '#3d7a75' : habit.color,
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
    const previousTracking = [...tracking];
    const existing = tracking.find((t) => t.habit_id === habitId);
    const newStatus = existing ? !existing.status : true;

    setPoppingHabit(habitId);
    setTimeout(() => setPoppingHabit(null), 400);

    // Instant optimistic update
    let updatedTracking;
    if (existing) {
      updatedTracking = tracking.map((t) => t.habit_id === habitId ? { ...t, status: newStatus } : t);
    } else {
      updatedTracking = [...tracking, { habit_id: habitId, completion_date: today, status: newStatus, quantity_completed: 0 }];
    }
    setTracking(updatedTracking);

    const completedCount = updatedTracking.filter((t) => t.status === true).length;
    setPerfectDay(habits.length > 0 && completedCount >= habits.length);

    if (newStatus) {
      if (habits.length > 0 && completedCount >= habits.length) {
        firePerfectDay();
      } else {
        fireSmall();
      }
    }

    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ habit_id: habitId, completion_date: today, status: newStatus }),
      });
      if (res.ok) {
        const saved = await res.json();
        setTracking((prev) => prev.map((t) => t.habit_id === habitId ? { ...t, ...saved } : t));
        window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
      } else {
        setTracking(previousTracking);
        setToast({ message: 'Could not save habit status. Reverted change.', type: 'error' });
      }
    } catch {
      setTracking(previousTracking);
      setToast({ message: 'Network connection error — could not save progress.', type: 'error' });
    }
  };

  const handleLogQuantity = async (habitId, amount, reset = false) => {
    const previousTracking = [...tracking];
    const habit = habits.find((h) => h.id === habitId);
    const existing = tracking.find((t) => t.habit_id === habitId);
    const oldQty = existing?.quantity_completed || 0;
    const newQty = reset ? 0 : Math.max(0, oldQty + Number(amount));
    const target = Number(habit?.target_quantity) || 1;
    const newStatus = newQty >= target;

    // Instant optimistic update
    let updatedTracking;
    if (existing) {
      updatedTracking = tracking.map((t) => t.habit_id === habitId ? { ...t, quantity_completed: newQty, status: newStatus } : t);
    } else {
      updatedTracking = [...tracking, { habit_id: habitId, completion_date: today, status: newStatus, quantity_completed: newQty }];
    }
    setTracking(updatedTracking);

    const wasComplete = existing?.status === true;
    if (!wasComplete && newStatus) {
      const completedCount = updatedTracking.filter((t) => t.status === true).length;
      if (habits.length > 0 && completedCount >= habits.length) {
        firePerfectDay();
      } else {
        fireSmall();
      }
    }

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
        const saved = await res.json();
        setTracking((prev) => prev.map((t) => t.habit_id === habitId ? { ...t, ...saved } : t));
        window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
      } else {
        setTracking(previousTracking);
        setToast({ message: 'Failed to update progress. Reverted.', type: 'error' });
      }
    } catch {
      setTracking(previousTracking);
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
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#e2f0ef] dark:bg-[#14302e] text-[#2c6560] dark:text-[#7cc3bb]">
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
            className="inline-flex items-center gap-1.5 bg-[#3d7a75] hover:bg-[#2f5f5b] dark:bg-[#5fae9e] dark:hover:bg-[#4c9484] text-white dark:text-[#0e2320] px-3.5 py-2 rounded-xl font-semibold text-xs transition-all shadow-md shadow-[#3d7a75]/20 active:scale-95"
          >
            <Play size={14} className="fill-current" /> Focus Timer
          </button>

          <button
            onClick={() => setTemplatesOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200/60 dark:border-slate-600/60"
          >
            <Sparkles size={14} className="text-[#3d7a75] dark:text-[#5fae9e]" /> Preset Templates
          </button>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white px-4 py-2 rounded-xl font-semibold text-xs transition-all shadow-md shadow-[#3d7a75]/20 active:scale-95 flex-shrink-0"
          >
            <Plus size={16} /> New Habit
          </button>
        </div>
      </div>

      {/* Routine Windows & Search Filter Toolbar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Routine Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {['all', 'morning', 'afternoon', 'evening'].map((time) => (
            <button
              key={time}
              onClick={() => setActiveRoutine(time === 'all' ? 'All' : time.charAt(0).toUpperCase() + time.slice(1))}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all whitespace-nowrap ${
                activeRoutine.toLowerCase() === time
                  ? 'bg-[#3d7a75] text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60'
              }`}
            >
              {time === 'morning' ? '🌅 Morning' : time === 'afternoon' ? '☀️ Afternoon' : time === 'evening' ? '🌙 Evening' : 'All Routines'}
            </button>
          ))}
        </div>

        {/* Search & View Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search habits..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:ring-2 focus:ring-[#3d7a75] text-slate-800 dark:text-slate-100"
            />
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-700/60 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid' ? 'bg-white dark:bg-[#1a2129] text-[#3d7a75] dark:text-[#5fae9e] shadow-xs' : 'text-slate-400 hover:text-slate-600'
              }`}
              title="Grid Card View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grouped' ? 'bg-white dark:bg-[#1a2129] text-[#3d7a75] dark:text-[#5fae9e] shadow-xs' : 'text-slate-400 hover:text-slate-600'
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
            <span className={`text-sm font-bold ${perfectDay ? 'text-white' : 'text-[#3d7a75] dark:text-[#5fae9e]'}`}>
              {habits.length > 0 ? Math.round((completedCount / habits.length) * 100) : 0}%
            </span>
          </div>
          {!perfectDay && (
            <div className="h-2 bg-slate-100 dark:bg-slate-700/80 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#3d7a75] via-[#5fae9e] to-[#7cc3bb] rounded-full transition-all duration-500"
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
          <div className="w-8 h-8 border-4 border-[#e2f0ef] border-t-[#3d7a75] dark:border-[#14302e] dark:border-t-[#5fae9e] rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {filteredHabits.length === 0 && !fetchError ? (
            <div className="bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-100 dark:border-slate-700/60 py-16 text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-14 h-14 bg-[#e2f0ef] dark:bg-[#14302e] rounded-2xl flex items-center justify-center text-[#3d7a75] dark:text-[#5fae9e]">
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
                  className="mt-2 px-4 py-2 bg-[#3d7a75] text-white rounded-xl font-medium text-sm hover:bg-[#2f5f5b] transition-colors shadow-xs"
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
                        ? 'border-[#3d7a75]/30 dark:border-[#5fae9e]/30 bg-gradient-to-b from-[#e2f0ef]/30 dark:from-[#14302e]/20 to-transparent'
                        : 'border-slate-100 dark:border-slate-700/60 hover:shadow-md'
                    } ${poppingHabit === habit.id ? 'habit-pop' : ''}`}
                  >
                    <div>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getHabitColor(habit) }}
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
                          <span className="flex items-center gap-1 text-[#3d7a75] dark:text-[#5fae9e]">
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
                          className={`flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border active:scale-95 ${
                            done
                              ? 'bg-[#3d7a75] dark:bg-[#5fae9e] border-[#3d7a75] dark:border-[#5fae9e] text-white dark:text-[#0e2320] shadow-md shadow-[#3d7a75]/20'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          <Check size={16} className={done ? 'text-white' : 'text-slate-400'} />
                          {done ? 'Completed ✓' : 'Mark Done'}
                        </button>
                      )}

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(habit)}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-slate-400 hover:text-[#3d7a75] dark:hover:text-[#5fae9e] hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                          title="Edit Habit"
                          aria-label={`Edit ${habit.habit_name}`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(habit.id)}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                          title="Delete Habit"
                          aria-label={`Delete ${habit.habit_name}`}
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
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-sm dark:bg-slate-800 dark:text-slate-100"
              placeholder="e.g. Morning Exercise or Read 20 Pages"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Category</label>
              <CustomSelect
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </CustomSelect>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Routine Time</label>
              <CustomSelect
                value={form.time_of_day || 'anytime'}
                onChange={(e) => setForm({ ...form, time_of_day: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="anytime">Anytime</option>
                <option value="morning">Morning 🌅</option>
                <option value="afternoon">Afternoon ☀️</option>
                <option value="evening">Evening 🌙</option>
              </CustomSelect>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Frequency</label>
              <CustomSelect
                value={form.target_frequency}
                onChange={(e) => setForm({ ...form, target_frequency: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
              >
                {frequencies.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </CustomSelect>
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
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
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
                    form.color === c ? 'scale-125 ring-2 ring-offset-2 ring-[#3d7a75]' : 'hover:scale-110'
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
                    ? 'bg-white dark:bg-slate-700 shadow-xs text-[#3d7a75] dark:text-[#5fae9e]'
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
                    ? 'bg-white dark:bg-slate-700 shadow-xs text-[#3d7a75] dark:text-[#5fae9e]'
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
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
                  placeholder="e.g. 3"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Unit</label>
                <input
                  required
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
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
              className="px-5 py-2 text-xs font-semibold text-white bg-[#3d7a75] hover:bg-[#2f5f5b] dark:bg-[#5fae9e] dark:hover:bg-[#4c9484] dark:text-[#0e2320] rounded-xl transition-colors disabled:opacity-60 flex items-center gap-2 shadow-xs"
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
        habits={habits}
        trackingLogs={tracking}
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
