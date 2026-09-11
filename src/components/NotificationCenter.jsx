import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Bell, Check, X, Target, GraduationCap, Flame, AlertTriangle,
  Clock, ArrowRight, Sparkles, CheckCircle2, ChevronRight
} from 'lucide-react';

export default function NotificationCenter() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState({
    goalsEndingSoon: [],
    learningDue: [],
    todayReminders: [],
  });
  const [dismissedIds, setDismissedIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('habittracker_dismissed_alerts') || '[]');
    } catch {
      return [];
    }
  });

  const panelRef = useRef(null);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const fetchAlerts = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);

    try {
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const [goalsRes, remRes, learningRes] = await Promise.all([
        fetch('/api/goals', { headers }).catch(() => null),
        fetch('/api/reminders', { headers }).catch(() => null),
        fetch('/api/learning', { headers }).catch(() => null),
      ]);

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const currentDay = dayNames[now.getDay()];

      // 1. Evaluate Goals ending within 7 days or overdue
      let goalsEndingSoon = [];
      if (goalsRes?.ok) {
        const goalsData = await goalsRes.json().catch(() => []);
        if (Array.isArray(goalsData)) {
          goalsEndingSoon = goalsData
            .filter(g => g.status !== 'Completed' && g.target_date)
            .map(g => {
              const target = new Date(g.target_date + 'T00:00:00');
              const diffMs = target - new Date(todayStr + 'T00:00:00');
              const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
              return { ...g, diffDays };
            })
            .filter(g => g.diffDays <= 7) // 7 days or less (including overdue <= 0)
            .sort((a, b) => a.diffDays - b.diffDays);
        }
      }

      // 2. Evaluate Scheduled Reminders for Today
      let todayReminders = [];
      if (remRes?.ok) {
        const remData = await remRes.json().catch(() => []);
        if (Array.isArray(remData)) {
          todayReminders = remData.filter(r => {
            if (r.notification_status === 'Paused') return false;
            if (!r.days_of_week || !Array.isArray(r.days_of_week) || r.days_of_week.length === 0) return true;
            return r.days_of_week.includes(currentDay);
          });
        }
      }

      // 3. Evaluate Learning Topics Due Soon or Today's Focus
      let learningDue = [];
      if (learningRes?.ok) {
        const learningData = await learningRes.json().catch(() => ({}));
        const journeys = learningData?.journeys || (Array.isArray(learningData) ? learningData : []);
        // Check topics in journeys
        journeys.forEach(j => {
          if (j.topics && Array.isArray(j.topics)) {
            j.topics.forEach(t => {
              if (t.status !== 'Completed') {
                if (t.is_today_focus) {
                  learningDue.push({
                    id: t.id,
                    title: t.title,
                    journeyTitle: j.title,
                    journeyId: j.id,
                    isFocus: true,
                  });
                } else if (t.target_date) {
                  const target = new Date(t.target_date + 'T00:00:00');
                  const diffMs = target - new Date(todayStr + 'T00:00:00');
                  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
                  if (diffDays <= 3) {
                    learningDue.push({
                      id: t.id,
                      title: t.title,
                      journeyTitle: j.title,
                      journeyId: j.id,
                      diffDays,
                    });
                  }
                }
              }
            });
          }
        });
      }

      setAlerts({
        goalsEndingSoon,
        learningDue,
        todayReminders,
      });
    } catch (err) {
      console.warn('[NotificationCenter] Error loading alerts:', err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const dismissAlert = (uniqueKey) => {
    const next = [...dismissedIds, uniqueKey];
    setDismissedIds(next);
    try {
      localStorage.setItem('habittracker_dismissed_alerts', JSON.stringify(next));
    } catch {}
  };

  const clearAllDismissed = () => {
    setDismissedIds([]);
    try {
      localStorage.removeItem('habittracker_dismissed_alerts');
    } catch {}
  };

  // Filter out dismissed
  const visibleGoals = alerts.goalsEndingSoon.filter(g => !dismissedIds.includes(`goal_${g.id}`));
  const visibleLearning = alerts.learningDue.filter(l => !dismissedIds.includes(`learning_${l.id}`));
  const visibleReminders = alerts.todayReminders.filter(r => !dismissedIds.includes(`rem_${r.id}`));

  const totalUnread = visibleGoals.length + visibleLearning.length + (visibleReminders.length > 0 ? 1 : 0);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#222b33] transition-colors"
        title="Notifications & Reminders"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {totalUnread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-[#e0564c] text-[10px] font-bold text-white shadow-xs animate-pulse">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="fixed top-16 right-4 md:right-auto md:left-64 md:ml-3 z-50 w-[calc(100vw-32px)] max-w-[390px] sm:w-[390px] max-h-[85vh] sm:max-h-[520px] bg-white dark:bg-[#1a2129] border border-[#e2e8ec] dark:border-[#2a343d] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fadeIn">
          {/* Header */}
          <div className="p-4 border-b border-[#e2e8ec] dark:border-[#2a343d] flex items-center justify-between bg-[#f7f9fa] dark:bg-[#14181c]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[#3d7a75]/10 text-[#3d7a75] dark:text-[#5fae9e] flex items-center justify-center font-bold">
                <Bell size={15} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Smart Reminders</h3>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">Deadlines, study routines & habits</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {dismissedIds.length > 0 && (
                <button
                  onClick={clearAllDismissed}
                  className="text-[10px] text-[#3d7a75] dark:text-[#5fae9e] hover:underline mr-1"
                >
                  Reset
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {totalUnread === 0 ? (
              <div className="py-8 text-center text-gray-400 dark:text-gray-500">
                <CheckCircle2 size={32} className="mx-auto mb-2 text-[#3d7a75] opacity-70" />
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">All caught up!</p>
                <p className="text-[11px] mt-0.5">No urgent deadlines or pending alerts.</p>
              </div>
            ) : (
              <>
                {/* 1. Goal Deadlines */}
                {visibleGoals.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-1.5 flex items-center gap-1">
                      <Target size={12} className="text-[#3d7a75]" /> Goal Deadlines Approaching
                    </p>
                    <div className="space-y-1.5">
                      {visibleGoals.map(g => {
                        const isOverdue = g.diffDays < 0;
                        const isToday = g.diffDays === 0;
                        return (
                          <div
                            key={g.id}
                            className={`p-2.5 rounded-xl border flex items-start justify-between gap-2 transition-all ${
                              isOverdue
                                ? 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900/40'
                                : isToday
                                ? 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/40'
                                : 'bg-[#f7f9fa] dark:bg-[#14181c] border-[#e2e8ec] dark:border-[#2a343d]'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                  isOverdue
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                                    : isToday
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                                    : 'bg-[#3d7a75]/10 text-[#3d7a75] dark:text-[#5fae9e]'
                                }`}>
                                  {isOverdue
                                    ? `Overdue (${Math.abs(g.diffDays)}d)`
                                    : isToday
                                    ? 'Due Today!'
                                    : `In ${g.diffDays} day${g.diffDays === 1 ? '' : 's'}`}
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate mt-1">
                                {g.goal_name}
                              </p>
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                                Target date: {g.target_date}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => { setOpen(false); navigate('/goals'); }}
                                className="p-1 text-[#3d7a75] dark:text-[#5fae9e] hover:bg-[#3d7a75]/10 rounded-lg text-[10px] font-semibold flex items-center gap-0.5"
                                title="View Goal"
                              >
                                View <ArrowRight size={11} />
                              </button>
                              <button
                                onClick={() => dismissAlert(`goal_${g.id}`)}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
                                title="Dismiss"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Learning Roadmap Focus & Topics */}
                {visibleLearning.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-1.5 flex items-center gap-1">
                      <GraduationCap size={12} className="text-[#3d7a75]" /> Learning Roadmap
                    </p>
                    <div className="space-y-1.5">
                      {visibleLearning.map(l => (
                        <div
                          key={l.id}
                          className="p-2.5 rounded-xl border bg-[#f7f9fa] dark:bg-[#14181c] border-[#e2e8ec] dark:border-[#2a343d] flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#3d7a75]/10 text-[#3d7a75] dark:text-[#5fae9e]">
                                {l.isFocus ? "Today's Focus" : `Due in ${l.diffDays}d`}
                              </span>
                              <span className="text-[10px] text-gray-400 truncate">{l.journeyTitle}</span>
                            </div>
                            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate mt-1">
                              {l.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => { setOpen(false); navigate(l.journeyId ? `/learning/${l.journeyId}` : '/learning'); }}
                              className="p-1 text-[#3d7a75] dark:text-[#5fae9e] hover:bg-[#3d7a75]/10 rounded-lg text-[10px] font-semibold flex items-center gap-0.5"
                            >
                              Study <ArrowRight size={11} />
                            </button>
                            <button
                              onClick={() => dismissAlert(`learning_${l.id}`)}
                              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
                              title="Dismiss"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Today's Scheduled Reminders */}
                {visibleReminders.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-1 mb-1.5 flex items-center gap-1">
                      <Clock size={12} className="text-[#3d7a75]" /> Scheduled for Today
                    </p>
                    <div className="space-y-1.5">
                      {visibleReminders.slice(0, 4).map(r => {
                        const isGoal = r.target_type === 'goal';
                        const isLearning = r.target_type === 'learning_journey' || r.target_type === 'learning_topic';
                        const itemName = r.habits?.habit_name || r.goals?.goal_name || r.learning_topics?.title || r.learning_journeys?.title || 'Reminder';
                        return (
                          <div
                            key={r.id}
                            className="p-2 rounded-xl border bg-[#f7f9fa] dark:bg-[#14181c] border-[#e2e8ec] dark:border-[#2a343d] flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0 flex items-center gap-2">
                              <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                                {r.reminder_time ? r.reminder_time.slice(0, 5) : 'Daily'}
                              </span>
                              <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                                {itemName}
                              </span>
                            </div>
                            <span className="text-[10px] text-gray-400 capitalize">{r.routine_window}</span>
                          </div>
                        );
                      })}
                      {visibleReminders.length > 4 && (
                        <p className="text-[10px] text-gray-400 text-center pt-1">
                          +{visibleReminders.length - 4} more scheduled
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 border-t border-[#e2e8ec] dark:border-[#2a343d] bg-[#f7f9fa] dark:bg-[#14181c] flex items-center justify-between text-xs">
            <button
              onClick={() => { setOpen(false); navigate('/reminders'); }}
              className="text-[#3d7a75] dark:text-[#5fae9e] font-semibold hover:underline text-xs flex items-center gap-1"
            >
              Manage all reminders →
            </button>
            <span className="text-[10px] text-gray-400">HabitTracker Alerts</span>
          </div>
        </div>
      )}
    </div>
  );
}
