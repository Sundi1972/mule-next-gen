import { GAME, POLITICS } from '@mule/engine';
import type { DealView, MuleView, TableView } from '@mule/protocol';
import { AirGauge, Button, cx, GOOD_NAME, GoodIcon, GoodTag, GroundsOpener, HoloMap, PlayerMark, SPEED_STEPS, speedStep, SeatSpeciesProvider, TERRAIN_NAME, TimeBar, Timer, useGroundsOpener, WalkBoard, type CreatureWrap } from '@mule/ui';
import { AiMark, Speaker, TvTicker, tvSpeakerAt } from '../chat/Chat';
import {
  boardWalkers,
  dealLine,
  dealSpeed,
  heldSeller,
  newestFirst,
  shipWants,
  ShipWants,
  SIDE_WORD,
  skippedLine,
  StatusTable,
  storeLines,
  storeSellsWord,
  StoreBox,
  TvReadout,
  TvSoldOutRow,
  WaitingToPick,
  type DealRow,
} from '../components/AuctionParts';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { BuildSite, ColonyGauges, ColonyScoreBand, MonthScoreColumn, TvWinner, useMonthEndDrift, type GaugeLanding } from '../components/Colony';
import { StrikeBadge, StrikeMap, StrikeWaiting } from '../components/Strike';
import { CollapseBanner, ColonyPanel, LeagueTable, WinnerCard } from '../components/MonthEnd';
import { Chip, claudeChip, ClaudeCountdownWord, foldedClaudeWords, isClaude, playsBuiltIn, STATUS_CHIP } from '../components/ClaudeSeat';
import { joinUrl, Qr } from '../components/Qr';
import { Scaled } from '../components/Scaled';
import { ThemeToggle } from '../components/ThemeToggle';
import { fmt, lobbySeatSpecies, mapTiles, PHASE_NAME, plotName, seatSpecies, secondsUntil, slotOf, standings, tileAt, toSlot } from '../game/derive';
import { inCollapse, ordinal } from '../game/month-end';
import { useAuctionSound } from '../game/sound';
import { useClient, useClientState, useServerNow } from '../net/react';
import { claudeIn, connectedIn, hostMayContinue, pickedIn, pickedPlayers, ranOut, readyRows, SIDE_PICK_WORDS, stillPicking, stillPlanning } from '../phone/hub/ready';
import { ReadyCount, WaitingFor } from '../phone/hub/ReadyBar';
import { TvCouncil } from './TvCouncil';
import { TvDevelop } from './TvDevelop';
import { placesOf } from '../phone/hub/standing';
import { TvEventLayer } from '../events/TvEventLayer';
import { overlayShowAt } from '../events/clock';
import { Grounds } from '../components/Grounds';
import { TvElection } from './TvElection';
import { FitHeight, TvBody } from './TvFit';
import { TvGovernorPromise } from './TvGovernorPromise';
import { TvLandAuction } from './TvLandAuction';
import { TvProduction } from './TvProduction';

/** The big screen: the public view everyone at the table shares. It has no controls. */
export function TableApp({ room }: { room: string }) {
  const client = useClient();
  const { view, role, notice } = useClientState();
  useEffect(() => {
    if (room) client.watch(room);
  }, [client, room]);

  let screen: ReactNode;
  if (!room || notice) screen = <PickRoom notice={notice} />;
  else if (!view || role !== 'board') screen = <Waiting code={room} />;
  else if (view.status === 'lobby' || !view.game) screen = <TvLobby table={view} />;
  else screen = <TvEventLayer game={view.game}><TvGame table={view} game={view.game} /></TvEventLayer>;

  return (
    <div className="h-dvh bg-table">
      <Scaled width={1280} height={720}>
        {screen}
      </Scaled>
    </div>
  );
}

/** Asks for a room code; `notice` says why the last room let this screen go. */
function PickRoom({ notice }: { notice: string | null }) {
  const [code, setCode] = useState('');
  return (
    <form
      className="holo-grid flex h-[720px] w-[1280px] flex-col items-center justify-center gap-8 bg-table text-ink"
      onSubmit={(e) => {
        e.preventDefault();
        window.location.search = `?room=${code}`;
      }}
    >
      <h1 className="font-display text-6xl font-semibold">
        M.U.L.E. <span className="text-holo">Next Gen</span> · big screen
      </h1>
      {notice && (
        <p role="status" className="font-display text-3xl font-semibold text-warn">
          {notice}
        </p>
      )}
      <p className="font-display text-2xl text-ink-2">Type the room code shown on the host's phone.</p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
        aria-label="Room code"
        autoFocus
        className="h-28 w-[420px] rounded-panel border-2 border-holo-line bg-panel text-center font-mono text-7xl font-bold tracking-[0.3em] text-holo outline-none focus:border-holo"
      />
      <Button size="xl" type="submit" disabled={code.length !== 4}>
        Show this table
      </Button>
    </form>
  );
}

function Waiting({ code }: { code: string }) {
  return (
    <div className="holo-grid flex h-[720px] w-[1280px] flex-col items-center justify-center gap-4 bg-table text-ink">
      <span className="label-caps text-base!">Room</span>
      <span className="font-mono text-[112px] font-bold leading-none tracking-[0.2em] text-holo">{code}</span>
      <span className="font-display text-2xl text-ink-2">Connecting to the table…</span>
    </div>
  );
}

