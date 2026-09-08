import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import TodaysFocusCard from '../components/learning/TodaysFocusCard';
import LearningOnboardingModal from '../components/learning/LearningOnboardingModal';
import CreateJourneyModal from '../components/learning/CreateJourneyModal';
import ContextualInfo from '../components/learning/ContextualInfo';
import {
  Compass, Plus, Sparkles, Flame, CheckCircle2, BookOpen, Layers,
  ArrowRight, HelpCircle, AlertCircle, PlayCircle, Clock, Calendar, BarChart2, Trash2
} from 'lucide-react';

export default function LearningHubDashboard() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    journeys: [],
    continueJourney: null,
    todaysFocus: [],
    stats: { streak: 0, totalActiveDays: 0, topicsCompleted: 0, tasksCompleted: 0, activeJourneysCount: 0 }
  });

  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [fetchError, setFetchError] = useState('');
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
      } else {
        setFetchError('Failed to load Learning Hub data');
      }
    } catch (err) {
      console.error(err);
      setFetchError('Network error');
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
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#3d7a75] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-gray-500">Preparing your Learning Space...</span>
        </div>
      </div>
    );
  }

  const { journeys, continueJourney, todaysFocus, stats } = data;

  return (
    <div className="space-y-8 page-enter pb-12">
      {/* SECTION 1: HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#e4ecf5] dark:bg-[#182a40] text-[#2f5378] dark:text-[#8fb4d9]">
              Personal Environment
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            Your Learning Space
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            "You create the path. We help you complete it."
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setOnboardingOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 px-3.5 py-2.5 rounded-2xl transition-colors border border-gray-200 dark:border-gray-700"
          >
            <HelpCircle size={15} /> How it Works
          </button>
          <button
            onClick={() => {
              setOnboardingOpen(false);
              setCreateModalOpen(true);
            }}
            className="flex items-center gap-1.5 text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] dark:bg-[#5fae9e] dark:hover:bg-[#4c9484] text-white dark:text-[#0e2320] px-4 py-2.5 rounded-2xl shadow-md shadow-[#3d7a75]/20 transition-all"
          >
            <Plus size={16} /> New Journey
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl text-xs text-red-600 dark:text-red-300">
          {fetchError}
        </div>
      )}

      {/* EMPTY STATE */}
      {(!journeys || journeys.length === 0) ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-8 sm:p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-[#e4ecf5] dark:bg-[#182a40] rounded-3xl flex items-center justify-center text-[#2f5378] dark:text-[#8fb4d9] mx-auto mb-4">
            <Compass size={32} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Learning Journeys Yet</h3>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
            You can start with anything you want to learn — coding, video editing, guitar, languages, design, or any custom skill.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setCreateModalOpen(true)}
              className="flex items-center gap-2 text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] dark:bg-[#5fae9e] dark:hover:bg-[#4c9484] text-white dark:text-[#0e2320] px-6 py-3 rounded-2xl shadow-md transition-all"
            >
              <Plus size={16} /> Create Your First Journey
            </button>
            <button
              onClick={() => setOnboardingOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 px-5 py-3 rounded-2xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
            >
              Explore Learning Hub
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* SECTION 2: CONTINUE LEARNING (HERO SECTION) */}
          {continueJourney && (
            <div className="relative overflow-hidden bg-gradient-to-br from-[#14181c] via-[#1c2734] to-[#1f3a3a] border border-[#2a343d] text-white rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-[#3d7a75]/10 rounded-full blur-3xl" />
              
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#1f3a3a] text-[#8fd0c4] border border-[#3d7a75]/40">
                      Continue Learning
                    </span>
                    <span className="text-xs text-slate-300">• {continueJourney.category || 'General'}</span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
                    {continueJourney.title}
                  </h2>

                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <span>Currently Learning:</span>
                    <span className="font-bold text-white bg-white/10 px-2.5 py-1 rounded-lg">
                      {continueJourney.current_topic}
                    </span>
                  </div>

                  {/* Dual Progress Bars */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 max-w-lg">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300">Completion</span>
                        <span className="font-bold text-white">{continueJourney.completion_progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#5fae9e] rounded-full transition-all duration-500"
                          style={{ width: `${continueJourney.completion_progress}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[#b0aee0]">My Understanding</span>
                        <span className="font-bold text-[#b0aee0]">{continueJourney.understanding_progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#7570ab] rounded-full transition-all duration-500"
                          style={{ width: `${continueJourney.understanding_progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <button
                    onClick={() => navigate(`/learning/journey/${continueJourney.id}`)}
                    className="flex items-center gap-2 text-sm font-bold bg-white text-[#14181c] hover:bg-[#eef1f3] px-6 py-3.5 rounded-2xl shadow-lg transition-all transform hover:scale-105"
                  >
                    <PlayCircle size={18} className="text-[#3d7a75]" /> Continue Learning
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: TODAY'S FOCUS */}
          <TodaysFocusCard
            focusItems={todaysFocus}
            onCompleteTask={handleCompleteTask}
            onOpenJourney={(id) => navigate(`/learning/journey/${id}`)}
          />

          {/* SECTION 4: ACTIVE LEARNING JOURNEYS */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white text-lg">Active Learning Journeys</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">All your active learning paths</p>
              </div>
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {journeys.length} {journeys.length === 1 ? 'Journey' : 'Journeys'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {journeys.map(j => (
                <div
                  key={j.id}
                  onClick={() => navigate(`/learning/journey/${j.id}`)}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-5 shadow-sm hover:shadow-md hover:border-[#3d7a75] dark:hover:border-[#5fae9e] transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-10 h-10 rounded-2xl bg-[#e4ecf5] dark:bg-[#182a40] text-[#2f5378] dark:text-[#8fb4d9] flex items-center justify-center font-bold">
                        <BookOpen size={20} />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${
                          j.status === 'Active' ? 'bg-[#e3f3ee] text-[#2f6b5c] dark:bg-[#1c3a32] dark:text-[#7fd1b9]' : 'bg-[#f1f3f5] text-[#4b5563] dark:bg-[#2a343d] dark:text-[#cbd5e1]'
                        }`}>
                          {j.status}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteJourney(e, j.id)}
                          className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          title="Delete journey"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-bold text-base text-gray-900 dark:text-white line-clamp-1">
                        {j.title}
                      </h4>
                      {j.personal_goal && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">
                          Goal: {j.personal_goal}
                        </p>
                      )}
                    </div>

                    <div className="p-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl text-xs flex items-center justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Current Topic:</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[140px]">
                        {j.current_topic}
                      </span>
                    </div>

                    {/* Progress */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">Progress</span>
                        <span className="font-bold text-[#3d7a75] dark:text-[#5fae9e]">{j.completion_progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#5fae9e] rounded-full transition-all duration-300"
                          style={{ width: `${j.completion_progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-xs">
                    <span className="text-gray-400">{j.topics_count || 0} Topics</span>
                    <span className="font-semibold text-[#3d7a75] dark:text-[#5fae9e] flex items-center gap-1 hover:underline">
                      Continue <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 5: LEARNING CONSISTENCY STATS */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="text-[#c99a52] fire-bounce" size={20} />
              <h3 className="font-bold text-gray-900 dark:text-white text-base">Learning Consistency</h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-[#f5ecdb] dark:bg-[#3a2c14] border border-[#c99a52]/40 rounded-2xl text-center">
                <div className="text-2xl font-black text-[#8a5a24] dark:text-[#dcb579]">{stats.streak}</div>
                <div className="text-xs text-[#8a5a24] dark:text-[#dcb579] font-medium">Day Streak</div>
              </div>
              <div className="p-4 bg-[#e4ecf5] dark:bg-[#182a40] border border-[#2f5378]/40 rounded-2xl text-center">
                <div className="text-2xl font-black text-[#2f5378] dark:text-[#8fb4d9]">{stats.totalActiveDays}</div>
                <div className="text-xs text-[#2f5378] dark:text-[#8fb4d9] font-medium">Active Days</div>
              </div>
              <div className="p-4 bg-[#eae7f5] dark:bg-[#232042] border border-[#7570ab]/40 rounded-2xl text-center">
                <div className="text-2xl font-black text-[#4b4a8a] dark:text-[#b0aee0]">{stats.topicsCompleted}</div>
                <div className="text-xs text-[#4b4a8a] dark:text-[#b0aee0] font-medium">Topics Completed</div>
              </div>
              <div className="p-4 bg-[#e3f3ee] dark:bg-[#1c3a32] border border-[#2f6b5c]/40 rounded-2xl text-center">
                <div className="text-2xl font-black text-[#2f6b5c] dark:text-[#7fd1b9]">{stats.tasksCompleted}</div>
                <div className="text-xs text-[#2f6b5c] dark:text-[#7fd1b9] font-medium">Tasks Completed</div>
              </div>
            </div>
          </div>
        </>
      )}

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
