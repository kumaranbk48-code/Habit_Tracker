import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';
import CustomTimePicker from '../components/CustomTimePicker';
import {
  formatLocalYMD,
  formatDDMonYYYY,
  getDeadlineFireDateYMD,
  isReminderDeadlineInvalidated,
  isReminderTargetCompleted,
  validateReminderDeadline,
} from '../lib/goalReminderUtils';
import {
  formatGoalPickerLabel,
  formatJourneyPickerLabel,
  getFirstActiveTargetId,
  isGoalCompleted,
  isJourneyCompleted,
  resolveEditedTargetId,
  sortTargetsActiveFirst,
} from '../lib/reminderPickerUtils';
import { requestAlarmPermissionCheck } from '../lib/alarmPermissionPrompt';
import {
  Plus, Pencil, Trash2, Bell, BellOff, BellRing, AlertCircle, ShieldCheck,
  Sun, Sunset, Moon, Clock, Calendar, Check, MessageSquare, Sparkles,
  Target, GraduationCap, CheckCircle2, AlertTriangle, Layers, BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useRefreshOnConnectivity } from '../hooks/useNetworkStatus';
import HabizLoader from '../components/HabizLoader';
import { saveCachedData, getCachedData } from '../lib/offlineDb';
import {
  isNative,
  scheduleSingleNativeReminder,
  cancelNativeReminder,
  checkExactAlarmPermission,
  requestExactAlarmPermission,
  getNextFireTime,
} from '../lib/nativeNotifications';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getRoutineWindow(timeStr) {
  if (!timeStr) return 'Morning';
  const [hh] = timeStr.split(':').map(Number);
  if (hh >= 5 && hh < 12) return 'Morning';
  if (hh >= 12 && hh < 17) return 'Afternoon';
  return 'Evening';
}

function format12Hour(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const mm = m < 10 ? `0${m}` : m;
  return `${h12}:${mm} ${period}`;
}

function formatFirstRingToast(reminder, now = new Date(), completedHabitIds = new Set()) {
  const nextFire = getNextFireTime(reminder, now, { completedHabitIds });
  if (!nextFire) {
    return {
      message: 'No upcoming time found. Check the time and selected days.',
      type: 'error',
    };
  }

  const hh = String(nextFire.getHours()).padStart(2, '0');
  const mm = String(nextFire.getMinutes()).padStart(2, '0');
  const timeStr = format12Hour(`${hh}:${mm}`);

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfFire = new Date(nextFire.getFullYear(), nextFire.getMonth(), nextFire.getDate());
  const diffDays = Math.round((startOfFire.getTime() - startOfToday.getTime()) / 86400000);
  const dayLabel =
    diffDays === 0 ? 'today' :
    diffDays === 1 ? 'tomorrow' :
    nextFire.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  const isAlarm = Boolean(
    reminder?.is_alarm === true ||
    reminder?.is_alarm === 'true' ||
    reminder?.is_alarm === 1 ||
    reminder?.is_alarm === 't' ||
    reminder?.reminder_mode === 'alarm'
  );

  let passedToday = false;
  if (diffDays > 0 && reminder?.reminder_mode !== 'deadline_proximity') {
    const shortDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const longDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayShort = shortDays[now.getDay()];
    const todayLong = longDays[now.getDay()];
    const daysRaw = Array.isArray(reminder?.days_of_week) ? reminder.days_of_week : [];
    const daysNorm = daysRaw.map((d) => String(d).toLowerCase().trim()).filter(Boolean);
    const isEveryday = daysNorm.length === 0 || daysNorm.some((d) => d === 'everyday' || d === 'daily' || d === 'all');
    const allowedToday = isEveryday || daysNorm.some((d) => d === todayShort || d === todayLong || d.startsWith(todayShort));
    const suppressedToday = (reminder?.target_type || 'habit') === 'habit' && reminder?.habit_id && completedHabitIds?.has(reminder.habit_id);

    if (allowedToday && !suppressedToday) {
      const times = [...(Array.isArray(reminder?.alerts) ? reminder.alerts : []), reminder?.reminder_time].filter(Boolean);
      passedToday = times.some((t) => {
        const [th, tm] = String(t).split(':').map(Number);
        if (Number.isNaN(th) || Number.isNaN(tm)) return false;
        const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), th, tm, 0, 0);
        return candidate.getTime() <= now.getTime();
      });
    }
  }

  if (passedToday) {
    return {
      message: `That time has passed for today. First ring: ${dayLabel} ${timeStr}.`,
      type: 'success',
    };
  }
  return {
    message: `${isAlarm ? 'Alarm' : 'Reminder'} set. First ring: ${dayLabel} ${timeStr}.`,
    type: 'success',
  };
}

