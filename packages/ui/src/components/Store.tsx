import type { CSSProperties, ReactNode } from 'react';
import { Creature } from './Creature';
import { GoodIcon } from './GoodIcon';
import { Mule } from './Mule';
import { useSeatSpecies, type CreatureWrap } from './species';
import { cx, GOOD_NAME, SLOT_COLOR, type Good, type Slot } from './tokens';

/** Outfitters for farms and mines, in the order the store shows them. */
export const OUTFIT_GOODS: OutfitGood[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];

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

/** The outfitters' goods: the raw goods a farm or mine makes. */
export type OutfitGood = Exclude<Good, FactoryGood>;

/** A room of the hall the guide can point at or close: a shopfront, the works, the green belt, the corral, the pub or a door. */
export type StoreRoom = OutfitGood | 'works' | 'greenBelt' | 'corral' | 'pub' | 'doorL' | 'doorR';

/** The MULE a colonist leads: none, an empty one, or one fitted for a good or a green belt. */
type Leading = Good | 'greenBelt' | 'empty' | null;

const isFactory = (g: Good | 'greenBelt'): g is FactoryGood => (FACTORY_GOODS as readonly string[]).includes(g);

/** The works' three fitting bays, as the hall labels them on a wide screen. */
const FIT_LABEL: Record<FactoryGood, string> = { alloy: 'Smelter', electronics: 'Electronics', medicine: 'Medicine lab' };

/** The two rows' bands and the shopfronts' span, in % of the hall. */
const TOP = { y0: 3, y1: 39 };
const BOT = { y0: 60, y1: 97 };
const X0 = 9;
const X1 = 91;
const COL = (X1 - X0) / 6;
const BOTTOM: Record<'works' | 'greenBelt' | 'corral' | 'pub', [number, number]> = { works: [9, 36], greenBelt: [37, 46], corral: [47, 73], pub: [74, 91] };
/** The airlocks stand across the walkway, from 30 % to 70 % of the hall's height. */
const DOOR = { y0: 30, y1: 70 };

/** Where a colonist stands on the floor: in front of each room, or in a doorway. */
type Spot = StoreRoom;
const SPOT: Record<Spot, { x: number; y: number }> = {
  ...(Object.fromEntries(OUTFIT_GOODS.map((g, i) => [g, { x: X0 + COL * (i + 0.5), y: 46 }])) as Record<OutfitGood, { x: number; y: number }>),
  works: { x: 22.5, y: 54 },
  greenBelt: { x: 41.5, y: 54 },
  corral: { x: 60, y: 54 },
  pub: { x: 82.5, y: 54 },
  doorL: { x: 4.5, y: 50 },
  doorR: { x: 95.5, y: 50 },
};

/** Before R1 a tap acts at once: you stand at the room you used last. In the left door with no MULE, at the corral with an empty one, at its outfitter (or the works) once fitted. */
function spotFor(leading: Leading): Spot {
  if (leading === null) return 'doorL';
  if (leading === 'empty') return 'corral';
  return isFactory(leading) ? 'works' : leading;
}

/** A box in % of its row: across the hall's full width, down the row's band. */
const inRow = (x0: number, x1: number): CSSProperties => ({ left: `${x0}%`, width: `${x1 - x0}%`, top: 0, height: '100%' });
const band = (b: { y0: number; y1: number }): CSSProperties => ({ top: `${b.y0}%`, height: `${b.y1 - b.y0}%` });

/** Type and creature sizes: the phone's, the big screen's side panel, and the shell's wide layout. */
const SIZES = {
  phone: { lock: 'py-px text-[7px]', name: 'text-[11px]', price: 'text-[10px]', small: 'text-[8px]', icon: 20, fit: 16, mule: 30, creature: 28, led: 32, bar: 'h-1 w-8', sign: 'h-5 w-5', chimney: 'h-3 w-3', caps: 'text-[8px]!', door: 'text-base', doorNote: 'text-[7px]' },
  tv: { lock: 'py-0.5 text-[10px]', name: 'text-sm', price: 'text-sm', small: 'text-xs', icon: 30, fit: 22, mule: 44, creature: 40, led: 44, bar: 'h-1.5 w-10', sign: 'h-7 w-7', chimney: 'h-4 w-4', caps: 'text-xs!', door: 'text-xl', doorNote: 'text-[10px]' },
  wide: { lock: 'py-0.5 text-[11px]', name: 'text-lg', price: 'text-base', small: 'text-sm', icon: 40, fit: 30, mule: 84, creature: 52, led: 60, bar: 'h-2 w-14', sign: 'h-10 w-10', chimney: 'h-5 w-5', caps: 'text-xs!', door: 'text-3xl', doorNote: 'text-xs' },
};
type Sizes = (typeof SIZES)[keyof typeof SIZES];

