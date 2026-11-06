import { cx } from '@mule/ui';
import { useEffect, useState, type ReactNode } from 'react';

/** Routes are hash tokens (#lobby-a), so a link opens one screen directly. */
export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function Page({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-full bg-table p-8 text-ink">
      <a href="#" className="font-mono text-xs text-holo underline" data-testid="back">
        ← index
      </a>
      <h1 className="mb-1 mt-2 font-display text-2xl font-semibold">{title}</h1>
      {lead && <p className="mb-4 max-w-3xl text-sm text-ink-2">{lead}</p>}
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

export interface Choice<T extends string> {
  id: T;
  title: string;
}

/** The mock's state switcher: every state a reviewer should see is one press away. */
export function States<T extends string>({ label, choices, value, onChange, testid }: { label: string; choices: readonly Choice<T>[]; value: T; onChange: (v: T) => void; testid: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={`states-${testid}`}>
      <span className="label-caps w-28 shrink-0">{label}</span>
      {choices.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={c.id === value}
          onClick={() => onChange(c.id)}
          className={cx('min-h-8 rounded-chip border px-2.5 font-mono text-xs', c.id === value ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2 hover:border-holo')}
          data-testid={`state-${testid}-${c.id}`}
        >
          {c.title}
        </button>
      ))}
    </div>
  );
}

/** A phone held sideways at the e2e harness's size (844 × 390). `scale` shrinks it for the index's side-by-side. */
export function PhoneFrame({ children, scale = 1, testid = 'phone-frame' }: { children: ReactNode; scale?: number; testid?: string }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="overflow-hidden rounded-sheet border border-holo-line shadow-map" style={{ width: 844 * scale, height: 390 * scale }} data-testid={testid}>
        <div className="origin-top-left" style={{ width: 844, height: 390, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** The big screen at its design size (1280 × 720), scaled down to fit the page. */
export function TvFrame({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div className="overflow-hidden rounded-panel border border-holo-line" style={{ width: 960, height: 540 }} data-testid="tv-frame">
        <div className="origin-top-left scale-[0.75]" style={{ width: 1280, height: 720 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Seconds left on a countdown from `from`, ticking once a second; a new `from` restarts it. */
export function useCountdown(from: number): number {
  const [left, setLeft] = useState(from);
  useEffect(() => {
    setLeft(from);
    if (from <= 0) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [from]);
  return left;
}
