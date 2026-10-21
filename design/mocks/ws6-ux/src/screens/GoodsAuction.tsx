import type { AuctionView, MuleView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodTag, TimeBar } from '@mule/ui';
import { useEffect, useRef, useState } from 'react';
import { dealLine, skippedLine, StatusTable } from '../../../../../apps/web/src/components/AuctionParts';
import { slotOf } from '../../../../../apps/web/src/game/derive';
import { Hold } from '../../../../../apps/web/src/phone/Auction';
import { PhoneShell } from '../../../../../apps/web/src/phone/Shell';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { MARKET, SMITHORE_HOLD } from '../fixture';
import { bestPrices, WalkBoard, type BoardMarks, type BoardWalker } from '../proposed/WalkBoard';
import { TABLE } from '../harness';

export type LineStyle = BoardMarks['style'];

/** The board's walkers with their units and surplus, as the proposed board draws them. */
export function walkersWithUnits(view: MuleView, auction: AuctionView, moved: Record<string, number> = {}): BoardWalker[] {
  return auction.walkers.map((w) => {
    const hold = SMITHORE_HOLD[w.id] ?? { units: 0, need: 0 };
    const units = hold.units + (moved[w.id] ?? 0);
    return {
      id: w.id,
      name: view.players.find((p) => p.id === w.id)?.name ?? w.id,
      slot: slotOf(view, w.id) ?? 0,
      side: w.side,
      price: w.price,
      at: w.at,
      done: w.done,
      units,
      surplus: units - hold.need,
    };
  });
}

/** WS6: who holds each moving line, in words, beside the board. */
function LineReadout({ walkers, trading, meId, tv = false }: { walkers: BoardWalker[]; trading: boolean; meId?: string; tv?: boolean }) {
  const { ask, bid } = bestPrices(walkers);
  const who = (w: BoardWalker) => (w.id === meId ? 'You' : w.name);
  const gap = ask && bid ? ask.price - bid.price : null;
  return (
    <dl className={cx('grid grid-cols-[auto_1fr] items-baseline gap-x-2 font-mono', tv ? 'gap-y-1 text-lg' : 'gap-y-0.5 text-[11px]')} data-testid="line-readout">
      <dt className="text-rise">LOWEST ASK</dt>
      <dd data-num className="font-bold text-rise">{ask ? `${ask.price} · ${who(ask)}` : '—'}</dd>
      <dt className="text-fall">HIGHEST BID</dt>
      <dd data-num className="font-bold text-fall">{bid ? `${bid.price} · ${who(bid)}` : '—'}</dd>
      {tv && (
        <>
          <dt className="text-ink-3">GAP</dt>
          <dd data-num className="font-bold text-ink">{trading ? 'MET: TRADING' : gap === null ? '—' : `${gap} apart`}</dd>
        </>
      )}
    </dl>
  );
}

const storeStock = (good: AuctionView['good']) => MARKET.find((r) => r.good === good)?.storeStock ?? 0;

/**
 * The goods auction's walk on the phone, with the original's two moving lines.
 * The same rail and buttons as today's Auction.tsx; the board is the proposed one.
 */
