import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  ListChecks, CheckCircle2, Clock, Flame, Trophy, TrendingUp, AlertCircle, RefreshCw,
  Activity, Timer, Sparkles, Sun, Moon, Sunset, Plus, Check
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
import { useConfetti } from '../hooks/useConfetti';
import { calculateXP, checkNewBadges, calculateCategoryStreaks } from '../hooks/useGamification';
import { calculateOverallHabitStrength, getStrengthBadge } from '../lib/habitStrength';

const StatCard = ({ label, value, icon: Icon, colorClass, bgClass, children, onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700/80 transition-shadow duration-200 hover:shadow-md ${
      onClick ? 'cursor-pointer hover:border-blue-100' : ''
    }`}
  >
    <div className="flex items-center justify-between mb-3">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgClass}`}>
        <Icon size={18} className={colorClass} />
      </div>
    </div>
    {children || <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{value}</p>}
    {onClick && <p className="text-[10px] text-blue-400 font-medium mt-1.5">Tap to view →</p>}
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2.5 text-sm">
      <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{label}</p>
      <p className="text-blue-600 dark:text-blue-400">{payload[0].value} completed</p>
    </div>
  );
};

export default function Dashboard() {
  const { session, user } = useAuth();
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
  
  // Phase 6 extensions: time filter & modals
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | 'morning' | 'afternoon' | 'evening'
  const [timerOpen, setTimerOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

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
      const [statsRes, heatmapRes, habitsRes, trackingRes, goalsRes, milestonesRes, earned] = await Promise.all([
        fetch('/api/dashboard',  { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/heatmap',    { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/habits',     { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/tracking',   { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/goals',      { headers: { Authorization: `Bearer ${session.access_token}` } }),
        fetch('/api/milestones', { headers: { Authorization: `Bearer ${session.access_token}` } }),
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

      setStats(statsData);
      setHeatmap(heatmapData);
      setHabitsList(Array.isArray(habitsData) ? habitsData : []);
      setAllTracking(Array.isArray(trackingData) ? trackingData : []);
      setGoalsList(Array.isArray(goalsData) ? goalsData : []);
      setMilestonesList(Array.isArray(milestonesData) ? milestonesData : []);

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
        fireSmall();
        await saveNewBadges(newBadges);
      }
      setBadgesLoaded(true);

      if (statsData.totalHabits > 0 && statsData.completedToday === statsData.totalHabits) {
        firePerfectDay();
      }

      const streak = statsData.currentStreak ?? 0;
      if (prevStreak.current !== null && streak !== prevStreak.current && isMilestone(streak)) {
        fireMilestone();
        setMilestone(streak);
      }
      prevStreak.current = streak;
    } catch (err) {
      console.error(err);
      setFetchError('Network error — check your connection.');
    } finally {
      setLoading(false);
    }
  }, [session, fetchAchievements, saveNewBadges, firePerfectDay, fireMilestone, fireSmall]);

  useEffect(() => {
    if (session) fetchAll();
  }, [session, fetchAll]);

  useEffect(() => {
    const handleUpdate = () => { if (session) fetchAll(); };
    window.addEventListener('habittracker-stats-updated', handleUpdate);
    return () => window.removeEventListener('habittracker-stats-updated', handleUpdate);
  }, [session, fetchAll]);

  const toggleHabit = async (habit) => {
    const isDone = todayCompletedIds.has(habit.id);
    const newStatus = !isDone;
    
    const body = {
      habit_id: habit.id,
      completion_date: today,
      status: newStatus,
    };
    
    if (habit.tracking_type === 'quantity') {
      if (newStatus) {
        body.action = 'add';
        const currentQty = allTracking.find(t => t.habit_id === habit.id && t.completion_date === today)?.quantity_completed || 0;
        body.amount = Math.max(0, habit.target_quantity - currentQty);
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
        if (newStatus) {
          fireSmall();
        }
        await fetchAll();
      } else {
        console.error('Failed to toggle habit');
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-100 rounded-2xl">
          <AlertCircle size={20} className="text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-red-700">Unable to load dashboard</p>
            <p className="text-sm text-red-600 mt-0.5">{fetchError}</p>
          </div>
          <button onClick={() => { setLoading(true); fetchAll(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors">
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const xp = calculateXP(stats);
  const completionRate = stats?.totalHabits > 0
    ? Math.round((stats.completedToday / stats.totalHabits) * 100) : 0;
  const isPerfectDay = stats?.totalHabits > 0 && stats.completedToday === stats.totalHabits;
  const chartData = (stats?.weeklyData || []).map(d => ({
    name: new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
    completed: d.completed,
  }));
  const goalProgress = stats?.goalProgress ?? 0;
  const circ = 2 * Math.PI * 52;
  const dash = (goalProgress / 100) * circ;

  // Phase 3: today's completed/pending habit names (for the clickable stat cards)
  const today = new Date().toISOString().split('T')[0];
  const todayCompletedIds = new Set(
    allTracking.filter(t => t.completion_date === today && t.status === true).map(t => t.habit_id)
  );
  const completedHabitsToday = habitsList.filter(h => todayCompletedIds.has(h.id));
  const pendingHabitsToday   = habitsList.filter(h => !todayCompletedIds.has(h.id));

  // Phase 4: group milestones by goal so each row in the goal list can show
  // its own roadmap progress (e.g. "2/4 milestones").
  const milestonesByGoal = {};
  for (const m of milestonesList) {
    if (!milestonesByGoal[m.goal_id]) milestonesByGoal[m.goal_id] = [];
    milestonesByGoal[m.goal_id].push(m);
  }

  // Habit strength index calculation
  const overallStrength = calculateOverallHabitStrength(habitsList, allTracking);
  const strengthBadge = getStrengthBadge(overallStrength);

  // Time of Day filtered habits for quick check-in
  const filteredHabitsToday = habitsList.filter(h => {
    if (timeFilter === 'all') return true;
    return (h.time_of_day || 'anytime') === timeFilter || h.time_of_day === 'anytime';
  });

  return (
    <div className="space-y-6">
      {milestone && <MilestoneToast streak={milestone} onClose={() => setMilestone(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          {isPerfectDay && (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-white text-xs font-semibold shimmer-bg shadow-lg shadow-blue-200">
              🎉 Perfect Day!
            </div>
          )}

          {/* Quick Action Buttons */}
          <button
            onClick={() => setTimerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all active:scale-95"
          >
            <Timer size={15} className="text-white" /> Focus Timer
          </button>

          <button
            onClick={() => setAiOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition-all active:scale-95"
          >
            <Sparkles size={15} className="text-white" /> AI Assistant
          </button>

          {/* Share streak card button */}
          <ShareCard stats={stats} displayName={displayName} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Habits"    icon={ListChecks}   colorClass="text-blue-600"   bgClass="bg-blue-50 dark:bg-blue-950/40"   value={stats?.totalHabits ?? 0} />
        <StatCard label="Completed Today" icon={CheckCircle2} colorClass="text-green-600"  bgClass="bg-green-50 dark:bg-green-950/40"  value={completedHabitsToday.length} onClick={() => setListModal('completed')} />
        <StatCard label="Current Streak"  icon={Flame}        colorClass="text-orange-600" bgClass="bg-orange-50 dark:bg-orange-950/40">
          <StreakCounter streak={stats?.currentStreak ?? 0} label="days" />
        </StatCard>

        {/* Habit Formation Strength Card */}
        <StatCard label="Habit Strength Index" icon={Activity} colorClass="text-indigo-600" bgClass="bg-indigo-50 dark:bg-indigo-950/40">
          <div className="mt-1">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">{overallStrength}%</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${strengthBadge.color}`}>
                {strengthBadge.label}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">30-day exponential consistency score</p>
          </div>
        </StatCard>
      </div>

      {/* Time of Day Routine Filters & Quick Check-in Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700/80 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span>Today's Routines</span>
              <span className="text-xs font-normal text-gray-400 dark:text-gray-500">
                ({completedHabitsToday.length}/{habitsList.length} completed)
              </span>
            </h2>
          </div>

          {/* Time of day tabs */}
          <div className="flex bg-gray-100 dark:bg-gray-700/60 p-1 rounded-xl">
            {[
              { id: 'all', label: 'All', icon: ListChecks },
              { id: 'morning', label: 'Morning', icon: Sun },
              { id: 'afternoon', label: 'Afternoon', icon: Sunset },
              { id: 'evening', label: 'Evening', icon: Moon },
            ].map(tab => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setTimeFilter(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    timeFilter === tab.id
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                  }`}
                >
                  <TabIcon size={13} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Check-in Habit Chips */}
        <div className="flex flex-wrap gap-2.5 pt-1">
          {filteredHabitsToday.map(h => {
            const isDone = todayCompletedIds.has(h.id);
            return (
              <button
                key={h.id}
                onClick={() => toggleHabit(h)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-medium transition-all duration-200 cursor-pointer ${
                  isDone
                    ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 font-semibold'
                    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                }`}
              >
                <div className={`w-4 h-4 rounded-md flex items-center justify-center text-[10px] font-bold ${
                  isDone ? 'bg-blue-600 text-white' : 'border border-gray-400 text-transparent'
                }`}>
                  ✓
                </div>
                <span>{h.habit_name}</span>
                {h.time_of_day && h.time_of_day !== 'anytime' && (
                  <span className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500">
                    {h.time_of_day[0]}
                  </span>
                )}
              </button>
            );
          })}
          {filteredHabitsToday.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic py-1">No habits scheduled for this time slot.</p>
          )}
        </div>
      </div>

      {/* XP Level bar */}
      <XPLevelBar xp={xp} />

      {/* Daily Motivation Quote + Badges */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DailyQuoteCard />
        {badgesLoaded && <BadgeGrid unlockedIds={unlockedIds} newlyUnlocked={newlyUnlocked} categoryStreaks={categoryStreaks} />}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">Weekly Performance</h2>
            <span className="text-xs text-gray-400 font-medium">Last 7 days</span>
          </div>
          {chartData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barSize={32}>
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f3f4f6', radius: 6 }} />
                  <Bar dataKey="completed" radius={[6, 6, 0, 0]}>
                    {chartData.map((_, i) => <Cell key={i} fill="#2563eb" fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No data yet — start completing habits!</div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Goal Progress</h2>
          <div className="flex flex-col items-center">
            <div className="relative w-36 h-36 mb-4">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" stroke="#f3f4f6" strokeWidth="10" fill="none" />
                <circle cx="60" cy="60" r="52" stroke="url(#pg)" strokeWidth="10" fill="none"
                  strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" className="ring-progress" />
                <defs>
                  <linearGradient id="pg" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" /><stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-gray-900">{goalProgress}%</span>
                <span className="text-xs text-gray-400 font-medium">complete</span>
              </div>
            </div>
            <div className="w-full space-y-2">
              <div className="flex justify-between items-center text-sm py-2 border-b border-gray-50">
                <span className="text-gray-500">Total Goals</span>
                <span className="font-semibold text-gray-900">{stats?.totalGoals ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-2">
                <span className="text-gray-500">Completed</span>
                <span className="font-semibold text-green-600">{stats?.completedGoals ?? 0}</span>
              </div>
            </div>

            {/* Phase 3: each goal listed individually with its own status,
                instead of only a combined percentage. */}
            {goalsList.length > 0 ? (
              <div className="w-full mt-4 pt-4 border-t border-gray-50 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-2">Your Goals</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {goalsList.map(g => {
                    const gMilestones = milestonesByGoal[g.id] || [];
                    const gDone = gMilestones.filter(m => m.completed).length;
                    return (
                      <div key={g.id} className="px-2.5 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{g.goal_name}</span>
                          <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            g.status === 'Completed'   ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                            g.status === 'In Progress' ? 'bg-blue-100 text-blue-700  dark:bg-blue-900/30 dark:text-blue-300'  :
                                                          'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                          }`}>
                            {g.status}
                          </span>
                        </div>
                        {gMilestones.length > 0 && (
                          <div className="mt-1.5">
                            <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                style={{ width: `${Math.round((gDone / gMilestones.length) * 100)}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{gDone}/{gMilestones.length} milestones</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center w-full mt-4 pt-4 border-t border-gray-50 dark:border-gray-700">
                No goals yet — add one on the Goals page.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Streak hero */}
      {(stats?.currentStreak ?? 0) > 0 && (
        <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl p-6 text-white shadow-lg shadow-orange-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-orange-100 text-sm font-medium mb-1">🔥 Active Streak</p>
              <StreakCounter streak={stats.currentStreak} label="days" large />
            </div>
            <div className="text-right">
              <p className="text-orange-200 text-sm">Longest ever</p>
              <p className="text-3xl font-bold mt-1">{stats.longestStreak} days</p>
            </div>
          </div>
        </div>
      )}

      {/* Heatmap */}
      <HabitHeatmap data={heatmap.data} totalHabits={heatmap.totalHabits} />

      {/* Completed / Pending list modal (from clicking a stat card) */}
      <Modal
        open={!!listModal}
        onClose={() => setListModal(null)}
        title={listModal === 'completed' ? 'Completed Today' : 'Pending Today'}
      >
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {(listModal === 'completed' ? completedHabitsToday : pendingHabitsToday).map((h, i) => {
            const isDone = todayCompletedIds.has(h.id);
            return (
              <button
                key={h.id}
                onClick={() => toggleHabit(h)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 cursor-pointer text-left ${
                  isDone
                    ? 'bg-blue-50 hover:bg-blue-100/70 border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/40 hover:scale-[1.01] active:scale-[0.99]'
                    : 'bg-amber-50 hover:bg-amber-100/70 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/40 hover:scale-[1.01] active:scale-[0.99]'
                }`}
                style={{ animation: `fadeIn 0.2s ease ${i * 0.03}s both` }}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 transition-colors ${
                    isDone
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-amber-400 text-amber-500 dark:border-amber-500'
                  }`}>
                    {isDone ? '✓' : ''}
                  </div>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {h.habit_name}
                    {h.tracking_type === 'quantity' && (
                      <span className="text-xs text-gray-400 block mt-0.5">
                        Progress: {allTracking.find(t => t.habit_id === h.id && t.completion_date === today)?.quantity_completed || 0} / {h.target_quantity} {h.unit}
                      </span>
                    )}
                  </span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ml-2 ${
                  isDone
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                }`}>
                  {h.category}
                </span>
              </button>
            );
          })}
          {(listModal === 'completed' ? completedHabitsToday : pendingHabitsToday).length === 0 && (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              {listModal === 'completed' ? 'Nothing completed yet today — time to get started!' : 'Everything is done for today! 🎉'}
            </p>
          )}
        </div>
      </Modal>

      {/* Focus Timer Modal */}
      <FocusTimerModal
        open={timerOpen}
        onClose={() => setTimerOpen(false)}
        habits={habitsList}
        onCompleteHabit={(habit) => toggleHabit(habit)}
      />

      {/* AI Assistant Modal */}
      <AIPromptModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
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

    </div>
  );
}
