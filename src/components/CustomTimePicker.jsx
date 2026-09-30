import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';

/**
 * CustomTimePicker - 12-Hour format time selector with AM/PM & 00-59 minutes.
 * Outputs standard 24h 'HH:mm' for backend & form compatibility while providing
 * an intuitive 12-hour user experience.
 */
export default function CustomTimePicker({
  value = '08:00',
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

  // Convert any incoming 'HH:mm' 24h string or object into 12h parts (h12: 1-12, m: 00-59, period: AM/PM)
  const parseTo12h = (val) => {
    let raw = typeof val === 'string' ? val : (val?.target?.value || val?.value || '08:00');
    if (!raw || typeof raw !== 'string' || !raw.includes(':')) {
      raw = '08:00';
    }
    const [hStr, mStr] = raw.split(':');
    let h24 = parseInt(hStr, 10);
    if (isNaN(h24) || h24 < 0 || h24 > 23) h24 = 8;
    let m = parseInt(mStr, 10);
    if (isNaN(m) || m < 0 || m > 59) m = 0;

    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return {
      h12: String(h12).padStart(2, '0'),
      m: String(m).padStart(2, '0'),
      period,
    };
  };

  const initial = parseTo12h(value);
  const [selectedHour, setSelectedHour] = useState(initial.h12);
  const [selectedMinute, setSelectedMinute] = useState(initial.m);
  const [selectedPeriod, setSelectedPeriod] = useState(initial.period);

  useEffect(() => {
    const updated = parseTo12h(value);
    setSelectedHour(updated.h12);
    setSelectedMinute(updated.m);
    setSelectedPeriod(updated.period);
  }, [value]);

  // Position calculation
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popupHeight = 330;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < popupHeight && rect.top > spaceBelow;
      setCoords({
        top: openUp ? Math.max(10, rect.top - popupHeight - 6) : rect.bottom + 6,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - 290)),
      });
    }
  }, [isOpen]);

  // Click outside / Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target) && !e.target.closest('.custom-time-popup')) {
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

  // Converts 12h + AM/PM back to 24h HH:mm string for external consumers
  const to24hString = (h12, m, p) => {
    const numH12 = parseInt(h12, 10) || 12;
    let h24 = numH12;
    if (p === 'AM') {
      h24 = numH12 === 12 ? 0 : numH12;
    } else {
      h24 = numH12 === 12 ? 12 : numH12 + 12;
    }
    return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const emitChange = (h12, m, p) => {
    const formatted24 = to24hString(h12, m, p);
    if (typeof onChange === 'function') {
      const syntheticEvent = {
        target: { value: formatted24, name: name || '' },
        currentTarget: { value: formatted24, name: name || '' },
        value: formatted24,
        toString() { return formatted24; },
      };
      onChange(syntheticEvent);
    }
  };

  const handleHourSelect = (h) => {
    const cleanH = String(h).padStart(2, '0');
    setSelectedHour(cleanH);
    emitChange(cleanH, selectedMinute, selectedPeriod);
  };

  const handleMinuteSelect = (m) => {
    const cleanM = String(m).padStart(2, '0');
    setSelectedMinute(cleanM);
    emitChange(selectedHour, cleanM, selectedPeriod);
  };

  const handlePeriodToggle = (newPeriod) => {
    if (newPeriod === selectedPeriod) return;
    setSelectedPeriod(newPeriod);
    emitChange(selectedHour, selectedMinute, newPeriod);
  };

  // Quick preset times
  const presets = [
    { label: '07:00 AM', h: '07', m: '00', p: 'AM' },
    { label: '08:00 AM', h: '08', m: '00', p: 'AM' },
    { label: '09:00 AM', h: '09', m: '00', p: 'AM' },
    { label: '12:00 PM', h: '12', m: '00', p: 'PM' },
    { label: '02:00 PM', h: '02', m: '00', p: 'PM' },
    { label: '06:00 PM', h: '06', m: '00', p: 'PM' },
    { label: '08:00 PM', h: '08', m: '00', p: 'PM' },
    { label: '10:00 PM', h: '10', m: '00', p: 'PM' },
  ];

  const displayTime = `${selectedHour}:${selectedMinute} ${selectedPeriod}`;
  const value24 = to24hString(selectedHour, selectedMinute, selectedPeriod);

  return (
    <div className="relative inline-block w-full text-left" id={id}>
      <input type="hidden" name={name} value={value24} required={required} />

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between text-left cursor-pointer transition-all bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 ${className} ${
          isOpen ? 'ring-2 ring-[#3d7a75] border-[#3d7a75] dark:ring-[#5fae9e] dark:border-[#5fae9e]' : ''
        }`}
      >
        <span className="font-semibold text-xs tracking-wider">
          {selectedHour}:{selectedMinute}{' '}
          <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-[#3d7a75] dark:text-[#5fae9e]">
            {selectedPeriod}
          </span>
        </span>
        <Clock
          size={14}
          className={`flex-shrink-0 transition-colors ${
            isOpen ? 'text-[#3d7a75] dark:text-[#5fae9e]' : 'text-slate-400 dark:text-slate-500'
          }`}
        />
      </button>

      {/* 12-Hour Popup with AM/PM & 00-59 minutes */}
      {isOpen &&
        createPortal(
          <div
            className="fixed z-[9999] custom-time-popup w-72 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2129] shadow-2xl transition-all"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            {/* Header with Active Time & AM/PM Switcher */}
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-100 dark:border-slate-700/60">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Selected</span>
                <span className="text-sm font-black text-[#3d7a75] dark:text-[#5fae9e]">
                  {displayTime}
                </span>
              </div>

              {/* AM / PM Segmented Control */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/60 dark:border-slate-700">
                {['AM', 'PM'].map((p) => {
                  const isActive = selectedPeriod === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePeriodToggle(p)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#3d7a75] text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-4 gap-1 mb-3">
              {presets.map((p) => {
                const isMatch = selectedHour === p.h && selectedMinute === p.m && selectedPeriod === p.p;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      setSelectedHour(p.h);
                      setSelectedMinute(p.m);
                      setSelectedPeriod(p.p);
                      emitChange(p.h, p.m, p.p);
                    }}
                    className={`py-1 px-0.5 text-[9px] font-bold rounded-lg transition-colors text-center cursor-pointer ${
                      isMatch
                        ? 'bg-[#3d7a75] text-white'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-[#e2f0ef] hover:text-[#2c6560] dark:hover:bg-[#14302e] dark:hover:text-[#7fd1b9]'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Dual Scroll Columns: 1-12 Hours & 0-59 Minutes */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              {/* 12-Hour Column (01 to 12) */}
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hour (12h)</div>
                <div className="h-36 overflow-y-auto pr-1 space-y-0.5 rounded-xl border border-slate-100 dark:border-slate-700/60 p-1 bg-slate-50/50 dark:bg-slate-900/30 scrollbar-thin">
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((h) => {
                    const isSel = selectedHour === h;
                    return (
                      <div
                        key={h}
                        onClick={() => handleHourSelect(h)}
                        className={`py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          isSel
                            ? 'bg-[#3d7a75] text-white font-bold shadow-xs'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-[#e2f0ef] hover:text-[#2c6560] dark:hover:bg-[#14302e] dark:hover:text-[#7fd1b9]'
                        }`}
                      >
                        {h}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 60-Minute Column (00 to 59) */}
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Minute (00-59)</div>
                <div className="h-36 overflow-y-auto pr-1 space-y-0.5 rounded-xl border border-slate-100 dark:border-slate-700/60 p-1 bg-slate-50/50 dark:bg-slate-900/30 scrollbar-thin">
                  {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => {
                    const isSel = selectedMinute === m;
                    return (
                      <div
                        key={m}
                        onClick={() => handleMinuteSelect(m)}
                        className={`py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                          isSel
                            ? 'bg-[#3d7a75] text-white font-bold shadow-xs'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-[#e2f0ef] hover:text-[#2c6560] dark:hover:bg-[#14302e] dark:hover:text-[#7fd1b9]'
                        }`}
                      >
                        {m}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
              <span className="text-[10px] text-slate-400">Time set: {displayTime}</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3.5 py-1.5 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
