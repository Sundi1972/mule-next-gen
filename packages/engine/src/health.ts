import { HEALTH, POLLUTION, UPKEEP } from './config.js';
import { airBand } from './pollution.js';
import type { GameState } from './types.js';

/** HEALTH prototype. WS7 RULE-2's severity curve: 0 up to the tolerance, then ((s - tol) / (1 - tol))^power. */
export function severity(s: number): number {
  return s <= HEALTH.tolerance ? 0 : Math.pow((Math.min(1, s) - HEALTH.tolerance) / (1 - HEALTH.tolerance), HEALTH.power);
}

export const healthOn = (): boolean => HEALTH.mode !== 'base';

/** The colony's sick share h now (HEALTH.start before the first upkeep); 0 with the rule off. */
export function sickShare(state: GameState): number {
  return healthOn() ? (state.health?.h ?? HEALTH.start) : 0;
}

/** The colonists' Medicine need this month: 1 per colonistsPerMedicine, x1.5 in sickening air, x(1 + sickMedicine h). */
export function medicineNeed(state: GameState): number {
  const air = airBand(state.air).sickens ? POLLUTION.sickMedicineDemand : 1;
  return (state.colonists / UPKEEP.colonistsPerMedicine) * air * (1 + HEALTH.needAtMax * (sickShare(state) / HEALTH.max));
}

/** The colonists' Electronics want this month (bonus only). */
export function electronicsNeed(state: GameState): number {
  return state.colonists / HEALTH.electronicsPerColonists;
}

/** WS7's rule: h' = clamp(h - recovered + new, 0, max). Air reaches the colonists only through the Medicine need. */
export function nextSickShare(h: number, sF: number, sW: number, sM: number): number {
  const fresh = (1 - h) * (HEALTH.newBase + HEALTH.hunger * severity(Math.max(sF, sW)) + HEALTH.medicine * severity(sM) + HEALTH.contagion * h);
  const recovered = HEALTH.recover * h * (1 - severity(sM) * HEALTH.medicineCut);
  return Math.max(0, Math.min(HEALTH.max, h - recovered + fresh));
}
