import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ListChecks, CheckCircle2, Clock, Flame, Trophy, TrendingUp, AlertCircle, RefreshCw,
  Activity, Timer, Sparkles, Sun, Moon, Sunset, Plus, Check, Share2, Star, Zap,
  ChevronRight, ArrowRight, GraduationCap, Target, Award, Shield, Play, Pause, ShieldCheck
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import HabitHeatmap       from '../components/HabitHeatmap';
import StreakCounter      from '../components/StreakCounter';
import MilestoneToast, { isMilestone } from '../components/MilestoneToast';
import XPLevelBar          from '../components/XPLevelBar';
import BadgeGrid           from '../components/BadgeGrid';
import DailyQuoteCard      from '../components/DailyQuoteCard';
import ShareCard           from '../components/ShareCard';
import Modal                from '../components/Modal';
import FocusTimerModal     from '../components/FocusTimerModal';
import AIPromptModal       from '../components/AIPromptModal';
import Toast               from '../components/Toast';
import SeasonBar           from '../components/SeasonBar';
import SeasonManagerModal  from '../components/SeasonManagerModal';
import SeasonReviewModal   from '../components/SeasonReviewModal';
import PausedHabitsModal   from '../components/PausedHabitsModal';
import HabizLoader          from '../components/HabizLoader';
import { useConfetti } from '../hooks/useConfetti';
import { calculateXP, checkNewBadges, calculateCategoryStreaks } from '../hooks/useGamification';
import { calculateOverallHabitStrength, getStrengthBadge } from '../lib/habitStrength';
import { motion, AnimatePresence } from 'framer-motion';

