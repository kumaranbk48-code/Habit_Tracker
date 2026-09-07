import { useEffect } from 'react';

const MILESTONES = {
  7:   { emoji: '⚡', title: '7-Day Streak!',   subtitle: 'One week of consistency. Keep it up!',        color: 'from-amber-400 to-orange-500' },
  14:  { emoji: '🚀', title: '2-Week Streak!',  subtitle: 'Two weeks strong. You\'re building a habit!', color: 'from-blue-500 to-indigo-600' },
  21:  { emoji: '💪', title: '21-Day Streak!',  subtitle: 'Science says habits form in 21 days. You did it!', color: 'from-violet-500 to-purple-600' },
  30:  { emoji: '🔥', title: '30-Day Streak!',  subtitle: 'One full month. You\'re unstoppable!',        color: 'from-orange-500 to-red-600' },
  60:  { emoji: '⭐', title: '60-Day Streak!',  subtitle: 'Two months of dedication. Incredible!',       color: 'from-yellow-400 to-amber-500' },
  100: { emoji: '👑', title: '100-Day Legend!', subtitle: 'You are in the top 1%. Absolute legend.',    color: 'from-pink-500 to-rose-600' },
  365: { emoji: '🏆', title: '365-Day Champion!', subtitle: 'A full year. You\'ve changed your life!',  color: 'from-emerald-500 to-teal-600' },
};

export default function MilestoneToast({ streak, onClose }) {
  const milestone = MILESTONES[streak];
  if (!milestone) return null;

  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] milestone-in cursor-pointer"
      onClick={onClose}
    >
      <div className={`flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl text-white bg-gradient-to-r ${milestone.color} min-w-72`}>
        <div className="text-4xl leading-none flex-shrink-0">{milestone.emoji}</div>
        <div>
          <div className="font-bold text-lg leading-tight">{milestone.title}</div>
          <div className="text-sm opacity-90 mt-0.5">{milestone.subtitle}</div>
        </div>
        <div className="ml-auto text-white/70 text-xs">Tap to close</div>
      </div>
    </div>
  );
}

// Helper — check if this streak value is a milestone
export function isMilestone(streak) {
  return streak in MILESTONES;
}
