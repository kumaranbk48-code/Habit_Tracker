import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Toast from '../components/Toast';
import {
  AlertCircle, ChevronLeft, ChevronRight, Calendar as CalIcon,
  CheckCircle2, XCircle, Clock, Info
} from 'lucide-react';
import { motion } from 'framer-motion';
import { calculateMonthlyAnalytics, isHabitScheduledOnDate, getHabitStartDateStr } from '../lib/calendarLogic';
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

  const trackingMap = useMemo(() => {
    const map = new Map();
    trackingLogs.forEach(t => map.set(`${t.habit_id}_${t.completion_date}`, t.status));
    return map;
  }, [trackingLogs]);

  // Habits scheduled on selected day (never display habits on dates prior to creation)
  const habitsOnSelectedDay = useMemo(() => {
    return habits.filter(h => {
      if (h.is_archived) return false;
      const startDate = getHabitStartDateStr(h);
      if (startDate && selectedDayStr < startDate) {
        return false;
      }
      return isHabitScheduledOnDate(h, selectedDayStr);
    });
  }, [habits, selectedDayStr]);

  const completedOnSelectedDayCount = useMemo(() => {
    return habitsOnSelectedDay.filter(h => trackingMap.get(`${h.id}_${selectedDayStr}`) === true).length;
  }, [habitsOnSelectedDay, trackingMap, selectedDayStr]);

  const isSelectedFuture = selectedDayStr > todayStr;
  const isSelectedToday = selectedDayStr === todayStr;
  const isSelectedPast = selectedDayStr < todayStr;

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

              // Count completed habits on this date (only for habits that existed on this date)
              const completedCount = habits.filter(h => {
                const startDate = getHabitStartDateStr(h);
                if (startDate && dStr < startDate) return false;
                return trackingMap.get(`${h.id}_${dStr}`) === true;
              }).length;
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

        {/* Right Column: Day Schedule & Habit Status (Read-Only) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">
          <div className="habiz-panel p-5 sm:p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">
                  {selectedDayStr === todayStr ? 'Today' : selectedDateLabel}
                </h3>
                <p className="text-xs text-slate-400">{selectedDateLabel}</p>
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/[0.04] border border-white/10 text-slate-300">
                <span className="text-teal-400 font-bold">{completedOnSelectedDayCount}</span> / {habitsOnSelectedDay.length} Completed
              </span>
            </div>

            {/* Scheduled Habits for selected date with read-only completion status */}
            <div className="space-y-2.5 pt-1 max-h-[480px] overflow-y-auto pr-1">
              {habitsOnSelectedDay.length === 0 ? (
                <div className="p-8 text-center bg-white/[0.02] border border-white/[0.04] rounded-2xl space-y-1.5">
                  <p className="text-xs font-semibold text-slate-300">
                    No habits scheduled for {selectedDateLabel}.
                  </p>
                  {isSelectedPast && (
                    <p className="text-[11px] text-slate-400">
                      Habits are tracked starting from the day they are created.
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {habitsOnSelectedDay.map(h => {
                    const isDone = trackingMap.get(`${h.id}_${selectedDayStr}`) === true;
                    return (
                      <div
                        key={h.id}
                        className="habiz-panel-subtle p-3.5 rounded-2xl flex items-center justify-between gap-3 border border-white/[0.06] bg-black/20"
                      >
                        <div className="min-w-0 flex-1">
                          <h4 className={`text-xs font-bold truncate ${isDone ? 'text-teal-300' : 'text-white'}`}>
                            {h.habit_name}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {h.category} • {h.time_of_day === 'morning' ? 'Morning' : h.time_of_day === 'afternoon' ? 'Afternoon' : h.time_of_day === 'evening' ? 'Evening' : 'Anytime'}
                          </p>
                        </div>

                        {/* Read-Only Status Indicator */}
                        <div className="flex-shrink-0">
                          {isDone ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                              <CheckCircle2 size={13} className="text-emerald-400" />
                              Completed
                            </span>
                          ) : isSelectedFuture ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white/[0.04] text-slate-400 border border-white/10">
                              <Clock size={13} className="text-slate-400" />
                              Scheduled
                            </span>
                          ) : isSelectedToday ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/25">
                              <Clock size={13} className="text-amber-400" />
                              Not Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              <XCircle size={13} className="text-rose-400" />
                              Not Completed
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Read-only reminder footer */}
            <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center gap-2 text-[11px] text-slate-400">
              <Info size={13} className="text-teal-400 flex-shrink-0" />
              <span>Calendar is view-only. Habit completion is logged on your Dashboard.</span>
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
