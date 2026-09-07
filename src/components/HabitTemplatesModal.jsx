import Modal from './Modal';
import { Sparkles, Sun, Droplets, Laptop, Heart, Brain, Plus, Check } from 'lucide-react';

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

export default function HabitTemplatesModal({ open, onClose, onAddHabit }) {
  const handleAddPack = async (pack) => {
    for (const habit of pack.habits) {
      await onAddHabit(habit);
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Curated Habit Templates & Routines">
      <div className="space-y-4 py-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Pick a pre-designed habit routine to instantly add high-impact habits to your schedule.
        </p>

        <div className="space-y-3.5 max-h-96 overflow-y-auto pr-1">
          {TEMPLATE_PACKS.map(pack => {
            const IconComp = pack.icon;
            return (
              <div
                key={pack.id}
                className="bg-white dark:bg-[#14181c] border border-[#e2e8ec] dark:border-[#2a343d] rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${pack.color} flex items-center justify-center text-white shadow-sm flex-shrink-0`}>
                      <IconComp size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">{pack.title}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{pack.description}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddPack(pack)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white rounded-xl text-xs font-semibold shadow-sm transition-colors flex-shrink-0 cursor-pointer"
                  >
                    <Plus size={14} /> Add Pack
                  </button>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[#e2e8ec] dark:border-[#2a343d] flex flex-wrap gap-2">
                  {pack.habits.map((h, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#f1f3f5] dark:bg-[#1a2129] border border-[#e2e8ec]/80 dark:border-[#2a343d] text-gray-700 dark:text-gray-300 flex items-center gap-1"
                    >
                      <span>•</span> {h.habit_name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
