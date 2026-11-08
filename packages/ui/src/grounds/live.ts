/**
 * The live layer's rules (spec §2 RULE-2, RULE-3, RULE-7, RULE-8): how bright the lights are, how many colonists walk,
 * how thick the haze is and what smokes. Pure.
 */
import { POLLUTION } from '@mule/engine';
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

/** The air bands that show a haze; below the first the air is clean and the grounds show none (RULE-7). */
type HazyBand = Exclude<(typeof POLLUTION.bands)[number]['name'], 'clean'>;
const SMOGGY = POLLUTION.bands.find((b) => b.name === 'smoggy')!.from;

/**
 * The haze's look (RULE-7), tuned on the smoke-and-haze mock: its opacity at the far edge, from just Smoggy to the
 * gauge's top; how much of that is left at the near edge; and its colour by band, a dusty grey, ochre, a brown murk.
 */
export const HAZE = {
  min: 0.18,
  max: 0.65,
  near: 0.55,
  colour: {
    smoggy: { day: '#aaa292', dusk: '#4a4642' },
    toxic: { day: '#b39a52', dusk: '#4a4030' },
    collapse: { day: '#7a6430', dusk: '#3e3424' },
  } satisfies Record<HazyBand, Record<Light, string>>,
};

/** RULE-7: the haze's opacity at the far edge. None on a clean colony or with no reading, then rising evenly with the gauge. */
export function hazeOpacity(environment: number | undefined): number {
  if (environment === undefined || !Number.isFinite(environment) || environment < SMOGGY) return 0;
  const t = Math.min(1, (environment - SMOGGY) / (POLLUTION.airMax - SMOGGY));
  return HAZE.min + t * (HAZE.max - HAZE.min);
}

/** The haze's colour for the gauge's band and the light. */
export function hazeColour(environment: number, light: Light): string {
  const band = [...POLLUTION.bands].reverse().find((b) => environment >= b.from)!.name;
  return HAZE.colour[band === 'clean' ? 'smoggy' : band][light];
}

/** RULE-8: a damaged building smokes; nothing else does (a closed one is dark and still, a site is bare). */
export const smokes = (stage: PlaceState['stage']) => stage === 'damaged';

/**
 * The plume (RULE-8), the mock's smoke A: light grey puffs that rise, widen, drift with the wind and fade, in scene
 * units. It leaves its building at `height` of its massing, the broken top of a damaged picture.
 */
export const SMOKE = { puffs: 10, period: 4.6, rise: 140, drift: 44, r0: 11, r1: 36, opacity: 0.8, height: 0.7, colour: { day: '#c4c0b9', dusk: '#8c8781' } satisfies Record<Light, string> };

export interface Puff {
  /** From the plume's source, scene units (x right, y down). */
  dx: number;
  dy: number;
  r: number;
  opacity: number;
  /** Near its source the smoke still carries the embers' glow at dusk, 1 at the source to 0 a quarter of the way up. */
  warm: number;
}

/** The plume `seconds` in, each puff at its own phase of its life. */
export function plume(seconds: number): Puff[] {
  return Array.from({ length: SMOKE.puffs }, (_, k) => {
    const p = (seconds / SMOKE.period + k / SMOKE.puffs) % 1;
    const fade = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
    return {
      dx: p * SMOKE.drift + Math.sin(p * 6 + k) * 3,
      dy: -p * SMOKE.rise,
      r: SMOKE.r0 + p * (SMOKE.r1 - SMOKE.r0),
      opacity: fade * SMOKE.opacity,
      warm: Math.max(0, 1 - p * 4),
    };
  });
}
