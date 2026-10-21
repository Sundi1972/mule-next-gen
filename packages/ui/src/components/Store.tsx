import type { CSSProperties, ReactNode } from 'react';
import { Creature } from './Creature';
import { GoodIcon } from './GoodIcon';
import { MuleIcon } from './MuleIcon';
import { useSeatSpecies } from './species';
import { cx, GOOD_NAME, SLOT_COLOR, type Good, type Slot } from './tokens';

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

/** Where your colonist can stand: the left door, or in front of the room your MULE was last at. */
type StoreSpot = 'doorL' | 'works' | 'greenBelt' | 'corral' | Exclude<Good, FactoryGood>;

const TOP_Y = 47;
const BOTTOM_Y = 55;
/** Each spot in % of the hall: six outfitters on top, the rest on the bottom row's twelve columns. */
const STORE_SPOT: Record<StoreSpot, { x: number; y: number }> = {
  food: { x: 100 / 12, y: TOP_Y },
  water: { x: 300 / 12, y: TOP_Y },
  energy: { x: 500 / 12, y: TOP_Y },
  smithore: { x: 700 / 12, y: TOP_Y },
  crystite: { x: 900 / 12, y: TOP_Y },
  rareEarth: { x: 1100 / 12, y: TOP_Y },
  doorL: { x: 100 / 24, y: 51 },
  works: { x: 300 / 12, y: BOTTOM_Y },
  greenBelt: { x: 550 / 12, y: BOTTOM_Y },
  corral: { x: 750 / 12, y: BOTTOM_Y },
};

/** The MULE a colonist leads: none, an empty one, or one fitted for a good or a green belt. */
type Leading = Good | 'greenBelt' | 'empty' | null;

const isFactory = (g: Good | 'greenBelt'): g is FactoryGood => (FACTORY_GOODS as readonly string[]).includes(g);

/** In the left door with no MULE, at the corral with an empty one, at its outfitter (or the works) once fitted. */
function spotFor(leading: Leading): StoreSpot {
  if (leading === null) return 'doorL';
  if (leading === 'empty') return 'corral';
  return isFactory(leading) ? 'works' : leading;
}

export interface StoreInteriorProps {
  mules: number;
  mulePrice: number;
  /** What the pub would pay now, or null when the screen doesn't know. */
  pubPayout?: number | null;
  /** What each outfit costs here; a room without a price shows none. */
  prices: Partial<Record<Shop, number>>;
  /** Shops the player can use right now; the rest are dimmed. Omit on the big screen. */
  open?: Shop[];
  onShop?(shop: Shop): void;
  /** Either door: walk out to the map. Without it the doors are only drawn. */
  onDoor?(): void;
  /** The player whose screen this is, standing at the room their MULE says they used last. */
  me?: {
    id: string;
    slot: Slot;
    leading: Leading;
    /** Share of their development time left, for the bar over their head. */
    time: number;
  };
  /** Drawn over the floor, such as the start-of-turn card. */
  overlay?: ReactNode;
  tv?: boolean;
}

/**
 * Inside the colony store, one hall: the six outfitters along the top, and
 * along the bottom the works, the green belt, the MULE corral and the pub
 * between a door to the map at each end.
 */
