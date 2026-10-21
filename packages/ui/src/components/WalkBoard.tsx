import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Creature } from './Creature';
import { useSeatSpecies } from './species';
import { cx, SLOT_COLOR, type Slot } from './tokens';

export interface BoardWalker {
  id: string;
  name: string;
  slot: Slot;
  side: 'buyer' | 'seller' | 'pass';
  /** Rounded bid or ask, as shown. */
  price: number;
  /** Unrounded, for drawing. */
  at: number;
  done?: boolean;
}

/** Units changing hands: between two players, or with a house ('store', 'ship'). */
export interface BoardDeal {
  buyer: string;
  seller: string;
  price: number;
  units: number;
}

const HOUSES: Record<string, string> = { store: 'STORE', ship: 'SHIP' };

/** About five round price marks across the range. */
function ticks(lo: number, hi: number): number[] {
  const raw = (hi - lo) / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

/**
 * The walk auction's board, as in the original M.U.L.E.: a vertical price
 * axis, one column per player, everyone drawn as their species creature in
 * their colour. Sellers start at the top and walk down to ask less, buyers
 * start at the bottom and walk up to bid more. Dashed lines mark the
 * store's selling price (near the top), its buying price (near the bottom)
 * and the export ship's price. Units changing hands show as a glowing bar
 * with a counter. With `onDir`, dragging on the board walks your creature
 * toward your finger.
 */
export function WalkBoard({
  lo,
  hi,
  walkers,
  deals,
  storeBuys,
  storeSells,
  shipPays,
  lines: extra = [],
  stage,
  meId,
  onDir,
  size = 'phone',
  className,
}: {
  lo: number;
  hi: number;
  walkers: BoardWalker[];
  deals: BoardDeal[];
  storeBuys: number | null;
  storeSells: number | null;
  shipPays: number | null;
  /** More price lines, drawn like the store's: a seller's minimum at the land auction. */
  lines?: { id: string; label: string; price: number }[];
  stage: 'declare' | 'walk';
  meId?: string;
  onDir?: (dir: -1 | 0 | 1) => void;
  size?: 'phone' | 'tv';
  className?: string;
}) {
  const tv = size === 'tv';
  const span = Math.max(1, hi - lo);
  const pct = (p: number) => Math.min(100, Math.max(0, ((hi - p) / span) * 100));
  const area = useRef<HTMLDivElement>(null);
  const dir = useRef<-1 | 0 | 1>(0);
  const [drag, setDrag] = useState<number | null>(null);
  const me = walkers.find((w) => w.id === meId);

  // While dragging, walk toward the finger and stop when there.
  useEffect(() => {
    if (!onDir || !me || me.side === 'pass') return;
    const next: -1 | 0 | 1 = drag === null ? 0 : Math.abs(drag - me.at) <= span * 0.015 ? 0 : drag > me.at ? 1 : -1;
    if (next !== dir.current) {
      dir.current = next;
      onDir(next);
    }
  }, [drag, me?.at, me?.side, onDir, span]);

  const priceAt = (e: PointerEvent) => {
    const r = area.current?.getBoundingClientRect();
    if (!r) return null;
    return hi - ((e.clientY - r.top) / r.height) * span;
  };

  const lines = [
    { key: 'sells', price: storeSells, who: 'STORE', what: 'SELLS', tone: 'border-rise text-rise' },
    { key: 'buys', price: storeBuys, who: 'STORE', what: 'BUYS', tone: 'border-fall text-fall' },
    { key: 'ship', price: shipPays, who: 'SHIP', what: 'PAYS', tone: 'border-warn text-warn' },
    ...extra.map((l) => ({ key: `line-${l.id}`, price: l.price, who: l.label, what: '', tone: 'border-holo text-holo' })),
  ].filter((l): l is typeof l & { price: number } => l.price !== null);
  // The lines' labels sit in a gutter on the right, clear of the creatures.
  const gutter = tv ? 104 : 56;

  const cols = walkers.length;
  const colOf = new Map(walkers.map((w, i) => [w.id, i]));
  const centre = (id: string) => ((colOf.get(id) ?? 0) + 0.5) / cols;
  /** A share of the players' columns as a CSS length: the columns stop at the gutter. */
  const x = (share: number) => `calc(${share} * (100% - ${gutter}px))`;
  const creature = tv ? 64 : 34;

  return (
    <div
      className={cx('relative flex h-full w-full select-none overflow-hidden rounded-panel border border-holo-line bg-void', onDir && 'touch-none', className)}
      data-testid="walk-board"
      onPointerDown={(e) => {
        if (!onDir) return;
        try {
          (e.target as Element).setPointerCapture?.(e.pointerId);
        } catch {
          // A synthetic press has no pointer to capture.
        }
        setDrag(priceAt(e));
      }}
      onPointerMove={(e) => drag !== null && setDrag(priceAt(e))}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
    >
      {/* Price axis */}
      <div className={cx('relative shrink-0 border-r border-holo-faint', tv ? 'w-16' : 'w-9')}>
        <div className={cx('absolute inset-x-0', tv ? 'bottom-20 top-12' : 'bottom-12 top-6')}>
          {ticks(lo, hi).map((v) => (
            <span key={v} data-num className={cx('absolute right-1.5 -translate-y-1/2 font-mono text-ink-3', tv ? 'text-base' : 'text-[10px]')} style={{ top: `${pct(v)}%` }}>
              {v}
            </span>
          ))}
        </div>
      </div>

      <div className="relative min-w-0 flex-1">
        {stage === 'declare' && (
          <>
            <div className={cx('absolute inset-x-0 top-0 bg-rise/5', tv ? 'h-24' : 'h-12')} />
            <div className={cx('absolute inset-x-0 bottom-0 bg-fall/5', tv ? 'h-36' : 'h-18')} />
            <span className={cx('absolute inset-x-0 text-center font-display font-semibold text-rise/80', tv ? 'top-28 text-xl' : 'top-14 text-[11px]')}>
              ▼ SELLERS START AT THE TOP AND WALK DOWN TO ASK LESS
            </span>
            <span className={cx('absolute inset-x-0 text-center font-display font-semibold text-fall/80', tv ? 'bottom-40 text-xl' : 'bottom-20 text-[11px]')}>
              ▲ BUYERS START AT THE BOTTOM AND WALK UP TO BID MORE
            </span>
          </>
        )}
        {/* Column guides */}
        <div className="absolute inset-y-0 left-0 flex" style={{ right: gutter }}>
          {walkers.map((w) => (
            <div key={w.id} className={cx('flex-1 border-r border-holo-faint/60 last:border-r-0', w.id === meId && 'bg-holo-soft/40')} />
          ))}
        </div>

        <div ref={area} className={cx('absolute inset-x-0', tv ? 'bottom-20 top-12' : 'bottom-12 top-6')}>
          {lines.map((l) => (
            <div key={l.key} className={cx('absolute inset-x-0 border-t-2 border-dashed', l.tone)} style={{ top: `${pct(l.price)}%` }}>
              <span
                data-num
                className={cx('absolute right-0 z-20 flex -translate-y-1/2 flex-col items-end rounded-sm bg-void px-1 text-right font-mono font-bold leading-tight', tv ? 'text-base' : 'text-[9px]')}
                style={{ width: gutter }}
              >
                <span className="font-normal opacity-80">{l.who}</span>
                <span>{l.what ? `${l.what} ${l.price}` : l.price}</span>
              </span>
            </div>
          ))}

          {deals.map((d) => {
            const players = [d.buyer, d.seller].filter((id) => colOf.has(id));
            const house = HOUSES[d.buyer] ?? HOUSES[d.seller];
            const xs = players.map(centre);
            const left = Math.min(...xs);
            const right = house ? 1 : Math.max(...xs);
            // The counter sits under the trading creature, or between the two players trading.
            const at = house ? left : (left + right) / 2;
            return (
              <div key={`${d.buyer}-${d.seller}`} data-testid="deal">
                <div
                  className="absolute h-1.5 -translate-y-1/2 animate-pulse rounded-full bg-holo shadow-glow"
                  style={{ top: `${pct(d.price)}%`, left: x(left), width: house ? `calc(100% - ${x(left)})` : x(Math.max(0.02, right - left)) }}
                />
                <span
                  data-num
                  className={cx('absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-chip border border-holo bg-void px-1.5 font-mono font-bold text-holo', tv ? 'text-lg' : 'text-[10px]')}
                  style={{ top: `calc(${pct(d.price)}% + ${creature / 2 + 2}px)`, left: x(at) }}
                >
                  ×{d.units} @ {d.price}
                  {house ? ` · ${house}` : ''}
                </span>
              </div>
            );
          })}

          {walkers.map((w) =>
            w.side === 'pass' ? null : (
              <Walker key={w.id} w={w} left={x(centre(w.id))} top={pct(w.at)} size={creature} tv={tv} me={w.id === meId} trading={deals.some((d) => d.buyer === w.id || d.seller === w.id)} />
            ),
          )}
        </div>

        {/* Names along the bottom; a player who passed sits there, off the board. */}
        <div className={cx('absolute inset-x-0 bottom-0 flex border-t border-holo-faint bg-void/90', tv ? 'h-10' : 'h-6')} style={{ paddingRight: gutter }} data-testid="walk-names">
          {walkers.map((w) => (
            <span
              key={w.id}
              className={cx('flex min-w-0 flex-1 items-center justify-center gap-1 px-0.5 font-display font-semibold', tv ? 'text-lg' : 'text-[10px]', w.side === 'pass' ? 'text-ink-3' : 'text-ink')}
            >
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: SLOT_COLOR[w.slot] }} />
              <span className="truncate">{w.id === meId ? 'You' : w.name}</span>
              {w.side === 'pass' && <span className="shrink-0 font-mono text-ink-3">· PASS</span>}
              {w.done && w.side !== 'pass' && <span className="shrink-0 font-mono text-ok">✓</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Walker({ w, left, top, size, tv, me, trading }: { w: BoardWalker; left: string; top: number; size: number; tv: boolean; me: boolean; trading: boolean }) {
  const species = useSeatSpecies(w.slot);
  const seller = w.side === 'seller';
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 transition-[top] duration-100 ease-linear"
      style={{ left, top: `${top}%` }}
      data-testid={`walker-${w.id}`}
      data-side={w.side}
    >
      <span className={cx('relative rounded-full', trading && 'animate-pulse-glow', me && 'ring-2 ring-holo ring-offset-2 ring-offset-void')}>
        <Creature species={species} color={SLOT_COLOR[w.slot]} size={size} />
      </span>
      <span
        data-num
        className={cx(
          'flex flex-col items-start rounded-control border bg-void/90 px-1 font-mono font-bold leading-none',
          tv ? 'py-1 text-xl' : 'py-0.5 text-[11px]',
          seller ? 'border-rise/60 text-rise' : 'border-fall/60 text-fall',
        )}
      >
        <span className={cx('font-normal text-ink-3', tv ? 'text-xs' : 'text-[8px]')}>{seller ? 'ASK' : 'BID'}</span>
        {w.price}
      </span>
    </div>
  );
}
