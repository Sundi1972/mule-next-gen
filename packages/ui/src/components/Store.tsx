import { DEV_STEER, HALL, WOLVES, type HallPlace, type HallRect } from '@mule/engine';
import type { CSSProperties, ReactNode } from 'react';
import { ConditionTag, ThoughtBubble, type Condition, type FoodEaten, type PaceRule } from './Condition';
import { Creature } from './Creature';
import { GoodIcon } from './GoodIcon';
import { cycleSeconds, motionOf, type GaitInput } from './motion/gait';
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

/** The works' three fitting bays, as the hall labels them on a wide screen. */
const FIT_LABEL: Record<FactoryGood, string> = { alloy: 'Smelter', electronics: 'Electronics', medicine: 'Medicine lab' };

/*
 * The hall's geometry is the engine's one plan (spec C2, floor/hall.ts): the floor's walls and reach read the same
 * rooms this draws, so a colonist steered in the store stands where the drawing says it is. Nothing here restates it.
 */

/** A box of the plan in % of the hall, the units StoreInterior lays out in. */
const pctOf = (r: HallRect): HallRect => ({ x0: (r.x0 / HALL.w) * 100, y0: (r.y0 / HALL.h) * 100, x1: (r.x1 / HALL.w) * 100, y1: (r.y1 / HALL.h) * 100 });
/** A % for a style, rounded so the plan's float noise (9.399999… for 9.4) never reaches the markup. */
const pct = (v: number) => `${Math.round(v * 1e4) / 1e4}%`;

/** The two rows' bands: the shopfronts' along the back wall and the front row's, each as deep as its rooms. */
const TOP = pctOf(HALL.rooms.food);
const BOT = pctOf(HALL.rooms.works);

/** A room's box in % of its row: across the hall's full width, down the row's band. */
const inRow = (r: HallRect, row: HallRect): CSSProperties => {
  const b = pctOf(r);
  const deep = row.y1 - row.y0;
  return { left: pct(b.x0), width: pct(b.x1 - b.x0), top: pct(((b.y0 - row.y0) / deep) * 100), height: pct(((b.y1 - b.y0) / deep) * 100) };
};
const band = (b: HallRect): CSSProperties => ({ top: pct(b.y0), height: pct(b.y1 - b.y0) });
/** A bay's column in % of the works: the plan cuts the works across into its bays. */
const inWorks = (g: FactoryGood): CSSProperties => {
  const works = pctOf(HALL.rooms.works);
  const b = pctOf(HALL.bays[g]);
  const wide = works.x1 - works.x0;
  return { left: pct(((b.x0 - works.x0) / wide) * 100), width: pct(((b.x1 - b.x0) / wide) * 100) };
};

/** Before R1 a tap acts at once: you stand at the place you used last. In the left door with no MULE, at the corral with an empty one, at its outfitter or its bay once fitted. */
function placeOf(leading: Leading): HallPlace {
  if (leading === null) return 'doorL';
  if (leading === 'empty') return 'corral';
  return leading;
}

/**
 * Type and creature sizes: the phone's, the big screen's side panel, and the shell's wide layout. The phone's type is
 * never under 10 px, and its doors and fitting bays are at least 32 px wide on a 667 px phone (B-AC-11).
 */
