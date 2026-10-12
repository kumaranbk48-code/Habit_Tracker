import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Calendar as CalendarIcon, Search, Menu, Command } from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import ThemeToggle from './ThemeToggle';
import GlobalSearchModal from './GlobalSearchModal';

export default function TopBar({ onOpenMobileMenu }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const initial = displayName.charAt(0).toUpperCase() || 'B';
  const avatar = user?.user_metadata?.avatar_url;

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });

  // Global Ctrl+K / Cmd+K shortcut listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenSearch = (e) => {
    e?.preventDefault();
    setSearchOpen(true);
  };

  return (
    <>
      <header className="w-full flex items-center justify-between gap-4 py-4 px-2 sm:px-4 mb-4 border-b border-white/[0.04]">
        {/* Left: Mobile menu button + Date */}
        <div className="flex items-center gap-3">
          {onOpenMobileMenu && (
            <button
              onClick={onOpenMobileMenu}
              className="md:hidden p-2 text-slate-400 hover:text-white rounded-xl bg-[#0f1721] border border-white/[0.06] transition-colors"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
          )}

          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400 font-medium">
            <CalendarIcon size={14} className="text-teal-400/80 hidden sm:inline" />
            <span className="text-slate-300 font-medium">{todayStr}</span>
          </div>
        </div>

        {/* Right: Search, Notifications, Theme, Avatar */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Interactive Search Bar / Trigger */}
          <button
            type="button"
            onClick={handleOpenSearch}
            className="group relative flex items-center gap-2.5 w-36 sm:w-56 md:w-64 pl-8 pr-2.5 py-1.5 text-xs rounded-xl bg-[#0e1620] border border-white/[0.08] hover:border-teal-500/40 text-slate-400 hover:text-slate-200 transition-all cursor-pointer shadow-xs text-left"
          >
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-teal-400 transition-colors pointer-events-none" />
            <span className="truncate">Search Habits...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-auto text-[10px] font-mono font-bold text-slate-400 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded-md">
              <span className="text-[11px]">⌘</span>K
            </kbd>
          </button>

          {/* Notifications & Theme */}
          <NotificationCenter />
          <ThemeToggle compact />

          {/* User Avatar Circle */}
          <button
            onClick={() => navigate('/profile')}
            title={displayName}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-[#1d534f] text-white flex items-center justify-center font-bold text-xs ring-2 ring-white/[0.08] hover:ring-teal-400/50 transition-all flex-shrink-0 cursor-pointer overflow-hidden shadow-sm"
          >
            {avatar ? (
              <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span>{initial}</span>
            )}
          </button>
        </div>
      </header>

      {/* Global Search & Command Modal */}
      <GlobalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialQuery={searchQuery}
      />
    </>
  );
}
