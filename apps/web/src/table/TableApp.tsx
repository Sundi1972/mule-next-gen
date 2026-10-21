import type { MuleView, TableView } from '@mule/protocol';
import { AirGauge, Button, cx, GOOD_NAME, GoodTag, HoloMap, PlayerMark, SeatSpeciesProvider, StoreInterior, TERRAIN_NAME, TimeBar, Timer, WalkBoard, type Slot } from '@mule/ui';
import { boardWalkers, dealLine, skippedLine, StatusTable } from '../components/AuctionParts';
import { useEffect, useState, type ReactNode } from 'react';
import { joinUrl, Qr } from '../components/Qr';
import { Scaled } from '../components/Scaled';
import { ThemeToggle } from '../components/ThemeToggle';
import { fmt, lobbySeatSpecies, mapTiles, PHASE_NAME, player, plotName, seatSpecies, secondsUntil, slotOf, standings, tileAt } from '../game/derive';
import { useAuctionSound } from '../game/sound';
import { useClient, useClientState, useServerNow } from '../net/react';
import { TvLandAuction } from './TvLandAuction';

/** The big screen: the public view everyone at the table shares. It has no controls. */
export function TableApp({ room }: { room: string }) {
  const client = useClient();
  const { view, role } = useClientState();
  useEffect(() => {
    if (room) client.watch(room);
  }, [client, room]);

  let screen: ReactNode;
  if (!room) screen = <PickRoom />;
  else if (!view || role !== 'board') screen = <Waiting code={room} />;
  else if (view.status === 'lobby' || !view.game) screen = <TvLobby table={view} />;
  else screen = <TvGame table={view} game={view.game} />;

  return (
    <div className="h-dvh bg-table">
      <Scaled width={1280} height={720}>
        {screen}
      </Scaled>
    </div>
  );
}

