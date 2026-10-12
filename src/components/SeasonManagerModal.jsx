import { useState, useEffect } from 'react';
import Modal from './Modal';
import {
  Calendar, Check, Plus, Pause, Play, Award, Sparkles, AlertCircle,
  Clock, ArrowRight, History, CheckCircle2, Trash2, Edit3, ShieldCheck
} from 'lucide-react';

export default function SeasonManagerModal({
  isOpen,
  onClose,
  activeSeason,
  allHabits = [],
  session,
  onSeasonUpdated,
  onOpenReview,
  initialCreateData = null,
}) {
  const [tab, setTab] = useState('active'); // 'active' | 'create' | 'past'
  const [seasonsList, setSeasonsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Create/Edit Form State
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [selectedHabitIds, setSelectedHabitIds] = useState([]);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [editingSeasonId, setEditingSeasonId] = useState(null);
  const [selectedActiveSeasonId, setSelectedActiveSeasonId] = useState(null);

  const todayStr = new Date().toISOString().split('T')[0];

  // Helper to add days to a date string
  const addDaysToStr = (baseStr, days) => {
    const d = new Date(baseStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  // Fetch all seasons from server
  const fetchAllSeasons = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch('/api/seasons', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setSeasonsList(json.seasons || []);
      }
    } catch (err) {
      console.warn('Failed to fetch seasons:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAllSeasons();
    }
  }, [isOpen]);

  // Reset or pre-fill form
  useEffect(() => {
    if (initialCreateData) {
      setTab('create');
      setFormName(initialCreateData.name || '');
      setFormDesc(initialCreateData.description || '');
      const start = initialCreateData.start_date || todayStr;
      setFormStartDate(start);
      setFormEndDate(initialCreateData.end_date || addDaysToStr(start, 60));
      setSelectedHabitIds(initialCreateData.active_habit_ids || []);
      setIsEditingExisting(false);
      setEditingSeasonId(null);
    } else if (!activeSeason && seasonsList.filter(s => s.status === 'active').length === 0) {
      setTab('create');
      setFormName('');
      setFormDesc('');
      setFormStartDate(todayStr);
      setFormEndDate(addDaysToStr(todayStr, 60));
      setSelectedHabitIds(allHabits.map(h => h.id));
      setIsEditingExisting(false);
      setEditingSeasonId(null);
    } else {
      setTab('active');
    }
  }, [initialCreateData, activeSeason, allHabits, isOpen, seasonsList.length]);

  const handleToggleHabitSelection = (habitId) => {
    setSelectedHabitIds(prev =>
      prev.includes(habitId) ? prev.filter(id => id !== habitId) : [...prev, habitId]
    );
  };

  const handleSetDuration = (days) => {
    const base = formStartDate || todayStr;
    setFormEndDate(addDaysToStr(base, days));
  };

  // Create or Update Season submit
  const handleSaveSeason = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setErrorMsg('Please enter a season name');
      return;
    }
    if (!formStartDate || !formEndDate) {
      setErrorMsg('Please choose both start and end dates');
      return;
    }
    if (formStartDate > formEndDate) {
      setErrorMsg('Start date cannot be after end date');
      return;
    }
    if (!isEditingExisting && formEndDate < todayStr) {
      setErrorMsg('Season end date cannot be in the past');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      if (isEditingExisting && editingSeasonId) {
        // Edit season metadata
        const res = await fetch('/api/seasons', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'edit',
            id: editingSeasonId,
            name: formName,
            description: formDesc,
            start_date: formStartDate,
            end_date: formEndDate,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to update season');
        }

        // Also update active habits
        await fetch('/api/seasons', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'update_habits',
            id: editingSeasonId,
            active_habit_ids: selectedHabitIds,
          }),
        });
      } else {
        // Create new active season
        const res = await fetch('/api/seasons', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            name: formName,
            description: formDesc,
            start_date: formStartDate,
            end_date: formEndDate,
            active_habit_ids: selectedHabitIds,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to create season');
        }
      }

      await fetchAllSeasons();
      if (onSeasonUpdated) onSeasonUpdated();
      setTab('active');
      setIsEditingExisting(false);
      setEditingSeasonId(null);
    } catch (err) {
      setErrorMsg(err.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle single habit active/paused directly in active season
  const handleToggleHabitLive = async (habitId, currentStatus) => {
    if (!session) return;
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    setLoading(true);
    try {
      const res = await fetch('/api/seasons', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'toggle_habit',
          habit_id: habitId,
          status: newStatus,
        }),
      });

      if (res.ok) {
        if (onSeasonUpdated) onSeasonUpdated();
      }
    } catch (err) {
      console.warn('Failed to toggle habit status:', err);
    } finally {
      setLoading(false);
    }
  };

  // End active season (moves it to Past Seasons) and trigger review
  const handleEndSeason = async (targetSeason) => {
    const s = targetSeason || activeSeason || seasonsList.find(item => item.status === 'active');
    if (!session || !s) return;
    const confirmed = window.confirm(
      `Complete "${s.name}" and move it to Past Seasons?\n\nYou will see a full review of your progress and can launch your next season anytime.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch('/api/seasons', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'end_season',
          id: s.id,
        }),
      });

      if (res.ok) {
        await fetchAllSeasons();
        if (onSeasonUpdated) onSeasonUpdated();
        setTab('past');
        if (onOpenReview) {
          onOpenReview(s.id);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error || 'Failed to complete season');
      }
    } catch (err) {
      console.warn('Failed to end season:', err);
      setErrorMsg(err.message || 'Failed to end season');
    } finally {
      setLoading(false);
    }
  };

  // Permanently delete a season (both active or archived)
  const handleDeleteSeason = async (seasonId, seasonName) => {
    if (!session || !seasonId) return;
    const confirmed = window.confirm(
      `Permanently delete "${seasonName || 'this season'}"?\n\nThis will remove the season record. Any paused habits will be safely reactivated with zero penalty to your streaks.`
    );
    if (!confirmed) return;

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/seasons', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: seasonId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete season');
      }

      await fetchAllSeasons();
      if (onSeasonUpdated) onSeasonUpdated();

      if (activeSeason && activeSeason.id === seasonId) {
        setTab('create');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete season. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Reactivate an archived season
  const handleReactivateSeason = async (seasonId, seasonName) => {
    if (!session || !seasonId) return;
    const confirmed = window.confirm(
      `Set "${seasonName}" as your current active season?\n\nIts linked habits will be restored to your active daily routine.`
    );
    if (!confirmed) return;

    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/seasons', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'reactivate',
          id: seasonId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to reactivate season');
      }

      await fetchAllSeasons();
      if (onSeasonUpdated) onSeasonUpdated();
      setTab('active');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to reactivate season. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startEditMode = (s) => {
    const target = s || activeSeason || seasonsList.find(item => item.status === 'active');
    if (!target) return;
    setEditingSeasonId(target.id);
    setFormName(target.name);
    setFormDesc(target.description || '');
    setFormStartDate(target.start_date);
    setFormEndDate(target.end_date);
    const activeIds = target.activeHabitIds || target.active_habit_ids || allHabits.filter(h => h.status !== 'paused').map(h => h.id);
    setSelectedHabitIds(activeIds);
    setIsEditingExisting(true);
    setTab('create');
  };

  if (!isOpen) return null;

  const activeHabitsInSeason = allHabits.filter(h => h.status !== 'paused');
  const pausedHabits = allHabits.filter(h => h.status === 'paused');

  const activeSeasons = seasonsList.filter(s => s.status === 'active' && !s.isEndedByDate);
  const effectiveActiveSeasons = activeSeasons.length > 0
    ? activeSeasons
    : (activeSeason && activeSeason.status === 'active' && !activeSeason.isEndedByDate ? [activeSeason] : []);

  const pastSeasons = seasonsList.filter(s => s.status === 'ended' || s.isEndedByDate);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Season Management" size="lg">
      <div className="space-y-5">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-[#1a2129] rounded-xl border border-slate-200/60 dark:border-slate-800">
          <button
            onClick={() => { setTab('active'); setIsEditingExisting(false); setEditingSeasonId(null); }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'active'
                ? 'bg-white dark:bg-[#222b35] text-[#3d7a75] dark:text-[#7fd1b9] shadow-xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>Current Season</span>
            {effectiveActiveSeasons.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-teal-500/20 text-teal-700 dark:text-teal-300 font-bold">
                {effectiveActiveSeasons.length}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setTab('create');
              if (!isEditingExisting) {
                setFormName('');
                setFormDesc('');
                setFormStartDate(todayStr);
                setFormEndDate(addDaysToStr(todayStr, 60));
                setSelectedHabitIds(allHabits.filter(h => h.status !== 'paused').map(h => h.id));
                setEditingSeasonId(null);
              }
            }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tab === 'create'
                ? 'bg-white dark:bg-[#222b35] text-[#3d7a75] dark:text-[#7fd1b9] shadow-xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {isEditingExisting ? 'Edit Season' : '+ New Season'}
          </button>

          <button
            onClick={() => { setTab('past'); setIsEditingExisting(false); setEditingSeasonId(null); }}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              tab === 'past'
                ? 'bg-white dark:bg-[#222b35] text-[#3d7a75] dark:text-[#7fd1b9] shadow-xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <span>Past Seasons</span>
            {pastSeasons.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold">
                {pastSeasons.length}
              </span>
            )}
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ── TAB 1: CURRENT ACTIVE SEASONS VIEW ─────────────────────────────────────── */}
        {tab === 'active' && (
          <div className="space-y-4">
            {effectiveActiveSeasons.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-2xl bg-slate-50 dark:bg-[#161e26] border border-slate-200/60 dark:border-slate-800 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-teal-500/15 border border-teal-500/30 text-teal-400 flex items-center justify-center mx-auto shadow-sm">
                  <Calendar size={22} />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Active Seasons Running</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  Start a new season to commit to focus habits and protect streaks on non-active routines.
                </p>
                <button
                  type="button"
                  onClick={() => { setTab('create'); setIsEditingExisting(false); setEditingSeasonId(null); }}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#3d7a75] text-white hover:bg-[#2f5f5b] transition-all cursor-pointer shadow-md inline-flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  <span>Start New Season</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Active &amp; In-Progress Seasons ({effectiveActiveSeasons.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Ongoing terms displayed on your daily routine
                  </span>
                </div>

                {effectiveActiveSeasons.map((season) => {
                  const startD = new Date(season.start_date + 'T00:00:00');
                  const endD = new Date(season.end_date + 'T00:00:00');
                  const nowD = new Date(todayStr + 'T00:00:00');
                  const totalDays = season.totalDays || Math.max(1, Math.round((endD - startD) / (1000 * 60 * 60 * 24)) + 1);
                  const dayNumber = season.dayNumber || Math.max(1, Math.min(totalDays, Math.round((nowD - startD) / (1000 * 60 * 60 * 24)) + 1));
                  const progressPct = season.progressPct ?? Math.min(100, Math.round((dayNumber / totalDays) * 100));
                  const isReadyToComplete = todayStr >= season.end_date;

                  return (
                    <div
                      key={season.id}
                      className="p-5 rounded-2xl bg-gradient-to-r from-[#eaf4f2] to-[#e1efec] dark:from-[#182927] dark:to-[#142321] border border-[#3d7a75]/30 shadow-xs space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#3d7a75] text-white text-[10px] font-bold uppercase tracking-wider">
                              Active Season
                            </span>
                            {isReadyToComplete && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                                Concluded • Ready to Complete
                              </span>
                            )}
                          </div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                            {season.name}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {season.start_date} → {season.end_date} ({totalDays} Days)
                          </p>
                          {season.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic line-clamp-2">
                              &quot;{season.description}&quot;
                            </p>
                          )}
                        </div>

                        <div className="text-left sm:text-right flex-shrink-0">
                          <span className="text-base font-extrabold text-[#3d7a75] dark:text-[#7fd1b9]">
                            Day {dayNumber} <span className="text-xs font-normal text-slate-400">/ {totalDays}</span>
                          </span>
                          <div className="w-36 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1 sm:ml-auto">
                            <div
                              className="h-full bg-[#3d7a75] rounded-full transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Action buttons per season */}
                      <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[#3d7a75]/15">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEditMode(season)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a2129] text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Edit3 size={13} />
                            <span>Edit Dates &amp; Habits</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDeleteSeason(season.id, season.name)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors cursor-pointer"
                            title="Permanently remove this season"
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleEndSeason(season)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 text-xs font-bold transition-all shadow-sm cursor-pointer"
                          >
                            <Award size={13} />
                            <span>End Season &amp; Move to Past</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Habits Breakdown for Active Seasons */}
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Active Habits in Daily Routine ({activeHabitsInSeason.length})
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Appear on your daily dashboard
                    </span>
                  </div>

                  <div className="space-y-2">
                    {activeHabitsInSeason.map(h => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-[#1c242c] border border-slate-200/80 dark:border-slate-700/60 shadow-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: h.color || '#3d7a75' }}
                          />
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {h.habit_name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            ({h.category})
                          </span>
                        </div>

                        <button
                          onClick={() => handleToggleHabitLive(h.id, 'active')}
                          title="Pause habit for this season"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors cursor-pointer"
                        >
                          <Pause size={12} />
                          <span>Pause</span>
                        </button>
                      </div>
                    ))}

                    {activeHabitsInSeason.length === 0 && (
                      <p className="text-xs text-slate-400 italic py-2">
                        No active habits selected.
                      </p>
                    )}
                  </div>
                </div>

                {/* Paused Habits List */}
                {pausedHabits.length > 0 && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Paused Habits ({pausedHabits.length})
                      </h4>
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <ShieldCheck size={12} className="text-[#3d7a75]" />
                        <span>Streaks protected</span>
                      </span>
                    </div>

                    <div className="space-y-2">
                      {pausedHabits.map(h => (
                        <div
                          key={h.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-[#182028] border border-slate-200/50 dark:border-slate-800 opacity-80 hover:opacity-100 transition-opacity"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-600 flex-shrink-0" />
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 line-through">
                              {h.habit_name}
                            </span>
                          </div>

                          <button
                            onClick={() => handleToggleHabitLive(h.id, 'paused')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#3d7a75] dark:text-[#7fd1b9] hover:bg-[#e2f0ef] dark:hover:bg-[#14302e] transition-colors cursor-pointer"
                          >
                            <Play size={12} />
                            <span>Resume</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: CREATE / EDIT SEASON FORM ─────────────────────────────── */}
        {tab === 'create' && (
          <form onSubmit={handleSaveSeason} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Season Name *
              </label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. Q1 Exam Term, Spring Running Focus, Deep Coding Quarter"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1f2730] text-xs font-medium focus:ring-2 focus:ring-[#3d7a75] focus:outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Description / Term Intention (Optional)
              </label>
              <input
                type="text"
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="What is your main intention for this season?"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1f2730] text-xs font-medium focus:ring-2 focus:ring-[#3d7a75] focus:outline-hidden"
              />
            </div>

            {/* Date Range & Duration Pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={formStartDate}
                  onChange={e => setFormStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1f2730] text-xs font-medium focus:ring-2 focus:ring-[#3d7a75] focus:outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={formEndDate}
                  onChange={e => setFormEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1f2730] text-xs font-medium focus:ring-2 focus:ring-[#3d7a75] focus:outline-hidden"
                  required
                />
              </div>
            </div>

            {/* Quick duration presets */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[11px] text-slate-400 font-medium">Quick duration:</span>
              {[
                { label: '30 Days', days: 30 },
                { label: '60 Days', days: 60 },
                { label: 'Quarter (90d)', days: 90 },
              ].map(preset => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => handleSetDuration(preset.days)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                >
                  +{preset.label}
                </button>
              ))}
            </div>

            {/* Habit Selection Section */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Pick Active Habits for this Season
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Unselected habits will be paused with streaks 100% protected.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectedHabitIds(allHabits.map(h => h.id))}
                    className="text-[#3d7a75] dark:text-[#7fd1b9] font-medium hover:underline text-[11px]"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => setSelectedHabitIds([])}
                    className="text-slate-500 font-medium hover:underline text-[11px]"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {allHabits.map(habit => {
                  const isSelected = selectedHabitIds.includes(habit.id);
                  return (
                    <div
                      key={habit.id}
                      onClick={() => handleToggleHabitSelection(habit.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-[#eaf4f2] dark:bg-[#182927] border-[#3d7a75]/40 text-slate-900 dark:text-slate-100'
                          : 'bg-white dark:bg-[#1a2129] border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] font-bold ${
                            isSelected ? 'bg-[#3d7a75] text-white' : 'border border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelected && '✓'}
                        </div>
                        <span className="font-semibold">{habit.habit_name}</span>
                        <span className="text-[10px] text-slate-400">({habit.category})</span>
                      </div>

                      <span className="text-[10px] font-medium">
                        {isSelected ? 'Active' : 'Will be paused'}
                      </span>
                    </div>
                  );
                })}

                {allHabits.length === 0 && (
                  <p className="text-xs text-slate-400 py-3 italic text-center">
                    No habits created yet. You can create habits anytime from the Habits page.
                  </p>
                )}
              </div>
            </div>

            {/* Gentle Protection Callout */}
            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-2.5">
              <ShieldCheck size={16} className="text-emerald-600 flex-shrink-0" />
              <span>
                Zero penalty: Habits not in this season are shelved gently. Their streaks and history are kept intact until you resume them.
              </span>
            </div>

            {/* Submit button */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[#3d7a75] hover:bg-[#2f5f5b] text-white shadow-md shadow-[#3d7a75]/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {loading ? 'Saving...' : isEditingExisting ? 'Save Changes' : 'Launch Season'}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB 3: PAST SEASONS (COMPLETED SEASONS ONLY) ────────────────── */}
        {tab === 'past' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Completed &amp; Archived Seasons
              </h4>
              <span className="text-[11px] text-slate-400">
                {pastSeasons.length} completed
              </span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {pastSeasons.map(s => (
                <div
                  key={s.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-[#1c242c] border border-slate-200 dark:border-slate-700/60 shadow-xs hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {s.name}
                      </h5>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/25 uppercase tracking-wider">
                        Completed
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <Calendar size={12} />
                      <span>{s.start_date} → {s.end_date}</span>
                    </p>
                    {s.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1 italic">
                        &quot;{s.description}&quot;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleReactivateSeason(s.id, s.name)}
                      title="Set as your active season"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 dark:text-teal-300 dark:bg-teal-950/40 dark:hover:bg-teal-900/60 transition-colors cursor-pointer"
                    >
                      <Play size={11} className="fill-current" />
                      <span>Reactivate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (onOpenReview) onOpenReview(s.id);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#eaf4f2] text-[#3d7a75] dark:bg-[#14302e] dark:text-[#7fd1b9] hover:bg-[#d8ece9] dark:hover:bg-[#1a3d3a] transition-colors cursor-pointer"
                    >
                      <Award size={13} />
                      <span>View Review</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteSeason(s.id, s.name)}
                      title="Permanently delete this archived season"
                      className="inline-flex items-center justify-center p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}

              {pastSeasons.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs italic">
                  No completed seasons yet. Once a term finishes, its review and reflections will be archived here.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
