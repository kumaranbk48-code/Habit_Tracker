import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import CalendarMatrix from '../components/CalendarMatrix';
import DateBulkActionModal from '../components/DateBulkActionModal';
import Toast from '../components/Toast';
import {
  AlertCircle, RefreshCw, ChevronLeft, ChevronRight, Calendar as CalIcon,
  Flame, Award, Target, CheckCircle2
} from 'lucide-react';
import { useConfetti } from '../hooks/useConfetti';
import { calculateMonthlyAnalytics, isHabitScheduledOnDate } from '../lib/calendarLogic';

export default function CalendarPage() {
  const { session } = useAuth();
  const [habits, setHabits] = useState([]);
  const [trackingLogs, setTrackingLogs] = useState([]);
  const [dashStats, setDashStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [toast, setToast] = useState(null);

  // Month navigation state
  const [viewDate, setViewDate] = useState(() => new Date());

  // Safe Date Bulk Action Modal state
  const [dateModal, setDateModal] = useState({ open: false, dateStr: '', scheduledCount: 0 });

  const { fireSmall } = useConfetti();
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const fetchData = useCallback(async () => {
    if (!session) return;
    setFetchError('');
    try {
      const [habitsRes, trackingRes, dashRes] = await Promise.all([
        fetch('/api/habits',   { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/tracking', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/dashboard',{ headers: { Authorization: `Bearer ${session.access_token}` } }),
      ]);

      if (!habitsRes.ok || !trackingRes.ok) {
        const e = await (!habitsRes.ok ? habitsRes : trackingRes).json().catch(() => ({}));
        setFetchError(e.error || 'Failed to load calendar data.');
        return;
      }

      const h = await habitsRes.json();
      const t = await trackingRes.json();
      const d = dashRes.ok ? await dashRes.json() : null;

      setHabits(Array.isArray(h) ? h : []);
      setTrackingLogs(Array.isArray(t) ? t : []);
      setDashStats(d);
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
    } catch (err) {
      console.error(err);
      setFetchError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Toggle single cell completion (Today only)
  const handleToggleHabitDate = async (habit, completionDate) => {
    if (completionDate !== todayStr) return;
    const existing = trackingLogs.find(t => t.habit_id === habit.id && t.completion_date === completionDate);
    const newStatus = existing ? !existing.status : true;

    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ habit_id: habit.id, completion_date: completionDate, status: newStatus }),
      });

      if (res.ok) {
        if (newStatus) fireSmall();
        fetchData();
      } else {
        setToast({ message: 'Failed to update habit on date.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error.', type: 'error' });
    }
  };

  // Bulk action handlers
  const handleOpenDateActionModal = (dateStr, scheduledCount) => {
    setDateModal({ open: true, dateStr, scheduledCount });
  };

  const handleConfirmAllComplete = async (dateStr) => {
    const scheduledHabits = habits.filter(h => !h.is_archived && isHabitScheduledOnDate(h, dateStr));
    if (!scheduledHabits.length) return;

    try {
      const promises = scheduledHabits.map(h =>
        fetch('/api/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ habit_id: h.id, completion_date: dateStr, status: true }),
        })
      );
      await Promise.all(promises);
      fireSmall();
      fetchData();
      setToast({ message: `Marked all ${scheduledHabits.length} scheduled habits complete for ${dateStr}! 🎉`, type: 'success' });
    } catch {
      setToast({ message: 'Failed to update scheduled habits.', type: 'error' });
    }
  };

  const handleConfirmAllIncomplete = async (dateStr) => {
    const scheduledHabits = habits.filter(h => !h.is_archived && isHabitScheduledOnDate(h, dateStr));
    if (!scheduledHabits.length) return;

    try {
      const promises = scheduledHabits.map(h =>
        fetch('/api/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ habit_id: h.id, completion_date: dateStr, status: false }),
        })
      );
      await Promise.all(promises);
      fetchData();
      setToast({ message: `Reset completion for scheduled habits on ${dateStr}`, type: 'info' });
    } catch {
      setToast({ message: 'Failed to reset habits.', type: 'error' });
    }
  };

  // Monthly Analytics Calculations
  const analytics = useMemo(() => {
    const activeHabits = habits.filter(h => !h.is_archived);
    return calculateMonthlyAnalytics(
      activeHabits,
      trackingLogs,
      viewDate.getFullYear(),
      viewDate.getMonth(),
      todayStr
    );
  }, [habits, trackingLogs, viewDate, todayStr]);

  const monthLabel = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header & Month Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-700/80 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Habit Calendar</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Track your consistency throughout the month with frequency-aware analytics
          </p>
        </div>

        {/* Month Navigation & View Switcher */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center bg-slate-100 dark:bg-slate-700/80 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-600/60">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-white dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition-all"
              title="Previous Month"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="px-3.5 text-xs font-bold text-slate-800 dark:text-slate-100 min-w-[110px] text-center">
              {monthLabel}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-white dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl transition-all"
              title="Next Month"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 flex-1">{fetchError}</p>
          <button onClick={fetchData} className="flex items-center gap-1 text-xs font-semibold text-red-600 underline">
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Habits */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
            <Target size={20} />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Habits</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{analytics.totalActiveHabits}</div>
          </div>
        </div>

        {/* Scheduled Completion Rate */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Completion Rate</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{analytics.completionRate}%</div>
          </div>
        </div>

        {/* Current Streak */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
            <Flame size={20} />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Current Streak</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-0.5">{dashStats?.currentStreak || 0} days</div>
          </div>
        </div>

        {/* Best Performing Habit */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
            <Award size={20} />
          </div>
          <div className="truncate">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Best Performing</div>
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
              {analytics.bestHabit ? `${analytics.bestHabit.habit.habit_name} (${analytics.bestHabit.rate}%)` : 'No data yet'}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Completion Rate Progress Bar */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
          <span>Monthly Completion Overview</span>
          <span className="text-blue-600 dark:text-blue-400">{analytics.completionRate}%</span>
        </div>
        <div className="h-3 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-700 rounded-full"
            style={{ width: `${analytics.completionRate}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Calculated using scheduled habit opportunities for {monthLabel}. Non-scheduled days are excluded from failures.
        </p>
      </div>

      {/* Calendar Matrix Component */}
      <CalendarMatrix
        habits={habits}
        trackingLogs={trackingLogs}
        onToggleHabit={handleToggleHabitDate}
        onOpenDateActionModal={handleOpenDateActionModal}
        viewDate={viewDate}
        setViewDate={setViewDate}
      />

      {/* Legend Footer Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700/80 shadow-xs flex flex-wrap items-center justify-center gap-6 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-1.5 font-medium">
          <span className="w-5 h-5 rounded-lg bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center">✓</span>
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium">
          <span className="w-5 h-5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-400 font-bold text-[10px] flex items-center justify-center">○</span>
          <span>Missed / Incomplete</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium">
          <span className="w-5 h-5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 font-bold text-[10px] flex items-center justify-center">·</span>
          <span>Not Scheduled</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium">
          <span className="w-5 h-5 rounded-lg bg-amber-100 text-amber-600 font-bold text-[10px] flex items-center justify-center">◐</span>
          <span>Partial Progress</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium">
          <span className="w-5 h-5 rounded-lg border-2 border-blue-500 font-bold text-[10px] flex items-center justify-center">◉</span>
          <span>Today</span>
        </div>
      </div>

      {/* Date Safe Bulk Action Modal */}
      <DateBulkActionModal
        open={dateModal.open}
        onClose={() => setDateModal({ open: false, dateStr: '', scheduledCount: 0 })}
        dateStr={dateModal.dateStr}
        scheduledHabitsCount={dateModal.scheduledCount}
        onConfirmAllComplete={handleConfirmAllComplete}
        onConfirmAllIncomplete={handleConfirmAllIncomplete}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
