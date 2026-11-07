import { fundIn, fundOut, goodWords } from './colony.js';
import { POLITICS } from './config.js';
import { RuleError } from './errors.js';
import { plotEvent, storeEvent } from './events.js';
import { isGameOver, player } from './game.js';
import { pactBreach } from './diplomacy.js';
import { reputationShift, securitySpend, votesOpen } from './politics.js';
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

/** 'sab-' plus six base-36 characters, drawn from a stream seeded by the game, the order's month and its orderer only; a clash with any id issued redraws from the same stream (AM-4). */
function newId(state: GameState, issued: readonly SabotageOrder[], by: string): string {
  const rng = createRng(seedOf(state.seed, state.month, by, 'sab'));
  for (;;) {
    const tag = Array.from({ length: TAG_LENGTH }, () => rng.int(0, BASE_36 - 1).toString(BASE_36)).join('');
    if (!issued.some((o) => o.id === `sab-${tag}`)) return `sab-${tag}`;
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
  } else {
    if (!(GOODS as readonly string[]).includes(target.good)) throw new RuleError('Pick a good');
    if (target.dir !== 'up' && target.dir !== 'down') throw new RuleError('A rumour moves a price up or down');
  }
  const { cost } = orderTerms(state)[target.kind];
  const money = player(state, playerId).money;
  if (money < cost) throw new RuleError(`A crew costs ${cost} cr; you have ${money}`);
  const kept = state.politics!.sabotage.filter((o) => o !== old);
  const known: SabotageTarget = target.kind === 'powerCut' ? { kind: 'powerCut', tile: target.tile } : { kind: 'rumour', good: target.good, dir: target.dir };
  const order: SabotageOrder = { id: old?.id ?? newId(state, kept, playerId), by: playerId, month: state.month, target: known, cost, outcome: 'pending', culpritPublic: false };
  edit(state).sabotage = [...kept, order];
}

/** The refusal for a Sheriff's act now, or null when the player may act; `words` fills the words of rows 2 and 3 (S4-RULE-6 rows 1-3). */
function refusal(state: GameState, playerId: string, words: { votes: string; sheriff: string }): RuleError | null {
  const can = sheriffCanAct(state, playerId);
  if (can === true) return null;
  if (can === 'off') return new RuleError('This game plays without sabotage');
  return new RuleError(can === 'notSheriff' ? words.sheriff : words.votes);
}

/** The Sheriff's guarded plots for this month: the whole list (S4-RULE-6). */
export function setGuards(state: GameState, playerId: string, tiles: number[]): void {
  const refused = refusal(state, playerId, { votes: 'Guards are posted once the votes are over', sheriff: 'Only the Sheriff posts guards' });
  if (refused) throw refused;
  const plots = [...new Set(tiles)];
  if (plots.some((tile) => (state.tiles[tile]?.owner ?? null) === null)) throw new RuleError("Guards watch players' plots");
  const max = guardsMax(state);
  if (plots.length > max) throw new RuleError(`You have ${max} guards`);
  edit(state).guards = plots;
}

/** The Sheriff investigates an order; returns it as it stands afterwards (S4-RULE-7). */
export function investigate(state: GameState, playerId: string, orderId: string): SabotageOrder {
  const refused = refusal(state, playerId, { votes: 'Investigations are made once the votes are over', sheriff: 'Only the Sheriff investigates' });
  if (refused) throw refused;
  const cases = state.politics!.sabotage;
  if (cases.filter((o) => o.investigated === state.month).length >= POLITICS.sheriff.investigations) throw new RuleError('One investigation a month');
  const at = cases.findIndex((o) => o.id === orderId);
  const found = cases[at];
  if (!found || !isPublicOrder(found)) throw new RuleError('No such incident');
  if (found.culpritPublic) throw new RuleError('That one is solved');
  if (found.investigated != null) throw new RuleError('The trail went cold on that one');
  // The draw keys on the order's number, its place in the list plus one, which only the engine holds (AM-1), never on the id's text.
  const solved = createRng(seedOf(state.seed, at + 1, 'investigate', String(POLITICS.sabotage.streamSalt))).chance(POLITICS.sheriff.investigateOdds);
  edit(state).sabotage[at]!.investigated = state.month;
  if (solved) reveal(state, orderId);
  return state.politics!.sabotage[at]!;
}