export interface StoreInteriorProps {
  mules: number;
  mulePrice: number;
  /** What the pub would pay now, or null when the screen doesn't know. */
  pubPayout?: number | null;
  /** What each outfit costs here; a room without a price shows none. */
  prices: Partial<Record<Shop, number>>;
  /** Shops the player can use right now; the rest are closed. Omit on the big screen. */
  open?: Shop[];
  onShop?(shop: Shop): void;
  /** Either door: walk out to the map. Without it the doors are only drawn. */
  onDoor?(): void;
  /** The rooms the guide points at (RULE-7): each glows and says TAP while it can be used. */
  next?: StoreRoom[];
  /** Why a closed room is closed, such as "needs a MULE"; an empty note fades the room without one. */
  locks?: Partial<Record<StoreRoom, string>>;
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
  /** The big screen's side panel. */
  tv?: boolean;
  /** The shell's wide layout (laptop and up): bigger type and creatures. */
  wide?: boolean;
  /** Wraps the colonist's creature, such as in a chat bubble's anchor. */
  wrapCreature?: CreatureWrap;
}

/**
 * Inside the colony store, one hall that is a place (spec C12, C18): six shopfronts along the back wall, each under
 * an awning in its good's colour; a tiled floor with a walkway; along the front the works (three fitting bays under
 * a chimney), the green belt as a little greenhouse, the corral as a pen of MULE characters and the warm pub; an
 * airlock door to the colony at each end. It fills whatever stage it is given. The room the guide names glows and
 * says TAP; a closed room stays legible and says why.
 */
