import { goodWords } from './colony.js';
import { POLITICS } from './config.js';
import { RuleError } from './errors.js';
import { plotEvent, storeEvent } from './events.js';
import { player } from './game.js';
import { pactBreach } from './diplomacy.js';
import { reputationShift, securitySpend } from './politics.js';
import { createRng, seedOf } from './rng.js';
import { PERCENT } from './units.js';
import { GOODS, type GameState, type Good, type MonthEvent, type SabotageOrder, type SabotageTarget } from './types.js';

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
export function captureOdds(state: GameState, order: SabotageOrder): number {
  if (isGuarded(state, order)) return 1;
  return orderTerms(state)[order.target.kind].detect;
}

/** The tiles the Sheriff's guards stand on now: the first guardsMax of politics.guards, in the order they were listed (S4-RULE-6). */
function standingGuards(state: GameState): number[] {
  return state.politics?.guards.slice(0, guardsMax(state)) ?? [];
}

/** Whether a power cut's plot is among the standing guards. A rumour has no plot to guard. */
function isGuarded(state: GameState, order: SabotageOrder): boolean {
  return order.target.kind === 'powerCut' && standingGuards(state).includes(order.target.tile);
}

const BASE_36 = 36; // literal-ok: the radix of an id tag, a definition
const TAG_LENGTH = 6; // literal-ok: an id tag is six characters, a format not a balance number
const MIN_PRICE = 1; // literal-ok: a posted price is at least one credit (S4-RULE-4), a floor of the unit and not a balance number
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
export function resolveSabotage(state: GameState): void {
  if (state.whatIf || !state.politics) return;
  const pending = pendingOrders(state);
  if (pending.length === 0) return;
  const rng = createRng(seedOf(state.seed, state.month, String(POLITICS.sabotage.streamSalt)));
  const terms = orderTerms(state);
  const voided = new Set<string>();
  // Decide first, then write: a reveal edits the state, and the draws must not depend on what an earlier order caused.
  const verdicts = pending.flatMap((order) => {
    const tile = order.target.kind === 'powerCut' ? state.tiles[order.target.tile] : undefined;
    if (order.target.kind === 'powerCut' && (!tile || tile.owner === null || tile.owner === order.by || !(GOODS as readonly string[]).includes(tile.outfit ?? ''))) {
      voided.add(order.id);
      return [];
    }
    // Both draws, for every order that stands, so the stream never depends on a guard.
    const works = rng.chance(terms[order.target.kind].success);
    const seen = rng.chance(captureOdds(state, order));
    const guarded = isGuarded(state, order);
    const victim = tile ? tile.owner : null;
    const worked = !guarded && works;
    const outcome: SabotageOrder['outcome'] = guarded || seen ? 'caught' : works ? 'done' : 'failed';
    return [{ id: order.id, outcome, worked, victim, revealed: guarded || seen }];
  });
  if (voided.size > 0) {
    const kept = state.politics.sabotage.filter((o) => !voided.has(o.id));
    edit(state).sabotage = kept;
  }
  for (const { id, outcome, worked, victim, revealed } of verdicts) {
    Object.assign(edit(state).sabotage.find((o) => o.id === id)!, { outcome, worked, victim });
    if (revealed) reveal(state, id);
  }
}

/** This month's pending orders, in seat order and then in the order they were placed. */
function pendingOrders(state: GameState): SabotageOrder[] {
  const seat = (o: SabotageOrder) => state.players.findIndex((p) => p.id === o.by);
  return state.politics!.sabotage.filter((o) => o.outcome === 'pending' && o.month === state.month).sort((a, b) => seat(a) - seat(b));
}

/**
 * The one place a culprit becomes known: a guard, a catch on the spot, or an investigation (S4-RULE-5). The order's
 * month goes to pactBreach, not the month of the reveal, so a pact is judged as it stood when the sabotage was ordered.
 */
