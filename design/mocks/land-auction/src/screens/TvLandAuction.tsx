import { AirGauge, cx, GOOD_NAME, HoloMap, MuleIcon, PlayerMark, TERRAIN_NAME, TimeBar, WalkBoard, type Slot } from '@mule/ui';
import { mapTiles, plotName, slotOf, tileAt } from '../../../../../apps/web/src/game/derive';
import { VIEW } from '../fixture';
import { lotWalkers, lotWhat, sellerName } from '../parts';
import type { LandAuctionView, LotsView } from '../proto';

/**
 * The land auction on the big screen (/table), readable from 3 metres.
 * Intro: the map large with the plot lit, and the lot beside it. Walk and
 * result: the board large, as at the goods auction, with the map kept small
 * in the side column so the room never loses where the plot is.
 * GRAFT TARGET: new apps/web/src/table/TvLandAuction.tsx (one route line in TableApp.tsx).
 */
export function TvLandAuction({ lot }: { lot: LandAuctionView }) {
  const view = VIEW;
  const at = { x: lot.lot.item.x, y: lot.lot.item.y };
  const tiles = mapTiles(view).map((t) => (t.x === at.x && t.y === at.y ? { ...t, flag: 'sale' as const } : t));
  const title = `Land auction · ${lot.number} of ${lot.count}`;

  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-8 text-ink" data-phase="landAuction">
      <Header view={view} title={title} />
      {lot.stage === 'intro' ? (
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="flex w-[700px] shrink-0 flex-col gap-3">
            <HoloMap width={view.width} height={view.height} tiles={tiles} cursor={at} density="tv" hideGround className="w-full" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <TvLotCard view={view} lot={lot} big />
            <TimeBar size="tv" seconds={lot.seconds} total={lot.total} />
            <p className="font-display text-2xl leading-snug text-ink-2" data-testid="tv-intro-line">
              Bidding starts in {Math.ceil(lot.seconds)} s.{' '}
              {lot.lot.seller === 'colony' ? 'The colony is selling a free plot. Everyone can bid' : `Everyone but ${sellerName(view, lot.lot.seller)} can bid`}: hold Up on your phone.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <TimeBar size="tv" seconds={lot.seconds} total={lot.total} />
            <WalkBoard
              size="tv"
              lo={lot.lo}
              hi={lot.hi}
              walkers={lotWalkers(view, lot)}
              deals={[]}
              storeBuys={null}
              storeSells={null}
              shipPays={null}
              lines={[{ id: 'min', label: 'MIN', price: lot.lot.minimum }]}
              stage="walk"
              className="min-h-0 flex-1"
            />
          </div>
          <div className="flex w-[340px] shrink-0 flex-col gap-4">
            {lot.stage === 'result' ? <TvResult view={view} lot={lot} /> : <TvLeader view={view} lot={lot} />}
            <TvLotCard view={view} lot={lot} />
            <HoloMap width={view.width} height={view.height} tiles={tiles} cursor={at} density="tv" hideGround className="w-full" />
            <span className="mt-auto font-mono text-sm text-ink-3" data-testid="tv-next">
              ROOM MULE{lot.next.length > 0 ? ` · NEXT ${lot.next.map((n) => `${n.item.kind === 'mule' ? 'MULE' : 'PLOT'} ${plotName(n.item.x, n.item.y)}`).join(', ')}` : ' · LAST LOT'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** GRAFT: TableApp.tsx's TvHeader, exported (named edit E2), replaces this copy. */
function Header({ view, title }: { view: LotsView; title: string }) {
  return (
    <header className="flex items-end justify-between gap-6">
      <div className="flex flex-col gap-1">
        <span className="label-caps text-base!">
          Month {view.month} / {view.maxMonths}
        </span>
        <h1 className="font-display text-5xl font-semibold leading-none" data-testid="tv-phase">
          {title}
        </h1>
      </div>
      <AirGauge level={view.air.level} band={view.air.band} tv />
    </header>
  );
}

function TvLotCard({ view, lot, big = false }: { view: LotsView; lot: LandAuctionView; big?: boolean }) {
  const t = tileAt(view, lot.lot.item.x, lot.lot.item.y);
  const seller = slotOf(view, lot.lot.seller);
  return (
    <div className={cx('flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft shadow-glow', big ? 'p-5' : 'p-4')} data-testid="tv-lot">
      <span className="label-caps flex items-center gap-2 text-base!">
        {lot.lot.item.kind === 'mule' ? 'MULE for sale' : 'Plot for sale'} · {seller !== null && <PlayerMark slot={seller as Slot} size={16} />}{' '}
        {lot.lot.seller === 'colony' ? 'The colony · free land' : sellerName(view, lot.lot.seller)}
      </span>
      <span className={cx('flex items-center gap-2 font-display font-semibold leading-tight', big ? 'text-4xl' : 'text-2xl')}>
        {lot.lot.item.kind === 'mule' && <MuleIcon size={big ? 40 : 28} className="text-holo" />}
        {lot.lot.item.kind === 'mule' ? lotWhat(view, lot.lot) : t ? TERRAIN_NAME[t.terrain] : ''}
        <span data-num className="font-mono text-holo">{plotName(lot.lot.item.x, lot.lot.item.y)}</span>
      </span>
      {lot.lot.item.kind === 'plot' && (
        <span className={cx('text-ink-2', big ? 'text-xl' : 'text-base')}>
          {t?.outfit && t.outfit !== 'greenBelt' ? `With its ${GOOD_NAME[t.outfit]} MULE` : lotWhat(view, lot.lot)}
        </span>
      )}
      <span data-num className={cx('font-mono font-bold', big ? 'text-3xl' : 'text-xl')} data-testid="tv-minimum">
        Minimum {lot.lot.minimum}
      </span>
    </div>
  );
}

function TvLeader({ view, lot }: { view: LotsView; lot: LandAuctionView }) {
  const leader = lot.leader;
  const slot = leader ? slotOf(view, leader.id) : null;
  return (
    <div className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-leader">
      <span className="label-caps text-base!">Wins at the bell</span>
      {leader ? (
        <span className="flex items-center gap-3 font-display text-3xl font-semibold">
          {slot !== null && <PlayerMark slot={slot as Slot} size={26} />}
          {sellerName(view, leader.id)} <span data-num className="font-mono text-holo">{leader.bid}</span>
        </span>
      ) : (
        <span className="font-display text-2xl text-ink-2">No bid at {lot.lot.minimum} yet</span>
      )}
    </div>
  );
}

function TvResult({ view, lot }: { view: LotsView; lot: LandAuctionView }) {
  const r = lot.result!;
  return (
    <div className="flex flex-col gap-1 rounded-panel border-2 border-ok bg-holo-soft p-4 shadow-glow" data-testid="tv-result" data-kind={r.kind}>
      <span className="label-caps text-base!">{r.kind === 'sold' ? 'Sold' : 'Unsold'}</span>
      <span className="font-display text-4xl font-bold leading-tight text-ok">
        {r.kind === 'sold'
          ? `${sellerName(view, r.buyer)} · ${r.price}`
          : r.kind === 'store'
            ? `Store pays ${r.price}`
            : lot.lot.seller === 'colony'
              ? 'Stays free land'
              : `${sellerName(view, lot.lot.seller)} keeps it`}
      </span>
    </div>
  );
}
