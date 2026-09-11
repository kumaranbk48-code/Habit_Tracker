import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

function getLevel(completed, total) {
  if (!total || completed === 0) return 0;
  const ratio = completed / total;
  if (ratio >= 0.76) return 4;
  if (ratio >= 0.51) return 3;
  if (ratio >= 0.26) return 2;
  return 1;
}

function getMonthsData(today) {
  const monthsData = [];
  const startMonth = new Date(today.getFullYear(), today.getMonth() - 11, 1);

  const cur = new Date(startMonth);
  while (cur <= today) {
    const year = cur.getFullYear();
    const month = cur.getMonth();
    const monthName = cur.toLocaleDateString('en-US', { month: 'short' });
    
    // Get number of days in this month
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const daysInMonth = [];
    
    for (let d = 1; d <= lastDayOfMonth; d++) {
      const date = new Date(year, month, d);
      // Only include dates up to today
      if (date <= today) {
        daysInMonth.push(date);
      }
    }
    
    // Group days into weeks (columns)
    const weeks = [];
    let currentWeek = Array(7).fill(null);
    
    daysInMonth.forEach((date) => {
      const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
      // Format as local YYYY-MM-DD to avoid UTC conversion shifts
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      currentWeek[dayOfWeek] = `${y}-${m}-${d}`;
      
      // If it's Saturday (6) or the last day of our collected days for this month
      if (dayOfWeek === 6 || date.getDate() === daysInMonth[daysInMonth.length - 1].getDate()) {
        weeks.push(currentWeek);
        currentWeek = Array(7).fill(null);
      }
    });
    
    monthsData.push({
      year,
      month,
      label: monthName,
      weeks,
    });
    
    // Increment month safely (reset date first to avoid 31st overflow)
    cur.setDate(1);
    cur.setMonth(cur.getMonth() + 1);
  }
  return monthsData;
}

export default function HabitHeatmap({ data = {}, totalHabits = 0 }) {
  const [tooltip, setTooltip] = useState(null);

  const monthsData = useMemo(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return getMonthsData(today);
  }, []);

  const totalCompletions = useMemo(() =>
    Object.values(data).reduce((s, d) => s + (d?.completed || 0), 0), [data]);

  const activeDays = useMemo(() =>
    Object.values(data).filter(d => d?.completed > 0).length, [data]);

  return (
    <div className="bg-white dark:bg-[#1a2129] rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-[#2a343d]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Habit Activity</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Last 12 months</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-200">{totalCompletions} completions</span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span>{activeDays} active days</span>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-max flex gap-4 justify-start">
          {/* Heatmap grid grouped by month */}
          {monthsData.map((m, mi) => (
            <div key={mi} className="flex flex-col items-center">
              <div className="flex" style={{ gap: '3px' }}>
                {m.weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col" style={{ gap: '3px' }}>
                    {week.map((date, di) => {
                      if (!date) return <div key={di} style={{ width: 11, height: 11 }} />;
                      const dayData = data[date];
                      const completed = dayData?.completed || 0;
                      const effectiveTotal = totalHabits || dayData?.total || 0;
                      const level = getLevel(completed, effectiveTotal);
                      const pct = effectiveTotal > 0 ? Math.round((completed / effectiveTotal) * 100) : 0;

                      return (
                        <div
                          key={di}
                          className={`heatmap-cell level-${level}`}
                          style={{
                            width: 11,
                            height: 11,
                            borderRadius: 2,
                          }}
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setTooltip({
                              date,
                              completed,
                              total: effectiveTotal,
                              pct,
                              rect,
                            });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold mt-2 text-center w-full">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-4 pl-2">
        <span className="text-[10px] text-gray-400 dark:text-gray-500 mr-1">Less</span>
        {[0, 1, 2, 3, 4].map((lvl) => (
          <div
            key={lvl}
            className={`heatmap-cell level-${lvl} cursor-default hover:scale-100`}
            style={{ width: 11, height: 11, borderRadius: 2 }}
          />
        ))}
        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1">More</span>
      </div>

      {/* Viewport-Safe Floating Tooltip with Portal to document.body */}
      {tooltip && typeof document !== 'undefined' && createPortal(
        (() => {
          const [y, m, d] = tooltip.date.split('-').map(Number);
          const dateObj = new Date(y, m - 1, d);
          const formattedDate = dateObj.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          const tooltipWidth = 220;
          const tooltipHeight = 62;
          // Position above by default
          let top = tooltip.rect.top - tooltipHeight - 8;
          if (top < 10) {
            // Flip below cell if too close to viewport top
            top = tooltip.rect.bottom + 8;
          }
          // Center horizontally on cell
          let left = tooltip.rect.left + tooltip.rect.width / 2 - tooltipWidth / 2;
          if (left < 10) left = 10;
          if (left + tooltipWidth > window.innerWidth - 10) {
            left = window.innerWidth - tooltipWidth - 10;
          }

          return (
            <div
              className="fixed z-50 p-2.5 bg-[#14181c] text-white rounded-xl shadow-2xl border border-[#2a343d] text-xs pointer-events-none"
              style={{ left: `${left}px`, top: `${top}px`, width: `${tooltipWidth}px`, whiteSpace: 'normal' }}
            >
              <div className="font-semibold text-white tracking-tight flex items-center justify-between">
                <span>{formattedDate}</span>
                {tooltip.completed > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3d7a75]/40 text-[#7fd1b9] font-mono font-medium">
                    {tooltip.pct}%
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-slate-300">
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                  tooltip.completed > 0 ? 'bg-[#3d7a75]' : 'bg-slate-600'
                }`} />
                <span className="font-medium text-[11px] text-white truncate">
                  {tooltip.completed > 0
                    ? `${tooltip.completed} ${tooltip.completed === 1 ? 'completion' : 'completions'}`
                    : 'No completions'}
                </span>
                {tooltip.total > 0 && (
                  <span className="text-slate-400 text-[10px] flex-shrink-0">
                    ({tooltip.completed}/{tooltip.total} habits)
                  </span>
                )}
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </div>
  );
}
