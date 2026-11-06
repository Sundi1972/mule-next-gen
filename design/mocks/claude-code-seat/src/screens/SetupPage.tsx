import { Panel } from '@mule/ui';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../../../../../apps/web/src/components/ThemeToggle';
import { CODE_PLACEHOLDER, headlessLine, playLine, setupLine } from '../fixture';
import { CopyLine } from '../parts';

/*
 * GRAFT TARGET: a new static page, /claude-code, in apps/web. Whoever runs Claude Code may never have seen the game,
 * so it says everything once, in order. Opened from a seat's "How to set up" link, the seat's code is filled in.
 */

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li data-testid={`setup-step-${n}`}>
      <Panel>
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-holo font-mono text-base font-bold text-holo" aria-hidden>
            {n}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 className="font-display text-lg font-semibold">
              <span className="sr-only">Step {n}: </span>
              {title}
            </h2>
            {children}
          </div>
        </div>
      </Panel>
    </li>
  );
}

export function SetupPage({ code }: { code: string | null }) {
  const shown = code ?? CODE_PLACEHOLDER;
  return (
    <div className="min-h-full bg-table text-ink" data-testid="setup-page">
      <header className="flex items-center justify-between gap-3 border-b border-holo-faint px-6 py-3">
        <span className="font-display text-base font-bold">
          M.U.L.E. <span className="text-holo">Next Gen</span>
        </span>
        <ThemeToggle />
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold">Play a seat with Claude Code</h1>
          <p className="text-ink-2">
            {code ? (
              <>
                The host gave this seat the join code <span className="font-mono font-bold text-holo">{code}</span>.
              </>
            ) : (
              'The host gives you a join code for a computer seat at their table.'
            )}{' '}
            Three steps; the first only once per computer.
          </p>
        </div>
        <ol className="flex flex-col gap-3" data-testid="setup-steps">
          <Step n={1} title="Add the game to Claude Code, once">
            <p className="text-sm text-ink-2">In a terminal:</p>
            <CopyLine label="Setup line" text={setupLine()} testid="setup-step-1-line" />
          </Step>
          <Step n={2} title="Join the seat">
            <p className="text-sm text-ink-2">In Claude Code:</p>
            <CopyLine label="Play" text={playLine(shown)} testid="setup-step-2-line" />
          </Step>
          <Step n={3} title="Leave it running">
            <p className="text-sm text-ink-2">Claude plays the seat's turns until the game ends. Or run it without a window:</p>
            <CopyLine label="Headless" text={headlessLine(shown)} testid="setup-step-3-line" />
          </Step>
        </ol>
        <p className="rounded-panel border border-holo-line bg-holo-soft px-4 py-3 text-sm" data-testid="setup-sleep">
          <strong>If your laptop sleeps:</strong> paste the same code again. Until Claude is back, the seat plays its built-in plan; the table doesn't wait.
        </p>
      </main>
    </div>
  );
}
