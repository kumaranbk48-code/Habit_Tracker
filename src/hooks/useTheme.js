import { useState, useEffect } from 'react';

const KEY = 'ht-theme';

export function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem(KEY);
      return saved !== 'light';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem(KEY, 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem(KEY, 'light');
    }
  }, [isDark]);

  const toggle = () => setIsDark(prev => !prev);

  return { isDark, toggle };
}
