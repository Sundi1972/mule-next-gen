/**
 * DS-GAP: a proposed change to @mule/ui WalkBoard (packages/ui/src/components/WalkBoard.tsx, WS4's file), forked
 * here so the mock can show it. Diff this file against that one: everything new is marked `WS6:`.
 *
 * WS6 adds, all optional so today's callers draw exactly what they draw now:
 * - `marks`: the original's two moving lines. The lowest ask among sellers who still have units, pushed down as
 *   sellers walk; the highest bid among buyers, pushed up as buyers walk. Drawn across the players' columns, their
 *   prices tagged on the axis in the line's colour, the gap between them labelled ("6 APART"). Plain lines, no
 *   shading (Heiko, 21 Oct: variant A). They disappear into the glowing trade bar while units change hands. The land auction asks
 *   for the bid line alone. Who holds each line is said in words beside the board (LineReadout in the mock).
 * - `units` and `surplus` per walker: drawn under the creature, "12 (+4)", as in the original.
 * - `storeStock`: the store's selling line says how many it has left, and "SOLD OUT" sits at the top when it has none.
 * The store and ship lines stay as they are, but thinner: they are limits, not moves.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Creature, cx, SLOT_COLOR, useSeatSpecies, type Slot } from '@mule/ui';

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
  /** WS6: units held of this good, counting down or up live as units trade. */
  units?: number;
  /** WS6: units over (or, negative, under) what they need this month. */
  surplus?: number;
}

/** Units changing hands: between two players, or with a house ('store', 'ship'). */
export interface BoardDeal {
  buyer: string;
  seller: string;
  price: number;
  units: number;
}

