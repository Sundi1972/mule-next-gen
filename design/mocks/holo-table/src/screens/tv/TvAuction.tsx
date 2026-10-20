import { PlayerMark, SLOT_COLOR, cx } from '@mule/ui';
import { MARKET, seat } from '../../data';
import { auctionPositions, useCountdown, useNow } from '../../proto';
import { TvHeader } from './TvHeader';

const LOW = 52;
const HIGH = 108;
const FOOD = MARKET.find((m) => m.good === 'food')?.price ?? 81;
const STORE_SELLS = Math.round(FOOD * 1.1);
const STORE_BUYS = Math.round(FOOD * 0.9);

/** Price to distance from the top of the chart, in percent. */
const top = (price: number) => ((HIGH - price) / (HIGH - LOW)) * 100;

export function TvAuction() {
  const seconds = useCountdown(30);
  const { sellers, buyers } = auctionPositions(useNow(100));
  const bestBid = buyers.reduce((a, b) => (b.price > a.price ? b : a));
  const bestAsk = sellers.reduce((a, b) => (b.price < a.price ? b : a));
  const trade = bestBid.price >= bestAsk.price ? Math.round((bestBid.price + bestAsk.price) / 2) : null;
  const ticks = [100, 90, 80, 70, 60];

  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-5 bg-table p-10 text-ink">
      <TvHeader phase="Goods auction · Food" seconds={seconds} />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="holo-grid relative flex-1 overflow-hidden rounded-panel border border-holo-line bg-void">
          <span className="label-caps absolute left-24 top-3">Sellers · come down</span>
          <span className="label-caps absolute bottom-3 left-24">Buyers · go up</span>
          {ticks.map((p) => (
            <span key={p} data-num className="absolute left-4 -translate-y-1/2 font-mono text-sm text-ink-3" style={{ top: `${top(p)}%` }}>
              {p}
            </span>
          ))}
          {[
            { p: STORE_SELLS, label: `Store sells ${STORE_SELLS}`, tone: 'border-rise text-rise' },
            { p: STORE_BUYS, label: `Store buys ${STORE_BUYS}`, tone: 'border-fall text-fall' },
          ].map((l) => (
            <div key={l.label} className={cx('absolute inset-x-16 border-t-2 border-dashed', l.tone)} style={{ top: `${top(l.p)}%` }}>
              <span className="absolute right-0 -translate-y-full pb-1 font-mono text-base font-bold">{l.label}</span>
            </div>
          ))}
          {trade !== null && (
            <div className="absolute inset-x-16 animate-pulse-glow border-t-4 border-holo" style={{ top: `${top(trade)}%` }}>
              <span className="absolute left-1/2 -translate-x-1/2 -translate-y-full rounded-chip bg-holo px-3 py-1 font-mono text-xl font-bold text-on-holo">
                TRADE {trade}
              </span>
            </div>
          )}
          {[...buyers.map((b) => ({ ...b, side: 'buy' as const })), ...sellers.map((s) => ({ ...s, side: 'sell' as const }))].map((m, i) => (
            <div
              key={m.slot}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 transition-[top] duration-100"
              style={{ left: `${20 + i * 13}%`, top: `${top(m.price)}%` }}
            >
              <PlayerMark slot={m.slot} size={34} />
              <span className="font-display text-base font-semibold" style={{ color: SLOT_COLOR[m.slot] }}>
                {seat(m.slot).name}
              </span>
              <span data-num className="font-mono text-lg font-bold">{m.price}</span>
            </div>
          ))}
        </div>
        <div className="flex w-[300px] shrink-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line">
            {[
              ['Colony stock', '14'],
              ['Cover', '0.6 mo'],
              ['Demand', '23 / mo'],
              ['Last price', '78'],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col gap-1 bg-panel p-4">
                <span className="label-caps">{k}</span>
                <span data-num className="font-mono text-2xl font-bold">{v}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4">
            <span className="label-caps">Last trades</span>
            {[
              ['Mia', 'Ossa', 4, 79],
              ['Heiko', 'Lena', 2, 81],
              ['Jonas', 'Store', 3, STORE_BUYS],
            ].map(([from, to, q, p]) => (
              <span key={`${from}${to}`} className="font-mono text-base">
                <span className="text-ink-2">{from} → {to}</span> <span className="text-ink">{q} @ {p}</span>
              </span>
            ))}
          </div>
          <p className="mt-auto font-display text-xl leading-snug text-ink-2">Move your slider on your phone. Lines that meet, trade.</p>
        </div>
      </div>
    </div>
  );
}
