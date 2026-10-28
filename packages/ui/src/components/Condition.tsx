import { useEffect, useId, useRef, useState } from 'react';
import { PlayerMark } from './PlayerMark';
import { TimeBar } from './TimeBar';
import { cx, SLOT_COLOR, type Slot } from './tokens';

/**
 * One development clock for everyone; hunger and sickness slow a colonist's walk instead (AM-14, variant B). Shown on
 * the colonist as a tag at its shoulder and a thought bubble, and as the pace in every label.
 */

/** A colonist's condition this month, as the view carries it (PlayerView.condition). */
export interface Condition {
  /** 0..1 of the month's Food held. */
  foodShare: number;
  sick: boolean;
  /** Why it is sick; null when well. */
  sickBecause?: SickBecause | null;
  /** Hunger × sickness, 1 is normal; species aside. */
  conditionPace: number;
}

/** The numbers behind the words: the engine's DEV_WALK. */
export interface PaceRule {
  hungerPaceMin: number;
  sickPace: number;
  hungerLevels: { hungryFrom: number; starvingFrom: number };
}

/** The Food a player ate this month and needed, for the words on their own screen. */
export interface FoodEaten {
  ate: number;
  need: number;
}

/** Why a colonist is sick: the colony's air, its own pollution, or plain chance. */
export type SickBecause = 'air' | 'pollution' | 'chance';

/** 0 fed, 1 peckish, 2 hungry, 3 starving. */
export type HungerLevel = 0 | 1 | 2 | 3;
export const HUNGER_WORD = ['Fed', 'Peckish', 'Hungry', 'Starving'] as const;

export type PaceTone = 'ok' | 'warn' | 'alert';
type TagSize = 'phone' | 'tv' | 'wide';

/** How long a thought bubble shows, in ms (display timing, not balance). */
export const THOUGHT_MS = { atClockStart: 3000, onSetOff: 2000, quiet: 8000 };

/** One waddle at full pace, in seconds. */
const WADDLE_SECONDS = 0.36;
/** How long a press on your own tag must last before the rule shows, in ms. */
const HOLD_MS = 400;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The hunger level from the share of the month's Food missing and the rule's hungerLevels. */
export function hungerLevel(c: Condition, rule: PaceRule): HungerLevel {
  const missing = 1 - c.foodShare;
  const { hungryFrom, starvingFrom } = rule.hungerLevels;
  return missing <= 0 ? 0 : missing < hungryFrom ? 1 : missing < starvingFrom ? 2 : 3;
}

/** What the colonist feels, as a word: "Fed", "Hungry", "Sick", "Starving and sick". */
export function feeling(c: Condition, rule: PaceRule): string {
  const level = hungerLevel(c, rule);
  if (!c.sick) return HUNGER_WORD[level];
  return level === 0 ? 'Sick' : `${HUNGER_WORD[level]} and sick`;
}

/** The sick line, from the reason the view gives; with none, it claims no cause. */
export function sickReason(because?: SickBecause | null): string {
  switch (because) {
    case 'air':
      return 'Sick: the air is toxic.';
    case 'pollution':
      return 'Sick: your own pollution fouled the air.';
    default:
      return 'Sick this month.';
  }
}

/** What hunger costs, its points from the rule's hungerPaceMin. */
export function hungerRule(rule: PaceRule): string {
  return `You lose ${Math.round((1 - rule.hungerPaceMin) * 10)} points of walking speed per 10% of Food missing.`;
}

/** What sickness costs. */
export function sickRule(rule: PaceRule): string {
  return rule.sickPace === 0.5 ? 'Sickness halves your walking speed.' : `Sickness slows you to ${pct(rule.sickPace)} of your walking speed.`;
}

/** Why the colonist walks slower, one sentence per cause: the long press, and the detail under a pace line. */
export function paceRule(c: Condition, rule: PaceRule, food?: FoodEaten): string[] {
  const ate = food ? `You ate ${food.ate} of the ${food.need} Food you need. ` : '';
  return [...(hungerLevel(c, rule) > 0 ? [`${ate}${hungerRule(rule)}`] : []), ...(c.sick ? [`${sickReason(c.sickBecause)} ${sickRule(rule)}`] : [])];
}

