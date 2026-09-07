import { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import supabase from '../lib/supabase';
import {
  LayoutDashboard, ListChecks, Calendar, Target, Bell, BarChart3, User,
  LogOut, ListTodo, Menu, X, ChevronRight,
} from 'lucide-react';
import XPLevelBar from './XPLevelBar';
import ThemeToggle from './ThemeToggle';
import { calculateXP } from '../hooks/useGamification';

const NAV = [
  { to: '/',          label: 'Dashboard', icon: LayoutDashboard },
  { to: '/habits',    label: 'My Habits', icon: ListChecks },
  { to: '/calendar',  label: 'Calendar',  icon: Calendar },
  { to: '/goals',     label: 'Goals',     icon: Target },
  { to: '/reminders', label: 'Reminders', icon: Bell },
  { to: '/reports',   label: 'Reports',   icon: BarChart3 },
  { to: '/profile',   label: 'Profile',   icon: User },
];

export default function Sidebar() {
  const { user }   = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();
  const [open, setOpen]         = useState(false);
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
    || user?.email?.split('@')[0] || 'User';
  const avatar   = user?.user_metadata?.avatar_url;
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const xp       = calculateXP(dashStats);
  const streak   = dashStats?.currentStreak || 0;

  const NavItem = ({ item }) => (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={() => setOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <item.icon size={18} className={isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'} />
          <span className="flex-1">{item.label}</span>
          {item.label === 'My Habits' && streak > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              isActive ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-600'
            }`}>
              🔥{streak}
            </span>
          )}
          {isActive && <ChevronRight size={14} className="text-white/70 ml-auto" />}
        </>
      )}
    </NavLink>
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 py-5 mb-2">
        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
          <ListTodo size={18} className="text-white" />
        </div>
        <div>
          <div className="font-bold text-gray-900 text-sm leading-tight">HabitTracker</div>
          <div className="text-[10px] text-gray-400 font-medium">Build Better Habits</div>
        </div>
        {/* Dark mode toggle — compact icon, desktop only */}
        <div className="ml-auto hidden md:block">
          <ThemeToggle compact />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 space-y-0.5">
        {NAV.map(item => <NavItem key={item.to} item={item} />)}
      </nav>

      {/* XP bar */}
      {dashStats && (
        <div className="px-3 py-2">
          <XPLevelBar xp={xp} compact />
        </div>
      )}

      {/* User & sign-out */}
      <div className="p-3 border-t border-gray-100 mt-1">
        {streak >= 3 && (
          <div className="mb-3 px-3 py-2.5 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-xl">
            <div className="flex items-center gap-2">
              <span className="text-xl fire-bounce">🔥</span>
              <div>
                <div className="text-xs font-bold text-orange-700">{streak}-Day Streak!</div>
                <div className="text-[10px] text-orange-500">Keep it going today</div>
              </div>
            </div>
          </div>
        )}
        <div
          onClick={() => { setOpen(false); navigate('/profile'); }}
          className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
            {avatar
              ? <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
              : <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{initials}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 transition-colors">{displayName}</div>
            <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{user?.email}</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handleSignOut(); }}
            title="Sign out"
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors flex-shrink-0"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-40 w-10 h-10 bg-white rounded-xl shadow-md border border-gray-100 flex items-center justify-center text-gray-600 hover:text-gray-900"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <div className={`md:hidden fixed top-0 left-0 z-50 h-full w-64 bg-white shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
          <ThemeToggle compact />
          <button onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
            <X size={18} />
          </button>
        </div>
        <SidebarContent />
      </div>

      <aside className="hidden md:flex fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 flex-col shadow-sm">
        <SidebarContent />
      </aside>
    </>
  );
}
