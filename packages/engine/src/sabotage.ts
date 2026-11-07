import { RuleError } from './errors.js';
import type { GameState, MonthEvent, SabotageOrder, SabotageTarget } from './types.js';

/**
 * Sabotage (slice 4): orders, guards, investigations, fines and rumours. This file is the contract freeze (S4-C20):
 * every export has its final signature and a stub body, so engine, server, AI and screens compile against it while
 * the rules land task by task. The flow functions do nothing, `sabotageEvents` files nothing, the intent functions
 * refuse and `captureOdds` is 0. Nothing but this file writes `politics.sabotage` or `politics.guards`.
 */

const NOT_BUILT = 'Sabotage is not built yet';

/** What each kind of order costs and how likely it is to work and to be seen, in credits and chances 0..1. */
export type OrderTerms = Record<SabotageTarget['kind'], { cost: number; success: number; detect: number }>;

/** The state's own politics to write to: a copy on every write, since a what-if made from it may still hold the old one. */
// Unused until the rules land (S4-1.2+); the one-line structuredClone colony.ts's edit() starts from.
function edit(state: GameState): NonNullable<GameState['politics']> {
  const politics = structuredClone(state.politics!);
  state.politics = politics;
  return politics;
}

/** Chance, 0..1, that this order is seen when it resolves (S4-RULE-3). */
export function captureOdds(_state: GameState, _order: SabotageOrder): number {
  return 0;
}

/** Place, replace or (with null) withdraw the player's order for this month. */
export function orderSabotage(_state: GameState, _playerId: string, _target: SabotageTarget | null): void {
  throw new RuleError(NOT_BUILT);
}

/** The Sheriff's guarded plots for this month: the whole list. */
export function setGuards(_state: GameState, _playerId: string, _tiles: number[]): void {
  throw new RuleError(NOT_BUILT);
}

/** The Sheriff investigates an order; returns it as it stands afterwards. */
export function investigate(_state: GameState, _playerId: string, _orderId: string): SabotageOrder {
  throw new RuleError(NOT_BUILT);
}

/** The Sheriff fines an order's culprit `base` credits, before the ban's multiplier. */
export function fineCulprit(_state: GameState, _playerId: string, _orderId: string, _base: number): void {
  throw new RuleError(NOT_BUILT);
}

/** Resolve every pending order, once, as production starts. */
export function resolveSabotage(_state: GameState): void {}

/** The month's sabotage events for production to file. */
export function sabotageEvents(_state: GameState): MonthEvent[] {
  return [];
}

/** Shift the posted prices by the month's worked rumours, after the auction posts them. */
export function applyRumours(_state: GameState): void {}

/** Restore the posted prices exactly, when the auction ends. */
export function endRumours(_state: GameState): void {}

/** Charge the month's crew costs at upkeep. */
export function settleSabotage(_state: GameState): void {}

/** Levy the standard fine on cases left unfined, when planning ends and at the last upkeep. */
export function closeCases(_state: GameState): void {}

/** Reset the month's guards and investigations at the start of planning. */
export function newSabotageMonth(_state: GameState): void {}

/** What each kind of order costs, and its chance of working and of being seen, now. */
export function orderTerms(_state: GameState): OrderTerms {
  return { powerCut: { cost: 0, success: 0, detect: 0 }, rumour: { cost: 0, success: 0, detect: 0 } };
}

/** Whether the player may order now, or why not. */
export function canOrder(_state: GameState, _playerId: string): true | 'off' | 'notPlanning' {
  return 'off';
}

/** How many plots the Sheriff may guard this month. */
export function guardsMax(_state: GameState): number {
  return 0;
}

/** Whether the player may guard, investigate and fine now, or why not. */
export function sheriffCanAct(_state: GameState, _playerId: string): true | 'off' | 'notPlanning' | 'votesOpen' | 'notSheriff' {
  return 'off';
}

/** The ids of the orders the Sheriff may fine now. */
export function fineable(_state: GameState, _playerId: string): string[] {
  return [];
}

/** The sabotage ban's multiplier in force now: 1 with no ban. */
export function banMultiplier(_state: GameState): number {
  return 1;
}

/** Whether an order's effect or culprit is known to every seat (S4-RULE-3's public). */
export function isPublicOrder(_order: SabotageOrder): boolean {
  return false;
}
