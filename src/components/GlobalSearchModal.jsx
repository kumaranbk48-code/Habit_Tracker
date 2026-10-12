import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Search, X, ListChecks, Target, Sparkles, ArrowRight,
  LayoutDashboard, Calendar, Bell, BarChart3, User, BookOpen
} from 'lucide-react';

export default function GlobalSearchModal({ open, onClose, initialQuery = '' }) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [query, setQuery] = useState(initialQuery);
  const [habits, setHabits] = useState([]);
  const [goals, setGoals] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Synchronize initial query
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialQuery]);

  // Fetch search pool data when opened
  useEffect(() => {
    if (!open || !session) return;
    let isMounted = true;

    Promise.all([
      fetch('/api/habits', { headers: { Authorization: `Bearer ${session.access_token}` } }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/goals',  { headers: { Authorization: `Bearer ${session.access_token}` } }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([habitsData, goalsData]) => {
      if (!isMounted) return;
      setHabits(Array.isArray(habitsData) ? habitsData : []);
      setGoals(Array.isArray(goalsData) ? goalsData : []);
    });

    return () => { isMounted = false; };
  }, [open, session]);

  // Quick navigation pages
  const quickPages = [
    { title: 'Dashboard', path: '/', icon: LayoutDashboard, category: 'Navigation' },
    { title: 'My Habits', path: '/habits', icon: ListChecks, category: 'Navigation' },
    { title: 'Habit Calendar', path: '/calendar', icon: Calendar, category: 'Navigation' },
    { title: 'Goals & Milestones', path: '/goals', icon: Target, category: 'Navigation' },
    { title: 'Learning Hub', path: '/learning', icon: BookOpen, category: 'Navigation' },
    { title: 'Reminders & Alarms', path: '/reminders', icon: Bell, category: 'Navigation' },
    { title: 'Performance Reports', path: '/reports', icon: BarChart3, category: 'Navigation' },
    { title: 'Profile & Settings', path: '/profile', icon: User, category: 'Navigation' },
  ];

  const q = query.trim().toLowerCase();

  // Filter results
  const matchingHabits = habits.filter(h =>
    !q || h.habit_name?.toLowerCase().includes(q) || h.category?.toLowerCase().includes(q)
  ).slice(0, 5);

  const matchingGoals = goals.filter(g =>
    !q || g.goal_name?.toLowerCase().includes(q) || g.category?.toLowerCase().includes(q)
  ).slice(0, 3);

  const matchingPages = quickPages.filter(p =>
    !q ? true : p.title.toLowerCase().includes(q)
  ).slice(0, q ? 3 : 4);

  // Flattened items for keyboard navigation
  const allResults = [
    ...matchingHabits.map(h => ({ type: 'habit', data: h })),
    ...matchingGoals.map(g => ({ type: 'goal', data: g })),
    ...matchingPages.map(p => ({ type: 'page', data: p })),
  ];

  const handleSelect = useCallback((item) => {
    onClose();
    if (item.type === 'habit') {
      navigate(`/habits?search=${encodeURIComponent(item.data.habit_name)}`);
    } else if (item.type === 'goal') {
      navigate('/goals');
    } else if (item.type === 'page') {
      navigate(item.data.path);
    }
  }, [navigate, onClose]);

  // Keyboard navigation (Arrow Up/Down, Enter, Esc)
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, allResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allResults.length) % Math.max(1, allResults.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allResults[selectedIndex]) {
        handleSelect(allResults[selectedIndex]);
      } else if (query.trim()) {
        onClose();
        navigate(`/habits?search=${encodeURIComponent(query.trim())}`);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  let runningIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start justify-center p-4 pt-16 sm:pt-24 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="habiz-panel w-full max-w-xl rounded-3xl overflow-hidden border border-white/[0.08] shadow-2xl space-y-0"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-white/[0.06] bg-[#0c141d]/80">
          <Search size={18} className="text-teal-400 mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search habits, goals, categories, or pages..."
            className="w-full bg-transparent text-white placeholder-slate-400 text-sm font-medium focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          ) : (
            <span className="text-[10px] font-mono font-bold text-slate-400 bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-md">
              ESC
            </span>
          )}
        </div>

        {/* Search Results List */}
        <div className="max-h-96 overflow-y-auto p-3 space-y-4 custom-scrollbar">
          {/* Habits Section */}
          {matchingHabits.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-teal-400 px-3 py-1 flex items-center gap-1.5">
                <ListChecks size={13} />
                <span>Habits</span>
              </div>
              <div className="space-y-1 mt-1">
                {matchingHabits.map((h) => {
                  const idx = runningIndex++;
                  const isSelected = selectedIndex === idx;
                  return (
                    <button
                      key={h.id}
                      onClick={() => handleSelect({ type: 'habit', data: h })}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-teal-500/20 border border-teal-500/40 text-white'
                          : 'hover:bg-white/[0.04] text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center text-teal-400 flex-shrink-0">
                          <ListChecks size={15} />
                        </div>
                        <div className="truncate">
                          <span className="text-sm font-bold block truncate">{h.habit_name}</span>
                          <span className="text-[10px] text-slate-400">
                            {h.category} • {h.target_frequency || 'Daily'} • {h.time_of_day || 'Anytime'}
                          </span>
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-slate-400 ml-2 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Goals Section */}
          {matchingGoals.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 px-3 py-1 flex items-center gap-1.5">
                <Target size={13} />
                <span>Goals</span>
              </div>
              <div className="space-y-1 mt-1">
                {matchingGoals.map((g) => {
                  const idx = runningIndex++;
                  const isSelected = selectedIndex === idx;
                  return (
                    <button
                      key={g.id}
                      onClick={() => handleSelect({ type: 'goal', data: g })}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/20 border border-amber-500/40 text-white'
                          : 'hover:bg-white/[0.04] text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 flex-shrink-0">
                          <Target size={15} />
                        </div>
                        <div className="truncate">
                          <span className="text-sm font-bold block truncate">{g.goal_name}</span>
                          <span className="text-[10px] text-slate-400">
                            Status: {g.status || 'Active'}
                          </span>
                        </div>
                      </div>
                      <ArrowRight size={14} className="text-slate-400 ml-2 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Pages Navigation */}
          {matchingPages.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
                Pages & Navigation
              </div>
              <div className="space-y-1 mt-1">
                {matchingPages.map((p) => {
                  const idx = runningIndex++;
                  const isSelected = selectedIndex === idx;
                  const PageIcon = p.icon;
                  return (
                    <button
                      key={p.path}
                      onClick={() => handleSelect({ type: 'page', data: p })}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-teal-500/20 border border-teal-500/40 text-white'
                          : 'hover:bg-white/[0.04] text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-xl bg-white/[0.05] border border-white/[0.06] flex items-center justify-center text-slate-300">
                          <PageIcon size={14} />
                        </div>
                        <span className="text-xs font-semibold">{p.title}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">Jump →</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {allResults.length === 0 && (
            <div className="py-10 text-center text-slate-400 text-xs space-y-2">
              <Sparkles size={24} className="mx-auto text-teal-400/60" />
              <p>No results found for &ldquo;{query}&rdquo;</p>
              <button
                onClick={() => {
                  onClose();
                  navigate(`/habits?search=${encodeURIComponent(query)}`);
                }}
                className="mt-2 text-xs font-bold text-teal-300 hover:underline inline-flex items-center gap-1"
              >
                <span>Search in Habits</span>
                <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-4 py-2.5 bg-black/40 border-t border-white/[0.04] flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span>Use <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">↑</kbd> <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">↓</kbd> to navigate</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">Enter</kbd> to select</span>
          </div>
          <span><kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
