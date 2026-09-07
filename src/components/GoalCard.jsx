import { useState } from 'react';
import {
  Pencil, Trash2, Target, Plus, Minus, Check, X, TrendingUp, TrendingDown,
  Calendar, Layers, Activity, Flame, AlertCircle, ShieldAlert
} from 'lucide-react';

const statusColors = {
  Pending: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200/50 dark:border-amber-700/50',
  'In Progress': 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/50',
  Completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-700/50',
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
}) {
  const [newTitle, setNewTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [logValue, setLogValue] = useState('');
  const [showLogInput, setShowLogInput] = useState(false);

  const goalType = goal.goal_type || 'Target';
  const IconComponent = goalTypeIcons[goalType] || Target;
  const isBadHabit = Boolean(goal.bad_habit);

  // Numeric tracking values
  const currentVal = Number(goal.current_value) || 0;
  const targetVal = Number(goal.target_value) || 100;
  const startVal = Number(goal.start_value) || 0;
  const unit = goal.unit || '';

  // Pace calculations for Target goals
  const today = new Date();
  const startDate = goal.start_date ? new Date(goal.start_date) : new Date();
  const targetDate = goal.target_date ? new Date(goal.target_date) : new Date();

  const totalTime = Math.max(1, targetDate.getTime() - startDate.getTime());
  const elapsedTime = Math.max(0, today.getTime() - startDate.getTime());
  const progressRatio = Math.min(1, Math.max(0, elapsedTime / totalTime));

  const totalDiff = targetVal - startVal;
  const expectedPaceVal = startVal + (totalDiff * progressRatio);

  const isAhead = currentVal >= expectedPaceVal;
  const daysLeft = Math.max(0, Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  const remainingVal = Math.max(0, targetVal - currentVal);
  const dailyNeeded = daysLeft > 0 ? (remainingVal / daysLeft).toFixed(1) : 0;

  // Percentage complete
  let pct = 0;
  if (goalType === 'Project' || milestones.length > 0) {
    const doneMilestones = milestones.filter((m) => m.completed).length;
    pct = milestones.length > 0 ? Math.round((doneMilestones / milestones.length) * 100) : 0;
  } else if (totalDiff > 0) {
    pct = Math.min(100, Math.round(((currentVal - startVal) / totalDiff) * 100));
  } else if (goal.status === 'Completed') {
    pct = 100;
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
    <div className={`bg-white dark:bg-slate-800/90 rounded-2xl p-5 shadow-sm border ${
      isBadHabit
        ? 'border-amber-200 dark:border-amber-900/40 bg-gradient-to-b from-amber-50/20 to-transparent'
        : 'border-slate-100 dark:border-slate-700/60'
    } hover:shadow-md transition-all duration-200 h-full flex flex-col relative overflow-hidden group`}>
      
      {/* Top bar with icon, type badge, actions */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${
            isBadHabit
              ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
          }`}>
            <IconComponent size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {goalType}
              </span>
              {isBadHabit && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
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
            onClick={() => onEdit(goal)}
            className="p-1.5 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Edit Goal"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={() => onDelete(goal.id)}
            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
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

        {goalType === 'Target' && goal.status !== 'Completed' && (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
            isAhead
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200/50'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200/50'
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

      {/* Progress Bar & Numeric Tracker for Target / Average / Habit */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className="text-slate-500 dark:text-slate-400">
            {goalType === 'Project' || milestones.length > 0
              ? 'Roadmap Progress'
              : `${unit ? `${unit} ` : ''}${currentVal.toLocaleString()} / ${targetVal.toLocaleString()}`}
          </span>
          <span className="text-blue-600 dark:text-blue-400 font-bold">{pct}%</span>
        </div>

        <div className="h-2 bg-slate-100 dark:bg-slate-700/80 rounded-full overflow-hidden relative">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isBadHabit
                ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-teal-400'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Target metrics extra details */}
        {goalType === 'Target' && daysLeft > 0 && goal.status !== 'Completed' && (
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-1">
            <span>Needed: {dailyNeeded} {unit}/day</span>
            <span>{daysLeft} days remaining</span>
          </div>
        )}
      </div>

      {/* Quick Numeric Logger for Target/Average Goals */}
      {(goalType === 'Target' || goalType === 'Average') && onUpdateProgress && (
        <div className="mb-4 p-2.5 bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Quick Log</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleQuickLog(-1)}
                className="w-7 h-7 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                title="Subtract 1"
              >
                <Minus size={13} />
              </button>
              <button
                onClick={() => handleQuickLog(1)}
                className="w-7 h-7 bg-blue-600 text-white rounded-lg flex items-center justify-center hover:bg-blue-700 transition-colors shadow-xs"
                title="Add 1"
              >
                <Plus size={13} />
              </button>
              <button
                onClick={() => setShowLogInput(!showLogInput)}
                className="px-2 py-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[11px] font-medium text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
              >
                Set Value
              </button>
            </div>
          </div>

          {showLogInput && (
            <form onSubmit={handleCustomLogSubmit} className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-600/60">
              <input
                type="number"
                step="any"
                value={logValue}
                onChange={(e) => setLogValue(e.target.value)}
                placeholder={`Current ${unit}...`}
                className="flex-1 px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="submit"
                className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
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
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : 'border-2 border-slate-300 dark:border-slate-600 hover:border-blue-500'
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
                className="opacity-0 group-hover/item:opacity-100 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-opacity p-0.5"
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
            className="flex-1 min-w-0 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-slate-700 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={handleMilestoneAdd}
            disabled={adding || !newTitle.trim()}
            className="p-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
