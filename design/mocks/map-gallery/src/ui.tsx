import { useEffect, useState, type ReactNode } from 'react';
import { cx, setTheme, useTheme } from '@mule/ui';

export const pct = (n: number) => `${Math.round(n * 100)}%`;

/** One decimal, dropped when whole. */
export const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function Section({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-panel border border-holo-line bg-panel p-4', className)}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="label-caps">{title}</h2>
        {aside && <div className="font-mono text-xs text-ink-2">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** A small segmented control. */
export function Choice<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange(v: T): void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1 rounded-control border border-holo-line bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[8px] px-2.5 py-1 text-sm',
            o.value === value ? 'bg-holo text-on-holo font-semibold' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type Page = 'maps' | 'special';

/** The page lives in the hash too: `#page=special` opens the special-field view; anything else is the maps. */
function readPage(): Page {
  return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('page') === 'special' ? 'special' : 'maps';
}

export function usePage(): Page {
  const [page, setPage] = useState(readPage);
  useEffect(() => {
    const on = () => setPage(readPage());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return page;
}

const PAGES: { page: Page; href: string; label: string }[] = [
  { page: 'maps', href: '#', label: 'Maps' },
  { page: 'special', href: '#page=special', label: 'Special fields' },
];

/** The gallery's index: its two views. */
export function GalleryNav({ page }: { page: Page }) {
  return (
    <nav aria-label="Gallery" className="flex items-center gap-1 rounded-control border border-holo-line bg-raised p-0.5" data-testid="gallery-nav">
      {PAGES.map((p) => (
        <a
          key={p.page}
          href={p.href}
          aria-current={p.page === page ? 'page' : undefined}
          onClick={() => window.scrollTo(0, 0)}
          className={cx('rounded-[8px] px-2.5 py-1 text-sm', p.page === page ? 'bg-holo font-semibold text-on-holo' : 'text-ink-2 hover:text-ink')}
          data-testid={`nav-${p.page}`}
        >
          {p.label}
        </a>
      ))}
    </nav>
  );
}

/** Switches between day and night. The choice is remembered on this device. */
export function ThemeToggle() {
  const theme = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        try {
          localStorage.setItem('mule-theme', next);
        } catch {
          // Not remembered; the gallery still switches.
        }
      }}
      className="rounded-control border border-holo-line px-2.5 py-1 text-sm hover:border-holo"
    >
      {theme === 'light' ? 'Night' : 'Day'}
    </button>
  );
}
