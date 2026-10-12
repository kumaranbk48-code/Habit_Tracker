import { Calendar, Sparkles, ChevronRight, Play, Award, Shield } from 'lucide-react';

export default function SeasonBar({
  activeSeason,
  onOpenManager,
  onOpenReview,
  activeCount = 0,
  pausedCount = 0,
  totalSeasonsCount = 0,
  activeSeasonsCount = 0,
  pastSeasonsCount = 0,
}) {
  // If active season has ended by date
  if (activeSeason?.isEndedByDate) {
    return (
      <div
        onClick={() => onOpenReview ? onOpenReview(activeSeason.id) : onOpenManager()}
        className="w-full habiz-panel rounded-3xl p-4 sm:p-5 relative overflow-hidden border-amber-500/30 hover:border-amber-500/50 shadow-xl cursor-pointer transition-all group"
      >
        <div
          className="absolute -right-10 -top-10 w-48 h-48 pointer-events-none opacity-20 blur-3xl rounded-full"
          style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)' }}
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Award size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-white truncate">
                  &quot;{activeSeason.name}&quot; Completed! 🎉
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/70 text-amber-300 border border-amber-500/30">
                  Ready for Review
                </span>
                {totalSeasonsCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.04] text-slate-300 border border-white/[0.06]">
                    {totalSeasonsCount} {totalSeasonsCount === 1 ? 'Season' : 'Seasons'} Total
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                The term has concluded. Tap to see your consistency report and transition to your next chapter.
              </p>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenReview) onOpenReview(activeSeason.id);
              else onOpenManager();
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 text-xs font-bold shadow-md shadow-amber-950/40 transition-transform active:scale-95 flex-shrink-0 cursor-pointer self-start sm:self-auto"
          >
            <span>View Review &amp; Transition</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  // If there is an active ongoing season
  if (activeSeason) {
    const { name, dayNumber, totalDays, progressPct } = activeSeason;
    return (
      <div
        onClick={onOpenManager}
        className="w-full habiz-panel rounded-3xl p-4 sm:p-5 relative overflow-hidden border-teal-500/25 hover:border-teal-500/40 shadow-xl cursor-pointer transition-all group"
      >
        <div
          className="absolute -right-8 -bottom-8 w-40 h-40 pointer-events-none opacity-20 blur-3xl rounded-full"
          style={{ background: 'radial-gradient(circle, #178274 0%, transparent 70%)' }}
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-300 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Calendar size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300 bg-teal-950/70 border border-teal-500/30 px-2.5 py-0.5 rounded-full">
                  {activeSeasonsCount > 1 ? `${activeSeasonsCount} Active Seasons` : 'Active Season'}
                </span>
                <span className="text-sm font-bold text-white truncate">
                  {name}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.04] text-slate-300 border border-white/[0.06]">
                  {activeCount} Habits Active
                </span>
                {totalSeasonsCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.04] text-slate-300 border border-white/[0.06]">
                    {totalSeasonsCount} {totalSeasonsCount === 1 ? 'Season' : 'Seasons'} ({pastSeasonsCount} Completed)
                  </span>
                )}
                {pausedCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-500/30">
                    {pausedCount} Paused
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Tap anywhere to adjust active habits, pause items, or inspect seasons roadmap.
              </p>
            </div>
          </div>

          {/* Progress Day X of Y */}
          <div className="flex items-center gap-4 flex-shrink-0 self-start sm:self-auto sm:pl-3">
            <div className="text-left sm:text-right">
              <p className="text-xs font-bold text-white">
                Day {dayNumber} <span className="text-[11px] font-normal text-slate-400">/ {totalDays}</span>
              </p>
              <div className="w-32 sm:w-40 h-2 bg-slate-800/80 rounded-full overflow-hidden mt-1.5 border border-white/[0.04]">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-[#2dd4bf] rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(45,212,191,0.3)]"
                  style={{ width: `${progressPct || 0}%` }}
                />
              </div>
            </div>
            <div className="w-8 h-8 rounded-xl bg-white/[0.04] group-hover:bg-teal-500/20 text-slate-400 group-hover:text-teal-300 flex items-center justify-center transition-colors">
              <ChevronRight size={16} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If no season is currently active (Keep clean compact summary)
  return (
    <div
      onClick={onOpenManager}
      className="w-full habiz-panel rounded-3xl p-4 sm:p-5 relative overflow-hidden border-white/[0.06] hover:border-teal-500/35 shadow-xl cursor-pointer transition-all group"
    >
      <div
        className="absolute -right-8 -top-8 w-40 h-40 pointer-events-none opacity-15 blur-3xl rounded-full"
        style={{ background: 'radial-gradient(circle, #178274 0%, transparent 70%)' }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-teal-500/15 border border-teal-500/25 text-teal-300 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <span className="text-[11px] font-bold text-teal-300 uppercase tracking-wider bg-teal-950/60 border border-teal-500/25 px-2.5 py-0.5 rounded-full">
                Work in Seasons
              </span>
              <span className="text-xs font-bold text-white">Focus Chapters</span>
              {totalSeasonsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.04] text-slate-300 border border-white/[0.06]">
                  {totalSeasonsCount} {totalSeasonsCount === 1 ? 'Season' : 'Seasons'} ({pastSeasonsCount} Completed)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              Commit to 3–5 core habits for this chapter and pause the rest with zero streak penalty.
            </p>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenManager();
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#178274] hover:bg-[#136c60] text-white text-xs font-bold shadow-md shadow-teal-950/50 hover:shadow-teal-950/70 transition-all active:scale-95 flex-shrink-0 cursor-pointer self-start sm:self-auto"
        >
          <span>+ Start Season</span>
          <ChevronRight size={14} className="text-teal-200" />
        </button>
      </div>
    </div>
  );
}
