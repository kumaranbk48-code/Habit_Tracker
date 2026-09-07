import Modal from './Modal';
import { Calendar, CheckCircle2, RotateCcw, X, AlertCircle } from 'lucide-react';

export default function DateBulkActionModal({
  open,
  onClose,
  dateStr,
  scheduledHabitsCount = 0,
  onConfirmAllComplete,
  onConfirmAllIncomplete,
}) {
  if (!open) return null;

  const formattedDate = dateStr
    ? new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <Modal open={open} onClose={onClose} title="Date Quick Actions">
      <div className="space-y-4 py-1">
        <div className="flex items-center gap-3 p-3.5 bg-[#e2f0ef]/70 dark:bg-[#14302e]/60 border border-[#cde3e1] dark:border-[#234b47] rounded-2xl">
          <Calendar size={20} className="text-[#2c6560] dark:text-[#7cc3bb] flex-shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{formattedDate}</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {scheduledHabitsCount} scheduled habit{scheduledHabitsCount !== 1 ? 's' : ''} on this date.
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Choose a safe bulk action for scheduled habits on this day. Non-scheduled and future habits will not be affected.
        </p>

        <div className="space-y-2.5 pt-1">
          <button
            onClick={() => {
              onConfirmAllComplete(dateStr);
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white font-semibold text-xs rounded-xl transition-all shadow-sm active:scale-[0.98]"
          >
            <CheckCircle2 size={16} />
            <span>Mark All Scheduled Complete</span>
          </button>

          <button
            onClick={() => {
              onConfirmAllIncomplete(dateStr);
              onClose();
            }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl transition-all border border-slate-200/60 dark:border-slate-600/60 active:scale-[0.98]"
          >
            <RotateCcw size={16} className="text-slate-500 dark:text-slate-400" />
            <span>Mark All Scheduled Incomplete</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
