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

/**
 * Switches between day and night. The choice is remembered on this device. With `iconUntilWide`, under the shell's
 * 1100 px it is a 32 px moon (or sun), named Night (or Day) as the word is.
 */
export function ThemeToggle({ className, iconUntilWide = false }: { className?: string; iconUntilWide?: boolean }) {
  const theme = useTheme();
  const next: Theme = theme === 'light' ? 'dark' : 'light';
  const name = theme === 'light' ? 'Night' : 'Day';
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
      {...(iconUntilWide ? { 'aria-label': name } : {})}
      className={cx(
        'rounded-chip border border-holo-line font-mono text-xs text-ink-2 hover:border-holo hover:text-holo',
        iconUntilWide ? 'grid size-8 place-items-center @min-[1100px]/shell:block @min-[1100px]/shell:size-auto @min-[1100px]/shell:px-2 @min-[1100px]/shell:py-0.5' : 'px-2 py-0.5',
        className,
      )}
    >
      {iconUntilWide && <ThemeIcon theme={theme} className="@min-[1100px]/shell:hidden" />}
      {iconUntilWide ? <span className="hidden @min-[1100px]/shell:inline">{name}</span> : name}
    </button>
  );
}

/** A moon in day mode (tap for night), a sun in night mode. */
function ThemeIcon({ theme, className }: { theme: Theme; className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {theme === 'light' ? (
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      ) : (
        <>
          <circle cx={12} cy={12} r={4} />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      )}
    </svg>
  );
}
