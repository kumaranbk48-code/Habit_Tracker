import { useState, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Check, Calendar as CalIcon,
  Sparkles, Flame, Clock, Target, Info, CheckCircle2, RotateCcw
} from 'lucide-react';
import { isHabitScheduledOnDate, getCellStatus } from '../lib/calendarLogic';

export default function CalendarMatrix({
  habits = [],
  trackingLogs = [],
  onToggleHabit,
  onOpenDateActionModal,
  viewDate,
  setViewDate,
  showArchived = false,
}) {
  const [activeCellTooltip, setActiveCellTooltip] = useState(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayStr = new Date().toISOString().split('T')[0];

  const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysArray = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  // Helper to build YYYY-MM-DD
  const getDateStr = (dayNum) => {
    const m = (month + 1).toString().padStart(2, '0');
    const d = dayNum.toString().padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  // Map tracking logs for O(1) lookup
  const trackingMap = useMemo(() => {
    const map = new Map();
    trackingLogs.forEach(t => {
      map.set(`${t.habit_id}_${t.completion_date}`, t);
    });
    return map;
  }, [trackingLogs]);

  // Filter habits based on archive toggle
  const visibleHabits = useMemo(() => {
    if (showArchived) return habits;
    return habits.filter(h => !h.is_archived);
  }, [habits, showArchived]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-100 dark:border-slate-700/80 space-y-4">
      {/* Matrix Container with horizontal scroll and sticky positioning */}
      {visibleHabits.length === 0 ? (
        <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm">
          <CalIcon size={32} className="mx-auto mb-2 opacity-50 text-blue-500" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">No active habits found</p>
          <p className="text-xs text-slate-400 mt-1">Create a habit or enable "Show Archived" to populate the calendar grid.</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4 relative scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[780px]">
            {/* Table Header: Sticky Date Row */}
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-700/80">
                <th className="py-3 px-3 text-xs font-bold text-slate-500 dark:text-slate-400 sticky left-0 bg-white dark:bg-slate-800 z-20 w-52 shadow-xs uppercase tracking-wider">
                  Habit Name
                </th>
                {daysArray.map(day => {
                  const dateStr = getDateStr(day);
                  const isToday = dateStr === todayStr;
                  const isPast = dateStr < todayStr;
                  const isFuture = dateStr > todayStr;

                  // Scheduled habits on this date
                  const scheduledCount = visibleHabits.filter(h => isHabitScheduledOnDate(h, dateStr)).length;
                  const completedCount = visibleHabits.filter(h => {
                    if (!isHabitScheduledOnDate(h, dateStr)) return false;
                    const log = trackingMap.get(`${h.id}_${dateStr}`);
                    return getCellStatus(h, dateStr, log, todayStr).isDone;
                  }).length;

                  const isAllDone = scheduledCount > 0 && completedCount === scheduledCount;

                  return (
                    <th
                      key={day}
                      onClick={() => isToday && onOpenDateActionModal && onOpenDateActionModal(dateStr, scheduledCount)}
                      title={isFuture ? '' : isPast ? `Date: ${dateStr} (${completedCount}/${scheduledCount} done - Automatic)` : `Date: ${dateStr} (${completedCount}/${scheduledCount} done)`}
                      className={`py-2 px-1 text-center text-xs w-11 min-w-[44px] select-none transition-colors ${
                        isToday
                          ? 'text-blue-600 dark:text-blue-400 font-extrabold bg-blue-50/60 dark:bg-blue-950/40 rounded-t-xl ring-2 ring-blue-500/40 cursor-pointer'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <div className="flex flex-col items-center justify-center gap-0.5 py-1">
                        <span className="text-[11px]">{day}</span>
                        {isAllDone && (
                          <span className="w-3.5 h-3.5 rounded-full bg-blue-600 dark:bg-blue-500 text-white text-[9px] flex items-center justify-center font-bold shadow-xs">
                            ✓
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
                </tr>
              </thead>

              {/* Matrix Body */}
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {visibleHabits.map(habit => (
                  <tr key={habit.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                    {/* Sticky Habit Label Column */}
                    <td className="py-3 px-3 text-xs font-semibold text-slate-800 dark:text-slate-200 sticky left-0 bg-white dark:bg-slate-800 z-20 shadow-xs truncate max-w-[200px]">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: habit.color || '#3b82f6' }}
                        />
                        <span className="truncate">{habit.habit_name}</span>
                        {habit.is_archived && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-400">
                            Archived
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Day Cells */}
                    {daysArray.map(day => {
                      const dateStr = getDateStr(day);
                      const isToday = dateStr === todayStr;
                      const isPast = dateStr < todayStr;
                      const log = trackingMap.get(`${habit.id}_${dateStr}`);
                      const status = getCellStatus(habit, dateStr, log, todayStr);

                      return (
                        <td key={day} className="py-2 px-1 text-center relative">
                          <button
                            type="button"
                            disabled={status.isFuture}
                            onClick={() => {
                              if (isToday && onToggleHabit) {
                                onToggleHabit(habit, dateStr);
                              } else {
                                setActiveCellTooltip(activeCellTooltip === `${habit.id}_${dateStr}` ? null : `${habit.id}_${dateStr}`);
                              }
                            }}
                            onMouseEnter={() => setActiveCellTooltip(`${habit.id}_${dateStr}`)}
                            onMouseLeave={() => setActiveCellTooltip(null)}
                            className={`w-9 h-9 rounded-xl mx-auto flex items-center justify-center text-xs font-bold transition-all duration-150 ${
                              isToday ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-800 cursor-pointer active:scale-95' : 'cursor-default'
                            } ${
                              status.isFuture
                                ? 'opacity-20 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-transparent'
                                : status.isNotScheduled
                                ? 'bg-slate-50 dark:bg-slate-800/40 text-slate-300 dark:text-slate-600'
                                : status.isDone
                                ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-xs scale-100'
                                : status.isPartial
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60'
                                : status.isMissed
                                ? 'bg-slate-100 dark:bg-slate-700/60 text-slate-400 dark:text-slate-400'
                                : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                            }`}
                            style={
                              status.isDone && habit.color
                                ? { backgroundColor: habit.color, color: '#ffffff' }
                                : {}
                            }
                          >
                            <span>{status.symbol}</span>
                          </button>

                          {/* Cell Details Tooltip on Hover / Tap */}
                          {activeCellTooltip === `${habit.id}_${dateStr}` && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 w-48 p-3 bg-slate-900 text-white text-left rounded-xl shadow-xl border border-slate-700 text-[11px] pointer-events-none animate-fadeIn">
                              <div className="flex items-center gap-1.5 font-bold mb-1" style={{ color: habit.color || '#60a5fa' }}>
                                <span>{habit.habit_name}</span>
                              </div>
                              <div className="text-slate-300 font-semibold">{dateStr} {isPast ? '(Auto History)' : isToday ? '(Today)' : ''}</div>
                              <div className="mt-1 pt-1 border-t border-slate-800 space-y-0.5 text-slate-300">
                                <div>Status: <span className="font-bold text-white">{status.label}</span></div>
                                {habit.tracking_type === 'quantity' && (
                                  <div>Progress: {status.quantityDone} / {status.targetQuantity} {habit.unit} ({status.progressPct}%)</div>
                                )}
                                {log?.note && <div className="italic text-slate-400 mt-1">"{log.note}"</div>}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              {/* Daily Completion Summary Row */}
              <tfoot>
                <tr className="border-t border-slate-800 bg-slate-900/95 dark:bg-slate-900 text-white shadow-md">
                  <td className="py-3 px-3 text-[11px] font-extrabold text-blue-300 sticky left-0 bg-slate-900 z-20 shadow-md">
                    Daily Completion Rate
                  </td>
                  {daysArray.map(day => {
                    const dateStr = getDateStr(day);
                    const scheduledCount = visibleHabits.filter(h => isHabitScheduledOnDate(h, dateStr)).length;
                    const completedCount = visibleHabits.filter(h => {
                      if (!isHabitScheduledOnDate(h, dateStr)) return false;
                      const log = trackingMap.get(`${h.id}_${dateStr}`);
                      return getCellStatus(h, dateStr, log, todayStr).isDone;
                    }).length;

                    const rate = scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0;
                    const isAllDone = scheduledCount > 0 && completedCount === scheduledCount;

                    return (
                      <td key={day} className="py-2.5 px-1 text-center text-[11px] font-black bg-slate-900/95 dark:bg-slate-900">
                        <span className={isAllDone ? 'text-blue-400 font-black text-[11px] drop-shadow-xs' : rate > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                          {scheduledCount > 0 ? `${rate}%` : '-'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
