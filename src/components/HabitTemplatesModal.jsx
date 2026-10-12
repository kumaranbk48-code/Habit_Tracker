import { useState } from 'react';
import Modal from './Modal';
import { Sparkles, Sun, Droplets, Laptop, Heart, Brain, Plus, Check, Loader2 } from 'lucide-react';

const TEMPLATE_PACKS = [
  {
    id: 'morning',
    title: 'Morning Routine',
    category: 'Productivity',
    icon: Sun,
    color: 'from-amber-500 to-orange-500',
    description: 'Energize your day with hydration, sunlight, and movement.',
    habits: [
      { habit_name: 'Drink 500ml Water', category: 'Health', target_frequency: 'Daily', tracking_type: 'quantity', target_quantity: 0.5, unit: 'liters', time_of_day: 'morning', color: '#3d7a75', icon: 'Droplets' },
      { habit_name: '10 Min Morning Stretch', category: 'Fitness', target_frequency: 'Daily', tracking_type: 'boolean', time_of_day: 'morning', color: '#10b981', icon: 'Sun' },
      { habit_name: 'Plan Top 3 Priorities', category: 'Productivity', target_frequency: 'Daily', tracking_type: 'boolean', time_of_day: 'morning', color: '#8b5cf6', icon: 'CheckSquare' },
    ]
  },
  {
    id: 'hydration',
    title: 'Hydration Challenge',
    category: 'Health',
    icon: Droplets,
    color: 'from-[#3d7a75] to-[#2c6560]',
    description: 'Build optimal daily hydration and stay clear-headed.',
    habits: [
      { habit_name: 'Drink 2.5 Liters Water', category: 'Health', target_frequency: 'Daily', tracking_type: 'quantity', target_quantity: 2.5, unit: 'liters', time_of_day: 'anytime', color: '#06b6d4', icon: 'Droplets' },
    ]
  },
  {
    id: 'desk-worker',
    title: 'Desk Worker Wellness',
    category: 'Health',
    icon: Laptop,
    color: 'from-emerald-500 to-teal-600',
    description: 'Counteract long hours of sitting with posture & eye breaks.',
    habits: [
      { habit_name: 'Hourly Stand & Stretch', category: 'Health', target_frequency: 'Daily', tracking_type: 'boolean', time_of_day: 'afternoon', color: '#10b981', icon: 'UserCheck' },
      { habit_name: '20-20-20 Eye Rest Rule', category: 'Health', target_frequency: 'Daily', tracking_type: 'boolean', time_of_day: 'afternoon', color: '#14b8a6', icon: 'Eye' },
      { habit_name: 'Evening Walk (20 mins)', category: 'Fitness', target_frequency: 'Daily', tracking_type: 'quantity', target_quantity: 20, unit: 'minutes', time_of_day: 'evening', color: '#f59e0b', icon: 'Footprints' },
    ]
  },
  {
    id: 'mindfulness',
    title: 'Mindful Living',
    category: 'Mindfulness',
    icon: Heart,
    color: 'from-purple-500 to-pink-500',
    description: 'Reduce stress and build mental clarity and gratitude.',
    habits: [
      { habit_name: '10 Min Meditation', category: 'Mindfulness', target_frequency: 'Daily', tracking_type: 'quantity', target_quantity: 10, unit: 'minutes', time_of_day: 'morning', color: '#ec4899', icon: 'Heart' },
      { habit_name: 'Evening Gratitude Journal', category: 'Mindfulness', target_frequency: 'Daily', tracking_type: 'boolean', time_of_day: 'evening', color: '#a855f7', icon: 'BookOpen' },
    ]
  },
  {
    id: 'deep-work',
    title: 'Deep Work Specialist',
    category: 'Productivity',
    icon: Brain,
    color: 'from-[#2f5378] to-[#182a40]',
    description: 'Master focused distraction-free work blocks every day.',
    habits: [
      { habit_name: '90 Min Focused Work Block', category: 'Productivity', target_frequency: 'Daily', tracking_type: 'quantity', target_quantity: 90, unit: 'minutes', time_of_day: 'morning', color: '#6366f1', icon: 'Zap' },
      { habit_name: 'Zero Phone First 30 Mins', category: 'Productivity', target_frequency: 'Daily', tracking_type: 'boolean', time_of_day: 'morning', color: '#ef4444', icon: 'SmartphoneOff' },
      { habit_name: 'Read 20 Pages', category: 'Learning', target_frequency: 'Daily', tracking_type: 'quantity', target_quantity: 20, unit: 'pages', time_of_day: 'evening', color: '#3d7a75', icon: 'Book' },
    ]
  }
];

