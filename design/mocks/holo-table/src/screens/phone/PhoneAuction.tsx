import { AuctionSlider, Button, cx, GoodTag, PlayerMark, type Good } from '@mule/ui';
import { useState } from 'react';
import { bookFor, MARKET, ME, seat, STORE_QUEUE, STORE_STOCK } from '../../data';
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
  const book = bookFor(good);
  const mine = book.find((r) => r.slot === ME)!;
  const have = mine.has;
  const stock = STORE_STOCK[good] ?? 0;
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
        <div className="grid grid-cols-5 gap-1">
          {GOODS.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={good === g}
              onClick={() => setGood(g)}
              className={cx('flex h-10 min-w-0 items-center justify-center rounded-chip border', good === g ? 'border-holo bg-holo-soft' : 'border-holo-faint')}
            >
              <GoodTag good={g} className="gap-1 text-[11px]" />
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 rounded-control border border-holo-faint bg-panel px-3 py-2">
          <div className="flex items-baseline justify-between font-mono text-xs text-ink-2">
            <span>STORE <strong data-num className="text-base text-ink">{stock}</strong></span>
            <span>YOU HAVE <strong data-num className="text-base text-ink">{mine.has}</strong></span>
            <span>NEED <strong data-num className="text-base text-ink">{mine.needs}</strong></span>
            <span>
              SPARE{' '}
              <strong data-num className={cx('text-base', mine.has - mine.needs < 0 ? 'text-alert' : 'text-ok')}>
                {mine.has - mine.needs > 0 ? '+' : ''}
                {mine.has - mine.needs}
              </strong>
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1 border-t border-holo-faint pt-2">
            {book.map((r) => {
              const spare = r.has - r.needs;
              return (
                <span key={r.slot} className="flex flex-col items-center" aria-label={`${seat(r.slot).name}: has ${r.has}, needs ${r.needs}`}>
                  <PlayerMark slot={r.slot} size={20} glow={false} />
                  <span data-num className={cx('font-mono text-xs font-bold', spare > 0 ? 'text-ok' : spare < 0 ? 'text-alert' : 'text-ink-3')}>
                    {spare > 0 ? `+${spare}` : spare < 0 ? `−${-spare}` : '0'}
                  </span>
                </span>
              );
            })}
          </div>
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
              {side === 'buy' && (
                <span className="text-ink-2">. {STORE_QUEUE.length} others are buying too, so it hands out one unit each in turns.</span>
              )}
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
