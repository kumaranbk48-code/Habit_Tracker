import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import JourneyTimelineView from '../components/learning/JourneyTimelineView';
import TopicWorkspaceModal from '../components/learning/TopicWorkspaceModal';
import HabitConnectionModal from '../components/learning/HabitConnectionModal';
import ContextualInfo from '../components/learning/ContextualInfo';
import CustomSelect from '../components/CustomSelect';
import {
  ArrowLeft, Plus, Play, Pause, CheckCircle2, Link, FileText, Globe,
  Sliders, Trash2, Edit3, Layers, BookOpen, Sparkles, MoreVertical, Bell
} from 'lucide-react';

export default function LearningJourneyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [journeyData, setJourneyData] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [habitModalOpen, setHabitModalOpen] = useState(false);
  const [quickTopicTitle, setQuickTopicTitle] = useState('');
  const [addTopicOpen, setAddTopicOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const menuRef = useRef(null);
  const initialLoadDone = useRef(false);

  const fetchJourneyDetail = useCallback(async (silent = false) => {
    if (!session || !id) {
      setLoading(false);
      return;
    }
    // Only show full loading spinner on initial mount; keep background refetches seamless
    if (!silent && !initialLoadDone.current) {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/learning?action=journey_detail&id=${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setJourneyData(json);
        // If topic modal is open, refresh selected topic reference seamlessly
        setSelectedTopic(prev => {
          if (!prev) return null;
          const fresh = json.topics?.find(t => t.id === prev.id);
          return fresh ? { ...fresh, tasks: fresh.tasks || [] } : prev;
        });
      } else {
        setFetchError('Failed to load learning journey');
      }
    } catch (err) {
      console.error(err);
      setFetchError('Network error');
    } finally {
      initialLoadDone.current = true;
      setLoading(false);
    }
  }, [session, id]);

  useEffect(() => {
    if (session) {
      fetchJourneyDetail();
    } else {
      setLoading(false);
    }
  }, [id, session, fetchJourneyDetail]);
  
  // Close actions dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setActionsMenuOpen(false);
      }
    };
    if (actionsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [actionsMenuOpen]);

  const handleOpenTopic = (topic) => {
    setSelectedTopic(topic);
    setTopicModalOpen(true);
  };

  const handleToggleTask = async (taskId, completed) => {
    if (!session) return;
    // Optimistic update for immediate checkbox response without any page wipe
    setSelectedTopic(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: (prev.tasks || []).map(t => t.id === taskId ? { ...t, completed } : t)
      };
    });
    setJourneyData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        topics: (prev.topics || []).map(topic => ({
          ...topic,
          tasks: (topic.tasks || []).map(t => t.id === taskId ? { ...t, completed } : t)
        }))
      };
    });

    try {
      await fetch('/api/learning?action=toggle_task', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id: taskId, completed })
      });
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleAddTask = async (topicId, title) => {
    if (!session || !id) return;
    try {
      await fetch('/api/learning?action=add_task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ topic_id: topicId, journey_id: id, title })
      });
    } catch (err) {
      console.error('Failed to add task:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleDeleteTask = async (topicId, taskId) => {
    if (!session || !id) return;
    // Optimistic update
    setSelectedTopic(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: (prev.tasks || []).filter(t => t.id !== taskId)
      };
    });
    setJourneyData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        topics: (prev.topics || []).map(topic => ({
          ...topic,
          tasks: (topic.tasks || []).filter(t => t.id !== taskId)
        }))
      };
    });

    try {
      await fetch('/api/learning', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id: taskId, type: 'task' })
      });
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleDeleteTopic = async (topicId) => {
    if (!session || !id) return;
    if (!confirm('Are you sure you want to delete this topic and all its subtasks?')) return;
    try {
      await fetch('/api/learning', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id: topicId, type: 'topic' })
      });
      if (selectedTopic?.id === topicId) {
        setTopicModalOpen(false);
        setSelectedTopic(null);
      }
    } catch (err) {
      console.error('Failed to delete topic:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleDeleteJourney = async () => {
    if (!session || !id) return;
    if (!confirm('Are you sure you want to delete this entire learning journey? This cannot be undone.')) return;
    try {
      await fetch('/api/learning', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id, type: 'journey' })
      });
      navigate('/learning');
    } catch (err) {
      console.error('Failed to delete journey:', err);
    }
  };

  const handleDeleteResource = async (resourceId) => {
    if (!session) return;
    try {
      await fetch('/api/learning', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id: resourceId, type: 'resource' })
      });
    } catch (err) {
      console.error('Failed to delete resource:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleDeleteNote = async (noteId) => {
    if (!session) return;
    try {
      await fetch('/api/learning', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id: noteId, type: 'note' })
      });
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleUpdateTopic = async (topicId, payload) => {
    if (!session) return;
    try {
      await fetch('/api/learning?action=update_topic', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id: topicId, ...payload })
      });
    } catch (err) {
      console.error('Failed to update topic:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleAddTopic = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    const title = quickTopicTitle.trim();
    if (!title || !session || !id) return;
    
    // Optimistic topic creation
    const tempTopic = {
      id: crypto.randomUUID(),
      journey_id: id,
      phase_id: null,
      title,
      description: '',
      priority: 'Medium',
      status: 'Not Started',
      completion_progress: 0,
      understanding_progress: 0,
      order_index: Date.now(),
      created_at: new Date().toISOString(),
      tasks: []
    };
    setJourneyData(prev => prev ? { ...prev, topics: [...(prev.topics || []), tempTopic] } : prev);
    setQuickTopicTitle('');
    setAddTopicOpen(false);

    try {
      await fetch('/api/learning?action=add_topic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ journey_id: id, title })
      });
    } catch (err) {
      console.error('Failed to add topic:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleAddResource = async (topicId, title, url, resource_type) => {
    if (!session || !id) return;
    try {
      await fetch('/api/learning?action=add_resource', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ journey_id: id, topic_id: topicId, title, url, resource_type })
      });
    } catch (err) {
      console.error('Failed to add resource:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleAddNote = async (topicId, content) => {
    if (!session || !id) return;
    try {
      await fetch('/api/learning?action=add_note', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ journey_id: id, topic_id: topicId, content })
      });
    } catch (err) {
      console.error('Failed to add note:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleConnectHabit = async (journeyId, habitId) => {
    if (!session) return;
    try {
      await fetch('/api/learning?action=connect_habit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ journey_id: journeyId, habit_id: habitId })
      });
    } catch (err) {
      console.error('Failed to connect habit:', err);
    }
    fetchJourneyDetail(true);
  };

  const handleStatusChange = async (newStatus) => {
    if (!session || !id) return;
    try {
      await fetch('/api/learning?action=update_journey', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ id, status: newStatus })
      });
    } catch (err) {
      console.error('Failed to update journey status:', err);
    }
    fetchJourneyDetail(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-[#3d7a75] dark:border-[#5fae9e] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-gray-500">Loading Workspace...</span>
        </div>
      </div>
    );
  }

  if (fetchError || !journeyData || !journeyData.journey) {
    return (
      <div className="text-center py-16">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Journey Not Found</h3>
        <button
          onClick={() => navigate('/learning')}
          className="text-xs font-semibold text-[#3d7a75] dark:text-[#5fae9e] hover:underline"
        >
          Return to Learning Hub
        </button>
      </div>
    );
  }

  const { journey, phases, unphasedTopics, topics, habitConnections } = journeyData;

  return (
    <div className="space-y-6 page-enter pb-16">
      {/* Back Button */}
      <button
        onClick={() => navigate('/learning')}
        className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
      >
        <ArrowLeft size={16} /> Back to Learning Space
      </button>

      {/* TOP HEADER CARD */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9]">
                {journey.category || 'Learning Journey'}
              </span>
              <CustomSelect
                value={journey.status || 'Active'}
                onChange={e => handleStatusChange(e.target.value)}
                containerClassName="w-28"
                className="text-[11px] font-semibold bg-gray-100 dark:bg-gray-700/80 text-gray-800 dark:text-gray-200 px-2.5 py-1 rounded-full border border-gray-200/60 dark:border-gray-600/60 hover:bg-gray-200/70 dark:hover:bg-gray-600/70 focus:outline-none transition-colors"
                dropdownClassName="w-32"
              >
                <option value="Active">Active</option>
                <option value="Paused">Paused</option>
                <option value="Completed">Completed</option>
              </CustomSelect>

              {/* Quick Mark Journey as Complete Button */}
              <button
                type="button"
                onClick={() => handleStatusChange(journey.status === 'Completed' ? 'Active' : 'Completed')}
                className={`flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors cursor-pointer ${
                  journey.status === 'Completed'
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'
                    : 'bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] hover:bg-[#d5ece4]'
                }`}
                title={journey.status === 'Completed' ? 'Mark Journey Active' : 'Mark Journey as Completed'}
              >
                <CheckCircle2 size={13} />
                {journey.status === 'Completed' ? 'Undo Complete' : 'Mark Complete'}
              </button>

              {/* Quick Study Reminder Button */}
              <button
                type="button"
                onClick={() => navigate('/reminders', { state: { openAdd: true, prefillType: 'learning', prefillId: journey.id } })}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#f0f4f8] dark:bg-[#182a40] text-[#2f5378] dark:text-[#8fb4d9] hover:bg-[#e4ecf5] dark:hover:bg-[#203650] transition-colors cursor-pointer"
                title="Set Study Schedule or Deadline Reminder"
              >
                <Bell size={13} />
                <span>Study Reminder</span>
              </button>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
              {journey.title}
            </h1>

            {journey.personal_goal && (
              <p className="text-xs text-[#3d7a75] dark:text-[#5fae9e] font-medium flex items-center gap-1">
                <Sparkles size={13} /> Goal: {journey.personal_goal}
              </p>
            )}
          </div>

          {/* Three-dot More Actions Menu */}
          <div className="relative self-start" ref={menuRef}>
            <button
              type="button"
              onClick={() => setActionsMenuOpen(prev => !prev)}
              aria-label="More actions"
              title="More actions"
              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                actionsMenuOpen
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/60'
              }`}
            >
              <MoreVertical size={18} />
            </button>

            {actionsMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/80 shadow-xl p-1.5 z-30 animate-fadeIn space-y-0.5">
                {/* 1. Add Topic */}
                <button
                  type="button"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    setAddTopicOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-[#e3f3ee]/80 hover:text-[#2f6b5c] dark:hover:bg-[#1c3a32]/70 dark:hover:text-[#7fd1b9] transition-all duration-150 text-left cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-lg bg-[#e3f3ee] dark:bg-[#1c3a32] flex items-center justify-center text-[#2f6b5c] dark:text-[#7fd1b9] group-hover:scale-105 transition-transform">
                    <Plus size={14} />
                  </div>
                  <span>Add Topic</span>
                </button>

                {/* 2. Connect Habit */}
                <button
                  type="button"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    setHabitModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 transition-all duration-150 text-left cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 group-hover:scale-105 transition-transform">
                    <Link size={14} />
                  </div>
                  <span className="flex-1">Connect Habit</span>
                  {habitConnections && habitConnections.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200/80 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {habitConnections.length}
                    </span>
                  )}
                </button>

                {/* Divider */}
                <div className="my-1 border-t border-gray-100 dark:border-gray-700/80" />

                {/* 3. Delete Journey (subtle destructive) */}
                <button
                  type="button"
                  onClick={() => {
                    setActionsMenuOpen(false);
                    handleDeleteJourney();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all duration-150 text-left cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-950/50 flex items-center justify-center text-red-500 dark:text-red-400 group-hover:scale-105 transition-transform">
                    <Trash2 size={14} />
                  </div>
                  <span>Delete Journey</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Overview Dual Progress */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs">
          <div>
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
              <span>Overall Completion Progress</span>
              <span className="font-bold text-[#3d7a75] dark:text-[#5fae9e]">{journey.completion_progress}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#5fae9e] rounded-full transition-all duration-300"
                style={{ width: `${journey.completion_progress}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
              <span>Overall Personal Mastery</span>
              <span className="font-bold text-[#7570ab] dark:text-[#b0aee0]">{journey.understanding_progress}%</span>
            </div>
            <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#7570ab] dark:bg-[#b0aee0] rounded-full transition-all duration-300"
                style={{ width: `${journey.understanding_progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* QUICK ADD TOPIC FORM */}
      {addTopicOpen && (
        <div className="p-4 bg-white dark:bg-gray-800 border border-[#3d7a75]/30 dark:border-[#5fae9e]/30 rounded-2xl flex gap-2 animate-fadeIn">
          <input
            type="text"
            placeholder="Topic title..."
            value={quickTopicTitle}
            onChange={e => setQuickTopicTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddTopic();
              }
            }}
            className="flex-1 px-3.5 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs dark:text-white"
          />
          <button
            type="button"
            onClick={() => handleAddTopic()}
            className="text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] text-white px-4 py-2 rounded-xl cursor-pointer shadow-xs transition-colors"
          >
            Add Topic
          </button>
        </div>
      )}

      {/* JOURNEY ROADMAP VISUALIZATION */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 dark:text-white text-base">Journey Roadmap</h3>
          <span className="text-xs text-gray-400">Click any topic or subtask to mark complete or open workspace</span>
        </div>

        <JourneyTimelineView
          phases={phases}
          unphasedTopics={unphasedTopics}
          topics={topics}
          onSelectTopic={handleOpenTopic}
          onDeleteTopic={handleDeleteTopic}
          onToggleTask={handleToggleTask}
          onDeleteTask={handleDeleteTask}
          onAddTask={handleAddTask}
          onUpdateTopic={handleUpdateTopic}
        />
      </div>

      {/* MODALS */}
      <TopicWorkspaceModal
        isOpen={topicModalOpen}
        onClose={() => setTopicModalOpen(false)}
        topic={selectedTopic}
        journeyId={id}
        onToggleTask={handleToggleTask}
        onAddTask={handleAddTask}
        onDeleteTask={handleDeleteTask}
        onUpdateTopic={handleUpdateTopic}
        onAddResource={handleAddResource}
        onAddNote={handleAddNote}
        onDeleteResource={handleDeleteResource}
        onDeleteNote={handleDeleteNote}
        onDeleteTopic={handleDeleteTopic}
      />

      <HabitConnectionModal
        isOpen={habitModalOpen}
        onClose={() => setHabitModalOpen(false)}
        journey={journey}
        onConnect={handleConnectHabit}
      />
    </div>
  );
}