export default function Reminders() {
  const { session, user } = useAuth();
  const location = useLocation();

  const [reminders, setReminders] = useState([]);
  const [habits, setHabits] = useState([]);
  const [goals, setGoals] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [completedHabitIds, setCompletedHabitIds] = useState(() => new Set());

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [pendingDeleteReminder, setPendingDeleteReminder] = useState(null);
  const [deletingReminder, setDeletingReminder] = useState(false);
  const fetchSeqRef = useRef(0);

  const maybePromptFullScreenIntent = useCallback(async (scheduleResult) => {
    if (!isNative) return;
    if (scheduleResult?.fullScreenIntentDenied === true) {
      requestAlarmPermissionCheck({ beforeScheduling: true });
      return;
    }
    requestAlarmPermissionCheck({ beforeScheduling: true });
  }, []);

  useEffect(() => {
    if (isNative) {
      requestAlarmPermissionCheck({ beforeScheduling: false });
    }
  }, []);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('All'); // 'All' | 'habit' | 'goal' | 'learning'
  const [activeTab, setActiveTab] = useState('All'); // 'All' | 'Due Now' | 'Morning' | 'Afternoon' | 'Evening'

  // Unified Form state
  const [form, setForm] = useState({
    target_type: 'habit', // 'habit' | 'goal' | 'learning_journey' | 'learning_topic'
    habit_id: '',
    goal_id: '',
    milestone_id: '',
    journey_id: '',
    topic_id: '',
    reminder_mode: 'scheduled', // 'scheduled' | 'deadline_proximity'
    days_before_deadline: 1, // 7, 3, 1, 0
    remind_on_date: '',
    use_custom_date: false,
    reminder_time: '08:00',
    alerts: ['08:00'],
    custom_text: '',
    routine_window: 'Morning',
    days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    notification_status: 'Active',
    is_alarm: false,
  });

  const {
    permission,
    subscribed,
    swReady,
    requestPermissionAndSubscribe,
    unsubscribe,
    scheduleLocalReminders,
  } = usePushNotifications(session);

  const getTimeValue = (val) => {
    if (!val) return '08:00';
    const str = typeof val === 'string' ? val : (val.target?.value || val.value || '08:00');
    const clean = String(str).replace(/[{}"'\s]/g, '').trim();
    if (clean.includes(':')) {
      const [h, m] = clean.split(':');
      const cleanH = String(parseInt(h, 10) || 0).padStart(2, '0');
      const cleanM = String(parseInt(m, 10) || 0).padStart(2, '0');
      return `${cleanH}:${cleanM}`;
    }
    return '08:00';
  };

  const fetchData = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    let currentSession = session;
    if (!currentSession) {
      const { data } = await supabase.auth.getSession();
      currentSession = data?.session;
    }
    if (seq !== fetchSeqRef.current) return;
    if (!currentSession) {
      if (seq === fetchSeqRef.current) setLoading(false);
      return;
    }
    setFetchError('');
    try {
      const todayStr = formatLocalYMD(new Date());
      const [res, habitsRes, goalsRes, learningRes, trackingRes, milestonesRes] = await Promise.all([
        fetch('/api/reminders', { headers: { Authorization: `Bearer ${currentSession.access_token}` } }),
        fetch('/api/habits', { headers: { Authorization: `Bearer ${currentSession.access_token}` } }),
        fetch('/api/goals', { headers: { Authorization: `Bearer ${currentSession.access_token}` } }),
        fetch('/api/learning', { headers: { Authorization: `Bearer ${currentSession.access_token}` } }),
        fetch(`/api/tracking?date=${todayStr}`, { headers: { Authorization: `Bearer ${currentSession.access_token}` } }).catch(() => null),
        fetch('/api/milestones', { headers: { Authorization: `Bearer ${currentSession.access_token}` } }).catch(() => null),
      ]);

      if (seq !== fetchSeqRef.current) return;

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        if (seq === fetchSeqRef.current) {
          setFetchError(e.error || 'Failed to load reminders.');
        }
        return;
      }

      const data = await res.json();
      const habitsData = habitsRes.ok ? await habitsRes.json() : [];
      const goalsData = goalsRes.ok ? await goalsRes.json() : [];
      const learningData = learningRes.ok ? await learningRes.json() : {};
      const trackingData = trackingRes && trackingRes.ok ? await trackingRes.json() : [];
      const milestonesData = milestonesRes && milestonesRes.ok ? await milestonesRes.json().catch(() => []) : [];

      if (seq !== fetchSeqRef.current) return;

      const r = Array.isArray(data) ? data : [];
      const h = Array.isArray(habitsData) ? habitsData : [];
      const g = Array.isArray(goalsData) ? goalsData : [];
      const mList = Array.isArray(milestonesData) ? milestonesData : [];
      const j = learningData?.journeys || (Array.isArray(learningData) ? learningData : []);
      const completedSet = new Set(
        (Array.isArray(trackingData) ? trackingData : [])
          .filter((t) => t.status === true)
          .map((t) => t.habit_id)
      );

      setReminders(r);
      setHabits(h);
      setGoals(g);
      setMilestones(mList);
      setJourneys(j);
      setCompletedHabitIds(completedSet);

      if (user?.id) {
        saveCachedData(user.id, 'reminders', r);
        saveCachedData(user.id, 'milestones', mList);
      }

      const completedGoalIds = new Set(g.filter((item) => item.status === 'Completed').map((item) => item.id));
      const completedMilestoneIds = new Set(mList.filter((item) => item.completed === true).map((item) => item.id));
      const completedLearningIds = new Set();
      for (const jItem of j) {
        if (jItem.status === 'Completed') completedLearningIds.add(jItem.id);
        for (const tp of (jItem.topics || [])) {
          if (tp.status === 'Completed') completedLearningIds.add(tp.id);
        }
      }
      const goalHasMilestonesSet = new Set(mList.map((item) => item.goal_id).filter(Boolean));

      const activeReminders = r
        .filter((rem) => {
          const s = (rem.notification_status || 'active').toLowerCase();
          if (s !== 'active') return false;
          return !isReminderTargetCompleted(rem, {
            completedGoalIds,
            completedMilestoneIds,
            completedLearningIds,
          });
        })
        .map((rem) => ({
          ...rem,
          target_type: rem.target_type || 'habit',
          is_alarm: Boolean(rem.is_alarm || rem.reminder_mode === 'alarm'),
          habit_name: rem.habits?.habit_name || '',
          tracking_type: rem.habits?.tracking_type || '',
          target_quantity: rem.habits?.target_quantity || 1,
          unit: rem.habits?.unit || '',
          goal_name: rem.goals?.goal_name || '',
          goal_has_milestones: Boolean(rem.goal_has_milestones || (rem.goal_id && goalHasMilestonesSet.has(rem.goal_id))),
          milestone_title: rem.goal_milestones?.title || mList.find((m) => m.id === rem.milestone_id)?.title || '',
          journey_title: rem.learning_journeys?.title || '',
          topic_title: rem.learning_topics?.title || '',
          target_date: rem.learning_topics?.target_date || rem.goals?.target_date || rem.learning_journeys?.target_date || '',
          alerts: Array.isArray(rem.alerts) && rem.alerts.length > 0 ? rem.alerts.map(getTimeValue) : [getTimeValue(rem.reminder_time)],
          reminder_time: getTimeValue(rem.reminder_time),
        }));
      scheduleLocalReminders(activeReminders);
      window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
    } catch (err) {
      if (seq !== fetchSeqRef.current) return;
      console.warn('[Reminders] Network error, reading cached reminders from IndexedDB:', err);
      if (user?.id) {
        try {
          const [cached, cachedMs] = await Promise.all([
            getCachedData(user.id, 'reminders'),
            getCachedData(user.id, 'milestones'),
          ]);
          if (seq !== fetchSeqRef.current) return;
          if (Array.isArray(cachedMs)) setMilestones(cachedMs);
          if (cached && Array.isArray(cached)) {
            setReminders(cached);
            setFetchError('');
            return;
          }
        } catch (cacheErr) {
          console.warn('[Reminders] Cache read error:', cacheErr);
        }
      }
      if (seq === fetchSeqRef.current) {
        setFetchError('Offline — viewing cached reminders.');
      }
    } finally {
      if (seq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [session, user?.id, scheduleLocalReminders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useRefreshOnConnectivity(fetchData, { enabled: Boolean(session), ignoreSource: 'reminders', delayMs: 200 });

  const openAdd = (preferredType = 'habit', preferredId = '') => {
    setEditing(null);
    setFormError('');
    const initialTime = '08:00';
    setForm({
      target_type: preferredType === 'learning_topic' ? 'learning_journey' : preferredType,
      habit_id: preferredType === 'habit' ? (preferredId || habits[0]?.id || '') : (habits[0]?.id || ''),
      goal_id: preferredType === 'goal' ? (preferredId || getFirstActiveTargetId(goals, isGoalCompleted)) : getFirstActiveTargetId(goals, isGoalCompleted),
      milestone_id: '',
      journey_id: (preferredType === 'learning_journey' || preferredType === 'learning_topic') ? (preferredId || getFirstActiveTargetId(journeys, isJourneyCompleted)) : getFirstActiveTargetId(journeys, isJourneyCompleted),
      topic_id: '',
      reminder_mode: preferredType === 'goal' ? 'deadline_proximity' : 'scheduled',
      days_before_deadline: 1,
      remind_on_date: '',
      use_custom_date: false,
      reminder_time: initialTime,
      alerts: [initialTime],
      custom_text: '',
      routine_window: 'Morning',
      days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      notification_status: 'Active',
      is_alarm: preferredType === 'habit',
    });
    setModalOpen(true);
  };

  // Handle incoming navigation state (e.g. from Goal card or Learning Hub "Set Reminder")
  useEffect(() => {
    if (location.state?.openAdd) {
      const { prefillType, prefillId } = location.state;
      if (prefillType === 'goal') {
        openAdd('goal', prefillId);
      } else if (prefillType === 'learning') {
        openAdd('learning_journey', prefillId);
      } else {
        openAdd('habit', prefillId);
      }
      try {
        window.history.replaceState({}, document.title);
      } catch {}
    }
  }, [location.state]);

  const handleEnablePush = async () => {
    const ok = await requestPermissionAndSubscribe();
    if (ok) {
      setToast({ message: 'Notifications enabled! 🔔', type: 'success' });
    } else {
      setToast({ message: 'Could not enable notifications. Check notification permissions in device settings.', type: 'error' });
    }
  };

  const handleDisablePush = async () => {
    await unsubscribe();
    setToast({ message: 'Push notifications disabled', type: 'success' });
  };

  const openEdit = (reminder) => {
    setEditing(reminder);
    setFormError('');
    const parsedAlerts = Array.isArray(reminder.alerts) && reminder.alerts.length > 0
      ? reminder.alerts.map(getTimeValue)
      : [getTimeValue(reminder.reminder_time)];

    const mainTime = getTimeValue(reminder.reminder_time) || parsedAlerts[0] || '08:00';
    const targetType = reminder.target_type || 'habit';
    const isLearning = targetType === 'learning_journey' || targetType === 'learning_topic';
    const rawJourneyId = reminder.journey_id
      || (reminder.topic_id ? journeys.find((j) => (j.topics || []).some((t) => t.id === reminder.topic_id))?.id : '')
      || '';
    const resolvedJourneyId = resolveEditedTargetId(journeys, rawJourneyId, isJourneyCompleted);

    setForm({
      target_type: targetType === 'learning_topic' ? 'learning_journey' : targetType,
      habit_id: targetType === 'habit' ? (reminder.habit_id || habits[0]?.id || '') : '',
      goal_id: targetType === 'goal' ? resolveEditedTargetId(goals, reminder.goal_id, isGoalCompleted) : '',
      milestone_id: targetType === 'goal' ? (reminder.milestone_id || '') : '',
      journey_id: isLearning ? resolvedJourneyId : '',
      topic_id: isLearning ? (reminder.topic_id || '') : '',
      reminder_mode: ['scheduled', 'deadline_proximity', 'smart_nudge'].includes(reminder.reminder_mode)
        ? reminder.reminder_mode
        : (targetType === 'goal' ? 'deadline_proximity' : 'scheduled'),
      days_before_deadline: reminder.days_before_deadline ?? 1,
      remind_on_date: reminder.remind_on_date ? String(reminder.remind_on_date).slice(0, 10) : '',
      use_custom_date: Boolean(reminder.remind_on_date),
      reminder_time: mainTime,
      alerts: parsedAlerts,
      custom_text: reminder.custom_text || '',
      routine_window: reminder.routine_window || getRoutineWindow(mainTime),
      days_of_week: Array.isArray(reminder.days_of_week) && reminder.days_of_week.length > 0 ? reminder.days_of_week : WEEKDAYS,
      notification_status: reminder.notification_status || 'Active',
      is_alarm: Boolean(reminder.is_alarm || reminder.reminder_mode === 'alarm'),
    });
    setModalOpen(true);
  };

  const handleToggleAlarm = async (rem) => {
    const currentIsAlarm = Boolean(rem.is_alarm || rem.reminder_mode === 'alarm');
    const newIsAlarm = !currentIsAlarm;
    const originalAlarm = currentIsAlarm;

    // Instant optimistic update
    setReminders((prev) => prev.map((r) => (r.id === rem.id ? { ...r, is_alarm: newIsAlarm } : r)));

    // Immediately schedule or update alarm natively on Android
    if (isNative) {
      if (newIsAlarm) {
        requestAlarmPermissionCheck({ beforeScheduling: true });
        checkExactAlarmPermission().then((ok) => {
          if (!ok) requestExactAlarmPermission();
        });
      }
      const targetName =
        rem.habits?.habit_name ||
        rem.goal_milestones?.title ||
        rem.goals?.goal_name ||
        rem.learning_topics?.title ||
        rem.learning_journeys?.title ||
        'Reminder';
      scheduleSingleNativeReminder({ ...rem, is_alarm: newIsAlarm }, targetName)
        .then((schedRes) => {
          if (newIsAlarm) {
            maybePromptFullScreenIntent(schedRes);
          }
        })
        .catch(() => {});
    }

    try {
      const res = await fetch('/api/reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...rem, is_alarm: newIsAlarm }),
      });
      if (res.ok) {
        if (newIsAlarm) {
          setToast(formatFirstRingToast({ ...rem, is_alarm: true }, new Date(), completedHabitIds));
        } else {
          setToast({
            message: 'Alarm Mode Disabled 🔕',
            type: 'success',
          });
        }
        fetchData();
      } else {
        setReminders((current) => current.map((r) => (r.id === rem.id ? { ...r, is_alarm: originalAlarm } : r)));
        const errJson = await res.json().catch(() => ({}));
        setToast({ message: errJson.error || 'Failed to toggle alarm mode', type: 'error' });
      }
    } catch {
      setReminders((current) => current.map((r) => (r.id === rem.id ? { ...r, is_alarm: originalAlarm } : r)));
      setToast({ message: 'Network error', type: 'error' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formLoading) return;
    setFormError('');

    if (form.target_type === 'habit' && !form.habit_id) {
      const msg = 'Please select a habit first.';
      setFormError(msg);
      setToast({ message: msg, type: 'error' });
      return;
    }
    if (form.target_type === 'goal' && !form.goal_id) {
      const msg = 'Please select an active goal first.';
      setFormError(msg);
      setToast({ message: msg, type: 'error' });
      return;
    }
    if (form.target_type === 'learning_journey' && !form.journey_id) {
      const msg = 'Please select an active learning roadmap first.';
      setFormError(msg);
      setToast({ message: msg, type: 'error' });
      return;
    }

    const effectiveTargetType = (form.target_type === 'learning_journey' && form.topic_id)
      ? 'learning_topic'
      : form.target_type;
    const effectiveMode = ['scheduled', 'deadline_proximity', 'smart_nudge'].includes(form.reminder_mode)
      ? form.reminder_mode
      : (effectiveTargetType === 'goal' ? 'deadline_proximity' : 'scheduled');

    const selectedGoalObj = goals.find((g) => g.id === form.goal_id);
    const selectedJourneyObj = journeys.find((j) => j.id === form.journey_id);
    const selectedTopicObj = (selectedJourneyObj?.topics || []).find((t) => t.id === form.topic_id);
    const targetDeadline =
      effectiveTargetType === 'goal'
        ? (selectedGoalObj?.target_date || null)
        : effectiveTargetType === 'learning_topic'
        ? (selectedTopicObj?.target_date || selectedJourneyObj?.target_date || null)
        : effectiveTargetType === 'learning_journey'
        ? (selectedJourneyObj?.target_date || null)
        : null;

    const todayStr = formatLocalYMD(new Date());
    if (effectiveMode === 'deadline_proximity') {
      const check = validateReminderDeadline({
        reminderMode: effectiveMode,
        remindOnDate: form.use_custom_date ? form.remind_on_date : '',
        useCustomDate: form.use_custom_date,
        targetDate: targetDeadline,
        todayStr,
      });
      if (!check.valid) {
        setFormError(check.error);
        setToast({ message: check.error, type: 'error' });
        return;
      }

      if (form.use_custom_date && form.remind_on_date === todayStr) {
        const cleanMain = getTimeValue(form.reminder_time) || '08:00';
        const [th, tm] = cleanMain.split(':').map(Number);
        const nowCheck = new Date();
        const candidate = new Date(nowCheck.getFullYear(), nowCheck.getMonth(), nowCheck.getDate(), th, tm, 0, 0);
        if (candidate.getTime() <= nowCheck.getTime()) {
          const pastMsg = 'Alert time has already passed today. Choose a later time or tomorrow.';
          setFormError(pastMsg);
          setToast({ message: pastMsg, type: 'error' });
          return;
        }
      }
    }

    setFormLoading(true);
    const originalReminder = editing ? reminders.find((r) => r.id === editing.id) : null;
    const formFieldsToRestore = originalReminder ? {
      target_type: originalReminder.target_type,
      habit_id: originalReminder.habit_id,
      goal_id: originalReminder.goal_id,
      milestone_id: originalReminder.milestone_id,
      journey_id: originalReminder.journey_id,
      topic_id: originalReminder.topic_id,
      reminder_mode: originalReminder.reminder_mode,
      reminder_time: originalReminder.reminder_time,
      alerts: originalReminder.alerts,
      routine_window: originalReminder.routine_window,
      days_before_deadline: originalReminder.days_before_deadline,
      remind_on_date: originalReminder.remind_on_date,
      days_of_week: originalReminder.days_of_week,
      custom_text: originalReminder.custom_text,
      is_alarm: originalReminder.is_alarm,
      habits: originalReminder.habits,
      goals: originalReminder.goals,
      goal_milestones: originalReminder.goal_milestones,
      learning_journeys: originalReminder.learning_journeys,
      learning_topics: originalReminder.learning_topics,
    } : null;
    let optimisticEntry = null;
    try {
      const cleanAlerts = (Array.isArray(form.alerts) && form.alerts.length > 0 ? form.alerts : [form.reminder_time]).map(getTimeValue);
      const cleanMainTime = getTimeValue(form.reminder_time) || cleanAlerts[0] || '08:00';
      const cleanRoutine = form.routine_window || getRoutineWindow(cleanMainTime);
      const customDateVal = (effectiveMode === 'deadline_proximity' && form.use_custom_date && form.remind_on_date)
        ? form.remind_on_date
        : null;

      const payload = {
        target_type: effectiveTargetType,
        habit_id: effectiveTargetType === 'habit' ? (form.habit_id || null) : null,
        goal_id: effectiveTargetType === 'goal' ? (form.goal_id || null) : null,
        milestone_id: effectiveTargetType === 'goal' ? (form.milestone_id || null) : null,
        journey_id: (effectiveTargetType === 'learning_journey' || effectiveTargetType === 'learning_topic') ? (form.journey_id || null) : null,
        topic_id: effectiveTargetType === 'learning_topic' ? (form.topic_id || null) : null,
        reminder_mode: effectiveMode,
        reminder_time: cleanMainTime,
        alerts: cleanAlerts,
        routine_window: cleanRoutine,
        days_before_deadline: customDateVal ? 0 : (Number(form.days_before_deadline) || 0),
        remind_on_date: customDateVal,
        days_of_week: Array.isArray(form.days_of_week) && form.days_of_week.length > 0 ? form.days_of_week : WEEKDAYS,
        custom_text: form.custom_text || '',
        ...(!editing && { notification_status: form.notification_status || 'Active' }),
        is_alarm: Boolean(form.is_alarm),
      };

      const selectedMsObj = milestones.find((m) => m.id === form.milestone_id);

      // CRITICAL: Schedule directly with Android AlarmManager / LocalNotifications immediately on Save tap
      if (isNative) {
        try {
          if (payload.is_alarm) {
            requestAlarmPermissionCheck({ beforeScheduling: true });
            const exactAllowed = await checkExactAlarmPermission();
            if (!exactAllowed) {
              await requestExactAlarmPermission();
            }
          }
          const targetName = effectiveTargetType === 'habit'
            ? habits.find((h) => h.id === form.habit_id)?.habit_name
            : effectiveTargetType === 'goal'
            ? selectedGoalObj?.goal_name
            : effectiveTargetType === 'learning_topic'
            ? selectedTopicObj?.title
            : selectedJourneyObj?.title || 'Reminder';

          const clientReminder = {
            ...payload,
            target_date: targetDeadline,
            goals: selectedGoalObj || null,
            goal_milestones: selectedMsObj || null,
            goal_has_milestones: milestones.some((m) => m.goal_id === form.goal_id),
            learning_journeys: selectedJourneyObj || null,
            learning_topics: selectedTopicObj || null,
            id: editing ? editing.id : `client_${form.habit_id || form.goal_id || form.topic_id || Date.now()}`,
          };
          const schedRes = await scheduleSingleNativeReminder(clientReminder, targetName || 'Habit');
          if (payload.is_alarm) {
            await maybePromptFullScreenIntent(schedRes);
          }
        } catch (nativeErr) {
          console.warn('[Reminders] Immediate native schedule warning:', nativeErr);
        }
      }

      const targetHabit = habits.find((h) => h.id === form.habit_id);
      optimisticEntry = {
        ...payload,
        id: editing ? editing.id : `temp_${Date.now()}`,
        habits: targetHabit ? { habit_name: targetHabit.habit_name, icon: targetHabit.icon, color: targetHabit.color } : null,
        goals: selectedGoalObj ? { goal_name: selectedGoalObj.goal_name, target_date: selectedGoalObj.target_date, status: selectedGoalObj.status } : null,
        goal_milestones: selectedMsObj ? { id: selectedMsObj.id, title: selectedMsObj.title, completed: selectedMsObj.completed } : null,
        learning_journeys: selectedJourneyObj ? { title: selectedJourneyObj.title, target_date: selectedJourneyObj.target_date, status: selectedJourneyObj.status } : null,
        learning_topics: selectedTopicObj ? { id: selectedTopicObj.id, title: selectedTopicObj.title, target_date: selectedTopicObj.target_date, status: selectedTopicObj.status } : null,
        ...(!editing && { notification_status: payload.notification_status || 'Active' }),
        is_alarm: payload.is_alarm || false,
      };

      // Optimistic update so reminder appears / updates immediately in list without clobbering concurrent status updates
      if (editing) {
        setReminders((prev) => prev.map((r) => (r.id === editing.id ? { ...r, ...optimisticEntry } : r)));
      } else {
        setReminders((prev) => [optimisticEntry, ...prev]);
      }
      setModalOpen(false);

      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { ...payload, id: editing.id } : payload;
      const res = await fetch('/api/reminders', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const savedData = await res.json().catch(() => null);
        if (savedData?.id && !editing) {
          setReminders((current) => current.map((r) => (r.id === optimisticEntry.id ? { ...r, ...savedData, id: savedData.id } : r)));
          if (isNative) {
            cancelNativeReminder(optimisticEntry.id).catch(() => {});
            const targetName = effectiveTargetType === 'habit'
              ? habits.find((h) => h.id === form.habit_id)?.habit_name
              : effectiveTargetType === 'goal'
              ? selectedGoalObj?.goal_name
              : effectiveTargetType === 'learning_topic'
              ? selectedTopicObj?.title
              : selectedJourneyObj?.title || 'Reminder';
            scheduleSingleNativeReminder({
              ...savedData,
              target_date: targetDeadline,
              goals: savedData.goals || selectedGoalObj || null,
              goal_milestones: savedData.goal_milestones || selectedMsObj || null,
              goal_has_milestones: milestones.some((m) => m.goal_id === form.goal_id),
              learning_journeys: savedData.learning_journeys || selectedJourneyObj || null,
              learning_topics: savedData.learning_topics || selectedTopicObj || null,
              target_name: targetName,
            }, targetName).catch(() => {});
          }
        }
        const effectiveReminder = {
          ...payload,
          ...(savedData || {}),
          target_date:
            savedData?.target_date ||
            targetDeadline,
          goals: savedData?.goals || selectedGoalObj || null,
          goal_milestones: savedData?.goal_milestones || selectedMsObj || null,
          learning_journeys: savedData?.learning_journeys || selectedJourneyObj || null,
          learning_topics: savedData?.learning_topics || selectedTopicObj || null,
        };
        setToast(formatFirstRingToast(effectiveReminder, new Date(), completedHabitIds));
        fetchData();
      } else {
        if (editing) {
          if (formFieldsToRestore) {
            setReminders((current) => current.map((r) => (r.id === editing.id ? { ...r, ...formFieldsToRestore } : r)));
          }
          fetchData();
        } else if (optimisticEntry?.id) {
          setReminders((current) => current.filter((r) => r.id !== optimisticEntry.id));
        }
        const errJson = await res.json().catch(() => ({}));
        setToast({ message: errJson.error || 'Failed to save reminder.', type: 'error' });
      }
    } catch {
      if (editing) {
        if (formFieldsToRestore) {
          setReminders((current) => current.map((r) => (r.id === editing.id ? { ...r, ...formFieldsToRestore } : r)));
        }
        fetchData();
      } else if (optimisticEntry?.id) {
        setReminders((current) => current.filter((r) => r.id !== optimisticEntry.id));
      }
      setToast({ message: 'Network error — please check your connection.', type: 'error' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleStatus = async (reminder) => {
    const newStatus = reminder.notification_status === 'Active' ? 'Inactive' : 'Active';
    const originalStatus = reminder.notification_status;

    // Instant optimistic status update
    setReminders((prev) => prev.map((r) => (r.id === reminder.id ? { ...r, notification_status: newStatus } : r)));

    // Immediately update Android AlarmManager scheduling on device
    if (isNative) {
      if (newStatus === 'Active') {
        const targetName = reminder.habits?.habit_name || reminder.goals?.goal_name || reminder.learning_journeys?.title || 'Reminder';
        const isAlarmRem = Boolean(reminder.is_alarm || reminder.reminder_mode === 'alarm');
        scheduleSingleNativeReminder({ ...reminder, notification_status: 'Active' }, targetName)
          .then((schedRes) => {
            if (isAlarmRem) {
              maybePromptFullScreenIntent(schedRes);
            }
          })
          .catch(() => {});
      } else {
        cancelNativeReminder(reminder.id).catch(() => {});
      }
    }

    try {
      const res = await fetch('/api/reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...reminder, notification_status: newStatus }),
      });
      if (res.ok) {
        setToast({
          message: `Reminder ${newStatus === 'Active' ? 'Activated 🔔' : 'Deactivated 🔕'}`,
          type: 'success',
        });
        fetchData();
      } else {
        setReminders((current) => current.map((r) => (r.id === reminder.id ? { ...r, notification_status: originalStatus } : r)));
        const errJson = await res.json().catch(() => ({}));
        setToast({ message: errJson.error || 'Failed to update reminder status.', type: 'error' });
      }
    } catch {
      setReminders((current) => current.map((r) => (r.id === reminder.id ? { ...r, notification_status: originalStatus } : r)));
      setToast({ message: 'Network error — failed to update reminder status.', type: 'error' });
    }
  };

  const handleDelete = (id) => {
    const target = reminders.find((r) => r.id === id);
    if (!target) return;
    setPendingDeleteReminder(target);
  };

  const handleConfirmDelete = async (id) => {
    setDeletingReminder(true);
    const deletedReminder = reminders.find((r) => r.id === id);

    // Instant optimistic deletion
    setReminders((prev) => prev.filter((r) => r.id !== id));

    // Immediately remove from Android AlarmManager
    if (isNative) {
      cancelNativeReminder(id).catch(() => {});
    }

    try {
      const res = await fetch('/api/reminders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setToast({ message: 'Reminder deleted', type: 'success' });
        setPendingDeleteReminder(null);
        fetchData();
      } else {
        setReminders((current) => (deletedReminder && !current.some((r) => r.id === id) ? [...current, deletedReminder] : current));
        const e = await res.json().catch(() => ({}));
        setToast({ message: e.error || 'Failed to delete.', type: 'error' });
      }
    } catch {
      setReminders((current) => (deletedReminder && !current.some((r) => r.id === id) ? [...current, deletedReminder] : current));
      setToast({ message: 'Network error.', type: 'error' });
    } finally {
      setDeletingReminder(false);
    }
  };

  const addAlertSlot = () => {
    setForm({ ...form, alerts: [...form.alerts, '12:00'] });
  };

  const removeAlertSlot = (index) => {
    if (form.alerts.length <= 1) return;
    const next = form.alerts.filter((_, i) => i !== index);
    setForm({ ...form, alerts: next });
  };

  const updateAlertTime = (index, value) => {
    const timeStr = getTimeValue(value);
    const next = [...form.alerts];
    next[index] = timeStr;
    const routine = getRoutineWindow(next[0] || '08:00');
    setForm({ ...form, alerts: next, reminder_time: next[0] || '08:00', routine_window: routine });
  };

  const toggleDayOfWeek = (day) => {
    const exists = form.days_of_week.includes(day);
    const next = exists ? form.days_of_week.filter((d) => d !== day) : [...form.days_of_week, day];
    setForm({ ...form, days_of_week: next });
  };

  const setWeekdayPreset = (type) => {
    if (type === 'Everyday') setForm({ ...form, days_of_week: [...WEEKDAYS] });
    if (type === 'Weekdays') setForm({ ...form, days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] });
    if (type === 'Weekends') setForm({ ...form, days_of_week: ['Sat', 'Sun'] });
  };

  // Counts for Category Tabs
  const habitRemindersCount = reminders.filter(r => !r.target_type || r.target_type === 'habit').length;
  const goalRemindersCount = reminders.filter(r => r.target_type === 'goal').length;
  const learningRemindersCount = reminders.filter(r => r.target_type === 'learning_journey' || r.target_type === 'learning_topic').length;

  // Filter reminders by Category and Routine Tab
  const now = new Date();
  const currentHour = now.getHours();
  const currentWindow = currentHour >= 5 && currentHour < 12 ? 'Morning' : currentHour >= 12 && currentHour < 17 ? 'Afternoon' : 'Evening';

  const filteredReminders = reminders.filter((rem) => {
    const type = rem.target_type || 'habit';
    if (categoryFilter === 'habit' && type !== 'habit') return false;
    if (categoryFilter === 'goal' && type !== 'goal') return false;
    if (categoryFilter === 'learning' && type !== 'learning_journey' && type !== 'learning_topic') return false;

    // Routine filter
    const alerts = Array.isArray(rem.alerts) && rem.alerts.length > 0 ? rem.alerts : [rem.reminder_time];
    const windowCat = rem.routine_window || getRoutineWindow(alerts[0]);

    if (activeTab === 'All') return true;
    if (activeTab === 'Due Now') return windowCat === currentWindow && rem.notification_status === 'Active';
    if (activeTab === 'Morning') return windowCat === 'Morning';
    if (activeTab === 'Afternoon') return windowCat === 'Afternoon';
    if (activeTab === 'Evening') return windowCat === 'Evening';
    return true;
  });

  return (
    <div className="space-y-6 page-enter pb-10">
      {/* ── Page Header (Matching Reference Screen 5) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Reminders
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Never miss what matters.
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => openAdd('habit')}
          className="inline-flex items-center gap-2 bg-[#178274] hover:bg-[#136c60] text-white px-4 py-2.5 rounded-xl font-bold text-xs transition-colors shadow-lg shadow-teal-950/40 flex-shrink-0 cursor-pointer"
        >
          <Plus size={16} /> New Reminder
        </motion.button>
      </div>

      {/* ── Top Enable Notifications Banner (Dismissed/Removed once enabled) ── */}
      {permission !== 'granted' && (
        <div className="habiz-panel p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-teal-500/25 bg-gradient-to-r from-teal-950/40 via-teal-900/20 to-transparent">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-300 flex items-center justify-center flex-shrink-0 shadow-sm">
              <BellRing size={20} className="animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-tight">
                Enable Notifications
              </h4>
              <p className="text-xs text-slate-300 mt-0.5">
                Get timely reminders and stay on track with your routine.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={handleEnablePush}
              className="bg-[#178274] hover:bg-[#136c60] text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-teal-950/40 active:scale-95 cursor-pointer"
            >
              Enable
            </button>
          </div>
        </div>
      )}

      {/* ── Category Filter Tabs: All, Habits, Goals, Learning (Matching Reference) ── */}
      <div className="flex flex-wrap items-center gap-2 relative">
        {[
          { id: 'All', label: 'All', count: reminders.length },
          { id: 'habit', label: 'Habits', count: habitRemindersCount },
          { id: 'goal', label: 'Goals', count: goalRemindersCount },
          { id: 'learning', label: 'Learning', count: learningRemindersCount },
        ].map(cat => {
          const active = categoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`relative flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                active
                  ? 'text-teal-300'
                  : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="activeReminderCategory"
                  className="absolute inset-0 bg-[#153834] border border-teal-500/35 rounded-xl shadow-xs -z-0"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10">{cat.label}</span>
              <span className={`relative z-10 text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                active ? 'bg-teal-400/20 text-teal-300' : 'bg-white/[0.05] text-slate-400'
              }`}>
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Routine Filter Sub-Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none p-1 rounded-2xl border border-white/[0.06] bg-black/30 relative">
        {[
          { id: 'All', label: 'All Routines', icon: Clock },
          { id: 'Due Now', label: `Due Now (${currentWindow})`, icon: Sparkles },
          { id: 'Morning', label: 'Morning (5AM - 12PM)', icon: Sun },
          { id: 'Afternoon', label: 'Afternoon (12PM - 5PM)', icon: Sunset },
          { id: 'Evening', label: 'Evening (5PM - 11PM)', icon: Moon },
        ].map((tab) => {
          const TabIcon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="activeReminderRoutine"
                  className="absolute inset-0 bg-slate-800 rounded-xl -z-0"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <TabIcon size={13} className="relative z-10" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {fetchError && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600">{fetchError}</p>
          <button onClick={fetchData} className="ml-auto text-xs font-medium text-red-600 underline">
            Retry
          </button>
        </div>
      )}

      {/* Reminders List - Styled after Reference Screen 5 */}
      {loading ? (
        <HabizLoader size="md" text="Loading reminders..." />
      ) : (
        <div className="space-y-4">
          <motion.div layout className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredReminders.map((rem) => {
              const type = rem.target_type || 'habit';
              const isHabit = type === 'habit';
              const isGoal = type === 'goal';
              const isLearning = type === 'learning_journey' || type === 'learning_topic';

              const matchedGoal = isGoal ? goals.find((g) => g.id === rem.goal_id) : null;
              const matchedMs = isGoal && rem.milestone_id
                ? milestones.find((m) => m.id === rem.milestone_id)
                : null;
              const matchedJourney = isLearning
                ? journeys.find((j) => j.id === rem.journey_id)
                : null;
              const matchedTopic = isLearning && rem.topic_id
                ? (matchedJourney?.topics || []).find((t) => t.id === rem.topic_id)
                : null;

              const goalName = rem.goals?.goal_name || matchedGoal?.goal_name || 'Goal';
              const milestoneTitle = rem.goal_milestones?.title || matchedMs?.title || '';
              const journeyTitle = rem.learning_journeys?.title || matchedJourney?.title || 'Learning Roadmap';
              const topicTitle = rem.learning_topics?.title || matchedTopic?.title || '';

              const goalHasMilestones = isGoal && Boolean(
                rem.goal_has_milestones ||
                milestones.some((m) => m.goal_id === rem.goal_id)
              );

              const itemName = isHabit
                ? rem.habits?.habit_name || 'Habit'
                : isGoal
                ? (milestoneTitle ? `Goal: "${goalName}" - Milestone: "${milestoneTitle}"` : `Goal: "${goalName}"`)
                : (topicTitle ? `Learning Topic: "${topicTitle}"` : `Learning Roadmap: "${journeyTitle}"`);

              const subTargetLabel = isGoal && !milestoneTitle
                ? (goalHasMilestones ? 'Whole goal • acknowledges today' : 'Whole goal')
                : isLearning && topicTitle && journeyTitle
                ? `Roadmap: ${journeyTitle}`
                : isLearning && !topicTitle
                ? 'Whole journey'
                : '';

              const completedMilestoneIds = matchedMs?.completed ? new Set([matchedMs.id]) : new Set();
              const completedGoalIds = matchedGoal?.status === 'Completed' ? new Set([matchedGoal.id]) : new Set();
              const completedLearningIds = new Set();
              if (matchedJourney?.status === 'Completed') completedLearningIds.add(matchedJourney.id);
              if (matchedTopic?.status === 'Completed') completedLearningIds.add(matchedTopic.id);

              const isCompletedTarget = !isHabit && isReminderTargetCompleted(rem, {
                completedGoalIds,
                completedMilestoneIds,
                completedLearningIds,
              });
              const isDone = rem.notification_status === 'Done' || isCompletedTarget;
              const isActive = !isDone && rem.notification_status === 'Active';

              const entityTargetDate = isGoal
                ? (matchedGoal?.target_date || rem.goals?.target_date || null)
                : isLearning
                ? (matchedTopic?.target_date || rem.learning_topics?.target_date || matchedJourney?.target_date || rem.learning_journeys?.target_date || null)
                : null;
              const todayStr = formatLocalYMD(now);
              const deadlineWarning = !isDone && !isHabit && isReminderDeadlineInvalidated(rem, entityTargetDate, todayStr);

              const alertsList = Array.isArray(rem.alerts) && rem.alerts.length > 0
                ? rem.alerts
                : [rem.reminder_time || '08:00'];
              const routine = rem.routine_window || getRoutineWindow(alertsList[0]);
              const days = Array.isArray(rem.days_of_week) ? rem.days_of_week : WEEKDAYS;
              const isDeadlineMode = rem.reminder_mode === 'deadline_proximity';

              // Humanized schedule text (plain words: date + time, next ring time)
              let scheduleText = '';
              if (isDeadlineMode) {
                const timeFormatted = format12Hour(rem.reminder_time || alertsList[0] || '09:00');
                if (rem.remind_on_date) {
                  scheduleText = `On ${formatDDMonYYYY(rem.remind_on_date)} at ${timeFormatted}`;
                } else {
                  const fireDate = getDeadlineFireDateYMD({ ...rem, target_date: entityTargetDate });
                  const daysBefore = rem.days_before_deadline ?? 1;
                  const prefix = daysBefore === 0
                    ? 'On due date'
                    : `${daysBefore} day${daysBefore > 1 ? 's' : ''} before deadline`;
                  scheduleText = fireDate
                    ? `${prefix} (${formatDDMonYYYY(fireDate)}) at ${timeFormatted}`
                    : `${prefix} at ${timeFormatted}`;
                }
              } else if (days.length === 7) {
                scheduleText = `Every day at ${alertsList.map(format12Hour).join(', ')}`;
              } else if (days.length === 5 && !days.includes('Sat') && !days.includes('Sun')) {
                scheduleText = `Weekdays at ${alertsList.map(format12Hour).join(', ')}`;
              } else {
                scheduleText = `${days.join(', ')} at ${alertsList.map(format12Hour).join(', ')}`;
              }

              let nextRingLabel = '';
              if (isActive && !deadlineWarning) {
                const enrichedForNext = {
                  ...rem,
                  target_date: entityTargetDate || rem.target_date,
                  goal_has_milestones: goalHasMilestones,
                };
                const nextFire = getNextFireTime(enrichedForNext, now, {
                  completedHabitIds,
                  completedGoalIds,
                  completedMilestoneIds,
                  completedLearningIds,
                });
                if (nextFire) {
                  const fireYMD = formatLocalYMD(nextFire);
                  const tomorrowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
                  const tomorrowYMD = formatLocalYMD(tomorrowDate);
                  const dayPart = fireYMD === todayStr
                    ? 'Today'
                    : fireYMD === tomorrowYMD
                    ? 'Tomorrow'
                    : formatDDMonYYYY(fireYMD);
                  const nh = String(nextFire.getHours()).padStart(2, '0');
                  const nm = String(nextFire.getMinutes()).padStart(2, '0');
                  nextRingLabel = `Next ring: ${dayPart} at ${format12Hour(`${nh}:${nm}`)}`;
                } else if (isDeadlineMode) {
                  nextRingLabel = 'No upcoming ring';
                }
              }

              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2 }}
                  key={rem.id}
                  className={`habiz-panel p-4 sm:p-5 rounded-2xl transition-colors duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    isActive ? 'hover:border-white/15' : 'opacity-60'
                  }`}
                >
                {/* Left: Icon Circle + Details */}
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform ${
                    isHabit
                      ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                      : isGoal
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  }`}>
                    {isHabit ? <CheckCircle2 size={20} /> : isGoal ? <Target size={20} /> : <GraduationCap size={20} />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-bold text-sm sm:text-base tracking-tight truncate ${
                        isDone ? 'text-slate-300 line-through decoration-slate-500/60' : 'text-white'
                      }`}>
                        {itemName}
                      </h3>
                      {isDone && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          <Check size={10} /> Done
                        </span>
                      )}
                      {rem.is_alarm && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/30">
                          <BellRing size={10} /> Alarm
                        </span>
                      )}
                      {subTargetLabel && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded text-slate-300 bg-white/[0.05] border border-white/[0.06]">
                          {subTargetLabel}
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded text-slate-400 bg-white/[0.04] border border-white/[0.04]">
                        {routine}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                      <Clock size={12} className="text-teal-400 flex-shrink-0" />
                      <span>{scheduleText}</span>
                      {nextRingLabel && (
                        <span className="text-[11px] text-teal-300/90">• {nextRingLabel}</span>
                      )}
                    </p>

                    {deadlineWarning && (
                      <p className="text-[11px] text-amber-300 mt-1 flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-amber-400 flex-shrink-0" />
                        <span>Deadline changed, check this reminder</span>
                      </p>
                    )}

                    {rem.custom_text && (
                      <p className="text-[11px] text-slate-400 italic mt-1 truncate">
                        "{rem.custom_text}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Alarm switch + Toggle + Edit/Delete */}
                <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.04]">
                  {!isDone && (
                    <button
                      type="button"
                      onClick={() => handleToggleAlarm(rem)}
                      className={`text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors cursor-pointer border ${
                        rem.is_alarm
                          ? 'bg-red-500/15 text-red-300 border-red-500/30'
                          : 'bg-white/[0.03] text-slate-400 border-white/[0.06] hover:text-white'
                      }`}
                      title="Toggle Full-Screen Alarm Mode"
                    >
                      {rem.is_alarm ? 'Alarm: ON' : 'Alarm: OFF'}
                    </button>
                  )}

                  {/* Toggle Switch (hidden when Done so completed reminders stay clearly Done) */}
                  {!isDone && (
                    <button
                      onClick={() => handleToggleStatus(rem)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                        isActive ? 'bg-[#178274]' : 'bg-white/10'
                      }`}
                      title={isActive ? 'Deactivate reminder' : 'Activate reminder'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-xs ${
                          isActive ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  )}

                  {/* Action icons */}
                  <div className="flex items-center gap-1">
                    {!isDone && (
                      <button
                        onClick={() => openEdit(rem)}
                        className="p-1.5 text-slate-400 hover:text-teal-300 hover:bg-white/[0.05] rounded-lg transition-colors cursor-pointer"
                        title="Edit Reminder"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(rem.id)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Delete Reminder"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

          {filteredReminders.length === 0 && !fetchError && (
            <div className="habiz-panel rounded-2xl py-14 flex flex-col items-center gap-3 text-center px-4">
              <div className="w-12 h-12 bg-teal-500/10 border border-teal-500/20 rounded-2xl flex items-center justify-center text-teal-400">
                <Bell size={24} />
              </div>
              <h3 className="text-white font-bold text-base">No reminders found</h3>
              <p className="text-slate-400 text-xs max-w-sm">
                {categoryFilter !== 'All'
                  ? `No reminders set for ${categoryFilter}.`
                  : 'Set custom alerts for your habits, goals, and learning roadmaps.'}
              </p>
              <button
                onClick={() => openAdd('habit')}
                className="mt-1 px-4 py-2 bg-[#178274] hover:bg-[#136c60] text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                + Add Reminder
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Unified Modal */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setFormError(''); }} title={editing ? 'Edit Reminder' : 'Add Smart Reminder'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Target Type Segmented Control */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              What do you want a reminder for?
            </label>
            <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
              {[
                { type: 'habit', label: 'Habit', icon: CheckCircle2 },
                { type: 'goal', label: 'Goal', icon: Target },
                { type: 'learning_journey', label: 'Roadmap', icon: GraduationCap },
              ].map(item => {
                const ItemIcon = item.icon;
                const isSelected = form.target_type === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => {
                      setFormError('');
                      setForm({
                        ...form,
                        target_type: item.type,
                        habit_id: item.type === 'habit' ? (habits[0]?.id || '') : '',
                        goal_id: item.type === 'goal' ? getFirstActiveTargetId(goals, isGoalCompleted) : '',
                        milestone_id: '',
                        journey_id: item.type === 'learning_journey' ? getFirstActiveTargetId(journeys, isJourneyCompleted) : '',
                        topic_id: '',
                        remind_on_date: '',
                        use_custom_date: false,
                        reminder_mode: item.type === 'goal' ? 'deadline_proximity' : 'scheduled',
                        is_alarm: form.is_alarm,
                      });
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-[#3d7a75] text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <ItemIcon size={14} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Target Entity Dropdown based on Type */}
          {form.target_type === 'habit' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Habit</label>
              {habits.length === 0 ? (
                <p className="text-xs text-amber-600 p-2 bg-amber-50 rounded-lg">No habits found. Please create one on the My Habits page.</p>
              ) : (
                <CustomSelect
                  required
                  value={form.habit_id}
                  onChange={(e) => setForm({ ...form, habit_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-[#2a343d] rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-sm dark:bg-[#14181c] dark:text-slate-100"
                >
                  {habits.map((h) => (
                    <option key={h.id} value={h.id}>{h.habit_name}</option>
                  ))}
                </CustomSelect>
              )}
            </div>
          )}

          {form.target_type === 'goal' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Goal</label>
                {goals.length === 0 ? (
                  <p className="text-xs text-amber-600 p-2 bg-amber-50 rounded-lg">No goals found. Please create one on the Goals page.</p>
                ) : (
                  <CustomSelect
                    required
                    value={form.goal_id}
                    onChange={(e) => {
                      setFormError('');
                      setForm({ ...form, goal_id: e.target.value, milestone_id: '' });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-[#2a343d] rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-sm dark:bg-[#14181c] dark:text-slate-100"
                  >
                    {sortTargetsActiveFirst(goals, isGoalCompleted).map((g) => (
                      <option key={g.id} value={g.id} disabled={isGoalCompleted(g)}>
                        {formatGoalPickerLabel(g)}
                      </option>
                    ))}
                  </CustomSelect>
                )}
              </div>

              {(() => {
                const goalMs = milestones.filter((m) => m.goal_id === form.goal_id);
                if (goalMs.length === 0) return null;
                const sortedMs = [...goalMs].sort((a, b) => Number(Boolean(a.completed)) - Number(Boolean(b.completed)));
                return (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      What is this reminder for?
                    </label>
                    <CustomSelect
                      value={form.milestone_id || ''}
                      onChange={(e) => setForm({ ...form, milestone_id: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-[#2a343d] rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-sm dark:bg-[#14181c] dark:text-slate-100"
                    >
                      <option value="">Whole goal</option>
                      {sortedMs.map((ms) => (
                        <option key={ms.id} value={ms.id} disabled={Boolean(ms.completed)}>
                          {ms.completed ? `${ms.title} (Completed)` : ms.title}
                        </option>
                      ))}
                    </CustomSelect>
                  </div>
                );
              })()}
            </>
          )}

          {form.target_type === 'learning_journey' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Learning Roadmap</label>
                {journeys.length === 0 ? (
                  <p className="text-xs text-amber-600 p-2 bg-amber-50 rounded-lg">No learning journeys found. Please create one in Learning Hub.</p>
                ) : (
                  <CustomSelect
                    required
                    value={form.journey_id}
                    onChange={(e) => {
                      setFormError('');
                      setForm({ ...form, journey_id: e.target.value, topic_id: '' });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-[#2a343d] rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-sm dark:bg-[#14181c] dark:text-slate-100"
                  >
                    {sortTargetsActiveFirst(journeys, isJourneyCompleted).map((j) => (
                      <option key={j.id} value={j.id} disabled={isJourneyCompleted(j)}>
                        {formatJourneyPickerLabel(j)}
                      </option>
                    ))}
                  </CustomSelect>
                )}
              </div>

              {(() => {
                const selectedJ = journeys.find((j) => j.id === form.journey_id);
                const topicsList = Array.isArray(selectedJ?.topics) ? selectedJ.topics : [];
                if (topicsList.length === 0) return null;
                const sortedTopics = [...topicsList].sort(
                  (a, b) => Number(a.status === 'Completed') - Number(b.status === 'Completed')
                );
                return (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      What is this reminder for?
                    </label>
                    <CustomSelect
                      value={form.topic_id || ''}
                      onChange={(e) => {
                        setFormError('');
                        setForm({ ...form, topic_id: e.target.value });
                      }}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-[#2a343d] rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-sm dark:bg-[#14181c] dark:text-slate-100"
                    >
                      <option value="">Whole journey</option>
                      {sortedTopics.map((tp) => {
                        const isDoneTopic = tp.status === 'Completed';
                        return (
                          <option key={tp.id} value={tp.id} disabled={isDoneTopic}>
                            {isDoneTopic ? `${tp.title} (Completed)` : tp.title}
                          </option>
                        );
                      })}
                    </CustomSelect>
                  </div>
                );
              })()}
            </>
          )}

          {/* 3. Reminder Mode Toggle (Scheduled vs Deadline Proximity) */}
          {(form.target_type === 'goal' || form.target_type === 'learning_journey') && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Reminder Trigger Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormError('');
                    setForm({ ...form, reminder_mode: 'deadline_proximity' });
                  }}
                  className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                    form.reminder_mode === 'deadline_proximity'
                      ? 'border-[#3d7a75] bg-[#e2f0ef] dark:bg-[#14302e] text-[#2c6560] dark:text-[#7cc3bb]'
                      : 'border-slate-200 dark:border-[#2a343d] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1 mb-0.5">
                    <AlertTriangle size={13} /> Deadline Alert
                  </div>
                  <span className="text-[10px] opacity-80">Notify X days before or pick a date</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormError('');
                    setForm({ ...form, reminder_mode: 'scheduled' });
                  }}
                  className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                    form.reminder_mode === 'scheduled'
                      ? 'border-[#3d7a75] bg-[#e2f0ef] dark:bg-[#14302e] text-[#2c6560] dark:text-[#7cc3bb]'
                      : 'border-slate-200 dark:border-[#2a343d] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1 mb-0.5">
                    <Clock size={13} /> Recurring Routine
                  </div>
                  <span className="text-[10px] opacity-80">Check-in at set time & days</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. Days Before Deadline / Custom Date Selector (when deadline_proximity is active) */}
          {form.reminder_mode === 'deadline_proximity' ? (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-[#2a343d] space-y-2.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                When should we alert you?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {[
                  { days: 7, label: '7 Days Before' },
                  { days: 3, label: '3 Days Before' },
                  { days: 1, label: '1 Day Before' },
                  { days: 0, label: 'On Target Date' },
                ].map(opt => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => {
                      setFormError('');
                      setForm({
                        ...form,
                        use_custom_date: false,
                        remind_on_date: '',
                        days_before_deadline: opt.days,
                      });
                    }}
                    className={`p-2 rounded-lg text-xs font-bold transition-all text-center ${
                      !form.use_custom_date && form.days_before_deadline === opt.days
                        ? 'bg-[#3d7a75] text-white shadow-xs'
                        : 'bg-white dark:bg-[#14181c] border border-slate-200 dark:border-[#2a343d] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setFormError('');
                    const todayDefault = formatLocalYMD(new Date());
                    setForm({
                      ...form,
                      use_custom_date: true,
                      remind_on_date: form.remind_on_date || todayDefault,
                    });
                  }}
                  className={`p-2 rounded-lg text-xs font-bold transition-all text-center ${
                    form.use_custom_date
                      ? 'bg-[#3d7a75] text-white shadow-xs'
                      : 'bg-white dark:bg-[#14181c] border border-slate-200 dark:border-[#2a343d] text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Pick a date
                </button>
              </div>

              {form.use_custom_date && (
                <div className="pt-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Reminder Date
                  </label>
                  <CustomDatePicker
                    value={form.remind_on_date}
                    onChange={(e) => {
                      setFormError('');
                      setForm({ ...form, remind_on_date: e.target.value });
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              )}

              {formError && (
                <p className="text-xs font-medium text-red-400 flex items-center gap-1.5">
                  <AlertCircle size={13} className="flex-shrink-0" />
                  <span>{formError}</span>
                </p>
              )}

              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Alert Time on that day
                </label>
                <CustomTimePicker
                  value={form.reminder_time}
                  onChange={(val) => {
                    setFormError('');
                    setForm({ ...form, reminder_time: getTimeValue(val) });
                  }}
                />
              </div>
            </div>
          ) : (
            /* 5. Multiple Alerts & Days of Week (when scheduled routine is active) */
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Scheduled Alarm Times ({form.alerts.length})
                  </label>
                  <button
                    type="button"
                    onClick={addAlertSlot}
                    className="text-xs font-semibold text-[#3d7a75] dark:text-[#5fae9e] hover:underline flex items-center gap-1"
                  >
                    <Plus size={13} /> Add Alert
                  </button>
                </div>

                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {form.alerts.map((timeVal, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex-1">
                        <CustomTimePicker
                          value={timeVal}
                          onChange={(val) => updateAlertTime(idx, val)}
                        />
                      </div>
                      {form.alerts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeAlertSlot(idx)}
                          className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="Remove alert"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Days of Week */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Repeat Days</label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button type="button" onClick={() => setWeekdayPreset('Everyday')} className="text-[#3d7a75] dark:text-[#5fae9e] hover:underline font-semibold">Everyday</button>
                    <span className="text-slate-300">·</span>
                    <button type="button" onClick={() => setWeekdayPreset('Weekdays')} className="text-[#3d7a75] dark:text-[#5fae9e] hover:underline font-semibold">Weekdays</button>
                    <span className="text-slate-300">·</span>
                    <button type="button" onClick={() => setWeekdayPreset('Weekends')} className="text-[#3d7a75] dark:text-[#5fae9e] hover:underline font-semibold">Weekends</button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((day) => {
                    const selected = form.days_of_week.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDayOfWeek(day)}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          selected
                            ? 'bg-[#3d7a75] text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Custom Message */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Custom Motivation Message (Optional)
            </label>
            <input
              type="text"
              placeholder={
                form.target_type === 'goal'
                  ? 'e.g. You are closer to your goal than yesterday!'
                  : form.target_type === 'learning_journey'
                  ? 'e.g. Time to code and conquer today’s module!'
                  : 'e.g. Small steps lead to big streaks!'
              }
              value={form.custom_text}
              onChange={(e) => setForm({ ...form, custom_text: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 dark:border-[#2a343d] rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-sm dark:bg-[#14181c] dark:text-slate-100"
            />
          </div>

          {/* Alarm-Style Reminder Toggle */}
          {(form.target_type === 'habit' || form.target_type === 'goal' || form.target_type === 'learning_journey' || form.target_type === 'learning_topic') && (
            <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-[#3a2c14]/40 border border-amber-200/80 dark:border-amber-800/40 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                    <BellRing size={14} className="text-amber-600 dark:text-amber-400" />
                    <span>Alarm-Style Takeover Reminder</span>
                  </div>
                  <p className="text-[11px] text-amber-700/90 dark:text-amber-300/80 mt-0.5">
                    Takes over the screen when open, looping alarm sound, sticky notifications, and 25-min re-pings.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_alarm)}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      setForm({ ...form, is_alarm: checked });
                      if (checked && isNative) {
                        requestAlarmPermissionCheck({ beforeScheduling: true });
                        const exactAllowed = await checkExactAlarmPermission();
                        if (!exactAllowed) {
                          await requestExactAlarmPermission();
                        }
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#3d7a75]" />
                </label>
              </div>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-[#2a343d]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formLoading}
              className="px-5 py-2 text-sm font-bold text-white bg-[#178274] hover:bg-[#136c60] rounded-xl transition-all shadow-md shadow-teal-950/40 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {formLoading ? 'Saving...' : editing ? 'Update Reminder' : 'Create Reminder'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(pendingDeleteReminder)}
        onClose={() => { if (!deletingReminder) setPendingDeleteReminder(null); }}
        title="Delete Reminder"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-300">
            Delete reminder for{' '}
            <span className="font-semibold text-white">
              {pendingDeleteReminder
                ? (
                  pendingDeleteReminder.goal_milestones?.title
                    ? `${pendingDeleteReminder.goals?.goal_name || pendingDeleteReminder.goal_name || 'Goal'} — ${pendingDeleteReminder.goal_milestones.title}`
                    : pendingDeleteReminder.goals?.goal_name
                    || pendingDeleteReminder.goal_name
                    || (pendingDeleteReminder.learning_topics?.title
                      ? `${pendingDeleteReminder.learning_journeys?.title || 'Learning Roadmap'} — ${pendingDeleteReminder.learning_topics.title}`
                      : pendingDeleteReminder.learning_journeys?.title)
                    || pendingDeleteReminder.habits?.habit_name
                    || pendingDeleteReminder.habit_name
                    || pendingDeleteReminder.custom_text
                    || 'this reminder'
                )
                : ''}
            </span>
            ?
          </p>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={deletingReminder}
              onClick={() => setPendingDeleteReminder(null)}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deletingReminder || !pendingDeleteReminder}
              onClick={() => pendingDeleteReminder && handleConfirmDelete(pendingDeleteReminder.id)}
              className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {deletingReminder ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
