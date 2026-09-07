import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';
import Toast from '../components/Toast';
import {
  Plus, Pencil, Trash2, Bell, BellOff, BellRing, AlertCircle, ShieldCheck,
  Sun, Sunset, Moon, Clock, Calendar, Check, MessageSquare, Volume2, Sparkles
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
  const [reminders, setReminders] = useState([]);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('All');

  // Form state for multiple alerts, custom text, days of week, routine window
  const [form, setForm] = useState({
    habit_id: '',
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
      const [res, habitsRes] = await Promise.all([
        fetch('/api/reminders', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/habits', { headers: { Authorization: `Bearer ${session.access_token}` } }),
      ]);
      if (!res.ok || !habitsRes.ok) {
        const e = await (!res.ok ? res : habitsRes).json().catch(() => ({}));
        setFetchError(e.error || 'Failed to load data. Please refresh.');
        return;
      }
      const data = await res.json();
      const habitsData = await habitsRes.json();
      const r = Array.isArray(data) ? data : [];
      const h = Array.isArray(habitsData) ? habitsData : [];
      setReminders(r);
      setHabits(h);

      const activeReminders = r
        .filter((rem) => rem.notification_status === 'Active')
        .map((rem) => ({
          ...rem,
          habit_name: rem.habits?.habit_name || 'your habit',
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
  }, [session]); // eslint-disable-line

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

  const openAdd = () => {
    setEditing(null);
    setForm({
      habit_id: habits[0]?.id || '',
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
      habit_id: reminder.habit_id,
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
    if (!form.habit_id) {
      setToast({ message: 'Please create a habit first.', type: 'error' });
      setModalOpen(false);
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
        const e = await res.json().catch(() => ({}));
        setToast({ message: e.error || 'Something went wrong — please try again.', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error.', type: 'error' });
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

  const handleTestNotification = (reminder) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      setToast({ message: 'Please enable push notifications first.', type: 'error' });
      return;
    }
    const title = `🔔 ${reminder.habits?.habit_name || 'Habit Reminder'}`;
    const body = reminder.custom_text || `Time to complete your habit!`;
    new Notification(title, { body, icon: '/icons/icon-192.svg' });
    setToast({ message: 'Test notification sent!', type: 'success' });
  };

  // Helper form handlers for multiple alerts & days of week
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

  // Filter reminders by Routine Tab
  const now = new Date();
  const currentHour = now.getHours();
  const currentWindow = currentHour >= 5 && currentHour < 12 ? 'Morning' : currentHour >= 12 && currentHour < 17 ? 'Afternoon' : 'Evening';

  const filteredReminders = reminders.filter((rem) => {
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Smart Reminders</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
              Multiple Alerts & Routines
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Never break your streak with customizable multiple alerts per habit and routine windows.
          </p>
        </div>

        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-md shadow-blue-500/20 active:scale-95 flex-shrink-0"
        >
          <Plus size={18} /> Add Reminder
        </button>
      </div>

      {/* Push notification setup banner */}
      {swReady && (
        <div className="bg-white dark:bg-slate-800/90 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              subscribed
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300'
                : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
            }`}>
              {subscribed ? <ShieldCheck size={22} /> : <BellRing size={22} />}
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                {subscribed ? 'Push Notifications Active & Synced' : 'Enable Device Push Notifications'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
                {subscribed
                  ? 'Your active alerts will ring on your phone/browser even when HabitTracker is closed.'
                  : 'Receive timely reminder alerts directly on your device screens at scheduled times.'}
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
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-xl transition-colors shadow-xs"
            >
              <Bell size={14} /> Enable Notifications
            </button>
          )}
        </div>
      )}

      {/* Routine Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none p-1 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
        {[
          { id: 'All', label: 'All Reminders', icon: Clock },
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
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                active
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <TabIcon size={14} />
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

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredReminders.map((rem) => {
            const alertsList = Array.isArray(rem.alerts) && rem.alerts.length > 0
              ? rem.alerts
              : [rem.reminder_time || '08:00'];
            const routine = rem.routine_window || getRoutineWindow(alertsList[0]);
            const days = Array.isArray(rem.days_of_week) ? rem.days_of_week : WEEKDAYS;
            const isActive = rem.notification_status === 'Active';

            return (
              <div
                key={rem.id}
                className={`bg-white dark:bg-slate-800/90 rounded-2xl p-5 shadow-sm border transition-all duration-200 flex flex-col justify-between ${
                  isActive
                    ? 'border-slate-100 dark:border-slate-700/60 hover:shadow-md'
                    : 'border-slate-200/60 dark:border-slate-700/40 opacity-70'
                }`}
              >
                <div>
                  {/* Top row: Habit title & toggle switch */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
                          {routine === 'Morning' && <Sun size={11} />}
                          {routine === 'Afternoon' && <Sunset size={11} />}
                          {routine === 'Evening' && <Moon size={11} />}
                          {routine} Routine
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-base">
                        {rem.habits?.habit_name || 'Habit Reminder'}
                      </h3>
                    </div>

                    {/* Active/Inactive Toggle Switch */}
                    <button
                      onClick={() => handleToggleStatus(rem)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isActive ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                      title={isActive ? 'Deactivate Reminder' : 'Activate Reminder'}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isActive ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Multiple Alert Pills */}
                  <div className="mb-3 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      Scheduled Alerts ({alertsList.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {alertsList.map((time, idx) => (
                        <div
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-600/60"
                        >
                          <Clock size={12} className="text-blue-500" />
                          {format12Hour(time)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Custom Message preview if present */}
                  {rem.custom_text && (
                    <div className="mb-3 p-2.5 bg-slate-50 dark:bg-slate-700/30 rounded-xl text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2 border border-slate-100 dark:border-slate-700/50">
                      <MessageSquare size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
                      <span className="italic">"{rem.custom_text}"</span>
                    </div>
                  )}

                  {/* Active Days Pills */}
                  <div className="flex items-center gap-1 mb-4">
                    {WEEKDAYS.map((d) => {
                      const selected = days.includes(d);
                      return (
                        <span
                          key={d}
                          className={`w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center ${
                            selected
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {d[0]}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                  <button
                    onClick={() => handleTestNotification(rem)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Volume2 size={13} /> Test Push
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(rem)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
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
              <div className="bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-100 dark:border-slate-700/60 py-16 flex flex-col items-center gap-3 text-center px-4">
                <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Bell size={28} />
                </div>
                <h3 className="text-slate-800 dark:text-slate-100 font-semibold text-lg">No reminders found</h3>
                <p className="text-slate-400 text-sm max-w-sm">
                  {activeTab !== 'All'
                    ? `No active reminders found under ${activeTab}.`
                    : 'Set custom alert times for your habits to build consistent routines.'}
                </p>
                <button
                  onClick={openAdd}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors shadow-xs"
                >
                  Add Reminder
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Modal with Multiple Alerts */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Reminder' : 'Add Smart Reminder'}>
        {habits.length === 0 ? (
          <div className="py-4">
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">Create at least one habit in <strong>My Habits</strong> first.</p>
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Target Habit</label>
              <select
                required
                value={form.habit_id}
                onChange={(e) => setForm({ ...form, habit_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm dark:bg-slate-800 dark:text-slate-100"
              >
                {habits.map((h) => (
                  <option key={h.id} value={h.id}>{h.habit_name}</option>
                ))}
              </select>
            </div>

            {/* Multiple Alerts List */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Multiple Alarm Times ({form.alerts.length})
                </label>
                <button
                  type="button"
                  onClick={addAlertSlot}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Plus size={13} /> Add Alert
                </button>
              </div>

              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {form.alerts.map((timeVal, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-400 w-14">Alert {idx + 1}</span>
                    <input
                      type="time"
                      required
                      value={timeVal}
                      onChange={(e) => updateAlertTime(idx, e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
                    />
                    {form.alerts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAlertSlot(idx)}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Notification Text */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Custom Reminder Text (optional)
              </label>
              <input
                type="text"
                value={form.custom_text}
                onChange={(e) => setForm({ ...form, custom_text: e.target.value })}
                placeholder="e.g. Keep your streak alive! Solve 2 LeetCode problems."
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Active Days Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">Active Weekdays</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setWeekdayPreset('Everyday')} className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline">Everyday</button>
                  <button type="button" onClick={() => setWeekdayPreset('Weekdays')} className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline">Weekdays</button>
                  <button type="button" onClick={() => setWeekdayPreset('Weekends')} className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline">Weekends</button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-1">
                {WEEKDAYS.map((day) => {
                  const selected = form.days_of_week.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDayOfWeek(day)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        selected
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Status</label>
              <select
                value={form.notification_status}
                onChange={(e) => setForm({ ...form, notification_status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-xs dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60 flex items-center gap-2 shadow-xs"
              >
                {formLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {editing ? 'Update Reminder' : 'Save Reminder'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
