import { Button, cx, Panel, PlayerMark } from '@mule/ui';
import { ThemeToggle } from '../../../../../apps/web/src/components/ThemeToggle';
import { NowCard, type Now } from '../../../../../apps/web/src/phone/Shell';
import { HOST, ME, SEATS, type MockSeat, type PlayLink } from '../fixture';
import { Chip, PLAY_CHIP } from '../parts';

/*
 * GRAFT TARGETS: TvGame's planning ready list (apps/web/src/table/TableApp.tsx) and ReadyBar with WaitingFor
 * (apps/web/src/phone/hub/ReadyBar.tsx), with ready.ts behind both. A Claude Code seat is a computer seat that is not
 * always ready: while it is thinking the table waits for it, as for a person; offline, it plays its built-in plan
 * and the table never waits for it.
 */

export type Person = 'planning' | 'ready' | 'away';

export interface Table {
  juno: PlayLink;
  me: 'planning' | 'ready';
  kai: Person;
}

type Row = { seat: MockSeat; word: string; blocks: boolean; dim: boolean; tone: 'holo' | 'warn' | 'quiet' };

const PLACE: Record<string, string> = { lena: '2nd', kai: '1st', juno: '3rd', brix: '4th' };

function rowOf(seat: MockSeat, t: Table): Row {
  if (seat.kind === 'builtin') return { seat, word: 'AI · READY', blocks: false, dim: true, tone: 'quiet' };
  if (seat.kind === 'claude')
    return {
      seat,
      word: PLAY_CHIP[t.juno],
      blocks: t.juno === 'thinking',
      dim: t.juno === 'ready',
      tone: t.juno === 'thinking' ? 'holo' : t.juno === 'offline' ? 'warn' : 'quiet',
    };
  const state: Person = seat.id === ME ? t.me : t.kai;
  if (state === 'ready') return { seat, word: 'READY', blocks: false, dim: true, tone: 'quiet' };
  if (state === 'away') return { seat, word: 'AWAY · PLANNING', blocks: true, dim: false, tone: 'warn' };
  return { seat, word: 'PLANNING', blocks: true, dim: false, tone: 'holo' };
}

const rowsOf = (t: Table) => SEATS.map((s) => rowOf(s, t));

/** A copy of ReadyCount: here a computer seat counts as ready only when it is not thinking. */
function ReadyCount({ t, tv = false }: { t: Table; tv?: boolean }) {
  const rows = rowsOf(t);
  return (
    <span
      className={cx('flex shrink-0 items-center gap-1.5 rounded-chip border border-holo-line bg-holo-soft font-mono font-bold text-holo', tv ? 'h-14 px-5 text-3xl' : 'h-8 px-1.5 text-sm')}
      data-testid="ready-count"
    >
      {rows.filter((r) => !r.blocks).length} / {rows.length} READY
    </span>
  );
}

const TONE = { holo: 'text-holo', warn: 'text-warn', quiet: 'text-ink-3' } as const;

