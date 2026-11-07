import { POLITICS } from './config.js';
import { RuleError } from './errors.js';
import { player } from './game.js';
import { securitySpend } from './politics.js';
import { createRng, seedOf } from './rng.js';
import { GOODS, type GameState, type MonthEvent, type SabotageOrder, type SabotageTarget } from './types.js';

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
function edit(state: GameState): NonNullable<GameState['politics']> {
  const politics = structuredClone(state.politics!);
  state.politics = politics;
  return politics;
}

/** Chance, 0..1, that this order is seen when it resolves (S4-RULE-3). */
export function captureOdds(_state: GameState, _order: SabotageOrder): number {
  return 0;
}

const BASE_36 = 36; // literal-ok: the radix of an id tag, a definition
const TAG_LENGTH = 6; // literal-ok: an id tag is six characters, a format not a balance number
const PER_SECURITY = 100; // literal-ok: Security is counted in hundreds of credits (S4-RULE-3), a unit and not a balance number

/** 'sab-' plus six base-36 characters, drawn from a stream seeded by the game and the order's number only; a clash redraws (AM-1). */
function newId(state: GameState, taken: readonly SabotageOrder[]): string {
  const n = taken.length + 1;
  for (let attempt = 0; ; attempt++) {
    const rng = createRng(seedOf(state.seed, n, 'sab', ...(attempt === 0 ? [] : [String(attempt)])));
    const tag = Array.from({ length: TAG_LENGTH }, () => rng.int(0, BASE_36 - 1).toString(BASE_36)).join('');
    if (!taken.some((o) => o.id === `sab-${tag}`)) return `sab-${tag}`;
  }
}

/** The player's order for this month, still pending: the one an order replaces or a withdrawal removes. */
function standing(state: GameState, playerId: string): SabotageOrder | undefined {
  return state.politics?.sabotage.find((o) => o.by === playerId && o.month === state.month && o.outcome === 'pending');
}

/** Place, replace or (with null) withdraw the player's order for this month (S4-RULE-2). */
export function orderSabotage(state: GameState, playerId: string, target: SabotageTarget | null): void {
  const can = canOrder(state, playerId);
  if (can === 'off') throw new RuleError('This game plays without sabotage');
  if (can === 'notPlanning') throw new RuleError('Orders are given in planning');
  const old = standing(state, playerId);
  if (target === null) {
    if (old) {
      const kept = state.politics!.sabotage.filter((o) => o !== old);
      edit(state).sabotage = kept;
    }
    return;
  }
  if (target.kind === 'powerCut') {
    const tile = state.tiles[target.tile];
    if (!tile || tile.owner === null || tile.owner === playerId) throw new RuleError("Pick another player's plot");
    if (!(GOODS as readonly string[]).includes(tile.outfit ?? '')) throw new RuleError('That plot makes nothing to cut');
  } else if (!(GOODS as readonly string[]).includes(target.good)) throw new RuleError('Pick a good');
  const { cost } = orderTerms(state)[target.kind];
  const money = player(state, playerId).money;
  if (money < cost) throw new RuleError(`A crew costs ${cost} cr; you have ${money}`);
  const kept = state.politics!.sabotage.filter((o) => o !== old);
  const order: SabotageOrder = { id: newId(state, kept), by: playerId, month: state.month, target: { ...target }, cost, outcome: 'pending', culpritPublic: false };
  edit(state).sabotage = [...kept, order];
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

/** Reset the month's guards at the start of planning; investigations are read off their month, so they reset themselves. */
export function newSabotageMonth(state: GameState): void {
  if (state.politics && state.politics.guards.length > 0) edit(state).guards = [];
}

/** What each kind of order costs, and its chance of working and of being seen, now. */
export function orderTerms(state: GameState): OrderTerms {
  const extra = Math.floor(securitySpend(state) / PER_SECURITY) * POLITICS.sheriff.securityDetect;
  const terms = (kind: SabotageTarget['kind']) => {
    const { cost, success, detect } = POLITICS.sabotage.orders[kind];
    return { cost, success, detect: Math.min(1, detect + extra) };
  };
  return { powerCut: terms('powerCut'), rumour: terms('rumour') };
}

/** Whether the player may order now, or why not. */
export function canOrder(state: GameState, _playerId: string): true | 'off' | 'notPlanning' {
  if (!state.politics || !POLITICS.sabotage.on) return 'off';
  return state.phase === 'planning' ? true : 'notPlanning';
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
