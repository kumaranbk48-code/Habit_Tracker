import { useState } from 'react';
import { BADGES, TIERS } from '../hooks/useGamification';
import { Lock, Award, Sparkles, CheckCircle2, Star, Flame, Trophy } from 'lucide-react';

const CATEGORY_ORDER = ['General', 'Daily', 'Weekly', 'Monthly'];
const CATEGORY_META = {
  General: { emoji: '⭐', label: 'General Achievements' },
  Daily:   { emoji: '☀️', label: 'Daily Mastery' },
  Weekly:  { emoji: '📅', label: 'Weekly Mastery' },
  Monthly: { emoji: '🗓️', label: 'Monthly Mastery' },
};
const CATEGORY_STREAK_KEY = { Daily: 'dailyStreak', Weekly: 'weeklyStreak', Monthly: 'monthlyStreak' };

function BadgeTile({ badge, unlocked, isNew }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tierColor = badge.tier === 'platinum' ? '#818cf8' : badge.tier === 'gold' ? '#f59e0b' : badge.tier === 'silver' ? '#94a3b8' : '#d97706';

  return (
    <div
      className="relative flex flex-col items-center text-center group cursor-pointer"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => setShowTooltip(!showTooltip)}
    >
      <div
        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl transition-all duration-300 group-hover:scale-105 relative ${
          unlocked
            ? 'bg-gradient-to-br from-white/[0.08] to-white/[0.02] border border-white/15 shadow-lg'
            : 'bg-white/[0.015] border border-white/[0.04] opacity-40 group-hover:opacity-60'
        }`}
        style={
          unlocked
            ? {
                boxShadow: `0 4px 20px ${tierColor}25`,
                borderColor: `${tierColor}50`,
              }
            : {}
        }
      >
        {unlocked ? (
          <span>{badge.emoji}</span>
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500">
            <Lock size={16} />
          </div>
        )}

        {/* Tier indicator pip */}
        {unlocked && (
          <span
            className="absolute bottom-1 right-1 w-2 h-2 rounded-full"
            style={{ backgroundColor: tierColor, boxShadow: `0 0 6px ${tierColor}` }}
          />
        )}
      </div>

      <span className={`text-[11px] font-bold mt-2 leading-tight max-w-[70px] truncate ${
        unlocked ? 'text-white group-hover:text-teal-300' : 'text-slate-500'
      }`}>
        {badge.name}
      </span>

      <span className="text-[10px] text-slate-500 font-medium capitalize">
        {badge.tier}
      </span>

      {/* Floating Hover Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full mb-2 z-50 w-48 p-3 rounded-2xl bg-[#0e1620] border border-white/15 shadow-2xl text-left pointer-events-none animate-fadeIn">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-base">{badge.emoji}</span>
            <span className="text-xs font-bold text-white">{badge.name}</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-snug">{badge.description}</p>
          <div className="mt-2 pt-1.5 border-t border-white/[0.06] flex items-center justify-between text-[10px]">
            <span className="font-semibold capitalize" style={{ color: tierColor }}>{badge.tier} Tier</span>
            <span className={unlocked ? 'text-teal-300 font-bold' : 'text-slate-500'}>
              {unlocked ? '✓ Unlocked' : '🔒 Locked'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BadgeGrid({ unlockedIds = [], newlyUnlocked = [], categoryStreaks = {} }) {
  const [selectedCat, setSelectedCat] = useState('All');
  const totalUnlocked = BADGES.filter(b => unlockedIds.includes(b.id)).length;
  const progressPct = Math.round((totalUnlocked / BADGES.length) * 100);

  const filteredCategories = selectedCat === 'All'
    ? CATEGORY_ORDER
    : CATEGORY_ORDER.filter(c => c === selectedCat);

  return (
    <div className="habiz-panel p-6 sm:p-7 rounded-3xl space-y-6">
      {/* Header and Progress Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0 shadow-md">
            <Trophy size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white tracking-tight">Achievements & Badges</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-950/70 text-teal-300 border border-teal-500/30">
                {progressPct}% Completed
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Unlock badges as your habit discipline, streaks, and milestones grow.
            </p>
          </div>
        </div>

        {/* Counter Pill */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="text-right">
            <div className="text-sm font-black text-white font-mono">
              {totalUnlocked} <span className="text-slate-500 text-xs font-normal">/ {BADGES.length}</span>
            </div>
            <div className="text-[10px] text-teal-400 font-semibold">Badges Earned</div>
          </div>
          <div className="w-24 sm:w-28 h-2 bg-slate-800 rounded-full overflow-hidden border border-white/[0.04]">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-[#2dd4bf] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {['All', ...CATEGORY_ORDER].map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCat(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              selectedCat === cat
                ? 'bg-[#153430] text-teal-300 border border-teal-500/35 shadow-xs'
                : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]'
            }`}
          >
            {cat === 'All' ? 'All Badges' : CATEGORY_META[cat]?.label || cat}
          </button>
        ))}
      </div>

      {/* Category Badges Grid */}
      <div className="space-y-7">
        {filteredCategories.map(cat => {
          const catBadges = BADGES.filter(b => (b.category || 'General') === cat);
          if (catBadges.length === 0) return null;

          const catUnlocked = catBadges.filter(b => unlockedIds.includes(b.id)).length;
          const meta = CATEGORY_META[cat];
          const streakKey = CATEGORY_STREAK_KEY[cat];
          const streakVal = streakKey ? (categoryStreaks[streakKey] || 0) : 0;

          return (
            <div key={cat} className="space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{meta.emoji}</span>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">{meta.label}</h3>
                  {streakVal > 0 && (
                    <span className="text-[10px] font-semibold text-amber-300 bg-amber-950/60 border border-amber-500/30 px-2 py-0.2 rounded-full">
                      🔥 {streakVal}d streak
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono font-semibold text-slate-400">
                  {catUnlocked} / {catBadges.length}
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 sm:gap-4 p-4 rounded-2xl bg-white/[0.015] border border-white/[0.04]">
                {catBadges.map(badge => (
                  <BadgeTile
                    key={badge.id}
                    badge={badge}
                    unlocked={unlockedIds.includes(badge.id)}
                    isNew={newlyUnlocked.includes(badge.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
