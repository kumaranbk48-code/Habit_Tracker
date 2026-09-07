import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { Play, Pause, RotateCcw, CheckCircle, Clock, Volume2, Sparkles } from 'lucide-react';
import { useConfetti } from '../hooks/useConfetti';

export default function FocusTimerModal({ open, onClose, habits = [], onCompleteHabit }) {
  const [selectedHabitId, setSelectedHabitId] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState('timer'); // 'timer' | 'stopwatch'
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  const timerRef = useRef(null);
  const { firePerfectDay } = useConfetti();

  // Reset when modal opens or habit changes
  useEffect(() => {
    if (habits.length > 0 && !selectedHabitId) {
      setSelectedHabitId(habits[0].id);
      if (habits[0].timer_duration) {
        setDurationMinutes(habits[0].timer_duration);
        setTimeLeft(habits[0].timer_duration * 60);
      }
    }
  }, [habits, selectedHabitId]);

  const handleSelectHabit = (id) => {
    setSelectedHabitId(id);
    const h = habits.find(item => item.id === id);
    const dur = h?.timer_duration || 25;
    setDurationMinutes(dur);
    setTimeLeft(dur * 60);
    setIsRunning(false);
    setElapsedSeconds(0);
  };

  const handleSetDuration = (mins) => {
    setDurationMinutes(mins);
    setTimeLeft(mins * 60);
    setIsRunning(false);
  };

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        if (mode === 'timer') {
          setTimeLeft(prev => {
            if (prev <= 1) {
              clearInterval(timerRef.current);
              setIsRunning(false);
              handleTimerFinished();
              return 0;
            }
            return prev - 1;
          });
        } else {
          setElapsedSeconds(prev => prev + 1);
        }
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [isRunning, mode]);

  const handleTimerFinished = () => {
    firePerfectDay();
    const habit = habits.find(h => h.id === selectedHabitId);
    if (habit && onCompleteHabit) {
      onCompleteHabit(habit);
    }
  };

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(durationMinutes * 60);
    setElapsedSeconds(0);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentDisplayTime = mode === 'timer' ? formatTime(timeLeft) : formatTime(elapsedSeconds);
  const totalSeconds = durationMinutes * 60;
  const progressPercent = mode === 'timer' 
    ? ((totalSeconds - timeLeft) / totalSeconds) * 100
    : Math.min(100, (elapsedSeconds / totalSeconds) * 100);

  const activeHabit = habits.find(h => h.id === selectedHabitId);

  return (
    <Modal open={open} onClose={onClose} title="Focus Session & Habit Timer">
      <div className="space-y-6 py-2">
        {/* Habit Selector */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Target Habit
          </label>
          <select
            value={selectedHabitId}
            onChange={(e) => handleSelectHabit(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-blue-500"
          >
            {habits.map(h => (
              <option key={h.id} value={h.id}>
                {h.habit_name} ({h.category})
              </option>
            ))}
          </select>
        </div>

        {/* Mode Toggle & Preset Presets */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            <button
              onClick={() => { setMode('timer'); setIsRunning(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === 'timer' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Countdown
            </button>
            <button
              onClick={() => { setMode('stopwatch'); setIsRunning(false); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                mode === 'stopwatch' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Stopwatch
            </button>
          </div>

          {mode === 'timer' && (
            <div className="flex gap-1.5">
              {[5, 15, 25, 45].map(m => (
                <button
                  key={m}
                  onClick={() => handleSetDuration(m)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                    durationMinutes === m
                      ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Circular Timer Visual */}
        <div className="flex flex-col items-center justify-center py-4">
          <div className="relative w-56 h-56 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="6" className="text-gray-100 dark:text-gray-800" fill="none" />
              <circle
                cx="60"
                cy="60"
                r="50"
                stroke="url(#timerGrad)"
                strokeWidth="7"
                fill="none"
                strokeDasharray={2 * Math.PI * 50}
                strokeDashoffset={(2 * Math.PI * 50) * (1 - progressPercent / 100)}
                strokeLinecap="round"
                className="transition-all duration-300"
              />
              <defs>
                <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-4xl font-extrabold font-mono text-gray-900 dark:text-gray-100 tracking-tight">
                {currentDisplayTime}
              </span>
              <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mt-1 flex items-center gap-1">
                <Sparkles size={12} className="text-amber-500" />
                {activeHabit?.habit_name || 'Focus Session'}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={resetTimer}
            title="Reset"
            className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 rounded-xl transition-colors"
          >
            <RotateCcw size={18} />
          </button>

          <button
            onClick={toggleTimer}
            className={`flex items-center gap-2 px-8 py-3.5 rounded-2xl font-semibold text-white shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200 dark:shadow-none'
                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200 dark:shadow-none'
            }`}
          >
            {isRunning ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
            <span>{isRunning ? 'Pause' : 'Start Focus'}</span>
          </button>

          <button
            onClick={handleTimerFinished}
            title="Complete Habit Now"
            className="p-3 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-xl transition-colors"
          >
            <CheckCircle size={20} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
