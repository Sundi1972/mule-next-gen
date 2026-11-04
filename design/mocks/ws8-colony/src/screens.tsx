import { Button, cx, PlayerMark, Timer } from '@mule/ui';
import type { MuleView } from '@mule/protocol';
import { colonyVerdict } from '../../../../apps/web/src/game/derive';
import { league, winnerWords } from '../../../../apps/web/src/game/month-end';
import type { ReactNode } from 'react';
import { ColonyPanel, LeagueTable, WinnerCard, YourWorth } from '../../../../apps/web/src/components/MonthEnd';
import { OBJECT, plaquesOf, type ColonyView } from './colony';
import { FitHeight } from './fit';
import { finalGame, game } from './fixture';
import { BuildSite, ColonyGauges, PlaqueBoard, ScoreSum, scoreVerdict, scoreWords } from './parts';

// --- Frames -------------------------------------------------------------------------------------------

/** The TV at 1280 × 720, as TableApp draws every phase. */
function Tv({ children, testid }: { children: ReactNode; testid: string }) {
  return (
    <div className="flex h-[720px] w-[1280px] shrink-0 flex-col gap-4 overflow-hidden bg-table p-10 text-ink" data-testid={testid}>
      {children}
    </div>
  );
}

/**
 * TableApp's TvHeader with the four gauges in the air gauge's place (graft target: apps/web/src/table/TableApp.tsx
 * TvHeader). Politics off, the header keeps today's air gauge alone (HC-22).
 */
function TvHeader({ title, month, colony, seconds }: { title: string; month: number; colony: ColonyView | null; seconds?: number }) {
  return (
    <header className="flex items-end justify-between gap-6" data-testid="tv-header">
      <div className="flex shrink-0 flex-col gap-1">
        <span className="label-caps text-base!">Month {month} / 12</span>
        <h1 className="font-display text-5xl font-semibold leading-none">{title}</h1>
      </div>
      <div className="flex min-w-0 items-center gap-4">
        {colony && <ColonyGauges colony={colony} size="tv" className="w-[760px]" />}
        {seconds !== undefined && <Timer seconds={seconds} className="h-14! px-5! text-3xl!" />}
      </div>
    </header>
  );
}

/** The phone on its side (844 × 390), as PhoneShell lays it out: the stage, and the rail on the right. */
function Phone({ phase, title, children, rail, footer, testid, small = false }: { phase: string; title: string; children: ReactNode; rail: ReactNode; footer?: ReactNode; testid: string; small?: boolean }) {
  return (
    <div className={cx('flex shrink-0', small ? 'h-[375px] w-[667px]' : 'h-[390px] w-[844px]')}>
    <div className="flex h-full w-full shrink-0 overflow-hidden rounded-[28px] border-4 border-raised bg-table text-ink" data-testid={testid}>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">{children}</div>
      <aside className="flex w-[var(--rail)] shrink-0 flex-col gap-1.5 border-l border-holo-line bg-panel p-2">
        <span className="label-caps text-[10px]!">{phase}</span>
        <span className="font-display text-sm font-semibold leading-tight">{title}</span>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">{rail}</div>
        {footer}
      </aside>
    </div>
    </div>
  );
}

// --- The TV in play -----------------------------------------------------------------------------------

/** Planning on the TV: the header carries the colony's four gauges all month; the map below is today's. */
export function TvPlanning({ colony }: { colony: ColonyView }) {
  return (
    <Tv testid="tv-planning">
      <TvHeader title="Planning" month={7} colony={colony} seconds={38} />
      <div className="grid flex-1 place-items-center rounded-panel border border-dashed border-holo-line text-xl text-ink-3">The colony map, as today (WS5 draws the objects on their plots, C33)</div>
    </Tv>
  );
}

/**
 * The month end on the TV (graft target: TableApp.tsx TvMonthEnd): today's table by Worth and colony report, with the
 * build site under the report. FitHeight scales the lot when a sixth player or the chat ticker needs the room.
 */
export function TvMonthEnd({ colony }: { colony: ColonyView }) {
  const view = game(colony);
  return (
    <Tv testid="tv-monthend">
      <TvHeader title="End of the month" month={7} colony={colony} />
      <FitHeight className="flex-1">
        <div className="grid flex-1 grid-cols-[minmax(0,6fr)_minmax(0,6fr)] gap-6">
          <LeagueTable view={view} density="tv" />
          <div className="flex flex-col gap-4">
            <ColonyPanel view={view} density="tv" />
            <BuildSite colony={colony} size="tv" />
          </div>
        </div>
      </FitHeight>
    </Tv>
  );
}

