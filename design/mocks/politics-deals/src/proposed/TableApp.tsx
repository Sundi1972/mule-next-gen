import type { MuleView, TableView } from '@mule/protocol';
import { cx, GoodTag, HoloMap, PlayerMark, SeatSpeciesProvider } from '@mule/ui';
import { Fragment } from 'react';
import { CollapseBanner, ColonyPanel } from '../../../../../apps/web/src/components/MonthEnd';
import { StrikeMap } from '../../../../../apps/web/src/components/Strike';
import { fmt, mapTiles, PHASE_NAME, seatSpecies, toSlot } from '../../../../../apps/web/src/game/derive';
import { inCollapse, ordinal } from '../../../../../apps/web/src/game/month-end';
import { connectedIn, readyRows, stillPlanning } from '../../../../../apps/web/src/phone/hub/ready';
import { ReadyCount } from '../../../../../apps/web/src/phone/hub/ReadyBar';
import { placesOf } from '../../../../../apps/web/src/phone/hub/standing';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { TvBody } from '../../../../../apps/web/src/table/TvFit';
import { TvGovernorPromise } from '../../../../../apps/web/src/table/TvGovernorPromise';
import { BrokenCards, LeagueTable } from './MonthEnd';
import { RepChip } from './parts';
import { WaitingFor } from './ReadyBar';
import { TvBreakBanner } from './TvDeals';

/*
 * GRAFT TARGET: apps/web/src/table/TableApp.tsx (WS4; S3-C19, S3-C20). TvGame's planning branch and TvMonthEnd, which
 * TableApp.tsx does not export, copied as they are today with these changes, each marked CHANGE:
 *   1. TvDeals' break banner under the header, below the Governor's promise line;
 *   2. the reputation chip after every name in the ready list and the waiting box (and on Players, the strip the other
 *      phases draw: same change, same place);
 *   3. the month end's broken cards under the colony panel, and the league's chips.
 * MarketTiles and News are copied unchanged.
 */

