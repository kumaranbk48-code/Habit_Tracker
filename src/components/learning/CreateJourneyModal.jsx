import { useState } from 'react';
import Modal from '../Modal';
import CustomDatePicker from '../CustomDatePicker';
import ContextualInfo from './ContextualInfo';
import {
  Sparkles, Plus, Trash2, ArrowRight, ArrowLeft, Check, Layers,
  Compass, Code, Music, Video, Palette, Languages, Camera, Target
} from 'lucide-react';

const DOMAIN_SUGGESTIONS = [
  { title: 'Master Data Structures & Algorithms in Java', category: 'Programming', icon: 'Code', goal: 'Solve 100 Medium LeetCode problems confidently' },
  { title: 'Become a Professional Video Editor', category: 'Video Editing', icon: 'Video', goal: 'Master color grading and cinematic cut transitions' },
  { title: 'Learn Acoustic Guitar Basics', category: 'Music', icon: 'Music', goal: 'Play 10 favorite songs with smooth chord switches' },
  { title: 'Conversational Japanese (N5)', category: 'Languages', icon: 'Languages', goal: 'Hold a 5-minute natural conversation in Japanese' },
  { title: 'Master Manual Mode Photography', category: 'Creative Skills', icon: 'Camera', goal: 'Capture sharp, well-exposed low light photos' },
];

