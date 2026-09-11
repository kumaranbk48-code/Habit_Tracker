import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import CustomSelect from '../components/CustomSelect';
import CustomTimePicker from '../components/CustomTimePicker';
import {
  Plus, Pencil, Trash2, Bell, BellOff, BellRing, AlertCircle, ShieldCheck,
  Sun, Sunset, Moon, Clock, Calendar, Check, MessageSquare, Sparkles,
  Target, GraduationCap, CheckCircle2, AlertTriangle, Layers, BookOpen
} from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

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
  });

  const {
    permission,
    subscribed,
    swReady,
    requestPermissionAndSubscribe,
    unsubscribe,
    scheduleLocalReminders,
  } = usePushNotifications(session);

  const fetchData = useCallback(async () => {
    if (!session) return;
    setFetchError('');
    try {
      const [res, habitsRes, goalsRes, learningRes] = await Promise.all([
        fetch('/api/reminders', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/habits', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/goals', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/learning', { headers: { Authorization: `Bearer ${session.access_token}` } }),
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
        .filter((rem) => rem.notification_status === 'Active')
        .map((rem) => ({
          ...rem,
          habit_name: rem.habits?.habit_name || rem.goals?.goal_name || rem.learning_journeys?.title || 'Reminder',
        }));
      scheduleLocalReminders(activeReminders);
    } catch (err) {
      console.error(err);
      setFetchError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [session, scheduleLocalReminders]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

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
    }
  }, [location.state]); // eslint-disable-line

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
    setForm({
      target_type: preferredType,
      habit_id: preferredType === 'habit' ? (preferredId || habits[0]?.id || '') : '',
      goal_id: preferredType === 'goal' ? (preferredId || goals[0]?.id || '') : '',
      journey_id: preferredType === 'learning_journey' ? (preferredId || journeys[0]?.id || '') : '',
      topic_id: '',
      reminder_mode: preferredType === 'goal' ? 'deadline_proximity' : 'scheduled',
      days_before_deadline: 1,
      reminder_time: '08:00',
      alerts: ['08:00'],
      custom_text: '',
      routine_window: 'Morning',
      days_of_week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      notification_status: 'Active',
    });
    setModalOpen(true);
  };

  const openEdit = (reminder) => {
    setEditing(reminder);
    const existingAlerts = Array.isArray(reminder.alerts) && reminder.alerts.length > 0
      ? reminder.alerts
      : [reminder.reminder_time || '08:00'];

    setForm({
      target_type: reminder.target_type || 'habit',
      habit_id: reminder.habit_id || '',
      goal_id: reminder.goal_id || '',
      journey_id: reminder.journey_id || '',
      topic_id: reminder.topic_id || '',
      reminder_mode: reminder.reminder_mode || 'scheduled',
      days_before_deadline: reminder.days_before_deadline ?? 1,
      reminder_time: reminder.reminder_time || existingAlerts[0],
      alerts: existingAlerts,
      custom_text: reminder.custom_text || '',
      routine_window: reminder.routine_window || getRoutineWindow(existingAlerts[0]),
      days_of_week: Array.isArray(reminder.days_of_week) ? reminder.days_of_week : WEEKDAYS,
      notification_status: reminder.notification_status || 'Active',
    });
    setModalOpen(true);
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
      const method = editing ? 'PUT' : 'POST';
      const body = editing ? { ...form, id: editing.id } : form;
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
    const next = [...form.alerts];
    next[index] = value;
    const routine = getRoutineWindow(next[0]);
    setForm({ ...form, alerts: next, reminder_time: next[0], routine_window: routine });
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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Smart Reminders</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#eae7f5] dark:bg-[#201d36] text-[#554f8a] dark:text-[#b0aadb]">
              Habits · Goals · Roadmaps
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Never miss habit routines, goal deadlines, or learning study sessions.
          </p>
        </div>

        <button
          onClick={() => openAdd('habit')}
          className="inline-flex items-center gap-2 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-[#3d7a75]/20 active:scale-95 flex-shrink-0"
        >
          <Plus size={18} /> Add Reminder
        </button>
      </div>

      {/* Push Notification Device Banner */}
      {swReady && (
        <div className="bg-white dark:bg-[#1a2129] rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-[#2a343d] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              subscribed
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300'
                : 'bg-[#e2f0ef] dark:bg-[#14302e] text-[#2c6560] dark:text-[#7cc3bb]'
            }`}>
              {subscribed ? <ShieldCheck size={22} /> : <BellRing size={22} />}
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                {subscribed ? 'Device Push Notifications Active & Synced' : 'Enable Device Push Notifications'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
                {subscribed
                  ? 'Your active habit alerts, goal deadlines, and study reminders will notify you directly on your device.'
                  : 'Receive timely reminder alerts directly on your phone/browser even when HabitTracker is in the background.'}
              </p>
            </div>
          </div>

          {permission === 'denied' ? (
            <div className="text-xs text-red-500 font-semibold px-3 py-2 bg-red-50 dark:bg-red-900/30 rounded-xl">
              Blocked in Browser Settings
            </div>
          ) : subscribed ? (
            <button
              onClick={handleDisablePush}
              className="text-xs font-semibold px-4 py-2 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              Disable Notifications
            </button>
          ) : (
            <button
              onClick={handleEnablePush}
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 bg-[#3d7a75] text-white hover:bg-[#2f5f5b] rounded-xl transition-colors shadow-xs"
            >
              <Bell size={14} /> Enable Notifications
            </button>
          )}
        </div>
      )}

      {/* Top Category Filter Tabs: All, Habits, Goals, Learning */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e2e8ec] dark:border-[#2a343d] pb-3">
        {[
          { id: 'All', label: 'All Reminders', count: reminders.length, icon: Layers },
          { id: 'habit', label: 'Habits', count: habitRemindersCount, icon: CheckCircle2 },
          { id: 'goal', label: 'Goals', count: goalRemindersCount, icon: Target },
          { id: 'learning', label: 'Learning Roadmaps', count: learningRemindersCount, icon: GraduationCap },
        ].map(cat => {
          const CatIcon = cat.icon;
          const active = categoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setCategoryFilter(cat.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                active
                  ? 'bg-[#3d7a75] text-white shadow-sm shadow-[#3d7a75]/30'
                  : 'bg-white dark:bg-[#1a2129] border border-[#e2e8ec] dark:border-[#2a343d] text-slate-600 dark:text-slate-300 hover:border-[#3d7a75]/50'
              }`}
            >
              <CatIcon size={14} />
              <span>{cat.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                active ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Routine Filter Sub-Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none p-1 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
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
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                active
                  ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <TabIcon size={13} />
              {tab.label}
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

      {/* Reminders Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-[#e2f0ef] border-t-[#3d7a75] dark:border-[#14302e] dark:border-t-[#5fae9e] rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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

            return (
              <div
                key={rem.id}
                className={`bg-white dark:bg-[#1a2129] rounded-2xl p-5 shadow-sm border transition-all duration-200 flex flex-col justify-between ${
                  isActive
                    ? 'border-[#e2e8ec] dark:border-[#2a343d] hover:shadow-md'
                    : 'border-slate-200/60 dark:border-slate-700/40 opacity-70'
                }`}
              >
                <div>
                  {/* Top row: Category Badge & Active Toggle Switch */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        {isHabit && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[#e2f0ef] dark:bg-[#14302e] text-[#2c6560] dark:text-[#7cc3bb]">
                            <CheckCircle2 size={11} /> Habit
                          </span>
                        )}
                        {isGoal && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
                            <Target size={11} /> Goal Alert
                          </span>
                        )}
                        {isLearning && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300">
                            <GraduationCap size={11} /> Roadmap
                          </span>
                        )}

                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800">
                          {routine}
                        </span>
                      </div>

                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base truncate max-w-[210px]">
                        {itemName}
                      </h3>

                      {isGoal && rem.goals?.target_date && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                          <Calendar size={11} /> Deadline: {rem.goals.target_date}
                        </p>
                      )}
                      {isLearning && rem.learning_journeys?.title && rem.learning_topics?.title && (
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                          <BookOpen size={11} /> In: {rem.learning_journeys.title}
                        </p>
                      )}
                    </div>

                    {/* Active/Inactive Toggle Switch */}
                    <button
                      onClick={() => handleToggleStatus(rem)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isActive ? 'bg-[#3d7a75] dark:bg-[#5fae9e]' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                      title={isActive ? 'Deactivate Reminder' : 'Activate Reminder'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-[#0e2320] transition-transform ${
                          isActive ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Deadline Alert Info or Scheduled Time */}
                  {isDeadlineMode ? (
                    <div className="mb-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                        <AlertTriangle size={13} />
                        {rem.days_before_deadline === 0
                          ? 'Triggers on Target Due Date'
                          : rem.days_before_deadline === 1
                          ? 'Triggers 1 Day Before Deadline'
                          : `Triggers ${rem.days_before_deadline} Days Before Deadline`}
                      </div>
                      <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                        Alert at {format12Hour(rem.reminder_time || '09:00')}
                      </p>
                    </div>
                  ) : (
                    <div className="mb-3 space-y-1">
                      <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        Scheduled Alerts ({alertsList.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {alertsList.map((time, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-[#2a343d]"
                          >
                            <Clock size={12} className="text-[#3d7a75] dark:text-[#5fae9e]" />
                            {format12Hour(time)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Custom Message preview */}
                  {rem.custom_text && (
                    <div className="mb-3 p-2.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2 border border-slate-100 dark:border-[#2a343d]">
                      <MessageSquare size={13} className="text-[#3d7a75] dark:text-[#5fae9e] flex-shrink-0 mt-0.5" />
                      <span className="italic">"{rem.custom_text}"</span>
                    </div>
                  )}

                  {/* Active Days Pills (for Scheduled mode) */}
                  {!isDeadlineMode && (
                    <div className="flex items-center gap-1 mb-4">
                      {WEEKDAYS.map((d) => {
                        const selected = days.includes(d);
                        return (
                          <span
                            key={d}
                            className={`w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center ${
                              selected
                                ? 'bg-[#3d7a75] text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {d[0]}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-[#2a343d] flex items-center justify-end">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(rem)}
                      className="p-1.5 text-slate-400 hover:text-[#3d7a75] dark:hover:text-[#5fae9e] hover:bg-[#e2f0ef] dark:hover:bg-[#14302e] rounded-lg transition-colors"
                      title="Edit Reminder"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(rem.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="Delete Reminder"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredReminders.length === 0 && !fetchError && (
            <div className="col-span-full">
              <div className="bg-white dark:bg-[#1a2129] rounded-3xl border border-[#e2e8ec] dark:border-[#2a343d] py-16 flex flex-col items-center gap-3 text-center px-4">
                <div className="w-14 h-14 bg-[#e2f0ef] dark:bg-[#14302e] rounded-2xl flex items-center justify-center text-[#3d7a75] dark:text-[#5fae9e]">
                  <Bell size={28} />
                </div>
                <h3 className="text-slate-800 dark:text-slate-100 font-semibold text-lg">No reminders found</h3>
                <p className="text-slate-400 text-sm max-w-sm">
                  {categoryFilter !== 'All'
                    ? `No reminders set for ${categoryFilter}.`
                    : 'Set custom alerts for your habits, goals, and learning roadmaps.'}
                </p>
                <button
                  onClick={() => openAdd('habit')}
                  className="mt-2 px-4 py-2 bg-[#3d7a75] text-white rounded-xl font-medium text-sm hover:bg-[#2f5f5b] transition-colors shadow-xs"
                >
                  Add Reminder
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
                  onChange={(val) => setForm({ ...form, reminder_time: val })}
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
              className="px-5 py-2 text-sm font-bold text-white bg-[#3d7a75] hover:bg-[#2f5f5b] rounded-xl transition-all shadow-md shadow-[#3d7a75]/20 active:scale-95 disabled:opacity-50"
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
