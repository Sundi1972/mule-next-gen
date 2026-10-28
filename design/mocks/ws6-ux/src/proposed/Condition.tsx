import { cx, PlayerMark, SLOT_COLOR, TimeBar, type Slot } from '@mule/ui';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { slotOf } from '../../../../../apps/web/src/game/derive';
import { VIEW } from '../fixture';
import { useChat } from './Chat';

/**
 * One clock for everyone, and how you feel (Heiko 2026-10-28: "Then we only have one global time bar for all
 * users, which is much better"; "A hungry settler needs to get a small hungry tag or icon or so that it is
 * visible (we can also give him a thought bubble showing hunger)").
 *
 * Development no longer gives each player their own time: everyone has the same 50 s. Hunger and sickness
 * make your colonist WALK slower instead, so they must be visible on the colonist wherever it walks:
 * - A: a small tag at the colonist's shoulder, always on while hungry or sick. Hunger is an amber bowl that
 *   turns red when you ate less than half your Food; sickness is a pink cross. Different shape AND colour.
 * - B: A, plus a thought bubble (a cloud with trailing puffs, never the speech bubble's box and tail) at the
 *   moments it explains something: when the clock starts, and when the colonist sets off on a walk.
 *
 * GRAFT TARGET: new packages/ui/src/components/Condition.tsx (ConditionTag, ThoughtBubble; WS4 reviews);
 * the clock is @mule/ui's TimeBar, the auction's clock, reused as is.
 * DS-GAP: the bowl and cross glyphs are new; @mule/ui has no hunger or sickness icon.
 */

/**
 * STAND-IN for config.ts DEV_WALK (WS1, R1), until it lands: the mock reads these as the screens will read config, never
 * a number of their own. The pace rule is Heiko's (2026-10-28): it falls linearly from 100% fed to 20% with no Food, and
 * sickness halves it (5/10 Food 60%, 2/10 36%, sick and fed 50%, 0/10 and sick 10%). WS1 exports hungerShare and hungerPace.
 */
export const DEV_WALK_STAND_IN = {
  /** Seconds a step on the map takes at full pace. */
  tileSeconds: 0.4,
  /** Seconds one walk across the store floor takes at full pace. */
  hallSeconds: 1,
  /** A Zipwing's pace. */
  zipwingPace: 1.5,
  /** Pace with no Food at all; it rises linearly to 1 with the share of Food eaten. */
  paceAtNoFood: 0.2,
  /** Sickness multiplies the pace by this. */
  sickPace: 0.5,
  /** The hunger levels, by the share of the month's Food missing: peckish below the first, starving from the second. */
  hungerLevels: { hungryFrom: 0.3, starvingFrom: 0.7 },
};

/** How long a thought bubble shows (display timing, not balance). */
export const THOUGHT_MS = { atClockStart: 3000, onSetOff: 2000, quiet: 8000 };

/**
 * Why a colonist is sick (Heiko 2026-10-28: sickness is a monthly chance, likelier in dirty air, much likelier for a
 * big polluter). STAND-IN for the reason field WS1 exposes in R1.
 */
export type SickBecause = { kind: 'air' } | { kind: 'polluter'; what: string };
export type Condition = { ate: number; need: number; sick: boolean; because?: SickBecause };
export const FED: Condition = { ate: 1, need: 1, sick: false };

/** The share of the month's Food the colonist went without, 0 (fed) to 1 (none): WS1's hungerShare. */
export const shortfall = (c: Condition) => (c.need > 0 ? Math.max(0, Math.min(1, 1 - c.ate / c.need)) : 0);

/** 0 fed, 1 peckish, 2 hungry, 3 starving, by DEV_WALK's hungerLevels. */
export type HungerLevel = 0 | 1 | 2 | 3;
export function hungerLevel(c: Condition): HungerLevel {
  const s = shortfall(c);
  const { hungryFrom, starvingFrom } = DEV_WALK_STAND_IN.hungerLevels;
  return s === 0 ? 0 : s < hungryFrom ? 1 : s < starvingFrom ? 2 : 3;
}
export const HUNGER_WORD = ['Fed', 'Peckish', 'Hungry', 'Starving'] as const;