// --- Game over on the TV: two directions ---------------------------------------------------------------

/**
 * The winner, shorter than today's WinnerCard (graft target: MonthEnd.tsx WinnerCard, density 'tv') so the colony's
 * score fits under it. Its heading changes from "The colony goes to" to "The game goes to": the colony has its own
 * score now, and the old words would hand it to a player. The phone's "You win the colony!" changes the same way.
 */
function TvWinner({ view, className }: { view: MuleView; className?: string }) {
  const lg = league(view);
  const top = lg.rows[0]!;
  return (
    <div className={cx('relative flex items-center gap-5 rounded-panel border-2 border-holo bg-holo-soft px-6 py-4 shadow-glow', className)} data-testid="tv-winner">
      <PlayerMark slot={top.slot} species={top.player.species} size={88} label={top.player.name} />
      <span className="flex flex-col gap-1">
        <span className="label-caps text-base!">The game goes to</span>
        <span className="font-display text-3xl font-semibold leading-tight" data-testid="winner-line">
          {winnerWords(view, lg)}
        </span>
      </span>
    </div>
  );
}

/** The colony's score, big: the total, its verdict and the sum that made it. */
function ScoreHero({ colony, size }: { colony: ColonyView; size: 'hero' | 'tv' }) {
  const score = colony.score!;
  const v = scoreVerdict(score);
  const hero = size === 'hero';
  return (
    <div className={cx('flex flex-col', hero ? 'gap-4' : 'gap-2')} data-testid="colony-score">
      <span className={cx('flex gap-x-8 gap-y-4', hero ? 'flex-col' : 'flex-row flex-wrap items-end')}>
      <span className="flex items-baseline gap-4">
        <span data-num className={cx('font-mono font-bold leading-none text-holo', hero ? 'text-8xl' : 'text-6xl')} data-testid="colony-total">
          {score.total}
        </span>
        <span className="flex flex-col">
          <span className="label-caps text-sm!">Colony score</span>
          <span className={cx('font-display font-semibold', v.tone, hero ? 'text-3xl' : 'text-2xl')} data-testid="colony-verdict">
            {v.title}
          </span>
        </span>
      </span>
      <ScoreSum score={score} colony={colony} size={size} />
      </span>
      <span className={cx('text-ink-2', hero ? 'text-base' : 'text-sm')}>{scoreWords(colony)}</span>
    </div>
  );
}

/**
 * The approved game over (Heiko, "Yes, A"), "the colony's line": today's game over kept whole (the winner, the table by Worth), and the colony band
 * across the bottom becomes the colony's score beside who gave most. One more thing to read, nothing moves.
 */
export function TvGameOverA({ colony }: { colony: ColonyView }) {
  const view = finalGame(colony);
  return (
    <Tv testid="tv-gameover-a">
      <TvHeader title="Game over" month={12} colony={null} />
      <FitHeight className="flex-1">
      <div className="flex flex-1 flex-col gap-4">
      <div className="grid flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
        <TvWinner view={view} className="self-start" />
        <div className="flex min-h-0 flex-col">
          <LeagueTable view={view} density="tv" final />
        </div>
      </div>
      <section className="grid shrink-0 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 rounded-panel border border-holo-line bg-panel p-5" aria-label="How the colony did" data-testid="colony-band">
        <div className="flex flex-col gap-2">
          <h2 className="label-caps text-base!">How the colony did</h2>
          <ScoreHero colony={colony} size="tv" />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="label-caps text-base!">Plaques · who gave most</h2>
          <PlaqueBoard colony={colony} size="tv" />
        </div>
      </section>
      </div>
      </FitHeight>
    </Tv>
  );
}

// --- The phone ----------------------------------------------------------------------------------------

/**
 * The Colony desk in the planning hub (graft target: apps/web/src/phone/hub/politics/Colony.tsx, WS7's FundCard over
 * WS6's ColonyDesk): the four gauges, then the build site. The buttons are WS7's C35 desks; WS8 draws only where they sit.
 */