/** The Sheriff fines an order's culprit `base` credits, before the ban's multiplier (S4-RULE-8). */
export function fineCulprit(state: GameState, playerId: string, orderId: string, base: number): void {
  const refused = refusal(state, playerId, { votes: 'Fines are levied once the votes are over', sheriff: 'Only the Sheriff fines' });
  if (refused) throw refused;
  const order = state.politics!.sabotage.find((o) => o.id === orderId);
  if (!order || !order.culpritPublic) throw new RuleError('Only a revealed culprit is fined');
  if (order.fine) throw new RuleError('Already fined');
  if (order.by === playerId) throw new RuleError("You can't fine yourself");
  const { steps } = POLITICS.sheriff.fine;
  if (!steps.includes(base)) throw new RuleError(`A fine is ${steps[0]} to ${steps.at(-1)} cr, in steps of ${steps[1]! - steps[0]!}`);
  levy(state, orderId, base, 'sheriff');
}

/**
 * Levy a fine on a revealed case: base times the ban in force now, as much as the culprit has, in through the fund and
 * the victim's share out through it (S4-HC-3: nobody pays another player directly). Not a tax paid; the rest is waived.
 */
function levy(state: GameState, orderId: string, base: number, by: 'sheriff' | 'standard'): void {
  const order = state.politics!.sabotage.find((o) => o.id === orderId)!;
  const culprit = player(state, order.by!);
  const due = base * banMultiplier(state);
  const paid = Math.max(0, Math.min(culprit.money, due));
  culprit.money -= paid;
  fundIn(state, 'fine', paid);
  const toVictim = order.victim ? fundOut(state, 'restitution', Math.round(paid * POLITICS.sheriff.victimShare)) : 0;
  if (order.victim) player(state, order.victim).money += toVictim;
  edit(state).sabotage.find((o) => o.id === orderId)!.fine = { base, due, paid, toVictim, by, month: state.month };
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

/** The standard fine on every revealed case still unfined, the Sheriff's own included. */
function fineOpenCases(state: GameState): void {
  for (const order of state.politics!.sabotage.filter((o) => o.culpritPublic && !o.fine)) levy(state, order.id, POLITICS.sheriff.fine.standard, 'standard');
}

/** At upkeep: each player's crews for the month, what they have at most, to nobody (S4-RULE-9); in the last month, open cases pay the standard fine (S4-RULE-8). */
export function settleSabotage(state: GameState): void {
  if (!state.politics) return;
  for (const p of state.players) {
    const due = state.politics.sabotage.filter((o) => o.by === p.id && o.month === state.month && o.outcome !== 'pending').reduce((sum, o) => sum + o.cost, 0);
    p.money -= Math.max(0, Math.min(p.money, due));
  }
  if (isGameOver(state)) fineOpenCases(state);
}

/** Levy the standard fine on cases left unfined, when planning ends (S4-RULE-8); the last upkeep does the same in settleSabotage. */
export function closeCases(state: GameState): void {
  if (state.politics) fineOpenCases(state);
}

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
export function sheriffCanAct(state: GameState, playerId: string): true | 'off' | 'notPlanning' | 'votesOpen' | 'notSheriff' {
  if (!state.politics || !POLITICS.sabotage.on) return 'off';
  if (state.phase !== 'planning') return 'notPlanning';
  if (votesOpen(state)) return 'votesOpen';
  return state.politics.sheriff === playerId ? true : 'notSheriff';
}

/** The ids of the orders the Sheriff may fine now. */
export function fineable(state: GameState, playerId: string): string[] {
  if (sheriffCanAct(state, playerId) !== true) return [];
  return state.politics!.sabotage.filter((o) => o.culpritPublic && !o.fine && o.by !== playerId).map((o) => o.id);
}

/** The sabotage ban's multiplier in force now: 1 with no ban. */
export function banMultiplier(state: GameState): number {
  return state.politics?.laws.sabotageBan?.setting ?? 1;
}

/** Whether an order's effect or culprit is known to every seat (S4-RULE-3's public). */
export function isPublicOrder(order: SabotageOrder): boolean {
  return order.outcome === 'done' || order.outcome === 'caught' || order.culpritPublic;
}
