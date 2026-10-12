import { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import {
  LayoutDashboard, ListChecks, Calendar, Target, Bell, BarChart3, User,
  LogOut, GraduationCap, X, Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateXP } from '../hooks/useGamification';

const NAV = [
  { to: '/',          label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/habits',    label: 'My Habits',    icon: ListChecks },
  { to: '/learning',  label: 'Learning Hub', icon: GraduationCap },
  { to: '/goals',     label: 'Goals',        icon: Target },
  { to: '/calendar',  label: 'Calendar',     icon: Calendar },
  { to: '/reminders', label: 'Reminders',    icon: Bell },
  { to: '/reports',   label: 'Reports',      icon: BarChart3 },
  { to: '/profile',   label: 'Profile',      icon: User },
];

export default function Sidebar({ mobileOpen = false, onCloseMobile }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dashStats, setDashStats] = useState(null);

  const fetchSidebarStats = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setDashStats(null);
      return;
    }
    try {
      const res = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) setDashStats(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    fetchSidebarStats();
  }, [fetchSidebarStats, location.pathname, user?.id]);

  useEffect(() => {
    const handleUpdate = () => fetchSidebarStats();
    window.addEventListener('habittracker-stats-updated', handleUpdate);
    return () => window.removeEventListener('habittracker-stats-updated', handleUpdate);
  }, [fetchSidebarStats]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  const displayName = user?.user_metadata?.full_name
    || user?.email?.split('@')[0] || 'Bharathkumaran';
  const email = user?.email || 'kumarankbk48@gmail.com';
  const avatar = user?.user_metadata?.avatar_url;
  const initial = displayName.charAt(0).toUpperCase() || 'B';
  const streak = dashStats?.currentStreak || 0;

  const NavItem = ({ item }) => (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={() => onCloseMobile?.()}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-colors duration-150 group relative ${
          isActive
            ? 'text-[#2dd4bf]'
            : 'text-[#8899a8] hover:text-[#f1f5f9] hover:bg-[#121b25]/60'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.div
              layoutId="sidebarActivePill"
              className="absolute inset-0 bg-[#122e2c] border border-[#2dd4bf]/25 rounded-xl shadow-[0_0_15px_rgba(45,212,191,0.12)] z-0"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <item.icon
            size={17}
            className={`transition-colors relative z-10 ${
              isActive ? 'text-[#2dd4bf]' : 'text-[#64748b] group-hover:text-slate-300'
            }`}
          />
          <span className="flex-1 relative z-10">{item.label}</span>
          {item.label === 'My Habits' && streak > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 relative z-10 ${
              isActive
                ? 'bg-[#2dd4bf]/20 text-[#2dd4bf]'
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
            }`}>
              🔥 {streak}
            </span>
          )}
        </>
      )}
    </NavLink>
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#080d12] border-r border-white/[0.05] select-none">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center p-1.5 flex-shrink-0 shadow-md ring-1 ring-[#2dd4bf]/25 bg-[#0b131a] relative overflow-hidden">
          <div className="absolute inset-0 bg-[#2dd4bf]/10 blur-sm" />
          <img src="/habiz-logo.png" alt="HabiZ" className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_8px_rgba(45,212,191,0.4)]" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-white text-base tracking-tight leading-tight">HabiZ</div>
          <div className="text-[11px] text-[#2dd4bf]/80 font-medium tracking-wide">Small habits. Big shifts.</div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto scrollbar-none py-2">
        {NAV.map(item => (
          <NavItem key={item.to} item={item} />
        ))}
      </nav>

      {/* Inspirational Quote */}
      <div className="px-4 py-3 mx-3 my-2 rounded-xl bg-[#0c141d]/70 border border-white/[0.04]">
        <p className="text-[11px] text-[#718292] leading-relaxed italic">
          Progress isn't loud,
          <br />
          it's consistent.
        </p>
      </div>

      {/* User Footer Profile */}
      <div className="p-3 mx-2 mb-3 mt-1 rounded-2xl bg-[#0c131a] border border-white/[0.05]">
        <div className="flex items-center gap-2.5">
          <div
            onClick={() => { onCloseMobile?.(); navigate('/profile'); }}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-[#1d534f] text-white flex items-center justify-center font-bold text-xs ring-1 ring-white/10 flex-shrink-0 cursor-pointer overflow-hidden"
          >
            {avatar ? (
              <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div
            onClick={() => { onCloseMobile?.(); navigate('/profile'); }}
            className="flex-1 min-w-0 cursor-pointer"
          >
            <div className="text-xs font-semibold text-slate-200 truncate hover:text-teal-400 transition-colors">
              {displayName}
            </div>
            <div className="text-[10px] text-slate-500 truncate">{email}</div>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleSignOut}
            title="Sign out"
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors flex-shrink-0 cursor-pointer"
          >
            <LogOut size={14} />
          </motion.button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex fixed top-0 left-0 h-full w-60 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
              onClick={onCloseMobile}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="md:hidden fixed top-0 left-0 z-50 h-full w-64 shadow-2xl"
            >
              <div className="relative h-full">
                <button
                  onClick={onCloseMobile}
                  className="absolute top-4 right-4 z-10 p-1.5 text-slate-400 hover:text-white rounded-lg bg-white/5"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
                <SidebarContent />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