export function PhoneColonyDesk({ colony, governor }: { colony: ColonyView; governor: boolean }) {
  const open = colony.projects.find((p) => p.stage === 'commissioned');
  return (
    <Phone
      testid="phone-colony-desk"
      phase="Planning · month 7"
      title={governor ? 'You are the Governor' : 'Plan your month'}
      rail={
        <div className="flex min-h-0 flex-col gap-1.5" data-testid="desk-colony">
          <span className="label-caps text-[10px]!">Colony desk</span>
          <ColonyGauges colony={colony} size="phone" className="grid-cols-2!" />
          {open && (
            <Button size="md" className="w-full" data-testid="donate">
              Donate to the {OBJECT[open.id].name}
            </Button>
          )}
          {governor && (
            <Button size="md" variant="outline" className="w-full" data-testid="commission">
              Commission a project
            </Button>
          )}
          <span className="text-[10px] leading-tight text-ink-3">Donate and Commission open WS7’s desks (C35).</span>
        </div>
      }
      footer={
        <Button size="md" className="w-full">
          Ready
        </Button>
      }
    >
      <BuildSite colony={colony} size="phone" className="min-h-0 flex-1 overflow-hidden" />
    </Phone>
  );
}

/**
 * Game over on the phone (graft target: apps/web/src/phone/GameOver.tsx): your place and your Worth as today, and the
 * air verdict's card becomes the colony's score, with your plaques under it. The rail keeps the table by Worth.
 */
export function PhoneGameOver({ colony, small = false }: { colony: ColonyView; small?: boolean }) {
  const view = finalGame(colony);
  const score = colony.score!;
  const v = scoreVerdict(score);
  // WS6: the card takes PhoneVerdict's place, so it carries a failed colony the way PhoneVerdict did: in alert, with the
  // verdict's own title and rule. A failed colony is never just a low number.
  const failed = colonyVerdict(view.air);
  const mine = plaquesOf(colony, 's1');
  return (
    <Phone
      testid="phone-gameover"
      small={small}
      phase="Game over"
      title="Game over: 2nd of 4"
      rail={
        <div data-testid="scores">
          <LeagueTable view={view} density="compact" selfId="s1" final />
        </div>
      }
      footer={
        <Button size="md" variant="outline" className="w-full">
          Leave the table
        </Button>
      }
    >
      {/* As GameOver.tsx does below 3xl (@max-3xl/shell): on a small phone the card moves under your lines. */}
      <div className={cx('grid min-h-0 flex-1 gap-2.5', small ? 'grid-cols-[minmax(0,4fr)_minmax(0,7fr)] grid-rows-[auto_minmax(0,1fr)]' : 'grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')}>
        <div className={small ? 'contents' : 'flex min-h-0 flex-col gap-2.5'}>
          <WinnerCard view={view} density="phone" selfId="s1" {...(small ? { className: 'row-span-2' } : {})} />
          <section className={cx('flex flex-col rounded-panel border', small ? 'col-start-2 row-start-2 gap-1 p-2' : 'gap-1.5 p-2.5', failed.failed ? 'border-alert bg-alert-bg' : 'border-holo-line bg-panel')} data-testid="phone-colony-score" data-failed={failed.failed}>
            {failed.failed && (
              <span className="flex flex-col" data-testid="verdict">
                <span className="font-display text-sm font-semibold leading-tight text-alert-ink" data-testid="verdict-title">
                  {failed.title}
                </span>
                <span className="text-[11px] leading-tight text-ink" data-testid="verdict-line">
                  {failed.line}
                </span>
              </span>
            )}
            <span className="flex items-baseline gap-2">
              <span data-num className={cx('font-mono text-2xl font-bold leading-none', failed.failed ? 'text-alert-ink' : 'text-holo')} data-testid="colony-total">
                {score.total}
              </span>
              <span className="flex flex-col">
                <span className="label-caps text-[10px]!">Colony score</span>
                {!failed.failed && <span className={cx('font-display text-sm font-semibold leading-tight', v.tone)}>{v.title}</span>}
              </span>
            </span>
            <ScoreSum score={score} colony={colony} size="phone" />
            <span className="text-[11px] leading-tight text-ink-2" data-testid="your-plaques">
              {mine.length === 0 ? 'You are on no plaque.' : `Your plaques: ${mine.map((q) => OBJECT[q.project.id].name).join(', ')} · ${mine.reduce((a, b) => a + b.credits, 0).toLocaleString('en-US')} cr given`}
            </span>
          </section>
        </div>
        <div className={cx('min-h-0', small && 'col-start-2 row-start-1')}>
          <YourWorth view={view} density="phone" />
        </div>
      </div>
    </Phone>
  );
}
