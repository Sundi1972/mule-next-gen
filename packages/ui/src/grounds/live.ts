/** The live layer's rules (spec §2 RULE-2, RULE-3): how bright the lights are, how many colonists walk. Pure. */
import type { Light, PlaceState } from './pick';

/**
 * The wealth at which every light is at full (RULE-2). A look value tuned on the look page, not a game rule (HC-1).
 */
export const WEALTH_FULL = 4000;

/** The share of the light a poor colony still shows: dim, never dark (RULE-2). */
const GLOW_FLOOR = 0.25;

/** How much of its glow each stage shows (RULE-2): work lights while building, an ember when damaged. */
const STAGE_GLOW: Record<PlaceState['stage'], number> = {
  standing: 1,
  building: 0.5,
  damaged: 0.6,
  commissioned: 0.3,
  closed: 0,
};

/** RULE-3: walkers = min(WALKERS_MAX, WALKERS_BASE + WALKERS_PER_STANDING × standing), scaled by happiness. */
const WALKERS_BASE = 2;
const WALKERS_PER_STANDING = 2;
const WALKERS_MAX = 14;

export interface GlowInput {
  light: Light;
  stage: PlaceState['stage'];
  wealth: number;
}

export interface WalkersInput {
  /** 0–100. */
  happiness: number;
  standing: number;
  strike: boolean;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** A building's glow picture opacity (RULE-2): none by day; at dusk its stage's share, brighter as the colony is richer. */
export function glowOpacity({ light, stage, wealth }: GlowInput): number {
  if (light === 'day') return 0;
  const wealthShare = clamp01(wealth / WEALTH_FULL);
  return STAGE_GLOW[stage] * (GLOW_FLOOR + (1 - GLOW_FLOOR) * wealthShare);
}

/** How many colonists walk the paths (RULE-3): none in a strike, more as more stands and the colony is happier. */
export function walkersOut({ happiness, standing, strike }: WalkersInput): number {
  if (strike) return 0;
  return Math.round((happiness / 100) * Math.min(WALKERS_MAX, WALKERS_BASE + WALKERS_PER_STANDING * standing));
}
