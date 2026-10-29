/**
 * The gait, as a pure function of what the wire already carries (spec 2026-10-29-arcade-walking §3: ColonistView
 * {moving, lead, pace, encounter, …} and the 20 Hz DevFrame). Nothing here is sent: a client derives the motion and
 * the stride's length, and CSS (theme.css, cm-*) plays it between frames.
 */

export type Motion = 'idle' | 'walk' | 'run' | 'fight' | 'hurt';
export type Facing = 'left' | 'right';
export type Encounter = 'choose' | 'chase' | 'fight' | null;

/** Presentation timings, in seconds or as shares. The balance numbers they follow live in the engine's config. */
export const GAIT = {
  /** One full stride (both feet) at full speed: the MULE's mule-step cycle, so a colonist and its MULE step as one. */
  fullCycle: 0.5,
  /** Running from wolves strides this much quicker than walking at the same ground speed. */
  runShare: 0.6,
  /** A bitten colonist limps: its stride takes this much longer than its speed alone would say. */
  limpShare: 1.3,
  /** The fight stance's rhythm: one jab per wolf lunge (WOLVES.lungeEverySeconds, RULE-7). */
  fightCycle: 1.6,
  /** No stride is quicker or slower than these, so a very slow walk still reads as walking, not as a stutter. */
  minCycle: 0.28,
  maxCycle: 2.0,
  /** Standing still breathes on the MULE's rhythm (mule-breathe). */
  idleCycle: 2.6,
  /** A chase that ends with the speed under this share of the chase's speed was caught: a bite (limpLatch). */
  caughtShare: 0.8,
  /** The slowest share of full speed a stride is computed from, so a stopped pace never divides by zero. */
  minSpeedShare: 0.01,
} as const;

export interface GaitInput {
  moving: boolean;
  encounter: Encounter;
  /** The wire's condition pace: hunger × sickness × the species perk. */
  pace: number;
  /** The ground's speed factor under the colonist, looked up from x, y on the map the client already has. */
  terrain: number;
  /** Leading a MULE: the wire's `lead` is non-null. */
  lead: boolean;
  /** Bitten and not yet healed: a client-side latch (limpLatch), never a wire field. */
  limp: boolean;
  /** The balance's pace while leading a MULE and while bitten (RULE-2, RULE-4), from the engine's config. */
  leadPace: number;
  bittenPace: number;
}

/** What the creature does, first match wins. */
export function motionOf(g: Pick<GaitInput, 'moving' | 'encounter' | 'limp'>): Motion {
  if (g.encounter === 'fight') return 'fight';
  if (g.encounter === 'chase') return 'run';
  if (!g.moving) return 'idle';
  return g.limp ? 'hurt' : 'walk';
}

/** The share of full speed the colonist walks at: RULE-2's product, less the base speed. */
export function speedShare(g: GaitInput): number {
  const lead = g.lead ? g.leadPace : 1;
  const bitten = g.limp ? g.bittenPace : 1;
  return Math.max(GAIT.minSpeedShare, g.pace * g.terrain * lead * bitten);
}

/**
 * One stride's length in seconds. The stride scales inversely with speed, so it covers the same ground at every pace
 * and the feet never skate: half the speed, twice the stride.
 */
export function cycleSeconds(g: GaitInput): number {
  const m = motionOf(g);
  if (m === 'idle') return GAIT.idleCycle;
  if (m === 'fight') return GAIT.fightCycle;
  const share = m === 'run' ? GAIT.runShare : m === 'hurt' ? GAIT.limpShare : 1;
  const raw = (GAIT.fullCycle / speedShare(g)) * share;
  return Math.min(GAIT.maxCycle, Math.max(GAIT.minCycle, raw));
}

/**
 * The limp without a wire field: set when a colonist's encounter goes chase → null with its speed falling (caught and
 * bitten; "got away" keeps its speed), cleared when it is healed in the hall or on an own plot (RULE-4). A reconnect
 * loses the latch: the colonist then walks slowly without limping, the honest fallback.
 */
export function limpLatch(prev: { limp: boolean; encounter: Encounter; speed: number }, now: { encounter: Encounter; speed: number; healed: boolean }): boolean {
  if (now.healed) return false;
  if (prev.encounter === 'chase' && now.encounter === null && now.speed < prev.speed * GAIT.caughtShare) return true;
  return prev.limp;
}
