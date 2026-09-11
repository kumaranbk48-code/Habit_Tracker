import { useState } from 'react';
import { Target, CheckCircle, SkipForward, Clock, Plus, Sparkles, ChevronRight } from 'lucide-react';

export default function TodaysFocusCard({ focusItems = [], onCompleteTask, onSkipTask, onOpenJourney }) {
  const [items, setItems] = useState(focusItems);

  const handleComplete = (taskId) => {
    onCompleteTask(taskId);
    setItems(prev => prev.filter(i => i.id !== taskId));
  };

  const handleSkip = (taskId) => {
    if (onSkipTask) onSkipTask(taskId);
    setItems(prev => prev.filter(i => i.id !== taskId));
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-6 shadow-sm mb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#3d7a75] to-[#2d3f56] flex items-center justify-center text-white shadow-md shadow-[#3d7a75]/20">
            <Target size={18} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white text-base">Today's Focus</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Curated action steps to keep your momentum going today</p>
          </div>
        </div>
      </div>

      {items && items.length > 0 ? (
        <div className="space-y-3">
          {items.map(item => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-700/60 rounded-2xl hover:border-[#3d7a75]/30 dark:hover:border-[#5fae9e]/30 transition-all"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e3f3ee] dark:bg-[#1c3a32] text-[#2f6b5c] dark:text-[#7fd1b9]">
                    {item.journey_title || 'Journey'}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">• {item.topic_title || 'Topic'}</span>
                </div>
                <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                  {item.title}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleComplete(item.id)}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-[#3d7a75] hover:bg-[#2f5f5b] text-white px-3.5 py-1.5 rounded-xl shadow-sm transition-all"
                >
                  <CheckCircle size={14} /> Complete
                </button>
                <button
                  onClick={() => handleSkip(item.id)}
                  className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-[#eef2f4] dark:hover:bg-[#222b33] px-3 py-1.5 rounded-xl transition-colors"
                >
                  <SkipForward size={13} /> Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 px-4 bg-gray-50 dark:bg-gray-900/40 border border-dashed border-gray-200 dark:border-gray-700 rounded-2xl">
          <Sparkles size={24} className="text-[#c99a52] mx-auto mb-2 animate-bounce" />
          <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200 mb-1">All Caught Up for Today!</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-4">
            You've cleared your focus tasks for today. Ready to pick another topic or continue exploring your journey?
          </p>
        </div>
      )}
    </div>
  );
}
