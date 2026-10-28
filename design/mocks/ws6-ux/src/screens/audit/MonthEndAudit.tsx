import { GAME, POLITICS, POLLUTION } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { Button, cx } from '@mule/ui';
import type { ReactNode } from 'react';
import { PHASE_NAME } from '../../../../../../apps/web/src/game/derive';
import { usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { TvHeader } from '../../../../../../apps/web/src/table/TableApp';
import { VIEW } from '../../fixture';
import { Board, Game, PhoneFrame, TvFrame } from '../../harness';
import { GameShell, type Now } from '../../proposed/GameShell';
import { IntentMarker, IntentNotes, IntentNotesProvider } from '../../proposed/IntentNote';
import { DONATION_WORTH, inCollapse, league, MOOD_SCALE, type MonthFacts } from '../../proposed/worth';
import { OnlyYouLook } from '../PlanningHub';
import { MONTHEND_NOTES } from './monthend/notes';
import { CollapseBanner, ColonyPanel, LeagueTable, leaderWords, ordinal, PhoneVerdict, WinnerCard, winnerWords, YourWorth } from './monthend/parts';
import { MONTHEND_STATES, type MonthEndState } from './monthend/states';

export { MONTHEND_NOTES, MONTHEND_STATES, type MonthEndState };

/**
 * The month's end after the goods auction: a league table of the players by Worth and a panel on how the colony is
 * doing, for Heiko's approval. He asked for it on 2026-10-28 ("at the end of the month after the auction round we
 * must show the current league table and colony statistics, which player is leading and how the colony is doing")
 * and agreed its scoring model the same day; the model is src/proposed/worth.ts. Each change carries a numbered
 * IntentMarker; the review page lists, per number, what changed, the need it serves and why (MONTHEND_NOTES).
 *
 * Three views: the TV (1280 × 720, public: totals only), the phone beside a TV (the table and your own worth), and
 * the phone at a table with no TV (the table, the colony panel and your worth on one screen).
 *
 * GRAFT TARGETS (WS4): the TV replaces TableApp.tsx's MonthEnd and Scores (phase 'upkeep'); the phone is a new screen
 * for the upkeep phase. WS3 adds the view fields MonthFacts lists, and sends `scores` every month. At game over
 * (#monthend-gameover) TableApp.tsx's TvGameOver and phone/GameOver.tsx keep their layout and take Worth in credits.
 * Drop every IntentMarker; keep every data-testid.
 */

const N = MONTHEND_NOTES;

/**
 * The big screen at the game's end, in TvGameOver's layout (winner card beside the standings, the colony's verdict
 * across the bottom): the winner by Worth in credits, the final table by Worth, and the colony's report as the verdict.
 */
function TvGameEnd({ view, facts }: { view: MuleView; facts: MonthFacts }) {
  return (
    <div className="@container/shell">
      <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table p-10 text-ink" data-phase={view.phase} data-testid="tv-gameover">
        <TvHeader game={view} title={PHASE_NAME.gameOver} />
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
          <WinnerCard view={view} facts={facts} density="tv" />
          <div className="flex min-h-0 flex-col" data-testid="tv-scores">
            <LeagueTable view={view} facts={facts} density="tv" final />
          </div>
        </div>
        <ColonyPanel view={view} facts={facts} density="tv" layout="row" verdict />
      </div>
    </div>
  );
}

/** The big screen at the month's end: the league table and the colony, public. At game over, TvGameEnd. */
export function TvMonthEnd({ view, facts }: { view: MuleView; facts: MonthFacts }) {
  if (view.finished) return <TvGameEnd view={view} facts={facts} />;
  return (
    // A container wide enough for the review markers' large size; the screen itself sizes from its own 1280 px.
    <div className="@container/shell">
      <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table p-10 text-ink" data-phase={view.phase} data-testid="tv-monthend">
        <TvHeader game={view} title="End of the month" />
        {inCollapse(view) && <CollapseBanner density="tv" />}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6">
          <LeagueTable view={view} facts={facts} density="tv" />
          <ColonyPanel view={view} facts={facts} density="tv" />
        </div>
        <p className="text-lg leading-snug text-ink-2" data-testid="worth-rule">
          Worth: cash + goods at the store’s price + land at {GAME.plotScore} cr a plot + MULEs at {view.mulePrice} cr + {POLITICS.termScore} cr a term in office. Each player’s own lines are on their phone.
        </p>
      </div>
    </div>
  );
}

/**
 * Lena's phone at the game's end, in phone/GameOver.tsx's layout: the card and the verdict beside your lines, the final
 * standings in the rail, Leave at the bottom. With no TV, the colony's report takes the verdict's place under both.
 */
function PhoneGameEnd({ facts, tv }: { facts: MonthFacts; tv: boolean }) {
  const { view, self } = usePhoneGame();
  const lg = league(view, facts.lastWorth);
  const mine = lg.rows.find((r) => r.player.id === self.id)!;
  const won = mine.rank === 1 && lg.leader?.level.length === 1;
  const now: Now = {
    // One line in the rail: the card beside says the rest ("You finished 2nd of 4").
    title: won ? 'Game over: you win' : `Game over: ${ordinal(mine.rank)} of ${view.players.length}`,
    detail: `${winnerWords(view, lg)}.`,
  };
  const density = tv ? 'phone' : 'compact';
  return (
    <OnlyYouLook.Provider value="eye">
      <GameShell
        phase={PHASE_NAME.gameOver}
        now={now}
        foldNow
        rail={
          <div data-testid="scores">
            <LeagueTable view={view} facts={facts} density="compact" selfId={self.id} final />
          </div>
        }
        footer={
          <Button size="md" variant="outline" className="w-full" data-testid="leave" onClick={() => console.info('intent', { type: 'leave' })}>
            Leave the table
          </Button>
        }
      >
        <div className={cx('relative flex min-h-0 flex-1 flex-col', tv ? 'gap-2.5' : 'gap-1.5')} data-testid={tv ? 'phone-gameover' : 'phone-only-gameover'}>
          <div className={cx('grid min-h-0 grid-cols-[minmax(0,5fr)_minmax(0,6fr)]', tv ? 'flex-1 gap-2.5' : 'gap-1.5')}>
            <div className={cx('flex min-h-0 flex-col', tv ? 'gap-2.5' : 'gap-1.5')}>
              <WinnerCard view={view} facts={facts} density={density} selfId={self.id} />
              {tv && <PhoneVerdict view={view} />}
            </div>
            <YourWorth view={view} density={density} />
          </div>
          {!tv && (
            <div className="relative" data-testid="phone-only-colony">
              <ColonyPanel view={view} facts={facts} density="compact" verdict />
              <IntentMarker note={N.M9} at="br" />
            </div>
          )}
        </div>
      </GameShell>
    </OnlyYouLook.Provider>
  );
}

/** Lena's phone at the month's end; with no TV it carries the colony panel too. At game over, PhoneGameEnd. */
export function PhoneMonthEnd({ facts, tv }: { facts: MonthFacts; tv: boolean }) {
  const { view, self } = usePhoneGame();
  if (view.finished) return <PhoneGameEnd facts={facts} tv={tv} />;
  const lg = league(view, facts.lastWorth);
  const mine = lg.rows.find((r) => r.player.id === self.id)!;
  const words = leaderWords(view, lg, self.id);
  const now: Now = {
    title: mine.rank === 1 && lg.leader?.level.length === 1 ? `Month ${view.month} is over: you lead` : `Month ${view.month} is over: you’re ${ordinal(mine.rank)} of ${view.players.length}`,
    detail: `${words.lead}. Next: planning month ${view.month + 1}.`,
  };
  const collapse = inCollapse(view);
  return (
    <OnlyYouLook.Provider value="eye">
      <GameShell phase="End of the month" now={now} foldNow rail={<YourWorth view={view} density={tv ? 'phone' : 'compact'} />}>
        <div className={cx('relative flex min-h-0 flex-1 flex-col', tv ? 'gap-2' : 'gap-1.5')} data-testid={tv ? 'phone-monthend' : 'phone-only-monthend'}>
          {collapse && <CollapseBanner density={tv ? 'phone' : 'compact'} />}
          <LeagueTable view={view} facts={facts} density={tv ? 'phone' : 'compact'} selfId={self.id} />
          {tv ? (
            <p className="mt-auto text-[11px] leading-snug text-ink-3" data-testid="colony-on-tv">
              How the colony is doing is on the TV. Worth is cash + goods + land + MULEs + offices; your own lines are beside, for you only.
            </p>
          ) : (
            <div className="relative" data-testid="phone-only-colony">
              <ColonyPanel view={view} facts={facts} density="compact" />
              <IntentMarker note={N.M9} at="br" />
            </div>
          )}
        </div>
      </GameShell>
    </OnlyYouLook.Provider>
  );
}

// --- The review pages --------------------------------------------------------------------------------

function Links({ current }: { current?: string }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" data-testid="monthend-links">
      {MONTHEND_STATES.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className={s.id === current ? 'text-ink' : 'text-holo underline'} aria-current={s.id === current ? 'page' : undefined} data-testid={`link-${s.id}`}>
            {s.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <h2 className="label-caps mt-2">{children}</h2>;
}

/** Where every number on these screens comes from: config, the view, or a constant WS1 sets. */
function Numbers() {
  const rows: [string, string, string][] = [
    ['Land, a plot', `${GAME.plotScore} cr`, 'GAME.plotScore (config)'],
    ['A MULE installed', `${VIEW.mulePrice} cr`, 'the store’s MULE price this month (view.mulePrice), as the final score counts it'],
    ['An office term', `${POLITICS.termScore} cr`, 'POLITICS.termScore (config; a placeholder until the sim balances it)'],
    ['The Collapse cut', `× ${POLLUTION.collapseScore}`, 'POLLUTION.collapseScore (config): every line, offices too'],
    ['Goods', 'posted price', 'the store’s posted price (MarketRow.price)'],
    ['Office pay', `${POLITICS.pay.governor} cr`, 'POLITICS.pay.governor (config), out of the fund at upkeep'],
    ['A donation', `${DONATION_WORTH} cr a credit`, 'DONATION_WORTH: WS1 sets this (G-5)'],
    ['Mood', `× ${MOOD_SCALE.unrest} to × ${MOOD_SCALE.thriving}`, 'MOOD_SCALE: WS1 sets this (G-5)'],
  ];
  return (
    <section className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4 text-sm" data-testid="numbers">
      <h2 className="font-display text-lg font-semibold">Where every number comes from</h2>
      <p className="text-ink-2">
        Worth is the engine’s own final score, line by line (scoreParts in packages/engine/src/game.ts), sent every month instead of only at game over. Only the two G-5 numbers are new, in src/proposed/worth.ts.
      </p>
      <table className="w-full text-left">
        <tbody>
          {rows.map(([what, n, from]) => (
            <tr key={what} className="border-t border-holo-faint align-top">
              <td className="py-1 pr-2 font-semibold">{what}</td>
              <td data-num className="whitespace-nowrap py-1 pr-2 font-mono">
                {n}
              </td>
              <td className="py-1 text-ink-2">{from}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** One state's review page: the frames, and beside them the notes. */
export function MonthEndAuditPage({ state }: { state: MonthEndState }) {
  const board: MuleView = { ...state.view, me: null };
  // Each state lists the changes its screens show: M3 (the change column) has no place at game over, M11 only there.
  const notes = Object.values(MONTHEND_NOTES).filter((n) => (n.id !== 'M10' || inCollapse(state.view)) && (n.id !== 'M11' || state.view.finished) && (n.id !== 'M3' || !state.view.finished));
  return (
    <div className="min-h-full bg-table p-8 text-ink" data-testid={`page-${state.id}`}>
      <a href="#" className="font-mono text-xs text-holo underline" data-testid="back">
        ← contents
      </a>
      <h1 className="mb-2 mt-2 font-display text-2xl font-semibold">For approval · The month’s end · {state.title}</h1>
      <Links current={state.id} />
      <p className="mt-2 max-w-[900px] text-sm text-ink-2">{state.intro}</p>
      <IntentNotesProvider>
        <div className="mt-4 flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-col gap-2">
            {state.tv && (
              <>
                <Caption>The TV · 1280 × 720 · everyone sees it</Caption>
                <TvFrame>
                  <Board view={board}>
                    <TvMonthEnd key={`${state.id}-tv`} view={board} facts={state.facts} />
                  </Board>
                </TvFrame>
                <Caption>Lena’s phone, beside the TV · 844 × 390</Caption>
                <PhoneFrame>
                  <Game view={state.view}>
                    <PhoneMonthEnd key={`${state.id}-p`} facts={state.facts} tv />
                  </Game>
                </PhoneFrame>
              </>
            )}
            <Caption>Lena’s phone, no TV at the table · 844 × 390</Caption>
            <PhoneFrame>
              <Game view={state.view}>
                <PhoneMonthEnd key={`${state.id}-po`} facts={state.facts} tv={false} />
              </Game>
            </PhoneFrame>
          </div>
          <div className="flex w-[420px] max-w-full flex-col gap-4">
            <IntentNotes
              title={`${notes.length} changes, and why`}
              intro="One card per change. Hover one and its numbers light up on every screen. Intent 1 and 2 are Heiko’s own words of 2026-10-28; “Why” quotes his ask or the model he agreed."
              notes={notes}
            />
            <Numbers />
          </div>
        </div>
      </IntentNotesProvider>
    </div>
  );
}

/** The entry page's root: what this is, and every state. */
export function MonthEndContents() {
  return (
    <div className="min-h-full bg-table p-8 text-ink" data-testid="monthend-contents">
      <a href="/" className="font-mono text-xs text-holo underline" data-testid="back-to-index">
        ← all WS6 mocks
      </a>
      <h1 className="mt-2 font-display text-3xl font-semibold">For approval · The month’s end: league table and colony</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        Heiko, 2026-10-28: “at the end of the month after the auction round we must show the current league table and colony statistics, which player is leading and how the colony is doing”. He agreed the scoring model the same day. A
        mock only: WS4 builds the screens once approved; WS3 adds the view fields.
      </p>
      <h2 className="label-caps mt-6">States</h2>
      <ul className="mt-2 flex flex-col gap-1" data-testid="monthend-contents-list">
        {MONTHEND_STATES.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className="font-display text-lg font-semibold text-holo underline" data-testid={`contents-${s.id}`}>
              {s.title}
            </a>
            <span className="ml-2 text-sm text-ink-2">{s.tv ? 'TV, phone, and phone with no TV' : 'phone, no TV'}</span>
          </li>
        ))}
      </ul>
      <h2 className="label-caps mt-6">The Worth model, as agreed</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        Worth = cash + goods at the store’s posted price + land ({GAME.plotScore} cr a plot) + installed MULEs (the store’s MULE price) + office terms ({POLITICS.termScore} cr a term) + colony donations 1:1 (with G-5). In Collapse, every line, offices
        too, × {POLLUTION.collapseScore}. Others see totals only; your phone shows your lines.
      </p>
      <div className="mt-4 max-w-3xl">
        <Numbers />
      </div>
    </div>
  );
}
