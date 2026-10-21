import { cx, GOOD_NAME, GoodIcon, MuleIcon, PlayerMark, type Good, type Slot } from '@mule/ui';
import type { ReactNode } from 'react';
import { FACTORIES } from './factory';

export const OUTFITS: { good: Good; cost: number }[] = [
  { good: 'food', cost: 25 },
  { good: 'water', cost: 25 },
  { good: 'energy', cost: 50 },
  { good: 'smithore', cost: 75 },
  { good: 'crystite', cost: 100 },
  { good: 'rareEarth', cost: 100 },
];

export type Shop = 'corral' | 'pub' | Good;

interface StoreProps {
  mules: number;
  mulePrice: number;
  pubPayout: number;
  /** Who stands where inside the store. */
  visitors?: Partial<Record<Shop, Slot[]>>;
  /** Shops the player can use right now; the rest are dimmed. Omit on the big screen. */
  open?: Shop[];
  onShop?(shop: Shop): void;
  tv?: boolean;
}

/**
 * Inside the colony store, as in the original: the corral sells empty MULEs,
 * each outfitter fits a MULE for one good, and the pub ends your turn for cash.
 */
export function StoreInterior({ mules, mulePrice, pubPayout, visitors = {}, open, onShop, tv = false }: StoreProps) {
  const usable = (s: Shop) => !open || open.includes(s);
  const Room = ({ shop, className, children }: { shop: Shop; className?: string; children: ReactNode }) => {
    const here = visitors[shop] ?? [];
    const Tag = onShop ? 'button' : 'div';
    return (
      <Tag
        {...(onShop ? { type: 'button' as const, onClick: () => onShop(shop), disabled: !usable(shop) } : {})}
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

  return (
    <div className={cx('grid grid-cols-3 rounded-panel border border-holo-line bg-table', tv ? 'gap-2 p-3' : 'gap-2 p-2')}>
      <Room shop="corral" className="col-span-2">
        <span className="label-caps">Corral</span>
        <span className="flex items-center gap-1 text-ink">
          {Array.from({ length: mules }, (_, i) => (
            <MuleIcon key={i} size={tv ? 30 : 24} />
          ))}
          {mules === 0 && <span className="text-sm text-alert">Sold out</span>}
        </span>
        <span data-num className={cx('font-mono text-ink-2', tv ? 'text-sm' : 'text-xs')}>
          Empty MULE · {mulePrice} cr
        </span>
      </Room>
      <Room shop="pub">
        <span className="label-caps">Pub</span>
        <span className={cx('font-display font-semibold', tv ? 'text-lg' : 'text-base')}>Cash out</span>
        <span data-num className={cx('font-mono text-ink-2', tv ? 'text-sm' : 'text-xs')}>
          about {pubPayout} cr
        </span>
      </Room>
      {OUTFITS.map((o) => (
        <Room key={o.good} shop={o.good}>
          <GoodIcon good={o.good} size={tv ? 26 : 22} />
          <span className={cx('font-semibold', tv ? 'text-base' : 'text-sm')}>{GOOD_NAME[o.good]}</span>
          <span data-num className={cx('font-mono text-ink-2', tv ? 'text-sm' : 'text-xs')}>
            {o.cost} cr
          </span>
        </Room>
      ))}
      <span className={cx('label-caps col-span-3', tv ? 'pt-1' : 'pt-0.5')}>Works · factory fits</span>
      {FACTORIES.map((f) => (
        <Room key={f.good} shop={f.good}>
          <GoodIcon good={f.good} size={tv ? 26 : 22} />
          <span className={cx('font-semibold leading-tight', tv ? 'text-base' : 'text-sm')}>{f.name}</span>
          <span data-num className={cx('font-mono text-ink-2', tv ? 'text-sm' : 'text-xs')}>
            {f.cost} cr
          </span>
        </Room>
      ))}
    </div>
  );
}

/** Development time left, and why: it comes from how well fed the colonist is. */
export function FoodTime({ seconds, total, food, need }: { seconds: number; total: number; food: number; need: number }) {
  const full = food >= need;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-raised">
        <div className={cx('absolute inset-y-0 left-0 rounded-full', seconds < 10 ? 'bg-alert' : 'bg-holo')} style={{ width: `${(seconds / total) * 100}%` }} />
      </div>
      <span className="text-xs text-ink-2">
        {full ? `Full time: you had ${food} Food and needed ${need}.` : `Short of Food (${food} of ${need}), so less time.`}
      </span>
    </div>
  );
}
