import { BADGES, TIERS } from '../hooks/useGamification';
import { Lock } from 'lucide-react';

const CATEGORY_ORDER = ['General', 'Daily', 'Weekly', 'Monthly'];
const CATEGORY_META = {
  General: { emoji: '⭐', label: 'General' },
  Daily:   { emoji: '☀️', label: 'Daily Mastery' },
  Weekly:  { emoji: '📅', label: 'Weekly Mastery' },
  Monthly: { emoji: '🗓️', label: 'Monthly Mastery' },
};
const CATEGORY_STREAK_KEY = { Daily: 'dailyStreak', Weekly: 'weeklyStreak', Monthly: 'monthlyStreak' };

function BadgeTile({ badge, unlocked, isNew }) {
  const tier = TIERS[badge.tier] || TIERS.bronze;
  return (
    <div
      className={`relative flex flex-col items-center gap-1 group ${isNew ? 'badge-pop' : ''}`}
      title={`${badge.name} — ${badge.description}`}
    >
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-transform group-hover:scale-110 ${
          unlocked ? (isNew ? 'glow-pulse' : 'shadow-sm') : ''
        }`}
        style={
          unlocked
            ? { backgroundColor: tier.bg, boxShadow: isNew ? undefined : `0 0 0 2px ${tier.ring}40` }
            : { backgroundColor: '#f3f4f6' }
        }
      >
        {unlocked ? badge.emoji : <Lock size={14} className="text-gray-400" />}
      </div>
      <span className={`text-[9px] font-medium text-center leading-tight max-w-[52px] truncate ${unlocked ? 'text-gray-600' : 'text-gray-400'}`}>
        {badge.name}
      </span>
      {isNew && (
        <span className="absolute -top-1 -right-1 bg-yellow-400 text-white text-[8px] font-bold px-1 py-0.5 rounded-full leading-none">
          NEW
        </span>
      )}
    </div>
  );
}

export default function BadgeGrid({ unlockedIds = [], newlyUnlocked = [], categoryStreaks = {} }) {
  const totalUnlocked = BADGES.filter(b => unlockedIds.includes(b.id)).length;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Achievements</h2>
        <span className="text-sm text-gray-400 font-medium">
          {totalUnlocked} / {BADGES.length}
        </span>
      </div>

      <div className="space-y-5">
        {CATEGORY_ORDER.map(cat => {
          const catBadges = BADGES.filter(b => (b.category || 'General') === cat);
          if (catBadges.length === 0) return null;

          const catUnlocked = catBadges.filter(b => unlockedIds.includes(b.id)).length;
          const meta        = CATEGORY_META[cat];
          const streakKey   = CATEGORY_STREAK_KEY[cat];
          const streakVal   = streakKey ? (categoryStreaks[streakKey] || 0) : 0;

          return (
            <div key={cat}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
                  <span>{meta.emoji}</span>
                  {meta.label}
                  {streakVal > 0 && (
                    <span className="text-[10px] font-normal text-orange-500">🔥 {streakVal}</span>
                  )}
                </p>
                <span className="text-[10px] text-gray-400 font-medium">{catUnlocked}/{catBadges.length}</span>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
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

      {totalUnlocked === 0 && (
        <p className="text-sm text-gray-400 text-center mt-4">
          Complete habits and reach streaks to unlock badges!
        </p>
      )}
    </div>
  );
}