export function TvPlanning({ table, game }: { table: TableView<MuleView>; game: MuleView }) {
  const tiles = mapTiles(game);
  const connected = connectedIn(table.seats);
  const waiting = stillPlanning(game.players, connected);
  const places = placesOf(game);
  return (
    <SeatSpeciesProvider value={seatSpecies(game)}>
      <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink" data-phase="planning" data-testid="tv-planning">
        <div className="flex flex-col gap-3">
          <TvHeader game={game} title={PHASE_NAME.planning} ready={<ReadyCount players={game.players} tv />} />
          <TvGovernorPromise game={game} />
          {/* CHANGE 1 */}
          <TvBreakBanner game={game} />
        </div>
        <TvBody>
          <div className="flex min-h-0 flex-1 gap-6">
            <div className="flex w-[700px] shrink-0 flex-col gap-3">
              <StrikeMap view={game} size="tv">
                <HoloMap width={game.width} height={game.height} tiles={tiles} cursor={game.lit} density="tv" hideGround className="w-full" />
              </StrikeMap>
              <div className="flex items-center justify-between font-mono text-sm text-ink-3">
                <span>ROOM {table.code}</span>
                <span>
                  {fmt(game.colonists)} COLONISTS · {game.storeMules} MULES IN THE CORRAL · {game.mulePrice} CR EACH
                </span>
              </div>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
              {waiting.length > 0 ? (
                <div className="flex shrink-0 flex-col gap-3 rounded-panel border-2 border-holo bg-holo-soft p-5 shadow-glow" data-testid="tv-waiting">
                  {/* CHANGE 2 */}
                  <WaitingFor view={game} seats={waiting} me={null} tv />
                </div>
              ) : (
                <div className="shrink-0 rounded-panel border-2 border-holo bg-holo-soft p-5 font-display text-3xl font-semibold shadow-glow">Everyone is ready</div>
              )}
              <div className="shrink-0">
                <MarketTiles game={game} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden" data-fit-gives>
                <News news={game.news} />
              </div>
              <ul className="mt-auto flex shrink-0 flex-col gap-2" data-testid="tv-ready-list">
                {readyRows(game.players, connected).map((row) => {
                  if (row.kind === 'ais')
                    return (
                      <li key="ais" className="flex items-center gap-3 opacity-60" data-testid="tv-ready-ais">
                        <span aria-hidden className="w-9 shrink-0" />
                        <span className="flex shrink-0 -space-x-1.5">
                          {row.seats.map((s) => (
                            <PlayerMark key={s.id} slot={toSlot(s.slot)} size={22} />
                          ))}
                        </span>
                        <span className="flex flex-1 items-center gap-2 truncate font-display text-xl font-semibold">
                          {row.seats.map((s, i) => (
                            <Fragment key={s.id}>
                              {i > 0 && ', '}
                              {s.name} <RepChip view={game} id={s.id} tv testid={`tv-ready-rep-${s.id}`} />
                            </Fragment>
                          ))}
                        </span>
                        <span className="font-mono text-sm text-ink-3">{row.seats.length} AI · READY</span>
                      </li>
                    );
                  const s = row.seat;
                  const isAway = !s.isAi && s.away;
                  const state = s.isAi ? 'AI · READY' : s.ready ? 'READY' : isAway ? 'AWAY · PLANNING' : 'PLANNING';
                  return (
                    <li key={s.id} className={cx('flex items-center gap-3', (s.isAi || s.ready) && 'opacity-60')} data-testid={`tv-ready-${s.id}`}>
                      <span data-num className="w-9 shrink-0 font-mono text-sm text-ink-3">
                        {ordinal(places.get(s.id) ?? game.players.length)}
                      </span>
                      <PlayerMark slot={toSlot(s.slot)} size={22} glow={!(s.isAi || s.ready)} />
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate font-display text-xl font-semibold">{s.name}</span>
                        {/* CHANGE 2 */}
                        <RepChip view={game} id={s.id} tv testid={`tv-ready-rep-${s.id}`} />
                      </span>
                      <span className={cx('font-mono text-sm', isAway ? 'text-warn' : s.ready || s.isAi ? 'text-ink-3' : 'text-holo')}>{state}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </TvBody>
      </div>
    </SeatSpeciesProvider>
  );
}

function MarketTiles({ game }: { game: MuleView }) {
  const rows = game.market.slice(0, 6);
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line" data-testid="tv-market">
      {rows.map((r) => (
        <div key={r.good} className="flex flex-col gap-1 bg-panel p-3">
          <GoodTag good={r.good} name />
          <span data-num className="font-mono text-3xl font-bold">
            {r.storeSells === null ? '—' : <>{r.storeSells} <span className="text-base font-normal text-ink-3">cr</span></>}
          </span>
          <span data-num className={cx('font-mono text-xs', r.cover < 0.5 ? 'text-alert' : r.cover < 1 ? 'text-warn' : 'text-ink-3')}>
            {r.cover >= 99 ? 'no demand' : `${r.cover} months cover`}
          </span>
        </div>
      ))}
    </div>
  );
}

function News({ news }: { news: string[] }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="tv-news">
      {news.map((n, i) => (
        <li key={n} className="rounded-control border-l-4 border-holo-line bg-panel px-4 py-2.5 text-lg" {...(i === 0 ? { 'data-fit-keep': true } : {})}>
          {n}
        </li>
      ))}
    </ul>
  );
}

/** TvMonthEnd with the month's broken cards (CHANGE 3), for a game with no colony gauges (the mock's). */
export function TvMonthEndDeals({ game, month }: { game: MuleView; month: number }) {
  return (
    <SeatSpeciesProvider value={seatSpecies(game)}>
      <div className="flex h-[720px] w-[1280px] flex-col gap-3 bg-table px-10 py-8 text-ink" data-phase="upkeep" data-testid="tv-monthend">
        <div className="flex flex-col gap-3">
          <TvHeader game={game} title="End of the month" ready={<ReadyCount players={game.players} tv />} />
        </div>
        {inCollapse(game) && <CollapseBanner density="tv" />}
        <TvBody>
          <div className="grid flex-1 grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6">
            <LeagueTable view={game} density="tv" />
            <div className="flex flex-col gap-4">
              <ColonyPanel view={game} density="tv" />
              {/* CHANGE 3 */}
              <BrokenCards view={game} month={month} density="tv" />
            </div>
          </div>
        </TvBody>
      </div>
    </SeatSpeciesProvider>
  );
}
