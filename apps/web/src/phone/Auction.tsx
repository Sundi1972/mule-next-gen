import type { MarketRow } from '@mule/protocol';
import { AuctionSlider, Button, cx, GOOD_NAME, GoodTag, type Good } from '@mule/ui';
import { useEffect, useState } from 'react';
import { PHASE_NAME, secondsUntil } from '../game/derive';
import { useClient, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { PhoneShell } from './Shell';

const dash = (n: number | null) => (n === null ? '—' : String(n));

/** A slider range around today's prices, so both store quotes fit with room either side. */
function range(row: MarketRow) {
  const prices = [row.price, row.storeBuys, row.storeSells, row.shipPays].filter((p): p is number => p !== null && p > 0);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return { min: Math.max(1, Math.floor(lo * 0.5)), max: Math.max(Math.ceil(hi * 1.5), Math.floor(lo * 0.5) + 10) };
}

/**
 * The goods auction: for each good, set a standing order to buy or sell, with
 * how many and your price limit. The market clears when the timer runs out
 * or everyone is done.
 */
export function Auction() {
  const client = useClient();
  const { view, me, self } = usePhoneGame();
  const now = useServerNow();
  const needOf = (g: Good) => (g === 'food' ? me.needs.food : g === 'water' ? me.needs.water : 0);
  const spareOf = (g: Good) => me.stock[g] - needOf(g);
  const [good, setGood] = useState<Good>(() => view.market.find((r) => spareOf(r.good) > 0)?.good ?? 'food');
  const row = view.market.find((r) => r.good === good) ?? view.market[0]!;
  const order = me.orders[good];
  const { min, max } = range(row);
  const spare = spareOf(good);

  const [side, setSide] = useState<'buy' | 'sell'>('sell');
  const [limit, setLimit] = useState(row.price);
  const [qty, setQty] = useState(1);
  // Switching goods starts from your order for it, or from what you could sell or need to buy.
  useEffect(() => {
    if (order) {
      setSide(order.side);
      setLimit(order.limit);
      setQty(order.quantity);
      return;
    }
    const s = spare > 0 ? 'sell' : 'buy';
    setSide(s);
    setLimit(s === 'sell' ? (row.storeBuys ?? row.price) : (row.storeSells ?? row.price));
    setQty(Math.max(1, Math.abs(spare)));
    // Only when the good changes: the view updating must not undo what the player is setting.
  }, [good]);

  const clamped = Math.min(max, Math.max(min, limit));
  const store =
    side === 'sell'
      ? row.storeBuys !== null && clamped <= row.storeBuys
        ? `The store buys at ${row.storeBuys}, so you sell at least there.`
        : row.storeBuys === null
          ? 'The store is not buying. Only other players or the ship can buy from you.'
          : 'Above the store price: you sell only to a player who bids this much.'
      : row.storeSells !== null && clamped >= row.storeSells
        ? `The store sells at ${row.storeSells}. Buyers at its price get one unit each in turns.`
        : row.storeSells === null
          ? 'The store is sold out. Only other players can sell to you.'
          : 'Below the store price: you buy only from a player who asks this little.';
  const placed = order && order.side === side && order.limit === clamped && order.quantity === qty;
  const maxQty = side === 'sell' ? me.stock[good] : 99;

  return (
    <PhoneShell
      phase={PHASE_NAME.auction}
      seconds={secondsUntil(view.phaseEndsAt, now)}
      footer={
        <Button size="lg" variant={self.ready ? 'outline' : 'holo'} className="w-full" disabled={self.ready} onClick={() => client.intent({ type: 'ready' })}>
          {self.ready ? 'Done · waiting for the others' : 'Done trading'}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-5 gap-1">
          {view.market.map((r) => (
            <button
              key={r.good}
              type="button"
              aria-pressed={good === r.good}
              onClick={() => setGood(r.good)}
              className={cx('relative flex h-10 min-w-0 items-center justify-center rounded-chip border', good === r.good ? 'border-holo bg-holo-soft' : 'border-holo-faint')}
            >
              <GoodTag good={r.good} className="gap-1 text-[11px]" />
              {me.orders[r.good] && <span aria-label="order placed" className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-holo" />}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 rounded-control border border-holo-faint bg-panel px-3 py-2" data-testid="good-row">
          <div className="flex items-baseline justify-between font-mono text-xs text-ink-2">
            <span>
              STORE <strong data-num className="text-base text-ink">{row.storeStock}</strong>
            </span>
            <span>
              YOU HAVE <strong data-num className="text-base text-ink">{me.stock[good]}</strong>
            </span>
            <span>
              NEED <strong data-num className="text-base text-ink">{needOf(good)}</strong>
            </span>
            <span>
              {spare < 0 ? 'SHORT' : 'SPARE'}{' '}
              <strong data-num className={cx('text-base', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink')}>
                {spare > 0 ? '+' : ''}
                {spare}
              </strong>
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 border-t border-holo-faint pt-2 font-mono text-[11px] text-ink-3">
            <span className="flex flex-col">
              STORE BUYS<strong data-num className="text-sm text-fall">{row.storeBuys ?? 'not buying'}</strong>
            </span>
            <span className="flex flex-col">
              STORE SELLS<strong data-num className="text-sm text-rise">{row.storeSells ?? 'sold out'}</strong>
            </span>
            <span className="flex flex-col">
              COVER<strong data-num className={cx('text-sm', row.cover < 0.5 ? 'text-alert' : row.cover < 1 ? 'text-warn' : 'text-ink')}>{row.cover >= 99 ? '—' : `${row.cover} mo`}</strong>
            </span>
            <span className="flex flex-col">
              {row.shipPays !== null ? 'SHIP PAYS' : 'DEMAND'}
              <strong data-num className="text-sm text-ink">{row.shipPays ?? row.demand}</strong>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-control border border-holo-line bg-void p-1">
          {(['sell', 'buy'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              onClick={() => {
                setSide(s);
                if (s === 'sell') setQty((q) => Math.min(q, Math.max(1, me.stock[good])));
              }}
              className={cx('h-10 rounded-[8px] font-display font-semibold', side === s ? 'bg-holo text-on-holo' : 'text-ink-2')}
            >
              {s === 'sell' ? `Sell · you have ${me.stock[good]}` : 'Buy'}
            </button>
          ))}
        </div>

        <div className="h-64">
          <AuctionSlider value={clamped} min={min} max={max} storeBuys={row.storeBuys} storeSells={row.storeSells} side={side} onChange={setLimit} />
        </div>

        <p className="min-h-10 rounded-control border border-holo-faint px-3 py-2 text-sm text-ink-2">{store}</p>

        <div className="flex items-center gap-3">
          <span className="label-caps">Units</span>
          <Button size="md" variant="outline" className="w-12" aria-label="Fewer" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            −
          </Button>
          <span data-num className="w-8 text-center font-mono text-xl font-bold">
            {qty}
          </span>
          <Button size="md" variant="outline" className="w-12" aria-label="More" disabled={qty >= maxQty} onClick={() => setQty((q) => q + 1)}>
            +
          </Button>
          <span data-num className="ml-auto font-mono text-sm text-ink-2">
            = {qty * clamped} cr
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button
            size="md"
            variant={placed ? 'outline' : 'holo'}
            disabled={!!placed || (side === 'sell' && me.stock[good] === 0) || self.ready}
            onClick={() => client.intent({ type: 'setOrder', good, side, quantity: qty, limit: clamped })}
          >
            {placed ? `Order placed · ${side} ${qty} ${GOOD_NAME[good]}` : `${side === 'sell' ? 'Sell' : 'Buy'} ${qty} ${GOOD_NAME[good]} at ${side === 'sell' ? 'least' : 'most'} ${clamped}`}
          </Button>
          <Button size="md" variant="ghost" disabled={!order || self.ready} onClick={() => client.intent({ type: 'setOrder', good, side: 'none', quantity: 0, limit: 1 })}>
            Cancel
          </Button>
        </div>

        <table className="mt-2 w-full text-sm">
          <caption className="label-caps pb-1 text-left">All goods</caption>
          <thead>
            <tr className="text-left font-mono text-[11px] text-ink-3">
              <th className="pb-1 font-medium">GOOD</th>
              <th className="pb-1 text-right font-medium">BUYS</th>
              <th className="pb-1 text-right font-medium">SELLS</th>
              <th className="pb-1 text-right font-medium">YOU</th>
              <th className="pb-1 text-right font-medium">ORDER</th>
            </tr>
          </thead>
          <tbody data-num className="font-mono">
            {view.market.map((r) => {
              const o = me.orders[r.good];
              return (
                <tr key={r.good} className={cx('border-t border-holo-faint', r.good === good && 'bg-holo-soft')} onClick={() => setGood(r.good)}>
                  <td className="py-1.5">
                    <GoodTag good={r.good} />
                  </td>
                  <td className="py-1.5 text-right">{dash(r.storeBuys)}</td>
                  <td className="py-1.5 text-right">{dash(r.storeSells)}</td>
                  <td className={cx('py-1.5 text-right', spareOf(r.good) < 0 && 'text-alert')}>{me.stock[r.good]}</td>
                  <td className="py-1.5 text-right text-holo">{o ? `${o.side === 'buy' ? 'B' : 'S'} ${o.quantity}@${o.limit}` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PhoneShell>
  );
}
