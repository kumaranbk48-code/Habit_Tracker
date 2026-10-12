import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import TodaysFocusCard from '../components/learning/TodaysFocusCard';
import LearningOnboardingModal from '../components/learning/LearningOnboardingModal';
import CreateJourneyModal from '../components/learning/CreateJourneyModal';
import ContextualInfo from '../components/learning/ContextualInfo';
import {
  Compass, Plus, Sparkles, Flame, CheckCircle2, BookOpen, Layers,
  ArrowRight, HelpCircle, AlertCircle, PlayCircle, Clock, Calendar, BarChart2, Trash2,
  Search, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import HabizLoader from '../components/HabizLoader';
import { LEARNING_FILTER_CATEGORIES, matchesLearningCategory } from '../constants/learningCategories';

export default function LearningHubDashboard() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    db_configured: true,
    journeys: [],
    continueJourney: null,
    todaysFocus: [],
    stats: { streak: 0, totalActiveDays: 0, topicsCompleted: 0, tasksCompleted: 0, activeJourneysCount: 0 }
  });

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTopic, setSearchTopic] = useState('');
  const initialLoadDone = useRef(false);

  const fetchDashboardData = useCallback(async (silent = false) => {
    if (!session) {
      setLoading(false);
      return;
    }
    // Only show full loading spinner on initial mount; keep background refetches seamless
    if (!silent && !initialLoadDone.current) {
      setLoading(true);
    }
    setFetchError('');
    try {
      const res = await fetch('/api/learning?action=dashboard', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
        // Show onboarding only once when user first visits and has no journeys
        try {
          const hasSeen = localStorage.getItem('has_seen_learning_onboarding');
          if (!hasSeen) {
            if (!json.journeys || json.journeys.length === 0) {
              setOnboardingOpen(true);
            }
            // Mark as seen immediately so it never pops up again on subsequent visits or refreshes
            localStorage.setItem('has_seen_learning_onboarding', 'true');
          }
        } catch (e) {
          console.error('Error accessing localStorage:', e);
        }
        return Boolean(json.db_configured);
      } else {
        setFetchError('Failed to load Learning Hub data');
        return false;
      }
    } catch (err) {
      console.error(err);
      setFetchError('Network error');
      return false;
    } finally {
      initialLoadDone.current = true;
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [session, fetchDashboardData]);

  const handleCreateJourney = async (journeyData) => {
    if (!session) return;
    const res = await fetch('/api/learning?action=create_journey', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify(journeyData)
    });

    if (res.ok) {
      const result = await res.json();
      if (result.journey?.id) {
        navigate(`/learning/journey/${result.journey.id}`);
      }
      fetchDashboardData(true);
    }
  };

  const handleCompleteTask = async (taskId) => {
    if (!session) return;
    // Optimistically remove from today's focus to prevent reload flicker
    setData(prev => ({
      ...prev,
      todaysFocus: (prev.todaysFocus || []).filter(t => t.id !== taskId)
    }));
    try {
      await fetch('/api/learning?action=toggle_task', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id: taskId, completed: true })
      });
    } catch (err) {
      console.error('Failed to complete task:', err);
    }
    fetchDashboardData(true);
  };

  const handleDeleteJourney = async (e, journeyId) => {
    e.stopPropagation();
    if (!session || !confirm('Are you sure you want to delete this learning journey and all its topics?')) return;
    try {
      await fetch('/api/learning', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id: journeyId, type: 'journey' })
      });
      fetchDashboardData(true);
    } catch (err) {
      console.error('Failed to delete journey:', err);
    }
  };

  const handleCloseOnboarding = () => {
    try {
      localStorage.setItem('has_seen_learning_onboarding', 'true');
    } catch (err) {
      console.error('Error saving onboarding state:', err);
    }
    setOnboardingOpen(false);
  };

  const handleStartCreateFromOnboarding = () => {
    try {
      localStorage.setItem('has_seen_learning_onboarding', 'true');
    } catch (err) {
      console.error('Error saving onboarding state:', err);
    }
    setOnboardingOpen(false);
    setCreateModalOpen(true);
  };

  if (loading) {
    return <HabizLoader size="lg" text="Preparing your Learning Space..." />;
  }

  const { journeys, continueJourney, todaysFocus, stats } = data;

  // Default featured item if no continueJourney exists yet
  const featuredJourney = continueJourney || (journeys && journeys[0]) || {
    id: 'demo-dsa',
    title: 'Data Structures & Algorithms in Java',
    category: 'Tech & Coding',
    current_topic: 'Binary Trees & Traversals',
    completion_progress: 40,
    understanding_progress: 55,
  };

  const trimmedSearch = searchTopic.trim().toLowerCase();
  const filteredJourneys = (journeys || []).filter(j => {
    const matchesCat = matchesLearningCategory(j.category, selectedCategory);
    const matchesSearch = !trimmedSearch ||
      j.title?.toLowerCase().includes(trimmedSearch) ||
      j.category?.toLowerCase().includes(trimmedSearch);
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-7 page-enter pb-12">
      {/* ── SECTION 1: HEADER (Matching Reference) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Your Learning Space
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            You create the path. We help you complete it.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden md:inline text-xs font-semibold text-teal-300 bg-teal-950/70 border border-teal-500/25 px-3 py-1.5 rounded-full">
            Smarter today, Stronger tomorrow.
          </span>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold bg-[#178274] hover:bg-[#136c60] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-teal-950/40 transition-all cursor-pointer"
          >
            <Plus size={16} /> New Journey
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-2xl text-xs text-red-300">
          {fetchError}
        </div>
      )}

      {/* ── SECTION 2: HERO CONTINUE LEARNING (Matching Reference with 3D Laptop Art) ── */}
      <div className="habiz-panel p-6 sm:p-8 rounded-3xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute right-0 top-0 bottom-0 w-full sm:w-1/2 opacity-35 sm:opacity-50 pointer-events-none bg-cover bg-center mix-blend-screen"
          style={{
            backgroundImage: 'url(/assets/learning-art.jpg)',
            maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.7) 40%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.7) 40%, black 100%)',
          }}
        />

        <div className="relative z-10 max-w-xl space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 bg-teal-950/70 border border-teal-500/30 px-2.5 py-0.5 rounded-full">
              Continue Learning
            </span>
            <span className="text-xs text-slate-400">• {featuredJourney.category || 'Development'}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
            {featuredJourney.title}
          </h2>

          <div className="text-xs text-slate-300 flex items-center gap-2">
            <span className="text-slate-400">Current Focus:</span>
            <span className="font-semibold text-white bg-white/[0.08] px-2.5 py-1 rounded-lg">
              {featuredJourney.current_topic || 'Core Foundations'}
            </span>
          </div>

          {/* Progress Bar & Continue CTA */}
          <div className="pt-2 max-w-md space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Agile / {featuredJourney.category || 'Self-Paced'}</span>
              <span className="font-bold text-teal-300">{featuredJourney.completion_progress || 40}%</span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-400 rounded-full transition-all duration-500"
                style={{ width: `${featuredJourney.completion_progress || 40}%` }}
              />
            </div>
          </div>

          <div className="pt-2">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (featuredJourney.id && !featuredJourney.id.startsWith('demo-')) {
                  navigate(`/learning/journey/${featuredJourney.id}`);
                } else if (journeys?.[0]?.id) {
                  navigate(`/learning/journey/${journeys[0].id}`);
                } else {
                  setCreateModalOpen(true);
                }
              }}
              className="inline-flex items-center gap-2 text-xs font-bold bg-[#178274] hover:bg-[#136c60] text-white px-5 py-2.5 rounded-xl shadow-lg transition-colors cursor-pointer"
            >
              <span>Continue</span>
              <ArrowRight size={14} />
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: CATEGORY PILLS & TOPIC SEARCH (Matching Reference) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none relative">
          {LEARNING_FILTER_CATEGORIES.map(cat => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`relative px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'text-teal-300'
                    : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]'
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="activeLearningCategoryPill"
                    className="absolute inset-0 bg-[#153834] border border-teal-500/35 rounded-xl shadow-xs -z-0"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{cat}</span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTopic}
            onChange={(e) => setSearchTopic(e.target.value)}
            placeholder="Search journeys..."
            className="w-full sm:w-56 pl-8 pr-7 py-1.5 text-xs rounded-xl bg-black/30 border border-white/[0.08] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500/50 transition-all"
          />
          {searchTopic && (
            <button
              type="button"
              onClick={() => setSearchTopic('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── SECTION 4: MY LEARNING JOURNEYS ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">My Learning Journeys</h3>
          <span className="text-xs text-slate-400">
            {filteredJourneys.length} {filteredJourneys.length === 1 ? 'Journey' : 'Journeys'}
          </span>
        </div>

        {filteredJourneys.length === 0 ? (
          <div className="habiz-panel p-8 text-center rounded-3xl space-y-3">
            <BookOpen size={28} className="mx-auto text-teal-400/70" />
            <h4 className="text-sm font-bold text-white">
              {trimmedSearch ? `No journeys matching "${searchTopic}"` : 'Start your first learning roadmap'}
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {trimmedSearch ? 'Try a different keyword or category filter.' : 'Track courses, skills, and books with structured milestones and study habit check-ins.'}
            </p>
            {trimmedSearch ? (
              <button
                type="button"
                onClick={() => { setSearchTopic(''); setSelectedCategory('All'); }}
                className="text-xs font-semibold text-teal-300 hover:underline cursor-pointer"
              >
                Clear search filter
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="text-xs font-bold text-teal-300 bg-teal-950/70 border border-teal-500/30 px-4 py-2 rounded-xl hover:bg-teal-900 transition-colors"
              >
                + Create Learning Journey
              </button>
            )}
          </div>
        ) : (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredJourneys.map(j => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.2 }}
                  key={j.id}
                  onClick={() => navigate(`/learning/journey/${j.id}`)}
                  className="habiz-panel habiz-panel-interactive p-5 rounded-3xl cursor-pointer flex flex-col justify-between space-y-4 group"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/25 text-teal-300 flex items-center justify-center">
                        <BookOpen size={18} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-teal-950/60 text-teal-300 border border-teal-500/25">
                          {j.category || 'Learning'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteJourney(e, j.id)}
                          className="text-slate-500 hover:text-red-400 p-1 rounded-lg transition-colors"
                          title="Delete journey"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-teal-200 transition-colors truncate">
                        {j.title}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {j.current_topic ? `Topic: ${j.current_topic}` : j.personal_goal || 'Self-paced mastery'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-white/[0.04]">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{j.topics_count || 5} topics</span>
                      <span className="font-bold text-teal-300">{j.completion_progress || 0}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal-400 rounded-full transition-all duration-300"
                        style={{ width: `${j.completion_progress || 0}%` }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>



      {/* ── SECTION 6: TODAY'S FOCUS & CONSISTENCY ── */}
      {todaysFocus?.length > 0 && (
        <TodaysFocusCard
          focusItems={todaysFocus}
          onCompleteTask={handleCompleteTask}
          onOpenJourney={(id) => navigate(`/learning/journey/${id}`)}
        />
      )}

      {/* Consistency Stats */}
      <div className="habiz-panel p-5 sm:p-6 rounded-3xl">
        <div className="flex items-center gap-2 mb-4">
          <Flame className="text-amber-400 fire-bounce" size={18} />
          <h3 className="font-bold text-white text-base">Learning Consistency</h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center">
            <div className="text-2xl font-black text-amber-300">{stats.streak}</div>
            <div className="text-xs text-slate-400 mt-0.5">Day Streak</div>
          </div>
          <div className="p-3.5 bg-sky-500/10 border border-sky-500/20 rounded-2xl text-center">
            <div className="text-2xl font-black text-sky-300">{stats.totalActiveDays}</div>
            <div className="text-xs text-slate-400 mt-0.5">Active Days</div>
          </div>
          <div className="p-3.5 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-center">
            <div className="text-2xl font-black text-indigo-300">{stats.topicsCompleted}</div>
            <div className="text-xs text-slate-400 mt-0.5">Topics Completed</div>
          </div>
          <div className="p-3.5 bg-teal-500/10 border border-teal-500/20 rounded-2xl text-center">
            <div className="text-2xl font-black text-teal-300">{stats.tasksCompleted}</div>
            <div className="text-xs text-slate-400 mt-0.5">Tasks Completed</div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      <LearningOnboardingModal
        isOpen={onboardingOpen}
        onClose={handleCloseOnboarding}
        onStartCreate={handleStartCreateFromOnboarding}
      />

      <CreateJourneyModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateJourney}
      />
    </div>
  );
}
