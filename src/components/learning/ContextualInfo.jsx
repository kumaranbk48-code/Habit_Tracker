import { useState } from 'react';
import { HelpCircle, X, Info } from 'lucide-react';

const GUIDANCE_TYPES = {
  phase: {
    title: 'What is a Phase?',
    description: 'Use phases to group related topics together into milestone stages (e.g., "Foundation", "Core Skills", "Advanced Projects"). You can skip phases if your journey is simple.',
  },
  topic: {
    title: 'What is a Topic?',
    description: 'A topic is a specific skill or subject area you want to learn. Examples: "Arrays", "Color Grading", "Guitar Chords", or "Japanese Grammar".',
  },
  task: {
    title: 'What is a Task?',
    description: 'Break a topic into small, actionable steps. Example for Color Grading: "Learn color theory", "Practice on sample clip", "Export LUT".',
  },
  progress: {
    title: 'Completion vs. Mastery',
    description: 'Completion Progress is calculated automatically from finished tasks. Personal Mastery (Understanding) is set manually by you to measure how confident you feel about the material.',
  }
};

export default function ContextualInfo({ type, compact = false }) {
  const [open, setOpen] = useState(false);
  const info = GUIDANCE_TYPES[type];

  if (!info) return null;

  if (compact) {
    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-gray-400 hover:text-[#3d7a75] dark:hover:text-[#5fae9e] transition-colors p-0.5 rounded-full"
          title={info.title}
        >
          <HelpCircle size={14} />
        </button>

        {open && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-gray-900 text-white dark:bg-gray-800 border border-gray-700 rounded-xl p-3 shadow-xl text-xs z-50 animate-fadeIn">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-semibold text-[#8fd0c4] flex items-center gap-1">
                <Info size={12} /> {info.title}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={12} />
              </button>
            </div>
            <p className="text-gray-300 leading-relaxed text-[11px]">{info.description}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-[#e4ecf5]/70 dark:bg-[#182a40]/40 border border-[#e4ecf5] dark:border-[#182a40] rounded-xl p-3.5 flex items-start gap-3 my-2 text-xs">
      <div className="p-1.5 bg-[#d0e0ed] dark:bg-[#223954] rounded-lg text-[#2f5378] dark:text-[#8fb4d9] flex-shrink-0">
        <Info size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#182a40] dark:text-[#f1f5f9] mb-0.5">{info.title}</div>
        <p className="text-[#2f5378] dark:text-[#8fb4d9] leading-relaxed">{info.description}</p>
      </div>
    </div>
  );
}