export function TvPlanning({ t }: { t: Table }) {
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink" data-testid="tv-planning">
      <header className="flex items-end justify-between gap-6" data-testid="tv-header">
        <div className="flex flex-col gap-1">
          <span className="label-caps whitespace-nowrap text-base!">Month 3 / 12</span>
          <h1 className="font-display text-5xl font-semibold leading-none" data-testid="tv-phase">
            Planning
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <ThemeToggle />
          <ReadyCount t={t} tv />
        </div>
      </header>
      <div className="flex min-h-0 flex-1" data-testid="tv-unchanged">
        <Panel className="flex-1 items-center justify-center">
          <span className="label-caps">Map, news and chat: unchanged</span>
        </Panel>
      </div>
      <ul className="flex shrink-0 flex-col gap-2" data-testid="tv-ready-list">
        {rowsOf(t).map(({ seat, word, dim, tone }) => (
          <li key={seat.id} className={cx('flex items-center gap-3', dim && 'opacity-60')} data-testid={`tv-ready-${seat.id}`}>
            <span data-num className="w-9 shrink-0 font-mono text-sm text-ink-3">
              {PLACE[seat.id]}
            </span>
            <PlayerMark slot={seat.slot} species={seat.species} size={22} glow={!dim} />
            <span className="flex-1 truncate font-display text-xl font-semibold">
              {seat.name}
              {seat.kind === 'claude' && <span className="ml-2 font-mono text-sm font-normal text-ink-3">Claude Code</span>}
            </span>
            {seat.kind === 'claude' && t.juno === 'offline' && <span className="font-mono text-sm text-ink-3">plays its built-in plan</span>}
            <span className={cx('font-mono text-sm', TONE[tone], word === 'CLAUDE · THINKING' && 'animate-pulse')} data-testid={`tv-state-${seat.id}`}>
              {word}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One seat in the phone's waiting line: its creature, its name, and a chip when it is away or a thinking Claude. */
function Waiting({ row }: { row: Row }) {
  const { seat } = row;
  const away = row.word === 'AWAY · PLANNING';
  return (
    <span className="flex items-center gap-1 font-semibold" data-testid={`waiting-${seat.id}`}>
      <PlayerMark slot={seat.slot} species={seat.species} size={14} glow={!away} />
      {seat.id === ME ? 'you' : seat.name}
      {away && <span className="rounded-chip border border-warn/60 px-1 font-mono text-[10px] font-bold text-warn">AWAY</span>}
      {seat.kind === 'claude' && <Chip word="CLAUDE · THINKING" testid="waiting-chip" />}
    </span>
  );
}

/**
 * The Claude seat's line under the waiting line, once the table no longer waits for it: ready, or offline and
 * playing its built-in plan. While it thinks it is in the waiting line instead, so it shows once.
 */
function ClaudeLine({ t }: { t: Table }) {
  if (t.juno === 'thinking') return null;
  const seat = SEATS.find((s) => s.kind === 'claude')!;
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm" data-testid="claude-line">
      <PlayerMark slot={seat.slot} species={seat.species} size={14} glow={t.juno === 'ready'} />
      <span className="font-semibold">{seat.name}</span>
      <Chip word={PLAY_CHIP[t.juno]} testid="claude-line-chip" />
      {t.juno === 'offline' && <span className="text-xs text-ink-2">plays its built-in plan</span>}
    </span>
  );
}

function phoneNow(t: Table, waiting: Row[]): Now {
  if (t.me === 'planning') return { title: 'Plan your month', detail: 'Planning has no clock: it ends when everyone is ready.' };
  if (waiting.length === 0) return { title: 'Everyone is ready', detail: 'The land grant starts.' };
  const names = waiting.map((r) => r.seat.name).join(' and ');
  return { title: `You're ready. Waiting for ${names}`, detail: 'Planning has no clock: it ends when everyone is ready. As the host, you can continue without them.' };
}

/** The planning rail as GameShell draws it on a phone; the stage beside it is unchanged. */
export function PhonePlanning({ t, onReady, onMove }: { t: Table; onReady: () => void; onMove?: () => void }) {
  const waiting = rowsOf(t).filter((r) => r.blocks && r.seat.id !== ME);
  const ready = t.me === 'ready';
  const host = ME === HOST;
  return (
    <div className="h-full @container/shell">
      <div className="relative flex h-full bg-table text-ink" data-testid="game-shell">
        <main className="flex min-w-0 flex-1 p-2.5" data-testid="stage">
          <Panel className="flex-1 items-center justify-center">
            <span className="label-caps">Planning hub: unchanged</span>
          </Panel>
        </main>
        <aside className="flex w-(--rail) shrink-0 flex-col border-l border-holo-faint bg-void/40" data-testid="guide">
          <header className="flex flex-col gap-1 border-b border-holo-faint px-3 pb-2 pt-2">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex min-w-0 flex-col">
                <span className="label-caps text-[10px]!">Month 3 / 12</span>
                <span className="truncate font-display text-lg font-semibold leading-tight">Planning</span>
              </div>
              <ReadyCount t={t} />
            </div>
            <div className="flex items-center gap-1.5">
              <PlayerMark slot={0} species="zipwing" size={12} label="You, Zipwing" />
              <span className="min-w-0 truncate text-sm font-semibold">Lena</span>
              <ThemeToggle iconUntilWide className="shrink-0" />
              <button
                type="button"
                onClick={onMove}
                className="flex size-8 shrink-0 items-center justify-center rounded-chip border border-holo-line text-xs text-holo hover:border-holo"
                aria-label="Move my seat"
                data-testid="move-to-phone"
              >
                <svg aria-hidden viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <rect x={7} y={2.5} width={10} height={19} rx={2} />
                  <path d="M11 18.5h2" />
                </svg>
              </button>
              <span data-num className="ml-auto shrink-0 font-mono text-sm font-bold text-ink">
                1,240 cr
              </span>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3 py-2.5">
            <NowCard now={phoneNow(t, waiting)} />
          </div>
          <div className="flex flex-col gap-2 border-t border-holo-faint bg-void/60 px-3 pb-2.5 pt-2.5" data-testid="actions">
            {ready && (
              <span className="flex items-center gap-1.5 font-display text-base font-semibold text-holo" data-testid="you-are-ready">
                <svg aria-hidden viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7" />
                </svg>
                You're ready
              </span>
            )}
            {waiting.length > 0 ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" data-testid="waiting-for">
                <span className="text-ink-2">Waiting for</span>
                {waiting.map((r) => (
                  <Waiting key={r.seat.id} row={r} />
                ))}
              </span>
            ) : (
              ready && <span className="text-sm text-ink-2">Everyone is ready.</span>
            )}
            <ClaudeLine t={t} />
            {!ready ? (
              <Button size="lg" className="w-full" onClick={onReady} data-testid="ready">
                I'm ready
              </Button>
            ) : (
              host &&
              waiting.length > 0 && (
                <Button size="md" variant="outline" className="w-full" data-testid="continue">
                  Continue without {waiting.length === 1 ? waiting[0]!.seat.name : 'them'}
                </Button>
              )
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
