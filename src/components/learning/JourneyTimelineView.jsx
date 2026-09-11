import { useState } from 'react';
import {
  CheckCircle2, Circle, PlayCircle, PauseCircle, AlertTriangle, Layers,
  Trash2, Plus, CheckSquare, Square, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react';

export default function JourneyTimelineView({
  phases = [],
  unphasedTopics = [],
  topics = [],
  onSelectTopic,
  onDeleteTopic,
  onToggleTask,
  onDeleteTask,
  onAddTask,
  onUpdateTopic
}) {
  const [expandedTopics, setExpandedTopics] = useState({});
  const [newSubtaskTitle, setNewSubtaskTitle] = useState({});

  const toggleExpand = (topicId) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicId]: prev[topicId] === undefined ? false : !prev[topicId]
    }));
  };

  const getStatusIcon = (topic) => {
    const status = topic.status || 'Not Started';
    const comp = topic.completion_progress ?? 0;
    const mast = topic.understanding_progress ?? 0;

    if (status === 'Completed' || comp === 100) {
      return {
        icon: CheckCircle2,
        color: 'text-[#2f6b5c] dark:text-[#7fd1b9] bg-[#e3f3ee] dark:bg-[#1c3a32] border-[#2f6b5c]/30 dark:border-[#7fd1b9]/30',
        badge: 'Completed',
        badgeColor: 'bg-[#e3f3ee] text-[#2f6b5c] dark:bg-[#1c3a32] dark:text-[#7fd1b9]'
      };
    }
    if (status === 'In Progress' || comp > 0) {
      if (comp > 80 && mast < 40) {
        return {
          icon: AlertTriangle,
          color: 'text-[#8a5a24] dark:text-[#dcb579] bg-[#f5ecdb] dark:bg-[#3a2c14] border-[#8a5a24]/30 dark:border-[#dcb579]/30',
          badge: 'Needs Attention',
          badgeColor: 'bg-[#f5ecdb] text-[#8a5a24] dark:bg-[#3a2c14] dark:text-[#dcb579]'
        };
      }
      return {
        icon: PlayCircle,
        color: 'text-[#2f5378] dark:text-[#8fb4d9] bg-[#e4ecf5] dark:bg-[#182a40] border-[#2f5378]/30 dark:border-[#8fb4d9]/30 animate-pulse',
        badge: 'Currently Learning',
        badgeColor: 'bg-[#e4ecf5] text-[#2f5378] dark:bg-[#182a40] dark:text-[#8fb4d9]'
      };
    }
    if (status === 'Paused') {
      return {
        icon: PauseCircle,
        color: 'text-gray-400 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
        badge: 'Paused',
        badgeColor: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      };
    }
    return {
      icon: Circle,
      color: 'text-gray-300 dark:text-gray-600 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
      badge: 'Not Started',
      badgeColor: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
    };
  };

  const renderTopicNode = (topic, idx, isLast) => {
    const statusMeta = getStatusIcon(topic);
    const StatusIcon = statusMeta.icon;
    const isExpanded = expandedTopics[topic.id] !== false; // default expanded

    return (
      <div key={topic.id} className="relative flex items-start gap-4 group">
        {/* Connecting Vertical Line */}
        {!isLast && (
          <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700 group-hover:bg-[#3d7a75] dark:group-hover:bg-[#5fae9e] transition-colors" />
        )}

        {/* Status Node Icon — toggles completion on click */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (onUpdateTopic) {
              const nextStatus = topic.status === 'Completed' ? 'In Progress' : 'Completed';
              onUpdateTopic(topic.id, { status: nextStatus });
            } else {
              onSelectTopic(topic);
            }
          }}
          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 cursor-pointer shadow-sm transition-transform duration-200 hover:scale-110 ${statusMeta.color}`}
          title={topic.status === 'Completed' ? 'Click to mark In Progress' : 'Click to mark as Completed'}
        >
          <StatusIcon size={16} />
        </div>

        {/* Topic Card Content */}
        <div
          className="flex-1 p-4 bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm hover:shadow-md hover:border-[#3d7a75]/40 dark:hover:border-[#5fae9e]/40 transition-all mb-4"
        >
          {/* Top header with Title, Status, Mark Complete & Delete Topic */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div
              onClick={() => onSelectTopic(topic)}
              className="font-bold text-sm text-gray-900 dark:text-white hover:text-[#3d7a75] dark:hover:text-[#5fae9e] transition-colors cursor-pointer flex-1"
            >
              {topic.title}
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${statusMeta.badgeColor}`}>
                {statusMeta.badge}
              </span>

              {onUpdateTopic && (
                <button
                  type="button"
                  onClick={() => {
                    const nextStatus = topic.status === 'Completed' ? 'In Progress' : 'Completed';
                    onUpdateTopic(topic.id, { status: nextStatus });
                  }}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    topic.status === 'Completed'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'
                      : 'bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] hover:bg-[#d5ece4]'
                  }`}
                  title={topic.status === 'Completed' ? 'Mark as In Progress' : 'Mark Topic as Completed'}
                >
                  {topic.status === 'Completed' ? 'Undo Complete' : 'Mark Complete'}
                </button>
              )}

              {onDeleteTopic && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteTopic(topic.id);
                  }}
                  className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                  title="Delete topic"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {topic.description && (
            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
              {topic.description}
            </p>
          )}

          {/* Progress Indicators */}
          <div className="grid grid-cols-2 gap-3 py-2 border-t border-gray-100 dark:border-gray-700/60 text-xs">
            <div>
              <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                <span>Task Completion</span>
                <span className="font-semibold text-gray-700 dark:text-gray-300">{topic.completion_progress ?? 0}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#5fae9e] rounded-full transition-all duration-300"
                  style={{ width: `${topic.completion_progress ?? 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                <span>My Understanding</span>
                <span className="font-semibold text-[#7570ab] dark:text-[#b0aee0]">{topic.understanding_progress ?? 0}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#7570ab] dark:bg-[#b0aee0] rounded-full transition-all duration-300"
                  style={{ width: `${topic.understanding_progress ?? 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* Subtasks / Action Steps Checklist on the Card */}
          <div className="pt-3 border-t border-gray-100 dark:border-gray-700/60">
            <div className="flex items-center justify-between text-xs mb-2">
              <button
                type="button"
                onClick={() => toggleExpand(topic.id)}
                className="flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-300 hover:text-[#3d7a75] dark:hover:text-[#5fae9e] transition-colors cursor-pointer"
              >
                <span>Subtasks / Tasks ({topic.tasks?.length || 0})</span>
                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button
                type="button"
                onClick={() => onSelectTopic(topic)}
                className="text-[11px] font-medium text-[#3d7a75] dark:text-[#5fae9e] hover:underline flex items-center gap-1 cursor-pointer"
              >
                Open Workspace <ExternalLink size={11} />
              </button>
            </div>

            {isExpanded && (
              <div className="space-y-2 mt-2">
                {topic.tasks && topic.tasks.length > 0 ? (
                  <div className="space-y-1.5">
                    {topic.tasks.map(task => (
                      <div
                        key={task.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200/60 dark:border-gray-700/60 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 transition-colors"
                      >
                        <div
                          onClick={() => onToggleTask && onToggleTask(task.id, !task.completed)}
                          className="flex items-center gap-2.5 flex-1 cursor-pointer min-w-0"
                        >
                          {task.completed ? (
                            <CheckSquare size={16} className="text-[#2f6b5c] dark:text-[#7fd1b9] flex-shrink-0" />
                          ) : (
                            <Square size={16} className="text-gray-400 flex-shrink-0" />
                          )}
                          <span className={`text-xs truncate ${task.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                            {task.title}
                          </span>
                        </div>
                        {onDeleteTask && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTask(topic.id, task.id);
                            }}
                            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer flex-shrink-0 ml-2"
                            title="Delete subtask"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 italic py-1">
                    No subtasks yet. Add one below.
                  </div>
                )}

                {/* Inline Add Subtask Input */}
                {onAddTask && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const val = newSubtaskTitle[topic.id]?.trim();
                      if (!val) return;
                      onAddTask(topic.id, val);
                      setNewSubtaskTitle(prev => ({ ...prev, [topic.id]: '' }));
                    }}
                    className="flex items-center gap-1.5 pt-1"
                  >
                    <input
                      type="text"
                      placeholder="Add subtask / action step..."
                      value={newSubtaskTitle[topic.id] || ''}
                      onChange={(e) => setNewSubtaskTitle(prev => ({ ...prev, [topic.id]: e.target.value }))}
                      className="flex-1 text-xs px-2.5 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg dark:text-white outline-none focus:ring-1 focus:ring-[#3d7a75]"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Plus size={12} /> Add
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const hasPhases = phases && phases.length > 0;

  return (
    <div className="py-2">
      {hasPhases ? (
        <div className="space-y-6">
          {phases.map((phase, pIdx) => {
            const phaseTopics = topics.filter(t => t.phase_id === phase.id);
            return (
              <div key={phase.id} className="relative">
                {/* Phase Header Badge */}
                <div className="flex items-center gap-2 mb-4 px-3 py-1.5 bg-[#eae7f5] dark:bg-[#232042] border border-[#7570ab]/30 dark:border-[#b0aee0]/30 rounded-xl w-fit">
                  <Layers size={14} className="text-[#7570ab] dark:text-[#b0aee0]" />
                  <span className="font-bold text-xs text-[#4b4a8a] dark:text-[#b0aee0]">
                    Phase {pIdx + 1}: {phase.title}
                  </span>
                  {phase.completion_progress !== undefined && (
                    <span className="text-[10px] bg-[#7570ab]/20 dark:bg-[#b0aee0]/20 text-[#4b4a8a] dark:text-[#b0aee0] font-semibold px-2 py-0.5 rounded-full ml-1">
                      {phase.completion_progress}%
                    </span>
                  )}
                </div>

                <div className="pl-2 space-y-1">
                  {phaseTopics.length > 0 ? (
                    phaseTopics.map((topic, tIdx) =>
                      renderTopicNode(topic, tIdx, tIdx === phaseTopics.length - 1)
                    )
                  ) : (
                    <div className="text-xs text-gray-400 dark:text-gray-500 italic pl-6 py-2">
                      No topics added to this phase yet.
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {unphasedTopics.length > 0 && (
            <div className="pt-2">
              <div className="font-bold text-xs text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wider">
                Additional Topics
              </div>
              {unphasedTopics.map((topic, tIdx) =>
                renderTopicNode(topic, tIdx, tIdx === unphasedTopics.length - 1)
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {topics && topics.length > 0 ? (
            topics.map((topic, tIdx) =>
              renderTopicNode(topic, tIdx, tIdx === topics.length - 1)
            )
          ) : (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-xs">
              No topics in this learning journey yet. Click "+ Add Topic" to start building your roadmap.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
