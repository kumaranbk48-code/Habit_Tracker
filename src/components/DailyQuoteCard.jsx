import { useState, useMemo } from 'react';
import { Quote, Sparkles, RefreshCw, Copy, Check } from 'lucide-react';
import { MOTIVATIONAL_QUOTES } from '../constants/quotes';

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
  const [animating, setAnimating] = useState(false);

  const quote = MOTIVATIONAL_QUOTES[currentIdx];

  const handleNextRandom = () => {
    setAnimating(true);
    setTimeout(() => {
      let nextIdx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
      if (nextIdx === currentIdx) {
        nextIdx = (currentIdx + 1) % MOTIVATIONAL_QUOTES.length;
      }
      setCurrentIdx(nextIdx);
      setAnimating(false);
    }, 150);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(`"${quote.text}" — ${quote.author}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isTodayQuote = currentIdx === dailyIdx;

  return (
    <div className="habiz-panel h-[260px] p-5 sm:p-6 rounded-3xl relative overflow-hidden flex flex-col justify-between group shadow-xl">
      {/* Background Glow Overlay */}
      <div
        className="absolute -top-10 -right-10 w-36 h-36 pointer-events-none opacity-20 blur-3xl rounded-full"
        style={{ background: 'radial-gradient(circle, #178274 0%, transparent 70%)' }}
      />
      <div
        className="absolute -bottom-10 -left-10 w-36 h-36 pointer-events-none opacity-15 blur-3xl rounded-full"
        style={{ background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)' }}
      />

      {/* Top Header Row (Fixed Height) */}
      <div className="flex items-center justify-between gap-3 flex-shrink-0 relative z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center text-teal-300 flex-shrink-0">
            <Quote size={15} />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
              <span>Daily Motivation</span>
              {isTodayQuote && (
                <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-teal-950/70 text-teal-300 border border-teal-500/30">
                  Today
                </span>
              )}
            </h3>
            <p className="text-[10px] text-slate-400 truncate">Habit consistency wisdom</p>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-white/[0.04] text-amber-300 border border-amber-500/20 flex items-center gap-1 flex-shrink-0">
          <Sparkles size={11} className="text-amber-400" />
          #{quote.category || 'Mindset'}
        </span>
      </div>

      {/* Main Quote Content Area (Fixed Height with Vertically Centered Content) */}
      <div className="flex-1 flex flex-col justify-center my-2 relative z-10 overflow-hidden">
        <div
          className={`transition-all duration-200 ${
            animating ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
          }`}
        >
          <blockquote className="text-xs sm:text-sm font-medium text-slate-200 italic leading-relaxed line-clamp-3">
            "{quote.text}"
          </blockquote>
          <p className="text-[11px] font-bold text-teal-400 mt-2 flex items-center gap-1">
            — {quote.author}
          </p>
        </div>
      </div>

      {/* Action Footer (Fixed Height) */}
      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between relative z-10 text-xs flex-shrink-0">
        <button
          onClick={handleNextRandom}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 rounded-xl border border-white/[0.06] transition-all cursor-pointer text-xs font-medium active:scale-95"
        >
          <RefreshCw size={12} className={`text-teal-400 ${animating ? 'animate-spin' : ''}`} />
          <span>New Inspiration</span>
        </button>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] px-3 py-1.5 rounded-xl border border-white/[0.06] transition-all cursor-pointer text-xs font-medium active:scale-95"
          title="Copy quote"
        >
          {copied ? <Check size={12} className="text-teal-300" /> : <Copy size={12} className="text-slate-400" />}
          <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}
