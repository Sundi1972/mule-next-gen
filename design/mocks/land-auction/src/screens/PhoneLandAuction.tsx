import { Button, cx, HoloMap, TimeBar, WalkBoard } from '@mule/ui';
import { mapTiles, plotName } from '../../../../../apps/web/src/game/derive';
import { MapFit, PhoneShell } from '../../../../../apps/web/src/phone/Shell';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { VIEW } from '../fixture';
import { Hold, LeaderBox, LotCard, lotWalkers, sellerName } from '../parts';
import type { LandAuctionView, LotsView } from '../proto';

/**
 * The land auction on the phone, layout A (board first; Heiko, 21 Oct).
 * One lot at a time: the intro lights the plot on the map, the walk fills
 * the main area with the board, and the result says who got it. The seller
 * sees the same screens without Up and Down.
 * GRAFT TARGET: new apps/web/src/phone/LandAuction.tsx (one route line in PhoneApp.tsx).
 */
export function PhoneLandAuction({ lot, walk = () => {} }: { lot: LandAuctionView; walk?: (d: -1 | 0 | 1) => void }) {
  const { self } = usePhoneGame();
  const view = VIEW;
  const seller = lot.lot.seller === self.id;
  const mine = lot.walkers.find((w) => w.id === self.id);
  const onBoard = lot.stage === 'walk' && mine?.side === 'buyer';
  const at = { x: lot.lot.item.x, y: lot.lot.item.y };
  const phase = `Land auction · ${lot.number} of ${lot.count}`;

  if (lot.stage === 'intro') {
    const tiles = mapTiles(view).map((t) => (t.x === at.x && t.y === at.y ? { ...t, flag: 'sale' as const } : t));
    return (
      <PhoneShell
        phase={phase}
        fill
        rail={
          <>
            <IntroLine view={view} lot={lot} meId={self.id} />
            <LotCard view={view} lot={lot.lot} />
          </>
        }
        footer={
          <Button size="md" variant="outline" className="h-10 w-full" data-testid="ready">
            {seller ? 'Start the bidding' : 'Ready to bid'}
          </Button>
        }
      >
        <TimeBar seconds={lot.seconds} total={lot.total} className="mb-1.5" />
        <p className="pb-1.5 font-mono text-[11px] text-ink-3" data-testid="intro-caption">
          UP FOR AUCTION · PLOT {plotName(at.x, at.y)} · BIDDING STARTS IN {Math.ceil(lot.seconds)} S
        </p>
        {/* No focusSlot: the lot is usually someone else's, and whose plots surround it is the point. */}
        <MapFit width={view.width} height={view.height}>
          <HoloMap width={view.width} height={view.height} tiles={tiles} cursor={at} />
        </MapFit>
      </PhoneShell>
    );
  }

  const board = (
    <WalkBoard
      lo={lot.lo}
      hi={lot.hi}
      walkers={lotWalkers(view, lot)}
      deals={[]}
      storeBuys={null}
      storeSells={null}
      shipPays={null}
      lines={[{ id: 'min', label: 'MIN', price: lot.lot.minimum }]}
      stage="walk"
      meId={self.id}
      {...(onBoard ? { onDir: walk } : {})}
      className="min-h-0 flex-1"
    />
  );

  if (lot.stage === 'result') {
    return (
      <PhoneShell
        phase={phase}
        fill
        rail={
          <>
            <ResultBanner view={view} lot={lot} meId={self.id} />
            <LotCard view={view} lot={lot.lot} compact />
            {lot.next.length > 0 && (
              <span className="font-mono text-[10px] text-ink-3" data-testid="next-lot">
                NEXT · {lot.next.map((n) => `${n.item.kind === 'mule' ? 'MULE' : 'PLOT'} ${plotName(n.item.x, n.item.y)}`).join(' · ')}
              </span>
            )}
          </>
        }
      >
        <TimeBar seconds={lot.seconds} total={lot.total} className="mb-1.5" />
        {board}
      </PhoneShell>
    );
  }

  return (
    <PhoneShell
      phase={phase}
      fill
      rail={
        <>
          {/* Who wins at the bell comes first: it must never scroll out of view. */}
          <LeaderBox view={view} lot={lot} meId={self.id} />
          <LotCard view={view} lot={lot.lot} />
          {!seller && (
            <span data-num className="font-mono text-[10px] text-ink-3" data-testid="my-bid">
              YOU BID {mine?.side === 'buyer' ? mine.price : '—'} · MAX {self.money}
            </span>
          )}
        </>
      }
      footer={
        seller ? (
          <p className="rounded-control border border-holo-faint px-2.5 py-2 text-xs leading-snug text-ink-2" data-testid="seller-note">
            It's your plot: you watch while the others bid. It sells to the highest bid at the bell.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Hold label="Up" glyph="▲" disabled={!onBoard} onHold={(on) => walk(on ? 1 : 0)} />
              <Hold label="Down" glyph="▼" disabled={!onBoard} onHold={(on) => walk(on ? -1 : 0)} />
            </div>
            <Button size="md" variant="holo" className="h-10 w-full" disabled={!onBoard} data-testid="done">
              Done bidding
            </Button>
          </>
        )
      }
    >
      <TimeBar seconds={lot.seconds} total={lot.total} className="mb-1.5" />
      {board}
    </PhoneShell>
  );
}

