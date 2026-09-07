import { useState, useMemo } from 'react';
import { Quote, Sparkles, RefreshCw, Copy, Check } from 'lucide-react';

const MOTIVATIONAL_QUOTES = [
  { text: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.", author: "Aristotle", category: "Excellence" },
  { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma", category: "Consistency" },
  { text: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear", category: "Systems" },
  { text: "Motivation is what gets you started. Habit is what keeps you going.", author: "Jim Ryun", category: "Discipline" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier", category: "Persistence" },
  { text: "First we make our habits, then our habits make us.", author: "John Dryden", category: "Mindset" },
  { text: "It is easier to prevent bad habits than to break them.", author: "Benjamin Franklin", category: "Wisdom" },
  { text: "Chains of habit are too light to be felt until they are too heavy to be broken.", author: "Warren Buffett", category: "Awareness" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali", category: "Focus" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso", category: "Action" },
  { text: "The secret of your future is hidden in your daily routine.", author: "Mike Murdock", category: "Routine" },
  { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln", category: "Discipline" },
  { text: "Be not afraid of growing slowly, be afraid only of standing still.", author: "Chinese Proverb", category: "Growth" },
  { text: "Energy flows where attention goes.", author: "Tony Robbins", category: "Focus" },
  { text: "Your life does not get better by chance, it gets better by change.", author: "Jim Rohn", category: "Change" },
  { text: "Continuous effort—not strength or intelligence—is the key to unlocking our potential.", author: "Winston Churchill", category: "Perseverance" },
  { text: "Success isn't always about greatness. It's about consistency. Consistent hard work leads to success.", author: "Dwayne Johnson", category: "Consistency" },
  { text: "The difference between who you are and who you want to be is what you do.", author: "Bill Phillips", category: "Identity" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe", category: "Action" },
  { text: "A year from now you may wish you had started today.", author: "Karen Lamb", category: "Momentum" },
  { text: "Do something today that your future self will thank you for.", author: "Sean Patrick Flanery", category: "Future Self" },
  { text: "You don't have to be extreme, just consistent.", author: "Anonymous", category: "Consistency" },
  { text: "Habits are the compound interest of self-improvement.", author: "James Clear", category: "Compounding" },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle", category: "Excellence" },
  { text: "The only bad workout is the one that didn't happen.", author: "Anonymous", category: "Action" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt", category: "Belief" },
  { text: "Focus on progress, not perfection.", author: "Bill Gates", category: "Progress" },
  { text: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh", category: "Mastery" },
  { text: "The secret to getting ahead is getting started.", author: "Mark Twain", category: "Initiative" },
  { text: "Routine, in an intelligent man, is a sign of ambition.", author: "W. H. Auden", category: "Ambition" },
  { text: "Consistency is the true foundation of trust in yourself.", author: "Roy T. Bennett", category: "Self-Trust" },
];

function getDailyQuoteIndex() {
  const today = new Date();
  const start = new Date(today.getFullYear(), 0, 0);
  const diff = today - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  return dayOfYear % MOTIVATIONAL_QUOTES.length;
}

export default function DailyQuoteCard() {
  const dailyIdx = useMemo(() => getDailyQuoteIndex(), []);
  const [currentIdx, setCurrentIdx] = useState(dailyIdx);
  const [copied, setCopied] = useState(false);

  const quote = MOTIVATIONAL_QUOTES[currentIdx];

  const handleNextRandom = () => {
    let nextIdx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
    if (nextIdx === currentIdx) {
      nextIdx = (currentIdx + 1) % MOTIVATIONAL_QUOTES.length;
    }
    setCurrentIdx(nextIdx);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`"${quote.text}" — ${quote.author}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isTodayQuote = currentIdx === dailyIdx;

  return (
    <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white rounded-2xl p-6 shadow-md border border-indigo-800/50 flex flex-col justify-between relative overflow-hidden group">
      {/* Background Glow Overlay */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-3 mb-4 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
            <Quote size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              Daily Motivation
              {isTodayQuote && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/30 text-blue-200 border border-blue-400/30">
                  Today's Quote
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400">Fresh daily wisdom for habit consistency</p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/10 text-indigo-200 border border-white/10 flex items-center gap-1">
          <Sparkles size={12} className="text-amber-400" />
          #{quote.category}
        </span>
      </div>

      {/* Main Quote Content */}
      <div className="my-3 z-10">
        <blockquote className="text-base sm:text-lg font-medium text-slate-100 italic leading-relaxed">
          "{quote.text}"
        </blockquote>
        <p className="text-xs font-semibold text-blue-300 mt-2.5 flex items-center gap-1">
          — {quote.author}
        </p>
      </div>

      {/* Action Footer */}
      <div className="pt-4 mt-2 border-t border-white/10 flex items-center justify-between z-10 text-xs">
        <button
          onClick={handleNextRandom}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 transition-colors"
        >
          <RefreshCw size={13} className="text-blue-400" />
          <span>New Inspiration</span>
        </button>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 transition-colors"
        >
          {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className="text-blue-400" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}
