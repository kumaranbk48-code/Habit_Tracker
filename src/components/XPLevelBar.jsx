import { LEVELS, getLevelInfo } from '../hooks/useGamification';

export default function XPLevelBar({ xp = 0, compact = false }) {
  const { current, next, xpIntoLevel, xpNeeded, progress } = getLevelInfo(xp);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: current.color }}
        >
          Lv.{current.level}
        </span>
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, backgroundColor: current.color }}
          />
        </div>
        <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">{xp} XP</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-extrabold text-base shadow-sm"
            style={{ backgroundColor: current.color }}
          >
            {current.level}
          </div>
          <div>
            <p className="font-bold text-gray-900 leading-tight">{current.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">Level {current.level}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-extrabold text-gray-900">{xp.toLocaleString()}</p>
          <p className="text-xs text-gray-400">Total XP</p>
        </div>
      </div>

      {/* Progress to next level */}
      {next && (
        <>
          <div className="flex items-center justify-between mb-1.5 text-xs text-gray-500">
            <span>{xpIntoLevel} / {xpNeeded} XP to Level {next.level}</span>
            <span className="font-semibold" style={{ color: current.color }}>{progress}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, backgroundColor: current.color }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            Next: <span className="font-semibold text-gray-700" style={{ color: next.color }}>{next.title}</span>
          </p>
        </>
      )}

      {!next && (
        <div className="mt-2 text-center text-sm font-semibold text-yellow-600">
          🏆 Maximum Level Reached!
        </div>
      )}

      {/* Mini XP breakdown */}
      <div className="mt-4 pt-3 border-t border-gray-50 grid grid-cols-3 gap-2 text-center text-xs text-gray-500">
        <div><span className="block font-bold text-gray-800 text-sm">+10</span>per habit</div>
        <div><span className="block font-bold text-gray-800 text-sm">+50</span>perfect day</div>
        <div><span className="block font-bold text-gray-800 text-sm">+100</span>per goal</div>
      </div>
    </div>
  );
}
