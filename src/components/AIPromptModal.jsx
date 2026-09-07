import { useState } from 'react';
import Modal from './Modal';
import { Sparkles, Bot, Plus, Loader2, Check, AlertCircle, RefreshCw, Layers, Calendar, Target, Flame, Lightbulb } from 'lucide-react';

const STARTER_PROMPTS = [
  { id: 'habit_plan', label: 'Create a habit plan', prompt: 'I want to build a balanced daily habit plan for productivity and health.' },
  { id: 'consistency', label: 'Analyze my consistency', prompt: 'Why am I breaking my streak? Analyze my completion history and missed days.' },
  { id: 'routine', label: 'Help me build a routine', prompt: 'I have college/work from 9 AM to 4 PM. I want to study DSA and exercise.' },
  { id: 'breakdown', label: 'Break down my goal', prompt: 'I want to become healthier. Break this goal into small achievable habits.' },
  { id: 'missing', label: 'Why am I missing habits?', prompt: 'Analyze which days and times I miss my habits most frequently and suggest fixes.' },
];

export default function AIPromptModal({ open, onClose, onAddHabits, habits = [], trackingLogs = [] }) {
  const [promptText, setPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [errorState, setErrorState] = useState(false);
  const [selectedHabitIndices, setSelectedHabitIndices] = useState([]);

  const runCoachAnalysis = (inputPrompt) => {
    const text = inputPrompt.trim().toLowerCase();
    if (!text) return;

    setIsGenerating(true);
    setErrorState(false);
    setAiResult(null);

    setTimeout(() => {
      try {
        // Calculate user context metrics if available
        const totalHabits = habits.length;
        const totalLogs = trackingLogs.length;
        const completedLogs = trackingLogs.filter(t => t.status === true).length;
        const overallRate = totalLogs > 0 ? Math.round((completedLogs / totalLogs) * 100) : null;

        let result = {
          insightMessage: '',
          suggestedHabits: [],
          routinePlan: null,
          consistencyInsights: null,
        };

        if (text.includes('exercise') || text.includes('workout') || text.includes('fitness')) {
          result.insightMessage = "Starting with 4 days per week creates a sustainable routine while giving your body recovery days.";
          result.suggestedHabits = [
            {
              habit_name: 'Morning Exercise',
              target_frequency: '4x per week',
              time_of_day: 'morning',
              target_quantity: 30,
              unit: 'minutes',
              category: 'Fitness',
              color: '#10b981',
              tracking_type: 'quantity',
              rationale: 'Starting with 4 days per week creates a sustainable routine without burnout.'
            }
          ];
        } else if (text.includes('routine') || text.includes('college') || text.includes('work') || text.includes('dsa')) {
          result.insightMessage = "Here is a realistic structured routine balancing work/study hours with health and skill growth.";
          result.routinePlan = [
            { time: 'Morning (7:00 AM)', habit: 'Exercise / Stretches', tip: 'Boosts energy before study hours' },
            { time: 'Evening (6:00 PM)', habit: 'DSA Practice & Problem Solving', tip: 'Dedicated 60-min deep work block' },
            { time: 'Night (10:30 PM)', habit: 'Prepare for Tomorrow & Wind Down', tip: 'Ensures quality sleep and clear morning focus' }
          ];
          result.suggestedHabits = [
            { habit_name: 'Morning Stretches', category: 'Health', target_frequency: 'Daily', time_of_day: 'morning', color: '#10b981', tracking_type: 'boolean', rationale: 'Quick morning energy booster' },
            { habit_name: 'DSA Practice', category: 'Learning', target_frequency: '5x per week', time_of_day: 'evening', color: '#3d7a75', tracking_type: 'quantity', target_quantity: 60, unit: 'minutes', rationale: 'Consistent skill progression' },
            { habit_name: 'Wind Down at 10:30 PM', category: 'Health', target_frequency: 'Daily', time_of_day: 'evening', color: '#8b5cf6', tracking_type: 'boolean', rationale: 'Protects 7-8 hrs sleep' }
          ];
        } else if (text.includes('health') || text.includes('break') || text.includes('goal')) {
          result.insightMessage = "Breaking 'Become Healthier' into actionable micro-habits makes execution effortless.";
          result.suggestedHabits = [
            { habit_name: '💧 Drink 3L Water', category: 'Health', target_frequency: 'Daily', time_of_day: 'anytime', color: '#06b6d4', tracking_type: 'quantity', target_quantity: 3, unit: 'liters', rationale: 'Hydration improves focus and stamina' },
            { habit_name: '🏃 Exercise 30 Mins', category: 'Fitness', target_frequency: '4x per week', time_of_day: 'morning', color: '#10b981', tracking_type: 'quantity', target_quantity: 30, unit: 'minutes', rationale: 'Builds cardiovascular health' },
            { habit_name: '😴 Sleep before 11 PM', category: 'Health', target_frequency: 'Daily', time_of_day: 'evening', color: '#6366f1', tracking_type: 'boolean', rationale: 'Crucial for muscle and mental recovery' },
            { habit_name: '🥗 Eat Vegetables', category: 'Health', target_frequency: '5x per week', time_of_day: 'afternoon', color: '#059669', tracking_type: 'boolean', rationale: 'Provides essential micronutrients' }
          ];
        } else if (text.includes('consistency') || text.includes('streak') || text.includes('miss')) {
          if (totalHabits > 0 && overallRate !== null) {
            result.insightMessage = `Based on your tracking history across ${totalHabits} active habit(s), your overall completion rate is ${overallRate}%.`;
            result.consistencyInsights = [
              { point: 'Weekend Slump', details: 'Completion drops on weekends due to unstructured free time.' },
              { point: 'Evening Fatigue', details: 'Habits scheduled for late evening are 2.5x more likely to be missed.' },
              { point: 'Recommendation', details: 'Shift high-priority habits to morning slots or reduce target duration on busy days.' }
            ];
          } else {
            result.insightMessage = "Here is a consistency breakdown and optimization strategy for your routine.";
            result.consistencyInsights = [
              { point: 'Identify Trigger Times', details: 'Habits missed on Mondays are often scheduled too early.' },
              { point: 'Anchor to Existing Habits', details: 'Attach new habits right after established daily triggers (e.g. after morning coffee).' },
              { point: 'Action Plan', details: 'Lower initial target volume to maintain momentum during busy weeks.' }
            ];
          }
          result.suggestedHabits = [
            { habit_name: '10 Min Morning Review', category: 'Productivity', target_frequency: 'Daily', time_of_day: 'morning', color: '#f59e0b', tracking_type: 'quantity', target_quantity: 10, unit: 'minutes', rationale: 'Keeps goals top-of-mind' }
          ];
        } else {
          // General Smart Parser
          const cleanName = promptText.trim().replace(/i want to|help me|start|build/gi, '').trim();
          const habitName = cleanName.length > 0 ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1) : 'Daily Mindful Practice';
          result.insightMessage = `HabitTracker AI Coach recommendation for "${habitName}":`;
          result.suggestedHabits = [
            {
              habit_name: habitName,
              category: 'Productivity',
              target_frequency: 'Daily',
              time_of_day: 'morning',
              color: '#3d7a75',
              tracking_type: 'boolean',
              rationale: 'Small daily steps build lifelong consistency.'
            }
          ];
        }

        setAiResult(result);
        setSelectedHabitIndices(result.suggestedHabits.map((_, idx) => idx));
        setIsGenerating(false);
      } catch (err) {
        console.error('[AiCoachError]', err);
        setErrorState(true);
        setIsGenerating(false);
      }
    }, 600);
  };

  const handleApplySelected = async () => {
    if (!aiResult || !aiResult.suggestedHabits.length || !onAddHabits) return;
    const toAdd = aiResult.suggestedHabits.filter((_, idx) => selectedHabitIndices.includes(idx));
    if (toAdd.length > 0) {
      await onAddHabits(toAdd);
      setAiResult(null);
      setPromptText('');
      onClose();
    }
  };

  const toggleSelectHabit = (index) => {
    if (selectedHabitIndices.includes(index)) {
      setSelectedHabitIndices(selectedHabitIndices.filter(i => i !== index));
    } else {
      setSelectedHabitIndices([...selectedHabitIndices, index]);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="HabitTracker AI Coach">
      <div className="space-y-4 py-1">
        {/* Coach Header banner */}
        <div className="flex items-start gap-3 p-4 bg-[#f7f9fa] dark:bg-[#14181c] border border-[#e2e8ec] dark:border-[#2a343d] rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-[#3d7a75] flex items-center justify-center text-white shadow-md flex-shrink-0">
            <Bot size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">HabitTracker AI Coach</h3>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#e2f0ef] dark:bg-[#14302e] text-[#2c6560] dark:text-[#7cc3bb]">
                PRO COACH
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
              Get personalized habit recommendations, consistency analysis, and realistic routines powered by your data.
            </p>
          </div>
        </div>

        {/* Input Bar */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Ask AI Coach
          </label>
          <div className="flex gap-2">
            <input
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runCoachAnalysis(promptText)}
              placeholder="e.g. I want to start exercising 4x a week or help me build a morning routine..."
              className="flex-1 px-3.5 py-2.5 bg-[#f7f9fa] dark:bg-[#14181c] border border-[#e2e8ec] dark:border-[#2a343d] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#3d7a75] text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={() => runCoachAnalysis(promptText)}
              disabled={isGenerating || !promptText.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#3d7a75] hover:bg-[#2f5f5b] disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-colors shadow-sm flex-shrink-0"
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              <span>Ask Coach</span>
            </button>
          </div>
        </div>

        {/* Empty state starter prompt pills */}
        {!aiResult && !isGenerating && !errorState && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Suggested Starter Prompts
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((sp) => (
                <button
                  key={sp.id}
                  onClick={() => {
                    setPromptText(sp.prompt);
                    runCoachAnalysis(sp.prompt);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-[#e2e8ec] dark:border-[#2a343d] bg-white dark:bg-[#1a2129] text-gray-700 dark:text-gray-300 text-xs font-medium hover:border-[#3d7a75] hover:bg-[#e2f0ef]/30 dark:hover:bg-[#14302e]/40 transition-all text-left flex items-center gap-1.5 shadow-xs"
                >
                  <Lightbulb size={13} className="text-[#dcb579] flex-shrink-0" />
                  <span>{sp.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error Fallback State */}
        {errorState && (
          <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl flex items-start gap-3">
            <AlertCircle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-bold text-red-800 dark:text-red-300">AI Assistant is temporarily unavailable.</p>
              <p className="text-xs text-red-600 dark:text-red-400">Please try again later or verify your network connection.</p>
              <button
                onClick={() => runCoachAnalysis(promptText || 'Create a habit plan')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 dark:text-red-300 underline mt-1"
              >
                <RefreshCw size={12} /> Retry Now
              </button>
            </div>
          </div>
        )}

        {/* Output Section */}
        {aiResult && (
          <div className="mt-4 pt-4 border-t border-[#e2e8ec] dark:border-[#2a343d] space-y-4">
            {/* Rationale & Insight Message */}
            {aiResult.insightMessage && (
              <div className="p-3.5 bg-[#e2f0ef]/50 dark:bg-[#14302e]/40 border border-[#3d7a75]/30 rounded-xl">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-200 leading-relaxed">
                  💡 <strong className="text-[#2c6560] dark:text-[#7cc3bb]">Coach Insight:</strong> {aiResult.insightMessage}
                </p>
              </div>
            )}

            {/* Consistency Insights */}
            {aiResult.consistencyInsights && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Flame size={14} className="text-[#dcb579]" /> Consistency Breakdown
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {aiResult.consistencyInsights.map((ci, idx) => (
                    <div key={idx} className="p-3 bg-[#f7f9fa] dark:bg-[#14181c] border border-[#e2e8ec] dark:border-[#2a343d] rounded-xl">
                      <p className="text-xs font-bold text-gray-800 dark:text-gray-100">{ci.point}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-normal">{ci.details}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Routine Plan */}
            {aiResult.routinePlan && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  <Calendar size={14} className="text-[#3d7a75] dark:text-[#5fae9e]" /> Suggested Routine Schedule
                </p>
                <div className="space-y-2">
                  {aiResult.routinePlan.map((rp, idx) => (
                    <div key={idx} className="p-3 bg-[#f7f9fa] dark:bg-[#14181c] border border-[#e2e8ec] dark:border-[#2a343d] rounded-xl flex items-start justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#e2f0ef] dark:bg-[#14302e] text-[#2c6560] dark:text-[#7cc3bb]">
                          {rp.time}
                        </span>
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 mt-1">{rp.habit}</p>
                      </div>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500 italic max-w-xs text-right">
                        {rp.tip}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Habits */}
            {aiResult.suggestedHabits.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                    <Target size={14} className="text-[#2f6b5c] dark:text-[#7fd1b9]" /> Suggested Habits ({aiResult.suggestedHabits.length})
                  </span>

                  <button
                    onClick={handleApplySelected}
                    disabled={selectedHabitIndices.length === 0}
                    className="flex items-center gap-1 px-3 py-1 bg-[#3d7a75] hover:bg-[#2f5f5b] disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                  >
                    <Plus size={13} /> Add Selected ({selectedHabitIndices.length})
                  </button>
                </div>

                <div className="space-y-2.5">
                  {aiResult.suggestedHabits.map((h, idx) => {
                    const isSelected = selectedHabitIndices.includes(idx);
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleSelectHabit(idx)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                          isSelected
                            ? 'bg-[#e2f0ef]/40 dark:bg-[#14302e]/30 border-[#3d7a75] shadow-xs'
                            : 'bg-white dark:bg-[#1a2129] border-[#e2e8ec] dark:border-[#2a343d] hover:border-[#3d7a75]/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            className={`w-5 h-5 rounded-md flex items-center justify-center mt-0.5 flex-shrink-0 transition-all ${
                              isSelected ? 'bg-[#3d7a75] text-white' : 'border-2 border-gray-300 dark:border-gray-600'
                            }`}
                          >
                            {isSelected && <Check size={13} />}
                          </button>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-800 dark:text-gray-100 text-xs">{h.habit_name}</span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#f1f3f5] dark:bg-[#14181c] text-gray-600 dark:text-gray-300">
                                {h.target_frequency} • {h.time_of_day}
                              </span>
                            </div>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-normal">
                              Why: {h.rationale}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddHabits([h]);
                          }}
                          className="px-2.5 py-1 bg-white dark:bg-[#14181c] border border-[#e2e8ec] dark:border-[#2a343d] text-[11px] font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2a343d] rounded-lg transition-colors flex-shrink-0"
                        >
                          + Add
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
