import Modal from './Modal';
import { Play, ShieldCheck, Check, Sparkles } from 'lucide-react';

export default function PausedHabitsModal({
  isOpen,
  onClose,
  pausedHabits = [],
  onResumeHabit,
  onToggleHabit,
  todayCompletedIds = new Set(),
}) {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Paused Habits (${pausedHabits.length})`} size="md">
      <div className="space-y-4">
        {/* Reassurance Banner */}
        <div className="p-3.5 bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 rounded-xl flex items-start gap-2.5">
          <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
              Your Streaks Are 100% Protected
            </h4>
            <p className="text-[11px] text-emerald-700/90 dark:text-emerald-300/80 mt-0.5 leading-relaxed">
              These habits are shelved for your current season. Paused days are never counted as missed and won't break your consistency records.
            </p>
          </div>
        </div>

        {/* List of Paused Habits */}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {pausedHabits.map((habit) => {
            const isDone = todayCompletedIds.has(habit.id);
            return (
              <div
                key={habit.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-white dark:bg-[#1a2129] border border-slate-200 dark:border-slate-700/60 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: habit.color || '#3d7a75' }}
                  />
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {habit.habit_name}
                    </h5>
                    <p className="text-[11px] text-slate-400">
                      {habit.category} • {habit.target_frequency || 'Daily'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Optional Check-in if user did it anyway today */}
                  {onToggleHabit && (
                    <button
                      onClick={() => onToggleHabit(habit)}
                      title={isDone ? 'Marked complete today' : 'Log completion for today anyway'}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        isDone
                          ? 'bg-[#e2f0ef] text-[#2c6560] dark:bg-[#14302e] dark:text-[#7cc3bb]'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      <Check size={12} />
                      <span>{isDone ? 'Done Today' : 'Log Today'}</span>
                    </button>
                  )}

                  {/* Resume button */}
                  {onResumeHabit && (
                    <button
                      onClick={() => onResumeHabit(habit)}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#3d7a75] hover:bg-[#2f5f5b] text-white shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <Play size={12} className="fill-current" />
                      <span>Resume</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {pausedHabits.length === 0 && (
            <p className="text-center text-xs text-slate-400 py-6 italic">
              No habits are currently paused.
            </p>
          )}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