export function StoreInterior({ mules, mulePrice, pubPayout, prices, open, onShop, onDoor, next = [], locks, me, overlay, tv = false, wide = false, wrapCreature }: StoreInteriorProps) {
  const usable = (s: Shop) => !open || open.includes(s);
  const tap = (s: Shop) => (onShop ? () => onShop(s) : undefined);
  const cost = (s: Shop) => (prices[s] === undefined ? null : `${prices[s]} cr`);
  const glows = (r: StoreRoom) => next.includes(r);
  const z = wide ? SIZES.wide : tv ? SIZES.tv : SIZES.phone;
  const price = cx('font-mono font-bold', z.price);
  const worksOpen = FACTORY_GOODS.some(usable);
  return (
    <div
      className="relative h-full w-full select-none overflow-hidden rounded-sheet border border-holo-line"
      style={{
        // The floor: soft tiles under a warm ceiling light, all from tokens.
        background:
          'radial-gradient(ellipse 60% 45% at 50% 50%, color-mix(in srgb, var(--color-warn) 10%, transparent), transparent 70%), repeating-linear-gradient(90deg, transparent 0 46px, var(--color-holo-faint) 46px 47px), repeating-linear-gradient(0deg, transparent 0 46px, var(--color-holo-faint) 46px 47px), var(--color-table)',
      }}
      data-testid="store-hall"
    >
      {/* The back wall behind the shopfronts. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[42%] border-b-2 border-holo-line bg-raised/50" />
      {/* The walkway between the rows. */}
      <div aria-hidden className="absolute inset-x-[8%] top-[43%] h-[14%] rounded-full border border-dashed border-holo-faint bg-panel/30" />

      <div className="absolute inset-x-0" style={band(TOP)} data-testid="row-outfitters">
        {OUTFIT_GOODS.map((g, i) => (
          <Room z={z}
            key={g}
            shop={g}
            testid={`booth-${g}`}
            style={inRow(X0 + COL * i + 0.4, X0 + COL * (i + 1) - 0.4)}
            onTap={tap(g)}
            disabled={!usable(g)}
            next={glows(g)}
            lock={locks?.[g]}
            className="bg-panel"
          >
            <Awning color={`var(--color-g-${g})`} />
            <span className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1">
              <span className="grid place-items-center rounded-full p-1.5" style={{ background: `color-mix(in srgb, var(--color-g-${g}) 18%, transparent)`, boxShadow: `0 0 18px color-mix(in srgb, var(--color-g-${g}) 35%, transparent)` }}>
                <GoodIcon good={g} size={z.icon} />
              </span>
              <span className={cx('font-display font-semibold leading-tight', z.name)}>{GOOD_NAME[g]}</span>
              {cost(g) && (
                <span data-num className={cx(price, 'rounded-chip bg-void/50 px-1.5 text-ink')}>
                  {cost(g)}
                </span>
              )}
            </span>
          </Room>
        ))}
      </div>

      <div className="absolute inset-x-0" style={band(BOT)} data-testid="row-services">
        <Door side="L" onTap={onDoor} next={glows('doorL')} z={z} />

        {/* The works: three fitting bays under a chimney. */}
        <Room z={z} testid="booth-works" style={inRow(...BOTTOM.works)} disabled={!worksOpen} next={glows('works')} lock={locks?.works} className="bg-panel">
          <span className="flex items-center justify-center gap-1.5 border-b border-holo-faint bg-raised/60 py-0.5">
            <svg aria-hidden viewBox="0 0 16 16" className={z.chimney}>
              <path d="M2 14V7l4 2V7l4 2V3h4v11z" fill="var(--color-ink-3)" />
            </svg>
            <span className={cx('label-caps', z.caps)}>The works · factory fits</span>
          </span>
          <span className="grid flex-1 grid-cols-3 gap-1 p-1">
            {FACTORY_GOODS.map((g) => (
              <button
                key={g}
                type="button"
                disabled={!onShop || !usable(g)}
                onClick={tap(g)}
                aria-label={`${FACTORY_NAME[g]} fit`}
                className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-control border border-holo-faint bg-raised enabled:hover:border-holo"
                data-testid={`fit-${g}`}
                {...(onShop ? { 'data-shop': g } : {})}
              >
                <GoodIcon good={g} size={z.fit} />
                {wide && <span className="text-sm font-semibold">{FIT_LABEL[g]}</span>}
                {prices[g] !== undefined && (
                  <span data-num className={price}>
                    {prices[g]}
                  </span>
                )}
              </button>
            ))}
          </span>
        </Room>

        {/* The green belt: a little greenhouse. */}
        <Room z={z} shop="greenBelt" testid="booth-greenBelt" style={inRow(...BOTTOM.greenBelt)} onTap={tap('greenBelt')} disabled={!usable('greenBelt')} next={glows('greenBelt')} lock={locks?.greenBelt} className="bg-ok/10">
          <svg aria-hidden viewBox="0 0 40 24" preserveAspectRatio="none" className="h-[22%] w-full shrink-0">
            <path d="M0 24 L20 2 L40 24 Z" fill="var(--color-ok)" fillOpacity={0.35} stroke="var(--color-ok)" strokeWidth={1} />
            <path d="M20 2 V24 M10 13 H30" stroke="var(--color-ok)" strokeWidth={0.8} />
          </svg>
          <span className="flex flex-1 flex-col items-center justify-center px-0.5">
            <span className={cx('font-semibold leading-tight', z.name)}>Green belt</span>
            {cost('greenBelt') && (
              <span data-num className={price}>
                {cost('greenBelt')}
              </span>
            )}
          </span>
        </Room>

        {/* The corral: a pen of MULE characters, none of them anyone's yet. */}
        <Room z={z} shop="corral" testid="booth-corral" style={inRow(...BOTTOM.corral)} onTap={tap('corral')} disabled={!usable('corral') || mules === 0} next={glows('corral')} lock={locks?.corral} className="bg-holo-soft">
          <span className="relative flex flex-1 items-end justify-center overflow-hidden px-1 pt-3">
            {/* The fence. */}
            <svg aria-hidden viewBox="0 0 100 20" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[22%] w-full">
              <path d="M1 8 H99" stroke="var(--color-holo-line)" strokeWidth={2.5} />
              <path d="M2 2 V20 M98 2 V20" stroke="var(--color-holo)" strokeOpacity={0.6} strokeWidth={3} />
            </svg>
            {mules === 0 ? (
              <span className="mb-[18%] font-mono text-sm font-bold text-alert">SOLD OUT</span>
            ) : (
              Array.from({ length: Math.min(mules, 3) }, (_, i) => <Mule key={i} size={z.mule} facing={i % 2 ? 'left' : 'right'} className="relative -mx-1 mb-1" />)
            )}
          </span>
          <span className="flex items-baseline justify-center gap-2 bg-void/40 py-0.5">
            <span className={cx('font-semibold', z.name)}>MULE corral · {mules} left</span>
            <span data-num className={price}>
              {mulePrice} cr
            </span>
          </span>
        </Room>

        {/* The pub: warm light, a sign. */}
        <Room z={z}
          shop="pub"
          testid="booth-pub"
          style={{ ...inRow(...BOTTOM.pub), background: 'radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--color-warn) 30%, transparent), color-mix(in srgb, var(--color-warn) 8%, var(--color-panel)) 70%)' }}
          onTap={tap('pub')}
          disabled={!usable('pub')}
          next={glows('pub')}
          lock={locks?.pub}
        >
          <span className="flex flex-1 flex-col items-center justify-center gap-0.5">
            <svg aria-hidden viewBox="0 0 24 24" className={z.sign}>
              <path d="M5 5h10v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="var(--color-warn)" fillOpacity={0.5} stroke="var(--color-warn)" strokeWidth={1.5} />
              <path d="M15 8h2.5a2.5 2.5 0 0 1 0 5H15" fill="none" stroke="var(--color-warn)" strokeWidth={1.5} />
              <path d="M5 5c1-2 3-2 4-1 1-1.5 4-1.5 5 0" fill="none" stroke="var(--color-ink)" strokeWidth={1.2} />
            </svg>
            <span className={cx('font-display font-semibold', z.name)}>Pub</span>
            {pubPayout != null && (
              <span data-num className={cx(price, 'text-warn')}>
                ≈{pubPayout} cr
              </span>
            )}
            <span className={cx('text-ink-2', z.small)}>ends your turn</span>
          </span>
        </Room>

        <Door side="R" onTap={onDoor} next={glows('doorR')} z={z} />
      </div>

      {me && <Colonist at={SPOT[spotFor(me.leading)]} id={me.id} slot={me.slot} leading={me.leading} time={me.time} testid={`visitor-${me.id}`} z={z} wrap={wrapCreature} />}
      {overlay}
    </div>
  );
}

