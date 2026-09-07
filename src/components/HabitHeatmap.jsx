import { useState, useMemo } from 'react';

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
      currentWeek[dayOfWeek] = date.toISOString().split('T')[0];
      
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
    
    // Increment month
    cur.setMonth(cur.getMonth() + 1);
    cur.setDate(1); // Set to 1st of next month
  }
  return monthsData;
}

export default function HabitHeatmap({ data = {}, totalHabits = 0 }) {
  const [tooltip, setTooltip] = useState(null);

  const monthsData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return getMonthsData(today);
  }, []);

  const totalCompletions = useMemo(() =>
    Object.values(data).reduce((s, d) => s + (d?.completed || 0), 0), [data]);

  const activeDays = useMemo(() =>
    Object.values(data).filter(d => d?.completed > 0).length, [data]);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Habit Activity</h2>
          <p className="text-xs text-gray-400 mt-0.5">Last 12 months</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="font-medium text-gray-700">{totalCompletions} completions</span>
          <span className="text-gray-300">·</span>
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
                      const level = getLevel(completed, totalHabits || dayData?.total || 0);
                      const pct = totalHabits > 0 ? Math.round((completed / totalHabits) * 100) : 0;

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
                            setTooltip({ date, completed, total: totalHabits, pct, x: rect.left, y: rect.top });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-gray-400 font-semibold mt-2 text-center w-full">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-4 pl-2">
        <span className="text-[10px] text-gray-400 mr-1">Less</span>
        {[0, 1, 2, 3, 4].map((lvl) => (
          <div
            key={lvl}
            className={`heatmap-cell level-${lvl} cursor-default hover:scale-100`}
            style={{ width: 11, height: 11, borderRadius: 2 }}
          />
        ))}
        <span className="text-[10px] text-gray-400 ml-1">More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-xl pointer-events-none"
          style={{ left: tooltip.x + 18, top: tooltip.y - 48, whiteSpace: 'nowrap' }}
        >
          <div className="font-semibold">
            {new Date(tooltip.date + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
          </div>
          <div className="opacity-80 mt-0.5">
            {tooltip.completed} / {tooltip.total} habits
            {tooltip.total > 0 ? ` (${tooltip.pct}%)` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
