import type { MuleView, TableView } from '@mule/protocol';
import { cx, GoodTag, HoloMap, PlayerMark, SeatSpeciesProvider } from '@mule/ui';
import { Fragment, useEffect, useReducer, useRef } from 'react';
import { foldedClaudeWords, playsBuiltIn, STATUS_CHIP } from '../../../../../apps/web/src/components/ClaudeSeat';
import { StrikeMap, StrikeWaiting } from '../../../../../apps/web/src/components/Strike';
import { fmt, mapTiles, PHASE_NAME, seatSpecies, secondsUntil, toSlot } from '../../../../../apps/web/src/game/derive';
import { ordinal } from '../../../../../apps/web/src/game/month-end';
import { useServerNow } from '../../../../../apps/web/src/net/react';
import { claudeIn, connectedIn, hostMayContinue, readyRows, stillPlanning } from '../../../../../apps/web/src/phone/hub/ready';
import { ReadyCount, WaitingFor } from '../../../../../apps/web/src/phone/hub/ReadyBar';
import { placesOf } from '../../../../../apps/web/src/phone/hub/standing';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { TvBody } from '../../../../../apps/web/src/table/TvFit';
import { TvGovernorPromise } from '../../../../../apps/web/src/table/TvGovernorPromise';
import { RepChip } from './copied/RepChip';
import { NewsWords } from './copied/SeatWords';
import { TvBudgetLine, TvOverruleCall } from './copied/TvBudgetLine';
import { TvDeals } from './copied/TvDeals';
import { culpritOf, eventsOf, type Investigation } from './world';

/** How long a break or an overrule call holds the TV as a moment before it folds (WS6 ruling, 8 Nov; WS4 accepted). */
export const TV_EVENT_HOLD_S = 8;

/**
 * The most seats at which planning keeps its waiting box (PM ruling 8 Nov, option 2): from one more, the ready list
 * alone says who is still planning, with their chips. The host's "can continue" line is the list's foot at any size.
 * 3, not 4: PM ruling 8 Nov for the prototype; WS4 rules the real placement by 9 Nov 12:00Z. With the box at 4 seats,
 * waiting measured 0.658, under TV-FIT's 0.7 floor (measured.ts).
 */
export const TV_WAITING_BOX_MAX_SEATS = 3;

/*
 * GRAFT TARGET: apps/web/src/table/TableApp.tsx, TvGame's planning branch (WS4), which TableApp.tsx does not export:
 * copied from trunk (feat/strategist at 739fefb0, the same file as this mock's base) with the slices' changes, each
 * marked CHANGE, the parts taken from the approved mocks that own them, not redrawn here. Placed for TV-FIT (WS6 ruling
 * and WS4's three changes, PM-ruled 8 Nov), so that every steady state holds 0.7 with a full market:
 *   1. the budget line on the Governor's-promise row, right-aligned (politics-budget P14, TvBudgetLine); while an
 *      overrule call is held, that side says "Overrule called: tax frozen" instead;
 *   2. a break and an overrule call are MOMENTS: for TV_EVENT_HOLD_S the real banner (TvDeals) or call panel
 *      (TvOverruleCall) overlays the top of the map box, out of flow like the event show's cards, so the body's scale
 *      never moves; then it folds: the break lives in the news (the server's line, newest kept whole), the call in 1;
 *      a change from the politics-deals mock Heiko approved, whose banner stayed under the header all month;
 *   3. the reputation chip after each name in the ready list (politics-deals S3-C19); the waiting box above it shows
 *      none (trunk's WaitingFor, WS4 change c): the list already has them. Above TV_WAITING_BOX_MAX_SEATS there is no
 *      waiting box at all (PM ruling, option 2): the list says who is planning. The host's "can continue" line is the
 *      list's foot at every size, out of the waiting box (PM ruling, 8 Nov);
 *   4. the news through NewsWords, so a computer seat reads "Ossa · AI" by its id (ws7-s3-phone-pr's News).
 * Left out, as the mock has no clock or events: TvEventLayer, and the grounds opener before the month end. The moment's
 * clock is the screen's own (performance.now); the build times it from the server's clock, as the event show does.
 */