export default function CreateJourneyModal({ isOpen, onClose, onCreate }) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    personal_goal: '',
    category: 'General',
    target_date: '',
    icon: 'Compass',
    structure_type: 'simple', // 'simple' or 'phases'
    phases: [
      { id: 'p1', title: 'Foundation', topics: [{ id: 't1', title: 'Basics & Setup', priority: 'High', tasks: [{ id: 'tk1', title: 'Complete initial overview' }] }] }
    ],
    topics: [
      { id: 't1', title: 'Topic 1', priority: 'Medium', tasks: [{ id: 'tk1', title: 'Initial action step' }] }
    ]
  });

  if (!isOpen) return null;

  const handleSelectSuggestion = (sugg) => {
    setForm(prev => ({
      ...prev,
      title: sugg.title,
      category: sugg.category,
      icon: sugg.icon,
      personal_goal: sugg.goal
    }));
  };

  const handleAddPhase = () => {
    setForm(prev => ({
      ...prev,
      phases: [
        ...prev.phases,
        { id: 'p_' + Date.now(), title: 'Phase ' + (prev.phases.length + 1), topics: [] }
      ]
    }));
  };

  const handleRemovePhase = (pIndex) => {
    setForm(prev => ({
      ...prev,
      phases: prev.phases.filter((_, i) => i !== pIndex)
    }));
  };

  const handleAddTopicToPhase = (pIndex) => {
    const updated = [...form.phases];
    updated[pIndex].topics.push({
      id: 't_' + Date.now(),
      title: 'New Topic',
      priority: 'Medium',
      tasks: [{ id: 'tk_' + Date.now(), title: 'First practice task' }]
    });
    setForm(prev => ({ ...prev, phases: updated }));
  };

  const handleRemoveTopicFromPhase = (pIndex, tIndex) => {
    const updated = [...form.phases];
    updated[pIndex].topics = updated[pIndex].topics.filter((_, i) => i !== tIndex);
    setForm(prev => ({ ...prev, phases: updated }));
  };

  const handleAddSimpleTopic = () => {
    setForm(prev => ({
      ...prev,
      topics: [
        ...prev.topics,
        { id: 't_' + Date.now(), title: 'New Topic', priority: 'Medium', tasks: [{ id: 'tk_' + Date.now(), title: 'Action item' }] }
      ]
    }));
  };

  const handleRemoveSimpleTopic = (tIndex) => {
    setForm(prev => ({
      ...prev,
      topics: prev.topics.filter((_, i) => i !== tIndex)
    }));
  };

  const handleAddTaskToTopic = (topicObj) => {
    if (!Array.isArray(topicObj.tasks)) {
      topicObj.tasks = [];
    }
    topicObj.tasks.push({ id: 'tk_' + Date.now(), title: 'New task' });
    setForm({ ...form });
  };

  const handleRemoveTaskFromTopic = (topicObj, taskIndex) => {
    if (!Array.isArray(topicObj.tasks)) return;
    topicObj.tasks = topicObj.tasks.filter((_, i) => i !== taskIndex);
    setForm({ ...form });
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      await onCreate(form);
      setStep(1);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Learning Journey" maxWidth="max-w-2xl">
      <div className="py-1">
        {/* Step Indicator Header */}
        <div className="flex items-center justify-between mb-6 px-2 text-xs font-semibold text-gray-500 border-b border-gray-100 dark:border-gray-800 pb-3">
          <div className={`flex items-center gap-1.5 ${step === 1 ? 'text-[#3d7a75] dark:text-[#5fae9e] font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] flex items-center justify-center text-[10px]">1</span>
            Basic Info
          </div>
          <ArrowRight size={12} className="text-gray-300" />
          <div className={`flex items-center gap-1.5 ${step === 2 ? 'text-[#3d7a75] dark:text-[#5fae9e] font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] flex items-center justify-center text-[10px]">2</span>
            Structure
          </div>
          <ArrowRight size={12} className="text-gray-300" />
          <div className={`flex items-center gap-1.5 ${step === 3 ? 'text-[#3d7a75] dark:text-[#5fae9e] font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] flex items-center justify-center text-[10px]">3</span>
            Topics
          </div>
          <ArrowRight size={12} className="text-gray-300" />
          <div className={`flex items-center gap-1.5 ${step === 4 ? 'text-[#3d7a75] dark:text-[#5fae9e] font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] flex items-center justify-center text-[10px]">4</span>
            Tasks
          </div>
          <ArrowRight size={12} className="text-gray-300" />
          <div className={`flex items-center gap-1.5 ${step === 5 ? 'text-[#3d7a75] dark:text-[#5fae9e] font-bold' : ''}`}>
            <span className="w-5 h-5 rounded-full bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9] flex items-center justify-center text-[10px]">5</span>
            Review
          </div>
        </div>

        {/* STEP 1: BASIC INFORMATION */}
        {step === 1 && (
          <div className="space-y-4 animate-fadeIn">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                Journey Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Master Data Structures & Algorithms, Become a Video Editor, Learn Guitar..."
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-[#3d7a75] dark:focus:ring-[#5fae9e] focus:outline-none dark:text-white"
              />
            </div>

            {/* Quick Inspiration Pills */}
            <div>
              <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
                <Sparkles size={12} className="text-[#c99a52]" /> Need inspiration? Click to use an example:
              </div>
              <div className="flex flex-wrap gap-2">
                {DOMAIN_SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSuggestion(s)}
                    className="text-left text-xs px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-[#eaf4f2] dark:hover:bg-[#1c3733] text-gray-700 dark:text-gray-300 hover:text-[#3d7a75] dark:hover:text-[#5fae9e] rounded-lg transition-colors border border-gray-200 dark:border-gray-700"
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  Category / Domain
                </label>
                <input
                  type="text"
                  placeholder="e.g. Software, Music, Fitness, Languages..."
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  Target End Date (Optional)
                </label>
                <CustomDatePicker
                  value={form.target_date}
                  onChange={e => setForm({ ...form, target_date: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs dark:text-white focus:ring-2 focus:ring-[#3d7a75] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
                Your Personal Goal / Motivation
              </label>
              <textarea
                rows={2}
                placeholder="What does success look like? (e.g. 'Crack my FAANG tech screen', 'Play 5 songs at a family gathering')"
                value={form.personal_goal}
                onChange={e => setForm({ ...form, personal_goal: e.target.value })}
                className="w-full px-3.5 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs dark:text-white resize-none"
              />
            </div>
          </div>
        )}

        {/* STEP 2: ORGANIZE YOUR JOURNEY */}
        {step === 2 && (
          <div className="space-y-4 animate-fadeIn">
            <ContextualInfo type="phase" />

            <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-2">
              How would you like to organize your journey?
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                onClick={() => setForm({ ...form, structure_type: 'simple' })}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${form.structure_type === 'simple'
                    ? 'border-[#3d7a75] dark:border-[#5fae9e] bg-[#eaf4f2]/50 dark:bg-[#1c3733]/40 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-sm text-gray-900 dark:text-white">Option A: Simple Structure</div>
                  {form.structure_type === 'simple' && <Check size={16} className="text-[#3d7a75] dark:text-[#5fae9e]" />}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Journey → Topics → Tasks
                </div>
                <div className="p-2.5 bg-white dark:bg-gray-800 rounded-xl text-[11px] font-mono text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700 space-y-1">
                  <div>DSA in Java</div>
                  <div className="pl-3 text-[#3d7a75] dark:text-[#5fae9e]">└── Arrays</div>
                  <div className="pl-6 text-gray-400">└── Learn traversal</div>
                </div>
                <div className="text-[11px] text-gray-500 mt-3">Best for focused or straightforward learning goals.</div>
              </div>

              <div
                onClick={() => setForm({ ...form, structure_type: 'phases' })}
                className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${form.structure_type === 'phases'
                    ? 'border-[#3d7a75] dark:border-[#5fae9e] bg-[#eaf4f2]/50 dark:bg-[#1c3733]/40 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-sm text-gray-900 dark:text-white">Option B: Organized with Phases</div>
                  {form.structure_type === 'phases' && <Check size={16} className="text-[#3d7a75] dark:text-[#5fae9e]" />}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Journey → Phases → Topics → Tasks
                </div>
                <div className="p-2.5 bg-white dark:bg-gray-800 rounded-xl text-[11px] font-mono text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700 space-y-1">
                  <div>Full Stack Web</div>
                  <div className="pl-2 text-[#7570ab] dark:text-[#b0aee0]">├── Phase 1: Frontend</div>
                  <div className="pl-5 text-[#3d7a75] dark:text-[#5fae9e]">│   └── HTML & CSS</div>
                  <div className="pl-2 text-[#7570ab] dark:text-[#b0aee0]">└── Phase 2: Backend</div>
                </div>
                <div className="text-[11px] text-gray-500 mt-3">Best for multi-stage skills or extensive roadmaps.</div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: ADD TOPICS */}
        {step === 3 && (
          <div className="space-y-4 animate-fadeIn">
            <ContextualInfo type="topic" />

            {form.structure_type === 'phases' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-gray-200">Phases & Topics</h4>
                  <button
                    type="button"
                    onClick={handleAddPhase}
                    className="flex items-center gap-1 text-xs text-[#3d7a75] dark:text-[#5fae9e] font-semibold hover:underline"
                  >
                    <Plus size={14} /> Add Phase
                  </button>
                </div>

                {form.phases.map((phase, pIdx) => (
                  <div key={phase.id} className="p-3.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={phase.title}
                        onChange={e => {
                          const updated = [...form.phases];
                          updated[pIdx].title = e.target.value;
                          setForm({ ...form, phases: updated });
                        }}
                        className="font-bold text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 rounded-lg text-gray-900 dark:text-white"
                        placeholder="Phase Title"
                      />
                      {form.phases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePhase(pIdx)}
                          className="text-gray-400 hover:text-[#b3453f] dark:hover:text-[#e2a8a3] p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    <div className="pl-3 space-y-2">
                      {phase.topics.map((topic, tIdx) => (
                        <div key={topic.id} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={topic.title}
                            onChange={e => {
                              const updated = [...form.phases];
                              updated[pIdx].topics[tIdx].title = e.target.value;
                              setForm({ ...form, phases: updated });
                            }}
                            className="flex-1 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 rounded-lg text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-[#3d7a75]"
                            placeholder="Topic title..."
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveTopicFromPhase(pIdx, tIdx)}
                            className="text-gray-400 hover:text-[#b3453f] dark:hover:text-[#e2a8a3] p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                            title="Delete topic"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => handleAddTopicToPhase(pIdx)}
                        className="text-[11px] text-[#3d7a75] dark:text-[#5fae9e] font-medium flex items-center gap-1 hover:underline pt-1 cursor-pointer"
                      >
                        <Plus size={12} /> Add Topic to {phase.title}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-gray-200">Topics to Learn</h4>
                  <button
                    type="button"
                    onClick={handleAddSimpleTopic}
                    className="flex items-center gap-1 text-xs text-[#3d7a75] dark:text-[#5fae9e] font-semibold hover:underline cursor-pointer"
                  >
                    <Plus size={14} /> Add Topic
                  </button>
                </div>

                {form.topics.map((topic, tIdx) => (
                  <div key={topic.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={topic.title}
                      onChange={e => {
                        const updated = [...form.topics];
                        updated[tIdx].title = e.target.value;
                        setForm({ ...form, topics: updated });
                      }}
                      className="flex-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-xl text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-[#3d7a75]"
                      placeholder="e.g. Arrays, Color Grading, Guitar Chords..."
                    />
                    {form.topics.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSimpleTopic(tIdx)}
                        className="text-gray-400 hover:text-[#b3453f] dark:hover:text-[#e2a8a3] p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                        title="Delete topic"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 4: ADD TASKS */}
        {step === 4 && (
          <div className="space-y-4 animate-fadeIn">
            <ContextualInfo type="task" />

            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-2">
              Actionable Tasks per Topic
            </h4>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {(form.structure_type === 'phases'
                ? form.phases.flatMap(p => p.topics)
                : form.topics
              ).map(topic => (
                <div key={topic.id} className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
                  <div className="font-semibold text-xs text-[#2f5378] dark:text-[#8fb4d9]">
                    Topic: {topic.title || 'Untitled Topic'}
                  </div>

                  <div className="space-y-1.5 pl-2">
                    {topic.tasks.map((task, tkIdx) => (
                      <div key={task.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={task.title}
                          onChange={e => {
                            task.title = e.target.value;
                            setForm({ ...form });
                          }}
                          className="flex-1 text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 rounded-lg text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-[#3d7a75]"
                          placeholder="Actionable task..."
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveTaskFromTopic(topic, tkIdx)}
                          className="text-gray-400 hover:text-[#b3453f] dark:hover:text-[#e2a8a3] p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                          title="Delete sub task"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    {topic.tasks.length === 0 && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 italic py-1">
                        No sub tasks yet. Click below to add an action step.
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddTaskToTopic(topic)}
                    className="text-[11px] text-[#3d7a75] dark:text-[#5fae9e] font-medium flex items-center gap-1 hover:underline pt-1 cursor-pointer"
                  >
                    <Plus size={12} /> Add Task to {topic.title || 'Topic'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 5: REVIEW AND START */}
        {step === 5 && (
          <div className="space-y-4 animate-fadeIn">
            <div className="text-center py-2">
              <h4 className="text-lg font-bold text-gray-900 dark:text-white">Review Your Learning Journey</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">Everything looks great! Confirm below to launch your workspace.</p>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-2xl space-y-3 font-mono text-xs max-h-64 overflow-y-auto">
              <div className="font-bold text-[#3d7a75] dark:text-[#5fae9e] text-sm font-sans">
                {form.title}
              </div>
              {form.personal_goal && (
                <div className="text-gray-500 font-sans text-xs italic">
                  Goal: {form.personal_goal}
                </div>
              )}

              {form.structure_type === 'phases' ? (
                form.phases.map(p => (
                  <div key={p.id} className="pl-2 space-y-1">
                    <div className="text-[#7570ab] dark:text-[#b0aee0] font-semibold">├── {p.title}</div>
                    {p.topics.map(t => (
                      <div key={t.id} className="pl-4 space-y-0.5">
                        <div className="text-[#3d7a75] dark:text-[#5fae9e]">│   ├── {t.title}</div>
                        {t.tasks.map(tk => (
                          <div key={tk.id} className="pl-8 text-gray-500 dark:text-gray-400 text-[11px]">
                            │   │   • {tk.title}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                form.topics.map(t => (
                  <div key={t.id} className="pl-2 space-y-0.5">
                    <div className="text-[#3d7a75] dark:text-[#5fae9e]">├── {t.title}</div>
                    {t.tasks.map(tk => (
                      <div key={tk.id} className="pl-6 text-gray-500 dark:text-gray-400 text-[11px]">
                        │   • {tk.title}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Modal Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-800 mt-6">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-[#eef2f4] dark:hover:bg-[#222b33] px-3.5 py-2 rounded-xl transition-colors"
            >
              <ArrowLeft size={14} /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && !form.title.trim()) return;
                setStep(step + 1);
              }}
              disabled={step === 1 && !form.title.trim()}
              className="flex items-center gap-1.5 text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] dark:bg-[#5fae9e] dark:hover:bg-[#4c9484] disabled:opacity-50 text-white dark:text-[#0e2320] px-5 py-2.5 rounded-xl shadow-sm transition-all"
            >
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] dark:bg-[#5fae9e] dark:hover:bg-[#4c9484] text-white dark:text-[#0e2320] px-6 py-2.5 rounded-xl shadow-md transition-all"
            >
              {submitting ? 'Creating...' : 'Create Journey'} <Check size={14} />
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
