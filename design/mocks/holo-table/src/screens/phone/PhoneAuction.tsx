import { AuctionSlider, Button, cx, GoodTag, PlayerMark, type Good } from '@mule/ui';
import { useState } from 'react';
import { MARKET, MY_STOCK, seat } from '../../data';
import { auctionPositions, useCountdown, useNow } from '../../proto';
import { PhoneShell } from './Shell';

const GOODS: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite'];

export function PhoneAuction() {
  const seconds = useCountdown(30);
  const now = useNow(200);
  const [good, setGood] = useState<Good>('food');
  const [side, setSide] = useState<'sell' | 'buy'>('sell');
  const [price, setPrice] = useState(84);
  const [qty, setQty] = useState(3);

  const market = MARKET.find((m) => m.good === good)!;
  const storeBuys = Math.round(market.price * 0.9);
  const storeSells = Math.round(market.price * 1.1);
  const have = MY_STOCK[good] ?? 0;
  const { buyers, sellers } = auctionPositions(now);

  // Who would trade with you right now, at the midpoint of both prices.
  const match =
    side === 'sell'
      ? [...buyers].sort((a, b) => b.price - a.price).find((b) => b.price >= price)
      : [...sellers.filter((s) => s.slot !== 0)].sort((a, b) => a.price - b.price).find((s) => s.price <= price);
  const store = side === 'sell' ? price <= storeBuys : price >= storeSells;

  return (
    <PhoneShell phase="Goods auction" seconds={seconds}>
      <div className="flex h-full flex-col gap-3">
        <div className="flex gap-1.5 overflow-x-auto">
          {GOODS.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={good === g}
              onClick={() => setGood(g)}
              className={cx('h-10 shrink-0 rounded-chip border px-3', good === g ? 'border-holo bg-holo-soft' : 'border-holo-faint')}
            >
              <GoodTag good={g} />
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-control border border-holo-line bg-void p-1">
          {(['sell', 'buy'] as const).map((s) => (
            <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)} className={cx('h-10 rounded-[8px] font-display font-semibold', side === s ? 'bg-holo text-on-holo' : 'text-ink-2')}>
              {s === 'sell' ? `Sell · you have ${have}` : 'Buy'}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1">
          <AuctionSlider value={price} min={40} max={130} storeBuys={storeBuys} storeSells={storeSells} side={side} onChange={setPrice} />
        </div>

        <div className={cx('flex min-h-12 items-center gap-2 rounded-control border px-3 py-2 text-sm', match || store ? 'border-ok/50 bg-ok/5' : 'border-holo-faint')}>
          {match ? (
            <>
              <PlayerMark slot={match.slot} size={14} />
              <span>
                {side === 'sell' ? 'You would sell to' : 'You would buy from'} <strong>{seat(match.slot).name}</strong> at{' '}
                <span data-num className="font-mono font-bold">{Math.round((match.price + price) / 2)}</span>
              </span>
            </>
          ) : store ? (
            <span>
              {side === 'sell' ? 'The store buys' : 'The store sells'} at <span data-num className="font-mono font-bold">{side === 'sell' ? storeBuys : storeSells}</span>
            </span>
          ) : (
            <span className="text-ink-3">No trade at this price yet. Move toward the middle.</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="label-caps">Units</span>
          <Button size="md" variant="outline" className="w-12" aria-label="Fewer" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</Button>
          <span data-num className="w-8 text-center font-mono text-xl font-bold">{qty}</span>
          <Button size="md" variant="outline" className="w-12" aria-label="More" onClick={() => setQty((q) => q + 1)}>+</Button>
          <span data-num className="ml-auto font-mono text-sm text-ink-2">= {qty * price} cr</span>
        </div>
      </div>
    </PhoneShell>
  );
}