function PickRoom() {
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
              <PlayerMark slot={(i % 6) as Slot} species={lobbySeatSpecies(s, i)} size={34} />
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

export function TvHeader({ game, title, seconds }: { game: MuleView; title: string; seconds?: number | undefined }) {
  return (
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
        <ThemeToggle />
        <AirGauge level={game.air.level} band={game.air.band} tv />
        {seconds !== undefined && <Timer seconds={seconds} className="h-14! px-5! text-3xl!" />}
      </div>
    </header>
  );
}

function TvGame({ table, game }: { table: TableView<MuleView>; game: MuleView }) {
  const now = useServerNow(200);
  const { chat } = useClientState();
  const tiles = mapTiles(game);
  const lit = game.lit ? tileAt(game, game.lit.x, game.lit.y) : undefined;
  const phase = game.phase;

  let side: ReactNode;
  if (game.finished) side = <Scores game={game} />;
  else if (phase === 'landGrant')
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
        <StoreInterior mules={game.storeMules} mulePrice={game.mulePrice} prices={{}} />
        <ul className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2">
          {game.players.map((p, i) => (
            <li key={p.id} className={cx('flex items-center gap-2', p.doneDeveloping && 'opacity-50')}>
              <PlayerMark slot={(i % 6) as Slot} size={20} glow={!p.doneDeveloping} />
              <span className="flex-1 truncate font-display text-base font-semibold">{p.name}</span>
              <span className="font-mono text-xs text-ink-3">{p.doneDeveloping ? 'PUB' : 'BUILDING'}</span>
            </li>
          ))}
        </ul>
      </>
    );
  else if (phase === 'production' || phase === 'upkeep') side = <MonthEnd game={game} />;
  else
    side = (
      <>
        <MarketTiles game={game} />
        <News news={game.news} />
        <ul className="flex flex-col gap-3">
          {chat
            .filter((c) => !c.to)
            .slice(-4)
            .map((c) => (
              <li key={c.id} className="flex items-start gap-3">
                <PlayerMark slot={slotOf(game, c.from) ?? 0} size={22} />
                <p className="text-lg leading-snug">
                  <span className="font-display font-semibold">{player(game, c.from)?.name}</span>
                  <span className="text-ink-2"> {c.text}</span>
                </p>
              </li>
            ))}
        </ul>
        <Players game={game} className="mt-auto" right={(p) => <span className="font-mono text-sm text-ink-3">{p.isAi ? 'AI' : p.ready ? 'READY' : '…'}</span>} />
      </>
    );

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
      <div className="flex h-[720px] w-[1280px] flex-col gap-5 bg-table p-10 text-ink" data-phase={phase}>
        <TvHeader game={game} title={PHASE_NAME[phase]} seconds={game.finished ? undefined : secondsUntil(game.phaseEndsAt, now)} />
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

function Players({ game, right, className }: { game: MuleView; right: (p: MuleView['players'][number]) => ReactNode; className?: string }) {
  return (
    <ul className={cx('flex flex-col gap-2', className)}>
      {game.players.map((p, i) => (
        <li key={p.id} className="flex items-center gap-3">
          <PlayerMark slot={(i % 6) as Slot} size={22} />
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
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line">
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

/** The auction on the big screen: the whole board, large, with every creature walking live. */
function TvAuction({ table, game, auction }: { table: TableView<MuleView>; game: MuleView; auction: NonNullable<MuleView['auction']> }) {
  useAuctionSound(auction);
  const skipped = skippedLine(auction);
  const stageName = auction.stage === 'status' ? 'Status' : auction.stage === 'declare' ? 'Buy, sell or pass?' : auction.slowed ? 'Trading · clock slowed' : 'Walk';
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-8 text-ink" data-phase="auction">
      <TvHeader game={game} title={`Auction · ${GOOD_NAME[auction.good]}`} />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TimeBar size="tv" seconds={auction.seconds} total={auction.total} slowed={auction.slowed} />
          {skipped && (
            <p className="font-mono text-base text-ink-3" data-testid="skipped">
              {skipped}
            </p>
          )}
          {auction.stage === 'status' ? (
            <div className="min-h-0 flex-1 rounded-panel border border-holo-line bg-panel px-5 py-4">
              <StatusTable view={game} auction={auction} tv />
            </div>
          ) : (
            <WalkBoard
              size="tv"
              lo={auction.lo}
              hi={auction.hi}
              walkers={boardWalkers(game, auction)}
              deals={auction.deals}
              storeBuys={auction.storeBuys}
              storeSells={auction.storeSells}
              shipPays={auction.shipPays}
              stage={auction.stage === 'walk' ? 'walk' : 'declare'}
              className="min-h-0 flex-1"
            />
          )}
        </div>
        <div className="flex w-[300px] shrink-0 flex-col gap-4">
          <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow">
            <GoodTag good={auction.good} name className="text-2xl" />
            <span className={cx('font-display text-xl font-semibold', auction.slowed && 'text-warn')}>{stageName}</span>
            <span data-num className="font-mono text-lg text-ink-2" data-testid="tv-units">
              {auction.units} unit{auction.units === 1 ? '' : 's'} traded
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line font-mono">
            <div className="flex flex-col bg-panel p-3">
              <dt className="label-caps">Store sells</dt>
              <dd data-num className="text-2xl font-bold text-rise">{auction.storeSells ?? 'out'}</dd>
            </div>
            <div className="flex flex-col bg-panel p-3">
              <dt className="label-caps">Store buys</dt>
              <dd data-num className="text-2xl font-bold text-fall">{auction.storeBuys ?? '—'}</dd>
            </div>
          </dl>
          {auction.shipPays !== null && (
            <p className="rounded-control border border-warn/60 px-3 py-2 font-mono text-lg text-warn">Export ship pays {auction.shipPays}</p>
          )}
          <ul className="flex flex-col gap-2">
            {auction.deals.map((d) => (
              <li key={`${d.buyer}-${d.seller}`} className="rounded-control border border-holo bg-holo-soft px-3 py-2 font-mono text-lg font-bold text-holo">
                {dealLine(game, d)}
              </li>
            ))}
          </ul>
          <p className="mt-auto text-base leading-snug text-ink-2">
            {auction.stage === 'walk'
              ? 'Hold Up or Down on your phone. Meet another player and you trade at the seller’s price.'
              : auction.stage === 'declare'
                ? 'Sellers start at the top and walk down. Buyers start at the bottom and walk up.'
                : 'What everyone has before this good goes on sale.'}
          </p>
          <span className="font-mono text-sm text-ink-3">
            ROOM {table.code}
            {auction.next.length > 0 ? ` · NEXT ${auction.next.map((g) => GOOD_NAME[g].toUpperCase()).join(', ')}` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

function MonthEnd({ game }: { game: MuleView }) {
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
      <Scores game={game} />
    </>
  );
}

function Scores({ game }: { game: MuleView }) {
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4">
      <span className="label-caps">{game.scores ? 'Final scores' : 'Standings · money'}</span>
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