function reveal(state: GameState, orderId: string): void {
  const order = edit(state).sabotage.find((o) => o.id === orderId)!;
  order.culpritPublic = true;
  const { by, victim, month } = order;
  reputationShift(state, by!, POLITICS.reputation.moves.caught * banMultiplier(state));
  if (victim) pactBreach(state, by!, victim, month);
}

const capital = (words: string): string => words[0]!.toUpperCase() + words.slice(1);

/** The month's sabotage events for production to file, in seat order: one for each order that was done or caught (S4-RULE-4). */
export function sabotageEvents(state: GameState): MonthEvent[] {
  if (state.whatIf || !state.politics) return [];
  const seat = (o: SabotageOrder) => state.players.findIndex((p) => p.id === o.by);
  const filed = state.politics.sabotage.filter((o) => o.month === state.month && (o.outcome === 'done' || o.outcome === 'caught')).sort((a, b) => seat(a) - seat(b));
  return filed.map((order) => {
    const culprit = order.culpritPublic ? order.by : null;
    const worked = order.worked === true;
    const guarded = isGuarded(state, order);
    const sabotage = { order: order.id, culprit, worked, guarded };
    const named = culprit === null ? '' : 'Caught! The saboteur is named.';
    if (order.target.kind === 'powerCut') {
      const tile = order.target.tile;
      const event = plotEvent(state, 'powerCut', tile);
      if (worked) return { ...event, line: `Someone cut the power to a ${capital(goodWords(state.tiles[tile]!.outfit as never))} plot: it makes nothing this month.`, sabotage };
      return { ...event, plots: [], line: guarded ? 'Caught at a guarded plot: the power stays on.' : named, sabotage };
    }
    const { good, dir } = order.target;
    const event = storeEvent(state, 'marketRumour', 'production');
    const share = Math.round(POLITICS.sabotage.orders.rumour.shift * PERCENT);
    const line = worked ? `A rumour: ${capital(goodWords(good))} opens ${share}% ${dir === 'up' ? 'higher' : 'lower'} at the auction.` : named;
    return { ...event, line, sabotage };
  });
}

/**
 * Shift the posted prices by the month's worked rumours, after the auction posts them (S4-RULE-4): each good's price
 * becomes its posted price times 1 plus the net shift (up and down cancel, two on one side add), rounded, at least 1.
 * Each shifted good's price before the shift is kept in politics.rumoured, so the auction's end puts it back exactly.
 */
export function applyRumours(state: GameState): void {
  if (!state.politics || state.politics.rumoured.length > 0) return;
  const net = new Map<Good, number>();
  for (const order of state.politics.sabotage) {
    if (order.month !== state.month || order.target.kind !== 'rumour' || order.worked !== true) continue;
    const { shift } = POLITICS.sabotage.orders.rumour;
    net.set(order.target.good, (net.get(order.target.good) ?? 0) + (order.target.dir === 'up' ? shift : -shift));
  }
  if (net.size === 0) return;
  const rumoured = [...net.keys()].map((good) => ({ good, from: state.store.posted[good] }));
  edit(state).rumoured = rumoured;
  for (const { good, from } of rumoured) state.store.posted[good] = Math.max(MIN_PRICE, Math.round(from * (1 + net.get(good)!)));
}

/** Restore the posted prices exactly, when the auction ends: from the price recorded before the shift, never by undoing it. */
export function endRumours(state: GameState): void {
  if (!state.politics || state.politics.rumoured.length === 0) return;
  for (const { good, from } of state.politics.rumoured) state.store.posted[good] = from;
  edit(state).rumoured = [];
}

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
export function guardsMax(state: GameState): number {
  return POLITICS.sheriff.guards + Math.floor(securitySpend(state) / PER_SECURITY) * POLITICS.sheriff.guardsPerHundred;
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
export function isPublicOrder(order: SabotageOrder): boolean {
  return order.outcome === 'done' || order.outcome === 'caught' || order.culpritPublic;
}
