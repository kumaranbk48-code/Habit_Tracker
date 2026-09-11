import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * CustomDatePicker - A theme-synchronized date input and calendar picker component.
 * Replaces native HTML <input type="date"> with a modern, fully styled calendar popup
 * that adheres strictly to the Muted Teal & Navy palette without any browser-native blue highlights.
 */
export default function CustomDatePicker({
  value = '',
  onChange,
  className = '',
  required = false,
  disabled = false,
  name,
  id,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  // Parse YYYY-MM-DD or default to today
  const parseDate = (dStr) => {
    if (!dStr) return new Date();
    const [y, m, d] = dStr.split('-').map(Number);
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  };

  const selectedDate = value ? parseDate(value) : null;
  const [viewDate, setViewDate] = useState(() => selectedDate || new Date());

  useEffect(() => {
    if (value) {
      setViewDate(parseDate(value));
    }
  }, [value]);

  // Position calculation
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popupHeight = 310;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < popupHeight && rect.top > spaceBelow;
      setCoords({
        top: openUp ? Math.max(10, rect.top - popupHeight - 6) : rect.bottom + 6,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - 275)),
      });
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest('.custom-date-popup')) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const emitChange = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const formatted = `${y}-${m}-${day}`;
    if (typeof onChange === 'function') {
      onChange({
        target: { value: formatted, name: name || '' },
        currentTarget: { value: formatted, name: name || '' },
      });
    }
  };

  const handleSelectDay = (dayNum) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayNum);
    emitChange(d);
    setIsOpen(false);
  };

  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  const setToday = () => {
    const today = new Date();
    setViewDate(today);
    emitChange(today);
    setIsOpen(false);
  };

  // Calendar matrix calculation
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sun
  const startDay = (firstDayIndex + 6) % 7; // Shift to Mon = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const weekDays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  const todayStr = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  })();

  const formatDisplay = (dStr) => {
    if (!dStr) return 'Select date';
    const [y, m, d] = dStr.split('-');
    if (!y || !m || !d) return dStr;
    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="relative inline-block w-full text-left" id={id}>
      <input type="hidden" name={name} value={value} required={required} />

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between text-left cursor-pointer transition-all bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 ${className} ${
          isOpen ? 'ring-2 ring-[#3d7a75] border-[#3d7a75] dark:ring-[#5fae9e] dark:border-[#5fae9e]' : ''
        }`}
      >
        <span className="font-medium text-xs">
          {value ? formatDisplay(value) : <span className="text-slate-400 dark:text-slate-500">Select Date</span>}
        </span>
        <Calendar
          size={14}
          className={`flex-shrink-0 transition-colors ${
            isOpen ? 'text-[#3d7a75] dark:text-[#5fae9e]' : 'text-slate-400 dark:text-slate-500'
          }`}
        />
      </button>

      {/* Calendar Popup via Portal */}
      {isOpen &&
        createPortal(
          <div
            className="fixed z-[9999] custom-date-popup w-64 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2129] shadow-2xl transition-all"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
          {/* Month / Year Nav */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-700/60">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {monthNames[month]} {year}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {weekDays.map((wd) => (
              <span key={wd} className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                {wd}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: startDay }).map((_, i) => (
              <div key={`empty-${i}`} className="h-7" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
              const currentDayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const isSelected = value === currentDayStr;
              const isToday = todayStr === currentDayStr;

              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => handleSelectDay(dayNum)}
                  className={`h-7 w-7 text-xs rounded-lg flex items-center justify-center font-medium transition-colors cursor-pointer mx-auto ${
                    isSelected
                      ? 'bg-[#3d7a75] text-white font-bold'
                      : isToday
                      ? 'border border-[#3d7a75] text-[#3d7a75] dark:border-[#5fae9e] dark:text-[#5fae9e] font-semibold hover:bg-[#e2f0ef] dark:hover:bg-[#14302e]'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-[#e2f0ef] hover:text-[#2c6560] dark:hover:bg-[#14302e] dark:hover:text-[#7fd1b9]'
                  }`}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          {/* Footer with Today / Close */}
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
            <button
              type="button"
              onClick={setToday}
              className="text-[11px] font-semibold text-[#3d7a75] dark:text-[#5fae9e] hover:underline cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
