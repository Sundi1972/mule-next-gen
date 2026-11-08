/**
 * Smoke and haze for the grounds' live layer (spec C4, Task 2.2b): the mock's rules, proposed as spec §2 RULE-7 (haze)
 * and RULE-8 (smoke). Pure, so the build lifts them into packages/ui/src/grounds/live.ts as they are.
 */
import type { Light } from '@mule/ui';

/** The air gauge's bands (config.ts ENVIRONMENT.bands): higher is dirtier. Below Smoggy the grounds show no haze. */
export const SMOGGY = 30;
export const TOXIC = 60;
export const COLLAPSE = 80;
/** The haze at its thinnest (the air just Smoggy) and thickest (100): opacity at the far edge of the grounds. */
export const HAZE_MIN = 0.18;
export const HAZE_MAX = 0.65;

/** RULE-7: how thick the haze is for the air gauge; none on a clean colony, then rising evenly with the gauge. */
export function hazeOpacity(environment: number): number {
  if (environment < SMOGGY) return 0;
  const t = Math.min(1, (environment - SMOGGY) / (100 - SMOGGY));
  return HAZE_MIN + t * (HAZE_MAX - HAZE_MIN);
}

/** The haze's colour by band and light: a dusty grey when Smoggy, ochre when Toxic, a brown murk at Collapse. */
export function hazeColour(environment: number, light: Light): string {
  const day = environment >= COLLAPSE ? '#7a6430' : environment >= TOXIC ? '#b39a52' : '#aaa292';
  const dusk = environment >= COLLAPSE ? '#3e3424' : environment >= TOXIC ? '#4a4030' : '#4a4642';
  return light === 'day' ? day : dusk;
}

/** RULE-8: a damaged building smokes; nothing else does (a closed one is dark and still, a site is bare). */
export const smokes = (stage: string) => stage === 'damaged';

export interface Puff {
  /** Offset from the smoke's origin, scene units (x right, y down). */
  dx: number;
  dy: number;
  r: number;
  opacity: number;
  /** Near its source the smoke still carries the embers' glow at dusk. */
  warm: number;
}

export interface PlumeStyle {
  puffs: number;
  /** One puff's life, seconds. */
  period: number;
  rise: number;
  drift: number;
  r0: number;
  r1: number;
  opacity: number;
}

/** Variant A: light grey puffs that rise, widen and fade. Variant B: a darker, denser column bent by the wind. */
export const PLUMES: Record<'A' | 'B', PlumeStyle> = {
  A: { puffs: 10, period: 4.6, rise: 140, drift: 44, r0: 11, r1: 36, opacity: 0.8 },
  B: { puffs: 14, period: 3.8, rise: 175, drift: 74, r0: 13, r1: 44, opacity: 0.92 },
};

/** The plume `seconds` in: each puff at its own phase. With reduced motion the caller passes 0, a still plume. */
export function plume(seconds: number, s: PlumeStyle): Puff[] {
  return Array.from({ length: s.puffs }, (_, k) => {
    const p = (seconds / s.period + k / s.puffs) % 1;
    const fade = p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88;
    return { dx: p * s.drift + Math.sin(p * 6 + k) * 3, dy: -p * s.rise, r: s.r0 + p * (s.r1 - s.r0), opacity: fade * s.opacity, warm: Math.max(0, 1 - p * 4) };
  });
}
