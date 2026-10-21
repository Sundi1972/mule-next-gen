import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

/** Reads `data-theme` on <html>. Light is the default; dark is the night table. */
export function readTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** The current theme, updated when anything changes `data-theme`. */
export function useTheme(): Theme {
  const [theme, set] = useState(readTheme);
  useEffect(() => {
    const obs = new MutationObserver(() => set(readTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}
