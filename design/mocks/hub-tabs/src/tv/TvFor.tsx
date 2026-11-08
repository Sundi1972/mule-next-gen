import type { JSX } from 'react';
import { useMemo } from 'react';
import { ClientProvider } from '../../../../../apps/web/src/net/react';
import { TvCouncil } from '../../../../../apps/web/src/table/TvCouncil';
import { TvElection } from '../../../../../apps/web/src/table/TvElection';
import { TvOverrule } from './copied/TvOverrule';
import { TvMonthEnd } from './TvMonthEnd';
import { TvProduction } from './TvProduction';
import { TV_EVENT_HOLD_S, TV_WAITING_BOX_MAX_SEATS, TvPlanning, type EventKind } from './TvPlanning';
import { tvClient, tvScreen, type MockWorld, type TvFocus, type TvScreen } from './world';

export { TV_EVENT_HOLD_S, TV_WAITING_BOX_MAX_SEATS };

export type { TvFocus } from './world';

/** The steps that are an event's moment: the TV opens on that kind of event unfolded. Every other step opens folded. */
const MOMENT: Partial<Record<TvFocus, EventKind>> = { 'deal-broken': 'break', 'overrule-called': 'call', investigation: 'investigation' };

/**
 * The table's TV at this step of the month, at its design size (1280 × 720); the caller scales it. It routes as
 * TableApp's TvGame does: the month end in upkeep; production's show; an open ballot (election, law, overrule) takes the screen; else
 * planning. The TV holds nothing a phone keeps private: a card offered between two players and the Sheriff's guard
 * leave it as it was (TV_NOTE says so on the index).
 *
 * `eventFolded`: whether the step's own event, which the world already holds, is old news (folded: a break in the news,
 * a call on the promise row) or the moment it happens (TV_EVENT_HOLD_S over the map, then it folds). Default: the moment
 * for 'deal-broken' (its break) and 'overrule-called' (its call); folded for every other focus, and any other event. An event that arrives while the step is open (a
 * tap on a phone) is always a moment. A new focus starts the screen afresh.
 */
export function TvFor({ world, focus, eventFolded }: { world: MockWorld; focus: TvFocus; eventFolded?: boolean }): JSX.Element {
  const screen = useMemo(() => tvScreen(world), [world]);
  const opensOn = eventFolded === true ? null : (MOMENT[focus] ?? null);
  return <TvScreenView key={`${focus}:${opensOn}`} screen={screen} focus={focus} opensOn={opensOn} />;
}

/** The routed screen for a view already built (TvFor's body; the solo page feeds it views at other table sizes). */
export function TvScreenView({ screen, focus, opensOn = null }: { screen: TvScreen; focus: TvFocus; opensOn?: EventKind | null }): JSX.Element {
  const client = useMemo(() => tvClient(screen), [screen]);
  const { table, game } = screen;
  const politics = game.politics;
  const overrule = politics?.overrule?.stage;
  let body: JSX.Element;
  if (game.phase === 'upkeep') body = <TvMonthEnd game={game} />;
  else if (game.phase === 'production' && game.production) body = <TvProduction table={table} game={game} production={game.production} />;
  else if (politics?.election && politics.election.stage !== 'over') body = <TvElection table={table} game={game} />;
  else if (politics?.council && politics.council.stage !== 'over') body = <TvCouncil game={game} />;
  else if (overrule === 'ballot' || overrule === 'reveal') body = <TvOverrule game={game} />;
  else body = <TvPlanning table={table} game={game} investigation={screen.investigation} opensOn={opensOn} />;
  return (
    <ClientProvider client={client}>
      <div className="h-[720px] w-[1280px] overflow-hidden bg-table" data-testid="tv" data-focus={focus} data-opens-on={opensOn ?? undefined}>
        {body}
      </div>
    </ClientProvider>
  );
}

/** One line per step for the index: what the TV shows, and where it shows nothing, that it does so on purpose. */
export const TV_NOTE: Record<TvFocus, string> = {
  planning: `TV: planning as on trunk: the header and ready count, the Governor’s promise with the budget on its row, the map, who we wait for (a box up to ${TV_WAITING_BOX_MAX_SEATS} seats; above, the ready list alone), prices, news, the ready list with reputation chips.`,
  'deal-offered': 'TV: unchanged. The TV shows nothing of a private offer: a card is private to its two players.',
  'deal-broken': `TV: the broken-promise banner shows for ${TV_EVENT_HOLD_S} s and then lives in the news, a change from the deal-card mock Heiko approved.`,
  'budget-set': 'TV: the budget on the Governor’s row: Projects, Welfare → whom, kept. A share the Governor moved is in the accent colour with ▲ or ▼ before it (no “was N%” on the TV; the phone keeps it).',
  'overrule-called': `TV: the call shows over the map for ${TV_EVENT_HOLD_S} s, then folds to “Overrule called: tax frozen” on the Governor’s row; once planning ends, the ballot takes the screen: who has voted, never how.`,
  'overrule-reveal': 'TV: the overrule’s reveal: yes and no out of all the table’s votes, the needed mark, the stamp; the budget line at its foot.',
  guarding: 'TV: unchanged. Guards are secret: the TV shows nothing of the Sheriff’s guard.',
  waiting: `TV: up to ${TV_WAITING_BOX_MAX_SEATS} seats, “Waiting for …” with each name, the ready list under it with every reputation chip; from ${TV_WAITING_BOX_MAX_SEATS + 1} seats, the ready list alone. The host’s “can continue” line is the list’s foot.`,
  'month-end': 'TV: the month end: the league with chips and the breaker’s “✗ −N” (a stand-in for WS4’s mark), “fund … · paid out …” in the Wealth note; no broken-cards box (TV-FIT).',
  'production-caught': 'TV: production’s show; in “This month on Irata” the guard’s shield lights the victim’s plot, then “Caught!” with the saboteur’s creature and name (WS8’s P10 layer, proposed); the power stays on.',
  'fine-set': 'TV: planning; the fine’s news line first in the news (“… was fined … for sabotage; half to …”). No moment: a fine is news, not an event.',
  'month-end-fine': 'TV: the month end as P15 rules it: the fund’s paid-out total in the Wealth note (the victim’s half inside it); the full fine and restitution lines are on the phones.',
  'production-dark': 'TV: production’s show; an unguarded cut works unseen: the plot flickers and goes dark, “someone” in the event’s line, no name.',
  investigation: `TV: the investigation’s result over the map for ${TV_EVENT_HOLD_S} s, “Solved by the Sheriff: it was …” or “The trail went cold” (proposed; WS8 may restyle), then its news line.`,
};
