import type { LandAuctionView, MuleView } from '@mule/protocol';
import { Button, HoloMap, PlayerMark, TimeBar, type Slot } from '@mule/ui';
import { LeaderBox, LotCard, lotWalkers, sellerName } from '../../../../../apps/web/src/components/AuctionParts';
import { mapTiles, slotOf } from '../../../../../apps/web/src/game/derive';
import { Hold } from '../../../../../apps/web/src/phone/Auction';
import { PhoneShell } from '../../../../../apps/web/src/phone/Shell';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { WalkBoard } from '../proposed/WalkBoard';

/**
 * The land auction's walk, as WS3 built it (LandAuction.tsx), with one
 * change: the highest-bid line across the board, naming who wins at the bell.
 * Buyers only, so there is no ask line.
 */

function Board({ view, lot, tv = false }: { view: MuleView; lot: LandAuctionView; tv?: boolean }) {
  return (
    <WalkBoard
      size={tv ? 'tv' : 'phone'}
      lo={lot.lo}
      hi={lot.hi}
      walkers={lotWalkers(view, lot)}
      deals={[]}
      storeBuys={null}
      storeSells={null}
      shipPays={null}
      lines={[{ id: 'min', label: 'MIN', price: lot.lot.minimum }]}
      marks={{ ask: false, bid: true }}
      stage="walk"
      {...(tv ? {} : { meId: 'lena' })}
      className="min-h-0 flex-1"
    />
  );
}

export function PhoneLandLine({ view, lot }: { view: MuleView; lot: LandAuctionView }) {
  const mine = lot.walkers.find((w) => w.id === 'lena');
  return (
    <PhoneShell
      phase={`Land auction · ${lot.number} of ${lot.count}`}
      fill
      rail={
        <>
          <LeaderBox view={view} lot={lot} meId="lena" />
          <LotCard view={view} lot={lot.lot} />
          <span data-num className="font-mono text-[10px] text-ink-3">
            YOU BID {mine?.side === 'buyer' ? mine.price : '—'} · MAX {view.players.find((p) => p.id === 'lena')!.money}
          </span>
        </>
      }
      footer={
        <>
          <div className="grid grid-cols-2 gap-2">
            <Hold label="Up" glyph="▲" disabled={false} onHold={() => {}} />
            <Hold label="Down" glyph="▼" disabled={false} onHold={() => {}} />
          </div>
          <Button size="md" variant="holo" className="h-10 w-full">
            Done bidding
          </Button>
        </>
      }
    >
      <TimeBar seconds={lot.seconds} total={lot.total} className="mb-1.5" />
      <Board view={view} lot={lot} />
    </PhoneShell>
  );
}

export function TvLandLine({ view, lot }: { view: MuleView; lot: LandAuctionView }) {
  const at = { x: lot.lot.item.x, y: lot.lot.item.y };
  const tiles = mapTiles(view).map((t) => (t.x === at.x && t.y === at.y ? { ...t, flag: 'sale' as const } : t));
  const leader = lot.leader;
  const slot = leader ? slotOf(view, leader.id) : null;
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-8 text-ink" data-phase="landAuction">
      <TvHeader game={view} title={`Land auction · ${lot.number} of ${lot.count}`} />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TimeBar size="tv" seconds={lot.seconds} total={lot.total} />
          <Board view={view} lot={lot} tv />
        </div>
        <div className="flex w-[340px] shrink-0 flex-col gap-4">
          <div className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-4">
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
          <LotCard view={view} lot={lot.lot} compact />
          <HoloMap width={view.width} height={view.height} tiles={tiles} cursor={at} density="tv" hideGround className="w-full" />
        </div>
      </div>
    </div>
  );
}
