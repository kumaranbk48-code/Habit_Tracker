import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useConfetti } from '../hooks/useConfetti';
import { getRandomQuote } from '../constants/quotes';
import {
  Flame, Check, BellRing, Quote, Clock, AlertTriangle, ArrowRight, Plus,
  Volume2, VolumeX, Sparkles, Layers, CheckCircle2
} from 'lucide-react';
import {
  startAlarmSound,
  stopAlarmSound,
  toggleMuteAlarm,
  isAlarmMuted,
  resumeAudioContext,
  isAudioContextSuspended
} from '../utils/alarmSound';

const BATCH_SIZE = 3;

function getStreakAtStakeLine(streak, habitName) {
  const s = Number(streak) || 0;
  if (s >= 2) {
    const templates = [
      `Your ${s}-day streak dies tonight.`,
      `${s} days in a row. Don't let today be the one.`,
      `Day ${s + 1} is waiting. Protect your momentum.`,
      `${s} days built with discipline. Finish strong today.`
    ];
    const idx = Math.floor(Math.random() * templates.length);
    return templates[idx];
  }
  if (s === 1) {
    return 'Day 2 is waiting. Build the chain.';
  }
  return 'Day 1 starts right now. Make it count.';
}

export default function AlarmTakeoverModal() {
  const { session } = useAuth();
  const { fireSmall, fireMilestone } = useConfetti();

  // Queue of habits to alert
  const [alarmQueue, setAlarmQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [completedAnim, setCompletedAnim] = useState(false);
  const [muted, setMuted] = useState(isAlarmMuted());
  const [batchProgress, setBatchProgress] = useState({}); // { [habitId]: 'done' | 'skipped' }

  const activeAlarm = alarmQueue[0] || null;

  // Manage looping alarm audio playback
  useEffect(() => {
    if (activeAlarm) {
      startAlarmSound();
    } else {
      stopAlarmSound();
    }
    return () => {
      stopAlarmSound();
    };
  }, [activeAlarm]);

  const handleToggleMute = (e) => {
    e?.stopPropagation?.();
    const newMuted = toggleMuteAlarm();
    setMuted(newMuted);
  };

  // Prevent background scrolling and block Escape key
  useEffect(() => {
    if (!activeAlarm) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e) => {
      // Intentionally block Escape key from closing the takeover
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [activeAlarm]);

  // Reset completion animation whenever active alarm changes
  useEffect(() => {
    setCompletedAnim(false);
  }, [activeAlarm?.id]);

  // Listen for alarm-fired events dispatched by useReminderScheduler
  useEffect(() => {
    const handleAlarmFired = (e) => {
      const { reminder, habit, streak, isTest } = e.detail || {};
      if (!reminder) return;

      const isAlarm = Boolean(
        reminder.is_alarm === true ||
        reminder.is_alarm === 'true' ||
        reminder.is_alarm === 1 ||
        reminder.is_alarm === 't' ||
        reminder.reminder_mode === 'alarm' ||
        isTest
      );
      if (!isAlarm) return;

      const habitData = habit || reminder.habits || {
        id: reminder.habit_id,
        habit_name: reminder.habit_name || 'Habit',
        color: '#3d7a75',
        tracking_type: reminder.tracking_type || 'boolean',
        target_quantity: reminder.target_quantity || 1,
        unit: reminder.unit || '',
      };

      const resolvedId = habitData.id || reminder.habit_id;
      if (!resolvedId) return;

      const randomQuoteItem = getRandomQuote().quote;
      const streakLine = getStreakAtStakeLine(streak ?? 0, habitData.habit_name);

      setAlarmQueue((prev) => {
        const newItem = {
          ...habitData,
          id: resolvedId,
          habit_id: resolvedId,
          reminderId: reminder.id,
          tracking_type: habitData.tracking_type || reminder.tracking_type || 'boolean',
          target_quantity: Number(habitData.target_quantity) || Number(reminder.target_quantity) || 1,
          unit: habitData.unit || reminder.unit || '',
          streak: streak ?? 0,
          custom_text: reminder.custom_text || '',
          alerts: reminder.alerts,
          time: reminder.reminder_time,
          quote: randomQuoteItem,
          streakAtStake: streakLine,
        };
        const existingIdx = prev.findIndex((item) => item.id === resolvedId);
        if (existingIdx !== -1) {
          const updated = [...prev];
          updated[existingIdx] = { ...updated[existingIdx], ...newItem };
          return updated;
        }
        return [...prev, newItem];
      });
    };

    window.addEventListener('habittracker-alarm-fired', handleAlarmFired);
    return () => window.removeEventListener('habittracker-alarm-fired', handleAlarmFired);
  }, []);

  // Check URL query parameters (e.g. launched by clicking notification on mobile/desktop)
  useEffect(() => {
    if (!session?.access_token) return;

    const params = new URLSearchParams(window.location.search);
    const alarmHabitId = params.get('alarm_habit_id');
    const autoCompleteId = params.get('auto_complete');

    if (autoCompleteId) {
      const today = new Date().toISOString().split('T')[0];
      fetch('/api/tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ habit_id: autoCompleteId, completion_date: today, status: true }),
      }).then(() => {
        fireSmall();
        window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
      }).catch(() => {});
      window.history.replaceState({}, '', window.location.pathname);
    } else if (alarmHabitId) {
      Promise.all([
        fetch('/api/habits', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/dashboard', { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ])
        .then(async ([hRes, dRes]) => {
          const habits = hRes.ok ? await hRes.json() : [];
          const dash = dRes.ok ? await dRes.json() : null;
          if (Array.isArray(habits)) {
            const h = habits.find((item) => item.id === alarmHabitId);
            if (h) {
              const randomQuoteItem = getRandomQuote().quote;
              const streakVal = dash?.currentStreak || 0;
              setAlarmQueue((prev) => {
                if (prev.some((item) => item.id === h.id)) return prev;
                return [
                  ...prev,
                  {
                    ...h,
                    streak: streakVal,
                    quote: randomQuoteItem,
                    streakAtStake: getStreakAtStakeLine(streakVal, h.habit_name),
                  },
                ];
              });
            }
          }
        })
        .catch(() => {});
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [session, fireSmall]);

  const popActiveAlarm = useCallback(() => {
    setAlarmQueue((prev) => prev.slice(1));
  }, []);

  // Helper for local YYYY-MM-DD
  const getTodayDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Complete habit handler
  const handleDone = async () => {
    if (!activeAlarm || !session?.access_token || loading) return;
    setLoading(true);

    const today = getTodayDate();
    const isQuantity = activeAlarm.tracking_type === 'quantity';

    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          habit_id: activeAlarm.id,
          completion_date: today,
          status: true,
          action: 'complete',
          amount: isQuantity ? (Number(activeAlarm.target_quantity) || 1) : undefined,
        }),
      });

      if (res.ok) {
        setCompletedAnim(true);
        if ((activeAlarm.streak || 0) >= 3) {
          fireMilestone();
        } else {
          fireSmall();
        }
        window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
        window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));

        setTimeout(() => {
          popActiveAlarm();
          setLoading(false);
        }, 500);
      } else {
        const errJson = await res.json().catch(() => ({}));
        console.error('[AlarmTakeoverModal] Done error response:', errJson);
        setLoading(false);
      }
    } catch (err) {
      console.error('[AlarmTakeoverModal] Done error:', err);
      setLoading(false);
    }
  };

  // Add +1 for quantity habits
  const handleAddQuantity = async (amount = 1) => {
    if (!activeAlarm || !session?.access_token || loading) return;
    setLoading(true);

    const today = getTodayDate();
    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          habit_id: activeAlarm.id,
          completion_date: today,
          status: true,
          action: 'add',
          amount,
        }),
      });

      if (res.ok) {
        fireSmall();
        window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
        window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
        setTimeout(() => {
          popActiveAlarm();
          setLoading(false);
        }, 400);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('[AlarmTakeoverModal] Quantity error:', err);
      setLoading(false);
    }
  };

  // Skip handler (schedules re-ping)
  const handleSkip = async (delayMinutes = 25) => {
    if (!activeAlarm || !session?.access_token || loading) return;
    setLoading(true);

    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'skip',
          reminder_id: activeAlarm.reminderId,
          habit_id: activeAlarm.id,
          delay_minutes: delayMinutes,
        }),
      });

      const data = res.ok ? await res.json() : null;
      if (data?.next_reping_at) {
        window.dispatchEvent(new CustomEvent('habittracker-reping-scheduled', {
          detail: {
            habitId: activeAlarm.id,
            reminderId: activeAlarm.reminderId,
            nextRepingAt: data.next_reping_at,
            delayMinutes,
            habitName: activeAlarm.habit_name,
          }
        }));
      }
      window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
    } catch (err) {
      console.warn('[AlarmTakeoverModal] Skip API error:', err);
    } finally {
      popActiveAlarm();
      setLoading(false);
    }
  };

  // Handle individual batch item completion
  const handleBatchItemDone = async (habit) => {
    if (!session?.access_token || loading || batchProgress[habit.id]) return;
    const today = getTodayDate();
    const isQuantity = habit.tracking_type === 'quantity';

    setBatchProgress((prev) => ({ ...prev, [habit.id]: 'done' }));
    if ((habit.streak || 0) >= 3) {
      fireMilestone();
    } else {
      fireSmall();
    }

    try {
      await fetch('/api/tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          habit_id: habit.id,
          completion_date: today,
          status: true,
          action: 'complete',
          amount: isQuantity ? (Number(habit.target_quantity) || 1) : undefined,
        }),
      });
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
      window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
    } catch (err) {
      console.warn('[AlarmTakeoverModal] Batch item done error:', err);
    }
  };

  // Add +1 for a quantity habit in a batch
  const handleBatchItemAddQty = async (habit) => {
    if (!session?.access_token || loading || batchProgress[habit.id]) return;
    const today = getTodayDate();

    setBatchProgress((prev) => ({ ...prev, [habit.id]: 'done' }));
    fireSmall();

    try {
      await fetch('/api/tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          habit_id: habit.id,
          completion_date: today,
          status: true,
          action: 'add',
          amount: 1,
        }),
      });
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
      window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
    } catch (err) {
      console.warn('[AlarmTakeoverModal] Batch item add qty error:', err);
    }
  };

  // Handle individual batch item skip
  const handleBatchItemSkip = async (habit, delayMinutes = 25) => {
    if (!session?.access_token || loading || batchProgress[habit.id]) return;
    setBatchProgress((prev) => ({ ...prev, [habit.id]: 'skipped' }));

    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'skip',
          reminder_id: habit.reminderId,
          habit_id: habit.id,
          delay_minutes: delayMinutes,
        }),
      });
      const data = res.ok ? await res.json() : null;
      if (data?.next_reping_at) {
        window.dispatchEvent(new CustomEvent('habittracker-reping-scheduled', {
          detail: {
            habitId: habit.id,
            reminderId: habit.reminderId,
            nextRepingAt: data.next_reping_at,
            delayMinutes,
            habitName: habit.habit_name,
          }
        }));
      }
      window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
    } catch (err) {
      console.warn('[AlarmTakeoverModal] Batch item skip error:', err);
    }
  };

  // Complete ALL habits in the current batch in 1 click
  const handleCompleteAllBatch = async (batchItems) => {
    if (!session?.access_token || loading || !batchItems.length) return;
    setLoading(true);

    const today = getTodayDate();
    const unhandled = batchItems.filter((h) => !batchProgress[h.id]);

    try {
      await Promise.all(
        unhandled.map((h) =>
          fetch('/api/tracking', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              habit_id: h.id,
              completion_date: today,
              status: true,
              action: 'complete',
              amount: h.tracking_type === 'quantity' ? (Number(h.target_quantity) || 1) : undefined,
            }),
          })
        )
      );

      fireMilestone();
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated'));
      window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
      setCompletedAnim(true);

      setTimeout(() => {
        setAlarmQueue((prev) => prev.slice(batchItems.length));
        setBatchProgress({});
        setCompletedAnim(false);
        setLoading(false);
      }, 500);
    } catch (err) {
      console.error('[AlarmTakeoverModal] Complete all batch error:', err);
      setLoading(false);
    }
  };

  // Skip entire current batch
  const handleSkipBatch = async (batchItems, delayMinutes = 25) => {
    if (!session?.access_token || loading || !batchItems.length) return;
    setLoading(true);

    const unhandled = batchItems.filter((h) => !batchProgress[h.id]);

    try {
      await Promise.all(
        unhandled.map((h) =>
          fetch('/api/reminders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              action: 'skip',
              reminder_id: h.reminderId,
              habit_id: h.id,
              delay_minutes: delayMinutes,
            }),
          })
        )
      );
      window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
    } catch (err) {
      console.warn('[AlarmTakeoverModal] Skip batch error:', err);
    } finally {
      setAlarmQueue((prev) => prev.slice(batchItems.length));
      setBatchProgress({});
      setLoading(false);
    }
  };

  // Auto-advance if every item in current batch has been handled individually
  useEffect(() => {
    if (alarmQueue.length <= 1) return;
    const currentBatch = alarmQueue.slice(0, BATCH_SIZE);
    if (!currentBatch.length) return;

    const allHandled = currentBatch.every((h) => batchProgress[h.id]);
    if (allHandled) {
      const timer = setTimeout(() => {
        setAlarmQueue((prev) => prev.slice(currentBatch.length));
        setBatchProgress({});
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [batchProgress, alarmQueue]);

  if (!activeAlarm) return null;

  const isMultiBatch = alarmQueue.length > 1;
  const currentBatch = isMultiBatch ? alarmQueue.slice(0, BATCH_SIZE) : [activeAlarm];
  const totalBatches = Math.ceil(alarmQueue.length / BATCH_SIZE);
  const remainingInQueueTotal = Math.max(0, alarmQueue.length - currentBatch.length);

  const habitColor = activeAlarm.color || '#3d7a75';
  const streak = Number(activeAlarm.streak) || 0;
  const isQuantity = activeAlarm.tracking_type === 'quantity';
  const remainingInQueue = alarmQueue.length - 1;
  const quote = activeAlarm.quote;
  const streakAtStake = activeAlarm.streakAtStake || getStreakAtStakeLine(streak, activeAlarm.habit_name);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alarm-title"
      onClick={() => resumeAudioContext()}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      style={{ animationDuration: '0.2s' }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          resumeAudioContext();
        }}
        className="relative w-full max-w-lg bg-white dark:bg-[#1a2129] border border-[#e2e8ec] dark:border-[#2a343d] rounded-3xl shadow-2xl overflow-hidden p-5 sm:p-7 flex flex-col justify-between milestone-in"
      >
        {/* Accent Glow Line at top */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5"
          style={
            isMultiBatch
              ? { background: 'linear-gradient(90deg, #3d7a75, #6366f1, #f59e0b)' }
              : { backgroundColor: habitColor }
          }
        />

        {/* Browser Autoplay Prompt if audio context suspended */}
        {isAudioContextSuspended() && !muted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              resumeAudioContext();
            }}
            className="w-full mb-3 py-2 px-3 rounded-xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs font-semibold flex items-center justify-center gap-2 animate-pulse cursor-pointer"
          >
            <Volume2 size={15} className="text-amber-600" />
            <span>Tap anywhere to enable alarm sound 🔔</span>
          </button>
        )}

        {isMultiBatch ? (
          /* ============================================================ */
          /* APPROACH 2: MULTI-HABIT BATCH CHECKLIST (BATCH OF 3)       */
          /* ============================================================ */
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-bold tracking-wide animate-pulse">
                <BellRing size={13} />
                <span>MULTIPLE ALARMS</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMute}
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all bg-slate-100 dark:bg-[#222b33] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#2c3742]"
                  title={muted ? 'Unmute Alarm Sound' : 'Mute Alarm Sound'}
                >
                  {muted ? (
                    <>
                      <VolumeX size={13} className="text-slate-400" />
                      <span>Muted</span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={13} className="text-red-500 animate-pulse" />
                      <span className="text-red-600 dark:text-red-400">Sound ON</span>
                    </>
                  )}
                </button>

                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/50 text-indigo-700 dark:text-indigo-300">
                  {alarmQueue.length} Habits Due
                </span>
              </div>
            </div>

            {/* Subhead / Batch Progress */}
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Layers size={14} className="text-[#3d7a75]" />
                Batch 1 of {totalBatches}
              </span>
              {remainingInQueueTotal > 0 && (
                <span className="text-slate-500 dark:text-slate-400 font-medium">
                  +{remainingInQueueTotal} more queued
                </span>
              )}
            </div>

            {/* Checklist of Habits in Current Batch */}
            <div className="space-y-2.5 my-1">
              {currentBatch.map((habit) => {
                const status = batchProgress[habit.id];
                const isItemDone = status === 'done';
                const isItemSkipped = status === 'skipped';
                const color = habit.color || '#3d7a75';
                const habitStreak = Number(habit.streak) || 0;
                const isQty = habit.tracking_type === 'quantity';

                return (
                  <div
                    key={habit.id}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isItemDone
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 opacity-90'
                        : isItemSkipped
                        ? 'bg-slate-100/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 opacity-60'
                        : 'bg-slate-50 dark:bg-[#151b22] border-slate-200 dark:border-[#2a343d] hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    {/* Left: Avatar & Habit Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold text-base shadow-sm"
                        style={{ backgroundColor: color }}
                      >
                        {habit.habit_name?.[0]?.toUpperCase() || 'H'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {habit.habit_name}
                          </h3>
                          {habitStreak > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded-md">
                              <Flame size={11} className="fire-bounce" />
                              {habitStreak}d
                            </span>
                          )}
                        </div>
                        {isQty ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            Goal: {habit.target_quantity || 1} {habit.unit || ''}
                          </p>
                        ) : habit.custom_text ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {habit.custom_text}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isItemDone ? (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 font-bold text-xs flex items-center gap-1">
                          <Check size={13} />
                          Done
                        </span>
                      ) : isItemSkipped ? (
                        <span className="px-2.5 py-1 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold">
                          Postponed
                        </span>
                      ) : (
                        <>
                          {isQty && (
                            <button
                              onClick={() => handleBatchItemAddQty(habit)}
                              disabled={loading}
                              type="button"
                              title={`+1 ${habit.unit || ''}`}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#222b33] hover:bg-slate-200 dark:hover:bg-[#2c3742] text-slate-700 dark:text-slate-200 text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            >
                              +1
                            </button>
                          )}
                          <button
                            onClick={() => handleBatchItemDone(habit)}
                            disabled={loading}
                            type="button"
                            className="px-3 py-1.5 rounded-xl bg-[#3d7a75] hover:bg-[#2f5f5b] text-white text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer disabled:opacity-50 shadow-sm"
                          >
                            <Check size={13} />
                            <span>Done</span>
                          </button>
                          <button
                            onClick={() => handleBatchItemSkip(habit)}
                            disabled={loading}
                            type="button"
                            title="Skip this habit"
                            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#222b33] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <ArrowRight size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Batch Master Action Controls */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#2a343d] flex flex-col gap-2">
              {completedAnim ? (
                <div className="w-full py-3.5 rounded-2xl bg-[#3d7a75] text-white font-bold text-center flex items-center justify-center gap-2 shadow-lg animate-pulse">
                  <Check size={18} />
                  <span>Batch Completed! Streaks Protected ✓</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => handleCompleteAllBatch(currentBatch)}
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-2xl bg-[#3d7a75] hover:bg-[#2f5f5b] text-white font-extrabold text-sm shadow-md shadow-[#3d7a75]/25 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 size={17} />
                    <span>
                      Complete All in This Batch ({currentBatch.filter((h) => !batchProgress[h.id]).length})
                    </span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSkipBatch(currentBatch, 25)}
                      disabled={loading}
                      className="flex-1 py-2.5 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100/80 dark:bg-[#222b33]/80 hover:bg-slate-200 dark:hover:bg-[#2c3742] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      <Clock size={13} className="text-[#3d7a75] dark:text-[#5fae9e]" />
                      <span>Re-ping Batch (25m)</span>
                    </button>
                    <button
                      onClick={() => handleSkipBatch(currentBatch, 10)}
                      disabled={loading}
                      className="py-2.5 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100/50 dark:bg-[#222b33]/50 hover:bg-slate-200 dark:hover:bg-[#2c3742] rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                      title="Snooze batch for 10 minutes"
                    >
                      +10m
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* APPROACH 1: SINGLE HABIT HERO TAKEOVER CARD                 */
          /* ============================================================ */
          <div className="flex flex-col">
            {/* Top Header Badge */}
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-bold tracking-wide animate-pulse">
                <BellRing size={14} />
                <span>ALARM REMINDER</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMute}
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all bg-slate-100 dark:bg-[#222b33] text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#2c3742]"
                  title={muted ? 'Unmute Alarm Sound' : 'Mute Alarm Sound'}
                >
                  {muted ? (
                    <>
                      <VolumeX size={14} className="text-slate-400" />
                      <span>Muted</span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={14} className="text-red-500 animate-pulse" />
                      <span className="text-red-600 dark:text-red-400">Sound ON</span>
                    </>
                  )}
                </button>

                {remainingInQueue > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-[#222b33] text-gray-600 dark:text-gray-300">
                    +{remainingInQueue} more due
                  </span>
                )}
              </div>
            </div>

            {/* Habit Identity & Streak Callout */}
            <div className="text-center my-3">
              <div
                className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-lg mb-4"
                style={{ backgroundColor: habitColor }}
              >
                {activeAlarm.habit_name?.[0]?.toUpperCase() || 'H'}
              </div>

              <h2
                id="alarm-title"
                className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight"
              >
                {activeAlarm.habit_name}
              </h2>

              {activeAlarm.custom_text && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  {activeAlarm.custom_text}
                </p>
              )}

              {/* Real Streak Badge */}
              <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-2xl bg-amber-50 dark:bg-[#3a2c14] border border-amber-200/80 dark:border-amber-800/40 text-amber-800 dark:text-amber-300">
                <Flame size={20} className="text-amber-500 fire-bounce" />
                <span className="text-base font-extrabold">
                  {streak > 0 ? `${streak} Day Streak` : 'Start Streak'}
                </span>
              </div>

              {/* Streak-at-Stake Line */}
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-2.5">
                {streakAtStake}
              </p>
            </div>

            {/* Motivational Quote Card */}
            {quote && (
              <div className="my-5 p-4 rounded-2xl bg-slate-50 dark:bg-[#14181c] border border-slate-200/80 dark:border-[#2a343d] text-left relative overflow-hidden min-h-[85px] flex flex-col justify-center">
                <Quote
                  size={32}
                  className="absolute -right-2 -bottom-2 text-slate-200 dark:text-[#222b33] pointer-events-none"
                />
                <blockquote className="text-xs sm:text-sm italic font-medium text-slate-700 dark:text-slate-300 leading-relaxed pr-4">
                  "{quote.text}"
                </blockquote>
                <p className="text-[11px] font-bold text-[#3d7a75] dark:text-[#5fae9e] mt-2">
                  — {quote.author}
                </p>
              </div>
            )}

            {/* Action Controls */}
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-[#2a343d] flex flex-col gap-2.5">
              {completedAnim ? (
                <div className="w-full py-4 rounded-2xl bg-[#3d7a75] text-white font-bold text-center flex items-center justify-center gap-2 shadow-lg animate-pulse">
                  <Check size={20} />
                  <span>Streak Protected! Saved ✓</span>
                </div>
              ) : (
                <>
                  {isQuantity ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        onClick={() => handleAddQuantity(1)}
                        disabled={loading}
                        className="w-full py-3.5 px-4 rounded-2xl bg-slate-100 dark:bg-[#222b33] hover:bg-slate-200 dark:hover:bg-[#2c3742] text-slate-800 dark:text-slate-100 font-bold text-sm transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        <Plus size={16} />
                        <span>+1 {activeAlarm.unit || ''}</span>
                      </button>

                      <button
                        onClick={handleDone}
                        disabled={loading}
                        className="w-full py-3.5 px-4 rounded-2xl bg-[#3d7a75] hover:bg-[#2f5f5b] text-white font-bold text-sm shadow-lg shadow-[#3d7a75]/25 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        <Check size={18} />
                        <span>Target Done</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleDone}
                      disabled={loading}
                      className="w-full py-4 px-6 rounded-2xl bg-[#3d7a75] hover:bg-[#2f5f5b] text-white font-extrabold text-base shadow-lg shadow-[#3d7a75]/25 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <Check size={20} />
                      <span>Mark Done (Protect Streak)</span>
                    </button>
                  )}

                  {/* Skip / Re-ping controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSkip(25)}
                      disabled={loading}
                      className="flex-1 py-2.5 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-[#222b33] dark:hover:bg-[#2c3742] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
                      title="Postpone alarm and re-ping in 25 minutes"
                    >
                      <Clock size={13} className="text-[#3d7a75] dark:text-[#5fae9e]" />
                      <span>Re-ping in 25 min</span>
                    </button>
                    <button
                      onClick={() => handleSkip(10)}
                      disabled={loading}
                      className="py-2.5 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 bg-slate-100/60 dark:bg-[#222b33]/60 hover:bg-slate-200 dark:hover:bg-[#2c3742] rounded-xl transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                      title="Snooze for 10 minutes"
                    >
                      +10 min
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Small Notice at Bottom */}
        <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 mt-3">
          This alarm stays active until completed or postponed.
        </p>
      </div>
    </div>
  );
}