const SIZES = {
  phone: { lock: 'px-0.5 py-px text-[10px]', name: 'text-[11px]', price: 'text-[10px]', small: 'text-[10px]', icon: 20, iconPad: 'p-1', fit: 16, fits: 'p-px', bay: 'p-px', mule: 30, creature: 28, led: 32, sign: 'h-5 w-5', chimney: 'h-3 w-3', caps: 'text-[10px]!', door: 'text-base', doorBox: 'min-w-8', doorNote: 'text-[10px]' },
  tv: { lock: 'px-1 py-0.5 text-[10px]', name: 'text-sm', price: 'text-sm', small: 'text-xs', icon: 30, iconPad: 'p-1.5', fit: 22, fits: 'p-0.5', bay: 'p-0.5', mule: 44, creature: 40, led: 44, sign: 'h-7 w-7', chimney: 'h-4 w-4', caps: 'text-xs!', door: 'text-xl', doorBox: '', doorNote: 'text-[10px]' },
  wide: { lock: 'px-1 py-0.5 text-[11px]', name: 'text-lg', price: 'text-base', small: 'text-sm', icon: 40, iconPad: 'p-1.5', fit: 30, fits: 'p-0.5', bay: 'p-0.5', mule: 84, creature: 52, led: 60, sign: 'h-10 w-10', chimney: 'h-5 w-5', caps: 'text-xs!', door: 'text-3xl', doorBox: '', doorNote: 'text-xs' },
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
  me?: Visitor;
  /** The engine's DEV_WALK: with it, your colonist shows its condition. */
  paceRule?: PaceRule;
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
export function StoreInterior({ mules, mulePrice, pubPayout, prices, open, onShop, onDoor, next = [], locks, me, paceRule, overlay, tv = false, wide = false, wrapCreature }: StoreInteriorProps) {
  const usable = (s: Shop) => !open || open.includes(s);
  const tap = (s: Shop) => (onShop ? () => onShop(s) : undefined);
  const cost = (s: Shop) => (prices[s] === undefined ? null : `${prices[s]} cr`);
  const glows = (r: StoreRoom) => next.includes(r);
  const size = wide ? 'wide' : tv ? 'tv' : 'phone';
  const z = SIZES[size];
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
      {/* The back wall and the walkway are decoration, not floor: where feet may stand is HALL.floor, not these. */}
      {/* The back wall behind the shopfronts. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[42%] border-b-2 border-holo-line bg-raised/50" />
      {/* The walkway between the rows. */}
      <div aria-hidden className="absolute inset-x-[8%] top-[43%] h-[14%] rounded-full border border-dashed border-holo-faint bg-panel/30" />

      <div className="absolute inset-x-0" style={band(TOP)} data-testid="row-outfitters">
        {OUTFIT_GOODS.map((g) => (
          <Room z={z}
            key={g}
            shop={g}
            testid={`booth-${g}`}
            style={inRow(HALL.rooms[g], TOP)}
            onTap={tap(g)}
            disabled={!usable(g)}
            next={glows(g)}
            lock={locks?.[g]}
            className="bg-panel"
          >
            <Awning color={`var(--color-g-${g})`} />
            <span className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1">
              <span className={cx('grid place-items-center rounded-full', z.iconPad)} style={{ background: `color-mix(in srgb, var(--color-g-${g}) 18%, transparent)`, boxShadow: `0 0 18px color-mix(in srgb, var(--color-g-${g}) 35%, transparent)` }}>
                <GoodIcon good={g} size={z.icon} />
              </span>
              <span className={cx('font-display font-semibold leading-tight', z.name)}>{GOOD_NAME[g]}</span>
              {cost(g) && (
                <span data-num className={cx(price, 'whitespace-nowrap rounded-chip bg-void/50 px-1.5 text-ink')}>
                  {cost(g)}
                </span>
              )}
            </span>
          </Room>
        ))}
      </div>

      <div className="absolute inset-x-0" style={band(BOT)} data-testid="row-services">
        <Door side="L" box={HALL.doors.doorL} onTap={onDoor} next={glows('doorL')} z={z} />

        {/* The works: three fitting bays under a chimney. */}
        <Room z={z} testid="booth-works" style={inRow(HALL.rooms.works, BOT)} disabled={!worksOpen} next={glows('works')} lock={locks?.works} className="bg-panel">
          <span className="flex items-center justify-center gap-1.5 border-b border-holo-faint bg-raised/60 py-0.5">
            <svg aria-hidden viewBox="0 0 16 16" className={z.chimney}>
              <path d="M2 14V7l4 2V7l4 2V3h4v11z" fill="var(--color-ink-3)" />
            </svg>
            <span className={cx('label-caps', z.caps)}>The works · factory fits</span>
          </span>
          {/* The bays stand where the plan cuts the works; the body's padding and each column's make the gaps between them. */}
          <span className={cx('flex flex-1', z.fits)}>
            <span className="relative flex-1">
              {FACTORY_GOODS.map((g) => (
                <span key={g} className={cx('absolute inset-y-0 flex', z.bay)} style={inWorks(g)} data-bay={g}>
                  <button
                    type="button"
                    disabled={!onShop || !usable(g)}
                    onClick={tap(g)}
                    aria-label={`${FACTORY_NAME[g]} fit`}
                    className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-control border border-holo-faint bg-raised enabled:hover:border-holo"
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
                </span>
              ))}
            </span>
          </span>
        </Room>

        {/* The green belt: a little greenhouse. */}
        <Room z={z} shop="greenBelt" testid="booth-greenBelt" style={inRow(HALL.rooms.greenBelt, BOT)} onTap={tap('greenBelt')} disabled={!usable('greenBelt')} next={glows('greenBelt')} lock={locks?.greenBelt} className="bg-ok/10">
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
        <Room z={z} shop="corral" testid="booth-corral" style={inRow(HALL.rooms.corral, BOT)} onTap={tap('corral')} disabled={!usable('corral') || mules === 0} next={glows('corral')} lock={locks?.corral} className="bg-holo-soft">
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
          style={{ ...inRow(HALL.rooms.pub, BOT), background: 'radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--color-warn) 30%, transparent), color-mix(in srgb, var(--color-warn) 8%, var(--color-panel)) 70%)' }}
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

        <Door side="R" box={HALL.doors.doorR} onTap={onDoor} next={glows('doorR')} z={z} />
      </div>

      {me && <Colonist me={me} at={standing(me)} paceRule={paceRule} size={size} z={z} wrap={wrapCreature} />}
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
        <span className={cx('shrink-0 bg-void/60 font-mono uppercase leading-tight text-ink-2', z.lock)} data-lock>
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

/**
 * An airlock door out to the colony, standing across the walkway: its frame from the plan, placed in % of the bottom
 * row it sits in. Each is held from its own side of the hall, so the phone's minimum width grows it inwards.
 */
function Door({ side, box, onTap, next, z }: { side: 'L' | 'R'; box: HallRect; onTap: (() => void) | undefined; next: boolean; z: Sizes }) {
  const Tag = onTap ? 'button' : 'div';
  const at = inRow(box, BOT);
  return (
    <Tag
      {...(onTap ? { type: 'button' as const, onClick: onTap } : {})}
      className={cx(
        'absolute flex flex-col items-center justify-center gap-1 rounded-panel border-2 border-dashed border-holo-line bg-void/60 text-holo enabled:hover:bg-holo-soft',
        z.doorBox,
        next && 'z-[1] border-solid border-holo bg-holo-soft animate-[store-beckon_1.6s_ease-in-out_infinite]',
      )}
      style={{ ...(side === 'L' ? { left: at.left } : { right: pct(100 - pctOf(box).x1) }), width: at.width, top: at.top, height: at.height }}
      aria-label="Out to the colony"
      data-testid={`door-${side}`}
      {...(next ? { 'data-next': true } : {})}
    >
      <span className={cx('font-display font-bold', z.door)}>{side === 'L' ? '←' : '→'}</span>
      <span className={cx('font-mono font-bold leading-tight [writing-mode:vertical-rl]', z.doorNote)}>TO THE COLONY</span>
    </Tag>
  );
}

/** Your colonist in the hall: where it stands is its own position, or else the place its MULE says it used last. */
export interface Visitor {
  id: string;
  slot: Slot;
  leading: Leading;
  /** A free position on the hall's plan, in hall units (HALL.w across, HALL.h down). Without it: its place's spot. */
  x?: number;
  y?: number;
  /** How hunger and sickness slow it this month (PlayerView.condition). */
  condition?: Condition | null;
  /** What you ate and needed, for the rule a long press on your tag shows. */
  food?: FoodEaten;
  /** Walking: it strides at its condition's pace (gait.ts), and its MULE walks in step. */
  moving?: boolean;
  /** When the one clock starts, as a performance.now() time: the thought bubble shows then. */
  clockStartsAt?: number;
}

/** Where a visitor stands, in % of the hall: its free position, or its place's spot on the plan. */
function standing(me: Visitor): { x: number; y: number } {
  const p = me.x !== undefined && me.y !== undefined ? { x: me.x, y: me.y } : HALL.spots[placeOf(me.leading)];
  return { x: (p.x / HALL.w) * 100, y: (p.y / HALL.h) * 100 };
}

/**
 * Your colonist on the floor, leading your MULE, with its condition at its shoulder (AM-14). It walks with #195's gait
 * (spec AM-16): its stride from its pace and the lead on the hall's flat floor, and its MULE steps on the same stride.
 * Standing, it breathes on the gait's idle cycle as it does on the map (WS6's variant A); reduced motion is Creature's
 * and Mule's own.
 */
function Colonist({ me, at, paceRule, size, z, wrap = (_, c) => c }: { me: Visitor; at: { x: number; y: number }; paceRule: PaceRule | undefined; size: keyof typeof SIZES; z: Sizes; wrap?: CreatureWrap | undefined }) {
  const species = useSeatSpecies(me.slot);
  const left = at.x > 50;
  const condition = me.condition ?? null;
  // The hall has no terrain, encounters or bites: those are the map's. The balance's paces are the engine's.
  const gait: GaitInput = {
    moving: !!me.moving,
    encounter: null,
    pace: condition?.conditionPace ?? 1,
    terrain: 1,
    lead: !!me.leading,
    bitten: false,
    leadPace: DEV_STEER.leadPace,
    bittenPace: WOLVES.bittenPace,
    lungeSeconds: WOLVES.lungeEverySeconds,
  };
  const stride = cycleSeconds(gait);
  const facing = left ? 'left' : 'right';
  return (
    <div className="pointer-events-none absolute z-[3] flex -translate-x-1/2 -translate-y-[80%] flex-col items-center" style={{ left: `${at.x}%`, top: `${at.y}%` }} data-testid={`visitor-${me.id}`}>
      <span className={cx('flex items-end', left && 'flex-row-reverse')}>
        {wrap(
          me.id,
          <span className="relative rounded-full ring-2 ring-holo ring-offset-1 ring-offset-table">
          {/* Always in motion, idle while standing: the wrappers stay mounted, so a start or stop never remounts the drawing. */}
          <Creature species={species} color={SLOT_COLOR[me.slot]} size={z.creature} motion={motionOf(gait)} cycle={stride} facing={facing} />
          {paceRule && (
            <>
              <ConditionTag id={me.id} condition={condition} rule={paceRule} food={me.food} size={size} explain />
              <ThoughtBubble id={me.id} condition={condition} rule={paceRule} moving={!!me.moving} clockStartsAt={me.clockStartsAt} size={size} edge={at.x < 15 ? 'left' : at.x > 85 ? 'right' : undefined} />
            </>
          )}
          </span>,
        )}
        {me.leading && <Mule size={z.led} state={me.moving ? 'walk' : 'idle'} good={me.leading === 'empty' ? null : me.leading} owner={me.slot} facing={facing} cycle={stride} />}
      </span>
    </div>
  );
}

/** Development time left, and how well fed the colonist is: Food sets how fast it walks, never how long it has. */
export function FoodTime({ seconds, total, food, need, note }: { seconds: number; total: number; food: number; need: number; note?: ReactNode }) {
  const full = food >= need;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2.5 overflow-hidden rounded-full bg-raised">
        <div className={cx('absolute inset-y-0 left-0 rounded-full', seconds < 10 ? 'bg-alert' : 'bg-holo')} style={{ width: `${Math.max(0, Math.min(1, seconds / total)) * 100}%` }} />
      </div>
      <span className="text-xs text-ink-2">
        {note ?? (full ? `Fed: you had ${food} Food and needed ${need}.` : `Short of Food (${food} of ${need}), so you walk slower.`)}
      </span>
    </div>
  );
}
