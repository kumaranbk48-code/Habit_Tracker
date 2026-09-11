import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * CustomSelect - A theme-synchronized dropdown select component.
 * Replaces native HTML <select> with a modern, fully styled dropdown that adheres
 * strictly to the Muted Teal & Navy palette in both Light and Dark modes.
 *
 * Supports both:
 * 1. Children: <CustomSelect><option value="1">One</option></CustomSelect>
 * 2. Options prop: <CustomSelect options={[{ value: '1', label: 'One' }]} />
 *
 * Dispatches standard event object { target: { value, name } } to onChange.
 */
export default function CustomSelect({
  value,
  onChange,
  options = [],
  children,
  placeholder = 'Select an option',
  disabled = false,
  required = false,
  name,
  id,
  className = '',
  containerClassName = '',
  dropdownClassName = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState('down');
  const containerRef = useRef(null);
  const listRef = useRef(null);

  // Parse options either from `options` prop or from nested `children`
  const parsedOptions = React.useMemo(() => {
    if (options && options.length > 0) {
      return options.map((opt) =>
        typeof opt === 'object' && opt !== null
          ? { value: opt.value, label: opt.label ?? opt.value, disabled: Boolean(opt.disabled) }
          : { value: opt, label: String(opt), disabled: false }
      );
    }
    const extracted = [];
    const walk = (nodes) => {
      React.Children.forEach(nodes, (child) => {
        if (!child) return;
        if (child.type === React.Fragment) {
          walk(child.props.children);
        } else if (Array.isArray(child)) {
          walk(child);
        } else if (child.props) {
          const optValue = child.props.value !== undefined ? child.props.value : child.props.children;
          extracted.push({
            value: optValue,
            label: child.props.children ?? String(optValue),
            disabled: Boolean(child.props.disabled),
          });
        }
      });
    };
    walk(children);
    return extracted;
  }, [options, children]);

  // Currently selected option
  const selectedOption = parsedOptions.find(
    (opt) => String(opt.value) === String(value)
  ) || (value === '' || value === undefined ? null : { value, label: String(value) });

  // Intelligent directional positioning (open up if near viewport bottom)
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 220 && spaceAbove > spaceBelow) {
        setDirection('up');
      } else {
        setDirection('down');
      }
    }
  }, [isOpen]);

  // Click outside and Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
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

  const handleSelect = (opt) => {
    if (opt.disabled || disabled) return;
    setIsOpen(false);
    if (typeof onChange === 'function') {
      onChange({
        target: { value: opt.value, name: name || '' },
        currentTarget: { value: opt.value, name: name || '' },
      });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block text-left ${containerClassName || 'w-full'}`}
      id={id ? `${id}-container` : undefined}
    >
      {/* Hidden input for HTML form compatibility */}
      <input
        type="hidden"
        name={name}
        value={value ?? ''}
        required={required}
      />

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between text-left transition-all cursor-pointer select-none bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 ${className} ${
          isOpen ? 'ring-2 ring-[#3d7a75] border-[#3d7a75] dark:ring-[#5fae9e] dark:border-[#5fae9e]' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="truncate flex-1 pr-2">
          {selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-slate-400 dark:text-slate-500">{placeholder}</span>
          )}
        </span>
        <ChevronDown
          size={15}
          className={`flex-shrink-0 transition-transform duration-200 text-slate-400 dark:text-slate-400 ${
            isOpen ? 'rotate-180 text-[#3d7a75] dark:text-[#5fae9e]' : ''
          }`}
        />
      </button>

      {/* Dropdown Options Popup */}
      {isOpen && (
        <div
          ref={listRef}
          role="listbox"
          className={`absolute z-50 left-0 right-0 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2129] shadow-xl p-1 transition-all ${
            direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${dropdownClassName}`}
          style={{ animation: 'fadeIn 0.15s ease-out' }}
        >
          {parsedOptions.length === 0 ? (
            <div className="py-2 px-3 text-xs text-slate-400 dark:text-slate-500 text-center">
              No options available
            </div>
          ) : (
            parsedOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);
              return (
                <div
                  key={`${opt.value}-${idx}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center justify-between my-0.5 ${
                    opt.disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : isSelected
                      ? 'bg-[#3d7a75] text-white font-semibold'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-[#e2f0ef] hover:text-[#2c6560] dark:hover:bg-[#14302e] dark:hover:text-[#7cc3bb]'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check size={14} className="ml-2 flex-shrink-0" />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
