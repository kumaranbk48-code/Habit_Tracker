import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, GraduationCap, Check, Clock } from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useAuth } from '../contexts/AuthContext';
import Modal from './Modal';
import Toast from './Toast';
import { buildReminderDisplayCopy, formatLocalYMD, getReminderActionMode } from '../lib/goalReminderUtils';
import { acknowledgeReminderForDate, executeReminderDone, undoReminderDone } from '../lib/goalReminderActions';
import { hashStringToId, isNative } from '../lib/nativeNotifications';
import { getOnlineStatus } from '../lib/networkStatus';

export default function GoalLearningReminderPrompt() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [activePrompt, setActivePrompt] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toastState, setToastState] = useState(null);
  const snoozeTimersRef = useRef([]);

  const showResultToast = useCallback((toast, undoData = null) => {
    if (!toast?.message) return;
    setToastState({
      ...toast,
      undoData,
    });
  }, []);

  // Listen for in-app events, SW actions, native taps, and confirm card open requests
  useEffect(() => {
    const handleReminderFired = (e) => {
      const { reminder, hasMilestones } = e.detail || {};
      if (!reminder) return;
      const type = String(reminder.target_type || 'habit').toLowerCase();
      if (type === 'habit') return;
      if (reminder.is_alarm === true || reminder.reminder_mode === 'alarm') return;

      const mode = getReminderActionMode(reminder, Boolean(hasMilestones));
      setActivePrompt({
        reminder,
        hasMilestones: Boolean(hasMilestones),
        mode,
        kind: mode === 'confirm_goal' || mode === 'confirm_journey' ? 'confirm' : 'prompt',
      });
    };

    const handleConfirmOpen = (e) => {
      const { reminder } = e.detail || {};
      if (!reminder) return;
      const type = String(reminder.target_type || 'habit').toLowerCase();
      if (type === 'habit') return;

      const hasMs = Boolean(reminder.goal_has_milestones || reminder.hasMilestones || reminder.milestone_id);
      const mode = getReminderActionMode(reminder, hasMs);
      setActivePrompt({
        reminder,
        hasMilestones: hasMs,
        mode,
        kind: mode === 'confirm_goal' || mode === 'confirm_journey' ? 'confirm' : 'prompt',
      });
    };

    const handleReminderToast = (e) => {
      const { toast, undoData } = e.detail || {};
      showResultToast(toast, undoData);
    };

    const handleNavigate = (e) => {
      const targetPath = e.detail?.path;
      if (targetPath) navigate(targetPath);
    };

    window.addEventListener('habittracker-reminder-fired', handleReminderFired);
    window.addEventListener('habittracker-goal-confirm-open', handleConfirmOpen);
    window.addEventListener('habittracker-reminder-toast', handleReminderToast);
    window.addEventListener('habittracker-navigate', handleNavigate);

    return () => {
      window.removeEventListener('habittracker-reminder-fired', handleReminderFired);
      window.removeEventListener('habittracker-goal-confirm-open', handleConfirmOpen);
      window.removeEventListener('habittracker-reminder-toast', handleReminderToast);
      window.removeEventListener('habittracker-navigate', handleNavigate);
    };
  }, [navigate, showResultToast]);

  // Clear local timers on unmount
  useEffect(() => {
    return () => {
      for (const t of snoozeTimersRef.current) clearTimeout(t);
    };
  }, []);

  // Handle cold launch via Service Worker URL query params (complete_reminder / confirm_reminder)
  useEffect(() => {
    if (!session?.access_token) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const confirmReminderId = params.get('confirm_reminder');

    if (action === 'complete_reminder') {
      const reminderPayload = {
        id: params.get('reminder_id') || null,
        target_type: params.get('target_type') || 'goal',
        goal_id: params.get('goal_id') || null,
        milestone_id: params.get('milestone_id') || null,
        journey_id: params.get('journey_id') || null,
        topic_id: params.get('topic_id') || null,
        hasMilestones: params.get('has_milestones') === '1',
        reminder_mode: params.get('reminder_mode') || 'scheduled',
      };
      window.history.replaceState({}, '', window.location.pathname);

      executeReminderDone({
        reminder: reminderPayload,
        session,
        isNativePlatform: isNative,
        isOnline: getOnlineStatus(),
        hasMilestones: reminderPayload.hasMilestones,
      }).then((res) => {
        if (res?.ok) {
          if (res.toast) showResultToast(res.toast, res.undoData || null);
          if (res.navigateTo) navigate(res.navigateTo);
        } else if (res?.error) {
          showResultToast({ message: res.error, type: 'error' });
        }
      });
    } else if (confirmReminderId) {
      const reminderPayload = {
        id: confirmReminderId,
        target_type: params.get('target_type') || 'goal',
        goal_id: params.get('goal_id') || null,
        journey_id: params.get('journey_id') || null,
      };
      window.history.replaceState({}, '', window.location.pathname);

      const mode = getReminderActionMode(reminderPayload, false);
      setActivePrompt({
        reminder: reminderPayload,
        hasMilestones: false,
        mode,
        kind: 'confirm',
      });
    }
  }, [session, navigate, showResultToast]);

  const handleConfirmComplete = async () => {
    if (!activePrompt || submitting) return;
    setSubmitting(true);
    try {
      const res = await executeReminderDone({
        reminder: activePrompt.reminder,
        modeOverride: activePrompt.mode,
        session,
        isNativePlatform: isNative,
        isOnline: getOnlineStatus(),
        hasMilestones: activePrompt.hasMilestones,
      });

      if (res?.ok) {
        setActivePrompt(null);
        if (res.toast) showResultToast(res.toast, res.undoData || null);
        if (res.navigateTo) navigate(res.navigateTo);
      } else {
        showResultToast({ message: res?.error || 'Could not update completion.', type: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleNotYetDismiss = () => {
    if (activePrompt?.reminder?.id) {
      acknowledgeReminderForDate(activePrompt.reminder.id, formatLocalYMD());
      window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
    }
    setActivePrompt(null);
  };

  const handleSnooze10Min = async () => {
    if (!activePrompt) return;
    const rem = activePrompt.reminder;
    const copy = buildReminderDisplayCopy(rem);
    const delayMs = 10 * 60 * 1000;

    if (isNative) {
      try {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: hashStringToId(`snooze_goal_${rem.id || Date.now()}_${Date.now()}`),
              title: copy.title,
              body: `⏰ Snoozed reminder: ${copy.body}`,
              schedule: { at: new Date(Date.now() + delayMs), allowWhileIdle: true },
              channelId: 'habiz_reminder_channel',
              actionTypeId:
                activePrompt.mode === 'confirm_goal' || activePrompt.mode === 'confirm_journey'
                  ? 'GOAL_OPEN_REMINDER_ACTIONS'
                  : 'HABIT_REMINDER_ACTIONS',
              extra: {
                reminderId: rem.id || null,
                targetType: rem.target_type || 'goal',
                goalId: rem.goal_id || null,
                milestoneId: rem.milestone_id || null,
                journeyId: rem.journey_id || null,
                topicId: rem.topic_id || null,
                hasMilestones: Boolean(activePrompt.hasMilestones),
                reminderMode: rem.reminder_mode || 'scheduled',
              },
            },
          ],
        });
      } catch {}
    } else {
      const timer = setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('habittracker-reminder-fired', {
            detail: { reminder: rem, hasMilestones: activePrompt.hasMilestones },
          })
        );
      }, delayMs);
      snoozeTimersRef.current.push(timer);
    }

    setActivePrompt(null);
    showResultToast({ message: 'Snoozed for 10 minutes', type: 'success' });
  };

  const handleUndo = async () => {
    if (!toastState?.undoData) return;
    const undoRes = await undoReminderDone({
      undoData: toastState.undoData,
      session,
    });
    if (undoRes?.ok && undoRes.toast) {
      showResultToast(undoRes.toast);
    } else if (undoRes?.error) {
      showResultToast({ message: undoRes.error, type: 'error' });
    }
  };

  const copy = activePrompt ? buildReminderDisplayCopy(activePrompt.reminder) : null;
  const isGoal = activePrompt?.reminder?.target_type === 'goal';
  const isConfirmCard = activePrompt?.mode === 'confirm_goal' || activePrompt?.mode === 'confirm_journey';

  return (
    <>
      <Modal
        open={Boolean(activePrompt)}
        onClose={() => setActivePrompt(null)}
        title={isGoal ? 'Goal Reminder' : 'Learning Reminder'}
      >
        {activePrompt && copy && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                isGoal
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
              }`}>
                {isGoal ? <Target size={20} /> : <GraduationCap size={20} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 dark:text-white break-words">
                  {copy.title.replace(/^🎯\s*|^📚\s*/, '')}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {copy.body}
                </p>
              </div>
            </div>

            {isConfirmCard ? (
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-[#2a343d] space-y-3">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {activePrompt.mode === 'confirm_goal' ? 'Is this goal complete?' : 'Is this journey complete?'}
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleNotYetDismiss}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-[#14181c] border border-slate-200 dark:border-[#2a343d] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Not yet
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSnooze10Min}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-[#14181c] border border-slate-200 dark:border-[#2a343d] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Clock size={12} /> Snooze 10 min
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleConfirmComplete}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#178274] hover:bg-[#136c60] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Check size={14} /> {submitting ? 'Saving...' : 'Yes, complete'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-[#2a343d]">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setActivePrompt(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSnooze10Min}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <Clock size={12} /> Snooze 10 min
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmComplete}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#178274] hover:bg-[#136c60] transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check size={14} /> {submitting ? 'Saving...' : activePrompt.mode === 'ack_goal_day' ? 'Open Goals' : 'Mark Done'}
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {toastState && (
        <Toast
          message={toastState.message}
          type={toastState.type}
          actionLabel={toastState.actionLabel}
          onAction={toastState.undoData ? handleUndo : undefined}
          onClose={() => setToastState(null)}
        />
      )}
    </>
  );
}
