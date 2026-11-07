import { Link, useNavigate } from 'react-router-dom';
import { Compass, Home, ArrowLeft, ListChecks } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#080d12] text-[#f1f5f9] flex items-center justify-center p-4 selection:bg-teal-500 selection:text-white relative overflow-hidden">
      {/* Ambient background glow */}
      <div
        className="fixed top-1/4 left-1/2 -translate-x-1/2 w-[550px] h-[450px] pointer-events-none opacity-20 blur-[130px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(45, 212, 191, 0.35) 0%, rgba(19, 138, 120, 0.1) 60%, transparent 80%)'
        }}
      />

      <main className="relative z-10 w-full max-w-md bg-[#0e1620] border border-white/[0.08] rounded-3xl p-6 sm:p-8 text-center shadow-2xl space-y-6">
        {/* Brand pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-300 text-xs font-semibold">
          <Compass size={14} className="animate-spin-slow" />
          <span>404 Error</span>
        </div>

        {/* Big Code */}
        <div className="space-y-2">
          <h1 className="text-6xl sm:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-300 via-teal-400 to-emerald-500 tracking-tighter">
            404
          </h1>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Page Not Found
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm mx-auto">
            The link you followed doesn't exist, has been moved, or may be temporarily unavailable.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 text-xs font-bold transition-all active:scale-95 cursor-pointer"
          >
            <ArrowLeft size={14} /> Go Back
          </button>
          <Link
            to="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#178274] hover:bg-[#136c60] text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <Home size={14} /> Dashboard
          </Link>
          <Link
            to="/habits"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-teal-500/25 bg-teal-500/10 hover:bg-teal-500/15 text-teal-300 text-xs font-bold transition-all active:scale-95 cursor-pointer"
          >
            <ListChecks size={14} /> My Habits
          </Link>
        </div>
      </main>
    </div>
  );
}

