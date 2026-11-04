import { DEV_WALK, DEVELOPMENT, GAME, POLITICS } from '@mule/engine';
import type { DealView, MuleView, TableView } from '@mule/protocol';
import { AirGauge, Button, cx, GOOD_NAME, GoodTag, HoloMap, PaceList, PlayerMark, SeatSpeciesProvider, SharedClock, StoreInterior, TERRAIN_NAME, TimeBar, Timer, WalkBoard, type CreatureWrap } from '@mule/ui';
import { Speaker, TvTicker, tvSpeakerAt } from '../chat/Chat';
import { boardWalkers, dealLine, newestFirst, shipWants, ShipWants, SIDE_WORD, skippedLine, StatusTable, StoreBox, TvReadout, type DealRow } from '../components/AuctionParts';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CollapseBanner, ColonyPanel, LeagueTable, WinnerCard } from '../components/MonthEnd';
import { joinUrl, Qr } from '../components/Qr';
import { Scaled } from '../components/Scaled';
import { ThemeToggle } from '../components/ThemeToggle';
import { fmt, lobbySeatSpecies, mapTiles, PHASE_NAME, plotName, seatSpecies, secondsUntil, slotOf, standings, tileAt, toSlot } from '../game/derive';
import { inCollapse } from '../game/month-end';
import { useAuctionSound } from '../game/sound';
import { useClient, useClientState, useServerNow } from '../net/react';
import { connectedIn, hostMayContinue, readyRows, stillPlanning } from '../phone/hub/ready';
import { ReadyCount, WaitingFor } from '../phone/hub/ReadyBar';
import { TvEventLayer } from '../events/TvEventLayer';
import { TvElection } from './TvElection';
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
                <span className="truncate font-mono text-sm text-ink-3">{s.isAi ? 'AI player' : s.id === table.hostId ? 'Host' : s.connected ? 'Ready' : 'Away'}</span>
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

export function TvHeader({ game, title, seconds, extra }: { game: MuleView; title: string; seconds?: number | undefined; extra?: ReactNode }) {
  return (
    <>
      <header className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1">
          <span className="label-caps text-base!">
            Month {game.month} / {game.maxMonths}
          </span>
          <h1 className="font-display text-5xl font-semibold leading-none" data-testid="tv-phase">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {extra}
          <ThemeToggle />
          <AirGauge level={game.air.level} band={game.air.band} tv />
          {seconds !== undefined && <Timer seconds={seconds} className="h-14! px-5! text-3xl!" />}
        </div>
      </header>
      <TvTicker />
    </>
  );
}