/** Before the walk: what you'll be doing on this lot. */
function IntroLine({ view, lot, meId }: { view: LotsView; lot: LandAuctionView; meId: string }) {
  const mine = lot.walkers.find((w) => w.id === meId);
  const text =
    lot.lot.seller === meId
      ? 'Your lot is up. Everyone else can bid.'
      : mine?.side === 'buyer'
        ? `Get ready: hold Up to bid past ${lot.lot.minimum}.`
        : mine && 'aside' in mine && mine.aside === 'mule'
          ? 'You already lead a MULE, so you sit this one out.'
          : `You can't pay the minimum of ${lot.lot.minimum}: you sit this one out.`;
  return (
    <div className="rounded-control border border-holo bg-holo-soft px-2.5 py-1.5 text-xs leading-snug text-ink" data-testid="intro-line">
      <span className="label-caps block text-holo">Lot {lot.number} of {lot.count} · {sellerName(view, lot.lot.seller)} sells</span>
      {text}
    </div>
  );
}

/** After the bell: sold (to you or someone else) or unsold, and what that means for this phone. */
function ResultBanner({ view, lot, meId }: { view: LotsView; lot: LandAuctionView; meId: string }) {
  const r = lot.result!;
  const seller = lot.lot.seller === meId;
  const tax = (n: number) => n - Math.round(n * view.treasury.salesTax);
  const title = r.kind === 'sold' ? (r.buyer === meId ? 'Yours!' : `Sold to ${sellerName(view, r.buyer)}`) : r.kind === 'store' ? 'The store bought it' : 'Unsold';
  const line =
    r.kind === 'sold'
      ? r.buyer === meId
        ? `You paid ${r.price} cr.${lot.lot.item.kind === 'mule' ? ' Lead it to one of your plots in development, or it runs off.' : ''}`
        : seller
          ? `You get ${tax(r.price)} cr after sales tax.`
          : `for ${r.price} cr.`
      : r.kind === 'store'
        ? seller
          ? `Nobody bid ${lot.lot.minimum}. You get ${r.price} cr.`
          : `Nobody bid ${lot.lot.minimum}. The store paid ${r.price} cr${lot.lot.item.kind === 'plot' ? ' and the plot is free land again' : ''}.`
        : `Nobody bid ${lot.lot.minimum}. ${seller ? 'You keep it.' : `${sellerName(view, lot.lot.seller)} keeps it.`}`;
  const good = r.kind === 'sold' && (r.buyer === meId || seller);
  return (
    <div
      className={cx('flex flex-col gap-0.5 rounded-control border-2 px-2.5 py-2', good ? 'border-ok bg-holo-soft shadow-glow' : 'border-holo-line bg-panel')}
      data-testid="result"
      data-kind={r.kind}
    >
      <span className={cx('font-display text-xl font-bold leading-tight', good ? 'text-ok' : 'text-ink')}>{title}</span>
      <span className="text-xs leading-snug text-ink-2">{line}</span>
    </div>
  );
}
