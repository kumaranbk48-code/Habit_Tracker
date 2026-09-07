import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle({ compact = false }) {
  const { isDark, toggle } = useTheme();

  if (compact) {
    return (
      <button
        onClick={toggle}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        style={isDark ? { color: '#94a3b8', background: 'rgba(51,65,85,0.5)' } : {}}
      >
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-sm font-medium transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      style={isDark ? { color: '#94a3b8' } : {}}
    >
      {isDark
        ? <><Sun size={16} className="text-amber-400" /><span>Light Mode</span></>
        : <><Moon size={16} className="text-slate-500" /><span>Dark Mode</span></>
      }
    </button>
  );
}
