import { Pencil, Trash2, Check, Calendar } from 'lucide-react';
import QuantityTracker from './QuantityTracker';

const CATEGORY_STYLES = {
  Health: 'bg-[#e3f3ee] text-[#2f6b5c] dark:bg-[#1c3a32] dark:text-[#7fd1b9] border-[#e3f3ee] dark:border-[#1c3a32]',
  Fitness: 'bg-[#f5ecdb] text-[#8a5a24] dark:bg-[#3a2c14] dark:text-[#dcb579] border-[#f5ecdb] dark:border-[#3a2c14]',
  Learning: 'bg-[#eae7f5] text-[#4b4a8a] dark:bg-[#232042] dark:text-[#b0aee0] border-[#eae7f5] dark:border-[#232042]',
  Productivity: 'bg-[#e4ecf5] text-[#2f5378] dark:bg-[#182a40] dark:text-[#8fb4d9] border-[#e4ecf5] dark:border-[#182a40]',
  Mindfulness: 'bg-[#e2f0ef] text-[#2c6560] dark:bg-[#14302e] dark:text-[#7cc3bb] border-[#e2f0ef] dark:border-[#14302e]',
  Other: 'bg-[#f1f3f5] text-[#4b5563] dark:bg-[#2a343d] dark:text-[#cbd5e1] border-[#f1f3f5] dark:border-[#2a343d]',
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
          <div className="w-8 h-8 rounded-lg bg-[#e4ecf5] dark:bg-[#182a40] flex items-center justify-center flex-shrink-0">
            <Icon size={16} className="text-[#2f5378] dark:text-[#8fb4d9]" />
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
                          style={{
                            backgroundColor:
                              !habit.color ||
                              ['#3b82f6', '#2563eb', '#1d4ed8', '#60a5fa', '#93c5fd', '#1e40af', '#1e3a8a', '#0075ff', '#38bdf8', '#0284c7'].includes(String(habit.color).toLowerCase().trim())
                                ? '#3d7a75'
                                : habit.color
                          }}
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
                              ? 'bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] shadow-sm font-semibold'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {done ? <Check size={14} className="text-[#2f6b5c] dark:text-[#7fd1b9]" /> : <Calendar size={14} />}
                          {done ? 'Done ✓' : 'Mark'}
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => onEdit(habit)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-[#3d7a75] dark:hover:text-[#5fae9e] hover:bg-[#eaf4f2] dark:hover:bg-[#1c3733] rounded-md transition-colors">
                          <Pencil size={16} />
                        </button>
                        <button onClick={() => onDelete(habit.id)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-[#b3453f] dark:hover:text-[#e2a8a3] hover:bg-[#fbebeb] dark:hover:bg-[#3a2020] rounded-md transition-colors">
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
