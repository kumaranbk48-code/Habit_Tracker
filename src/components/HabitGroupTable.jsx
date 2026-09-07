import { Pencil, Trash2, Check, Calendar } from 'lucide-react';
import QuantityTracker from './QuantityTracker';

const CATEGORY_STYLES = {
  Health: 'bg-green-50 text-green-600 border-green-100/50',
  Fitness: 'bg-orange-50 text-orange-600 border-orange-100/50',
  Learning: 'bg-purple-50 text-purple-600 border-purple-100/50',
  Productivity: 'bg-blue-50 text-blue-600 border-blue-100/50',
  Mindfulness: 'bg-teal-50 text-teal-600 border-teal-100/50',
  Other: 'bg-gray-50 text-gray-600 border-gray-100/50',
};

export default function HabitGroupTable({
  title, icon: Icon, habits, poppingHabit,
  isCompleted, getQuantity, onToggle, onLogQuantity, onEdit, onDelete,
}) {
  const completedCount = habits.filter(h => isCompleted(h.id)).length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5 dark-card">
      {/* Section header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60 dark-header">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
            <Icon size={16} className="text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">{habits.length} habit{habits.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {habits.length > 0 && (
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0">
            {completedCount}/{habits.length} done today
          </span>
        )}
      </div>

      {habits.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-7 px-6">
          No {title.toLowerCase()} yet — choose this frequency when you add a habit.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Habit</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Category</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Today</th>
                <th className="px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {habits.map((habit) => {
                const done = isCompleted(habit.id);
                return (
                  <tr
                    key={habit.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors ${poppingHabit === habit.id ? 'habit-pop' : ''}`}
                  >
                    <td className="px-6 py-4 font-medium text-gray-800 dark:text-gray-200">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: habit.color || '#3b82f6' }}
                        />
                        <span>{habit.habit_name}</span>
                        {habit.time_of_day && habit.time_of_day !== 'anytime' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                            {habit.time_of_day}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                        CATEGORY_STYLES[habit.category] || CATEGORY_STYLES.Other
                      }`}>
                        {habit.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {habit.tracking_type === 'quantity' ? (
                        <QuantityTracker
                          current={getQuantity(habit.id)}
                          target={habit.target_quantity}
                          unit={habit.unit}
                          onAdd={(amt) => onLogQuantity(habit.id, amt)}
                          onReset={() => onLogQuantity(habit.id, null, true)}
                        />
                      ) : (
                        <button
                          onClick={() => onToggle(habit.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                            done
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shadow-sm shadow-blue-100 dark:shadow-none font-semibold'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {done ? <Check size={14} className="text-blue-600 dark:text-blue-400" /> : <Calendar size={14} />}
                          {done ? 'Done ✓' : 'Mark'}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => onEdit(habit)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => onDelete(habit.id)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