function TvLobby({ table }: { table: TableView<MuleView> }) {
  const url = joinUrl(table.code);
  return (
    <div className="holo-grid flex h-[720px] w-[1280px] gap-14 bg-table p-14 text-ink">
      <div className="flex w-[440px] shrink-0 flex-col items-center justify-center gap-6">
        <div className="rounded-panel border-2 border-holo-line bg-void p-5 shadow-glow">
          <Qr text={url} size={300} />
        </div>
        <span className="font-display text-3xl font-semibold">Scan to join</span>
        <span className="font-mono text-xl text-ink-2">{url.replace(/^https?:\/\//, '')}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-8">
        <div className="flex items-end justify-between gap-2">
          <div className="flex flex-col gap-2">
            <span className="label-caps text-base!">Room code</span>
            <span className="font-mono text-[112px] font-bold leading-none tracking-[0.2em] text-holo" data-testid="room-code">
              {table.code}
            </span>
          </div>
          <ThemeToggle />
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {table.seats.map((s, i) => (
            <li key={s.id} className="flex items-center gap-4 rounded-panel border border-holo-line bg-panel px-5 py-4">
              <PlayerMark slot={toSlot(s.color)} species={lobbySeatSpecies(s, i)} size={34} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-display text-2xl font-semibold">{s.name}</span>
                <span className="truncate font-mono text-sm text-ink-3">{isClaude(s) ? 'Claude' : s.isAi ? 'AI player' : s.id === table.hostId ? 'Host' : s.connected ? 'Ready' : 'Away'}</span>
                {/* Its own line: beside the name, the chip leaves a 1280 px TV's half-width card no room for the name. The TV never shows the code. */}
                {isClaude(s) && <Chip word={claudeChip(s)} className="mt-1 self-start px-2! py-0.5 text-xs!" testid={`tv-chip-${s.id}`} />}
              </div>
            </li>
          ))}
          {table.seats.length === 0 && <li className="font-display text-2xl text-ink-3">Nobody has joined yet.</li>}
        </ul>
        <span className="font-display text-2xl text-ink-2">Waiting for the host to start</span>
      </div>
    </div>
  );
}

/**
 * The TV's header: the month and the phase's title (after its `icon`, where it has one), the theme toggle, the colony's
 * gauges (or the air gauge alone when `gauges` is false, as game over and the goods auction keep it; none at all with
 * 'none', where the screen draws them itself, as the month end does; beside the title whatever the header shows with
 * 'beside', as development keeps them, PM ruling 6 Nov) and the clock, then
 * the table chat. `ready`, a screen's ready count, sits beside the title. A header with a clock, the strike badge or a
 * ready count puts the colony's gauges on a row of their own under it, full width: they don't share 1280 px with the
 * title, or the clock runs off the screen's right edge (PM ruling, 5 Nov; rulebook #gauges-row).
 * `landing` counts changes onto the gauges, wherever they sit. The chat ticker shows tvChatLines(game) lines.
 */
export function TvHeader({
  game,
  title,
  icon,
  seconds,
  extra,
  ready,
  gauges = true,
  landing,
}: {
  game: MuleView;
  title: string;
  icon?: ReactNode;
  seconds?: number | undefined;
  extra?: ReactNode;
  ready?: ReactNode;
  gauges?: boolean | 'none' | 'beside';
  landing?: GaugeLanding | undefined;
}) {
  const crowded = seconds !== undefined || ready !== undefined || !!game.colony?.strike;
  const ownRow = !!game.colony && gauges === true && crowded;
  const colony = game.colony && (gauges === true || gauges === 'beside') ? <ColonyGauges colony={game.colony} size="tv" className={ownRow ? 'w-full' : 'w-[760px]'} landing={landing} /> : null;
  // With a ready chip the title keeps one line and the chip its size; without one the header is as it always was: the
  // gauges give way to a long title ("Election day · the result").
  const fixed = ready !== undefined;
  return (
    <>
      <header className="flex items-end justify-between gap-6" data-testid="tv-header">
        <div className={cx('flex flex-col gap-1', fixed && 'min-w-0')}>
          <span className="flex items-center gap-3">
            <span className="label-caps whitespace-nowrap text-base!">
              Month {game.month} / {game.maxMonths}
            </span>
            {gauges && <StrikeBadge strike={game.colony?.strike} />}
          </span>
          <h1 className={cx('flex items-center gap-4 font-display text-5xl font-semibold leading-none', fixed && 'whitespace-nowrap')} data-testid="tv-phase">
            {icon}
            {title}
          </h1>
        </div>
        <div className={cx('flex items-center gap-4', fixed && 'shrink-0')}>
          {extra}
          <ThemeToggle />
          {ownRow || gauges === 'none' ? null : (colony ?? <AirGauge level={game.air.level} band={game.air.band} tv />)}
          {seconds !== undefined && <Timer seconds={seconds} className="h-14! px-5! text-3xl!" />}
          {ready}
        </div>
      </header>
      {ownRow && colony}
      <TvTicker most={tvChatLines(game)} />
    </>
  );
}

/**
 * How many chat lines the TV's strip shows: the newest only, on every game screen. In play every screen needs the
 * height; at the month end a six-seat league with three lines fell under 0.7 of its size, and the game over's final table
 * is the same league (PM rulings 6 Nov, rulebook #tv-fit). Only the lobby would keep three, and it has no strip.
 */
export function tvChatLines(_game: Pick<MuleView, 'phase' | 'finished'>): number {
  return 1;
}

function TvGame({ table, game }: { table: TableView<MuleView>; game: MuleView }) {
  const now = useServerNow(200);
  // The month-end opener, after the month end's event show and before TvMonthEnd (spec C7, RULE-6).
  const opener = useGroundsOpener(game, overlayShowAt(game, now) !== null);
  // Here, where the TV stays mounted across phases, so the drift plays when it sees the month end come (WS8 PR-E2).
  const drift = useMonthEndDrift(game, opener === null);
  const tiles = mapTiles(game);
  const lit = game.lit ? tileAt(game, game.lit.x, game.lit.y) : undefined;
  const phase = game.phase;

  if (game.finished) {
    return (
      <SeatSpeciesProvider value={seatSpecies(game)}>
        <TvGameOver game={game} />
      </SeatSpeciesProvider>
    );
  }

  if (phase === 'production' && game.production) return <TvProduction table={table} game={game} production={game.production} />;
  if (phase === 'upkeep')
    return (
      <SeatSpeciesProvider value={seatSpecies(game)}>
        {opener && game.colony ? <GroundsOpener opener={opener} colony={game.colony} month={game.month} Scene={Grounds} /> : <TvMonthEnd game={game} drift={drift} />}
      </SeatSpeciesProvider>
    );
  if (phase === 'planning' && game.politics?.election && game.politics.election.stage !== 'over') return <TvElection table={table} game={game} />;
  if (phase === 'planning' && game.politics?.council && game.politics.council.stage !== 'over') return <TvCouncil game={game} />;
  if (phase === 'development') return <TvDevelop game={game} />;

  let side: ReactNode;
  if (phase === 'landGrant')
    side = (
      <>
        <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft p-5 shadow-glow">
          <span className="label-caps">Lit now</span>
          {lit ? (
            <>
              <span data-num className="font-mono text-4xl font-bold text-holo">
                Plot {plotName(lit.x, lit.y)}
              </span>
              <span className="font-display text-2xl font-semibold">{TERRAIN_NAME[lit.terrain]} · free</span>
            </>
          ) : (
            <span className="font-display text-2xl font-semibold">No free land left</span>
          )}
        </div>
        <Players game={game} right={(p) => <span className="font-mono text-lg text-ink-2">{`${p.plots} ${p.plots === 1 ? 'plot' : 'plots'}`}</span>} />
        <p className="mt-auto font-display text-2xl leading-snug text-ink-2">Free plots light up one by one, row by row from the top. Tap CLAIM on your phone when yours is lit.</p>
      </>
    );
  else if (phase === 'production') side = <HarvestSide game={game} />;
  else {
    const connected = connectedIn(table.seats);
    const claude = claudeIn(table.seats);
    const waiting = stillPlanning(game.players, connected);
    const host = game.players.find((p) => p.id === table.hostId);
    // The host's Continue goes on without the others in planning proper and the election's announce and ballot; never in its ceremony.
    const hostCanContinue = !!host && (host.ready || host.isAi) && hostMayContinue(game);
    const places = placesOf(game);
    side = (
      <>
        {/* This branch also draws an auction or land auction for the moment before its data arrives; Ready means Done there. */}
        {phase !== 'planning' ? null : waiting.length > 0 ? (
          <div className="flex shrink-0 flex-col gap-3 rounded-panel border-2 border-holo bg-holo-soft p-5 shadow-glow" data-testid="tv-waiting">
            <WaitingFor seats={waiting} me={null} tv />
            {hostCanContinue && <span className="text-lg text-ink-2">{host.name}, the host, can continue without them.</span>}
          </div>
        ) : (
          <div className="shrink-0 rounded-panel border-2 border-holo bg-holo-soft p-5 font-display text-3xl font-semibold shadow-glow">Everyone is ready</div>
        )}
        <div className="shrink-0">
          <MarketTiles game={game} />
        </div>
        {/* News gives way when the column is full, so the prices and who we wait for always show; chat is the ticker's. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden" data-fit-gives>
          <News news={game.news} />
        </div>
        {phase !== 'planning' ? (
          <Players game={game} className="mt-auto" right={(p) => <span className="font-mono text-sm text-ink-3">{p.ready ? 'READY' : p.isAi ? '' : '…'}</span>} />
        ) : (
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
                    {/* Beside the built-in note the names would keep only a few letters: the creatures say who. */}
                    {playsBuiltIn(row.status) ? (
                      <span className="flex-1" />
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-display text-xl font-semibold" data-testid="tv-ready-claude-names">
                        {row.seats.map((s) => s.name).join(', ')}
                      </span>
                    )}
                    {/* The note wraps under the words when the column is narrow (five seats at full size), never past its edge. */}
                    <span className={cx('flex min-w-0 flex-wrap justify-end gap-x-2 font-mono text-sm', row.status === 'thinking' ? 'animate-pulse text-holo' : 'text-warn')}>
                      {foldedClaudeWords(row.status, row.seats.length).map((w) => w && <span key={w} className="whitespace-nowrap">{w}</span>)}
                    </span>
                  </li>
                );
              if (row.kind === 'ais')
                return (
                  <li key="ais" className="flex items-center gap-3 opacity-60" data-testid="tv-ready-ais" data-count={row.seats.length}>
                    {/* The place column stays, empty, so the row lines up; each AI's place follows its name. */}
                    <span aria-hidden className="w-9 shrink-0" />
                    <span className="flex shrink-0 -space-x-1.5">
                      {row.seats.map((s) => (
                        <PlayerMark key={s.id} slot={toSlot(s.slot)} size={22} />
                      ))}
                    </span>
                    <span className="flex-1 truncate font-display text-xl font-semibold">
                      {row.seats.map((s, i) => (
                        <Fragment key={s.id}>
                          {i > 0 && ', '}
                          {s.name}{' '}
                          <span data-num className="font-mono text-sm font-normal text-ink-3" data-testid={`tv-rank-${s.id}`}>
                            {ordinal(places.get(s.id) ?? game.players.length)}
                          </span>
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
              // HC-3: a Claude seat is never waited for here; its status is a label, and only READY dims it.
              const dim = status ? status === 'ready' : s.isAi || s.ready;
              const tone = status === 'thinking' ? 'text-holo' : playsBuiltIn(status) || isAway ? 'text-warn' : status || s.ready || s.isAi ? 'text-ink-3' : 'text-holo';
              return (
                <li key={s.id} className={cx('flex items-center gap-3', dim && 'opacity-60')} data-testid={`tv-ready-${s.id}`}>
                  {/* Their place by Worth, the number everyone sees. */}
                  <span data-num className="w-9 shrink-0 font-mono text-sm text-ink-3" data-testid={`tv-rank-${s.id}`}>
                    {ordinal(places.get(s.id) ?? game.players.length)}
                  </span>
                  <PlayerMark slot={toSlot(s.slot)} size={22} glow={!dim} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-display text-xl font-semibold" data-testid="tv-ready-name">
                      {s.name}
                      {status && <span className="ml-2 font-mono text-sm font-normal text-ink-3">Claude</span>}
                    </span>
                    {/* Under the name, not beside it: beside, it leaves the name a few letters. */}
                    {playsBuiltIn(status) && <span className="font-mono text-sm text-ink-3">plays its built-in plan</span>}
                  </span>
                  <span className={cx('font-mono text-sm', tone, status === 'thinking' && 'animate-pulse')} data-testid={`tv-state-${s.id}`}>
                    {state}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  if (phase === 'auction' && game.auction && !game.finished) {
    return (
      <SeatSpeciesProvider value={seatSpecies(game)}>
        <TvAuction table={table} game={game} auction={game.auction} />
      </SeatSpeciesProvider>
    );
  }

  if (phase === 'landAuction' && game.landAuction && !game.finished) {
    return (
      <SeatSpeciesProvider value={seatSpecies(game)}>
        <TvLandAuction table={table} game={game} lot={game.landAuction} />
      </SeatSpeciesProvider>
    );
  }

  return (
    <SeatSpeciesProvider value={seatSpecies(game)}>
      <div className={cx('flex h-[720px] w-[1280px] flex-col bg-table text-ink', phase === 'planning' ? 'gap-4 px-10 py-6' : 'gap-5 p-10')} data-phase={phase} data-testid={phase === 'planning' ? 'tv-planning' : undefined}>
        {phase === 'planning' ? (
          <div className="flex flex-col gap-3">
            <TvHeader game={game} title={PHASE_NAME[phase]} seconds={secondsUntil(game.phaseEndsAt, now)} ready={<ReadyCount players={game.players} tv />} />
            <TvGovernorPromise game={game} />
          </div>
        ) : (
          <TvHeader game={game} title={PHASE_NAME[phase]} seconds={secondsUntil(game.phaseEndsAt, now)} />
        )}
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
              {/* Under the strikers it is about, in the room the map leaves: in the side it pushed planning under the floor (PM, 6 Nov). */}
              <StrikeWaiting game={game} />
            </div>
            {/* Planning's news gives way first, as it always has; only what is left over scales the body. */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">{side}</div>
          </div>
        </TvBody>
      </div>
    </SeatSpeciesProvider>
  );
}

function Players({ game, right, className }: { game: MuleView; right: (p: MuleView['players'][number]) => ReactNode; className?: string }) {
  return (
    <ul className={cx('flex flex-col gap-2', className)}>
      {game.players.map((p) => (
        <li key={p.id} className="flex items-center gap-3" data-testid={`tv-player-${p.id}`}>
          <Speaker id={p.id} size="tv">
            <PlayerMark slot={toSlot(p.slot)} size={22} />
          </Speaker>
          {/* A computer seat's mark (Heiko, 7 Nov) sits outside the name's truncation, so a long name never cuts it off. */}
          <span className="flex min-w-0 flex-1 items-baseline font-display text-xl font-semibold">
            <span className="truncate" data-testid="tv-player-name">
              {p.name}
            </span>
            {p.isAi && (
              <span className="shrink-0 whitespace-pre font-normal">
                <AiMark />
              </span>
            )}
          </span>
          {right(p)}
        </li>
      ))}
    </ul>
  );
}

function News({ news }: { news: string[] }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="tv-news">
      {news.map((n, i) => (
        // The newest stays whole when the column runs short: older ones give way (FitHeight's data-fit-keep).
        <li key={n} className="rounded-control border-l-4 border-holo-line bg-panel px-4 py-2.5 text-lg" {...(i === 0 ? { 'data-fit-keep': true } : {})}>
          {n}
        </li>
      ))}
    </ul>
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

/**
 * The running deals, newest first, each keeping its place for as long as it runs. The rows live in state and
 * follow each new deals list during render (React's "adjust state when a prop changes"), so a discarded render
 * leaves nothing behind.
 */
function useNewestFirst(deals: DealView[]): DealRow[] {
  const [held, setHeld] = useState(() => ({ from: deals, rows: newestFirst([], deals) }));
  if (held.from === deals) return held.rows;
  const rows = newestFirst(held.rows, deals);
  setHeld({ from: deals, rows });
  return rows;
}

/**
 * The sellers held at what they must hold, newest first: those already held keep their order, one just held goes on top.
 * The order is adjusted during render, as useNewestFirst's, so the card never shows a seller who is no longer held.
 */
function useHeldNewestFirst(ids: string[]): string[] {
  const key = ids.join(',');
  const [held, setHeld] = useState(() => ({ key, ids }));
  if (held.key === key) return held.ids;
  const kept = held.ids.filter((id) => ids.includes(id));
  const next = [...ids.filter((id) => !kept.includes(id)), ...kept];
  setHeld({ key, ids: next });
  return next;
}

/**
 * The auction on the big screen: before each good, the status table and everyone's side, which is public;
 * then the whole board, large, with every creature walking live.
 */
export function TvAuction({ table, game, auction }: { table: TableView<MuleView>; game: MuleView; auction: NonNullable<MuleView['auction']> }) {
  useAuctionSound(auction);
  const skipped = skippedLine(auction);
  const walkers = boardWalkers(game, auction);
  const stock = auction.storeForSale;
  const deals = useNewestFirst(auction.deals);
  const held = useHeldNewestFirst(auction.walkers.filter(heldSeller).map((w) => w.id));
  const status = auction.stage === 'status';
  // The close stage (A-5, G-5): the board holds still while each phone shows its receipt; "closed" is the receipt's word.
  const closed = auction.stage === 'close';
  const stageName = status ? 'Buy or sell?' : closed ? 'Closed' : auction.slowed ? 'Trading · clock slowed' : 'Walk';
  const ship = shipWants(game, auction);
  // The side pick has no clock (A-7): who has picked, who is still picking, and the host who can move on for them.
  const connected = connectedIn(table.seats);
  const waiting = status ? stillPicking(game, connected, claudeIn(table.seats)) : [];
  const builtIn = ranOut(game);
  const host = game.players.find((p) => p.id === table.hostId);
  const picked = pickedPlayers(game.players, waiting);
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-3 bg-table px-10 py-6 text-ink" data-phase="auction" data-stage={auction.stage} data-testid={status ? 'tv-status' : 'tv-walk'}>
      {/* The good leads the headline, its glyph first (Heiko, 5 Nov). */}
      <TvHeader game={game} title={`${GOOD_NAME[auction.good]} auction`} icon={<GoodIcon good={auction.good} size={52} />} gauges={false} />
      <TvBody>
        <div className="flex min-h-0 flex-1 gap-6">
          <div className={cx('flex min-w-0 flex-1 flex-col', status ? 'gap-3' : 'gap-2')}>
            {status ? (
              // On the status stage the skipped words share the picked count's row, under the no-clock line, so the ship
              // panel keeps its room; both lines show in full, wrapping rather than cut.
              <div className="flex shrink-0 items-center gap-4" data-testid="tv-pick-bar">
                {/* The time bar's height, not ReadyCount's TV chip: a taller row pushes the ship panel off the screen. */}
                <span className="flex h-8 shrink-0 items-center rounded-chip border border-holo-line bg-holo-soft px-4 font-mono text-2xl font-bold leading-none text-holo" data-testid="ready-count">
                  {picked.filter((p) => p.ready).length} / {picked.length} PICKED
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-2xl leading-tight text-ink-2">
                    <strong className="font-semibold text-ink">No clock:</strong> {SIDE_PICK_WORDS.noClock}
                  </span>
                  {skipped && (
                    <p className="font-mono text-sm leading-tight text-ink-3" data-testid="skipped">
                      {skipped}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <>
                <TimeBar size="tv" seconds={auction.seconds} total={auction.total} slowed={auction.slowed} />
                {skipped && (
                  <p className="font-mono text-base text-ink-3" data-testid="skipped">
                    {skipped}
                  </p>
                )}
              </>
            )}
            {status ? (
              <>
                <div className="rounded-panel border border-holo-line bg-panel px-5 py-4">
                  <StatusTable view={game} auction={auction} tv />
                </div>
                {/* The store box never gives up its prices to the ship panel or the chat ticker. */}
                <div className="shrink-0">
                  <StoreBox auction={auction} tv />
                </div>
                {ship && <ShipWants want={ship.first} also={ship.also} tv />}
              </>
            ) : (
              <WalkBoard
                size="tv"
                lo={auction.lo}
                hi={auction.hi}
                walkers={walkers}
                deals={auction.deals.map((d) => ({ ...d, speed: dealSpeed(d.units) }))}
                storeBuys={auction.storeBuys}
                {...storeLines(auction)}
                shipPays={auction.shipPays}
                {...(auction.shipPays !== null ? { shipCaption: `The ship buys ${GOOD_NAME[auction.good]} at ${auction.shipPays}` } : {})}
                storeStock={stock}
                marks={{ ask: true, bid: true }}
                wrapCreature={tvSpeakerAt}
                className={cx('min-h-0 flex-1', closed && 'opacity-40')}
              />
            )}
          </div>
          {/* The side fits its own height, so every running deal stays in sight (PM rulings 5 and 6 Nov): when the deals
              don't fit at full size the side is drawn smaller, never the board, which keeps one size as deals come and
              go. Size-contained, it takes the row's height and never sets it. */}
          <FitHeight className="w-[300px] shrink-0 [contain:size]" innerClassName={status ? 'gap-4' : 'gap-2'} gives>
            {/* On the walk the header already names the good, its glyph first, so the box keeps the stage and the units
                traded: one row when both fit, else two short lines. */}
            <div className={cx('rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow', status ? 'flex flex-col gap-1' : 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1')} data-testid="tv-stage-box">
              {status && <GoodTag good={auction.good} name className="text-2xl" />}
              <span className={cx('font-display text-xl font-semibold', auction.slowed && 'text-warn')} data-testid="tv-stage">
                {stageName}
              </span>
              {!status && (
                <span data-num className="font-mono text-lg text-ink-2" data-testid="tv-units">
                  {auction.units} unit{auction.units === 1 ? '' : 's'} traded
                </span>
              )}
            </div>
            {status ? (
              <ul className="flex flex-col gap-2" data-testid="tv-picked">
                {game.players.map((p) => {
                  const s = auction.walkers.find((w) => w.id === p.id)?.side;
                  const wait = waiting.find((w) => w.id === p.id && w.until !== undefined);
                  const done = !wait && (p.isAi || pickedIn(game, p.id));
                  const away = !connected(p.id);
                  const name = (
                    <>
                      <PlayerMark slot={slotOf(game, p.id) ?? 0} size={22} glow={!done} />
                      <span className="min-w-0 flex-1 truncate font-display text-xl font-semibold" data-testid="tv-picked-name">
                        {p.name}
                      </span>
                    </>
                  );
                  if (builtIn.has(p.id))
                    return (
                      <li key={p.id} className="flex flex-col opacity-60" data-testid={`tv-picked-${p.id}`}>
                        <span className="flex items-center gap-3">{name}</span>
                        <span className="flex flex-wrap items-baseline gap-x-2 pl-[34px] font-mono">
                          <span className="text-base font-bold text-warn">CLAUDE · READY</span>
                          <span className="text-sm text-ink-3">plays its built-in plan</span>
                        </span>
                      </li>
                    );
                  // In this 300 px column the countdown beside the name would leave the name no room: it goes under it.
                  if (wait)
                    return (
                      <li key={p.id} className="flex flex-col" data-testid={`tv-picked-${p.id}`}>
                        <span className="flex items-center gap-3">{name}</span>
                        <ClaudeCountdownWord until={wait.until!} status={wait.status} className={cx('pl-[34px] font-mono text-base font-bold', playsBuiltIn(wait.status) ? 'text-warn' : 'text-holo')} />
                      </li>
                    );
                  return (
                    <li key={p.id} className="flex items-center gap-3" data-testid={`tv-picked-${p.id}`}>
                      {name}
                      <span className={cx('font-mono text-lg font-bold', !done ? (away ? 'text-warn' : 'text-holo') : s === 'seller' ? 'text-rise' : s === 'buyer' ? 'text-fall' : 'text-ink-3')}>
                        {!done ? (away ? 'AWAY · PICKING' : 'PICKING') : `${SIDE_WORD[s ?? 'pass'].toUpperCase()} ✓`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="shrink-0 rounded-panel border border-holo-line bg-panel p-3">
                <TvReadout view={game} auction={auction} />
              </div>
            )}
            {waiting.length > 0 && (
              <div className="flex flex-col gap-2 rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow" data-testid="tv-waiting">
                <WaitingToPick seats={waiting} tv />
                {host && <span className="text-lg text-ink-2">{host.name}, the host, can move on for them.</span>}
              </div>
            )}
            {!status && (
              <dl className="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line font-mono" data-testid="tv-store">
                <div className="flex flex-col bg-panel p-3">
                  <dt className="label-caps">Sells</dt>
                  <dd data-num className="text-2xl font-bold text-rise">{storeSellsWord(auction)}</dd>
                </div>
                <div className="flex flex-col bg-panel p-3">
                  <dt className="label-caps">Buys</dt>
                  <dd data-num className="text-2xl font-bold text-fall">{auction.storeBuys ?? '—'}</dd>
                </div>
                <div className="flex flex-col bg-panel p-3">
                  <dt className="label-caps">Stock</dt>
                  <dd data-num className={cx('text-2xl font-bold', stock === 0 ? 'text-alert' : 'text-ink')}>{stock}</dd>
                </div>
                {stock === 0 && <TvSoldOutRow auction={auction} />}
              </dl>
            )}
            {auction.shipPays !== null && (
              <p className="rounded-control border border-warn/60 px-3 py-2 text-lg leading-snug text-warn" data-testid="tv-ship">
                <strong className="font-semibold">
                  The ship buys {GOOD_NAME[auction.good]} at {auction.shipPays}
                </strong>
              </p>
            )}
            {/* RULE-4 said, not only marked KEEPS on the board (WS6's mock, TvSale): the newest held seller in the mock's
                card; the others are their marks in one box of a fixed height, whatever their number, so a full table
                keeps the side over the fit floor (PM ruling (A), 6 Nov). The board names each one's KEEPS n. */}
            {!status && held.length > 0 && (
              <ul className="flex shrink-0 flex-col gap-1.5" data-testid="tv-held">
                {(() => {
                  const w = auction.walkers.find((x) => x.id === held[0])!;
                  const name = game.players.find((x) => x.id === w.id)?.name ?? w.id;
                  return (
                    <li className="flex flex-col gap-2 rounded-panel border border-ok/70 bg-panel p-4" data-testid={`tv-held-${w.id}`}>
                      {/* The line wraps, as the mock's does: a long name never cuts off the count and the good. The mark is
                          the name's picture, so a reader hears the name once. */}
                      <span className="flex items-start gap-2 font-display text-2xl font-semibold leading-tight">
                        <span aria-hidden="true" className="shrink-0">
                          <PlayerMark slot={slotOf(game, w.id) ?? 0} size={32} label={name} />
                        </span>
                        <span className="min-w-0 break-words" data-testid="held-words">{`${name} keeps ${w.units} ${GOOD_NAME[auction.good]}`}</span>
                      </span>
                      <span className="font-mono text-xl text-ink-2">what they must hold</span>
                    </li>
                  );
                })()}
                {held.length > 1 && (
                  <li className="flex flex-col gap-1 rounded-control border border-ok/70 bg-panel px-3 py-1.5" data-testid="tv-held-others">
                    <span className="flex h-5 items-center gap-1.5">
                      {held.slice(1).map((id) => (
                        <PlayerMark key={id} slot={slotOf(game, id) ?? 0} size={20} label={game.players.find((x) => x.id === id)?.name ?? id} />
                      ))}
                    </span>
                    <span className="text-base leading-tight text-ink-2">{held.length > 2 ? 'keep' : 'keeps'} what they must hold too</span>
                  </li>
                )}
              </ul>
            )}
            {/* Newest first, every one of them: none is clipped or wrapped out of sight; the side scales instead. */}
            <ul className="flex flex-1 flex-col gap-1.5">
              {deals.map(({ key, deal }, i) => {
                // Variant A (Heiko's pick): the newest deal shows its speed-up, as the board's counter does; the older
                // ones are compressed to one row each, so two deals fit under the store box (PM ruling, 5 Nov).
                const steps = speedStep(dealSpeed(deal.units));
                // The units and the price always show; a long pair of names gives way first.
                const line = dealLine(game, deal);
                const cut = line.lastIndexOf(' · ');
                const words = (
                  <>
                    <span className="min-w-0 truncate" data-testid="tv-deal-names">
                      {line.slice(0, cut)}
                    </span>
                    <span className="shrink-0 whitespace-pre" data-testid="tv-deal-terms">
                      {line.slice(cut)}
                    </span>
                  </>
                );
                if (i > 0)
                  return (
                    <li key={key} className="flex w-full rounded-control border border-holo bg-holo-soft px-3 py-1.5 font-mono text-base font-bold leading-tight text-holo" data-testid="tv-deal">
                      {words}
                    </li>
                  );
                return (
                  <li key={key} className="flex w-full flex-col rounded-control border border-holo bg-holo-soft px-3 py-1.5 font-mono text-lg font-bold leading-tight text-holo" data-testid="tv-deal">
                    <span className="flex">{words}</span>
                    <span className="flex items-center gap-2 text-base font-normal text-ink-2">
                      <span className="text-2xl font-bold leading-none tracking-[-0.1em]" aria-label={`speed ${steps} of ${SPEED_STEPS}`} data-testid="tv-deal-speed">
                        {Array.from({ length: SPEED_STEPS }, (_, k) => (
                          <span key={k} className={k < steps ? 'text-holo' : 'text-ink-3/30'}>
                            ›
                          </span>
                        ))}
                      </span>
                      {steps === SPEED_STEPS ? 'full speed' : 'faster and faster'}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className={cx('mt-auto text-base leading-tight text-ink-2', auction.deals.length > 0 && 'hidden')} data-testid="tv-help">
              {status
                ? `Pick your side on your phone. No clock: ${SIDE_PICK_WORDS.noClock}`
                : 'Sellers push the red line down, buyers push the green line up. When the two lines meet, the goods change hands.'}
            </p>
            <span className="shrink-0 truncate font-mono text-sm text-ink-3" data-testid="tv-room-line">
              ROOM {table.code}
              {/* The queue may still skip goods, so only the close names what comes next, as the phone does. */}
              {closed ? ` · ${auction.upNext ? `NEXT ${GOOD_NAME[auction.upNext].toUpperCase()}` : 'LAST GOOD'}` : ''}
            </span>
          </FitHeight>
        </div>
      </TvBody>
    </div>
  );
}

/** Beside the map in the moment before the production show's data arrives: the news, the colony and the standings. */
function HarvestSide({ game }: { game: MuleView }) {
  const food = game.market.find((r) => r.good === 'food');
  return (
    <>
      <News news={game.news} />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line">
        <div className="flex flex-col gap-1 bg-panel p-4">
          <span className="label-caps">Colonists</span>
          <span data-num className="font-mono text-3xl font-bold">
            {fmt(game.colonists)}
          </span>
        </div>
        <div className="flex flex-col gap-1 bg-panel p-4">
          <span className="label-caps">Food cover</span>
          <span data-num className={cx('font-mono text-3xl font-bold', (food?.cover ?? 0) < 1 && 'text-warn')}>
            {food?.cover ?? 0} mo
          </span>
        </div>
      </div>
      <TvStandings game={game} />
    </>
  );
}

/**
 * The big screen at the month's end (C20, WS6's approved mock): the league table by Worth with the lead and each
 * change since last month, and how the colony is doing. Public: totals only, each player's own lines are on their
 * phone (HC-4). It stays up until everyone moves on, and counts who has, as planning does.
 */
export function TvMonthEnd({ game, drift }: { game: MuleView; drift?: GaugeLanding | undefined }) {
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-3 bg-table px-10 py-8 text-ink" data-phase={game.phase} data-testid="tv-monthend">
      {/* The league and the colony's score need the height (six seats, PM ruling C, 5 Nov): the colony's gauges sit at the
          top of the right column, not in a row of their own. */}
      <div className="flex flex-col gap-3">
        <TvHeader game={game} title="End of the month" ready={<ReadyCount players={game.players} tv />} gauges={game.colony ? 'none' : true} />
      </div>
      {inCollapse(game) && <CollapseBanner density="tv" donations={!!game.colony} />}
      <FitHeight className="flex-1">
        {game.colony ? (
          <div className="grid flex-1 grid-cols-[minmax(0,6fr)_minmax(0,6fr)] gap-6">
            <MonthScoreColumn view={game}>
              <LeagueTable view={game} density="tv" />
            </MonthScoreColumn>
            <div className="flex flex-col gap-4">
              <ColonyGauges colony={game.colony} size="tv" className="grid-cols-2!" landing={drift} />
              <ColonyPanel view={game} density="tv" besideGauges />
              {/* One line a project, so six seats fit TV-FIT's floor; the funding, pips and plaques are on the phones. */}
              <BuildSite colony={game.colony} players={game.players} size="tv" compact />
            </div>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6">
            <LeagueTable view={game} density="tv" />
            <ColonyPanel view={game} density="tv" />
          </div>
        )}
      </FitHeight>
      <p className="truncate text-base leading-snug text-ink-2" data-testid="worth-rule">
        Worth: cash + goods at the store’s price + land at {GAME.plotScore} cr a plot + MULEs at {game.mulePrice} cr + {POLITICS.termScore} cr a term in office{game.colony ? ' + donations' : ''}. Your own lines are on your phone.
      </p>
    </div>
  );
}

/**
 * The big screen at the end, in credits (C20): the winner called out beside the final table by Worth, the colony's
 * report and verdict across the bottom. Totals only: goods are private.
 */
export function TvGameOver({ game }: { game: MuleView }) {
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table p-10 text-ink" data-phase={game.phase} data-testid="tv-gameover">
      <TvHeader game={game} title={PHASE_NAME.gameOver} gauges={false} />
      <FitHeight className="flex-1">
        <div className="flex flex-1 flex-col gap-4">
          <div className="grid flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
            {game.colony ? <TvWinner view={game} className="self-start" /> : <WinnerCard view={game} density="tv" />}
            <div className="flex flex-col" data-testid="tv-scores">
              <LeagueTable view={game} density="tv" final />
            </div>
          </div>
          {game.colony ? <ColonyScoreBand view={game} colony={game.colony} /> : <ColonyPanel view={game} density="tv" layout="row" verdict />}
        </div>
      </FitHeight>
    </div>
  );
}

/** The standings beside the map while the harvest comes in, best first. */
export function TvStandings({ game }: { game: MuleView }) {
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-standings">
      <span className="label-caps">Standings · worth</span>
      <ol className="flex flex-col gap-2">
        {standings(game).map((s, i) => (
          <li key={s.player.id} className="flex items-center gap-3">
            <span className="w-6 font-mono text-lg text-ink-3">{i + 1}</span>
            <PlayerMark slot={s.slot} size={22} />
            <span className="flex-1 font-display text-xl font-semibold">{s.player.name}</span>
            <span data-num className="font-mono text-xl font-bold">
              {fmt(s.value)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