/** The colonist's pace this month, 1 = full: WS1's hungerPace, then halved when sick (species aside). */
export function paceOf(c: Condition): number {
  const hunger = 1 - (1 - DEV_WALK_STAND_IN.paceAtNoFood) * shortfall(c);
  return hunger * (c.sick ? DEV_WALK_STAND_IN.sickPace : 1);
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** What the colonist feels, as a word: "Hungry", "Sick", "Starving and sick". */
export function feeling(c: Condition): string {
  const level = hungerLevel(c);
  return level > 0 && c.sick ? `${HUNGER_WORD[level]} and sick` : level > 0 ? HUNGER_WORD[level] : c.sick ? 'Sick' : 'Fed';
}

/** The reason line for a sick colonist, from WS1's reason field: the colony's air, or your own pollution. */
export function sickReason(c: Condition): string {
  return c.because?.kind === 'polluter' ? `Sick: your ${c.because.what} fouled the air.` : 'Sick: the air is toxic.';
}

/** Heiko's plain rule, in his words, from config: wherever a screen explains the slowdown. */
export function paceRule(c: Condition): string[] {
  const points = Math.round((1 - DEV_WALK_STAND_IN.paceAtNoFood) * 10);
  return [
    ...(hungerLevel(c) > 0 ? [`You ate ${c.ate} of the ${c.need} Food you need. You lose ${points} points of walking speed per 10% of Food missing.`] : []),
    ...(c.sick ? [`${sickReason(c)} Sickness halves your walking speed.`] : []),
  ];
}

/** The one line that says what your condition does, for the rail and the start card: "Hungry: 60% pace". */
export function paceLine(c: Condition): { title: string; detail: string; tone: 'ok' | 'warn' | 'alert' } {
  const level = hungerLevel(c);
  if (level === 0 && !c.sick) return { title: 'Fed: full pace', detail: `You ate the ${c.need} Food you need.`, tone: 'ok' };
  return {
    title: `${feeling(c)}: ${pct(paceOf(c))} pace`,
    detail: `${paceRule(c).join(' ')} Everyone has the same time; you just cover less ground.`,
    tone: level === 3 || c.sick ? 'alert' : 'warn',
  };
}

/** Each seat's condition this month (fixture). Public: everyone sees the slow walk, so the tag says why. */
const ConditionContext = createContext<Record<string, Condition>>({});
export const ConditionProvider = ConditionContext.Provider;
export const useCondition = (id: string): Condition => useContext(ConditionContext)[id] ?? FED;

/** Which marker the screens draw: A (the tag) or B (the tag and a thought bubble). */
const VariantContext = createContext<'A' | 'B'>('B');
export const ConditionVariant = VariantContext.Provider;
export const useConditionVariant = () => useContext(VariantContext);

/** A bowl whose contents show how much of the month's Food was eaten: the hunger level reads even without colour. */
function Bowl({ size, eaten = 0 }: { size: number; eaten?: number }) {
  const top = 7.5 + 6 * (1 - eaten);
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden>
      <path d="M2 7.5h12a6 6 0 0 1-12 0Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {eaten > 0 && (
        <clipPath id={`bowl-${size}-${Math.round(eaten * 10)}`}>
          <rect x="0" y={top} width="16" height="16" />
        </clipPath>
      )}
      {eaten > 0 && <path d="M2 7.5h12a6 6 0 0 1-12 0Z" fill="currentColor" clipPath={`url(#bowl-${size}-${Math.round(eaten * 10)})`} />}
    </svg>
  );
}

function Cross({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden>
      <path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4Z" fill="currentColor" />
    </svg>
  );
}

/** A tag's chip: hunger and sickness are one family (the same chip, border and size), told apart by glyph and colour. */
const CHIP = 'flex items-center justify-center rounded-[5px] border border-void/60 shadow-chip';

/**
 * The tag at a colonist's shoulder (variant A and B): nothing when fed and well. Hunger has three levels, by how much
 * Food is missing: peckish (an amber outline), hungry (filled amber), starving (red, pulsing); the bowl shows how much
 * was eaten. Sickness is a pink cross on the same chip. On your own colonist, press and hold for the rule.
 */
