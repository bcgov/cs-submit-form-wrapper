import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from './store';
import { setDark, toggleDark } from './slices/themeSlice';

// useDark hook: provides current value and toggles, persists to localStorage and applies document attribute
export function useDark() {
  const dispatch = useAppDispatch();
  const isDark = useAppSelector((state) => state.theme.isDark);

  useEffect(() => {
    // Try to read preference from localStorage (client-only)
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('isDark');
      if (stored !== null) {
        dispatch(setDark(stored === 'true'));
        return;
      }

      // fallback to prefers-color-scheme
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      dispatch(setDark(mq.matches));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      // Tell Bootstrap which theme to use (v5.3+ supports data-bs-theme)
      document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
      // Also toggle Tailwind's dark class so Tailwind dark variants apply when configured with `darkMode: 'class'`.
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('isDark', isDark ? 'true' : 'false');
    }
  }, [isDark]);

  const toggle = () => dispatch(toggleDark());

  return { isDark, toggle, setDark: (v: boolean) => dispatch(setDark(v)) };
}
