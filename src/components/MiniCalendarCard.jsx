import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function MiniCalendarCard({ trackingLogs = [], habits = [] }) {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const todayStr = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const monthYearLabel = useMemo(() => {
    return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [currentDate]);

  // Completions map: date string => count of completed habits
  const completionsByDate = useMemo(() => {
    const map = {};
    if (Array.isArray(trackingLogs)) {
      trackingLogs.forEach((log) => {
        if (log.status && log.completion_date) {
          map[log.completion_date] = (map[log.completion_date] || 0) + 1;
        }
      });
    }
    return map;
  }, [trackingLogs]);

  // Calendar cells computation for the month
  const calendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const cells = [];

    // Previous month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthTotalDays - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      cells.push({
        day: dayNum,
        dateStr,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({
        day,
        dateStr,
        isCurrentMonth: true,
      });
    }

    // Next month padding days to complete full week rows (total divisible by 7)
    const remainder = cells.length % 7;
    if (remainder > 0) {
      const nextMonthPadding = 7 - remainder;
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      for (let day = 1; day <= nextMonthPadding; day++) {
        const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        cells.push({
          day,
          dateStr,
          isCurrentMonth: false,
        });
      }
    }

    return cells;
  }, [currentDate]);

  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleTodayClick = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDateStr(todayStr);
  };

  const selectedCompletions = completionsByDate[selectedDateStr] || 0;
  const isSelectedToday = selectedDateStr === todayStr;

  return (
    <div className="habiz-panel p-5 sm:p-6 rounded-3xl relative overflow-hidden space-y-4">
      {/* Ambient background glow */}
      <div className="absolute -left-10 -bottom-10 w-36 h-36 bg-teal-500/10 blur-3xl rounded-full pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
            <CalIcon size={17} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight leading-tight">
              {monthYearLabel}
            </h3>
            <p className="text-[11px] text-slate-400">Monthly Routine View</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous month"
            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next month"
            className="w-8 h-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] flex items-center justify-center text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Weekday indicators */}
      <div className="grid grid-cols-7 gap-1 text-center relative z-10">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
          <span key={i} className="text-[11px] font-semibold text-slate-400 py-1">
            {d}
          </span>
        ))}
      </div>

      {/* Day Cells Grid */}
      <div className="grid grid-cols-7 gap-1 relative z-10">
        {calendarCells.map((cell, idx) => {
          const isToday = cell.dateStr === todayStr;
          const isSelected = cell.dateStr === selectedDateStr;
          const completions = completionsByDate[cell.dateStr] || 0;
          const hasCompletions = completions > 0;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedDateStr(cell.dateStr)}
              className={`relative h-9 sm:h-10 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer group ${
                !cell.isCurrentMonth
                  ? 'text-slate-600 hover:text-slate-500'
                  : isToday
                  ? 'bg-teal-500 text-white font-extrabold shadow-lg shadow-teal-500/35 ring-2 ring-teal-400/40'
                  : isSelected
                  ? 'bg-teal-500/20 text-teal-300 font-bold border border-teal-500/40'
                  : 'text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <span className="text-xs sm:text-[13px] leading-none">
                {cell.day}
              </span>

              {/* Completion indicator dot */}
              {cell.isCurrentMonth && (
                <div className="h-1.5 flex items-center justify-center mt-0.5">
                  {hasCompletions && (
                    <span
                      className={`w-1 h-1 rounded-full ${
                        isToday
                          ? 'bg-white shadow-[0_0_4px_rgba(255,255,255,0.8)]'
                          : 'bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.9)]'
                      }`}
                    />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Day Info Strip & Navigation Footer */}
      <div className="pt-3 border-t border-white/[0.05] flex items-center justify-between text-xs relative z-10">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.8)] flex-shrink-0" />
          <span className="text-slate-300 truncate">
            {isSelectedToday ? 'Today' : selectedDateStr}:{' '}
            <span className="text-teal-300 font-bold font-mono">
              {selectedCompletions} {selectedCompletions === 1 ? 'habit' : 'habits'}
            </span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => navigate('/calendar')}
          className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors cursor-pointer flex-shrink-0"
        >
          <span>Full Calendar</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
