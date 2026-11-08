import type { JSX } from 'react';
import { useMemo } from 'react';
import { ClientProvider } from '../../../../../apps/web/src/net/react';
import { TvCouncil } from '../../../../../apps/web/src/table/TvCouncil';
import { TvElection } from '../../../../../apps/web/src/table/TvElection';
import { TvOverrule } from './copied/TvOverrule';
import { TvMonthEnd } from './TvMonthEnd';
import { TvPlanning } from './TvPlanning';
import { tvClient, tvScreen, type MockWorld, type TvFocus, type TvScreen } from './world';

export type { TvFocus } from './world';

/**
 * The table's TV at this step of the month, at its design size (1280 × 720); the caller scales it. It routes as
 * TableApp's TvGame does: the month end in upkeep; an open ballot (election, law, overrule) takes the screen; else
 * planning. The TV holds nothing a phone keeps private: a card offered between two players and the Sheriff's guard
 * leave it as it was (TV_NOTE says so on the index).
 */
export function TvFor({ world, focus }: { world: MockWorld; focus: TvFocus }): JSX.Element {
  const screen = useMemo(() => tvScreen(world, focus), [world, focus]);
  return <TvScreenView screen={screen} focus={focus} />;
}

/** The routed screen for a view already built (TvFor's body; the solo page feeds it a view with a full market). */
export function TvScreenView({ screen, focus }: { screen: TvScreen; focus: TvFocus }): JSX.Element {
  const client = useMemo(() => tvClient(screen), [screen]);
  const { table, game } = screen;
  const politics = game.politics;
  const overrule = politics?.overrule?.stage;
  let body: JSX.Element;
  if (game.phase === 'upkeep') body = <TvMonthEnd game={game} />;
  else if (politics?.election && politics.election.stage !== 'over') body = <TvElection table={table} game={game} />;
  else if (politics?.council && politics.council.stage !== 'over') body = <TvCouncil game={game} />;
  else if (overrule === 'ballot' || overrule === 'reveal') body = <TvOverrule game={game} />;
  else body = <TvPlanning table={table} game={game} />;
  return (
    <ClientProvider client={client}>
      <div className="h-[720px] w-[1280px] overflow-hidden bg-table" data-testid="tv" data-focus={focus}>
        {body}
      </div>
    </ClientProvider>
  );
}

/** One line per step for the index: what the TV shows, and where it shows nothing, that it does so on purpose. */
export const TV_NOTE: Record<TvFocus, string> = {
  planning: 'TV: planning as on trunk: the header and ready count, the Governor’s promise, the budget line, the map, who we wait for, prices, news, the ready list with reputation chips.',
  'deal-offered': 'TV: unchanged. The TV shows nothing of a private offer: a card is private to its two players.',
  'deal-broken': 'TV: the break banner under the header, in the news’s words (“· AI” after a computer seat’s name), the drop beside the breaker’s chip.',
  'budget-set': 'TV: the header’s budget line: Projects, Welfare → whom, kept; a share the Governor moved in holo, with what it was.',
  'overrule-called': 'TV: the call at the head of the side, above who we wait for: who called it, the tax start → now, what it needs.',
  'overrule-reveal': 'TV: the overrule’s reveal: yes and no out of all the table’s votes, the needed mark, the stamp; the budget line at its foot.',
  guarding: 'TV: unchanged. Guards are secret: the TV shows nothing of the Sheriff’s guard.',
  waiting: 'TV: the ready list and “Waiting for …”, each name with its reputation chip.',
  'month-end': 'TV: the month end: the league with chips and the breaker’s “✗ −N” (a stand-in for WS4’s mark), “fund … · paid out …” in the Wealth note; no broken-cards box (TV-FIT).',
};
