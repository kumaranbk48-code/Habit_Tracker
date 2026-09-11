import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Pencil, Trash2, Target, Plus, Minus, Check, X, TrendingUp, TrendingDown,
  Calendar, Layers, Activity, Flame, AlertCircle, ShieldAlert, CheckCircle2, Undo2,
  Bell
} from 'lucide-react';

const statusColors = {
  Pending: 'bg-[#f5ecdb] text-[#8a5a24] dark:bg-[#3a2c14] dark:text-[#dcb579] border border-[#c99a52]/40',
  'In Progress': 'bg-[#e4ecf5] text-[#2f5378] dark:bg-[#182a40] dark:text-[#8fb4d9] border border-[#2f5378]/40',
  Completed: 'bg-[#e3f3ee] text-[#2f6b5c] dark:bg-[#1c3a32] dark:text-[#7fd1b9] border border-[#2f6b5c]/40',
};

const goalTypeIcons = {
  Target: Target,
  Project: Layers,
  Average: Activity,
  Habit: Flame,
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return new Date(+y, +m - 1, +d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function GoalCard({
  goal,
  milestones = [],
  onEdit,
  onDelete,
  onAddMilestone,
  onToggleMilestone,
  onDeleteMilestone,
  onUpdateProgress,
  onMarkComplete,
}) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [logValue, setLogValue] = useState('');
  const [showLogInput, setShowLogInput] = useState(false);
  const navigate = useNavigate();

  const goalType = goal.goal_type || 'Target';
  const IconComponent = goalTypeIcons[goalType] || Target;
  const isBadHabit = Boolean(goal.bad_habit);

  // Check whether quantity was given / set
  const hasQuantity = goal.target_value !== null &&
    goal.target_value !== undefined &&
    goal.target_value !== '' &&
    !isNaN(Number(goal.target_value)) &&
    Number(goal.target_value) > 0;

  // Numeric tracking values
  const currentVal = Number(goal.current_value) || 0;
  const targetVal = hasQuantity ? Number(goal.target_value) : null;
  const startVal = Number(goal.start_value) || 0;
  const unit = goal.unit || '';

  // Pace calculations for Target goals (only when quantity is set)
  const today = new Date();
  const startDate = goal.start_date ? new Date(goal.start_date) : new Date();
  const targetDate = goal.target_date ? new Date(goal.target_date) : new Date();

  const totalTime = Math.max(1, targetDate.getTime() - startDate.getTime());
  const elapsedTime = Math.max(0, today.getTime() - startDate.getTime());
  const progressRatio = Math.min(1, Math.max(0, elapsedTime / totalTime));

  const totalDiff = hasQuantity ? targetVal - startVal : 0;
  const expectedPaceVal = hasQuantity ? startVal + (totalDiff * progressRatio) : 0;

  const isAhead = hasQuantity && currentVal >= expectedPaceVal;
  const daysLeft = Math.max(0, Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  const remainingVal = hasQuantity ? Math.max(0, targetVal - currentVal) : 0;
  const dailyNeeded = (hasQuantity && daysLeft > 0) ? (remainingVal / daysLeft).toFixed(1) : 0;

  // Percentage complete
  let pct = 0;
  if (milestones.length > 0) {
    const doneMilestones = milestones.filter((m) => m.completed).length;
    pct = Math.round((doneMilestones / milestones.length) * 100);
  } else if (hasQuantity && totalDiff > 0) {
    pct = Math.min(100, Math.round(((currentVal - startVal) / totalDiff) * 100));
  } else if (goal.status === 'Completed') {
    pct = 100;
  } else if (goal.status === 'In Progress') {
    pct = 50;
  }

  const handleMilestoneAdd = async () => {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    await onAddMilestone(goal.id, title);
    setNewTitle('');
    setAdding(false);
  };

  const handleQuickLog = (delta) => {
    const newVal = Math.max(0, currentVal + delta);
    if (onUpdateProgress) {
      onUpdateProgress(goal.id, newVal);
    }
  };

  const handleCustomLogSubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(logValue);
    if (!isNaN(val) && onUpdateProgress) {
      onUpdateProgress(goal.id, val);
      setShowLogInput(false);
      setLogValue('');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800/90 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-700/60 hover:shadow-md transition-all duration-200 flex flex-col justify-between group">
      {/* Header Info */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
            isBadHabit
              ? 'bg-[#f7e8e6] text-[#8a3a34] dark:bg-[#3a201d] dark:text-[#e2a8a3]'
              : 'bg-[#e4ecf5] text-[#2f5378] dark:bg-[#182a40] dark:text-[#8fb4d9]'
          }`}>
            <IconComponent size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {goalType}
              </span>
              {isBadHabit && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#f7e8e6] text-[#8a3a34] dark:bg-[#3a201d] dark:text-[#e2a8a3] border border-[#b3574f]/40">
                  <ShieldAlert size={10} /> Limit Goal
                </span>
              )}
            </div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-base leading-tight">
              {goal.goal_name}
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => navigate('/reminders', { state: { openAdd: true, prefillType: 'goal', prefillId: goal.id } })}
            className="p-1.5 text-slate-400 hover:text-[#3d7a75] dark:hover:text-[#5fae9e] hover:bg-[#eaf4f2] dark:hover:bg-[#1c3733] rounded-lg transition-colors"
            title="Set Deadline or Check-in Reminder"
          >
            <Bell size={15} />
          </button>
          <button
            onClick={() => onEdit(goal)}
            className="p-1.5 text-slate-400 hover:text-[#3d7a75] dark:hover:text-[#5fae9e] hover:bg-[#eaf4f2] dark:hover:bg-[#1c3733] rounded-lg transition-colors"
            title="Edit Goal"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => onDelete(goal.id)}
            className="p-1.5 text-slate-400 hover:text-[#b3453f] dark:hover:text-[#e2a8a3] hover:bg-[#fbebeb] dark:hover:bg-[#3a2020] rounded-lg transition-colors"
            title="Delete Goal"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Status & Pace Badge row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[goal.status] || 'bg-slate-100 text-slate-600'}`}>
          {goal.status}
        </span>

        {goalType === 'Target' && hasQuantity && goal.status !== 'Completed' && (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
            isAhead
              ? 'bg-[#e3f3ee] text-[#2f6b5c] dark:bg-[#1c3a32] dark:text-[#7fd1b9] border border-[#2f6b5c]/40'
              : 'bg-[#f5ecdb] text-[#8a5a24] dark:bg-[#3a2c14] dark:text-[#dcb579] border border-[#c99a52]/40'
          }`}>
            {isAhead ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {isAhead ? 'Ahead of Pace' : 'Behind Pace'}
          </span>
        )}

        <div className="ml-auto text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
          <Calendar size={13} />
          <span>{formatDate(goal.target_date)}</span>
        </div>
      </div>

      {/* Progress Bar & Numeric Tracker */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-500 dark:text-slate-400">
            {milestones.length > 0
              ? 'Roadmap Progress'
              : hasQuantity
              ? `${unit ? `${unit} ` : ''}${currentVal.toLocaleString()} / ${targetVal.toLocaleString()}`
              : goalType === 'Project'
              ? 'Project Roadmap'
              : goalType === 'Habit'
              ? 'Habit Routine'
              : 'Goal Progress'}
          </span>
          <span className="text-[#3d7a75] dark:text-[#5fae9e] font-bold">{pct}%</span>
        </div>

        <div className="h-2 bg-[#f1f3f5] dark:bg-[#14181c] rounded-full overflow-hidden relative">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isBadHabit
                ? 'bg-gradient-to-r from-[#c99a52] to-[#b3574f]'
                : 'bg-gradient-to-r from-[#3d7a75] via-[#5fae9e] to-[#8fd0c4]'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Target metrics extra details */}
        {hasQuantity && daysLeft > 0 && goal.status !== 'Completed' && (
          <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 pt-1">
            <span>Needed: {dailyNeeded} {unit}/day</span>
            <span>{daysLeft} days remaining</span>
          </div>
        )}
        {!hasQuantity && daysLeft > 0 && goal.status !== 'Completed' && (
          <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 pt-1">
            <span>Target due in {daysLeft} days</span>
          </div>
        )}
      </div>

      {/* Mark Complete button for non-quantity, non-milestone goals */}
      {!hasQuantity && milestones.length === 0 && goal.status !== 'Completed' && onMarkComplete && (
        <div className="mb-4">
          <button
            onClick={() => onMarkComplete(goal.id)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#e2f0ef] dark:bg-[#14302e] text-[#3d7a75] dark:text-[#5fae9e] hover:bg-[#3d7a75] hover:text-white dark:hover:bg-[#5fae9e] dark:hover:text-[#0e2320] rounded-xl text-xs font-semibold transition-all duration-200 border border-[#3d7a75]/20 dark:border-[#5fae9e]/20 hover:shadow-md hover:shadow-[#3d7a75]/15 active:scale-[0.98]"
          >
            <CheckCircle2 size={15} />
            Mark as Complete
          </button>
        </div>
      )}

      {/* Completed state indicator for manually-completed goals (allows undo) */}
      {!hasQuantity && milestones.length === 0 && goal.status === 'Completed' && onMarkComplete && (
        <div className="mb-4 flex items-center justify-between p-2.5 bg-[#e3f3ee] dark:bg-[#1c3a32] rounded-xl border border-[#2f6b5c]/20 dark:border-[#7fd1b9]/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-[#2f6b5c] dark:text-[#7fd1b9]" />
            <span className="text-xs font-semibold text-[#2f6b5c] dark:text-[#7fd1b9]">Goal Completed!</span>
          </div>
          <button
            onClick={() => onMarkComplete(goal.id, true)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-[#8a5a24] dark:hover:text-[#dcb579] hover:bg-[#f5ecdb]/50 dark:hover:bg-[#3a2c14]/50 rounded-lg transition-colors"
            title="Revert to In Progress"
          >
            <Undo2 size={12} />
            Undo
          </button>
        </div>
      )}

      {/* Quick Numeric Logger only when quantity is given / setted */}
      {hasQuantity && onUpdateProgress && (
        <div className="mb-4 p-2.5 bg-[#f7f9fa] dark:bg-[#14181c] rounded-xl border border-[#e2e8ec] dark:border-[#2a343d]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Quick Log</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleQuickLog(-1)}
                className="w-7 h-7 bg-white dark:bg-[#1a2129] border border-[#e2e8ec] dark:border-[#2a343d] text-gray-700 dark:text-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-[#2a343d] transition-colors"
                title="Subtract 1"
              >
                <Minus size={13} />
              </button>
              <button
                onClick={() => handleQuickLog(1)}
                className="w-7 h-7 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white rounded-lg flex items-center justify-center transition-colors shadow-xs"
                title="Add 1"
              >
                <Plus size={13} />
              </button>
              <button
                onClick={() => setShowLogInput(!showLogInput)}
                className="px-2 py-1 bg-white dark:bg-[#1a2129] border border-[#e2e8ec] dark:border-[#2a343d] text-[11px] font-medium text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2a343d] transition-colors"
              >
                Set Value
              </button>
            </div>
          </div>

          {showLogInput && (
            <form onSubmit={handleCustomLogSubmit} className="flex items-center gap-2 mt-2 pt-2 border-t border-[#e2e8ec] dark:border-[#2a343d]">
              <input
                type="number"
                step="any"
                value={logValue}
                onChange={(e) => setLogValue(e.target.value)}
                placeholder={`Current ${unit}...`}
                className="flex-1 px-2.5 py-1 text-xs border border-[#e2e8ec] dark:border-[#2a343d] rounded-lg outline-none focus:ring-2 focus:ring-[#3d7a75] dark:bg-[#14181c] text-gray-900 dark:text-gray-100"
              />
              <button
                type="submit"
                className="px-3 py-1 bg-[#3d7a75] text-white text-xs font-semibold rounded-lg hover:bg-[#2f5f5b] transition-colors"
              >
                Save
              </button>
            </form>
          )}
        </div>
      )}

      {/* Milestone Roadmap checklist section */}
      <div className="mt-auto pt-3 border-t border-slate-100 dark:border-slate-700/60">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Milestones Roadmap
          </span>
          {milestones.length > 0 && (
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {milestones.filter((m) => m.completed).length}/{milestones.length}
            </span>
          )}
        </div>

        <div className="space-y-1.5 mb-3 max-h-36 overflow-y-auto pr-1">
          {milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-2 group/item p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
              <button
                type="button"
                onClick={() => onToggleMilestone(m.id, !m.completed, goal.id)}
                className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-all ${
                  m.completed
                    ? 'bg-[#3d7a75] border-[#3d7a75] text-white'
                    : 'border-2 border-slate-300 dark:border-slate-600 hover:border-[#3d7a75]'
                }`}
              >
                {m.completed && <Check size={11} />}
              </button>
              <span className={`text-xs flex-1 truncate ${
                m.completed
                  ? 'text-slate-400 dark:text-slate-500 line-through'
                  : 'text-slate-700 dark:text-slate-200'
              }`}>
                {m.title}
              </span>
              <button
                type="button"
                onClick={() => onDeleteMilestone(m.id)}
                className="opacity-0 group-hover/item:opacity-100 text-slate-300 dark:text-slate-600 hover:text-[#b3453f] dark:hover:text-[#e2a8a3] transition-opacity p-0.5"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {milestones.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic py-1">
              No milestones added yet — break this goal down into steps below.
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleMilestoneAdd();
              }
            }}
            placeholder="Add a milestone..."
            className="flex-1 min-w-0 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[#3d7a75] outline-none dark:bg-slate-700 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={handleMilestoneAdd}
            disabled={adding || !newTitle.trim()}
            className="p-1.5 bg-[#e4ecf5] dark:bg-[#182a40] text-[#2f5378] dark:text-[#8fb4d9] hover:bg-[#d9ecea] rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
