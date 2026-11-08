import type { MuleView, TableView } from '@mule/protocol';
import { cx, GoodTag, HoloMap, PlayerMark, SeatSpeciesProvider } from '@mule/ui';
import { Fragment } from 'react';
import { foldedClaudeWords, playsBuiltIn, STATUS_CHIP } from '../../../../../apps/web/src/components/ClaudeSeat';
import { StrikeMap, StrikeWaiting } from '../../../../../apps/web/src/components/Strike';
import { fmt, mapTiles, PHASE_NAME, seatSpecies, secondsUntil, toSlot } from '../../../../../apps/web/src/game/derive';
import { ordinal } from '../../../../../apps/web/src/game/month-end';
import { useServerNow } from '../../../../../apps/web/src/net/react';
import { claudeIn, connectedIn, hostMayContinue, readyRows, stillPlanning } from '../../../../../apps/web/src/phone/hub/ready';
import { ReadyCount } from '../../../../../apps/web/src/phone/hub/ReadyBar';
import { placesOf } from '../../../../../apps/web/src/phone/hub/standing';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { TvBody } from '../../../../../apps/web/src/table/TvFit';
import { TvGovernorPromise } from '../../../../../apps/web/src/table/TvGovernorPromise';
import { RepChip } from './copied/RepChip';
import { NewsWords } from './copied/SeatWords';
import { TvBudgetLine, TvOverruleCall } from './copied/TvBudgetLine';
import { TvDeals } from './copied/TvDeals';
import { WaitingFor } from './copied/WaitingFor';

/*
 * GRAFT TARGET: apps/web/src/table/TableApp.tsx, TvGame's planning branch (WS4), which TableApp.tsx does not export:
 * copied from trunk (feat/strategist at 739fefb0, the same file as this mock's base) with the slices' changes, each
 * marked CHANGE and each taken from the approved mock that owns it, not redrawn here:
 *   1. the budget line under the Governor's promise (politics-budget P14, TvBudgetLine);
 *   2. the break banner under that (politics-deals P5; the real component, TvDeals on ws7-s3-phone-pr);
 *   3. an overrule call at the head of the side, above who the table waits for (politics-budget P14, TvOverruleCall);
 *   4. the reputation chip after each name in the waiting box and the ready list (politics-deals S3-C19, CHANGE 2;
 *      WaitingFor's `view` as on ws7-s3-phone-pr);
 *   5. the news through NewsWords, so a computer seat reads "Ossa · AI" by its id (ws7-s3-phone-pr's News).
 * Left out, as the mock has no clock or events: TvEventLayer, and the grounds opener before the month end.
 */
