import { useState } from 'react';
import Modal from './Modal';
import { Award, Flame, Calendar, CheckCircle2, Sparkles, ArrowRight, X, Clock, Target, Trash2 } from 'lucide-react';

export default function SeasonReviewModal({
  isOpen,
  onClose,
  reviewData,
  onStartNextSeason,
  onDeleteSeason,
}) {
  if (!isOpen || !reviewData) return null;

  const {
    season,
    totalDurationDays = 0,
    daysElapsed = 0,
    daysCompleted = 0,
    bestStreak = 0,
    overallRate = 0,
    stuckCount = 0,
    habitStats = [],
    encouragingMessage = '',
  } = reviewData;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Season Reflection & Review" size="lg">
      <div className="space-y-6">
        {/* Banner Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#3d7a75] to-[#285350] p-6 text-white shadow-md">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-semibold backdrop-blur-xs mb-2">
                <Sparkles size={13} />
                <span>Term Completed</span>
              </div>
              <h2 className="text-2xl font-bold tracking-tight">{season?.name || 'Season Focus'}</h2>
              <p className="text-sm text-teal-100/90 mt-1 flex items-center gap-2">
                <Calendar size={14} />
                <span>{season?.start_date} → {season?.end_date}</span>
                <span>•</span>
                <span>{totalDurationDays} Days Total</span>
              </p>
            </div>

            <div className="flex items-center gap-4 bg-black/20 p-3.5 rounded-xl backdrop-blur-xs border border-white/10">
              <div className="text-center px-2">
                <p className="text-2xl font-black">{overallRate}%</p>
                <p className="text-[10px] text-teal-100/80 uppercase font-semibold">Consistency</p>
              </div>
              <div className="h-8 w-[1px] bg-white/20" />
              <div className="text-center px-2">
                <p className="text-2xl font-black">{bestStreak}d</p>
                <p className="text-[10px] text-teal-100/80 uppercase font-semibold">Best Streak</p>
              </div>
            </div>
          </div>
        </div>

        {/* Gentle Encouraging Summary Message */}
        <div className="bg-[#f0f6f5] dark:bg-[#182927] border border-[#3d7a75]/20 dark:border-[#3d7a75]/30 rounded-2xl p-4.5 flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-[#3d7a75]/15 dark:bg-[#3d7a75]/30 flex items-center justify-center flex-shrink-0 text-[#3d7a75] dark:text-[#7fd1b9]">
            <Award size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Chapter Insights</h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              {encouragingMessage}
            </p>
          </div>
        </div>

        {/* Metrics Overview Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-50 dark:bg-[#1c242c] p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Days With Progress</p>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1">
              {daysCompleted} <span className="text-xs font-normal text-slate-400">/ {daysElapsed}</span>
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-[#1c242c] p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Habits Formed</p>
            <p className="text-xl font-bold text-[#3d7a75] dark:text-[#7fd1b9] mt-1">
              {stuckCount} <span className="text-xs font-normal text-slate-400">/ {habitStats.length}</span>
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-[#1c242c] p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Streak Protected</p>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-1 flex items-center justify-center gap-1">
              <Flame size={16} />
              <span>{bestStreak} days</span>
            </p>
          </div>
        </div>

        {/* Habits Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Season Habits Performance
            </h3>
            <span className="text-xs text-slate-400">
              70%+ rate indicates habit formation
            </span>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {habitStats.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-[#1f2730] border border-slate-200/80 dark:border-slate-700/60 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: h.color || '#3d7a75' }}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {h.habit_name}
                      </span>
                      {h.stuck && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e3f3ee] text-[#2f6b5c] dark:bg-[#1c3a32] dark:text-[#7fd1b9]">
                          🌱 Stuck!
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-400">
                      {h.category} • {h.completions} of {h.expectedDays} days completed
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className={`text-sm font-extrabold ${h.rate >= 70 ? 'text-[#3d7a75] dark:text-[#7fd1b9]' : 'text-slate-700 dark:text-slate-300'}`}>
                    {h.rate}%
                  </span>
                  <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                    <div
                      className={`h-full rounded-full ${h.rate >= 70 ? 'bg-[#3d7a75]' : 'bg-slate-400'}`}
                      style={{ width: `${Math.min(100, h.rate)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}

            {habitStats.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-4 italic">
                No active habits were linked to this season.
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Close Review
            </button>
            {onDeleteSeason && season?.id && (
              <button
                type="button"
                onClick={() => {
                  const confirmed = window.confirm(
                    `Permanently delete review and record for "${season?.name || 'this season'}"?`
                  );
                  if (confirmed) {
                    onDeleteSeason(season.id);
                    onClose();
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                title="Delete this season record"
              >
                <Trash2 size={13} />
                <span>Delete Record</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              if (onStartNextSeason) onStartNextSeason(season, habitStats);
            }}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#3d7a75] hover:bg-[#2f5f5b] text-white shadow-md shadow-[#3d7a75]/20 transition-all active:scale-95 cursor-pointer"
          >
            <span>Start Next Season</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
