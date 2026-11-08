import { cx } from '@mule/ui';
import type { ReactNode } from 'react';

/** A 24×24 stroked path, as the hub's tabs draw their icons. */
export function Glyph({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export type BadgeTone = 'holo' | 'warn' | 'alert';

/**
 * What a tab carries when something wants the player there: a count (offers, unread lines) or a word (VOTE for an open
 * ballot, "!" for a broken promise), in the tone of what it is. The label says why for a screen reader.
 */
export function TabBadge({ tone, children, label, testid, inline = false }: { tone: BadgeTone; children: ReactNode; label: string; testid: string; inline?: boolean }) {
  return (
    <span
      className={cx(
        'flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-bold leading-none',
        inline ? 'ml-1 shrink-0' : 'absolute right-0.5 top-0.5',
        tone === 'holo' && 'bg-holo text-on-holo',
        tone === 'warn' && 'bg-warn text-on-holo',
        tone === 'alert' && 'bg-alert text-ink',
      )}
      data-testid={testid}
    >
      <span aria-hidden>{children}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Several badges on one tab, side by side in its corner. */
export function Badges({ children }: { children: ReactNode }) {
  return <span className="absolute right-0.5 top-0.5 flex gap-0.5 [&>*]:static">{children}</span>;
}

/** A section heading inside a tab's stage. */
export function StageTitle({ children, aside, testid }: { children: ReactNode; aside?: ReactNode; testid?: string }) {
  return (
    <h2 className="flex items-baseline justify-between gap-2" data-testid={testid}>
      <span className="label-caps text-[10px]!">{children}</span>
      {aside && <span className="min-w-0 truncate text-[10px] text-ink-2">{aside}</span>}
    </h2>
  );
}