/** The kinds of event a TV moment announces (world.ts eventsOf: `break:<card>`, `call:<target>:<caller>`, `investigation:<order>`). */
export type EventKind = 'break' | 'call' | 'investigation';

/**
 * Which events are a moment now: an event is one when this screen first sees it, for TV_EVENT_HOLD_S. What the screen
 * opens on is old news, but for the kind `opensOn` names (the step that is that event). One that arrives later, while
 * the screen is up (a tap on a phone), is always a moment.
 */
function useMoments(events: string[], opensOn: EventKind | null): Set<string> {
  const first = useRef<Map<string, number> | null>(null);
  const now = performance.now();
  if (first.current === null) first.current = new Map(events.map((e) => [e, opensOn && e.startsWith(`${opensOn}:`) ? now : -Infinity]));
  for (const e of events) if (!first.current.has(e)) first.current.set(e, now);
  const hold = TV_EVENT_HOLD_S * 1000;
  const live = events.filter((e) => now - first.current!.get(e)! < hold);
  // Draw again when the next moment folds.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const next = Math.min(...live.map((e) => first.current!.get(e)! + hold - now));
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const t = setTimeout(tick, Math.max(0, next) + 20);
    return () => clearTimeout(t);
  });
  return new Set(live);
}

export function TvPlanning({ table, game, investigation = null, opensOn = null }: { table: TableView<MuleView>; game: MuleView; investigation?: Investigation; opensOn?: EventKind | null }) {
  const now = useServerNow(200);
  const tiles = mapTiles(game);
  const connected = connectedIn(table.seats);
  const claude = claudeIn(table.seats);
  const waiting = stillPlanning(game.players, connected);
  const host = game.players.find((p) => p.id === table.hostId);
  const hostCanContinue = !!host && (host.ready || host.isAi) && hostMayContinue(game);
  const places = placesOf(game);
  const box = game.players.length <= TV_WAITING_BOX_MAX_SEATS;
  const hostLine = hostCanContinue && waiting.length > 0 ? `${host.name}, the host, can continue without them.` : null;
  const moments = useMoments(eventsOf(game, investigation), opensOn);
  const called = game.politics?.overrule?.stage === 'called';
  // The moment's banner draws only the breaks that are a moment now: TvDeals as it is, given those cards.
  const breaking = game.politics ? { ...game, politics: { ...game.politics, brokenDeals: (game.politics.brokenDeals ?? []).filter((c) => moments.has(`break:${c.id}`)) } } : game;
  const calling = [...moments].some((e) => e.startsWith('call:'));
  const found = investigation && moments.has(`investigation:${investigation.order}`) ? investigation : null;
  return (
    <SeatSpeciesProvider value={seatSpecies(game)}>
      <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink" data-phase="planning" data-testid="tv-planning">
        <div className="flex flex-col gap-3">
          <TvHeader game={game} title={PHASE_NAME.planning} seconds={secondsUntil(game.phaseEndsAt, now)} ready={<ReadyCount players={game.players} tv />} />
          {/* CHANGE 1: one row, the promise whole on the left (its own top margin is the row's), the budget in the rest. */}
          <div className="mt-2 flex items-center gap-6" data-testid="tv-promise-row">
            <div className="shrink-0 [&>p]:mt-0">
              <TvGovernorPromise game={game} />
            </div>
            <div className="flex min-w-0 flex-1 justify-end">{called ? <OverruleCalledLine /> : <TvBudgetLine game={game} />}</div>
          </div>
        </div>
        <TvBody>
          <div className="flex min-h-0 flex-1 gap-6">
            <div className="flex w-[700px] shrink-0 flex-col gap-3">
              <div className="relative" data-testid="tv-map-box">
                <StrikeMap view={game} size="tv">
                  <HoloMap width={game.width} height={game.height} tiles={tiles} cursor={game.lit} density="tv" hideGround className="w-full" />
                </StrikeMap>
                {/* CHANGE 2: the moment, over the map's top, out of flow. */}
                {moments.size > 0 && (
                  <div className="absolute inset-x-0 top-0 z-30 flex flex-col gap-3 p-3" data-testid="tv-moment" data-hold-s={TV_EVENT_HOLD_S}>
                    {found && <InvestigationMoment game={game} investigation={found} />}
                    {calling && <TvOverruleCall game={game} />}
                    <TvDeals game={breaking} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between font-mono text-sm text-ink-3" data-testid="tv-map-foot">
                <span>ROOM {table.code}</span>
                <span>
                  {fmt(game.colonists)} COLONISTS · {game.storeMules} MULES IN THE CORRAL · {game.mulePrice} CR EACH
                </span>
              </div>
              <StrikeWaiting game={game} />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4" data-testid="tv-side">
              {!box ? null : waiting.length > 0 ? (
                <div className="flex shrink-0 flex-col gap-3 rounded-panel border-2 border-holo bg-holo-soft p-5 shadow-glow" data-testid="tv-waiting">
                  {/* CHANGE 3: no chips here (WS4 c); the ready list below has them. */}
                  <WaitingFor seats={waiting} me={null} tv />
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
                              {/* CHANGE 3 */}
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
                          {/* CHANGE 3 */}
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
              {/* CHANGE 3: the host's line is the ready list's foot, at every table size (PM ruling, 8 Nov). */}
              {hostLine && (
                <p className="shrink-0 text-lg text-ink-2" data-testid="tv-ready-host">
                  {hostLine}
                </p>
              )}
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

/** TableApp.tsx's News as on ws7-s3-phone-pr (CHANGE 4): each line through NewsWords; a folded break is its line. */
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

/** CHANGE 1, while an overrule call is held: the promise row's right side. The call's own words were its moment's. */
function OverruleCalledLine() {
  return (
    <p className="flex items-center gap-2 whitespace-nowrap text-xl leading-tight text-warn" role="status" data-testid="tv-overrule-called-line">
      <strong className="font-display font-semibold">Overrule called:</strong> tax frozen
    </p>
  );
}

/**
 * An investigation's result as a moment, in the break's frame (the lead's ruling, 8 Nov): the spec's words (slice 4,
 * "What the table sees"), "Solved by the Sheriff: it was Lena" or "The trail went cold". PROPOSED; WS8 may restyle:
 * TvDeals' banner's shape and tokens, alert when it names someone, quiet when the trail went cold.
 */
function InvestigationMoment({ game, investigation }: { game: MuleView; investigation: NonNullable<Investigation> }) {
  const who = investigation.solved ? culpritOf(game, investigation.order) : null;
  return (
    <div
      className={cx('flex items-center gap-5 rounded-panel border-2 px-6 py-3 animate-[show-card-in_0.5s_ease-out]', who ? 'border-alert bg-alert-bg shadow-glow-alert' : 'border-holo-line bg-panel')}
      role="status"
      data-testid="tv-investigation"
      data-solved={investigation.solved}
    >
      {who && <PlayerMark slot={toSlot(who.slot)} species={who.species} size={48} label={who.name} />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cx('label-caps text-base!', who ? 'text-alert-ink' : 'text-ink-3')}>The Sheriff’s investigation</span>
        <span className={cx('font-display text-3xl font-semibold leading-tight', who ? 'text-alert-ink' : 'text-ink')} data-testid="tv-investigation-words">
          {who ? `Solved by the Sheriff: it was ${who.name}` : 'The trail went cold'}
        </span>
      </span>
    </div>
  );
}