/** A room you can walk to: a real button, glowing when the guide points at it, legible and saying why when closed. */
function Room({
  z,
  shop,
  testid,
  style,
  onTap,
  disabled,
  next,
  lock,
  className,
  children,
}: {
  z: Sizes;
  shop?: Shop;
  testid: string;
  style: CSSProperties;
  onTap?: (() => void) | undefined;
  disabled: boolean;
  next: boolean;
  lock?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  // A room with its own tap is a button; the works holds its own fit buttons, so it is a plain container.
  const Tag = onTap ? 'button' : 'div';
  const glow = next && !disabled;
  return (
    <Tag
      {...(onTap ? { type: 'button' as const, ...(shop ? { 'data-shop': shop } : {}), onClick: onTap, disabled } : { 'aria-disabled': disabled })}
      className={cx(
        'group absolute flex flex-col overflow-hidden rounded-panel border text-center transition-[opacity,filter,box-shadow]',
        disabled ? (lock !== undefined ? 'border-holo-faint opacity-75 saturate-[0.6]' : 'border-holo-faint opacity-45') : 'border-holo-line enabled:hover:border-holo',
        glow && 'z-[1] border-2 border-holo animate-[store-beckon_1.6s_ease-in-out_infinite]',
        className,
      )}
      style={style}
      data-testid={testid}
      {...(glow ? { 'data-next': true } : {})}
    >
      {children}
      {glow && (
        <span className="absolute left-1/2 top-1 z-[2] -translate-x-1/2 rounded-full bg-holo px-2 font-mono text-[10px] font-bold leading-4 text-on-holo shadow-glow" data-testid="tap-here">
          TAP
        </span>
      )}
      {disabled && lock && (
        <span className={cx('shrink-0 bg-void/60 px-1 font-mono uppercase leading-tight text-ink-2', z.lock)} data-lock>
          {lock}
        </span>
      )}
    </Tag>
  );
}

/** A scalloped awning in a colour. */
function Awning({ color }: { color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 60 10" preserveAspectRatio="none" className="h-[16%] min-h-3 w-full shrink-0">
      <path d="M0 0 H60 V5 Q57.5 10 55 5 Q52.5 10 50 5 Q47.5 10 45 5 Q42.5 10 40 5 Q37.5 10 35 5 Q32.5 10 30 5 Q27.5 10 25 5 Q22.5 10 20 5 Q17.5 10 15 5 Q12.5 10 10 5 Q7.5 10 5 5 Q2.5 10 0 5 Z" fill={color} />
      <path d="M10 0 V5 M20 0 V5 M30 0 V5 M40 0 V5 M50 0 V5" stroke="var(--color-awning-stripe)" strokeOpacity={0.18} strokeWidth={4} />
    </svg>
  );
}

/** An airlock door out to the colony, standing across the walkway: placed in % of the bottom row it sits in. */
function Door({ side, onTap, next, z }: { side: 'L' | 'R'; onTap: (() => void) | undefined; next: boolean; z: Sizes }) {
  const Tag = onTap ? 'button' : 'div';
  const rowH = BOT.y1 - BOT.y0;
  return (
    <Tag
      {...(onTap ? { type: 'button' as const, onClick: onTap } : {})}
      className={cx(
        'absolute flex w-[7%] flex-col items-center justify-center gap-1 rounded-panel border-2 border-dashed border-holo-line bg-void/60 text-holo enabled:hover:bg-holo-soft',
        side === 'L' ? 'left-[0.6%]' : 'right-[0.6%]',
        next && 'z-[1] border-solid border-holo bg-holo-soft animate-[store-beckon_1.6s_ease-in-out_infinite]',
      )}
      style={{ top: `${((DOOR.y0 - BOT.y0) / rowH) * 100}%`, height: `${((DOOR.y1 - DOOR.y0) / rowH) * 100}%` }}
      aria-label="Out to the colony"
      data-testid={`door-${side}`}
      {...(next ? { 'data-next': true } : {})}
    >
      <span className={cx('font-display font-bold', z.door)}>{side === 'L' ? '←' : '→'}</span>
      <span className={cx('font-mono font-bold leading-tight [writing-mode:vertical-rl]', z.doorNote)}>TO THE COLONY</span>
    </Tag>
  );
}

/**
 * Your colonist on the floor with your time bar, leading your MULE (the character, not the glyph). Before R1 it
 * stands at the room it used; it never walks, so the waddle and the MULE's walk cycle (C14) do not play yet.
 */
function Colonist({ at, id, slot, leading, time, testid, z, wrap = (_, c) => c }: { at: { x: number; y: number }; id: string; slot: Slot; leading: Leading; time: number; testid: string; z: Sizes; wrap?: CreatureWrap | undefined }) {
  const species = useSeatSpecies(slot);
  const left = at.x > 50;
  return (
    <div className="pointer-events-none absolute z-[3] flex -translate-x-1/2 -translate-y-[80%] flex-col items-center" style={{ left: `${at.x}%`, top: `${at.y}%` }} data-testid={testid}>
      <span className={cx('mb-0.5 overflow-hidden rounded-full bg-void/70', z.bar)}>
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, time)) * 100}%`, background: SLOT_COLOR[slot] }} />
      </span>
      <span className={cx('flex items-end', left && 'flex-row-reverse')}>
        {wrap(
          id,
          <span className="rounded-full ring-2 ring-holo ring-offset-1 ring-offset-table">
            <Creature species={species} color={SLOT_COLOR[slot]} size={z.creature} />
          </span>,
        )}
        {leading && <Mule size={z.led} state="idle" good={leading === 'empty' ? null : leading} owner={slot} facing={left ? 'left' : 'right'} />}
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