function TvGame({ table, game }: { table: TableView<MuleView>; game: MuleView }) {
  const now = useServerNow(200);
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

  if (phase === 'production' && game.production) return <TvProduction game={game} production={game.production} />;
  if (phase === 'upkeep')
    return (
      <SeatSpeciesProvider value={seatSpecies(game)}>
        <TvMonthEnd game={game} />
      </SeatSpeciesProvider>
    );
  if (phase === 'planning' && game.politics?.election && game.politics.election.stage !== 'over') return <TvElection table={table} game={game} />;

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
        <Players game={game} right={(p) => <span className="font-mono text-lg text-ink-2">{p.plots} plots</span>} />
        <p className="mt-auto font-display text-2xl leading-snug text-ink-2">Free plots light up one by one, row by row from the top. Tap CLAIM on your phone when yours is lit.</p>
      </>
    );
  else if (phase === 'development')
    side = (
      <>
        <div className="h-[240px]">
          <StoreInterior mules={game.storeMules} mulePrice={game.mulePrice} prices={{}} tv />
        </div>
        {/* The roster's rows carry each colonist's pace: one column, so every name shows in full. While month 1's
            clock waits, whose first MULE is in takes its place, row for row. */}
        <div className="mt-auto">
          {game.clockWaitsFor ? (
            <FirstMules game={game} wrapMark={tvSpeakerAt} />
          ) : (
            <PaceList
              rule={DEV_WALK}
              columns={1}
              wrapMark={tvSpeakerAt}
              rows={game.players.map((p) => ({ id: p.id, name: p.name, slot: toSlot(p.slot), condition: p.condition, note: p.doneDeveloping ? 'PUB' : 'BUILDING', done: p.doneDeveloping }))}
            />
          )}
        </div>
      </>
    );
  else if (phase === 'production') side = <HarvestSide game={game} />;
  else {
    const connected = connectedIn(table.seats);
    const waiting = stillPlanning(game.players, connected);
    const host = game.players.find((p) => p.id === table.hostId);
    // The host's Continue goes on without the others in planning proper and the election's announce and ballot; never in its ceremony.
    const hostCanContinue = !!host && (host.ready || host.isAi) && hostMayContinue(game);
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
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
          <News news={game.news} />
        </div>
        {phase !== 'planning' ? (
          <Players game={game} className="mt-auto" right={(p) => <span className="font-mono text-sm text-ink-3">{p.ready ? (p.isAi ? 'AI · READY' : 'READY') : p.isAi ? 'AI' : '…'}</span>} />
        ) : (
          <ul className="mt-auto flex shrink-0 flex-col gap-2" data-testid="tv-ready-list">
            {readyRows(game.players, connected).map((row) => {
              if (row.kind === 'ais')
                return (
                  <li key="ais" className="flex items-center gap-3 opacity-60" data-testid="tv-ready-ais" data-count={row.seats.length}>
                    <span className="flex shrink-0 -space-x-1.5">
                      {row.seats.map((s) => (
                        <PlayerMark key={s.id} slot={toSlot(s.slot)} size={22} />
                      ))}
                    </span>
                    <span className="flex-1 truncate font-display text-xl font-semibold">{row.seats.map((s) => s.name).join(', ')}</span>
                    <span className="font-mono text-sm text-ink-3">{row.seats.length} AI · READY</span>
                  </li>
                );
              const s = row.seat;
              const isAway = !s.isAi && s.away;
              const state = s.isAi ? 'AI · READY' : s.ready ? 'READY' : isAway ? 'AWAY · PLANNING' : 'PLANNING';
              return (
                <li key={s.id} className={cx('flex items-center gap-3', (s.isAi || s.ready) && 'opacity-60')}>
                  <PlayerMark slot={toSlot(s.slot)} size={22} glow={!(s.isAi || s.ready)} />
                  <span className="flex-1 truncate font-display text-xl font-semibold">{s.name}</span>
                  <span className={cx('font-mono text-sm', isAway ? 'text-warn' : s.ready || s.isAi ? 'text-ink-3' : 'text-holo')}>{state}</span>
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
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <TvHeader game={game} title={PHASE_NAME[phase]} seconds={secondsUntil(game.phaseEndsAt, now)} />
              <TvGovernorPromise game={game} />
            </div>
            <ReadyCount players={game.players} tv />
          </div>
        ) : (
          <TvHeader game={game} title={PHASE_NAME[phase]} seconds={secondsUntil(game.phaseEndsAt, now)} />
        )}
        {phase === 'development' && (game.clockWaitsFor ? <ClockWaits /> : <SharedClock seconds={secondsUntil(game.phaseEndsAt, now) ?? 0} total={DEVELOPMENT.fullSeconds} size="tv" />)}
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="flex w-[700px] shrink-0 flex-col gap-3">
            <HoloMap width={game.width} height={game.height} tiles={tiles} cursor={game.lit} density="tv" hideGround className="w-full" />
            <div className="flex items-center justify-between font-mono text-sm text-ink-3">
              <span>ROOM {table.code}</span>
              <span>
                {fmt(game.colonists)} COLONISTS · {game.storeMules} MULES IN THE CORRAL · {game.mulePrice} CR EACH
              </span>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">{side}</div>
        </div>
      </div>
    </SeatSpeciesProvider>
  );
}

/** Month 1's clock while it waits for the first MULEs: the bar stands full and the label says what starts it. */
export function ClockWaits() {
  return (
    <div className="flex items-center gap-4" data-testid="tv-clock">
      <span className="shrink-0 font-display text-xl font-semibold text-holo" data-testid="tv-clock-label">
        First month: the clock starts when every first MULE is in
      </span>
      <TimeBar seconds={DEVELOPMENT.fullSeconds} total={DEVELOPMENT.fullSeconds} size="tv" className="min-w-0 flex-1" />
    </div>
  );
}

/** Whose first MULE month 1's clock still waits for, every seat in seat order, drawn as the pace list draws its rows. */
export function FirstMules({ game, wrapMark = (_, mark) => mark }: { game: MuleView; wrapMark?: CreatureWrap }) {
  const waiting = game.clockWaitsFor ?? [];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex flex-col">
        <span className="label-caps">First MULEs in</span>
        <span className="label-caps text-[10px]! text-ink-3">the clock starts when all are in</span>
      </span>
      <ul className="grid grid-cols-1 gap-y-1.5" data-testid="tv-first-mules">
        {game.players.map((p) => {
          const isIn = !waiting.includes(p.id);
          return (
            <li key={p.id} className="flex items-center gap-2" data-testid={`tv-first-mule-${p.id}`}>
              {wrapMark(p.id, <PlayerMark slot={toSlot(p.slot)} size={20} glow={!isIn} />)}
              <span className="min-w-0 flex-1 truncate font-display text-base font-semibold">{p.name}</span>
              <span className={cx('shrink-0 font-mono text-sm font-bold', isIn ? 'text-ok' : 'text-ink-3')}>{isIn ? 'MULE in ✓' : 'still to come'}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Players({ game, right, className }: { game: MuleView; right: (p: MuleView['players'][number]) => ReactNode; className?: string }) {
  return (
    <ul className={cx('flex flex-col gap-2', className)}>
      {game.players.map((p) => (
        <li key={p.id} className="flex items-center gap-3">
          <Speaker id={p.id} size="tv">
            <PlayerMark slot={toSlot(p.slot)} size={22} />
          </Speaker>
          <span className="flex-1 truncate font-display text-xl font-semibold">{p.name}</span>
          {right(p)}
        </li>
      ))}
    </ul>
  );
}

function News({ news }: { news: string[] }) {
  return (
    <ul className="flex flex-col gap-2" data-testid="tv-news">
      {news.map((n) => (
        <li key={n} className="rounded-control border-l-4 border-holo-line bg-panel px-4 py-2.5 text-lg">
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
            {r.price}
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
 * The auction on the big screen: before each good, the status table and everyone's side, which is public;
 * then the whole board, large, with every creature walking live.
 */
function TvAuction({ table, game, auction }: { table: TableView<MuleView>; game: MuleView; auction: NonNullable<MuleView['auction']> }) {
  useAuctionSound(auction);
  const skipped = skippedLine(auction);
  const walkers = boardWalkers(game, auction);
  const stock = auction.storeForSale;
  const deals = useNewestFirst(auction.deals);
  const status = auction.stage === 'status';
  const stageName = status ? 'Buy or sell?' : auction.slowed ? 'Trading · clock slowed' : 'Walk';
  const ship = shipWants(game, auction);
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-8 text-ink" data-phase="auction" data-testid={status ? 'tv-status' : 'tv-walk'}>
      <TvHeader game={game} title={`Auction · ${GOOD_NAME[auction.good]}`} />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className={cx('flex min-w-0 flex-1 flex-col', status ? 'gap-3' : 'gap-2')}>
          {status ? (
            // On the status stage the skipped words share the time bar's row, so the ship panel keeps its room.
            <div className="flex shrink-0 items-center gap-4">
              <TimeBar size="tv" seconds={auction.seconds} total={auction.total} slowed={auction.slowed} className="min-w-0 flex-1" />
              {skipped && (
                <p className="min-w-0 max-w-[45%] truncate font-mono text-base text-ink-3" data-testid="skipped">
                  {skipped}
                </p>
              )}
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
              deals={auction.deals}
              storeBuys={auction.storeBuys}
              storeSells={auction.storeSells}
              shipPays={auction.shipPays}
              {...(auction.shipPays !== null ? { shipCaption: `The ship buys ${GOOD_NAME[auction.good]} at ${auction.shipPays}` } : {})}
              storeStock={stock}
              marks={{ ask: true, bid: true }}
              wrapCreature={tvSpeakerAt}
              className="min-h-0 flex-1"
            />
          )}
        </div>
        <div className="flex w-[300px] shrink-0 flex-col gap-4">
          <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow">
            <GoodTag good={auction.good} name className="text-2xl" />
            <span className={cx('font-display text-xl font-semibold', auction.slowed && 'text-warn')}>{stageName}</span>
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
                return (
                  <li key={p.id} className="flex items-center gap-3">
                    <PlayerMark slot={slotOf(game, p.id) ?? 0} size={22} />
                    <span className="flex-1 truncate font-display text-xl font-semibold">{p.name}</span>
                    <span className={cx('font-mono text-lg font-bold', s === 'seller' ? 'text-rise' : s === 'buyer' ? 'text-fall' : 'text-ink-3')}>
                      {s === undefined ? '…' : SIDE_WORD[s].toUpperCase()}
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
          {!status && (
            <dl className="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line font-mono" data-testid="tv-store">
              <div className="flex flex-col bg-panel p-3">
                <dt className="label-caps">Sells</dt>
                <dd data-num className="text-2xl font-bold text-rise">{auction.storeSells ?? 'out'}</dd>
              </div>
              <div className="flex flex-col bg-panel p-3">
                <dt className="label-caps">Buys</dt>
                <dd data-num className="text-2xl font-bold text-fall">{auction.storeBuys ?? '—'}</dd>
              </div>
              <div className="flex flex-col bg-panel p-3">
                <dt className="label-caps">Stock</dt>
                <dd data-num className={cx('text-2xl font-bold', stock === 0 ? 'text-alert' : 'text-ink')}>{stock}</dd>
              </div>
            </dl>
          )}
          {auction.shipPays !== null && (
            <p className="rounded-control border border-warn/60 px-3 py-2 text-lg leading-snug text-warn" data-testid="tv-ship">
              <strong className="font-semibold">
                The ship buys {GOOD_NAME[auction.good]} at {auction.shipPays}
              </strong>
            </p>
          )}
          {/* Each row is one line. A row that doesn't fit below the others wraps into a second column, which the clip hides. */}
          <ul className="flex min-h-0 flex-1 flex-col flex-wrap gap-2 overflow-hidden">
            {deals.map(({ key, deal }) => (
              <li key={key} className="w-full truncate rounded-control border border-holo bg-holo-soft px-3 py-2 font-mono text-lg font-bold text-holo">
                {dealLine(game, deal)}
              </li>
            ))}
          </ul>
          <p className={cx('mt-auto text-base leading-snug text-ink-2', auction.deals.length > 0 && 'hidden')}>
            {status
              ? 'Your side is picked for you from what you have and need. Change it on your phone before the bell.'
              : 'Sellers push the red line down, buyers push the green line up. When the two lines meet, the goods change hands.'}
          </p>
          <span className="truncate font-mono text-sm text-ink-3">
            ROOM {table.code}
            {auction.next.length > 0 ? ` · NEXT ${auction.next.map((g) => GOOD_NAME[g].toUpperCase()).join(', ')}` : ''}
          </span>
        </div>
      </div>
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

const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Its content at full size when it fits, scaled down as a whole when it doesn't, and back up when room returns: the
 * month end's table and colony keep the mock's proportions on the TV when the chat ticker is up or more players sit
 * at the table. While it fits, the content stretches to fill the box.
 */
function FitHeight({ className, children }: { className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useBeforePaint(() => {
    const fit = () => {
      const b = box.current;
      const i = inner.current;
      if (!b || !i) return;
      // The content's own height, without the stretch: the stretch follows the scale, so measuring through it would
      // keep a shrunk scale from ever growing back.
      const stretch = i.style.minHeight;
      i.style.minHeight = '0px';
      const natural = i.offsetHeight;
      i.style.minHeight = stretch;
      if (natural === 0) return;
      const next = Math.min(1, b.clientHeight / natural);
      setScale((s) => (Math.abs(s - next) < 0.005 ? s : next));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={cx('min-h-0 overflow-hidden', className)} data-fit={scale.toFixed(3)}>
      <div ref={inner} className="flex flex-col" style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: `${100 / scale}%`, minHeight: `${100 / scale}%` }}>
        {children}
      </div>
    </div>
  );
}

/**
 * The big screen at the month's end (C20, WS6's approved mock): the league table by Worth with the lead and each
 * change since last month, and how the colony is doing. Public: totals only, each player's own lines are on their
 * phone (HC-4). It stays up until everyone moves on, and counts who has, as planning does.
 */
export function TvMonthEnd({ game }: { game: MuleView }) {
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table p-10 text-ink" data-phase={game.phase} data-testid="tv-monthend">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <TvHeader game={game} title="End of the month" />
        </div>
        <ReadyCount players={game.players} tv />
      </div>
      {inCollapse(game) && <CollapseBanner density="tv" />}
      <FitHeight className="flex-1">
        <div className="grid flex-1 grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-6">
          <LeagueTable view={game} density="tv" />
          <ColonyPanel view={game} density="tv" />
        </div>
      </FitHeight>
      <p className="text-lg leading-snug text-ink-2" data-testid="worth-rule">
        Worth: cash + goods at the store’s price + land at {GAME.plotScore} cr a plot + MULEs at {game.mulePrice} cr + {POLITICS.termScore} cr a term in office. Each player’s own lines are on their phone.
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
      <TvHeader game={game} title={PHASE_NAME.gameOver} />
      <FitHeight className="flex-1">
        <div className="flex flex-1 flex-col gap-4">
          <div className="grid flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6">
            <WinnerCard view={game} density="tv" />
            <div className="flex flex-col" data-testid="tv-scores">
              <LeagueTable view={game} density="tv" final />
            </div>
          </div>
          <ColonyPanel view={game} density="tv" layout="row" verdict />
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
