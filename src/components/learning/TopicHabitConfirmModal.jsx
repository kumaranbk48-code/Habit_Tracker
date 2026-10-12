import { Check, X, Sparkles, Flame, CheckCircle2 } from 'lucide-react';
import Modal from '../Modal';

export default function TopicHabitConfirmModal({
  open,
  onClose,
  topic,
  habit,
  loading = false,
  onConfirm
}) {
  if (!open || !topic || !habit) return null;

  const habitColor = habit.color || '#3d7a75';
  const isQuantity = habit.tracking_type === 'quantity';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Learning Progress Milestone"
      maxWidth="max-w-md"
    >
      <div className="py-2 space-y-5">
        {/* Top Header Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] text-xs font-bold border border-[#2f6b5c]/20">
          <Sparkles size={13} className="text-[#c99a52]" />
          <span>TOPIC COMPLETED</span>
        </div>

        {/* Topic Title Notice */}
        <div>
          <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
            "{topic.title}"
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            You just marked this topic as completed. Great job!
          </p>
        </div>

        {/* Connected Habit Card */}
        <div className="p-4 rounded-2xl bg-[#f7f9fa] dark:bg-[#14181c] border border-[#e2e8ec] dark:border-[#2a343d] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold text-sm shadow-sm flex-shrink-0"
              style={{ backgroundColor: habitColor }}
            >
              {habit.habit_name?.[0]?.toUpperCase() || 'H'}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>{habit.habit_name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-[#3a2c14] text-amber-700 dark:text-amber-400 font-bold border border-amber-200/50 dark:border-amber-900/30">
                  Connected Habit
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isQuantity
                  ? `Goal: ${habit.target_quantity || 1} ${habit.unit || ''}`
                  : 'Daily Habit'}
              </p>
            </div>
          </div>
          <Flame size={18} className="text-amber-500 flex-shrink-0 fire-bounce" />
        </div>

        {/* Confirmation Question */}
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
          Would you like to mark <strong className="text-slate-900 dark:text-slate-100">"{habit.habit_name}"</strong> as done for today too?
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-[#2a343d]">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#222b33] transition-colors cursor-pointer"
          >
            Not now
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#3d7a75] hover:bg-[#2f5f5b] text-white font-bold text-xs shadow-md shadow-[#3d7a75]/20 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Check size={15} />
            <span>{loading ? 'Marking...' : 'Yes, mark done'}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
