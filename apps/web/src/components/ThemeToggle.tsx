import { cx, setTheme, useTheme, type Theme } from '@mule/ui';

const KEY = 'mule-theme';

/** The saved theme, light unless this device chose night before. */
export function initTheme(): void {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    // Storage blocked: start in day mode.
  }
  setTheme(saved === 'dark' ? 'dark' : 'light');
}

/** Switches between day and night. The choice is remembered on this device. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useTheme();
  const next: Theme = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // Not remembered.
        }
      }}
      className={cx('rounded-chip border border-holo-line px-2 py-0.5 font-mono text-xs text-ink-2 hover:border-holo hover:text-holo', className)}
    >
      {theme === 'light' ? 'Night' : 'Day'}
    </button>
  );
}