const StatCard = ({ label, value, icon: Icon, colorClass, bgClass, children, onClick }) => (
  <motion.div
    whileHover={{ y: -3 }}
    transition={{ duration: 0.2 }}
    onClick={onClick}
    className={`bg-white dark:bg-[#1a2129] rounded-2xl p-5 shadow-sm border border-[#e2e8ec] dark:border-[#2a343d] transition-shadow duration-200 hover:shadow-md ${
      onClick ? 'cursor-pointer hover:border-[#3d7a75]/40' : ''
    }`}
  >
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgClass}`}>
        <Icon size={18} className={colorClass} />
      </div>
    </div>
    {children || <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{value}</p>}
    {onClick && <p className="text-[10px] text-[#3d7a75] dark:text-[#5fae9e] font-medium mt-1.5">Tap to view →</p>}
  </motion.div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-[#1a2129] border border-[#e2e8ec] dark:border-[#2a343d] rounded-xl shadow-lg px-3 py-2.5 text-sm">
      <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1">{label}</p>
      <p className="text-[#3d7a75] dark:text-[#5fae9e] font-semibold">{payload[0].value} completed</p>
    </div>
  );
};

export default function Dashboard() {
  const { session, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [stats,      setStats]      = useState(null);
  const [heatmap,    setHeatmap]    = useState({ data: {}, totalHabits: 0 });
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [milestone,  setMilestone]  = useState(null);
  const [unlockedIds,   setUnlockedIds]   = useState([]);
  const [newlyUnlocked, setNewlyUnlocked] = useState([]);
  const [badgesLoaded,  setBadgesLoaded]  = useState(false);
  const [categoryStreaks, setCategoryStreaks] = useState({ dailyStreak: 0, weeklyStreak: 0, monthlyStreak: 0 });

  // Phase 3: full lists
  const [habitsList,  setHabitsList]  = useState([]);
  const [allTracking, setAllTracking] = useState([]);
  const [goalsList,   setGoalsList]   = useState([]);
  const [milestonesList, setMilestonesList] = useState([]);
  const [listModal,   setListModal]   = useState(null);
  const [listModalTab, setListModalTab] = useState('all');
  
  // Phase 6 extensions: modals
  const [timerOpen, setTimerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Feature 3: Seasons & Paused habits state
  const [activeSeason, setActiveSeason] = useState(null);
  const [seasonsList, setSeasonsList] = useState([]);
  const [seasonManagerOpen, setSeasonManagerOpen] = useState(false);
  const [seasonReviewOpen, setSeasonReviewOpen] = useState(false);
  const [seasonReviewData, setSeasonReviewData] = useState(null);
  const [pausedHabitsOpen, setPausedHabitsOpen] = useState(false);
  const [prefilledSeasonData, setPrefilledSeasonData] = useState(null);

  const prevStreak = useRef(null);
  const { fireMilestone, firePerfectDay, fireSmall } = useConfetti();

  const displayName = user?.user_metadata?.full_name
    || user?.email?.split('@')[0] || 'User';

  const fetchAchievements = useCallback(async () => {
    if (!session) return [];
    try {
      const res = await fetch('/api/achievements', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return [];
      return (await res.json()).map(a => a.badge_id);
    } catch { return []; }
  }, [session]);

  const saveNewBadges = useCallback(async (ids) => {
    if (!session || !ids.length) return;
    try {
      await fetch('/api/achievements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ badge_ids: ids }),
      });
    } catch {}
  }, [session]);

  const fetchAll = useCallback(async () => {
    if (!session) return;
    setFetchError('');
    try {
      const [statsRes, heatmapRes, habitsRes, trackingRes, goalsRes, milestonesRes, seasonsRes, earned] = await Promise.all([
        fetch('/api/dashboard',  { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/heatmap',    { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/habits',     { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/tracking',   { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/goals',      { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/milestones', { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/seasons',    { headers: { Authorization: `Bearer ${session.access_token}` } }).catch(() => null),
        fetchAchievements(),
      ]);

      if (!statsRes.ok) {
        const e = await statsRes.json().catch(() => ({}));
        setFetchError(e.error || 'Failed to load dashboard data.');
        return;
      }

      const statsData    = await statsRes.json();
      const heatmapData  = heatmapRes.ok  ? await heatmapRes.json()  : { data: {}, totalHabits: 0 };
      // Fix: these four are supplementary (power the calendar, the clickable
      // stat cards, and the goals list) — if any fails, default to an empty
      // array rather than blocking the whole dashboard from loading.
      const habitsData     = habitsRes.ok     ? await habitsRes.json()     : [];
      const trackingData   = trackingRes.ok   ? await trackingRes.json()   : [];
      const goalsData      = goalsRes.ok      ? await goalsRes.json()      : [];
      const milestonesData = milestonesRes.ok ? await milestonesRes.json() : [];
      const seasonsData    = (seasonsRes && seasonsRes.ok) ? await seasonsRes.json() : null;

      setStats(statsData);
      setHeatmap(heatmapData);
      setHabitsList(Array.isArray(habitsData) ? habitsData : []);
      setAllTracking(Array.isArray(trackingData) ? trackingData : []);
      setGoalsList(Array.isArray(goalsData) ? goalsData : []);
      setMilestonesList(Array.isArray(milestonesData) ? milestonesData : []);
      setActiveSeason(seasonsData?.activeSeason || null);
      setSeasonsList(seasonsData?.seasons || []);

      // Phase 5: Daily/Weekly/Monthly mastery streaks, computed from the same
      // data already fetched above — no extra network calls needed.
      const streaks = calculateCategoryStreaks(
        Array.isArray(habitsData) ? habitsData : [],
        Array.isArray(trackingData) ? trackingData : []
      );
      setCategoryStreaks(streaks);

      const newBadges = checkNewBadges({ ...statsData, ...streaks }, earned);
      const allUnlocked = [...earned, ...newBadges];
      setUnlockedIds(allUnlocked);
      if (newBadges.length > 0) {
        setNewlyUnlocked(newBadges);
        await saveNewBadges(newBadges);
      }
      setBadgesLoaded(true);

      const streak = statsData.currentStreak ?? 0;
      prevStreak.current = streak;
    } catch (err) {
      console.error(err);
      setFetchError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [session, fetchAchievements, saveNewBadges]);

  useEffect(() => {
    if (session) fetchAll();
  }, [session, fetchAll]);

  useEffect(() => {
    let timer = null;
    const handleUpdate = (e) => {
      if (e?.detail?.source === 'dashboard') return;
      if (!session) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        fetchAll();
      }, 250);
    };
    window.addEventListener('habittracker-stats-updated', handleUpdate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('habittracker-stats-updated', handleUpdate);
    };
  }, [session, fetchAll]);

  const lastCelebrationRef = useRef(0);

  const toggleHabit = async (habit) => {
    const isDone = todayCompletedIds.has(habit.id);
    const newStatus = !isDone;

    // Snapshot previous state for rollback
    const prevTracking = [...allTracking];
    const prevStats = stats ? { ...stats } : null;

    // Optimistic local state update (0ms latency)
    const existing = allTracking.find(t => t.habit_id === habit.id && t.completion_date === today);
    let nextTracking;
    if (existing) {
      nextTracking = allTracking.map(t =>
        t.habit_id === habit.id && t.completion_date === today
          ? { ...t, status: newStatus, quantity_completed: newStatus ? (habit.target_quantity || 1) : 0 }
          : t
      );
    } else {
      nextTracking = [
        ...allTracking,
        {
          habit_id: habit.id,
          completion_date: today,
          status: newStatus,
          quantity_completed: newStatus ? (habit.target_quantity || 1) : 0,
        },
      ];
    }
    setAllTracking(nextTracking);

    // Optimistic stats update
    if (stats) {
      const delta = newStatus ? 1 : -1;
      const nextCompleted = Math.max(0, (stats.completedToday || 0) + delta);
      const total = stats.totalHabits || habitsList.length || 1;
      setStats({
        ...stats,
        completedToday: nextCompleted,
        currentStreak: newStatus ? Math.max(stats.currentStreak, 1) : stats.currentStreak,
        completionPercentage: Math.round((nextCompleted / total) * 100),
      });
    }

    if (newStatus) {
      const now = Date.now();
      if (now - lastCelebrationRef.current > 1500) {
        lastCelebrationRef.current = now;
        const currentDoneCount = todayCompletedIds.size;
        const totalHabitsCount = stats?.totalHabits || habitsList.length;
        if (totalHabitsCount > 0 && currentDoneCount + 1 >= totalHabitsCount) {
          firePerfectDay();
        } else {
          fireSmall();
        }
      }
    }
    
    const body = {
      habit_id: habit.id,
      completion_date: today,
      status: newStatus,
    };
    
    if (habit.tracking_type === 'quantity') {
      if (newStatus) {
        body.action = 'add';
        const currentQty = existing?.quantity_completed || 0;
        body.amount = Math.max(0, (habit.target_quantity || 1) - currentQty);
      } else {
        body.action = 'reset';
      }
    }
    
    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      
      if (res.ok) {
        const saved = await res.json().catch(() => null);
        if (saved && saved.habit_id) {
          setAllTracking(prev => {
            const has = prev.some(t => t.habit_id === saved.habit_id && t.completion_date === saved.completion_date);
            return has
              ? prev.map(t => (t.habit_id === saved.habit_id && t.completion_date === saved.completion_date ? { ...t, ...saved } : t))
              : [...prev, saved];
          });
        }
        window.dispatchEvent(new CustomEvent('habittracker-stats-updated', { detail: { source: 'dashboard' } }));
      } else {
        // Rollback on server error
        setAllTracking(prevTracking);
        setStats(prevStats);
      }
    } catch {
      // Rollback on network failure
      setAllTracking(prevTracking);
      setStats(prevStats);
    }
  };

  const handleCompleteFromTimer = async (habit, options = {}) => {
    const existing = allTracking.find(t => t.habit_id === habit.id && t.completion_date === today);
    if (existing?.status === true) {
      setToast({
        message: `"${habit.habit_name}" was already marked complete today!`,
        type: 'success',
      });
      return;
    }

    const previousState = existing ? { ...existing } : null;
    const isQuantity = habit.tracking_type === 'quantity';
    const targetQty = Number(habit.target_quantity) || 1;
    const oldQty = existing?.quantity_completed || 0;
    const newQty = isQuantity ? oldQty + targetQty : 1;

    // Optimistic update
    const updatedRecord = {
      habit_id: habit.id,
      completion_date: today,
      status: true,
      quantity_completed: newQty,
    };

    const nextTracking = existing
      ? allTracking.map(t => (t.habit_id === habit.id && t.completion_date === today ? { ...t, ...updatedRecord } : t))
      : [...allTracking, updatedRecord];

    setAllTracking(nextTracking);

    if (stats) {
      const nextCompleted = Math.min(stats.totalHabits || habitsList.length, (stats.completedToday || 0) + 1);
      const total = stats.totalHabits || habitsList.length || 1;
      setStats({
        ...stats,
        completedToday: nextCompleted,
        currentStreak: Math.max(stats.currentStreak, 1),
        completionPercentage: Math.round((nextCompleted / total) * 100),
      });
    }

    fireSmall();

    try {
      const res = await fetch('/api/tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          habit_id: habit.id,
          completion_date: today,
          status: true,
          completion_source: 'timer',
          action: isQuantity ? 'add' : undefined,
          amount: isQuantity ? targetQty : undefined,
        }),
      });

      if (res.ok) {
        window.dispatchEvent(new CustomEvent('habittracker-stats-updated', { detail: { source: 'dashboard' } }));
        setToast({
          message: `Auto-marked "${habit.habit_name}" as done!`,
          type: 'success',
          actionLabel: 'Undo',
          onAction: () => handleUndoHabit(habit, previousState),
        });
      }
    } catch (err) {
      console.warn('[Dashboard] Timer auto-complete error:', err);
    }
  };

  const handleUndoHabit = async (habit, previousState = null) => {
    const restoreStatus = previousState ? previousState.status : false;
    const restoreQty = previousState ? (previousState.quantity_completed || 0) : 0;

    setAllTracking(prev =>
      prev.map(t =>
        t.habit_id === habit.id && t.completion_date === today
          ? { ...t, status: restoreStatus, quantity_completed: restoreQty }
          : t
      )
    );

    if (stats) {
      const nextCompleted = Math.max(0, (stats.completedToday || 0) - 1);
      const total = stats.totalHabits || habitsList.length || 1;
      setStats({
        ...stats,
        completedToday: nextCompleted,
        completionPercentage: Math.round((nextCompleted / total) * 100),
      });
    }

    try {
      await fetch('/api/tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          habit_id: habit.id,
          completion_date: today,
          status: restoreStatus,
          action: habit.tracking_type === 'quantity' ? 'reset' : undefined,
          amount: 0,
        }),
      });
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated', { detail: { source: 'dashboard' } }));
      setToast({ message: `Reverted "${habit.habit_name}".`, type: 'info' });
    } catch (err) {
      console.warn('[Dashboard] Undo error:', err);
    }
  };

  const handleResumeHabit = async (habit) => {
    try {
      const res = await fetch('/api/seasons', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'toggle_habit',
          habit_id: habit.id,
          status: 'active',
        }),
      });
      if (res.ok) {
        setHabitsList(prev => prev.map(h => h.id === habit.id ? { ...h, status: 'active' } : h));
        setToast({ message: `Resumed "${habit.habit_name}".`, type: 'success' });
        window.dispatchEvent(new CustomEvent('habittracker-stats-updated', { detail: { source: 'dashboard' } }));
      }
    } catch {
      setToast({ message: 'Failed to resume habit.', type: 'error' });
    }
  };

  const handleResumeAllPaused = async () => {
    if (!pausedHabitsList.length || !session) return;
    try {
      await Promise.all(
        pausedHabitsList.map(h =>
          fetch('/api/seasons', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              action: 'toggle_habit',
              habit_id: h.id,
              status: 'active',
            }),
          })
        )
      );
      setHabitsList(prev => prev.map(h => ({ ...h, status: 'active' })));
      setToast({ message: `Resumed all ${pausedHabitsList.length} habits into daily routine!`, type: 'success' });
      window.dispatchEvent(new CustomEvent('habittracker-stats-updated', { detail: { source: 'dashboard' } }));
    } catch {
      setToast({ message: 'Failed to resume habits.', type: 'error' });
    }
  };

  const handleOpenSeasonReview = async (seasonId) => {
    const sId = seasonId || activeSeason?.id;
    if (!sId || !session) return;
    try {
      const res = await fetch(`/api/seasons?action=review&id=${sId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const reviewJson = await res.json();
        setSeasonReviewData(reviewJson);
        setSeasonReviewOpen(true);
      }
    } catch (err) {
      console.warn('Failed to load season review:', err);
    }
  };

  const handleStartNextSeason = (endedSeason, habitStats = []) => {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    const startStr = tom.toISOString().split('T')[0];
    const duration = endedSeason?.totalDurationDays || 60;
    const endD = new Date(tom);
    endD.setDate(endD.getDate() + duration);
    const endStr = endD.toISOString().split('T')[0];

    const carriedIds = habitStats.map(h => h.id);

    setPrefilledSeasonData({
      name: `Next Chapter (${new Date().toLocaleString('en-US', { month: 'short' })} Sprint)`,
      description: `Follow-up season to ${endedSeason?.name || 'previous term'}.`,
      start_date: startStr,
      end_date: endStr,
      active_habit_ids: carriedIds,
    });
    setSeasonReviewOpen(false);
    setSeasonManagerOpen(true);
  };

  const handleDeleteSeasonFromReview = async (seasonId) => {
    if (!session || !seasonId) return;
    try {
      const res = await fetch('/api/seasons', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ id: seasonId }),
      });
      if (res.ok) {
        setSeasonReviewOpen(false);
        fetchAll();
      }
    } catch (err) {
      console.warn('Failed to delete season from review:', err);
    }
  };

  if (loading) {
    return <HabizLoader size="lg" text="Loading dashboard..." />;
  }

  if (fetchError) {
    return (
      <div className="space-y-6 pt-6">
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Dashboard</h1>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-rose-950/30 border border-rose-900/50 rounded-2xl">
          <div className="flex items-center gap-3">
            <AlertCircle size={22} className="text-rose-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-rose-200 text-sm">Unable to load dashboard data</p>
              <p className="text-xs text-rose-400/90 mt-0.5">{fetchError}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <button
              onClick={() => { setLoading(true); fetchAll(); }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <RefreshCw size={13} /> Retry
            </button>
            <button
              onClick={async () => { await signOut?.(); navigate('/login', { replace: true }); }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm cursor-pointer"
            >
              Sign Out & Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  const xp = calculateXP(stats);
  const completionRate = stats?.totalHabits > 0
    ? Math.round((stats.completedToday / stats.totalHabits) * 100) : 0;
  const isPerfectDay = stats?.totalHabits > 0 && stats.completedToday === stats.totalHabits;
  const chartData = (stats?.weeklyData || []).map(d => {
    let name = 'Day';
    try {
      if (d?.date) {
        name = new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
      }
    } catch {}
    return {
      name,
      completed: Number(d?.completed) || 0,
    };
  });
  const goalProgress = stats?.goalProgress ?? 0;
  const circ = 2 * Math.PI * 52;
  const dash = (goalProgress / 100) * circ;

  // Season Chapter progress computation (matching Goal Progress gauge)
  const calculateSeasonProgress = () => {
    if (!activeSeason?.start_date || !activeSeason?.end_date) return 0;
    const start = new Date(activeSeason.start_date).getTime();
    const end = new Date(activeSeason.end_date).getTime();
    const now = Date.now();
    if (now <= start) return 0;
    if (now >= end) return 100;
    const total = end - start;
    if (total <= 0) return 100;
    return Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100)));
  };
  const seasonProgress = calculateSeasonProgress();
  const seasonCirc = 2 * Math.PI * 52;
  const seasonDash = (seasonProgress / 100) * seasonCirc;

  const getSeasonDaysLeft = () => {
    if (!activeSeason?.end_date) return null;
    const end = new Date(activeSeason.end_date).getTime();
    const now = Date.now();
    return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  };
  const seasonDaysLeft = getSeasonDaysLeft();

  // Phase 3 & Feature 3: Active vs Paused habits
  const activeSeasonHabitIds = activeSeason?.activeHabitIds || activeSeason?.active_habit_ids || null;
  const activeSeasonSet = (activeSeasonHabitIds && activeSeasonHabitIds.length > 0)
    ? new Set(activeSeasonHabitIds)
    : null;

  const activeHabitsList = habitsList.filter(h => {
    if (h.status === 'paused') return false;
    if (activeSeasonSet) return activeSeasonSet.has(h.id);
    return true;
  });

  const pausedHabitsList = habitsList.filter(h => {
    if (h.status === 'paused') return true;
    if (activeSeasonSet) return !activeSeasonSet.has(h.id);
    return false;
  });

  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const todayCompletedIds = new Set(
    allTracking.filter(t => t.completion_date === today && t.status === true).map(t => t.habit_id)
  );
  const completedHabitsToday = activeHabitsList.filter(h => todayCompletedIds.has(h.id));
  const pendingHabitsToday   = activeHabitsList.filter(h => !todayCompletedIds.has(h.id));

  // Phase 4: group milestones by goal so each row in the goal list can show
  // its own roadmap progress (e.g. "2/4 milestones").
  const milestonesByGoal = {};
  for (const m of milestonesList) {
    if (!milestonesByGoal[m.goal_id]) milestonesByGoal[m.goal_id] = [];
    milestonesByGoal[m.goal_id].push(m);
  }

  // Habit strength index calculation
  const overallStrength = calculateOverallHabitStrength(activeHabitsList.length > 0 ? activeHabitsList : habitsList, allTracking);
  const strengthBadge = getStrengthBadge(overallStrength);


  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const nextMilestone = (stats?.currentStreak || 0) < 3 ? 3 : (stats?.currentStreak || 0) < 7 ? 7 : (stats?.currentStreak || 0) < 14 ? 14 : (stats?.currentStreak || 0) < 30 ? 30 : 60;

  return (
    <div className="space-y-6 page-enter">
      {milestone && <MilestoneToast streak={milestone} onClose={() => setMilestone(null)} />}

      {/* ── 1. Editorial Atmospheric Hero Banner matching reference image ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#0b131a] via-[#0e1924] to-[#12222d] border border-white/[0.06] p-6 sm:p-8 shadow-2xl">
        {/* Scenic mountain twilight landscape illustration on right */}
        <div
          className="absolute right-0 top-0 bottom-0 w-full sm:w-3/5 opacity-40 sm:opacity-60 pointer-events-none bg-cover bg-right mix-blend-screen"
          style={{
            backgroundImage: 'url(/assets/hero-landscape.jpg)',
            maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.6) 40%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.6) 40%, black 100%)',
          }}
        />

        <div className="relative z-10 max-w-xl">
          {/* Top Tag & Quick Status */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-[11px] font-semibold tracking-wider text-teal-300 uppercase bg-teal-950/70 border border-teal-500/20 px-3 py-1 rounded-full backdrop-blur-md">
              Better than yesterday
            </span>
            {isPerfectDay && (
              <span className="text-xs font-bold text-amber-300 bg-amber-950/70 border border-amber-500/30 px-3 py-1 rounded-full animate-pulse">
                🎉 Perfect Day!
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-tight">
            {greeting}, {displayName} 🌱
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 font-normal leading-relaxed">
            Small steps today, a stronger you tomorrow.
          </p>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2.5 mt-5 flex-wrap">
            <button
              onClick={() => setTimerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.08] rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <Timer size={14} className="text-teal-400" /> Focus Timer
            </button>
            <button
              onClick={() => setAiOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.08] rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <Sparkles size={14} className="text-teal-400" /> AI Coach
            </button>
            <button
              onClick={() => setStreakOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.08] rounded-xl text-xs font-semibold transition-all cursor-pointer"
            >
              <Share2 size={14} className="text-amber-400" /> Share Streak
            </button>
          </div>
        </div>

        {/* Hero Integrated Quick Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-8 pt-6 border-t border-white/[0.06] relative z-10">
          {/* 1. Today's Habits Completion Ring */}
          <motion.div
            whileHover={{ y: -2 }}
            transition={{ duration: 0.15 }}
            onClick={() => { setListModalTab('all'); setListModal(true); }}
            className="flex items-center gap-3.5 p-3 rounded-2xl bg-black/35 border border-white/[0.05] cursor-pointer hover:border-teal-500/40 transition-colors group"
          >
            <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="18" stroke="rgba(255,255,255,0.08)" strokeWidth="4" fill="none" />
                <circle
                  cx="22"
                  cy="22"
                  r="18"
                  stroke="#1bb59c"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${Math.round(((completedHabitsToday.length / (activeHabitsList.length || 1))) * 113) || 0} 113`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-[11px] font-bold text-white">
                {completedHabitsToday.length}/{activeHabitsList.length || 0}
              </span>
            </div>
            <div>
              <div className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors">Today's Habits</div>
              <div className="text-[10px] text-slate-400 font-medium">Completed</div>
            </div>
          </motion.div>

          {/* 2. Current Streak */}
          <motion.div
            whileHover={{ y: -2 }}
            transition={{ duration: 0.15 }}
            onClick={() => setStreakOpen(true)}
            className="flex items-center gap-3.5 p-3 rounded-2xl bg-black/35 border border-white/[0.05] cursor-pointer hover:border-amber-500/40 transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-xl flex-shrink-0">
              🔥
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-1 group-hover:text-amber-300 transition-colors">
                <span>{stats?.currentStreak || 0}</span>
                <span className="text-[10px] text-amber-300 font-semibold">Day Streak</span>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">Keep it going</div>
            </div>
          </motion.div>

          {/* 3. XP Points */}
          <motion.div
            whileHover={{ y: -2 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-3.5 p-3 rounded-2xl bg-black/35 border border-white/[0.05] cursor-default"
          >
            <div className="w-12 h-12 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center text-teal-400 flex-shrink-0">
              <Star size={20} className="fill-teal-400/40" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">{xp}</div>
              <div className="text-[10px] text-slate-400 font-medium">XP Points • Growing</div>
            </div>
          </motion.div>

          {/* 4. Habit Strength */}
          <motion.div
            whileHover={{ y: -2 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-3.5 p-3 rounded-2xl bg-black/35 border border-white/[0.05] cursor-default"
          >
            <div className="w-12 h-12 rounded-xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 flex-shrink-0">
              <Zap size={20} className="fill-sky-400/40" />
            </div>
            <div>
              <div className="text-sm font-bold text-white">{(overallStrength / 100).toFixed(1)}</div>
              <div className="text-[10px] text-slate-400 font-medium">Habit Strength • {strengthBadge.label}</div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Paused by Season Section (Sleek Full-Width Banner when habits are shelved) ── */}
      {pausedHabitsList.length > 0 && (
        <div className="habiz-panel p-4 sm:p-5 rounded-3xl border-amber-500/20 bg-gradient-to-r from-[#0f1721] via-[#111922] to-[#0a1117] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center flex-shrink-0 shadow-sm">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-white">Paused by Season</h3>
                <span className="text-[10px] font-bold text-amber-300 bg-amber-950/70 border border-amber-500/35 px-2 py-0.5 rounded-full">
                  {pausedHabitsList.length} Shelved
                </span>
                <span className="text-[10px] font-medium text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  🛡️ Streaks 100% Protected
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Temporarily shelved for {activeSeason ? `"${activeSeason.name}"` : 'your current focus'}. Paused days never break your streak momentum.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
            <button
              type="button"
              onClick={() => setPausedHabitsOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            >
              <span>View Shelved ({pausedHabitsList.length})</span>
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              onClick={handleResumeAllPaused}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-bold transition-all cursor-pointer"
            >
              <Play size={12} className="fill-current" />
              <span>Resume All</span>
            </button>
          </div>
        </div>
      )}

      {/* ── 2. Two-Column Layout (Harmonious & Perfectly Balanced) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ── LEFT COLUMN ── */}
        <div className="space-y-6">
          {/* Season Focus Card (Converted from top bar to match Goal Progress Card) */}
          <div className="habiz-panel p-6 sm:p-7 rounded-3xl space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">Season Focus</h3>
                {activeSeason ? (
                  <span className="text-[10px] font-bold text-teal-300 bg-teal-950/60 border border-teal-500/25 px-2 py-0.5 rounded-full">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-slate-400 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-full">
                    Off-Season
                  </span>
                )}
              </div>
              <button
                onClick={() => setSeasonManagerOpen(true)}
                className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>{activeSeason ? 'Manage' : '+ Start Season'}</span>
                <ArrowRight size={13} />
              </button>
            </div>

            <div className="flex items-center gap-5 py-1">
              <div className="relative w-22 h-22 flex-shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,0.06)" strokeWidth="10" fill="none" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    stroke={activeSeason ? "#1bb59c" : "#64748b"}
                    strokeWidth="10"
                    fill="none"
                    strokeDasharray={`${activeSeason ? seasonDash : 0} ${seasonCirc}`}
                    strokeLinecap="round"
                    className="ring-progress"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-white font-mono">{activeSeason ? `${seasonProgress}%` : '0%'}</span>
                </div>
              </div>

              <div className="space-y-1.5 min-w-0">
                {activeSeason ? (
                  <>
                    <div className="text-xs text-slate-400 truncate">
                      Focus: <span className="text-white font-bold ml-1">{activeSeason.name}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Active: <span className="text-teal-400 font-bold ml-1">{activeHabitsList.length}</span>
                      {pausedHabitsList.length > 0 && (
                        <span className="text-slate-400 ml-2">
                          • Shelved: <span className="text-amber-400 font-bold ml-0.5">{pausedHabitsList.length}</span>
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {seasonDaysLeft !== null ? `${seasonDaysLeft} days remaining in this chapter` : 'Sprint active'}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-slate-400">
                      Total Seasons: <span className="text-white font-bold ml-1">{seasonsList.length}</span>
                    </div>
                    <div className="text-xs text-slate-400">
                      Active Habits: <span className="text-teal-400 font-bold ml-1">{activeHabitsList.length}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Commit to 3–5 core habits with zero streak penalty
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2 pt-3.5 border-t border-white/[0.05]">
              {activeSeason && activeHabitsList.length > 0 ? (
                activeHabitsList.slice(0, 3).map(h => (
                  <div key={h.id} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03]">
                    <span className="text-slate-300 truncate max-w-[170px] font-medium">{h.habit_name}</span>
                    <span className="text-teal-400 font-semibold px-2 py-0.5 rounded-md bg-teal-950/60 border border-teal-500/20 text-[10px]">
                      {h.category}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03]">
                  <span className="text-slate-400 font-medium">
                    {activeSeason ? 'No habits assigned to season' : 'No active focus chapter'}
                  </span>
                  <button
                    onClick={() => setSeasonManagerOpen(true)}
                    className="text-teal-400 font-semibold text-[11px] hover:underline cursor-pointer"
                  >
                    {activeSeason ? 'Assign Habits' : '+ Start Now'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Your Progress Section */}
          <div className="habiz-panel p-5 sm:p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Your Progress</h3>
              <button
                onClick={() => navigate('/reports')}
                className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>View Reports</span>
                <ArrowRight size={13} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                onClick={() => navigate('/habits')}
                className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:border-teal-500/30 transition-all cursor-pointer group"
              >
                <div className="text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors">Today's Habits</div>
                <div className="text-xl font-extrabold text-white mt-1">
                  {completedHabitsToday.length}/{activeHabitsList.length || 0}
                </div>
                <div className="text-[10px] text-teal-400 font-semibold mt-0.5 flex items-center gap-1">
                  <span>Completed</span>
                  <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>

              <div
                onClick={() => navigate('/reports')}
                className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:border-teal-500/30 transition-all cursor-pointer group"
              >
                <div className="text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors">Weekly Completion</div>
                <div className="text-xl font-extrabold text-white mt-1">
                  {completionRate}% <span className="text-xs text-teal-400 font-normal">↑ 12%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-teal-400 h-full rounded-full transition-all duration-500" style={{ width: `${completionRate}%` }} />
                </div>
              </div>

              <div
                onClick={() => setStreakOpen(true)}
                className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:border-amber-500/30 transition-all cursor-pointer group"
              >
                <div className="text-[11px] text-slate-400 group-hover:text-slate-300 transition-colors">Current Streak</div>
                <div className="text-xl font-extrabold text-white mt-1 flex items-center gap-1">
                  {stats?.currentStreak || 0} <span className="text-xs text-amber-400 font-normal">day 🔥</span>
                </div>
                <div className="text-[10px] text-amber-300 font-semibold mt-0.5 flex items-center gap-1">
                  <span>Keep going</span>
                  <ArrowRight size={11} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            </div>
          </div>

          {/* Weekly Performance Bar Chart */}
          <div className="habiz-panel p-5 sm:p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm sm:text-base font-bold text-white">Weekly Performance</h4>
              <span className="text-xs text-slate-400 font-medium">Last 7 days</span>
            </div>
            {chartData.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barSize={28}>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#718292' }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#718292' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)', radius: 6 }} />
                    <Bar dataKey="completed" radius={[6, 6, 0, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill="#1bb59c" fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500 text-xs">
                No data yet — start completing habits!
              </div>
            )}
          </div>

          {/* Consistency Streak Card with glowing amber wave */}
          <div className="habiz-panel p-5 sm:p-6 rounded-3xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <span>{stats?.currentStreak || 1} day</span>
                  <span className="text-xs sm:text-sm font-normal text-slate-400">Consistency streak</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">You're on a roll. Keep going.</p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-amber-300 bg-amber-950/70 border border-amber-500/30 px-3 py-1 rounded-full">
                  Next milestone: {nextMilestone} days
                </span>
              </div>
            </div>

            {/* Glowing amber wavy spline with milestone dots */}
            <div className="relative h-14 w-full flex items-center">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 40">
                <defs>
                  <linearGradient id="streakGlow" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#d97706" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#f59e0b" stopOpacity="1" />
                    <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
                <path
                  d="M 10 25 Q 110 5, 210 22 T 390 14"
                  fill="none"
                  stroke="url(#streakGlow)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <circle cx="210" cy="22" r="5" fill="#f59e0b" className="filter drop-shadow(0 0 6px #f59e0b)" />
                <circle cx="390" cy="14" r="5" fill="#2dd4bf" className="filter drop-shadow(0 0 6px #2dd4bf)" />
              </svg>
            </div>
          </div>

          {/* Daily Motivation Quote */}
          <DailyQuoteCard />
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="space-y-6">
          {/* Goal Progress Card */}
          <div className="habiz-panel p-6 sm:p-7 rounded-3xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-white">Goal Progress</h3>
              <button
                onClick={() => navigate('/goals')}
                className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight size={13} />
              </button>
            </div>
            <div className="flex items-center gap-5 py-1">
              <div className="relative w-22 h-22 flex-shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,0.06)" strokeWidth="10" fill="none" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    stroke="#1bb59c"
                    strokeWidth="10"
                    fill="none"
                    strokeDasharray={`${dash} ${circ}`}
                    strokeLinecap="round"
                    className="ring-progress"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-white font-mono">{goalProgress}%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="text-xs text-slate-400">Active Goals: <span className="text-white font-bold ml-1">{stats?.totalGoals ?? 0}</span></div>
                <div className="text-xs text-slate-400">Completed: <span className="text-teal-400 font-bold ml-1">{stats?.completedGoals ?? 0}</span></div>
                <div className="text-[11px] text-slate-500">
                  {stats?.totalGoals ? `${Math.round(((stats?.completedGoals ?? 0) / stats.totalGoals) * 100)}% overall completion` : 'Track your quarterly targets'}
                </div>
              </div>
            </div>

            {goalsList.length > 0 && (
              <div className="space-y-2 pt-3.5 border-t border-white/[0.05]">
                {goalsList.slice(0, 3).map(g => (
                  <div key={g.id} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-white/[0.02] border border-white/[0.03]">
                    <span className="text-slate-300 truncate max-w-[170px] font-medium">{g.goal_name}</span>
                    <span className="text-teal-400 font-semibold px-2 py-0.5 rounded-md bg-teal-950/60 border border-teal-500/20 text-[10px]">
                      {g.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Achievements Card */}
          <div className="habiz-panel p-5 sm:p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Achievements</h3>
              <button
                onClick={() => navigate('/profile')}
                className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>View All</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* Achievements Grid matching reference */}
            <div className="grid grid-cols-3 gap-2.5">
              {[
                { name: 'First Step', sub: 'Completed', icon: Star, color: 'text-amber-400', unlocked: true },
                { name: 'Goal Getter', sub: '2/5', icon: Target, color: 'text-teal-400', unlocked: true },
                { name: 'Habit Pro', sub: '1/10', icon: Flame, color: 'text-amber-400', unlocked: true },
                { name: 'Week Warrior', sub: '0/4', icon: Award, color: 'text-slate-400', unlocked: false },
                { name: 'Monthly Master', sub: '0/2', icon: Trophy, color: 'text-slate-400', unlocked: false },
                { name: 'More to unlock', sub: '+', icon: Plus, color: 'text-slate-400', unlocked: false },
              ].map((ach, idx) => {
                const AchIcon = ach.icon;
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl flex flex-col items-center text-center justify-center border transition-all ${
                      ach.unlocked
                        ? 'bg-white/[0.04] border-white/[0.08]'
                        : 'bg-white/[0.015] border-white/[0.04] opacity-60'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1.5 ${
                      ach.unlocked ? 'bg-teal-500/15 text-teal-300' : 'bg-white/[0.05] text-slate-500'
                    }`}>
                      <AchIcon size={16} className={ach.color} />
                    </div>
                    <span className="text-[11px] font-bold text-slate-200 truncate w-full">{ach.name}</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">{ach.sub}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Level Progress Card */}
          <XPLevelBar xp={xp} />

          {/* Scenic Motivation Card matching reference */}
          <div
            onClick={() => navigate('/learning')}
            className="relative overflow-hidden rounded-3xl p-7 sm:p-8 border border-white/[0.06] shadow-xl cursor-pointer group transition-all flex flex-col justify-between"
            style={{
              backgroundImage: 'url(/assets/nature-card.jpg)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              minHeight: '280px',
            }}
          >
            {/* Dark gradient overlay for text readability */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#080d12] via-[#080d12]/65 to-transparent" />

            <div className="relative z-10">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[11px] font-bold text-teal-300">
                ✦ Systems Over Goals
              </span>
            </div>

            <div className="relative z-10 flex flex-col justify-end pt-8">
              <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight">
                Discipline<br />
                freedom<br />
                tomorrow.
              </h3>
              <p className="text-xs text-slate-300/80 mt-2 max-w-xs">
                Small consistent habits compound into lifelong mastery.
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs font-bold text-teal-300 group-hover:text-teal-200 transition-colors w-fit px-3.5 py-2 rounded-xl bg-teal-950/70 border border-teal-500/30 backdrop-blur-md">
                <span>Explore Learning Hub</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Heatmap */}
      <HabitHeatmap data={heatmap.data} totalHabits={heatmap.totalHabits || habitsList.length || 0} />

      {/* Completed / Pending list modal (from clicking a stat card) */}
      <Modal
        open={!!listModal}
        onClose={() => setListModal(null)}
        title="Today's Habits"
      >
        <div className="space-y-3">
          {/* Filter tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-white/[0.03] border border-white/[0.05] rounded-xl">
            {[
              { id: 'all', label: 'All Habits', count: activeHabitsList.length },
              { id: 'pending', label: 'Pending', count: pendingHabitsToday.length },
              { id: 'completed', label: 'Completed', count: completedHabitsToday.length },
            ].map(tab => {
              const active = (listModalTab || 'all') === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setListModalTab(tab.id)}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    active ? 'bg-teal-500/30 text-teal-200' : 'bg-white/[0.06] text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {((listModalTab === 'completed'
              ? completedHabitsToday
              : listModalTab === 'pending'
              ? pendingHabitsToday
              : activeHabitsList)
            ).map((h) => {
              const isDone = todayCompletedIds.has(h.id);
              return (
                <button
                  key={h.id}
                  onClick={() => toggleHabit(h)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 cursor-pointer text-left ${
                    isDone
                      ? 'bg-teal-950/20 hover:bg-teal-950/30 border-teal-500/25'
                      : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/[0.06]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0 text-xs font-bold transition-colors ${
                      isDone
                        ? 'bg-[#178274] border-teal-500 text-white shadow-[0_0_8px_rgba(23,130,116,0.4)]'
                        : 'border-white/20 text-transparent hover:border-teal-400'
                    }`}>
                      ✓
                    </div>
                    <span className={`text-xs sm:text-sm font-semibold truncate ${isDone ? 'text-teal-300 line-through opacity-80' : 'text-white'}`}>
                      {h.habit_name}
                      {h.tracking_type === 'quantity' && (
                        <span className="text-[11px] text-slate-400 block mt-0.5 no-underline">
                          Progress: {allTracking.find(t => t.habit_id === h.id && t.completion_date === today)?.quantity_completed || 0} / {h.target_quantity} {h.unit}
                        </span>
                      )}
                    </span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ml-2 ${
                    isDone
                      ? 'bg-teal-500/15 text-teal-300 border border-teal-500/25'
                      : 'bg-white/[0.04] text-slate-400 border border-white/[0.08]'
                  }`}>
                    {h.category}
                  </span>
                </button>
              );
            })}
            {((listModalTab === 'completed' ? completedHabitsToday : listModalTab === 'pending' ? pendingHabitsToday : activeHabitsList).length === 0) && (
              <p className="text-xs text-slate-400 text-center py-8">
                {listModalTab === 'completed' ? 'Nothing completed yet today — time to get started!' : 'Everything is done for today! 🎉'}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Focus Timer Modal */}
      <FocusTimerModal
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
        habits={habitsList}
        tracking={allTracking.filter(t => t.completion_date === today)}
        onCompleteHabit={(habit, options) => handleCompleteFromTimer(habit, options)}
        onUndoHabit={(habit) => handleUndoHabit(habit)}
      />

      {/* AI Assistant Modal */}
      <AIPromptModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        habits={habitsList}
        trackingLogs={allTracking}
        onAddHabits={async (newHabits) => {
          for (const h of newHabits) {
            await fetch('/api/habits', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify(h),
            });
          }
          fetchAll();
        }}
      />

      {/* Share Streak Modal */}
      <ShareCard
        open={streakOpen}
        onClose={() => setStreakOpen(false)}
        stats={stats}
        displayName={displayName}
      />

      {/* Paused Habits Modal */}
      <PausedHabitsModal
        isOpen={pausedHabitsOpen}
        onClose={() => setPausedHabitsOpen(false)}
        pausedHabits={pausedHabitsList}
        onResumeHabit={handleResumeHabit}
        onToggleHabit={toggleHabit}
        todayCompletedIds={todayCompletedIds}
      />

      {/* Season Manager Modal */}
      <SeasonManagerModal
        isOpen={seasonManagerOpen}
        onClose={() => { setSeasonManagerOpen(false); setPrefilledSeasonData(null); }}
        activeSeason={activeSeason}
        allHabits={habitsList}
        session={session}
        onSeasonUpdated={fetchAll}
        onOpenReview={handleOpenSeasonReview}
        initialCreateData={prefilledSeasonData}
      />

      {/* Season Review Modal */}
      <SeasonReviewModal
        isOpen={seasonReviewOpen}
        onClose={() => setSeasonReviewOpen(false)}
        reviewData={seasonReviewData}
        onStartNextSeason={handleStartNextSeason}
        onDeleteSeason={handleDeleteSeasonFromReview}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          actionLabel={toast.actionLabel}
          onAction={toast.onAction}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
