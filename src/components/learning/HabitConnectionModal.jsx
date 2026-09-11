import { useState, useEffect } from 'react';
import Modal from '../Modal';
import CustomSelect from '../CustomSelect';
import { Link, Plus, Check, Sparkles, Flame } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function HabitConnectionModal({ isOpen, onClose, journey, onConnect }) {
  const { session } = useAuth();
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHabitId, setSelectedHabitId] = useState('');
  const [newHabitName, setNewHabitName] = useState('');
  const [mode, setMode] = useState('existing'); // 'existing' or 'new'
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && session) {
      fetch('/api/habits', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          setHabits(Array.isArray(data) ? data : []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [isOpen, session]);

  if (!isOpen || !journey) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      let habitId = selectedHabitId;

      if (mode === 'new' && newHabitName.trim()) {
        const createRes = await fetch('/api/habits', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            habit_name: newHabitName.trim(),
            category: journey.category || 'Learning',
            target_frequency: 'Daily',
            tracking_type: 'boolean'
          })
        });
        if (createRes.ok) {
          const newHabit = await createRes.json();
          habitId = newHabit.id;
        }
      }

      if (habitId) {
        await onConnect(journey.id, habitId);
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Connect a Daily Habit" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="py-1 space-y-4">
        <div className="p-3 bg-[#f5ecdb] dark:bg-[#3a2c14] border border-[#c99a52]/40 rounded-2xl text-xs space-y-1">
          <div className="font-bold text-[#8a5a24] dark:text-[#dcb579] flex items-center gap-1.5">
            <Flame size={14} className="text-[#c99a52]" /> Build Consistency with Habit Tracker
          </div>
          <p className="text-[#8a5a24]/80 dark:text-[#dcb579]/80 leading-relaxed text-[11px]">
            Completing your connected habit builds your streak and opens Today's Focus, but does not automatically force learning task completion.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setMode('existing')}
            className={`flex-1 py-1.5 rounded-lg transition-colors ${
              mode === 'existing' ? 'bg-white dark:bg-gray-900 text-[#3d7a75] dark:text-[#5fae9e] shadow-sm' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Connect Existing Habit
          </button>
          <button
            type="button"
            onClick={() => setMode('new')}
            className={`flex-1 py-1.5 rounded-lg transition-colors ${
              mode === 'new' ? 'bg-white dark:bg-gray-900 text-[#3d7a75] dark:text-[#5fae9e] shadow-sm' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Create New Habit
          </button>
        </div>

        {mode === 'existing' ? (
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
              Select an Existing Habit
            </label>
            {loading ? (
              <div className="text-xs text-gray-400 py-2">Loading habits...</div>
            ) : habits.length > 0 ? (
              <CustomSelect
                value={selectedHabitId}
                onChange={e => setSelectedHabitId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white"
              >
                <option value="">-- Choose a habit --</option>
                {habits.map(h => (
                  <option key={h.id} value={h.id}>
                    {h.habit_name} ({h.category || 'Habit'})
                  </option>
                ))}
              </CustomSelect>
            ) : (
              <div className="text-xs text-gray-500 py-2">
                No active habits found. Switch to "Create New Habit" above!
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
              New Habit Name
            </label>
            <input
              type="text"
              placeholder={`e.g. Study ${journey.title} — 1 hour daily`}
              value={newHabitName}
              onChange={e => setNewHabitName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || (mode === 'existing' && !selectedHabitId) || (mode === 'new' && !newHabitName.trim())}
            className="flex items-center gap-1 text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] disabled:opacity-50 text-white px-5 py-2.5 rounded-xl shadow-sm transition-all"
          >
            {submitting ? 'Connecting...' : 'Connect Habit'} <Link size={14} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
