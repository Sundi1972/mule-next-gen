/**
 * The gait, as a pure function of what the wire already carries (spec 2026-10-29-arcade-walking §3: ColonistView v2
 * {x, y, space, facing, moving, lead, pace, pelts, encounter} and the 20 Hz DevFrame {id, x, y, space, facing, moving,
 * lead}). Nothing here is sent: a client derives the motion and the cycle's length, and CSS plays it between frames.
 *
 * DS-GAP (WS6): presentation numbers, named, as config.ts names the balance ones. In a build they sit beside the
 * keyframes in packages/ui (a GAIT table in Creature.tsx or theme.css custom properties), not in the engine.
 */

export type Motion = 'idle' | 'walk' | 'run' | 'fight' | 'hurt';
export type Facing = 'left' | 'right';
export type Encounter = 'choose' | 'chase' | 'fight' | null;

export const GAIT = {
  /**
   * One full stride (both feet) at full speed, in seconds: the MULE's own mule-step cycle (theme.css, 0.5 s), so a
   * colonist and the MULE on its lead step together at every pace.
   */
  fullCycle: 0.5,
  /** Running from wolves strides this much quicker than walking at the same ground speed. */
  runShare: 0.6,
  /** A bitten colonist limps: its stride takes this much longer than its speed alone would say. */
  limpShare: 1.3,
  /** The fight stance's rhythm: one jab per wolf lunge (WOLVES.lungeEverySeconds 1.6, RULE-7). */
  fightCycle: 1.6,
  /** No stride is quicker or slower than these, so a very slow walk still reads as walking, not as a stutter. */
  minCycle: 0.28,
  maxCycle: 2.0,
  /** Standing still breathes on the MULE's rhythm (mule-breathe 2.6 s). */
  idleCycle: 2.6,
} as const;

export interface GaitInput {
  moving: boolean;
  encounter: Encounter;
  /** The wire's condition pace: hunger × sickness × the Zipwing perk (dev-walk.ts::pace). */
  pace: number;
  /** The ground under the colonist: DEV_STEER.terrain[t], looked up from x, y on the map the client already has. */
  terrain: number;
  /** Leading a MULE: the wire's `lead` is non-null. */
  lead: boolean;
  /** Bitten and not yet healed: a client-side latch (see limpLatch), never a wire field. */
  limp: boolean;
  /** DEV_STEER.leadPace, WOLVES.bittenPace. */
  leadPace?: number;
  bittenPace?: number;
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
  const lead = g.lead ? (g.leadPace ?? 0.9) : 1;
  const bitten = g.limp ? (g.bittenPace ?? 0.5) : 1;
  return Math.max(0.01, g.pace * g.terrain * lead * bitten);
}

/**
 * One stride's length in seconds. The cycle scales inversely with speed, so a stride covers the same ground at every
 * pace and the feet never skate: half the speed, twice the cycle.
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
 * The limp without a wire field: a client sets it when a colonist's encounter goes chase → null with its speed
 * falling (caught and bitten; "got away" keeps its speed), and clears it when the colonist enters the hall or stands on
 * an own plot (RULE-4: "bitten until the store or an own plot"). A reconnect loses the latch: the colonist then walks
 * slowly without limping, which is the honest fallback.
 */
export function limpLatch(prev: { limp: boolean; encounter: Encounter; speed: number }, now: { encounter: Encounter; speed: number; healed: boolean }): boolean {
  if (now.healed) return false;
  if (prev.encounter === 'chase' && now.encounter === null && now.speed < prev.speed * 0.8) return true;
  return prev.limp;
}

/** Facing from a step, keeping the last one when the step is vertical or zero (the wire sends facing; this is the mock's). */
export function facingOf(dx: number, was: Facing): Facing {
  if (dx > 1e-4) return 'right';
  if (dx < -1e-4) return 'left';
  return was;
}
