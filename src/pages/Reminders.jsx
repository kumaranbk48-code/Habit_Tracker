import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import CustomSelect from '../components/CustomSelect';
import CustomTimePicker from '../components/CustomTimePicker';
import {
  Plus, Pencil, Trash2, Bell, BellOff, BellRing, AlertCircle, ShieldCheck,
  Sun, Sunset, Moon, Clock, Calendar, Check, MessageSquare, Sparkles,
  Target, GraduationCap, CheckCircle2, AlertTriangle, Layers, BookOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePushNotifications } from '../hooks/usePushNotifications';
import HabizLoader from '../components/HabizLoader';

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

export default function Reminders() {
  const { session } = useAuth();
  const location = useLocation();

  const [reminders, setReminders] = useState([]);
  const [habits, setHabits] = useState([]);
  const [goals, setGoals] = useState([]);
  const [journeys, setJourneys] = useState([]);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [formLoading, setFormLoading] = useState(false);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState('All'); // 'All' | 'habit' | 'goal' | 'learning'
  const [activeTab, setActiveTab] = useState('All'); // 'All' | 'Due Now' | 'Morning' | 'Afternoon' | 'Evening'

  // Unified Form state
  const [form, setForm] = useState({
    target_type: 'habit', // 'habit' | 'goal' | 'learning_journey' | 'learning_topic'
    habit_id: '',
    goal_id: '',
    journey_id: '',
    topic_id: '',
    reminder_mode: 'scheduled', // 'scheduled' | 'deadline_proximity'
    days_before_deadline: 1, // 7, 3, 1, 0
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
    let currentSession = session;
    if (!currentSession) {
      const { data } = await supabase.auth.getSession();
      currentSession = data?.session;
    }
    if (!currentSession) {
      setLoading(false);
      return;
    }
    setFetchError('');
    try {
      const [res, habitsRes, goalsRes, learningRes] = await Promise.all([
        fetch('/api/reminders', { headers: { Authorization: `Bearer ${currentSession.access_token}` } }),
        fetch('/api/habits', { headers: { Authorization: `Bearer ${currentSession.access_token}` } }),
        fetch('/api/goals', { headers: { Authorization: `Bearer ${currentSession.access_token}` } }),
        fetch('/api/learning', { headers: { Authorization: `Bearer ${currentSession.access_token}` } }),
      ]);

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setFetchError(e.error || 'Failed to load reminders.');
        return;
      }

      const data = await res.json();
      const habitsData = habitsRes.ok ? await habitsRes.json() : [];
      const goalsData = goalsRes.ok ? await goalsRes.json() : [];
      const learningData = learningRes.ok ? await learningRes.json() : {};

      const r = Array.isArray(data) ? data : [];
      const h = Array.isArray(habitsData) ? habitsData : [];
      const g = Array.isArray(goalsData) ? goalsData : [];
      const j = learningData?.journeys || (Array.isArray(learningData) ? learningData : []);

      setReminders(r);
      setHabits(h);
      setGoals(g);
      setJourneys(j);

      const activeReminders = r
        .filter((rem) => {
          const s = (rem.notification_status || 'active').toLowerCase();
          return s === 'active';
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
          journey_title: rem.learning_journeys?.title || '',
          topic_title: rem.learning_topics?.title || '',
          target_date: rem.goals?.target_date || rem.learning_journeys?.target_date || rem.learning_topics?.target_date || '',
          alerts: Array.isArray(rem.alerts) && rem.alerts.length > 0 ? rem.alerts.map(getTimeValue) : [getTimeValue(rem.reminder_time)],
          reminder_time: getTimeValue(rem.reminder_time),
        }));
      scheduleLocalReminders(activeReminders);
      window.dispatchEvent(new CustomEvent('habittracker-reminders-updated'));
    } catch (err) {
      console.error(err);
      setFetchError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [session, scheduleLocalReminders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      setToast({ message: 'Push notifications enabled! 🔔', type: 'success' });
    } else {
      setToast({ message: 'Could not enable notifications. Check browser settings.', type: 'error' });
    }
  };

  const handleDisablePush = async () => {
    await unsubscribe();
    setToast({ message: 'Push notifications disabled', type: 'success' });
  };

  const openAdd = (preferredType = 'habit', preferredId = '') => {
    setEditing(null);
    const initialTime = '08:00';
    setForm({
      target_type: preferredType,
      habit_id: preferredType === 'habit' ? (preferredId || habits[0]?.id || '') : (habits[0]?.id || ''),
      goal_id: preferredType === 'goal' ? (preferredId || goals[0]?.id || '') : (goals[0]?.id || ''),
      journey_id: preferredType === 'learning_journey' ? (preferredId || journeys[0]?.id || '') : (journeys[0]?.id || ''),
      topic_id: '',
      reminder_mode: preferredType === 'goal' ? 'deadline_proximity' : 'scheduled',
      days_before_deadline: 1,
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

  const openEdit = (reminder) => {
    setEditing(reminder);
    const parsedAlerts = Array.isArray(reminder.alerts) && reminder.alerts.length > 0
      ? reminder.alerts.map(getTimeValue)
      : [getTimeValue(reminder.reminder_time)];

    const mainTime = getTimeValue(reminder.reminder_time) || parsedAlerts[0] || '08:00';
    const targetType = reminder.target_type || 'habit';

    setForm({
      target_type: targetType,
      habit_id: targetType === 'habit' ? (reminder.habit_id || habits[0]?.id || '') : '',
      goal_id: targetType === 'goal' ? (reminder.goal_id || goals[0]?.id || '') : '',
      journey_id: targetType === 'learning_journey' ? (reminder.journey_id || journeys[0]?.id || '') : '',
      topic_id: targetType === 'learning_topic' ? (reminder.topic_id || '') : '',
      reminder_mode: ['scheduled', 'deadline_proximity', 'smart_nudge'].includes(reminder.reminder_mode)
        ? reminder.reminder_mode
        : (targetType === 'goal' ? 'deadline_proximity' : 'scheduled'),
      days_before_deadline: reminder.days_before_deadline ?? 1,
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
    try {
      const res = await fetch('/api/reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ ...rem, is_alarm: newIsAlarm }),
      });
      if (res.ok) {
        setToast({
          message: newIsAlarm ? 'Alarm Mode Enabled 🔔' : 'Alarm Mode Disabled 🔕',
          type: 'success',
        });
        fetchData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setToast({ message: errJson.error || 'Failed to toggle alarm mode', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error', type: 'error' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formLoading) return;

    if (form.target_type === 'habit' && !form.habit_id) {
      setToast({ message: 'Please select a habit first.', type: 'error' });
      return;
    }
    if (form.target_type === 'goal' && !form.goal_id) {
      setToast({ message: 'Please select a goal first.', type: 'error' });
      return;
    }
    if (form.target_type === 'learning_journey' && !form.journey_id) {
      setToast({ message: 'Please select a learning journey first.', type: 'error' });
      return;
    }

    setFormLoading(true);
    try {
      const cleanAlerts = (Array.isArray(form.alerts) && form.alerts.length > 0 ? form.alerts : [form.reminder_time]).map(getTimeValue);
      const cleanMainTime = getTimeValue(form.reminder_time) || cleanAlerts[0] || '08:00';
      const cleanRoutine = form.routine_window || getRoutineWindow(cleanMainTime);

      const payload = {
        target_type: form.target_type,
        habit_id: form.target_type === 'habit' ? (form.habit_id || null) : null,
        goal_id: form.target_type === 'goal' ? (form.goal_id || null) : null,
        journey_id: form.target_type === 'learning_journey' ? (form.journey_id || null) : null,
        topic_id: form.target_type === 'learning_topic' ? (form.topic_id || null) : null,
        reminder_mode: ['scheduled', 'deadline_proximity', 'smart_nudge'].includes(form.reminder_mode)
          ? form.reminder_mode
          : (form.target_type === 'goal' ? 'deadline_proximity' : 'scheduled'),
        reminder_time: cleanMainTime,
        alerts: cleanAlerts,
        routine_window: cleanRoutine,
        days_before_deadline: Number(form.days_before_deadline) || 0,
        days_of_week: Array.isArray(form.days_of_week) && form.days_of_week.length > 0 ? form.days_of_week : WEEKDAYS,
        custom_text: form.custom_text || '',
        notification_status: form.notification_status || 'Active',
        is_alarm: Boolean(form.is_alarm),
      };

      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { ...payload, id: editing.id } : payload;
      const res = await fetch('/api/reminders', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setToast({ message: editing ? 'Reminder updated!' : 'Reminder created! 🔔', type: 'success' });
        setModalOpen(false);
        fetchData();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setToast({ message: errJson.error || 'Failed to save reminder.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error — please check your connection.', type: 'error' });
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleStatus = async (reminder) => {
    const newStatus = reminder.notification_status === 'Active' ? 'Inactive' : 'Active';
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
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this reminder?')) return;
    try {
      const res = await fetch('/api/reminders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setToast({ message: 'Reminder deleted', type: 'success' });
        fetchData();
      } else {
        const e = await res.json().catch(() => ({}));
        setToast({ message: e.error || 'Failed to delete.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error.', type: 'error' });
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

              const itemName = isHabit
                ? rem.habits?.habit_name || 'Habit'
                : isGoal
                ? rem.goals?.goal_name || 'Goal'
                : rem.learning_topics?.title || rem.learning_journeys?.title || 'Learning Roadmap';

              const alertsList = Array.isArray(rem.alerts) && rem.alerts.length > 0
                ? rem.alerts
                : [rem.reminder_time || '08:00'];
              const routine = rem.routine_window || getRoutineWindow(alertsList[0]);
              const days = Array.isArray(rem.days_of_week) ? rem.days_of_week : WEEKDAYS;
              const isActive = rem.notification_status === 'Active';
              const isDeadlineMode = rem.reminder_mode === 'deadline_proximity';

              // Humanized schedule text
              let scheduleText = '';
              if (isDeadlineMode) {
                const daysBefore = rem.days_before_deadline ?? 1;
                scheduleText = daysBefore === 0
                  ? `On due date at ${format12Hour(rem.reminder_time || '09:00')}`
                  : `${daysBefore} day${daysBefore > 1 ? 's' : ''} before deadline at ${format12Hour(rem.reminder_time || '09:00')}`;
              } else if (days.length === 7) {
                scheduleText = `Every day at ${alertsList.map(format12Hour).join(', ')}`;
              } else if (days.length === 5 && !days.includes('Sat') && !days.includes('Sun')) {
                scheduleText = `Weekdays at ${alertsList.map(format12Hour).join(', ')}`;
              } else {
                scheduleText = `${days.join(', ')} at ${alertsList.map(format12Hour).join(', ')}`;
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
                    isActive ? 'hover:border-white/15' : 'opacity-65'
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
                      <h3 className="font-bold text-white text-sm sm:text-base tracking-tight truncate">
                        {itemName}
                      </h3>
                      {rem.is_alarm && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-500/15 text-red-400 border border-red-500/30">
                          <BellRing size={10} /> Alarm
                        </span>
                      )}
                      <span className="text-[10px] px-1.5 py-0.5 rounded text-slate-400 bg-white/[0.04] border border-white/[0.04]">
                        {routine}
                      </span>
                    </div>

                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 truncate">
                      <Clock size={12} className="text-teal-400 flex-shrink-0" />
                      <span>{scheduleText}</span>
                    </p>

                    {rem.custom_text && (
                      <p className="text-[11px] text-slate-400 italic mt-1 truncate">
                        "{rem.custom_text}"
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Alarm switch + Toggle + Edit/Delete */}
                <div className="flex items-center justify-between sm:justify-end gap-3 self-end sm:self-center w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.04]">
                  {isHabit && (
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

                  {/* Toggle Switch */}
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

                  {/* Action icons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(rem)}
                      className="p-1.5 text-slate-400 hover:text-teal-300 hover:bg-white/[0.05] rounded-lg transition-colors cursor-pointer"
                      title="Edit Reminder"
                    >
                      <Pencil size={14} />
                    </button>
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

      {/* ── Bottom Enable Notifications Banner (Matching Reference Screen 5) ── */}
      <div className="habiz-panel p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-6">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center flex-shrink-0">
            <BellRing size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white tracking-tight">
              Enable Notifications
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Get timely reminders and stay on track with your routine.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {permission === 'granted' && subscribed ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/25">
                <ShieldCheck size={14} /> Active
              </span>
              <button
                onClick={handleDisablePush}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-red-400 font-medium transition-colors cursor-pointer"
              >
                Disable
              </button>
            </div>
          ) : (
            <button
              onClick={handleEnablePush}
              className="bg-[#178274] hover:bg-[#136c60] text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-md shadow-teal-950/40 active:scale-95 cursor-pointer"
            >
              Enable
            </button>
          )}
        </div>
      </div>

      {/* Add / Edit Unified Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Reminder' : 'Add Smart Reminder'}>
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
                      setForm({
                        ...form,
                        target_type: item.type,
                        habit_id: item.type === 'habit' ? (habits[0]?.id || '') : '',
                        goal_id: item.type === 'goal' ? (goals[0]?.id || '') : '',
                        journey_id: item.type === 'learning_journey' ? (journeys[0]?.id || '') : '',
                        reminder_mode: item.type === 'goal' ? 'deadline_proximity' : 'scheduled',
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
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Goal</label>
              {goals.length === 0 ? (
                <p className="text-xs text-amber-600 p-2 bg-amber-50 rounded-lg">No goals found. Please create one on the Goals page.</p>
              ) : (
                <CustomSelect
                  required
                  value={form.goal_id}
                  onChange={(e) => setForm({ ...form, goal_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-[#2a343d] rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-sm dark:bg-[#14181c] dark:text-slate-100"
                >
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.goal_name} {g.target_date ? `(Deadline: ${g.target_date})` : ''}
                    </option>
                  ))}
                </CustomSelect>
              )}
            </div>
          )}

          {form.target_type === 'learning_journey' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Select Learning Roadmap</label>
              {journeys.length === 0 ? (
                <p className="text-xs text-amber-600 p-2 bg-amber-50 rounded-lg">No learning journeys found. Please create one in Learning Hub.</p>
              ) : (
                <CustomSelect
                  required
                  value={form.journey_id}
                  onChange={(e) => setForm({ ...form, journey_id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-[#2a343d] rounded-xl focus:ring-2 focus:ring-[#3d7a75] outline-none text-sm dark:bg-[#14181c] dark:text-slate-100"
                >
                  {journeys.map((j) => (
                    <option key={j.id} value={j.id}>{j.title}</option>
                  ))}
                </CustomSelect>
              )}
            </div>
          )}

          {/* 3. Reminder Mode Toggle (Scheduled vs Deadline Proximity) */}
          {(form.target_type === 'goal' || form.target_type === 'learning_journey') && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Reminder Trigger Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, reminder_mode: 'deadline_proximity' })}
                  className={`p-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                    form.reminder_mode === 'deadline_proximity'
                      ? 'border-[#3d7a75] bg-[#e2f0ef] dark:bg-[#14302e] text-[#2c6560] dark:text-[#7cc3bb]'
                      : 'border-slate-200 dark:border-[#2a343d] text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1 mb-0.5">
                    <AlertTriangle size={13} /> Deadline Alert
                  </div>
                  <span className="text-[10px] opacity-80">Notify X days before target date</span>
                </button>

                <button
                  type="button"
                  onClick={() => setForm({ ...form, reminder_mode: 'scheduled' })}
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

          {/* 4. Days Before Deadline Selector (when deadline_proximity is active) */}
          {form.reminder_mode === 'deadline_proximity' ? (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-[#2a343d] space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                When should we alert you?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { days: 7, label: '7 Days Before' },
                  { days: 3, label: '3 Days Before' },
                  { days: 1, label: '1 Day Before' },
                  { days: 0, label: 'On Target Date' },
                ].map(opt => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setForm({ ...form, days_before_deadline: opt.days })}
                    className={`p-2 rounded-lg text-xs font-bold transition-all text-center ${
                      form.days_before_deadline === opt.days
                        ? 'bg-[#3d7a75] text-white shadow-xs'
                        : 'bg-white dark:bg-[#14181c] border border-slate-200 dark:border-[#2a343d] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Alert Time on that day
                </label>
                <CustomTimePicker
                  value={form.reminder_time}
                  onChange={(val) => setForm({ ...form, reminder_time: getTimeValue(val) })}
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

          {/* Alarm-Style Reminder Toggle (For Habits) */}
          {form.target_type === 'habit' && (
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
                    onChange={(e) => setForm({ ...form, is_alarm: e.target.checked })}
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

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
