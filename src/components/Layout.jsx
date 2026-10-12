import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import AlarmTakeoverModal from './AlarmTakeoverModal';
import { useReminderScheduler } from '../hooks/useReminderScheduler';

export default function Layout({ children }) {
  // Continuously monitors active reminders and fires notifications when reminder times match
  useReminderScheduler();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isDashboard = location.pathname === '/';

  return (
    <div className="min-h-screen bg-[#080d12] text-[#f1f5f9] relative selection:bg-teal-500 selection:text-white">
      {/* ── Ambient Environmental Glows (Matching Reference Exactly) ── */}
      <div
        className="fixed top-0 right-0 w-[800px] h-[600px] pointer-events-none z-0 opacity-40 blur-[130px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(19, 138, 120, 0.25) 0%, rgba(13, 85, 76, 0.08) 50%, transparent 75%)'
        }}
      />
      <div
        className="fixed top-10 right-48 w-[400px] h-[350px] pointer-events-none z-0 opacity-30 blur-[100px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(217, 119, 6, 0.18) 0%, rgba(180, 83, 9, 0.05) 60%, transparent 80%)'
        }}
      />
      <div
        className="fixed bottom-0 left-60 w-[600px] h-[500px] pointer-events-none z-0 opacity-20 blur-[140px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(14, 116, 144, 0.2) 0%, transparent 70%)'
        }}
      />

      {/* Sidebar Navigation */}
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      {/* Main Content Area */}
      <div className="md:ml-60 min-h-screen flex flex-col relative z-10">
        {isDashboard ? (
          <TopBar onOpenMobileMenu={() => setMobileOpen(true)} />
        ) : (
          /* On mobile only, provide a minimal hamburger menu trigger when TopBar is hidden */
          <div className="md:hidden flex items-center justify-between py-3 px-3 mb-2 border-b border-white/[0.04]">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 text-slate-400 hover:text-white rounded-xl bg-[#0f1721] border border-white/[0.06] transition-colors cursor-pointer"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2">
              <img src="/habiz-logo.png" alt="HabiZ" className="w-5 h-5 object-contain" />
              <span className="text-xs font-bold text-slate-200">HabiZ</span>
            </div>
            <div className="w-8" />
          </div>
        )}

        <main className={`flex-1 px-3 sm:px-6 md:px-8 max-w-7xl w-full mx-auto pb-10 ${!isDashboard ? 'pt-4 sm:pt-6 md:pt-8' : ''}`}>
          {children}
        </main>

        {/* Global Editorial Footer matching reference */}
        <footer className="w-full max-w-7xl mx-auto px-4 sm:px-8 py-5 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>HabiZ</span>
            <span>•</span>
            <span>Build Better Habits</span>
            <span>•</span>
            <span className="text-slate-600">Version 1.0</span>
          </div>
          <div className="flex items-center gap-1.5 text-teal-400/80 font-medium">
            <span>“Progress, not perfection.”</span>
            <span>🌱</span>
          </div>
        </footer>
      </div>

      {/* Full-Screen Unskippable Alarm Takeover Overlay */}
      <AlarmTakeoverModal />
    </div>
  );
}
