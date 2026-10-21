import { PlayerMark, SLOT_COLOR, cx } from '@mule/ui';
import { bookFor, MARKET, seat, STORE_QUEUE, STORE_STOCK, storeTurns } from '../../data';
import { auctionPositions, useCountdown, useNow } from '../../proto';
import { TvHeader } from './TvHeader';

const LOW = 52;
const HIGH = 108;
const FOOD = MARKET.find((m) => m.good === 'food')?.price ?? 81;
const STORE_SELLS = Math.round(FOOD * 1.1);
const STORE_BUYS = Math.round(FOOD * 0.9);

/** Price to distance from the top of the chart, in percent. */
const top = (price: number) => ((HIGH - price) / (HIGH - LOW)) * 100;

const BOOK = bookFor('food');
const STOCK = STORE_STOCK.food ?? 0;
const TURNS = storeTurns(STOCK, STORE_QUEUE);
const TURN_MS = 650;

export function TvAuction() {
  const seconds = useCountdown(30);
  const now = useNow(100);
  const drift = auctionPositions(now);
  // The store queue replays: buyers rush to the store price, units go out one per turn, then a pause.
  const phase = now % ((TURNS.length + 8) * TURN_MS);
  const rushing = phase < (TURNS.length + 3) * TURN_MS;
  const handed = rushing ? Math.min(TURNS.length, Math.max(0, Math.floor(phase / TURN_MS) - 1)) : 0;
  // Sellers hold above the store while it is selling out, so the queue is the only trade.
  const sellers = rushing ? drift.sellers.map((x) => ({ ...x, price: Math.max(x.price, STORE_SELLS + 3) })) : drift.sellers;
  const buyers = rushing ? drift.buyers.map((b) => ({ ...b, price: STORE_SELLS })) : drift.buyers;
  const bestBid = buyers.reduce((a, b) => (b.price > a.price ? b : a));
  const bestAsk = sellers.reduce((a, b) => (b.price < a.price ? b : a));
  const trade = !rushing && bestBid.price >= bestAsk.price ? Math.round((bestBid.price + bestAsk.price) / 2) : null;
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
              <span className="absolute right-0 -translate-y-full pb-1 font-mono text-sm font-bold">{l.label}</span>
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
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 transition-[top] duration-500 ease-out"
              style={{ left: `${12 + i * 11.5}%`, top: `${top(m.price)}%` }}
            >
              <PlayerMark slot={m.slot} size={34} />
              <span className="font-display text-base font-semibold" style={{ color: SLOT_COLOR[m.slot] }}>
                {seat(m.slot).name}
              </span>
              <span data-num className="font-mono text-lg font-bold">{m.price}</span>
              <span className="rounded-chip bg-raised px-1.5 font-mono text-xs text-ink-2">
                {m.side === 'buy' ? 'wants' : 'offers'} {Math.abs((BOOK.find((r) => r.slot === m.slot)?.has ?? 0) - (BOOK.find((r) => r.slot === m.slot)?.needs ?? 0))}
              </span>
            </div>
          ))}
        </div>
        <div className="flex w-[400px] shrink-0 flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-panel border border-holo-line bg-panel p-4">
            <div className="flex items-baseline justify-between">
              <span className="label-caps">Colony store</span>
              <span data-num className="font-mono text-sm text-ink-2">sells at {STORE_SELLS}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span data-num className="font-mono text-4xl font-bold">{STOCK - handed}</span>
              <span className="text-ink-2">of {STOCK} Food left</span>
              {rushing && <span className="ml-auto rounded-chip bg-rise/10 px-2 py-0.5 font-mono text-xs font-bold text-rise">3 BUYERS AT THE STORE</span>}
            </div>
            <div className="grid grid-cols-8 gap-1.5">
              {TURNS.map((slot, i) => (
                <span
                  key={i}
                  className={cx('flex aspect-square items-center justify-center rounded-[6px] border transition-colors duration-300', i < handed ? 'border-transparent' : 'border-holo-line bg-raised')}
                  style={i < handed ? { background: `color-mix(in srgb, ${SLOT_COLOR[slot]} 22%, transparent)` } : undefined}
                >
                  {i < handed && <PlayerMark slot={slot} size={22} glow={false} />}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <span>In turns:</span>
              {STORE_QUEUE.map((q, i) => (
                <span key={q.slot} className="flex items-center gap-1">
                  {i > 0 && <span className="text-ink-3">›</span>}
                  <PlayerMark slot={q.slot} size={18} glow={false} />
                  <span className="font-semibold text-ink">{seat(q.slot).name}</span>
                  <span data-num className="font-mono text-xs text-ink-3">{TURNS.slice(0, handed).filter((x) => x === q.slot).length}/{q.wants}</span>
                </span>
              ))}
            </div>
            <p className="text-sm leading-snug text-ink-3">When buyers meet the store price together, it hands out one unit each, round by round. Ossa is a Quibbit, so she goes first.</p>
          </div>

          <div className="flex flex-col rounded-panel border border-holo-line bg-panel px-4 py-3">
            <div className="grid grid-cols-[1fr_52px_52px_64px] gap-2 pb-1.5">
              <span className="label-caps">Food</span>
              <span className="label-caps text-right">Has</span>
              <span className="label-caps text-right">Needs</span>
              <span className="label-caps text-right">Spare</span>
            </div>
            {BOOK.map((r) => {
              const spare = r.has - r.needs;
              return (
                <div key={r.slot} className="grid grid-cols-[1fr_52px_52px_64px] items-center gap-2 border-t border-holo-faint py-1.5">
                  <span className="flex items-center gap-2 font-semibold">
                    <PlayerMark slot={r.slot} size={22} glow={false} />
                    {seat(r.slot).name}
                  </span>
                  <span data-num className="text-right font-mono text-lg">{r.has}</span>
                  <span data-num className="text-right font-mono text-lg text-ink-2">{r.needs}</span>
                  <span data-num className={cx('text-right font-mono text-lg font-bold', spare > 0 ? 'text-ok' : spare < 0 ? 'text-alert' : 'text-ink-3')}>
                    {spare > 0 ? `+${spare}` : spare < 0 ? `−${-spare}` : '0'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