export function TvPlanning({ table, game }: { table: TableView<MuleView>; game: MuleView }) {
  const now = useServerNow(200);
  const tiles = mapTiles(game);
  const connected = connectedIn(table.seats);
  const claude = claudeIn(table.seats);
  const waiting = stillPlanning(game.players, connected);
  const host = game.players.find((p) => p.id === table.hostId);
  const hostCanContinue = !!host && (host.ready || host.isAi) && hostMayContinue(game);
  const places = placesOf(game);
  return (
    <SeatSpeciesProvider value={seatSpecies(game)}>
      <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink" data-phase="planning" data-testid="tv-planning">
        <div className="flex flex-col gap-3">
          <TvHeader game={game} title={PHASE_NAME.planning} seconds={secondsUntil(game.phaseEndsAt, now)} ready={<ReadyCount players={game.players} tv />} />
          <TvGovernorPromise game={game} />
          {/* CHANGE 1 */}
          <TvBudgetLine game={game} />
          {/* CHANGE 2 */}
          <TvDeals game={game} />
        </div>
        <TvBody>
          <div className="flex min-h-0 flex-1 gap-6">
            <div className="flex w-[700px] shrink-0 flex-col gap-3">
              <StrikeMap view={game} size="tv">
                <HoloMap width={game.width} height={game.height} tiles={tiles} cursor={game.lit} density="tv" hideGround className="w-full" />
              </StrikeMap>
              <div className="flex items-center justify-between font-mono text-sm text-ink-3" data-testid="tv-map-foot">
                <span>ROOM {table.code}</span>
                <span>
                  {fmt(game.colonists)} COLONISTS · {game.storeMules} MULES IN THE CORRAL · {game.mulePrice} CR EACH
                </span>
              </div>
              <StrikeWaiting game={game} />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4" data-testid="tv-side">
              {/* CHANGE 3 */}
              <TvOverruleCall game={game} />
              {waiting.length > 0 ? (
                <div className="flex shrink-0 flex-col gap-3 rounded-panel border-2 border-holo bg-holo-soft p-5 shadow-glow" data-testid="tv-waiting">
                  {/* CHANGE 4 */}
                  <WaitingFor view={game} seats={waiting} me={null} tv />
                  {hostCanContinue && <span className="text-lg text-ink-2">{host.name}, the host, can continue without them.</span>}
                </div>
              ) : (
                <div className="shrink-0 rounded-panel border-2 border-holo bg-holo-soft p-5 font-display text-3xl font-semibold shadow-glow" data-testid="tv-all-ready">
                  Everyone is ready
                </div>
              )}
              <div className="shrink-0">
                <MarketTiles game={game} />
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden" data-fit-gives>
                <News game={game} />
              </div>
              <ul className="mt-auto flex shrink-0 flex-col gap-2" data-testid="tv-ready-list">
                {readyRows(game.players, connected, claude).map((row) => {
                  if (row.kind === 'claude')
                    return (
                      <li key={`claude-${row.status}`} className="flex items-center gap-3" data-testid={`tv-ready-claude-${row.status}`} data-count={row.seats.length}>
                        <span aria-hidden className="w-9 shrink-0" />
                        <span className="flex shrink-0 -space-x-1.5">
                          {row.seats.map((s) => (
                            <PlayerMark key={s.id} slot={toSlot(s.slot)} size={22} glow={row.status === 'thinking'} />
                          ))}
                        </span>
                        {playsBuiltIn(row.status) ? (
                          <span className="flex-1" />
                        ) : (
                          <span className="min-w-0 flex-1 truncate font-display text-xl font-semibold" data-testid="tv-ready-claude-names">
                            {row.seats.map((s) => s.name).join(', ')}
                          </span>
                        )}
                        <span className={cx('flex min-w-0 flex-wrap justify-end gap-x-2 font-mono text-sm', row.status === 'thinking' ? 'animate-pulse text-holo' : 'text-warn')}>
                          {foldedClaudeWords(row.status, row.seats.length).map((w) => w && <span key={w} className="whitespace-nowrap">{w}</span>)}
                        </span>
                      </li>
                    );
                  if (row.kind === 'ais')
                    return (
                      <li key="ais" className="flex items-center gap-3 opacity-60" data-testid="tv-ready-ais" data-count={row.seats.length}>
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
                              {s.name}{' '}
                              <span data-num className="font-mono text-sm font-normal text-ink-3" data-testid={`tv-rank-${s.id}`}>
                                {ordinal(places.get(s.id) ?? game.players.length)}
                              </span>
                              {/* CHANGE 4 */}
                              <RepChip view={game} id={s.id} tv testid={`tv-ready-rep-${s.id}`} />
                            </Fragment>
                          ))}
                        </span>
                        <span className="font-mono text-sm text-ink-3">{row.seats.length} AI · READY</span>
                      </li>
                    );
                  const s = row.seat;
                  const status = claude(s.id);
                  const isAway = !s.isAi && s.away;
                  const state = status ? STATUS_CHIP[status] : s.isAi ? 'AI · READY' : s.ready ? 'READY' : isAway ? 'AWAY · PLANNING' : 'PLANNING';
                  const dim = status ? status === 'ready' : s.isAi || s.ready;
                  const tone = status === 'thinking' ? 'text-holo' : playsBuiltIn(status) || isAway ? 'text-warn' : status || s.ready || s.isAi ? 'text-ink-3' : 'text-holo';
                  return (
                    <li key={s.id} className={cx('flex items-center gap-3', dim && 'opacity-60')} data-testid={`tv-ready-${s.id}`}>
                      <span data-num className="w-9 shrink-0 font-mono text-sm text-ink-3" data-testid={`tv-rank-${s.id}`}>
                        {ordinal(places.get(s.id) ?? game.players.length)}
                      </span>
                      <PlayerMark slot={toSlot(s.slot)} size={22} glow={!dim} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-display text-xl font-semibold" data-testid="tv-ready-name">
                            {s.name}
                            {status && <span className="ml-2 font-mono text-sm font-normal text-ink-3">Claude</span>}
                          </span>
                          {/* CHANGE 4 */}
                          <RepChip view={game} id={s.id} tv testid={`tv-ready-rep-${s.id}`} />
                        </span>
                        {playsBuiltIn(status) && <span className="font-mono text-sm text-ink-3">plays its built-in plan</span>}
                      </span>
                      <span className={cx('font-mono text-sm', tone, status === 'thinking' && 'animate-pulse')} data-testid={`tv-state-${s.id}`}>
                        {state}
                      </span>
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

/** Copied unchanged from TableApp.tsx (not exported there). */
function MarketTiles({ game }: { game: MuleView }) {
  const rows = game.market.slice(0, 6);
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line" data-testid="tv-market">
      {rows.map((r) => (
        <div key={r.good} className="flex flex-col gap-1 bg-panel p-3" data-testid={`tv-market-${r.good}`}>
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

/** TableApp.tsx's News as on ws7-s3-phone-pr (CHANGE 5): each line through NewsWords. */
function News({ game }: { game: MuleView }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="tv-news">
      {game.news.map((n, i) => (
        <li key={n} className="rounded-control border-l-4 border-holo-line bg-panel px-4 py-2.5 text-lg" data-testid={`tv-news-${i}`} {...(i === 0 ? { 'data-fit-keep': true } : {})}>
          <NewsWords view={game} i={i} />
        </li>
      ))}
    </ul>
  );
}
