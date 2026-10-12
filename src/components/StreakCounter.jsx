import { useEffect, useRef, useState } from 'react';

const FLAME_CONFIGS = [
  { min: 0,   size: 'text-2xl', glow: 'none' },
  { min: 3,   size: 'text-3xl', glow: 'drop-shadow(0 0 6px rgba(201,154,82,0.6))' },
  { min: 7,   size: 'text-4xl', glow: 'drop-shadow(0 0 10px rgba(201,154,82,0.8))' },
  { min: 30,  size: 'text-5xl', glow: 'drop-shadow(0 0 16px rgba(220,181,121,0.9))' },
  { min: 100, size: 'text-6xl', glow: 'drop-shadow(0 0 22px rgba(95,174,158,0.95))' },
];

function getFlameConfig(streak) {
  for (let i = FLAME_CONFIGS.length - 1; i >= 0; i--) {
    if (streak >= FLAME_CONFIGS[i].min) return FLAME_CONFIGS[i];
  }
  return FLAME_CONFIGS[0];
}

export default function StreakCounter({ streak = 0, label = 'Current Streak', large = false, lightText = false }) {
  const prevStreak = useRef(streak);
  const [pop, setPop] = useState(false);
  const config = getFlameConfig(streak);

  useEffect(() => {
    if (streak !== prevStreak.current) {
      setPop(true);
      prevStreak.current = streak;
      const t = setTimeout(() => setPop(false), 500);
      return () => clearTimeout(t);
    }
  }, [streak]);

  if (large) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <span
          className={`${config.size} fire-bounce leading-none select-none`}
          style={{ filter: config.glow }}
        >
          🔥
        </span>
        <div
          className={`text-5xl font-extrabold leading-none ${pop ? 'number-pop' : ''} ${
            lightText ? 'text-white' : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          {streak}
        </div>
        <div className={`text-sm font-medium ${lightText ? 'text-[#a5d6cd]' : 'text-slate-500 dark:text-slate-400'}`}>
          {label}
        </div>
        {streak >= 7 && (
          <div
            className={`mt-1 px-3 py-1 rounded-full text-xs font-semibold ${
              lightText
                ? streak >= 100
                  ? 'bg-amber-400/20 text-amber-200 border border-amber-400/40'
                  : streak >= 30
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'bg-[#5fae9e]/20 text-[#a5d6cd] border border-[#5fae9e]/30'
                : streak >= 100
                ? 'bg-[#e2f0ef] text-[#244b48] dark:bg-[#14302e] dark:text-[#5fae9e] border border-[#3d7a75]/30'
                : streak >= 30
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/40'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40'
            }`}
          >
            {streak >= 100 ? '🏆 Legend' : streak >= 30 ? '🚀 Consistent Master' : '⚡ Building Momentum'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`${streak > 0 ? 'fire-bounce' : ''} ${streak >= 7 ? 'text-2xl' : 'text-xl'} leading-none select-none`}
        style={{ filter: streak >= 3 ? config.glow : 'none' }}
      >
        {streak > 0 ? '🔥' : '—'}
      </span>
      <span className={`text-2xl font-bold text-slate-900 dark:text-slate-100 ${pop ? 'number-pop' : ''}`}>
        {streak}
      </span>
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}
