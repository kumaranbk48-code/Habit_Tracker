import { LEVELS, getLevelInfo } from '../hooks/useGamification';
import {
  Sparkles, Zap, Flame, Shield, Star, Award, Target, Trophy, Crown, Check
} from 'lucide-react';

function getTierIcon(level) {
  if (level <= 1) return Sparkles;
  if (level === 2) return Zap;
  if (level === 3) return Flame;
  if (level === 4) return Shield;
  if (level === 5) return Star;
  if (level === 6) return Award;
  if (level === 7) return Target;
  if (level === 8) return Trophy;
  return Crown; // Level 9-10
}

export default function XPLevelBar({ xp = 0, compact = false }) {
  const { current, next, xpIntoLevel, xpNeeded, progress } = getLevelInfo(xp);
  const TierIcon = getTierIcon(current.level);

  if (compact) {
    return (
      <div className="flex items-center gap-2.5">
        <span
          className="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white shadow-xs flex items-center gap-1.5 border border-white/10"
          style={{ backgroundColor: current.color || '#178274' }}
        >
          <TierIcon size={12} className="text-white drop-shadow-sm" />
          <span>Lv.{current.level}</span>
        </span>
        <div className="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden border border-white/[0.04]">
          <div
            className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-teal-500 to-[#2dd4bf]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[11px] text-slate-400 font-bold font-mono whitespace-nowrap">{xp} XP</span>
      </div>
    );
  }

  return (
    <div className="habiz-panel p-6 sm:p-7 rounded-3xl relative overflow-hidden space-y-5">
      {/* Ambient glow matching current tier color */}
      <div
        className="absolute -right-8 -top-8 w-44 h-44 pointer-events-none opacity-25 blur-3xl rounded-full"
        style={{ background: `radial-gradient(circle, ${current.color || '#178274'} 0%, transparent 70%)` }}
      />

      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-4">
          {/* Enhanced Tier Icon Badge */}
          <div className="relative flex-shrink-0 group">
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center border transition-transform duration-300 group-hover:scale-105"
              style={{
                background: `radial-gradient(circle at 30% 30%, ${current.color || '#178274'}30 0%, rgba(12, 19, 26, 0.95) 100%)`,
                borderColor: `${current.color || '#178274'}50`,
                boxShadow: `0 8px 24px -4px ${current.color || '#178274'}40, inset 0 1px 1px rgba(255,255,255,0.12)`,
              }}
            >
              <TierIcon
                size={28}
                className="transition-transform duration-300 group-hover:scale-110 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
                style={{ color: current.color || '#2dd4bf' }}
              />
            </div>
            {/* Sleek metallic level badge anchored on corner */}
            <span
              className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-md font-black text-[10px] font-mono tracking-wider border shadow-md flex items-center"
              style={{
                backgroundColor: '#0a1017',
                borderColor: `${current.color || '#178274'}70`,
                color: current.color || '#2dd4bf',
                boxShadow: `0 2px 6px rgba(0,0,0,0.7)`,
              }}
            >
              Lv.{current.level}
            </span>
          </div>

          <div>
            <h3 className="font-extrabold text-white text-base sm:text-lg tracking-tight leading-tight flex items-center gap-2">
              <span>{current.title}</span>
              <span className="text-[10px] font-bold text-teal-300 uppercase tracking-wider bg-teal-950/60 border border-teal-500/25 px-2.5 py-0.5 rounded-full">
                Tier {current.level}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Rank {current.level} of {LEVELS.length}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
            {xp.toLocaleString()}
          </p>
          <p className="text-[10px] font-bold text-teal-300/90 uppercase tracking-wider mt-0.5">
            Total XP Points
          </p>
        </div>
      </div>

      {/* Progress to next level */}
      {next ? (
        <div className="space-y-2.5 relative z-10 pt-1">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-400">
              <span className="text-white font-mono font-bold">{xpIntoLevel}</span>
              <span className="text-slate-500 font-mono"> / {xpNeeded} XP</span> to Level {next.level} ({next.title})
            </span>
            <span className="text-teal-300 font-mono font-bold bg-teal-950/60 border border-teal-500/30 px-2.5 py-0.5 rounded-md text-[11px]">
              {progress}%
            </span>
          </div>

          <div className="h-3 bg-slate-800/90 rounded-full overflow-hidden border border-white/[0.04]">
            <div
              className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-teal-500 via-[#2dd4bf] to-emerald-400 shadow-[0_0_12px_rgba(45,212,191,0.35)]"
              style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-2 text-center text-xs font-bold text-amber-300 bg-amber-950/40 border border-amber-500/30 py-2.5 rounded-xl">
          🏆 Maximum Mastery Level Achieved!
        </div>
      )}

      {/* Mini XP Breakdown / Gain Rules */}
      <div className="pt-3 border-t border-white/[0.05] grid grid-cols-3 gap-2.5 text-center text-xs relative z-10">
        <div className="p-2.5 sm:p-3 rounded-2xl bg-white/[0.025] border border-white/[0.04]">
          <span className="block font-black text-white font-mono text-sm text-teal-300">+10 XP</span>
          <span className="text-[10px] text-slate-400 font-medium mt-0.5">Per Habit</span>
        </div>
        <div className="p-2.5 sm:p-3 rounded-2xl bg-white/[0.025] border border-white/[0.04]">
          <span className="block font-black text-white font-mono text-sm text-amber-300">+2 XP</span>
          <span className="text-[10px] text-slate-400 font-medium mt-0.5">Streak Day</span>
        </div>
        <div className="p-2.5 sm:p-3 rounded-2xl bg-white/[0.025] border border-white/[0.04]">
          <span className="block font-black text-white font-mono text-sm text-teal-300">+100 XP</span>
          <span className="text-[10px] text-slate-400 font-medium mt-0.5">Goal Hit</span>
        </div>
      </div>
    </div>
  );
}
