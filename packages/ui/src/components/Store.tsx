import type { ReactNode } from 'react';
import { GoodIcon } from './GoodIcon';
import { MuleIcon } from './MuleIcon';
import { PlayerMark } from './PlayerMark';
import { cx, GOOD_NAME, type Good, type Slot } from './tokens';

/** Outfitters for farms and mines, in the order the store shows them. */
export const OUTFIT_GOODS: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];

/** The works counter fits a MULE as one of these factories. */
export const FACTORY_GOODS = ['alloy', 'electronics', 'medicine'] as const satisfies readonly Good[];
export type FactoryGood = (typeof FACTORY_GOODS)[number];

export const FACTORY_NAME: Record<FactoryGood, string> = {
  alloy: 'Alloy smelter',
  electronics: 'Electronics works',
  medicine: 'Medicine lab',
};

/** A place inside the store: the corral, the pub, an outfitter, a factory fit or the green belt. */
export type Shop = 'corral' | 'pub' | 'greenBelt' | Good;

export interface StoreInteriorProps {
  mules: number;
  mulePrice: number;
  /** What the pub would pay now, or null when the screen doesn't know. */
  pubPayout?: number | null;
  /** What each outfit costs here. A green belt room shows only when it has a price. */
  prices: Partial<Record<Shop, number>>;
  /** Who stands where inside the store. */
  visitors?: Partial<Record<Shop, Slot[]>>;
  /** Shops the player can use right now; the rest are dimmed. Omit on the big screen. */
  open?: Shop[];
  onShop?(shop: Shop): void;
  tv?: boolean;
  /** Laid out for a short, wide area, such as a phone held sideways: all outfitters in one row. */
  wide?: boolean;
}

/**
 * Inside the colony store, as in the original: the corral sells empty MULEs,
 * each outfitter fits a MULE for one good, and the pub ends your turn for cash.
 */
export function StoreInterior({ mules, mulePrice, pubPayout, prices, visitors = {}, open, onShop, tv = false, wide = false }: StoreInteriorProps) {
  const usable = (s: Shop) => !open || open.includes(s);
  const cost = (s: Shop) => (prices[s] === undefined ? '' : `${prices[s]} cr`);
  const Room = ({ shop, className, children }: { shop: Shop; className?: string; children: ReactNode }) => {
    const here = visitors[shop] ?? [];
    const Tag = onShop ? 'button' : 'div';
    return (
      <Tag
        {...(onShop ? { type: 'button' as const, onClick: () => onShop(shop), disabled: !usable(shop), 'data-shop': shop } : {})}
        className={cx(
          'relative flex flex-col items-start rounded-control border text-left transition-colors',
          tv ? 'gap-1 p-3' : 'gap-0.5 p-2.5',
          usable(shop) ? 'border-holo-line bg-panel' : 'border-holo-faint bg-raised opacity-45',
          onShop && usable(shop) && 'hover:border-holo active:bg-holo-soft',
          className,
        )}
      >
        {children}
        {here.length > 0 && (
          <span className="absolute right-1.5 top-1.5 flex -space-x-1">
            {here.map((s) => (
              <PlayerMark key={s} slot={s} size={tv ? 26 : 20} />
            ))}
          </span>
        )}
      </Tag>
    );
  };
  const small = cx('font-mono text-ink-2', tv ? 'text-sm' : 'text-xs');
  const belt = prices.greenBelt !== undefined;
  // MULEs drawn in the corral before the rest are counted.
  const shown = wide && belt ? 6 : 8;
  // Wide: a twelve-column grid, so the corral, pub and green belt share the first row and all six outfitters fit the second.
  const span = wide
    ? { corral: belt ? 'col-span-5' : 'col-span-8', pub: belt ? 'col-span-3' : 'col-span-4', outfit: 'col-span-2', all: 'col-span-12', factory: 'col-span-4', belt: 'col-span-4' }
    : { corral: 'col-span-2', pub: '', outfit: '', all: 'col-span-3', factory: '', belt: 'col-span-3' };
  const beltRoom = belt && (
    <Room shop="greenBelt" className={cx(span.belt, !wide && 'flex-row! items-center! gap-3!')}>
      <span className="font-semibold">Green belt</span>
      <span className={cx('text-xs text-ink-2', !wide && 'flex-1')}>Makes nothing, cleans the air around it</span>
      <span data-num className={small}>
        {cost('greenBelt')}
      </span>
    </Room>
  );

  return (
    <div className={cx('grid rounded-panel border border-holo-line bg-table', wide ? 'grid-cols-12' : 'grid-cols-3', tv ? 'gap-2 p-3' : 'gap-2 p-2')}>
      <Room shop="corral" className={span.corral}>
        <span className="label-caps">Corral</span>
        <span className="flex flex-wrap items-center gap-1 text-ink">
          {Array.from({ length: Math.min(mules, shown) }, (_, i) => (
            <MuleIcon key={i} size={tv ? 30 : 24} />
          ))}
          {mules > shown && <span data-num className="font-mono text-sm font-bold">+{mules - shown}</span>}
          {mules === 0 && <span className="text-sm text-alert">Sold out</span>}
        </span>
        <span data-num className={small}>
          Empty MULE · {mulePrice} cr
        </span>
      </Room>
      <Room shop="pub" className={span.pub}>
        <span className="label-caps">Pub</span>
        <span className={cx('font-display font-semibold', tv ? 'text-lg' : 'text-base')}>Cash out</span>
        <span data-num className={small}>
          {pubPayout == null ? 'ends your turn' : `about ${pubPayout} cr`}
        </span>
      </Room>
      {wide && beltRoom}
      {OUTFIT_GOODS.map((g) => (
        <Room key={g} shop={g} className={span.outfit}>
          <GoodIcon good={g} size={tv ? 26 : 22} />
          <span className={cx('font-semibold', tv ? 'text-base' : 'text-sm', wide && 'leading-tight')}>{GOOD_NAME[g]}</span>
          <span data-num className={small}>
            {cost(g)}
          </span>
        </Room>
      ))}
      <span className={cx('label-caps', span.all, tv ? 'pt-1' : 'pt-0.5')}>Works · factory fits</span>
      {FACTORY_GOODS.map((g) => (
        <Room key={g} shop={g} className={span.factory}>
          <GoodIcon good={g} size={tv ? 26 : 22} />
          <span className={cx('font-semibold leading-tight', tv ? 'text-base' : 'text-sm')}>{FACTORY_NAME[g]}</span>
          <span data-num className={small}>
            {cost(g)}
          </span>
        </Room>
      ))}
      {!wide && beltRoom}
    </div>
  );
}

/** Development time left, and why: it comes from how well fed the colonist is. */
export function FoodTime({ seconds, total, food, need, note }: { seconds: number; total: number; food: number; need: number; note?: ReactNode }) {
  const full = food >= need;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-raised">
        <div className={cx('absolute inset-y-0 left-0 rounded-full', seconds < 10 ? 'bg-alert' : 'bg-holo')} style={{ width: `${Math.max(0, Math.min(1, seconds / total)) * 100}%` }} />
      </div>
      <span className="text-xs text-ink-2">
        {note ?? (full ? `Full time: you had ${food} Food and needed ${need}.` : `Short of Food (${food} of ${need}), so less time.`)}
      </span>
    </div>
  );
}