/** WS6: which of the original's two moving lines to draw. */
export interface BoardMarks {
  ask: boolean;
  bid: boolean;
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

/** WS6: the lowest ask among sellers with units to sell, and the highest bid. Either is null when nobody is on that side. */
export function bestPrices(walkers: BoardWalker[]): { ask: BoardWalker | null; bid: BoardWalker | null } {
  const sellers = walkers.filter((w) => w.side === 'seller' && (w.units === undefined || w.units > 0));
  const buyers = walkers.filter((w) => w.side === 'buyer');
  const ask = sellers.reduce<BoardWalker | null>((best, w) => (best === null || w.at < best.at ? w : best), null);
  const bid = buyers.reduce<BoardWalker | null>((best, w) => (best === null || w.at > best.at ? w : best), null);
  return { ask, bid };
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
  marks,
  storeStock,
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
  /** WS6: the lowest-ask and highest-bid lines. */
  marks?: BoardMarks;
  /** WS6: the store's stock of this good, shown on its selling line, or as SOLD OUT. */
  storeStock?: number;
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

  // WS6: the store's selling line carries its stock.
  const sellsWhat = storeStock === undefined ? 'SELLS' : `SELLS · ${storeStock} LEFT`;
  const lines = [
    { key: 'sells', price: storeSells, who: 'STORE', what: sellsWhat, tone: 'border-rise text-rise' },
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

  // WS6: the two moving lines, hidden while a trade runs (the trade bar takes their place) and outside the walk.
  const best = bestPrices(walkers);
  const trading = deals.length > 0;
  const showAsk = !!marks?.ask && stage === 'walk' && best.ask !== null && !trading;
  const showBid = !!marks?.bid && stage === 'walk' && best.bid !== null && !trading;
  const gap = showAsk && showBid ? best.ask!.price - best.bid!.price : null;

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
          {/* WS6: the moving lines' prices, tagged on the axis where the eye reads prices. */}
          {showAsk && <AxisTag top={pct(best.ask!.at)} price={best.ask!.price} tone="seller" tv={tv} testid="tag-ask" />}
          {showBid && <AxisTag top={pct(best.bid!.at)} price={best.bid!.price} tone="buyer" tv={tv} testid="tag-bid" />}
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
          {/* WS6: SOLD OUT where the store's selling line would be: nothing caps the buyers. */}
          {storeStock === 0 && storeSells === null && (
            <span
              data-num
              data-testid="store-sold-out"
              className={cx('absolute right-0 top-0 z-20 rounded-sm bg-void px-1 text-right font-mono font-bold leading-tight text-rise', tv ? 'text-base' : 'text-[9px]')}
              style={{ width: gutter }}
            >
              <span className="block font-normal opacity-80">STORE</span>SOLD OUT
            </span>
          )}
          {lines.map((l) => (
            // WS6: limits drawn thinner and quieter than the moving lines.
            <div key={l.key} className={cx('absolute inset-x-0 border-t border-dashed opacity-80', l.tone)} style={{ top: `${pct(l.price)}%` }} data-testid={`limit-${l.key}`}>
              <span
                data-num
                className={cx('absolute right-0 z-20 flex -translate-y-1/2 flex-col items-end rounded-sm bg-void px-1 text-right font-mono font-bold leading-tight', tv ? 'text-base' : 'text-[9px]')}
                style={{ width: gutter }}
              >
                <span className="font-normal opacity-80">{l.who}</span>
                <span>{l.what ? `${l.what.replace(/^SELLS/, `SELLS ${l.price}`).replace(/^(BUYS|PAYS)$/, `$1 ${l.price}`)}` : l.price}</span>
              </span>
            </div>
          ))}

          {showAsk && (
            <MovingLine
              testid="line-ask"
              top={pct(best.ask!.at)}
              width={x(1)}
              tone="seller"
            />
          )}
          {showBid && (
            <MovingLine
              testid="line-bid"
              top={pct(best.bid!.at)}
              width={x(1)}
              tone="buyer"
            />
          )}
          {gap !== null && gap > 0 && (
            <span
              data-num
              data-testid="gap-label"
              className={cx(
                'absolute z-10 -translate-y-1/2 whitespace-nowrap rounded-chip border border-holo-line bg-void px-1.5 font-mono font-bold text-ink',
                tv ? 'text-lg' : 'text-[10px]',
              )}
              style={{ top: `${(pct(best.ask!.at) + pct(best.bid!.at)) / 2}%`, left: `calc(${x(1)} - ${tv ? 112 : 64}px)` }}
            >
              {gap} APART
            </span>
          )}

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

/** WS6: one of the two moving lines, across the players' columns. Its price is tagged on the axis. */
function MovingLine({ testid, top, width, tone }: { testid: string; top: number; width: string; tone: 'seller' | 'buyer' }) {
  return (
    <>
      {/* A wide transparent target, so a reviewer can select a 3 px line. */}
      <div className="absolute left-0 h-3.5 -translate-y-1/2" style={{ top: `${top}%`, width }} data-testid={testid} />
      <div
        aria-hidden
        className={cx('pointer-events-none absolute left-0 border-t-[3px] border-dashed transition-[top] duration-100 ease-linear', tone === 'seller' ? 'border-rise' : 'border-fall')}
        style={{ top: `${top}%`, width }}
      />
    </>
  );
}

/** WS6: a moving line's price on the axis, in the line's colour. */
function AxisTag({ top, price, tone, tv, testid }: { top: number; price: number; tone: 'seller' | 'buyer'; tv: boolean; testid: string }) {
  return (
    <span
      data-num
      data-testid={testid}
      className={cx(
        'absolute right-0.5 z-10 -translate-y-1/2 rounded-sm px-0.5 font-mono font-bold leading-tight text-on-holo transition-[top] duration-100 ease-linear',
        tv ? 'text-base' : 'text-[10px]',
        tone === 'seller' ? 'bg-rise' : 'bg-fall',
      )}
      style={{ top: `${top}%` }}
    >
      {price}
    </span>
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
      <span className="relative flex flex-col items-center">
        <span className={cx('relative rounded-full', trading && 'animate-pulse-glow', me && 'ring-2 ring-holo ring-offset-2 ring-offset-void')}>
          <Creature species={species} color={SLOT_COLOR[w.slot]} size={size} />
        </span>
        {/* WS6: units held and surplus under the creature, as in the original. */}
        {w.units !== undefined && (
          <span
            data-num
            data-testid={`units-${w.id}`}
            className={cx('absolute top-full mt-0.5 whitespace-nowrap rounded-sm bg-void/90 px-1 font-mono font-bold leading-none text-ink', tv ? 'text-base' : 'text-[9px]')}
          >
            {w.units}
            {w.surplus !== undefined && (
              <span className={cx('font-normal', w.surplus < 0 ? 'text-alert' : w.surplus > 0 ? 'text-ok' : 'text-ink-3')}> ({w.surplus > 0 ? '+' : ''}{w.surplus})</span>
            )}
          </span>
        )}
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
