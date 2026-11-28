import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useConfetti } from '../hooks/useConfetti';
import { getRandomQuote } from '../constants/quotes';
import {
  Flame, Check, BellRing, Quote, Clock, AlertTriangle, ArrowRight, Plus,
  Volume2, VolumeX, Sparkles, Layers, CheckCircle2, Target, GraduationCap, ExternalLink, X
} from 'lucide-react';
import {
  startAlarmSound,
  stopAlarmSound,
  toggleMuteAlarm,
  isAlarmMuted,
  resumeAudioContext,
  isAudioContextSuspended
} from '../utils/alarmSound';
import { isNative, NativeAlarmScheduler, stopNativeAlarm } from '../lib/nativeNotifications';
import {
  getAlarmDeepLink,
  makeAlarmQueueKey,
  normalizeIncomingAlarmItem,
  removeAlarmQueueItem,
  shouldCallHabitTrackingForTakeoverAction,
  upsertAlarmQueueItem,
} from '../lib/alarmQueueUtils';

const BATCH_SIZE = 3;

function getQueueKey(item) {
  if (!item) return '';
  return item.queueKey || makeAlarmQueueKey(item.targetType || 'habit', item.entityId || item.id, item.reminderId || '');
}

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
  const navigate = useNavigate();
  const { fireSmall, fireMilestone } = useConfetti();

  // Queue of active alarms (habits, goals, learning)
  const [alarmQueue, setAlarmQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [completedAnim, setCompletedAnim] = useState(false);
  const [muted, setMuted] = useState(isAlarmMuted());
  const [batchProgress, setBatchProgress] = useState({}); // { [queueKey]: 'done' | 'skipped' | 'dismissed' }
  const snoozeTimersRef = useRef([]);

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

  // Pause in-app audio when app is minimized or phone is on home screen
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAlarmSound();
      } else if (activeAlarm && !muted) {
        startAlarmSound();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeAlarm, muted]);

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

  // Clear pending local snooze timers on unmount
  useEffect(() => {
    return () => {
      for (const timerId of snoozeTimersRef.current) clearTimeout(timerId);
    };
  }, []);

  // Reset completion animation whenever active alarm changes
  useEffect(() => {
    setCompletedAnim(false);
  }, [activeAlarm?.queueKey, activeAlarm?.id]);

  // Listen for alarm-fired events dispatched by useReminderScheduler
  useEffect(() => {
    const handleAlarmFired = (e) => {
      const { reminder, habit, streak, isTest, targetType, entityId, hasMilestones } = e.detail || {};
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

      const normalized = normalizeIncomingAlarmItem({
        reminder,
        habit,
        targetType,
        entityId,
        hasMilestones,
      });

      if (!normalized.entityId && !normalized.reminderId) return;

      const randomQuoteItem = getRandomQuote().quote;

      setAlarmQueue((prev) => {
        let nextItem;
        if (normalized.isHabit) {
          const habitData = habit || reminder.habits || {
            id: normalized.entityId,
            habit_name: reminder.habit_name || 'Habit',
            color: '#3d7a75',
            tracking_type: reminder.tracking_type || 'boolean',
            target_quantity: reminder.target_quantity || 1,
            unit: reminder.unit || '',
          };
          const streakLine = getStreakAtStakeLine(streak ?? 0, habitData.habit_name);
          nextItem = {
            ...habitData,
            ...normalized,
            id: normalized.entityId,
            habit_id: normalized.entityId,
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
        } else {
          nextItem = {
            ...normalized,
            custom_text: reminder.custom_text || normalized.subtitle || '',
            alerts: reminder.alerts,
            time: reminder.reminder_time,
            quote: randomQuoteItem,
          };
        }
        return upsertAlarmQueueItem(prev, nextItem);
      });
    };

    const handleAlarmDismissed = (e) => {
      const { habitId, entityId, reminderId, targetType } = e.detail || {};
      const dismissEntity = entityId || habitId;
      setAlarmQueue((prev) => prev.filter((item) => {
        if (targetType && dismissEntity) {
          return getQueueKey(item) !== makeAlarmQueueKey(targetType, dismissEntity, reminderId || '');
        }
        if (dismissEntity && (item.entityId === dismissEntity || item.id === dismissEntity || item.habit_id === dismissEntity)) {
          return false;
        }
        if (reminderId && item.reminderId === reminderId) return false;
        return true;
      }));
      stopNativeAlarm();
    };

    window.addEventListener('habittracker-alarm-fired', handleAlarmFired);
    window.addEventListener('habittracker-alarm-dismissed', handleAlarmDismissed);
    window.addEventListener('habittracker-alarm-snoozed', handleAlarmDismissed);

    return () => {
      window.removeEventListener('habittracker-alarm-fired', handleAlarmFired);
      window.removeEventListener('habittracker-alarm-dismissed', handleAlarmDismissed);
      window.removeEventListener('habittracker-alarm-snoozed', handleAlarmDismissed);
    };
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
    setAlarmQueue((prev) => {
      if (prev.length <= 1) {
        stopNativeAlarm();
      }
      return prev.slice(1);
    });
  }, []);

  // Helper for local YYYY-MM-DD
  const getTodayDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // Complete habit handler (strictly guarded to habits; goal/learning alarms never touch habit tracking)
  const handleDone = async () => {
    if (!shouldCallHabitTrackingForTakeoverAction(activeAlarm, 'mark_done')) return;
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
        window.dispatchEvent(new CustomEvent('habittracker-entity-completed', {
          detail: { targetType: 'habit', entityId: activeAlarm.id, date: today }
        }));

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
    if (!shouldCallHabitTrackingForTakeoverAction(activeAlarm, 'increment')) return;
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
        window.dispatchEvent(new CustomEvent('habittracker-entity-completed', {
          detail: { targetType: 'habit', entityId: activeAlarm.id, date: today }
        }));
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

  // Open Goal / Learning target screen without altering habit streaks or calling /api/tracking
  const handleOpenNonHabit = async () => {
    if (!activeAlarm || loading) return;
    const targetPath = activeAlarm.deepLinkUrl || getAlarmDeepLink(activeAlarm);
    stopAlarmSound();
    await stopNativeAlarm().catch(() => {});
    popActiveAlarm();
    navigate(targetPath);
  };

  // Dismiss Goal / Learning alarm card without marking complete or calling /api/tracking
  const handleDismissNonHabit = async () => {
    if (!activeAlarm || loading) return;
    stopAlarmSound();
    await stopNativeAlarm().catch(() => {});
    popActiveAlarm();
  };

  // Snooze handler (+10 min) - stops sound/vibration, dismisses screen, schedules 10m alert
  const handleSnooze10Min = async () => {
    if (!activeAlarm || loading) return;
    setLoading(true);

    try {
      // 1. Immediately stop alarm sound and native vibration/service
      stopAlarmSound();
      await stopNativeAlarm().catch(() => {});

      const targetType = activeAlarm.targetType || 'habit';
      const entityId = String(activeAlarm.entityId || activeAlarm.id || '');
      const displayName = activeAlarm.isHabit ? activeAlarm.habit_name : activeAlarm.title;

      // 2. Schedule native Android alarm for +10 minutes if running native
      if (isNative) {
        const snoozeTime = Date.now() + 10 * 60 * 1000;
        const snoozeId = Math.floor((Date.now() / 1000) % 2000000000);
        await NativeAlarmScheduler.schedule({
          alarms: [{
            id: snoozeId,
            at: snoozeTime,
            title: `🚨 ALARM: ${displayName}`,
            body: activeAlarm.isHabit
              ? `⏰ Snoozed: Time to complete "${displayName}"!`
              : `⏰ Snoozed: ${displayName}`,
            reminderId: String(activeAlarm.reminderId || entityId || ''),
            habitId: entityId,
            targetType,
            isSnooze: true,
          }]
        }).catch((err) => console.warn('[AlarmModal] Native snooze schedule error:', err));
      } else if (!activeAlarm.isHabit) {
        const snoozedSnapshot = { ...activeAlarm };
        const timerId = setTimeout(() => {
          window.dispatchEvent(new CustomEvent('habittracker-alarm-fired', {
            detail: {
              reminder: { ...(snoozedSnapshot.reminder || {}), is_alarm: true },
              habit: null,
              targetType: snoozedSnapshot.targetType,
              entityId: snoozedSnapshot.entityId,
              hasMilestones: snoozedSnapshot.hasMilestones,
            }
          }));
        }, 10 * 60 * 1000);
        snoozeTimersRef.current.push(timerId);
      }

      // 3. Inform backend of 10 minute snooze for habit reminders without touching non-habit tracking
      if (activeAlarm.isHabit && session?.access_token) {
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
            delay_minutes: 10,
          }),
        }).catch(() => null);

        const data = res?.ok ? await res.json().catch(() => null) : null;
        if (data?.next_reping_at) {
          window.dispatchEvent(new CustomEvent('habittracker-reping-scheduled', {
            detail: {
              habitId: activeAlarm.id,
              reminderId: activeAlarm.reminderId,
              nextRepingAt: data.next_reping_at,
              delayMinutes: 10,
              habitName: activeAlarm.habit_name,
            }
          }));
        }
      }
    } catch (err) {
      console.warn('[AlarmTakeoverModal] Snooze 10 min error:', err);
    } finally {
      popActiveAlarm();
      setLoading(false);
    }
  };

  // Backwards compatibility alias
  const handleSkip = (delayMinutes = 10) => handleSnooze10Min();

  // Handle individual batch item completion (habits only)
  const handleBatchItemDone = async (habit) => {
    const key = getQueueKey(habit);
    if (!shouldCallHabitTrackingForTakeoverAction(habit, 'mark_done')) return;
    if (!session?.access_token || loading || batchProgress[key]) return;
    const today = getTodayDate();
    const isQuantity = habit.tracking_type === 'quantity';

    setBatchProgress((prev) => ({ ...prev, [key]: 'done' }));
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
    const key = getQueueKey(habit);
    if (!shouldCallHabitTrackingForTakeoverAction(habit, 'increment')) return;
    if (!session?.access_token || loading || batchProgress[key]) return;
    const today = getTodayDate();

    setBatchProgress((prev) => ({ ...prev, [key]: 'done' }));
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

  // Handle individual batch item skip / snooze
  const handleBatchItemSkip = async (item, delayMinutes = 10) => {
    const key = getQueueKey(item);
    if (loading || batchProgress[key]) return;
    setBatchProgress((prev) => ({ ...prev, [key]: 'skipped' }));

    if (!item.isHabit) {
      if (isNative) {
        const snoozeTime = Date.now() + delayMinutes * 60 * 1000;
        const snoozeId = Math.floor(((Date.now() + Math.random() * 1000) / 1000) % 2000000000);
        NativeAlarmScheduler.schedule({
          alarms: [{
            id: snoozeId,
            at: snoozeTime,
            title: `🚨 ALARM: ${item.title}`,
            body: `⏰ Snoozed: ${item.title}`,
            reminderId: String(item.reminderId || item.entityId || ''),
            habitId: String(item.entityId || ''),
            targetType: item.targetType || 'goal',
            isSnooze: true,
          }],
        }).catch(() => {});
      } else {
        const snoozedSnapshot = { ...item };
        const timerId = setTimeout(() => {
          window.dispatchEvent(new CustomEvent('habittracker-alarm-fired', {
            detail: {
              reminder: { ...(snoozedSnapshot.reminder || {}), is_alarm: true },
              habit: null,
              targetType: snoozedSnapshot.targetType,
              entityId: snoozedSnapshot.entityId,
              hasMilestones: snoozedSnapshot.hasMilestones,
            },
          }));
        }, delayMinutes * 60 * 1000);
        snoozeTimersRef.current.push(timerId);
      }
      return;
    }

    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'skip',
          reminder_id: item.reminderId,
          habit_id: item.id,
          delay_minutes: delayMinutes,
        }),
      });
      const data = res.ok ? await res.json() : null;
      if (data?.next_reping_at) {
        window.dispatchEvent(new CustomEvent('habittracker-reping-scheduled', {
          detail: {
            habitId: item.id,
            reminderId: item.reminderId,
            nextRepingAt: data.next_reping_at,
            delayMinutes,
            habitName: item.habit_name,
          }
        }));
      }
      window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
    } catch (err) {
      console.warn('[AlarmTakeoverModal] Batch item skip error:', err);
    }
  };

  // Open a Goal/Learning batch item and remove only that item from the queue
  const handleBatchNonHabitOpen = async (item) => {
    if (loading) return;
    const key = getQueueKey(item);
    const targetPath = item.deepLinkUrl || getAlarmDeepLink(item);
    stopAlarmSound();
    setAlarmQueue((prev) => {
      const next = removeAlarmQueueItem(prev, key);
      if (next.length === 0) {
        stopNativeAlarm().catch(() => {});
      }
      return next;
    });
    navigate(targetPath);
  };

  // Dismiss a Goal/Learning batch item without calling /api/tracking
  const handleBatchNonHabitDismiss = (item) => {
    const key = getQueueKey(item);
    if (loading || batchProgress[key]) return;
    setBatchProgress((prev) => ({ ...prev, [key]: 'dismissed' }));
  };

  // Complete ALL habits in the current batch in 1 click (leaves non-habit items untouched)
  const handleCompleteAllBatch = async (batchItems) => {
    if (!session?.access_token || loading || !batchItems.length) return;
    const unhandledHabits = batchItems.filter((h) => h.isHabit && !batchProgress[getQueueKey(h)]);
    if (unhandledHabits.length === 0) return;

    setLoading(true);
    const today = getTodayDate();
    const hasRemainingNonHabits = batchItems.some((item) => !item.isHabit && !batchProgress[getQueueKey(item)]);

    try {
      await Promise.all(
        unhandledHabits.map((h) =>
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

      if (hasRemainingNonHabits) {
        setBatchProgress((prev) => {
          const updated = { ...prev };
          for (const h of unhandledHabits) updated[getQueueKey(h)] = 'done';
          return updated;
        });
        setLoading(false);
        return;
      }

      setCompletedAnim(true);

      setTimeout(() => {
        setAlarmQueue((prev) => {
          const next = prev.slice(batchItems.length);
          if (next.length === 0) stopNativeAlarm().catch(() => {});
          return next;
        });
        setBatchProgress({});
        setCompletedAnim(false);
        setLoading(false);
      }, 500);
    } catch (err) {
      console.error('[AlarmTakeoverModal] Complete all batch error:', err);
      setLoading(false);
    }
  };

  // Snooze entire current batch (+10 min)
  const handleSkipBatch = async (batchItems, delayMinutes = 10) => {
    if (loading || !batchItems.length) return;
    setLoading(true);

    try {
      stopAlarmSound();
      await stopNativeAlarm().catch(() => {});

      const unhandled = batchItems.filter((item) => !batchProgress[getQueueKey(item)]);
      const unhandledHabits = unhandled.filter((item) => item.isHabit);
      const unhandledNonHabits = unhandled.filter((item) => !item.isHabit);

      if (unhandledNonHabits.length > 0 && isNative) {
        const snoozeTime = Date.now() + delayMinutes * 60 * 1000;
        const alarms = unhandledNonHabits.map((item, idx) => ({
          id: Math.floor(((Date.now() + idx * 1000) / 1000) % 2000000000),
          at: snoozeTime,
          title: `🚨 ALARM: ${item.title}`,
          body: `⏰ Snoozed: ${item.title}`,
          reminderId: String(item.reminderId || item.entityId || ''),
          habitId: String(item.entityId || ''),
          targetType: item.targetType || 'goal',
          isSnooze: true,
        }));
        NativeAlarmScheduler.schedule({ alarms }).catch(() => {});
      }

      if (session?.access_token && unhandledHabits.length > 0) {
        await Promise.all(
          unhandledHabits.map((h) =>
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
      }
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

    const allHandled = currentBatch.every((item) => batchProgress[getQueueKey(item)]);
    if (allHandled) {
      const timer = setTimeout(() => {
        setAlarmQueue((prev) => {
          const next = prev.slice(currentBatch.length);
          if (next.length === 0) stopNativeAlarm().catch(() => {});
          return next;
        });
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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn"
      style={{ animationDuration: '0.2s' }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          resumeAudioContext();
        }}
        className="relative w-full max-w-sm sm:max-w-md bg-[#0d151c] border-2 border-[#138a78]/70 rounded-[32px] shadow-[0_0_40px_rgba(19,138,120,0.2)] overflow-hidden p-6 sm:p-7 flex flex-col justify-between milestone-in"
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
            className="w-full mb-3 py-2 px-3 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-200 text-xs font-semibold flex items-center justify-center gap-2 animate-pulse cursor-pointer"
          >
            <Volume2 size={15} className="text-amber-500" />
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
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#2a171a] border border-[#5c2429] text-[#f87171] text-xs font-bold tracking-wider">
                <BellRing size={13} className="text-[#f87171]" />
                <span>MULTIPLE ALARMS</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMute}
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f87171] hover:opacity-85 transition-opacity cursor-pointer bg-transparent border-0 p-1"
                  title={muted ? 'Turn Sound ON' : 'Turn Sound OFF'}
                >
                  {muted ? (
                    <>
                      <VolumeX size={15} className="text-[#f87171]" />
                      <span>Sound OFF</span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={15} className="text-[#f87171] animate-pulse" />
                      <span>Sound ON</span>
                    </>
                  )}
                </button>

                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#1e293b] border border-[#334155] text-slate-300">
                  {alarmQueue.length} Due
                </span>
              </div>
            </div>

            {/* Subhead / Batch Progress */}
            <div className="flex items-center justify-between mb-3 text-xs">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Layers size={14} className="text-[#3d7a75]" />
                Batch 1 of {totalBatches}
              </span>
              {remainingInQueueTotal > 0 && (
                <span className="text-slate-400 font-medium">
                  +{remainingInQueueTotal} more queued
                </span>
              )}
            </div>

            {/* Checklist of Alarms in Current Batch */}
            <div className="space-y-2.5 my-1">
              {currentBatch.map((item) => {
                const itemKey = getQueueKey(item);
                const status = batchProgress[itemKey];
                const isItemDone = status === 'done';
                const isItemSkipped = status === 'skipped';
                const isItemDismissed = status === 'dismissed';

                if (!item.isHabit) {
                  const NonHabitIcon = item.targetType === 'goal' ? Target : GraduationCap;
                  const accentColor = item.targetType === 'goal' ? '#178274' : '#6366f1';
                  return (
                    <div
                      key={itemKey}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isItemDismissed
                          ? 'bg-slate-800/40 border-slate-700 opacity-60'
                          : isItemSkipped
                          ? 'bg-slate-800/40 border-slate-700 opacity-60'
                          : 'bg-[#151b22] border-[#2a343d] hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center text-white shadow-sm"
                          style={{ backgroundColor: accentColor }}
                        >
                          <NonHabitIcon size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-slate-100 truncate">
                              {item.title}
                            </h3>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 flex-shrink-0">
                              {item.targetType === 'goal' ? 'Goal' : 'Learning'}
                            </span>
                          </div>
                          {item.subtitle && (
                            <p className="text-xs text-slate-400 truncate">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isItemDismissed ? (
                          <span className="px-2.5 py-1 rounded-xl bg-slate-700 text-slate-300 text-xs font-semibold">
                            Dismissed
                          </span>
                        ) : isItemSkipped ? (
                          <span className="px-2.5 py-1 rounded-xl bg-slate-700 text-slate-300 text-xs font-semibold">
                            Snoozed
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleBatchNonHabitOpen(item)}
                              disabled={loading}
                              type="button"
                              className="px-2.5 py-1.5 rounded-xl bg-[#138a78] hover:bg-[#0f766e] text-white text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer disabled:opacity-50 shadow-sm"
                            >
                              <ExternalLink size={12} />
                              <span>Open</span>
                            </button>
                            <button
                              onClick={() => handleBatchItemSkip(item, 10)}
                              disabled={loading}
                              type="button"
                              title="Snooze 10m"
                              className="px-2 py-1.5 rounded-xl bg-[#222b33] hover:bg-[#2c3742] text-slate-200 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                            >
                              Snooze
                            </button>
                            <button
                              onClick={() => handleBatchNonHabitDismiss(item)}
                              disabled={loading}
                              type="button"
                              title="Dismiss"
                              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-[#222b33] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                }

                const habit = item;
                const color = habit.color || '#3d7a75';
                const habitStreak = Number(habit.streak) || 0;
                const isQty = habit.tracking_type === 'quantity';

                return (
                  <div
                    key={itemKey}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      isItemDone
                        ? 'bg-emerald-950/20 border-emerald-800/60 opacity-90'
                        : isItemSkipped
                        ? 'bg-slate-800/40 border-slate-700 opacity-60'
                        : 'bg-[#151b22] border-[#2a343d] hover:border-slate-600'
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
                          <h3 className="font-bold text-sm text-slate-100 truncate">
                            {habit.habit_name}
                          </h3>
                          {habitStreak > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] font-extrabold text-amber-400 bg-amber-950/50 px-1.5 py-0.5 rounded-md">
                              <Flame size={11} className="fire-bounce" />
                              {habitStreak}d
                            </span>
                          )}
                        </div>
                        {isQty ? (
                          <p className="text-xs text-slate-400 truncate">
                            Goal: {habit.target_quantity || 1} {habit.unit || ''}
                          </p>
                        ) : habit.custom_text ? (
                          <p className="text-xs text-slate-400 truncate">
                            {habit.custom_text}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isItemDone ? (
                        <span className="px-2.5 py-1 rounded-xl bg-emerald-900/60 text-emerald-200 font-bold text-xs flex items-center gap-1">
                          <Check size={13} />
                          Done
                        </span>
                      ) : isItemSkipped ? (
                        <span className="px-2.5 py-1 rounded-xl bg-slate-700 text-slate-300 text-xs font-semibold">
                          Snoozed
                        </span>
                      ) : (
                        <>
                          {isQty && (
                            <button
                              onClick={() => handleBatchItemAddQty(habit)}
                              disabled={loading}
                              type="button"
                              title={`+1 ${habit.unit || ''}`}
                              className="px-2.5 py-1.5 rounded-xl bg-[#222b33] hover:bg-[#2c3742] text-slate-200 text-xs font-bold transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                            >
                              +1
                            </button>
                          )}
                          <button
                            onClick={() => handleBatchItemDone(habit)}
                            disabled={loading}
                            type="button"
                            className="px-3 py-1.5 rounded-xl bg-[#138a78] hover:bg-[#0f766e] text-white text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer disabled:opacity-50 shadow-sm"
                          >
                            <Check size={13} />
                            <span>Done</span>
                          </button>
                          <button
                            onClick={() => handleBatchItemSkip(habit)}
                            disabled={loading}
                            type="button"
                            title="Snooze this habit 10m"
                            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-[#222b33] transition-colors cursor-pointer disabled:opacity-50"
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
            <div className="mt-4 pt-3 border-t border-white/[0.08] flex flex-col gap-2.5">
              {completedAnim ? (
                <div className="w-full py-3.5 rounded-2xl bg-[#138a78] text-white font-extrabold text-center flex items-center justify-center gap-2 shadow-lg animate-pulse">
                  <Check size={18} strokeWidth={3} />
                  <span>Batch Completed! Streaks Protected ✓</span>
                </div>
              ) : (
                <>
                  {currentBatch.some((h) => h.isHabit && !batchProgress[getQueueKey(h)]) && (
                    <button
                      onClick={() => handleCompleteAllBatch(currentBatch)}
                      disabled={loading}
                      className="w-full py-4 px-4 rounded-2xl bg-[#138a78] hover:bg-[#0f766e] text-white font-extrabold text-base shadow-lg shadow-[#138a78]/25 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <Check size={20} strokeWidth={3} />
                      <span>✓ Mark Done ({currentBatch.filter((h) => h.isHabit && !batchProgress[getQueueKey(h)]).length})</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleSkipBatch(currentBatch, 10)}
                    disabled={loading}
                    className="w-full py-3 px-4 rounded-xl bg-[#141d26] hover:bg-[#1a2530] border border-white/[0.08] active:scale-[0.98] text-slate-300 hover:text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Snooze batch for 10 minutes"
                  >
                    +10 min
                  </button>
                </>
              )}
            </div>
          </div>
        ) : !activeAlarm.isHabit ? (
          /* ============================================================ */
          /* GOAL / LEARNING SINGLE ALARM TAKEOVER CARD                   */
          /* ============================================================ */
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#2a171a] border border-[#5c2429] text-[#f87171] text-xs font-bold tracking-wider">
                <BellRing size={13} className="text-[#f87171]" />
                <span>{activeAlarm.targetType === 'goal' ? 'GOAL ALARM' : 'LEARNING ALARM'}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMute}
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f87171] hover:opacity-85 transition-opacity cursor-pointer bg-transparent border-0 p-1"
                  title={muted ? 'Turn Sound ON' : 'Turn Sound OFF'}
                >
                  {muted ? (
                    <>
                      <VolumeX size={15} className="text-[#f87171]" />
                      <span>Sound OFF</span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={15} className="text-[#f87171] animate-pulse" />
                      <span>Sound ON</span>
                    </>
                  )}
                </button>

                {remainingInQueue > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1e293b] text-slate-300">
                    +{remainingInQueue} more
                  </span>
                )}
              </div>
            </div>

            <div className="text-center my-2">
              <div
                className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-white shadow-md mb-3"
                style={{ backgroundColor: activeAlarm.targetType === 'goal' ? '#178274' : '#6366f1' }}
              >
                {activeAlarm.targetType === 'goal' ? <Target size={28} /> : <GraduationCap size={28} />}
              </div>

              <h2
                id="alarm-title"
                className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2"
              >
                {activeAlarm.title}
              </h2>

              {activeAlarm.subtitle && (
                <p className="text-sm text-slate-300 mt-1 max-w-md mx-auto mb-2">
                  {activeAlarm.subtitle}
                </p>
              )}
            </div>

            {quote && (
              <div className="my-3 p-4 rounded-2xl bg-[#090e13]/70 border border-white/[0.06] text-left relative overflow-hidden min-h-[75px] flex flex-col justify-center">
                <Quote
                  size={36}
                  className="absolute -right-2 -bottom-2 text-white/[0.04] pointer-events-none"
                />
                <blockquote className="text-xs sm:text-sm italic font-medium text-slate-300 leading-relaxed pr-4">
                  "{quote.text}"
                </blockquote>
                <p className="text-[11px] font-bold text-[#3d7a75] mt-1.5">
                  — {quote.author}
                </p>
              </div>
            )}

            <div className="mt-2 flex flex-col gap-2.5">
              <button
                onClick={handleOpenNonHabit}
                disabled={loading}
                className="w-full py-4 px-6 rounded-2xl bg-[#138a78] hover:bg-[#0f766e] active:scale-[0.98] text-white font-extrabold text-base shadow-lg shadow-[#138a78]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <ExternalLink size={18} />
                <span>Open</span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => handleSnooze10Min()}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-[#141d26] hover:bg-[#1a2530] border border-white/[0.08] active:scale-[0.98] text-slate-300 hover:text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Snooze for 10 minutes"
                >
                  <Clock size={14} />
                  <span>Snooze</span>
                </button>

                <button
                  onClick={handleDismissNonHabit}
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-[#141d26] hover:bg-[#1a2530] border border-white/[0.08] active:scale-[0.98] text-slate-300 hover:text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <X size={14} />
                  <span>Dismiss</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ============================================================ */
          /* APPROACH 1: SINGLE HABIT HERO TAKEOVER CARD (RESTORED UI)   */
          /* ============================================================ */
          <div className="flex flex-col">
            {/* Top Header Badge */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#2a171a] border border-[#5c2429] text-[#f87171] text-xs font-bold tracking-wider">
                <BellRing size={13} className="text-[#f87171]" />
                <span>ALARM REMINDER</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleMute}
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#f87171] hover:opacity-85 transition-opacity cursor-pointer bg-transparent border-0 p-1"
                  title={muted ? 'Turn Sound ON' : 'Turn Sound OFF'}
                >
                  {muted ? (
                    <>
                      <VolumeX size={15} className="text-[#f87171]" />
                      <span>Sound OFF</span>
                    </>
                  ) : (
                    <>
                      <Volume2 size={15} className="text-[#f87171] animate-pulse" />
                      <span>Sound ON</span>
                    </>
                  )}
                </button>

                {remainingInQueue > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#1e293b] text-slate-300">
                    +{remainingInQueue} more
                  </span>
                )}
              </div>
            </div>

            {/* Habit Identity & Streak Callout */}
            <div className="text-center my-2">
              <div
                className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-white text-2xl font-extrabold shadow-md mb-3"
                style={{ backgroundColor: habitColor || '#3d7a75' }}
              >
                {activeAlarm.habit_name?.[0]?.toUpperCase() || 'H'}
              </div>

              <h2
                id="alarm-title"
                className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2"
              >
                {activeAlarm.habit_name}
              </h2>

              {activeAlarm.custom_text && (
                <p className="text-sm text-slate-300 mt-1 max-w-md mx-auto mb-2">
                  {activeAlarm.custom_text}
                </p>
              )}

              {/* Real Streak Badge */}
              <div className="flex justify-center mb-2">
                <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#2a2214] border border-[#54401c] text-[#f59e0b] font-bold text-sm">
                  <Flame size={16} className="text-[#f59e0b] fill-[#f59e0b] fire-bounce" />
                  <span>
                    {streak > 0 ? `${streak} Day Streak` : 'Start Streak'}
                  </span>
                </div>
              </div>

              {/* Streak-at-Stake Line */}
              <p className="text-sm font-medium text-slate-300 mt-1 mb-2">
                {streakAtStake}
              </p>
            </div>

            {/* Motivational Quote Card */}
            {quote && (
              <div className="my-3 p-4 rounded-2xl bg-[#090e13]/70 border border-white/[0.06] text-left relative overflow-hidden min-h-[75px] flex flex-col justify-center">
                <Quote
                  size={36}
                  className="absolute -right-2 -bottom-2 text-white/[0.04] pointer-events-none"
                />
                <blockquote className="text-xs sm:text-sm italic font-medium text-slate-300 leading-relaxed pr-4">
                  "{quote.text}"
                </blockquote>
                <p className="text-[11px] font-bold text-[#3d7a75] mt-1.5">
                  — {quote.author}
                </p>
              </div>
            )}

            {/* Action Controls */}
            <div className="mt-2 flex flex-col gap-2.5">
              {completedAnim ? (
                <div className="w-full py-4 rounded-2xl bg-[#138a78] text-white font-extrabold text-center flex items-center justify-center gap-2 shadow-lg animate-pulse">
                  <Check size={20} strokeWidth={3} />
                  <span>Marked Done! Streak Protected ✓</span>
                </div>
              ) : (
                <>
                  {isQuantity ? (
                    <div className="flex flex-col gap-2.5">
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          onClick={() => handleAddQuantity(1)}
                          disabled={loading}
                          className="w-full py-3.5 px-4 rounded-2xl bg-[#141d26] hover:bg-[#1a2530] border border-white/[0.08] text-slate-200 font-bold text-sm transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          <Plus size={16} />
                          <span>+1 {activeAlarm.unit || ''}</span>
                        </button>

                        <button
                          onClick={handleDone}
                          disabled={loading}
                          className="w-full py-3.5 px-4 rounded-2xl bg-[#138a78] hover:bg-[#0f766e] text-white font-extrabold text-sm shadow-lg shadow-[#138a78]/25 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          <Check size={18} strokeWidth={3} />
                          <span>Mark Done</span>
                        </button>
                      </div>

                      <button
                        onClick={() => handleSnooze10Min()}
                        disabled={loading}
                        className="w-full py-3 px-4 rounded-xl bg-[#141d26] hover:bg-[#1a2530] border border-white/[0.08] active:scale-[0.98] text-slate-300 hover:text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Snooze for 10 minutes"
                      >
                        +10 min
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={handleDone}
                        disabled={loading}
                        className="w-full py-4 px-6 rounded-2xl bg-[#138a78] hover:bg-[#0f766e] active:scale-[0.98] text-white font-extrabold text-base shadow-lg shadow-[#138a78]/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <Check size={20} strokeWidth={3} />
                        <span>Mark Done</span>
                      </button>

                      <button
                        onClick={() => handleSnooze10Min()}
                        disabled={loading}
                        className="w-full py-3 px-4 rounded-xl bg-[#141d26] hover:bg-[#1a2530] border border-white/[0.08] active:scale-[0.98] text-slate-300 hover:text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="Snooze for 10 minutes"
                      >
                        +10 min
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Recurring Reminder Notice */}
        <p className="text-[11px] text-center text-slate-400 mt-4 px-2 leading-relaxed">
          This reminder will continue on its regular schedule until you mark it done. Snoozing only delays this alert by 10 minutes.
        </p>
      </div>
    </div>
  );
}