export function StoreInterior({ mules, mulePrice, pubPayout, prices, open, onShop, onDoor, me, overlay, tv = false }: StoreInteriorProps) {
  const usable = (s: Shop) => !open || open.includes(s);
  const tap = (s: Shop) => (onShop ? () => onShop(s) : undefined);
  const cost = (s: Shop) => (prices[s] === undefined ? '' : `${prices[s]} cr`);
  const icon = tv ? 30 : 22;
  const label = tv ? 'text-sm' : 'text-[10px]';
  const price = cx('font-mono font-bold text-ink-2', tv ? 'text-sm' : 'text-[10px]');
  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-panel border border-holo-line bg-table" data-testid="store-hall">
      <div aria-hidden className="absolute inset-x-0 top-[38%] h-[24%] bg-raised/60" />
      <div className="absolute inset-x-1.5 top-1.5 grid h-[36%] grid-cols-6 gap-1.5" data-testid="row-outfitters">
        {OUTFIT_GOODS.map((g, i) => (
          <Booth key={g} shop={g} testid={`booth-${g}`} onTap={tap(g)} disabled={!usable(g)} className={i === 3 ? 'ml-1.5' : ''} style={{ borderTop: `4px solid var(--color-g-${g})` }}>
            <GoodIcon good={g} size={icon} />
            <span className={cx('font-semibold leading-tight', label)}>{GOOD_NAME[g]}</span>
            <span data-num className={price}>
              {cost(g)}
            </span>
          </Booth>
        ))}
      </div>
      <div className="absolute inset-x-1.5 bottom-1.5 grid h-[36%] grid-cols-12 gap-1.5" data-testid="row-services">
        <Door side="L" onTap={onDoor} tv={tv} />
        <Booth testid="booth-works" className="col-span-4 px-1" disabled={!FACTORY_GOODS.some(usable)}>
          <span className={cx('label-caps', tv ? 'text-xs!' : 'text-[8px]!')}>Works · factory fits</span>
          <span className="grid w-full grid-cols-3 gap-1">
            {FACTORY_GOODS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={tap(g)}
                disabled={!onShop || !usable(g)}
                aria-label={`${FACTORY_NAME[g]} fit`}
                className="flex min-h-11 flex-col items-center justify-center rounded-[6px] border border-holo-faint bg-raised py-0.5 enabled:hover:border-holo"
                data-testid={`fit-${g}`}
                {...(onShop ? { 'data-shop': g } : {})}
              >
                <GoodIcon good={g} size={tv ? 22 : 15} />
                <span data-num className={price}>
                  {prices[g]}
                </span>
              </button>
            ))}
          </span>
        </Booth>
        <Booth shop="greenBelt" testid="booth-greenBelt" onTap={tap('greenBelt')} disabled={!usable('greenBelt')} className="col-span-1 px-0.5" style={{ borderBottom: '4px solid var(--color-ok)' }}>
          <span className={cx('font-semibold leading-tight', label)}>Green belt</span>
          <span data-num className={price}>
            {cost('greenBelt')}
          </span>
        </Booth>
        <Booth shop="corral" testid="booth-corral" onTap={tap('corral')} disabled={!usable('corral') || mules === 0} className="col-span-3" style={{ borderBottom: '4px solid var(--color-holo)' }}>
          <span className="flex items-center gap-0.5 text-ink">
            {Array.from({ length: Math.min(mules, 5) }, (_, i) => (
              <MuleIcon key={i} size={tv ? 26 : 17} />
            ))}
            {mules === 0 && <span className="font-mono text-xs font-bold text-alert">SOLD OUT</span>}
          </span>
          <span className={cx('font-semibold leading-tight', label)}>MULE corral · {mules} left</span>
          <span data-num className={price}>
            {mulePrice} cr
          </span>
        </Booth>
        <Booth shop="pub" testid="booth-pub" onTap={tap('pub')} disabled={!usable('pub')} className="col-span-2" style={{ borderBottom: '4px solid var(--color-warn)' }}>
          <span className={cx('font-semibold leading-tight', label)}>Pub</span>
          <span data-num className={price}>
            {pubPayout == null ? '' : `≈${pubPayout} cr`}
          </span>
          <span className={cx('text-ink-3', tv ? 'text-xs' : 'text-[8px]')}>ends your turn</span>
        </Booth>
        <Door side="R" onTap={onDoor} tv={tv} />
      </div>
      {me && <Colonist at={STORE_SPOT[spotFor(me.leading)]} slot={me.slot} leading={me.leading} time={me.time} testid={`visitor-${me.id}`} tv={tv} />}
      {overlay}
    </div>
  );
}

function Booth({
  shop,
  testid,
  onTap,
  disabled,
  className,
  style,
  children,
}: {
  shop?: Shop;
  testid: string;
  onTap?: (() => void) | undefined;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const Tag = onTap ? 'button' : 'div';
  return (
    <Tag
      {...(onTap ? { type: 'button' as const, onClick: onTap, disabled, ...(shop ? { 'data-shop': shop } : {}) } : {})}
      className={cx(
        'relative flex flex-col items-center justify-center gap-0.5 rounded-control border bg-panel text-center transition-opacity',
        disabled ? 'border-holo-faint opacity-40' : 'border-holo-line',
        onTap && !disabled && 'hover:border-holo active:bg-holo-soft',
        className,
      )}
      style={style}
      data-testid={testid}
    >
      {children}
    </Tag>
  );
}

function Door({ side, onTap, tv }: { side: 'L' | 'R'; onTap: (() => void) | undefined; tv: boolean }) {
  const Tag = onTap ? 'button' : 'div';
  return (
    <Tag
      {...(onTap ? { type: 'button' as const, onClick: onTap } : {})}
      className="flex flex-col items-center justify-center rounded-control border border-dashed border-holo-line text-holo enabled:hover:bg-holo-soft"
      data-testid={`door-${side}`}
      aria-label="Out to the map"
    >
      <span className={cx('font-display font-bold', tv ? 'text-xl' : 'text-sm')}>{side === 'L' ? '←' : '→'}</span>
      <span className={cx('font-mono leading-tight', tv ? 'text-[10px]' : 'text-[7px]')}>MAP</span>
    </Tag>
  );
}

/** Your colonist on the store floor, with the MULE you lead and your time over your head. */
function Colonist({ at, slot, leading, time, testid, tv }: { at: { x: number; y: number }; slot: Slot; leading: Leading; time: number; testid: string; tv: boolean }) {
  const species = useSeatSpecies(slot);
  return (
    <div className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center" style={{ left: `${at.x}%`, top: `${at.y}%` }} data-testid={testid}>
      <span className={cx('mb-0.5 overflow-hidden rounded-full bg-void/70', tv ? 'h-1.5 w-10' : 'h-1 w-7')}>
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, time)) * 100}%`, background: SLOT_COLOR[slot] }} />
      </span>
      <span className="flex items-end">
        <span className="rounded-full ring-2 ring-holo ring-offset-1 ring-offset-table">
          <Creature species={species} color={SLOT_COLOR[slot]} size={tv ? 40 : 26} />
        </span>
        {leading && (
          <span className="flex items-center rounded-full bg-map-chip px-0.5 shadow-chip text-ink">
            <MuleIcon size={tv ? 22 : 14} />
            {leading !== 'empty' && leading !== 'greenBelt' && <GoodIcon good={leading} size={tv ? 14 : 9} />}
          </span>
        )}
      </span>
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
