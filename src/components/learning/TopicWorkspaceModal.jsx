import { useState, useEffect } from 'react';
import Modal from '../Modal';
import CustomSelect from '../CustomSelect';
import ContextualInfo from './ContextualInfo';
import {
  CheckSquare, Square, Plus, Link, FileText, Sparkles, Sliders,
  Trash2, ExternalLink, Globe, Video, BookOpen, Layers, CheckCircle
} from 'lucide-react';

export default function TopicWorkspaceModal({
  isOpen,
  onClose,
  topic,
  journeyId,
  onToggleTask,
  onAddTask,
  onDeleteTask,
  onUpdateTopic,
  onAddResource,
  onAddNote,
  onDeleteResource,
  onDeleteNote,
  onDeleteTopic
}) {
  const [activeTab, setActiveTab] = useState('tasks');
  const [taskInput, setTaskInput] = useState('');
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceType, setResourceType] = useState('Website');
  const [noteContent, setNoteContent] = useState('');
  const [masteryValue, setMasteryValue] = useState(0);

  useEffect(() => {
    if (topic) {
      setMasteryValue(topic.understanding_progress || 0);
    }
  }, [topic]);

  if (!isOpen || !topic) return null;

  const tasks = topic.tasks || [];
  const resources = topic.resources || [];
  const notes = topic.notes || [];

  const handleAddTaskSubmit = (e) => {
    e.preventDefault();
    if (!taskInput.trim()) return;
    onAddTask(topic.id, taskInput.trim());
    setTaskInput('');
  };

  const handleAddResourceSubmit = (e) => {
    e.preventDefault();
    if (!resourceTitle.trim() || !resourceUrl.trim()) return;
    onAddResource(topic.id, resourceTitle.trim(), resourceUrl.trim(), resourceType);
    setResourceTitle('');
    setResourceUrl('');
  };

  const handleAddNoteSubmit = (e) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    onAddNote(topic.id, noteContent.trim());
    setNoteContent('');
  };

  const handleMasteryChange = (val) => {
    const num = Math.min(100, Math.max(0, Number(val) || 0));
    setMasteryValue(num);
    onUpdateTopic(topic.id, { understanding_progress: num });
  };

  const handleStatusChange = (newStatus) => {
    onUpdateTopic(topic.id, { status: newStatus });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={topic.title} maxWidth="max-w-3xl">
      <div className="py-1 space-y-4">
        {/* Status & Category Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Status:</span>
            <CustomSelect
              value={topic.status || 'Not Started'}
              onChange={e => handleStatusChange(e.target.value)}
              className="text-xs font-semibold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-1.5 rounded-xl text-gray-900 dark:text-white focus:outline-none min-w-[130px]"
            >
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
              <option value="Paused">Paused</option>
            </CustomSelect>

            <button
              type="button"
              onClick={() => handleStatusChange(topic.status === 'Completed' ? 'In Progress' : 'Completed')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors cursor-pointer ${
                topic.status === 'Completed'
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300'
                  : 'bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] hover:bg-[#d5ece4]'
              }`}
            >
              {topic.status === 'Completed' ? 'Undo Complete' : 'Mark Complete'}
            </button>

            {onDeleteTopic && (
              <button
                type="button"
                onClick={() => {
                  onDeleteTopic(topic.id);
                  onClose();
                }}
                className="text-xs font-semibold text-red-500 hover:text-red-600 dark:text-red-400 px-2.5 py-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-1 transition-colors cursor-pointer ml-1"
                title="Delete this topic"
              >
                <Trash2 size={13} /> Delete Topic
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <div>
              <span className="text-gray-400 mr-1.5">Task Completion:</span>
              <span className="font-bold text-[#3d7a75] dark:text-[#5fae9e]">{topic.completion_progress ?? 0}%</span>
            </div>
            <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
            <div>
              <span className="text-gray-400 mr-1.5">My Understanding:</span>
              <span className="font-bold text-[#7570ab] dark:text-[#b0aee0]">{masteryValue}%</span>
            </div>
          </div>
        </div>

        {/* Dual Progress Rating Slider */}
        <div className="p-4 bg-[#eae7f5]/70 dark:bg-[#232042]/50 border border-[#eae7f5] dark:border-[#232042] rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#4b4a8a] dark:text-[#b0aee0] flex items-center gap-1.5">
              <Sliders size={14} className="text-[#7570ab] dark:text-[#b0aee0]" /> Personal Understanding / Mastery Level
            </span>
            <span className="font-extrabold text-[#7570ab] dark:text-[#b0aee0] text-sm">{masteryValue}%</span>
          </div>

          <p className="text-[11px] text-[#4b4a8a]/80 dark:text-[#b0aee0]/80">
            How confident do you feel about this topic? You manually own this score — task completion will not overwrite it.
          </p>

          <input
            type="range"
            min="0"
            max="100"
            value={masteryValue}
            onChange={e => handleMasteryChange(e.target.value)}
            className="w-full h-2 bg-[#eae7f5] dark:bg-[#232042] rounded-lg appearance-none cursor-pointer accent-[#7570ab]"
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'tasks'
                ? 'bg-[#3d7a75] text-white dark:bg-[#5fae9e] dark:text-[#0e2320] shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-[#eef2f4] dark:hover:bg-[#222b33]'
            }`}
          >
            <CheckSquare size={14} /> Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setActiveTab('resources')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'resources'
                ? 'bg-[#3d7a75] text-white dark:bg-[#5fae9e] dark:text-[#0e2320] shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-[#eef2f4] dark:hover:bg-[#222b33]'
            }`}
          >
            <Link size={14} /> Resources ({resources.length})
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
              activeTab === 'notes'
                ? 'bg-[#3d7a75] text-white dark:bg-[#5fae9e] dark:text-[#0e2320] shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:bg-[#eef2f4] dark:hover:bg-[#222b33]'
            }`}
          >
            <FileText size={14} /> Personal Notes ({notes.length})
          </button>
        </div>

        {/* TAB 1: TASKS CHECKLIST */}
        {activeTab === 'tasks' && (
          <div className="space-y-3 animate-fadeIn">
            <form onSubmit={handleAddTaskSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Add a new action step..."
                value={taskInput}
                onChange={e => setTaskInput(e.target.value)}
                className="flex-1 px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-[#3d7a75] dark:focus:ring-[#5fae9e] focus:outline-none dark:text-white"
              />
              <button
                type="submit"
                className="flex items-center gap-1 text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] dark:bg-[#5fae9e] dark:hover:bg-[#4c9484] text-white dark:text-[#0e2320] px-4 py-2 rounded-xl transition-all"
              >
                <Plus size={14} /> Add Task
              </button>
            </form>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {tasks.length > 0 ? (
                tasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-[#3d7a75]/50 dark:hover:border-[#5fae9e]/50 transition-all group"
                  >
                    <div
                      onClick={() => onToggleTask(task.id, !task.completed)}
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                    >
                      {task.completed ? (
                        <CheckSquare size={18} className="text-[#2f6b5c] dark:text-[#7fd1b9] flex-shrink-0" />
                      ) : (
                        <Square size={18} className="text-gray-400 flex-shrink-0" />
                      )}
                      <span className={`text-xs ${task.completed ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200 font-medium'}`}>
                        {task.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.priority && (
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase">
                          {task.priority}
                        </span>
                      )}
                      {onDeleteTask && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTask(topic.id, task.id);
                          }}
                          className="text-gray-400 hover:text-[#b3453f] dark:hover:text-[#e2a8a3] p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                          title="Delete task"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-xs">
                  No tasks added yet for this topic. Add your first action step above.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: RESOURCES */}
        {activeTab === 'resources' && (
          <div className="space-y-3 animate-fadeIn">
            <form onSubmit={handleAddResourceSubmit} className="p-3 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Resource Title"
                  value={resourceTitle}
                  onChange={e => setResourceTitle(e.target.value)}
                  className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs dark:text-white"
                />
                <input
                  type="url"
                  placeholder="URL (https://...)"
                  value={resourceUrl}
                  onChange={e => setResourceUrl(e.target.value)}
                  className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs dark:text-white"
                />
                <CustomSelect
                  value={resourceType}
                  onChange={e => setResourceType(e.target.value)}
                  className="px-3 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-xs dark:text-white min-w-[120px]"
                >
                  <option value="Website">Website</option>
                  <option value="Video">Video</option>
                  <option value="Article">Article</option>
                  <option value="Documentation">Documentation</option>
                  <option value="Course">Course</option>
                  <option value="Other">Other</option>
                </CustomSelect>
              </div>
              <button
                type="submit"
                className="w-full text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] dark:bg-[#5fae9e] dark:hover:bg-[#4c9484] text-white dark:text-[#0e2320] py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                <Plus size={14} /> Add Resource Link
              </button>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {resources.length > 0 ? (
                resources.map(res => (
                  <div key={res.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Globe size={16} className="text-[#3d7a75] dark:text-[#5fae9e] flex-shrink-0" />
                      <div>
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-xs text-[#3d7a75] dark:text-[#5fae9e] hover:underline flex items-center gap-1"
                        >
                          {res.title} <ExternalLink size={12} />
                        </a>
                        <span className="text-[10px] text-gray-400 font-medium">{res.resource_type}</span>
                      </div>
                    </div>
                    {onDeleteResource && (
                      <button
                        onClick={() => onDeleteResource(res.id)}
                        className="text-gray-400 hover:text-[#b3453f] dark:hover:text-[#e2a8a3] p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-xs">
                  No external resources attached yet. Add website links, documentation, or videos above.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: NOTES */}
        {activeTab === 'notes' && (
          <div className="space-y-3 animate-fadeIn">
            <form onSubmit={handleAddNoteSubmit} className="space-y-2">
              <textarea
                rows={3}
                placeholder="Write your personal notes, formulas, reflections, or cheat sheets..."
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                className="w-full px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-[#3d7a75] dark:focus:ring-[#5fae9e] focus:outline-none dark:text-white resize-none"
              />
              <button
                type="submit"
                className="text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] dark:bg-[#5fae9e] dark:hover:bg-[#4c9484] text-white dark:text-[#0e2320] px-4 py-2 rounded-xl transition-colors flex items-center gap-1"
              >
                <Plus size={14} /> Save Note
              </button>
            </form>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {notes.length > 0 ? (
                notes.map(note => (
                  <div key={note.id} className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl relative group">
                    <p className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                      {note.content}
                    </p>
                    <div className="text-[10px] text-gray-400 mt-2 flex items-center justify-between">
                      <span>{new Date(note.created_at).toLocaleDateString()}</span>
                      {onDeleteNote && (
                        <button
                          onClick={() => onDeleteNote(note.id)}
                          className="text-gray-400 hover:text-[#b3453f] dark:hover:text-[#e2a8a3] p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-xs">
                  No personal notes written yet. Keep your notes organized for quick reference.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
