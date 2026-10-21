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

  const placeOrder = (
    <Button
      size="md"
      variant={placed ? 'outline' : 'holo'}
      className="w-full px-2 text-[13px] leading-tight"
      disabled={!!placed || (side === 'sell' && me.stock[good] === 0) || self.ready}
      onClick={() => client.intent({ type: 'setOrder', good, side, quantity: qty, limit: clamped })}
    >
      {placed ? `Order placed · ${side} ${qty} ${GOOD_NAME[good]}` : `${side === 'sell' ? 'Sell' : 'Buy'} ${qty} ${GOOD_NAME[good]} at ${side === 'sell' ? 'least' : 'most'} ${clamped}`}
    </Button>
  );

  return (
    <PhoneShell
      phase={PHASE_NAME.auction}
      seconds={secondsUntil(view.phaseEndsAt, now)}
      fill
      rail={
        <>
          <div className="flex flex-col gap-1 rounded-control border border-holo-faint bg-panel px-2.5 py-1.5" data-testid="good-row">
            <span className="flex items-center justify-between gap-2">
              <GoodTag good={good} name />
              <span className="font-mono text-[10px] text-ink-3">
                STORE <strong data-num className="text-sm text-ink">{row.storeStock}</strong> · {row.shipPays !== null ? 'SHIP' : 'DEMAND'}{' '}
                <strong data-num className="text-sm text-ink">{row.shipPays ?? row.demand}</strong>
              </span>
            </span>
            <div className="grid grid-cols-4 gap-1 font-mono text-[10px] text-ink-3">
              <span className="flex flex-col">
                HAVE<strong data-num className="text-sm text-ink">{me.stock[good]}</strong>
              </span>
              <span className="flex flex-col">
                NEED<strong data-num className="text-sm text-ink">{needOf(good)}</strong>
              </span>
              <span className="flex flex-col">
                {spare < 0 ? 'SHORT' : 'SPARE'}
                <strong data-num className={cx('text-sm', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink')}>
                  {spare > 0 ? '+' : ''}
                  {spare}
                </strong>
              </span>
              <span className="flex flex-col">
                COVER<strong data-num className={cx('text-sm', row.cover < 0.5 ? 'text-alert' : row.cover < 1 ? 'text-warn' : 'text-ink')}>{row.cover >= 99 ? '—' : `${row.cover} mo`}</strong>
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
                className={cx('h-8 rounded-[8px] font-display text-sm font-semibold', side === s ? 'bg-holo text-on-holo' : 'text-ink-2')}
              >
                {s === 'sell' ? `Sell · have ${me.stock[good]}` : 'Buy'}
              </button>
            ))}
          </div>

          <Button size="md" variant="ghost" className="h-9" disabled={!order || self.ready} onClick={() => client.intent({ type: 'setOrder', good, side: 'none', quantity: 0, limit: 1 })}>
            {order ? `Cancel ${order.side} order` : 'No order for this good'}
          </Button>
        </>
      }
      footer={
        <>
          {placeOrder}
          <Button size="md" variant={self.ready ? 'outline' : 'holo'} className="w-full" disabled={self.ready} onClick={() => client.intent({ type: 'ready' })}>
            {self.ready ? 'Done · waiting for the others' : 'Done trading'}
          </Button>
        </>
      }
    >
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-2.5">
        <div className="min-h-0 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="label-caps pb-1 text-left">Pick a good</caption>
            <thead>
              <tr className="text-left font-mono text-[10px] text-ink-3">
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
                  <tr key={r.good} className={cx('cursor-pointer border-t border-holo-faint', r.good === good && 'bg-holo-soft')} onClick={() => setGood(r.good)}>
                    <td className="py-0">
                      <button type="button" aria-pressed={good === r.good} className="flex h-[30px] w-full items-center pl-1 text-left" onClick={() => setGood(r.good)}>
                        <GoodTag good={r.good} />
                      </button>
                    </td>
                    <td className="text-right text-fall">{dash(r.storeBuys)}</td>
                    <td className="text-right text-rise">{dash(r.storeSells)}</td>
                    <td className={cx('text-right', spareOf(r.good) < 0 && 'text-alert')}>{me.stock[r.good]}</td>
                    <td className="pr-1 text-right text-xs text-holo">{o ? `${o.side === 'buy' ? 'B' : 'S'}${o.quantity}@${o.limit}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex min-h-0 flex-col gap-2">
          <div className="min-h-0 flex-1">
            <AuctionSlider value={clamped} min={min} max={max} storeBuys={row.storeBuys} storeSells={row.storeSells} side={side} onChange={setLimit} className="min-h-0!" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="label-caps">Units</span>
            <Button size="md" variant="outline" className="w-11 px-0" aria-label="Fewer" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              −
            </Button>
            <span data-num className="w-7 text-center font-mono text-xl font-bold">
              {qty}
            </span>
            <Button size="md" variant="outline" className="w-11 px-0" aria-label="More" disabled={qty >= maxQty} onClick={() => setQty((q) => q + 1)}>
              +
            </Button>
            <span data-num className="ml-auto font-mono text-xs text-ink-2">
              = {qty * clamped} cr
            </span>
          </div>
          <p className="shrink-0 rounded-control border border-holo-faint px-2.5 py-1.5 text-xs text-ink-2">{store}</p>
        </div>
      </div>
    </PhoneShell>
  );
}
