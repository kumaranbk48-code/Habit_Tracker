import { useEffect, useRef, useState } from 'react';

const FLAME_CONFIGS = [
  { min: 0,   size: 'text-2xl', glow: 'none' },
  { min: 3,   size: 'text-3xl', glow: 'drop-shadow(0 0 6px rgba(251,146,60,0.6))' },
  { min: 7,   size: 'text-4xl', glow: 'drop-shadow(0 0 10px rgba(251,146,60,0.8))' },
  { min: 30,  size: 'text-5xl', glow: 'drop-shadow(0 0 16px rgba(239,68,68,0.9))' },
  { min: 100, size: 'text-6xl', glow: 'drop-shadow(0 0 24px rgba(239,68,68,1))' },
];

function getFlameConfig(streak) {
  for (let i = FLAME_CONFIGS.length - 1; i >= 0; i--) {
    if (streak >= FLAME_CONFIGS[i].min) return FLAME_CONFIGS[i];
  }
  return FLAME_CONFIGS[0];
}

export default function StreakCounter({ streak = 0, label = 'Current Streak', large = false }) {
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
        <div className={`text-5xl font-extrabold text-gray-900 leading-none ${pop ? 'number-pop' : ''}`}>
          {streak}
        </div>
        <div className="text-sm font-medium text-gray-500">{label}</div>
        {streak >= 7 && (
          <div className={`mt-1 px-3 py-1 rounded-full text-xs font-semibold ${
            streak >= 100 ? 'bg-red-100 text-red-700' :
            streak >= 30  ? 'bg-orange-100 text-orange-700' :
                            'bg-amber-100 text-amber-700'
          }`}>
            {streak >= 100 ? '🏆 Legend' : streak >= 30 ? '🚀 On Fire' : '⚡ Building Momentum'}
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
      <span className={`text-2xl font-bold text-gray-900 ${pop ? 'number-pop' : ''}`}>
        {streak}
      </span>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}