/** The one line that says what your condition does, for the rail and the start card: "Hungry: 60% pace". */
export function paceLine(c: Condition, rule: PaceRule, food: FoodEaten): { title: string; detail: string; tone: PaceTone } {
  const level = hungerLevel(c, rule);
  if (level === 0 && !c.sick) return { title: 'Fed: full pace', detail: `You ate the ${food.need} Food you need.`, tone: 'ok' };
  return {
    title: `${feeling(c, rule)}: ${pct(c.conditionPace)} pace`,
    detail: `${paceRule(c, rule, food).join(' ')} Everyone has the same time; you just cover less ground.`,
    tone: level === 3 || c.sick ? 'alert' : 'warn',
  };
}

/** Seconds one waddle takes at this pace. */
export function waddleSeconds(pace: number): number {
  return WADDLE_SECONDS / pace;
}

/** A bowl filled to how much of the month's Food was eaten: the level reads without colour. */
function Bowl({ size, eaten }: { size: number; eaten: number }) {
  const clip = useId();
  const bowl = 'M2 7.5h12a6 6 0 0 1-12 0Z';
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden>
      <path d={bowl} fill="none" stroke="currentColor" strokeWidth="1.6" />
      {eaten > 0 && (
        <>
          <clipPath id={clip}>
            <rect x="0" y={7.5 + 6 * (1 - eaten)} width="16" height="16" />
          </clipPath>
          <path d={bowl} fill="currentColor" clipPath={`url(#${clip})`} />
        </>
      )}
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

/** Hunger and sickness share one chip, told apart by glyph and colour. */
const CHIP = 'flex items-center justify-center rounded-[5px] border border-void/60 shadow-chip';

/**
 * The tag at a colonist's shoulder: nothing when fed and well. Hunger is a bowl at three levels, peckish (an amber
 * outline), hungry (filled amber), starving (red, pulsing); sickness a pink cross. On your own colonist (`explain`),
 * press and hold for the rule.
 */
export function ConditionTag({
  id,
  condition,
  rule,
  food,
  size = 'phone',
  inline = false,
  explain = false,
}: {
  id: string;
  condition: Condition | null;
  rule: PaceRule;
  food?: FoodEaten | undefined;
  size?: TagSize;
  inline?: boolean;
  explain?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  if (!condition) return null;
  const level = hungerLevel(condition, rule);
  if (level === 0 && !condition.sick) return null;
  const g = size === 'tv' ? 18 : size === 'wide' ? 16 : 10;
  const box = g + 4;
  const said = `${feeling(condition, rule)}: ${pct(condition.conditionPace)} pace`;
  const press = explain
    ? {
        onPointerDown: () => (hold.current = setTimeout(() => setOpen(true), HOLD_MS)),
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
      data-sick={condition.sick || undefined}
      role="img"
      aria-label={said}
      {...press}
    >
      {level > 0 && (
        <span
          className={cx(CHIP, level === 1 && 'border-warn bg-panel text-warn', level === 2 && 'bg-warn text-void', level === 3 && 'bg-alert text-alert-ink motion-safe:animate-pulse')}
          style={{ width: box, height: box }}
          data-testid={`hunger-${id}`}
        >
          <Bowl size={g} eaten={condition.foodShare} />
        </span>
      )}
      {condition.sick && (
        <span className={cx(CHIP, 'bg-g-medicine text-void')} style={{ width: box, height: box }} data-testid={`sick-${id}`}>
          <Cross size={g - 2} />
        </span>
      )}
      {open && (
        <span
          className="absolute bottom-full left-1/2 z-40 mb-2 flex w-56 -translate-x-1/2 flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2 text-left text-xs not-italic text-ink shadow-chip"
          data-testid={`rule-${id}`}
          role="tooltip"
        >
          <strong className="font-display text-sm">{said}</strong>
          {paceRule(condition, rule, food).map((r) => (
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
 * Whether the thought shows: for THOUGHT_MS.atClockStart from `clockStartsAt` (a performance.now() time), and for
 * THOUGHT_MS.onSetOff each time the colonist sets off, at most once every THOUGHT_MS.quiet.
 */
function useThought(on: boolean, moving: boolean, clockStartsAt: number | undefined): boolean {
  const [until, setUntil] = useState(0);
  const last = useRef(-Infinity);
  const wasMoving = useRef(moving);
  useEffect(() => {
    if (!on || clockStartsAt === undefined) return;
    const ends = clockStartsAt + THOUGHT_MS.atClockStart;
    // Back in the store after the clock started: the moment has passed.
    if (ends <= performance.now()) return;
    const t = setTimeout(
      () => {
        last.current = performance.now();
        setUntil(ends);
      },
      Math.max(0, clockStartsAt - performance.now()),
    );
    return () => clearTimeout(t);
  }, [on, clockStartsAt]);
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

/** The thought: a cloud above the head with two puffs trailing down to it, in ink, never the speech bubble's box. */
export function ThoughtBubble({
  id,
  condition,
  rule,
  moving = false,
  clockStartsAt,
  size = 'phone',
  edge,
}: {
  id: string;
  condition: Condition | null;
  rule: PaceRule;
  moving?: boolean;
  /** When the one clock starts, as a performance.now() time; without it the thought waits for a walk. */
  clockStartsAt?: number | undefined;
  size?: TagSize;
  /** A colonist near the stage's edge: the cloud grows inward from that side, so it stays on stage. */
  edge?: 'left' | 'right' | undefined;
}) {
  const level = condition ? hungerLevel(condition, rule) : 0;
  // TODO(AM-14): hide the thought while the colonist speaks, once chat bubbles reach the hall.
  const showing = useThought(!!condition && (level > 0 || condition.sick), moving, clockStartsAt);
  if (!showing || !condition) return null;
  const big = size !== 'phone';
  const g = size === 'tv' ? 22 : big ? 18 : 12;
  return (
    <span
      className={cx(
        'pointer-events-none absolute bottom-full z-30 mb-1 flex flex-col animate-[show-badge-in_0.3s_ease-out]',
        edge === 'left' ? 'left-0 items-start' : edge === 'right' ? 'right-0 items-end' : 'left-1/2 -translate-x-1/2 items-center',
      )}
      data-testid={`thought-${id}`}
      role="status"
    >
      <span
        className={cx(
          'flex w-max items-center gap-1 rounded-full border-2 border-dotted border-ink-2 bg-raised font-display italic text-ink',
          size === 'tv' ? 'px-3 py-1 text-lg' : big ? 'px-2.5 py-0.5 text-sm' : 'px-1.5 py-0.5 text-[10px]',
        )}
      >
        {level > 0 && (
          <span className={level === 3 ? 'text-alert' : 'text-warn'}>
            <Bowl size={g} eaten={condition.foodShare} />
          </span>
        )}
        {condition.sick && (
          <span className="text-g-medicine">
            <Cross size={g - 2} />
          </span>
        )}
        <span>
          {feeling(condition, rule)}… <span className="font-mono font-bold not-italic">{pct(condition.conditionPace)} pace</span>
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

/** Your condition in the rail: what it does to you in one line; why, where there is room. */
export function YourPace({ condition, rule, food }: { condition: Condition; rule: PaceRule; food: FoodEaten }) {
  const l = paceLine(condition, rule, food);
  return (
    <div className="flex flex-col gap-0.5" data-testid="your-pace" data-tone={l.tone}>
      <span className={cx('font-display text-sm font-semibold leading-tight @min-[1100px]/shell:text-lg', l.tone === 'ok' ? 'text-ok' : l.tone === 'warn' ? 'text-warn' : 'text-alert')}>
        {l.title}
      </span>
      {/* A sideways phone's rail has room for the line, not the why: the why shows from a laptop up, and on the start card. */}
      <span className="hidden text-sm text-ink-2 @min-[1100px]/shell:block">{l.detail}</span>
    </div>
  );
}

/** One colonist's row in the TV's pace list. */
export interface PaceRow {
  id: string;
  name: string;
  slot: Slot;
  condition: Condition | null;
}

/** The TV's list: how fast each colonist walks this month, and why. */
export function PaceList({ rows, rule }: { rows: PaceRow[]; rule: PaceRule }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5" data-testid="pace-list">
      <span className="label-caps col-span-2">Pace this month · set by Food and health</span>
      {rows.map((r) => {
        const pace = r.condition?.conditionPace ?? 1;
        const alarm = r.condition && (hungerLevel(r.condition, rule) === 3 || r.condition.sick);
        return (
          <div key={r.id} className="flex items-center gap-2" data-testid={`pace-${r.id}`}>
            <PlayerMark slot={r.slot} size={18} glow={false} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.name}</span>
            <div className="relative h-2 w-12 shrink-0 overflow-hidden rounded-full bg-raised">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(pace), background: SLOT_COLOR[r.slot] }} />
            </div>
            <span data-num className={cx('w-10 text-right font-mono text-sm', pace < 1 ? (alarm ? 'text-alert' : 'text-warn') : 'text-ink-2')}>
              {pct(pace)}
            </span>
            <span className="flex w-9 justify-start">
              <ConditionTag id={r.id} condition={r.condition} rule={rule} inline />
            </span>
          </div>
        );
      })}
    </div>
  );
}