export function ConditionTag({ id, size = 'phone', inline = false, explain = false }: { id: string; size?: 'phone' | 'tv' | 'wide'; inline?: boolean; explain?: boolean }) {
  const c = useCondition(id);
  const level = hungerLevel(c);
  const [open, setOpen] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (level === 0 && !c.sick) return null;
  const g = size === 'tv' ? 18 : size === 'wide' ? 16 : 10;
  const box = g + 4;
  const press = explain
    ? {
        onPointerDown: () => (hold.current = setTimeout(() => setOpen(true), 400)),
        onPointerUp: () => hold.current && clearTimeout(hold.current),
        onPointerLeave: () => {
          if (hold.current) clearTimeout(hold.current);
          setOpen(false);
        },
      }
    : {};
  return (
    <span
      className={cx('z-20 flex gap-0.5', inline ? 'items-center' : 'absolute -right-1 -top-1', explain ? 'pointer-events-auto cursor-help touch-none' : 'pointer-events-none')}
      data-testid={`condition-${id}`}
      data-hunger={level}
      data-sick={c.sick || undefined}
      aria-label={`${feeling(c)}: ${pct(paceOf(c))} pace`}
      {...press}
    >
      {level > 0 && (
        <span
          className={cx(
            CHIP,
            level === 1 && 'border-warn bg-panel text-warn',
            level === 2 && 'bg-warn text-void',
            level === 3 && 'bg-alert text-alert-ink motion-safe:animate-pulse',
          )}
          style={{ width: box, height: box }}
          data-testid={`hunger-${id}`}
        >
          <Bowl size={g} eaten={1 - shortfall(c)} />
        </span>
      )}
      {c.sick && (
        <span className={cx(CHIP, 'text-void')} style={{ width: box, height: box, background: 'var(--color-g-medicine)' }} data-testid={`sick-${id}`}>
          <Cross size={g - 2} />
        </span>
      )}
      {open && (
        <span className="absolute bottom-full left-1/2 z-40 mb-2 flex w-56 -translate-x-1/2 flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2 text-left text-xs not-italic text-ink shadow-chip" data-testid={`rule-${id}`} role="tooltip">
          <strong className="font-display text-sm">{feeling(c)}: {pct(paceOf(c))} pace</strong>
          {paceRule(c).map((r) => (
            <span key={r} className="text-ink-2">
              {r}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * When the thought shows: for THOUGHT_MS.atClockStart once the clock starts, and for THOUGHT_MS.onSetOff each time the
 * colonist sets off on a walk, at most once every THOUGHT_MS.quiet. Never while the colonist is speaking: a chat line
 * owns the space above the head (one bubble per creature).
 */
function useThought(on: boolean, moving: boolean, clockFromMs: number): boolean {
  const [until, setUntil] = useState(0);
  const last = useRef(-Infinity);
  const wasMoving = useRef(moving);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => {
      last.current = performance.now();
      setUntil(performance.now() + THOUGHT_MS.atClockStart);
    }, clockFromMs);
    return () => clearTimeout(t);
  }, [on, clockFromMs]);
  useEffect(() => {
    if (on && moving && !wasMoving.current && performance.now() - last.current > THOUGHT_MS.quiet) {
      last.current = performance.now();
      setUntil(performance.now() + THOUGHT_MS.onSetOff);
    }
    wasMoving.current = moving;
  }, [on, moving]);
  const [, tick] = useState(0);
  useEffect(() => {
    if (until <= performance.now()) return;
    const t = setTimeout(() => tick((x) => x + 1), until - performance.now() + 20);
    return () => clearTimeout(t);
  }, [until]);
  return until > performance.now();
}

/** Variant B's thought: a cloud above the head with two puffs trailing down to it, in ink, not the seat's colour. */
export function ThoughtBubble({
  id,
  moving = false,
  clockFromMs = 2200,
  size = 'phone',
  edge,
}: {
  id: string;
  moving?: boolean;
  clockFromMs?: number;
  size?: 'phone' | 'tv' | 'wide';
  /** A colonist near the stage's edge: the cloud grows inward from that side instead of centring, so it stays on stage. */
  edge?: 'left' | 'right' | undefined;
}) {
  const c = useCondition(id);
  const variant = useConditionVariant();
  const speaking = !!useChat()?.bubbles[id];
  const level = hungerLevel(c);
  const showing = useThought(variant === 'B' && (level > 0 || c.sick), moving, clockFromMs);
  if (!showing || speaking) return null;
  const big = size !== 'phone';
  const g = size === 'tv' ? 22 : big ? 18 : 12;
  return (
    <span
      className={cx(
        'pointer-events-none absolute bottom-full z-30 mb-1 flex flex-col animate-[badge-in_0.3s_ease-out]',
        edge === 'left' ? 'left-0 items-start' : edge === 'right' ? 'right-0 items-end' : 'left-1/2 -translate-x-1/2 items-center',
      )}
      data-testid={`thought-${id}`}
      role="status"
    >
      <span className={cx('flex w-max items-center gap-1 rounded-full border-2 border-dotted border-ink-2 bg-raised font-display italic text-ink', size === 'tv' ? 'px-3 py-1 text-lg' : big ? 'px-2.5 py-0.5 text-sm' : 'px-1.5 py-0.5 text-[10px]')}>
        {level > 0 && (
          <span className={level === 3 ? 'text-alert' : 'text-warn'}>
            <Bowl size={g} eaten={1 - shortfall(c)} />
          </span>
        )}
        {c.sick && (
          <span style={{ color: 'var(--color-g-medicine)' }}>
            <Cross size={g - 2} />
          </span>
        )}
        <span>
          {feeling(c)}… <span className="not-italic font-mono font-bold">{pct(paceOf(c))} pace</span>
        </span>
      </span>
      <span className={cx('mt-0.5 rounded-full border-2 border-dotted border-ink-2 bg-raised', big ? 'h-2.5 w-2.5' : 'h-1.5 w-1.5', edge && (big ? 'mx-5' : 'mx-3'))} />
      <span className={cx('mt-0.5 rounded-full border border-dotted border-ink-2 bg-raised', big ? 'h-1.5 w-1.5' : 'h-1 w-1', edge && (big ? 'mx-6' : 'mx-3.5'))} />
    </span>
  );
}

/** The one development clock, the same on every screen: the auction's TimeBar, labelled as everyone's. */
export function SharedClock({ seconds, total, size = 'phone' }: { seconds: number; total: number; size?: 'phone' | 'tv' }) {
  return (
    <div className="flex flex-col gap-1" data-testid="shared-clock">
      <span className={cx('label-caps', size === 'tv' ? 'text-base!' : 'text-[10px]!')}>Everyone's time · one clock</span>
      <TimeBar seconds={seconds} total={total} size={size} />
    </div>
  );
}

/** Your condition in the rail: what it does to you, in one line; why, where there is room. */
export function YourPace({ id }: { id: string }) {
  const c = useCondition(id);
  const l = paceLine(c);
  return (
    <div className="flex flex-col gap-0.5" data-testid="your-pace" data-tone={l.tone}>
      <span className={cx('font-display text-sm font-semibold leading-tight @min-[1100px]/shell:text-lg', l.tone === 'ok' ? 'text-ok' : l.tone === 'warn' ? 'text-warn' : 'text-alert')}>{l.title}</span>
      {/* A sideways phone's rail has room for the line, not the why: the why shows from a laptop up, and on the start card. */}
      <span className="hidden text-sm text-ink-2 @min-[1100px]/shell:block">{l.detail}</span>
    </div>
  );
}

/** The TV's list beside the map: no per-player time any more, just how fast each colonist walks this month, and why. */
export function PaceList() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5" data-testid="pace-list">
      <span className="label-caps col-span-2">Pace this month · set by Food and health</span>
      {VIEW.players.map((p) => (
        <PaceRow key={p.id} id={p.id} name={p.name} slot={(slotOf(VIEW, p.id) ?? 0) as Slot} />
      ))}
    </div>
  );
}

function PaceRow({ id, name, slot }: { id: string; name: string; slot: Slot }) {
  const c = useCondition(id);
  const pace = paceOf(c);
  const level = hungerLevel(c);
  return (
    <div className="flex items-center gap-2" data-testid={`pace-${id}`}>
      <PlayerMark slot={slot} size={18} glow={false} />
      <span className="w-12 truncate text-sm font-semibold">{name}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-raised">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(pace), background: SLOT_COLOR[slot] }} />
      </div>
      <span data-num className={cx('w-10 text-right font-mono text-sm', pace < 1 ? (level === 3 || c.sick ? 'text-alert' : 'text-warn') : 'text-ink-2')}>
        {pct(pace)}
      </span>
      <span className="flex w-9 justify-start">
        <ConditionTag id={id} size="phone" inline />
      </span>
    </div>
  );
}
