import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import DateBulkActionModal from '../components/DateBulkActionModal';
import Toast from '../components/Toast';
import {
  AlertCircle, RefreshCw, ChevronLeft, ChevronRight, Calendar as CalIcon,
  Flame, Award, Target, CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfetti } from '../hooks/useConfetti';
import { calculateMonthlyAnalytics, isHabitScheduledOnDate } from '../lib/calendarLogic';
import HabizLoader from '../components/HabizLoader';

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

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

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

  useEffect(() => {
    const handleStatsUpdated = () => {
      if (session) fetchData();
    };
    window.addEventListener('habittracker-stats-updated', handleStatsUpdated);
    return () => window.removeEventListener('habittracker-stats-updated', handleStatsUpdated);
  }, [session, fetchData]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Toggle single cell completion
  const handleToggleHabitDate = async (habitOrId, completionDate) => {
    const habitId = typeof habitOrId === 'object' && habitOrId !== null ? habitOrId.id : habitOrId;
    if (!habitId || !completionDate) return;

    const prevLogs = [...trackingLogs];
    const existing = trackingLogs.find(t => t.habit_id === habitId && t.completion_date === completionDate);
    const newStatus = existing ? !existing.status : true;

    // Optimistic instant update
    let nextLogs;
    if (existing) {
      nextLogs = trackingLogs.map(t =>
        t.habit_id === habitId && t.completion_date === completionDate
          ? { ...t, status: newStatus }
          : t
      );
    } else {
      nextLogs = [...trackingLogs, { habit_id: habitId, completion_date: completionDate, status: newStatus }];
    }
    setTrackingLogs(nextLogs);
    if (newStatus) fireSmall();

    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ habit_id: habitId, completion_date: completionDate, status: newStatus }),
      });

      if (res.ok) {
        window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
      } else {
        setTrackingLogs(prevLogs);
        setToast({ message: 'Failed to update habit on date. Reverted.', type: 'error' });
      }
    } catch {
      setTrackingLogs(prevLogs);
      setToast({ message: 'Network connection error.', type: 'error' });
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

  // Selected day for agenda (defaults to today)
  const [selectedDayStr, setSelectedDayStr] = useState(todayStr);

  const selectedDateObj = useMemo(() => {
    return new Date(selectedDayStr + 'T00:00:00');
  }, [selectedDayStr]);

  const selectedDateLabel = selectedDateObj.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });

  // Days in month calculation for the grid
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthGridDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d);
    }
    return days;
  }, [firstDayOfWeek, daysInMonth]);

  // Habits scheduled on selected day
  const habitsOnSelectedDay = useMemo(() => {
    return habits.filter(h => !h.is_archived && isHabitScheduledOnDate(h, selectedDayStr));
  }, [habits, selectedDayStr]);

  const trackingMap = useMemo(() => {
    const map = new Map();
    trackingLogs.forEach(t => map.set(`${t.habit_id}_${t.completion_date}`, t.status));
    return map;
  }, [trackingLogs]);

  if (loading) {
    return <HabizLoader size="lg" text="Loading calendar..." />;
  }

  return (
    <div className="space-y-6 page-enter pb-10">
      {/* ── 1. Header with Month Navigator ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Calendar
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Track daily habits and scheduled routines across time.
          </p>
        </div>

        {/* Month Navigator */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-2xl border border-white/[0.06]">
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            onClick={handlePrevMonth}
            className="p-2 hover:bg-white/10 text-slate-300 rounded-xl transition-colors cursor-pointer"
            title="Previous Month"
          >
            <ChevronLeft size={16} />
          </motion.button>
          <span className="px-3 text-xs font-bold text-white min-w-[120px] text-center">
            {monthLabel}
          </span>
          <motion.button
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            onClick={handleNextMonth}
            className="p-2 hover:bg-white/10 text-slate-300 rounded-xl transition-colors cursor-pointer"
            title="Next Month"
          >
            <ChevronRight size={16} />
          </motion.button>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-3 p-4 bg-red-950/40 border border-red-800/60 rounded-2xl">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-300">{fetchError}</p>
          <button onClick={fetchData} className="ml-auto text-xs font-semibold text-red-300 underline">
            Retry
          </button>
        </div>
      )}

      {/* ── 2. Two-Column Layout: Month Grid (Self-contained) + Selected Day Habit List ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Month Calendar Grid (self-start ensures it NEVER grows when habit list grows) */}
        <div className="lg:col-span-7 xl:col-span-8 habiz-panel p-5 sm:p-6 rounded-3xl space-y-4 self-start">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-bold text-white">{monthLabel}</h3>
            <span className="text-xs text-teal-400 font-semibold">{analytics.completionRate}% Completed</span>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-400 pb-2 border-b border-white/[0.04]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* Month Day Cells */}
          <div className="grid grid-cols-7 gap-2">
            {monthGridDays.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} className="h-10 sm:h-12" />;
              }
              const dStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
              const isSelected = dStr === selectedDayStr;
              const isToday = dStr === todayStr;

              // Count completed habits on this date
              const completedCount = habits.filter(h => trackingMap.get(`${h.id}_${dStr}`) === true).length;
              const hasActivity = completedCount > 0;

              return (
                <button
                  key={dStr}
                  onClick={() => setSelectedDayStr(dStr)}
                  className={`h-10 sm:h-12 rounded-2xl flex flex-col items-center justify-center relative transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#153834] text-teal-300 border border-teal-500/50 shadow-[0_0_12px_rgba(45,212,191,0.2)]'
                      : isToday
                      ? 'bg-white/[0.06] text-white border border-white/20'
                      : 'hover:bg-white/[0.04] text-slate-300 border border-transparent'
                  }`}
                >
                  <span className="text-xs font-semibold">{day}</span>
                  {hasActivity && (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-0.5 filter drop-shadow(0 0 4px #2dd4bf)" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Monthly Completion Overview Bar */}
          <div className="pt-4 border-t border-white/[0.04] space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Monthly Progress Overview</span>
              <span className="font-bold text-teal-300">{analytics.completionRate}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-400 rounded-full transition-all duration-500"
                style={{ width: `${analytics.completionRate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Day Schedule & Scheduled Habits */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">
          <div className="habiz-panel p-5 sm:p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  {selectedDayStr === todayStr ? 'Today' : selectedDateLabel}
                </h3>
                <p className="text-xs text-slate-400">{selectedDateLabel}</p>
              </div>

              <button
                onClick={() => handleOpenDateActionModal(selectedDayStr, habitsOnSelectedDay.length)}
                className="text-xs font-semibold text-teal-400 hover:text-teal-300 cursor-pointer"
              >
                + Bulk Action
              </button>
            </div>

            {/* Scheduled Habits for selected date with sleek scroll containment */}
            <div className="space-y-2.5 pt-1 max-h-[480px] overflow-y-auto pr-1">
              {habitsOnSelectedDay.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-white/[0.02] rounded-2xl">
                  No habits scheduled for {selectedDateLabel}.
                </div>
              ) : (
                <motion.div layout className="space-y-2.5">
                  <AnimatePresence mode="popLayout">
                    {habitsOnSelectedDay.map(h => {
                      const isDone = trackingMap.get(`${h.id}_${selectedDayStr}`) === true;
                      return (
                        <motion.div
                          layout
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          whileHover={{ x: 3 }}
                          transition={{ duration: 0.15 }}
                          key={h.id}
                          onClick={() => handleToggleHabitDate(h.id, selectedDayStr)}
                          className="habiz-panel-subtle habiz-panel-interactive p-3.5 rounded-2xl flex items-center justify-between cursor-pointer group"
                        >
                          <div className="min-w-0">
                            <h4 className={`text-xs font-bold truncate ${isDone ? 'line-through text-slate-500' : 'text-white'}`}>
                              {h.habit_name}
                            </h4>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {h.category} • {h.time_of_day === 'morning' ? 'Morning' : h.time_of_day === 'afternoon' ? 'Afternoon' : h.time_of_day === 'evening' ? 'Evening' : 'Anytime'}
                            </p>
                          </div>

                          <div className={`w-5 h-5 rounded-lg border flex items-center justify-center text-xs font-bold transition-colors ${
                            isDone
                              ? 'bg-[#178274] border-[#178274] text-white shadow-[0_0_8px_rgba(23,130,116,0.5)]'
                              : 'border-white/20 text-transparent group-hover:border-teal-400'
                          }`}>
                            ✓
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </div>
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