export function PhoneGoodsWalk({
  view,
  auction,
  style,
  moved,
  meId = 'lena',
  onWalk,
}: {
  view: MuleView;
  auction: AuctionView;
  style: LineStyle;
  moved?: Record<string, number>;
  meId?: string;
  onWalk?: (dir: -1 | 0 | 1) => void;
}) {
  const good = auction.good;
  const mine = auction.walkers.find((w) => w.id === meId);
  const hold = SMITHORE_HOLD[meId] ?? { units: 0, need: 0 };
  const have = hold.units + (moved?.[meId] ?? 0);
  const spare = have - hold.need;
  const myDeal = auction.deals.find((d) => d.buyer === meId || d.seller === meId);
  const stock = auction.storeSells === null ? 0 : storeStock(good);
  const walk = (d: -1 | 0 | 1) => onWalk?.(d);

  return (
    <PhoneShell
      phase={`${GOOD_NAME[good]} auction`}
      fill
      rail={
        <>
          <div className="flex items-center justify-between gap-2 rounded-control border border-holo-faint bg-panel px-2.5 py-1.5" data-testid="good-row">
            <GoodTag good={good} name />
            <div className="grid grid-cols-3 gap-2.5 font-mono text-[10px] text-ink-3">
              <span className="flex flex-col">
                HAVE<strong data-num className="text-sm text-ink">{have}</strong>
              </span>
              <span className="flex flex-col">
                NEED<strong data-num className="text-sm text-ink">{hold.need}</strong>
              </span>
              <span className="flex flex-col">
                {spare < 0 ? 'SHORT' : 'SPARE'}
                <strong data-num className={cx('text-sm', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink')}>
                  {spare > 0 ? '+' : ''}
                  {spare}
                </strong>
              </span>
            </div>
          </div>
          <div className={cx('rounded-control border px-2.5 py-1.5 text-xs leading-snug', myDeal ? 'border-holo bg-holo-soft text-ink' : 'border-holo-faint text-ink-2')} data-testid="my-deal">
            {myDeal
              ? dealLine(view, myDeal, meId)
              : mine?.side === 'seller'
                ? 'Walk down to meet the highest bid.'
                : 'Walk up to meet the lowest ask.'}
          </div>
          <LineReadout walkers={walkersWithUnits(view, auction, moved)} trading={auction.deals.length > 0} meId={meId} />
        </>
      }
      footer={
        <>
          <div className="grid grid-cols-2 gap-2">
            <Hold label="Up" glyph="▲" disabled={!onWalk} onHold={(on) => walk(on ? 1 : 0)} />
            <Hold label="Down" glyph="▼" disabled={!onWalk} onHold={(on) => walk(on ? -1 : 0)} />
          </div>
          <Button size="md" variant="holo" className="h-10 w-full" data-testid="done">
            Done with {GOOD_NAME[good]}
          </Button>
        </>
      }
    >
      <TimeBar seconds={auction.seconds} total={auction.total} slowed={auction.slowed} className="mb-1.5" />
      <WalkBoard
        lo={auction.lo}
        hi={auction.hi}
        walkers={walkersWithUnits(view, auction, moved)}
        deals={auction.deals}
        storeBuys={auction.storeBuys}
        storeSells={auction.storeSells}
        shipPays={auction.shipPays}
        storeStock={stock}
        marks={{ ask: true, bid: true, style }}
        stage="walk"
        meId={meId}
        {...(onWalk ? { onDir: walk } : {})}
        className="min-h-0 flex-1"
      />
    </PhoneShell>
  );
}

/** The same walk on the big screen: today's TvAuction layout, the proposed board, and the store's stock in its panel. */
export function TvGoodsWalk({ view, auction, style, moved }: { view: MuleView; auction: AuctionView; style: LineStyle; moved?: Record<string, number> }) {
  const skipped = skippedLine(auction);
  const stock = auction.storeSells === null ? 0 : storeStock(auction.good);
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-8 text-ink" data-phase="auction">
      <TvHeader game={view} title={`Auction · ${GOOD_NAME[auction.good]}`} />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TimeBar size="tv" seconds={auction.seconds} total={auction.total} slowed={auction.slowed} />
          {skipped && <p className="font-mono text-base text-ink-3">{skipped}</p>}
          <WalkBoard
            size="tv"
            lo={auction.lo}
            hi={auction.hi}
            walkers={walkersWithUnits(view, auction, moved)}
            deals={auction.deals}
            storeBuys={auction.storeBuys}
            storeSells={auction.storeSells}
            shipPays={auction.shipPays}
            storeStock={stock}
            marks={{ ask: true, bid: true, style }}
            stage="walk"
            className="min-h-0 flex-1"
          />
        </div>
        <div className="flex w-[300px] shrink-0 flex-col gap-4">
          <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow">
            <GoodTag good={auction.good} name className="text-2xl" />
            <span className={cx('font-display text-xl font-semibold', auction.slowed && 'text-warn')}>{auction.slowed ? 'Trading · clock slowed' : 'Walk'}</span>
            <span data-num className="font-mono text-lg text-ink-2">
              {auction.units} unit{auction.units === 1 ? '' : 's'} traded
            </span>
          </div>
          <div className="rounded-panel border border-holo-line bg-panel p-3">
            <LineReadout walkers={walkersWithUnits(view, auction, moved)} trading={auction.deals.length > 0} tv />
          </div>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line font-mono" data-testid="tv-store">
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
          <ul className="flex flex-col gap-2">
            {auction.deals.map((d) => (
              <li key={`${d.buyer}-${d.seller}`} className="rounded-control border border-holo bg-holo-soft px-3 py-2 font-mono text-lg font-bold text-holo">
                {dealLine(view, d)}
              </li>
            ))}
          </ul>
          <p className="mt-auto text-base leading-snug text-ink-2">
            Sellers push the red line down, buyers push the green line up. When the two lines meet, the goods change hands.
          </p>
          <span className="font-mono text-sm text-ink-3">ROOM {TABLE.code} · NEXT {auction.next.map((g) => GOOD_NAME[g].toUpperCase()).join(', ')}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Makes the walk playable: Lena holds Up or Down; Brix and Ossa walk down
 * toward what they will take, Kai walks up to his limit; when the highest bid
 * reaches the lowest ask, a unit moves every 0.7 s at the seller's ask.
 */
export function useWalkSim(start: AuctionView) {
  const [auction, setAuction] = useState(start);
  const [moved, setMoved] = useState<Record<string, number>>({});
  const dir = useRef<-1 | 0 | 1>(0);
  const tradeMs = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      setAuction((a) => {
        if (a.seconds <= 0) return a;
        const step = a.speed * 0.1;
        const limits: Record<string, number> = { ossa: 64, brix: 62, kai: 61 };
        let walkers = a.walkers.map((w) => {
          if (w.side === 'pass') return w;
          if (w.id === 'lena') {
            const at = Math.max(a.lo, Math.min(a.hi, w.at + step * dir.current));
            return { ...w, at, price: Math.round(at), dir: dir.current };
          }
          const limit = limits[w.id] ?? w.at;
          const at = w.side === 'seller' ? Math.max(limit, w.at - step * 0.6) : Math.min(limit, w.at + step * 0.6);
          return { ...w, at, price: Math.round(at) };
        });
        const sellers = walkers.filter((w) => w.side === 'seller' && (SMITHORE_HOLD[w.id]!.units + (moved[w.id] ?? 0)) > 0);
        const buyers = walkers.filter((w) => w.side === 'buyer');
        const ask = sellers.sort((x, y) => x.at - y.at)[0];
        const bid = buyers.sort((x, y) => y.at - x.at)[0];
        let deals = a.deals;
        let units = a.units;
        if (ask && bid && bid.price >= ask.price) {
          // The buyer stops where the seller asks: they meet on one line.
          walkers = walkers.map((w) => (w.id === bid.id ? { ...w, at: ask.at, price: ask.price } : w));
          tradeMs.current += 100;
          const same = deals[0] && deals[0].buyer === bid.id && deals[0].seller === ask.id;
          const dealUnits = same ? deals[0]!.units : 0;
          if (tradeMs.current >= 700) {
            tradeMs.current = 0;
            setMoved((m) => ({ ...m, [ask.id]: (m[ask.id] ?? 0) - 1, [bid.id]: (m[bid.id] ?? 0) + 1 }));
            units++;
            deals = [{ buyer: bid.id, seller: ask.id, price: ask.price, units: dealUnits + 1 }];
          } else if (!same) {
            deals = [{ buyer: bid.id, seller: ask.id, price: ask.price, units: 0 }];
          }
        } else {
          tradeMs.current = 0;
          deals = [];
        }
        // The clock runs at half speed while units change hands, as in today's engine.
        const seconds = Math.max(0, a.seconds - (deals.length > 0 ? 0.05 : 0.1));
        return { ...a, walkers, deals, units, seconds, slowed: deals.length > 0 };
      });
    }, 100);
    return () => clearInterval(id);
  }, [moved]);
  return {
    auction,
    moved,
    walk: (d: -1 | 0 | 1) => (dir.current = d),
    restart: () => {
      setAuction(start);
      setMoved({});
    },
  };
}

