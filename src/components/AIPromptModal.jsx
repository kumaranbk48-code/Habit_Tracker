import { useState } from 'react';
import Modal from './Modal';
import { Sparkles, Bot, ArrowRight, Check, Plus, Loader2 } from 'lucide-react';

export default function AIPromptModal({ open, onClose, onAddHabits }) {
  const [promptText, setPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const handleGenerate = () => {
    if (!promptText.trim()) return;
    setIsGenerating(true);

    setTimeout(() => {
      const input = promptText.toLowerCase();
      let generated = [];

      if (input.includes('sleep') || input.includes('rest') || input.includes('night')) {
        generated.push(
          { habit_name: 'No Screen 45 Mins Before Bed', category: 'Health', target_frequency: 'Daily', tracking_type: 'boolean', time_of_day: 'evening', color: '#8b5cf6', icon: 'Moon' },
          { habit_name: 'In Bed by 10:30 PM', category: 'Health', target_frequency: 'Daily', tracking_type: 'boolean', time_of_day: 'evening', color: '#6366f1', icon: 'Clock' }
        );
      }
      
      if (input.includes('read') || input.includes('book') || input.includes('learn')) {
        generated.push(
          { habit_name: 'Read 25 Pages', category: 'Learning', target_frequency: 'Daily', tracking_type: 'quantity', target_quantity: 25, unit: 'pages', time_of_day: 'evening', color: '#3b82f6', icon: 'Book' }
        );
      }

      if (input.includes('water') || input.includes('hydrat') || input.includes('drink')) {
        generated.push(
          { habit_name: 'Drink 3 Liters Water', category: 'Health', target_frequency: 'Daily', tracking_type: 'quantity', target_quantity: 3, unit: 'liters', time_of_day: 'anytime', color: '#06b6d4', icon: 'Droplets' }
        );
      }

      if (input.includes('run') || input.includes('fitness') || input.includes('gym') || input.includes('workout') || input.includes('exercise')) {
        generated.push(
          { habit_name: '30 Min Workout', category: 'Fitness', target_frequency: 'Daily', tracking_type: 'quantity', target_quantity: 30, unit: 'minutes', time_of_day: 'morning', color: '#10b981', icon: 'Activity' }
        );
      }

      if (generated.length === 0) {
        // Smart fallback parser
        const nameClean = promptText.trim().replace(/every\s+\w+/gi, '').replace(/\d+\s*mins?/gi, '').trim();
        generated.push({
          habit_name: nameClean.charAt(0).toUpperCase() + nameClean.slice(1),
          category: 'Productivity',
          target_frequency: 'Daily',
          tracking_type: 'boolean',
          time_of_day: 'morning',
          color: '#3b82f6',
          icon: 'Flame'
        });
      }

      setSuggestions(generated);
      setIsGenerating(false);
    }, 800);
  };

  const handleApplyAll = async () => {
    if (suggestions && suggestions.length > 0) {
      await onAddHabits(suggestions);
      setSuggestions(null);
      setPromptText('');
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="AI Smart Habit Assistant">
      <div className="space-y-4 py-1">
        <div className="flex items-center gap-3 p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-100 dark:border-blue-900/50 rounded-2xl">
          <Bot size={22} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <p className="text-xs text-blue-900 dark:text-blue-200">
            Tell AI your personal goals or describe a habit in natural language (e.g. <em>"Help me sleep better and read 20 pages every night"</em>).
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            Your Goal or Natural Language Input
          </label>
          <div className="flex gap-2">
            <input
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              placeholder="e.g. I want to build a high energy morning routine..."
              className="flex-1 px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !promptText.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-colors shadow-sm"
            >
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              <span>Generate</span>
            </button>
          </div>
        </div>

        {/* Suggestions Output */}
        {suggestions && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-500" />
                AI Generated Habits ({suggestions.length})
              </span>

              <button
                onClick={handleApplyAll}
                className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Plus size={14} /> Add All Habits
              </button>
            </div>

            <div className="space-y-2">
              {suggestions.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: h.color || '#3b82f6' }} />
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{h.habit_name}</span>
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {h.time_of_day} • {h.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
