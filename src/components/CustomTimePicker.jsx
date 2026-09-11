import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';

/**
 * CustomTimePicker - A theme-synchronized time input and picker component.
 * Replaces native HTML <input type="time"> with a modern, fully styled time selector
 * that adheres strictly to the Muted Teal & Navy palette without any browser-native blue highlights.
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

  // Parse current value (HH:mm)
  const [hours, setHours] = useState(() => {
    if (!value) return '08';
    const parts = value.split(':');
    return parts[0] || '08';
  });
  const [minutes, setMinutes] = useState(() => {
    if (!value) return '00';
    const parts = value.split(':');
    return parts[1] || '00';
  });

  useEffect(() => {
    if (value && value.includes(':')) {
      const [h, m] = value.split(':');
      setHours(h.padStart(2, '0'));
      setMinutes(m.padStart(2, '0'));
    }
  }, [value]);

  // Position calculation
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popupHeight = 290;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < popupHeight && rect.top > spaceBelow;
      setCoords({
        top: openUp ? Math.max(10, rect.top - popupHeight - 6) : rect.bottom + 6,
        left: Math.max(10, Math.min(rect.left, window.innerWidth - 270)),
      });
    }
  }, [isOpen]);

  // Click outside to close
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

  const emitChange = (newH, newM) => {
    const formatted = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
    if (typeof onChange === 'function') {
      onChange({
        target: { value: formatted, name: name || '' },
        currentTarget: { value: formatted, name: name || '' },
      });
    }
  };

  const handleSelectHour = (h) => {
    const newH = String(h).padStart(2, '0');
    setHours(newH);
    emitChange(newH, minutes);
  };

  const handleSelectMinute = (m) => {
    const newM = String(m).padStart(2, '0');
    setMinutes(newM);
    emitChange(hours, newM);
  };

  // 12-hour format display helper
  const hourNum = parseInt(hours, 10) || 0;
  const period = hourNum >= 12 ? 'PM' : 'AM';
  const displayHour = hourNum % 12 || 12;
  const displayTime = `${String(displayHour).padStart(2, '0')}:${minutes} ${period}`;

  // Quick preset times
  const presets = [
    { label: '07:00 AM', val: '07:00' },
    { label: '08:00 AM', val: '08:00' },
    { label: '09:00 AM', val: '09:00' },
    { label: '12:00 PM', val: '12:00' },
    { label: '02:00 PM', val: '14:00' },
    { label: '06:00 PM', val: '18:00' },
    { label: '08:00 PM', val: '20:00' },
    { label: '10:00 PM', val: '22:00' },
  ];

  return (
    <div className="relative inline-block w-full text-left" id={id}>
      <input type="hidden" name={name} value={`${hours}:${minutes}`} required={required} />

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
        <span className="font-medium text-xs tracking-wider">
          {hours}:{minutes} <span className="text-[10px] opacity-60 font-semibold ml-0.5">{period}</span>
        </span>
        <Clock
          size={14}
          className={`flex-shrink-0 transition-colors ${
            isOpen ? 'text-[#3d7a75] dark:text-[#5fae9e]' : 'text-slate-400 dark:text-slate-500'
          }`}
        />
      </button>

      {/* Time Picker Popup via Portal */}
      {isOpen &&
        createPortal(
          <div
            className="fixed z-[9999] custom-time-popup w-64 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2129] shadow-2xl transition-all"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-700/60">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Select Time</span>
            <span className="text-xs font-bold text-[#3d7a75] dark:text-[#5fae9e]">
              {displayTime}
            </span>
          </div>

          {/* Quick Presets */}
          <div className="grid grid-cols-4 gap-1 mb-3">
            {presets.map((p) => {
              const isActive = `${hours}:${minutes}` === p.val;
              return (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => {
                    const [h, m] = p.val.split(':');
                    setHours(h);
                    setMinutes(m);
                    emitChange(h, m);
                  }}
                  className={`py-1 px-1 text-[10px] font-semibold rounded-lg transition-colors text-center ${
                    isActive
                      ? 'bg-[#3d7a75] text-white'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-[#e2f0ef] hover:text-[#2c6560] dark:hover:bg-[#14302e] dark:hover:text-[#7fd1b9]'
                  }`}
                >
                  {p.label.replace(' ', '')}
                </button>
              );
            })}
          </div>

          {/* Dual Scroll Columns for Hour & Minute */}
          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hour (24h)</div>
              <div className="h-32 overflow-y-auto pr-1 space-y-0.5 rounded-lg border border-slate-100 dark:border-slate-700/40 p-1">
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => {
                  const isSel = hours === h;
                  return (
                    <div
                      key={h}
                      onClick={() => handleSelectHour(h)}
                      className={`py-1 rounded-md text-xs cursor-pointer transition-colors ${
                        isSel
                          ? 'bg-[#3d7a75] text-white font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-[#e2f0ef] hover:text-[#2c6560] dark:hover:bg-[#14302e] dark:hover:text-[#7fd1b9]'
                      }`}
                    >
                      {h}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Minute</div>
              <div className="h-32 overflow-y-auto pr-1 space-y-0.5 rounded-lg border border-slate-100 dark:border-slate-700/40 p-1">
                {Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')).map((m) => {
                  const isSel = minutes === m;
                  return (
                    <div
                      key={m}
                      onClick={() => handleSelectMinute(m)}
                      className={`py-1 rounded-md text-xs cursor-pointer transition-colors ${
                        isSel
                          ? 'bg-[#3d7a75] text-white font-bold'
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

          {/* Done Button */}
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
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
