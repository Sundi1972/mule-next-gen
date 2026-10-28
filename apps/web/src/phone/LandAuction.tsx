import { COLONY_SELLER } from '@mule/engine';
import type { LandAuctionView, MuleView } from '@mule/protocol';
import { Button, cx, HoloMap, TimeBar, WalkBoard } from '@mule/ui';
import { LeaderBox, LotCard, lotWalkers, sellerName } from '../components/AuctionParts';
import { mapTiles, PHASE_NAME, plotName } from '../game/derive';
import { useClient } from '../net/react';
import { Hold } from './Auction';
import { usePhoneGame } from './game';
import { MapFit, PhoneShell } from './Shell';
import { stepDir, useWalkIntent } from './useWalkIntent';

/**
 * The land auction on the phone, board first.
 * One lot at a time: the intro lights the plot on the map, the walk fills
 * the main area with the board, and the result says who got it. The seller
 * sees the same screens without Up and Down.
 */
export function LandAuction() {
  const client = useClient();
  const { view, self } = usePhoneGame();
  const lot = view.landAuction;
  const mine = lot?.walkers.find((w) => w.id === self.id);
  const onBoard = lot?.stage === 'walk' && mine?.side === 'buyer';
  const send = useWalkIntent(onBoard, String(lot?.number ?? ''));
  const walk = (d: -1 | 0 | 1) => send(stepDir(d));
  const ready = () => client.intent({ type: 'ready' });

  if (!lot) {
    return (
      <PhoneShell phase={PHASE_NAME.landAuction}>
        <p className="text-ink-2">The land auction is closing…</p>
      </PhoneShell>
    );
  }

  const seller = lot.lot.seller === self.id;
  const done = mine?.done ?? false;
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
          seller ? (
            <p className="flex h-10 w-full items-center justify-center text-sm text-ink-3" data-testid="seller-wait">
              Bidding starts soon
            </p>
          ) : (
            <Button size="md" variant="outline" className="h-10 w-full" disabled={done} data-testid="ready" onClick={ready}>
              {done ? 'Ready · waiting' : 'Ready to bid'}
            </Button>
          )
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
      marks={{ ask: false, bid: true }}
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
            <Button size="md" variant="holo" className="h-10 w-full" disabled={!onBoard || done} data-testid="done" onClick={ready}>
              {done ? 'Done · waiting' : 'Done bidding'}
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
function IntroLine({ view, lot, meId }: { view: MuleView; lot: LandAuctionView; meId: string }) {
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
      <span className="label-caps block text-holo">
        Lot {lot.number} of {lot.count} · {lot.lot.seller === COLONY_SELLER ? 'The colony sells free land' : `${sellerName(view, lot.lot.seller)} sells`}
      </span>
      {text}
    </div>
  );
}

/** After the bell: sold (to you or someone else) or unsold, and what that means for this phone. */
function ResultBanner({ view, lot, meId }: { view: MuleView; lot: LandAuctionView; meId: string }) {
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
        : lot.lot.seller === COLONY_SELLER
          ? `Nobody bid ${lot.lot.minimum}. It stays free land.`
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
