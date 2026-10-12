import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Flame, Sparkles } from 'lucide-react';

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

    // Number of days in this month
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    const daysInMonth = [];

    for (let d = 1; d <= lastDayOfMonth; d++) {
      const date = new Date(year, month, d);
      if (date <= today) {
        daysInMonth.push(date);
      }
    }

    // Group days into weeks (columns)
    const weeks = [];
    let currentWeek = Array(7).fill(null);

    daysInMonth.forEach((date) => {
      const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      currentWeek[dayOfWeek] = `${y}-${m}-${d}`;

      // End of week or end of days in this month
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

  // Color classes for cells matching the HabiZ dark teal palette
  const getCellColorClass = (lvl) => {
    switch (lvl) {
      case 1:
        return 'bg-teal-950/80 border-teal-800/40 hover:bg-teal-900';
      case 2:
        return 'bg-teal-800/70 border-teal-600/40 hover:bg-teal-700';
      case 3:
        return 'bg-teal-600/90 border-teal-400/50 hover:bg-teal-500';
      case 4:
        return 'bg-[#2dd4bf] border-teal-300 shadow-[0_0_8px_rgba(45,212,191,0.4)] hover:brightness-110';
      default:
        return 'bg-white/[0.04] border-white/[0.04] hover:border-white/20';
    }
  };

  return (
    <div className="habiz-panel p-5 sm:p-6 rounded-3xl relative overflow-hidden border border-white/[0.06] shadow-xl space-y-5 w-full">
      {/* Ambient background glow */}
      <div className="absolute -left-12 -top-12 w-48 h-48 bg-teal-500/10 blur-3xl rounded-full pointer-events-none" />

      {/* Header aligned with dashboard cards */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 flex-shrink-0">
            <Activity size={20} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight leading-tight">
              Yearly Habit Activity
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Last 12 months • 365 days of consistency
            </p>
          </div>
        </div>

        {/* Metric Badges */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-950/60 border border-teal-500/30 text-teal-300 text-xs font-semibold">
            <Sparkles size={13} className="text-teal-400" />
            <span className="font-mono font-bold">{totalCompletions.toLocaleString()}</span>
            <span>completions</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-slate-300 text-xs font-semibold">
            <Flame size={13} className="text-amber-400" />
            <span className="font-mono font-bold text-white">{activeDays}</span>
            <span>active days</span>
          </div>
        </div>
      </div>

      {/* Heatmap Matrix Centered & Gracefully Aligned */}
      <div className="overflow-x-auto pb-2 relative z-10 custom-scrollbar">
        <div className="min-w-max flex justify-start lg:justify-center gap-3 sm:gap-4 lg:gap-5 items-start mx-auto px-1">
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
                      const colorClass = getCellColorClass(level);

                      return (
                        <div
                          key={di}
                          className={`heatmap-cell border transition-transform duration-150 cursor-pointer ${colorClass}`}
                          style={{
                            width: 11,
                            height: 11,
                            borderRadius: 2.5,
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
              <div className="text-[11px] text-slate-400 font-semibold mt-2.5 text-center w-full">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Strip with Subtitle and Sleek Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/[0.05] relative z-10">
        <p className="text-xs text-slate-400">
          Showing daily completion density across the past year.
        </p>

        {/* Modern Pill Legend */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.06] self-start sm:self-auto">
          <span className="text-[10px] font-semibold text-slate-400">Less</span>
          {[0, 1, 2, 3, 4].map((lvl) => (
            <div
              key={lvl}
              className={`border transition-transform cursor-default ${getCellColorClass(lvl)}`}
              style={{ width: 11, height: 11, borderRadius: 2.5 }}
            />
          ))}
          <span className="text-[10px] font-semibold text-slate-400">More</span>
        </div>
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

          const tooltipWidth = 230;
          const tooltipHeight = 68;
          let top = tooltip.rect.top - tooltipHeight - 10;
          if (top < 10) {
            top = tooltip.rect.bottom + 10;
          }
          let left = tooltip.rect.left + tooltip.rect.width / 2 - tooltipWidth / 2;
          if (left < 10) left = 10;
          if (left + tooltipWidth > window.innerWidth - 10) {
            left = window.innerWidth - tooltipWidth - 10;
          }

          return (
            <div
              className="fixed z-50 p-3 bg-[#0b131a]/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-teal-500/30 text-xs pointer-events-none"
              style={{ left: `${left}px`, top: `${top}px`, width: `${tooltipWidth}px`, whiteSpace: 'normal' }}
            >
              <div className="font-bold text-white tracking-tight flex items-center justify-between">
                <span>{formattedDate}</span>
                {tooltip.completed > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 font-mono font-bold border border-teal-500/30">
                    {tooltip.pct}%
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-slate-300">
                <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                  tooltip.completed > 0 ? 'bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.8)]' : 'bg-slate-600'
                }`} />
                <span className="font-semibold text-[11px] text-white truncate">
                  {tooltip.completed > 0
                    ? `${tooltip.completed} ${tooltip.completed === 1 ? 'completion' : 'completions'}`
                    : 'No completions recorded'}
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