export default function HabitTemplatesModal({ open, onClose, onAddHabit, onAddPack, existingHabits = [] }) {
  const [addingKey, setAddingKey] = useState(null); // 'habit:<name>' | 'pack:<id>'
  const [addedHabits, setAddedHabits] = useState(new Set());

  const isExisting = (name) => {
    return (
      addedHabits.has(name) ||
      existingHabits.some(h => (h.habit_name || '').trim().toLowerCase() === name.trim().toLowerCase())
    );
  };

  const handleAddSingle = async (habit) => {
    if (addingKey) return;
    const key = `habit:${habit.habit_name}`;
    setAddingKey(key);
    try {
      if (onAddHabit) {
        await onAddHabit(habit);
      }
      setAddedHabits(prev => new Set([...prev, habit.habit_name]));
    } finally {
      setAddingKey(null);
    }
  };

  const handleAddPack = async (pack) => {
    if (addingKey) return;
    const key = `pack:${pack.id}`;
    setAddingKey(key);
    try {
      if (onAddPack) {
        await onAddPack(pack.habits, pack.title);
      } else if (onAddHabit) {
        for (const habit of pack.habits) {
          await onAddHabit(habit);
        }
      }
      const newNames = pack.habits.map(h => h.habit_name);
      setAddedHabits(prev => new Set([...prev, ...newNames]));
      setTimeout(() => {
        onClose();
      }, 500);
    } finally {
      setAddingKey(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Curated Habit Templates & Routines">
      <div className="space-y-4 py-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Add an individual habit directly or import an entire proven daily routine in one tap.
        </p>

        <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1">
          {TEMPLATE_PACKS.map(pack => {
            const IconComp = pack.icon;
            const isPackLoading = addingKey === `pack:${pack.id}`;
            const allPackAdded = pack.habits.every(h => isExisting(h.habit_name));

            return (
              <div
                key={pack.id}
                className="bg-white dark:bg-[#14181c] border border-[#e2e8ec] dark:border-[#2a343d] rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${pack.color} flex items-center justify-center text-white shadow-sm flex-shrink-0`}>
                      <IconComp size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100">{pack.title}</h4>
                        <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-500/30 px-2 py-0.5 rounded-full">
                          {pack.habits.length} {pack.habits.length === 1 ? 'habit' : 'habits'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{pack.description}</p>
                    </div>
                  </div>

                  {/* Add entire pack button */}
                  <button
                    type="button"
                    disabled={!!addingKey || allPackAdded}
                    onClick={() => handleAddPack(pack)}
                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-all flex-shrink-0 cursor-pointer ${
                      allPackAdded
                        ? 'bg-teal-500/10 text-teal-400 border border-teal-500/25 cursor-default'
                        : 'bg-[#3d7a75] hover:bg-[#2f5f5b] text-white disabled:opacity-50'
                    }`}
                  >
                    {isPackLoading ? (
                      <>
                        <Loader2 size={13} className="animate-spin" />
                        <span>Adding...</span>
                      </>
                    ) : allPackAdded ? (
                      <>
                        <Check size={13} />
                        <span>Routine Added</span>
                      </>
                    ) : (
                      <>
                        <Plus size={14} />
                        <span>Add All ({pack.habits.length})</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Individual habits in pack */}
                <div className="pt-3 border-t border-[#e2e8ec] dark:border-[#2a343d] space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Habits in this routine:
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {pack.habits.map((h, idx) => {
                      const alreadyAdded = isExisting(h.habit_name);
                      const isItemLoading = addingKey === `habit:${h.habit_name}`;

                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-[#f8fafc] dark:bg-[#1a2129]/70 border border-[#e2e8ec]/80 dark:border-[#2a343d]"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                              {h.habit_name}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                              <span>{h.category}</span>
                              <span>•</span>
                              <span>{h.time_of_day ? h.time_of_day.charAt(0).toUpperCase() + h.time_of_day.slice(1) : 'Anytime'}</span>
                              {h.tracking_type === 'quantity' && (
                                <>
                                  <span>•</span>
                                  <span>{h.target_quantity} {h.unit}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            disabled={!!addingKey || alreadyAdded}
                            onClick={() => handleAddSingle(h)}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex-shrink-0 cursor-pointer ${
                              alreadyAdded
                                ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20 cursor-default'
                                : 'bg-white dark:bg-black/30 hover:bg-[#3d7a75] hover:text-white border border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300 disabled:opacity-40'
                            }`}
                          >
                            {isItemLoading ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                <span>Adding...</span>
                              </>
                            ) : alreadyAdded ? (
                              <>
                                <Check size={12} />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <Plus size={12} />
                                <span>Add</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

