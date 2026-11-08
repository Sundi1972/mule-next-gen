import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  monthNeeds,
  advancePhase,
  castLawVote,
  closeVotes,
  councilDone,
  createGame,
  createRng,
  fineable,
  fineCulprit,
  investigate,
  orderSabotage,
  POLITICS,
  proposeLaw,
  RuleError,
  seedOf,
  setGuards,
  stableJson,
  stepVotes,
  START,
  type GameState,
  type MonthEvent,
  type SabotageOrder,
} from '../src/index.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const NAME = (id: string) => id[0]!.toUpperCase() + id.slice(1);
const START_MONEY = START.money * 20; // setup: enough that no crew or fine is ever short
const OUTFITS = ['food', 'energy', 'smithore', 'crystite'] as const;

/** Both offices elected and sabotage on, for each test of the block; the config's own values come back after it (AM-2: the engine PR ships both off). No election month stands in the way of the Sheriff's acts. */
function sabotageOn(): void {
  let on: boolean;
  let offices: typeof POLITICS.offices;
  let electionMonths: typeof POLITICS.electionMonths;
  beforeEach(() => {
    on = POLITICS.sabotage.on;
    offices = POLITICS.offices;
    electionMonths = POLITICS.electionMonths;
    POLITICS.sabotage.on = true;
    POLITICS.offices = ['governor', 'sheriff'];
    POLITICS.electionMonths = [];
  });
  afterEach(() => {
    POLITICS.sabotage.on = on;
    POLITICS.offices = offices;
    POLITICS.electionMonths = electionMonths;
  });
}

function newGame(seed: number, politics = true): GameState {
  return createGame({ seed, players: SEATS.map((id) => ({ id, name: NAME(id), isAi: false })), politics });
}

/** Twelve free plots, three to a seat in seat order, outfitted in turn; returns their indices. Setup only: the land auction is not what is tested. */
function landed(state: GameState): number[] {
  const free = state.tiles.map((t, i) => [t, i] as const).filter(([t]) => t.terrain !== 'store' && t.owner === null).map(([, i]) => i).slice(0, 12);
  free.forEach((tile, n) => Object.assign(state.tiles[tile]!, { owner: SEATS[n % SEATS.length], outfit: OUTFITS[n % OUTFITS.length] }));
  return free;
}

/** Runs the phases until the next planning (or the production report when `to` says so). */
function advanceTo(state: GameState, to: 'planning' | 'production'): void {
  for (let guard = 0; guard < 12; guard++) {
    advancePhase(state);
    if (state.phase === to) return;
  }
  throw new Error(`never reached ${to}`);
}

const money = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.money;
const reputation = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.reputation;
const orderOf = (state: GameState, id: string) => state.politics!.sabotage.find((o) => o.id === id)!;

/** What the order stream draws for a month's first order: [works, seen] (S4-RULE-3), read from the stream's own seed. */
function firstDraws(seed: number, month: number): { works: number; seen: number } {
  const rng = createRng(seedOf(seed, month, String(POLITICS.sabotage.streamSalt)));
  return { works: rng.next(), seen: rng.next() };
}

/** The first seed in 1..400 whose month-2 order (unguarded) works and is not seen; found by search, never hand-tuned. */
function seedWhereMonth2Works(): number {
  for (let seed = 1; seed <= 400; seed++) {
    const d = firstDraws(seed, 2);
    if (d.works < POLITICS.sabotage.orders.powerCut.success && d.seen >= POLITICS.sabotage.orders.powerCut.detect) return seed;
  }
  throw new Error('no seed in 1..400');
}

/** The first seed in 1..400 whose month-2 order (unguarded) does not work and is not seen. */
function seedWhereMonth2Fails(): number {
  for (let seed = 1; seed <= 400; seed++) {
    const d = firstDraws(seed, 2);
    if (d.works >= POLITICS.sabotage.orders.powerCut.success && d.seen >= POLITICS.sabotage.orders.powerCut.detect) return seed;
  }
  throw new Error('no seed in 1..400');
}

type Fine = ReturnType<typeof fineMeasured>;

interface Played {
  state: GameState;
  /** Month 1: the guarded cut. */
  guarded: { events: MonthEvent[]; made: number; control: number; repBefore: number; repAfter: number };
  /** The Sheriff's fine of 150 on month 1's case, in month 2's planning, before any ban. */
  fine: Fine;
  /** Month 2: the unguarded cut. */
  open: { events: MonthEvent[]; made: number; control: number; order: SabotageOrder };
  /** Month 3: the same capture under the ban at 2, and month 4's fine on it. */
  banned: { events: MonthEvent[]; repBefore: number; repAfter: number; fine: Fine };
}

const eventsOf = (state: GameState) => state.history.at(-1)!.events!;
const lineOf = (state: GameState, tile: number) => state.history.at(-1)!.lines!.find((l) => l.tile === tile)!;

/** The fine as the Sheriff's act moves money, measured around the one call. */
function fineMeasured(state: GameState, orderId: string, base: number) {
  const culprit = orderOf(state, orderId).by!;
  const victim = orderOf(state, orderId).victim!;
  const before = { culprit: money(state, culprit), victim: money(state, victim), fund: state.treasury.money, in: state.colony!.ledger.in.fine ?? 0, out: state.colony!.ledger.out.restitution ?? 0 };
  fineCulprit(state, 'ossa', orderId, base);
  return {
    culprit: before.culprit - money(state, culprit),
    victim: money(state, victim) - before.victim,
    fund: state.treasury.money - before.fund,
    ledgerIn: (state.colony!.ledger.in.fine ?? 0) - before.in,
    ledgerOut: (state.colony!.ledger.out.restitution ?? 0) - before.out,
    order: orderOf(state, orderId),
  };
}

/**
 * One seeded game, driven only through advancePhase and the intent functions. Lena is the saboteur and goes after Brix's Food
 * plot; Ossa is the Sheriff and Kai the Governor (set at the start, as the other tests do: the election is not what is tested).
 * Month 1: Ossa guards the plot, Lena cuts its power. Month 2: Ossa fines that case 150; Lena cuts the unguarded plot again
 * (the seed decides whether it works); Kai proposes the ban at 2. Month 3: all four vote it in, then the same capture under it.
 * Month 4: Ossa fines that 150.
 */
function play(seed: number): Played {
  const state = newGame(seed);
  const tiles = landed(state);
  for (const p of state.players) p.money = START_MONEY;
  state.politics = { ...state.politics!, governor: 'kai', sheriff: 'ossa', election: null };
  const plot = tiles[1]!;
  Object.assign(state.tiles[plot]!, { owner: 'brix', outfit: 'food' });

  // The victim holds its month's Water, so its farm runs whatever the order does (AM-18: every plot drinks).
  const watered = () => {
    const brix = state.players.find((p) => p.id === 'brix')!;
    brix.stock.water = Math.max(brix.stock.water, monthNeeds(state, 'brix').water);
  };
  watered();
  // Month 1: a guarded cut. A copy with no order shows what the plot would have made.
  const noOrder1 = structuredClone(state);
  advanceTo(noOrder1, 'production');
  setGuards(state, 'ossa', [plot]);
  orderSabotage(state, 'lena', { kind: 'powerCut', tile: plot });
  const repBefore1 = reputation(state, 'lena');
  advanceTo(state, 'production');
  const guarded = { events: eventsOf(state), made: lineOf(state, plot).made, control: lineOf(noOrder1, plot).made, repBefore: repBefore1, repAfter: reputation(state, 'lena') };
  const caseId = state.politics!.sabotage[0]!.id;

  // Month 2: the fine, then the unguarded cut, and the ban proposed.
  advanceTo(state, 'planning');
  const fine = fineMeasured(state, caseId, 150);
  watered();
  const noOrder2 = structuredClone(state);
  advanceTo(noOrder2, 'production');
  orderSabotage(state, 'lena', { kind: 'powerCut', tile: plot });
  proposeLaw(state, 'kai', { kind: 'enact', law: 'sabotageBan', setting: POLITICS.laws.sabotageBan.settings[0]! });
  advanceTo(state, 'production');
  const open = { events: eventsOf(state), made: lineOf(state, plot).made, control: lineOf(noOrder2, plot).made, order: state.politics!.sabotage.find((o) => o.month === 2)! };

  // Month 3: the ballot has opened with the planning.
  advanceTo(state, 'planning');
  for (const id of SEATS) castLawVote(state, id, true);
  for (const id of SEATS) councilDone(state, id);
  stepVotes(state, 0);
  closeVotes(state);
  setGuards(state, 'ossa', [plot]);
  orderSabotage(state, 'lena', { kind: 'powerCut', tile: plot });
  const repBefore3 = reputation(state, 'lena');
  advanceTo(state, 'production');
  const caught = state.politics!.sabotage.find((o) => o.month === 3)!;
  const bannedRun = { events: eventsOf(state), repBefore: repBefore3, repAfter: reputation(state, 'lena') };
  advanceTo(state, 'planning');
  return { state, guarded, fine, open, banned: { ...bannedRun, fine: fineMeasured(state, caught.id, 150) } };
}

describe('S4-UBER-AC-1: slice 4 end to end in the engine', () => {
  sabotageOn();

  const caughtMove = POLITICS.reputation.moves.caught;
  const ban = POLITICS.laws.sabotageBan.settings[0]!;
  const BASE_FINE = 150;

  it('S4-UBER-AC-1: a power cut on a plot the Sheriff guards fails and names the saboteur in that month\'s production events', () => {
    const { guarded } = play(seedWhereMonth2Works());
    expect(guarded.control).toBeGreaterThan(0);
    expect(guarded.made).toBe(guarded.control); // the plot makes what it would with no order
    const cut = guarded.events.find((e) => e.key === 'powerCut')!;
    expect(cut.sabotage).toMatchObject({ culprit: 'lena', worked: false, guarded: true });
    expect(cut.plots).toEqual([]);
    expect(guarded.repAfter - guarded.repBefore).toBe(caughtMove);
  });

  it('S4-UBER-AC-1: an unguarded order succeeds or fails on its seeded odds, and when it succeeds its plot makes nothing', () => {
    const worked = play(seedWhereMonth2Works());
    expect(firstDraws(worked.state.seed, 2).works).toBeLessThan(POLITICS.sabotage.orders.powerCut.success);
    expect(worked.open.order).toMatchObject({ outcome: 'done', worked: true, culpritPublic: false });
    expect(worked.open.control).toBeGreaterThan(0);
    expect(worked.open.made).toBe(0);
    expect(worked.open.events.find((e) => e.key === 'powerCut')!.sabotage).toMatchObject({ culprit: null, worked: true, guarded: false });

    const failed = play(seedWhereMonth2Fails());
    expect(firstDraws(failed.state.seed, 2).works).toBeGreaterThanOrEqual(POLITICS.sabotage.orders.powerCut.success);
    expect(failed.open.order).toMatchObject({ outcome: 'failed', worked: false, culpritPublic: false });
    expect(failed.open.made).toBe(failed.open.control); // a failed, unseen order changes nothing
    expect(failed.open.events.some((e) => e.key === 'powerCut')).toBe(false);
  });

  it('S4-UBER-AC-1: a fine of 150 moves 150 from the culprit, 75 to the victim and 75 to the fund, with the fine and restitution lines', () => {
    const { fine } = play(seedWhereMonth2Works());
    const toVictim = Math.round(BASE_FINE * POLITICS.sheriff.victimShare);
    expect(toVictim).toBe(75);
    expect(fine).toMatchObject({ culprit: BASE_FINE, victim: toVictim, fund: BASE_FINE - toVictim, ledgerIn: BASE_FINE, ledgerOut: toVictim });
    expect(fine.order.fine).toMatchObject({ base: BASE_FINE, due: BASE_FINE, paid: BASE_FINE, toVictim, by: 'sheriff' });
  });

  it('S4-UBER-AC-1: under the ban at 2 the same capture costs 300 and twice the reputation', () => {
    const { state, banned } = play(seedWhereMonth2Works());
    expect(state.politics!.laws.sabotageBan?.setting).toBe(ban);
    const cut = banned.events.find((e) => e.key === 'powerCut')!;
    expect(cut.sabotage).toMatchObject({ culprit: 'lena', worked: false, guarded: true });
    expect(banned.repAfter - banned.repBefore).toBe(caughtMove * ban);
    expect(banned.fine.culprit).toBe(BASE_FINE * ban);
    expect(banned.fine.culprit).toBe(300);
    const toVictim = Math.round(BASE_FINE * ban * POLITICS.sheriff.victimShare);
    expect(banned.fine).toMatchObject({ victim: toVictim, fund: BASE_FINE * ban - toVictim, ledgerIn: BASE_FINE * ban, ledgerOut: toVictim });
    expect(banned.fine.order.fine).toMatchObject({ base: BASE_FINE, due: BASE_FINE * ban, paid: BASE_FINE * ban });
  });
});

// --- S4-T-AC-11 (engine): the off switches ---------------------------------------------------------------------

/**
 * Six months of phases (36 advancePhase steps) of one seeded game, three plots to a seat, nobody acting. `each` sees the state after
 * every step; the return is the stableJson of the state at every step. Measured once against the base (5fb32c30) by hand, not pinned.
 */
function sixMonths(politics: boolean, each: (state: GameState) => void = () => undefined): string[] {
  const state = createGame({ seed: 11, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
  state.tiles.map((t, i) => [t, i] as const).filter(([t]) => t.terrain !== 'store' && t.owner === null).map(([, i]) => i).slice(0, 12)
    .forEach((tile, n) => Object.assign(state.tiles[tile]!, { owner: state.players[n % 4]!.id, outfit: OUTFITS[n % 4] }));
  const steps: string[] = [];
  for (let step = 0; step < 36 && state.phase !== 'gameOver'; step++) {
    advancePhase(state);
    each(state);
    steps.push(stableJson(state));
  }
  expect(state.month).toBe(7);
  return steps;
}

describe('S4-T-AC-11 (engine): the switches off change nothing', () => {
  it('S4-T-AC-11 (engine): the shipped config is both offices off and sabotage off (AM-2)', () => {
    expect(POLITICS.sabotage.on).toBe(false);
    expect(POLITICS.offices).toEqual(['governor']);
  });

  describe('politics off', () => {
    sabotageOn();

    it('S4-T-AC-11 (engine): the same seed with POLITICS.sabotage.on true and false gives identical stableJson at every one of 36 steps', () => {
      const on = sixMonths(false);
      POLITICS.sabotage.on = false;
      const off = sixMonths(false);
      expect(on).toHaveLength(36);
      expect(on).toEqual(off);
    });
  });

  it('S4-T-AC-11 (engine): sabotage off (the shipped default) with politics on, over 36 steps the sabotage lists stay empty and no sabotage event is filed', () => {
    expect(POLITICS.sabotage.on).toBe(false);
    const steps = sixMonths(true, (state) => {
      expect(state.politics!.sabotage).toEqual([]);
      expect(state.politics!.guards).toEqual([]);
      expect(state.politics!.rumoured).toEqual([]);
      const filed = [...state.monthEvents, ...state.history.flatMap((h) => h.events ?? [])];
      expect(filed.filter((e) => e.sabotage || (e.kind as string) === 'sabotage')).toEqual([]);
    });
    expect(steps).toHaveLength(36);
  });

  it('S4-T-AC-11 (engine): sabotage off, no order is accepted and no incident is filed', () => {
    const state = newGame(11);
    const tiles = landed(state);
    state.players[0]!.money = START_MONEY;
    const theirs = tiles.find((t) => state.tiles[t]!.owner === 'brix')!;
    for (const target of [{ kind: 'powerCut', tile: theirs } as const, { kind: 'rumour', good: 'food', dir: 'up' } as const]) {
      expect(() => orderSabotage(state, 'lena', target)).toThrow(new RuleError('This game plays without sabotage'));
    }
    expect(() => setGuards(state, 'lena', [theirs])).toThrow(new RuleError('This game plays without sabotage'));
    for (let step = 0; step < 24; step++) advancePhase(state);
    expect(state.politics!.sabotage).toEqual([]);
    expect(state.politics!.guards).toEqual([]);
    expect(state.monthEvents.filter((e) => e.sabotage)).toEqual([]);
    expect(state.history.flatMap((h) => h.events ?? []).filter((e) => e.sabotage)).toEqual([]);
  });
});

// --- S4's §9 and §3: the single writer, and no order without a hand ----------------------------------------------

describe('S4 §9 / §3: no order is ever stored without its orderer', () => {
  sabotageOn();

  /** Twelve months, every seat in turn ordering (cuts, every third month a rumour), the Sheriff guarding, investigating and fining; asserts the invariant after every phase. */
  function walk(seed: number, check: (state: GameState) => void): GameState {
    const state = newGame(seed);
    const tiles = landed(state);
    for (const p of state.players) p.money = START_MONEY * 10;
    state.politics = { ...state.politics!, governor: 'kai', sheriff: 'ossa', election: null };
    for (let month = 1; month <= 12 && state.phase !== 'gameOver'; month++) {
      const by = SEATS[month % SEATS.length]!;
      const mine = (t: number) => state.tiles[t]!.owner === by;
      const target = tiles.find((t) => !mine(t) && state.tiles[t]!.owner !== null)!;
      if (month % 3 === 0) orderSabotage(state, by, { kind: 'rumour', good: 'food', dir: month % 2 ? 'up' : 'down' });
      else orderSabotage(state, by, { kind: 'powerCut', tile: target });
      if (month % 2 === 0) setGuards(state, 'ossa', [target]);
      const open = state.politics!.sabotage.find((o) => o.outcome !== 'pending' && o.outcome !== 'failed' && !o.culpritPublic && o.investigated == null);
      if (open) investigate(state, 'ossa', open.id);
      const unfined = fineable(state, 'ossa')[0];
      if (unfined) fineCulprit(state, 'ossa', unfined, 100);
      check(state);
      do {
        advancePhase(state);
        check(state);
      } while (state.phase !== 'planning' && (state.phase as string) !== 'gameOver');
    }
    return state;
  }

  const noOrderWithoutHand = (state: GameState) => {
    for (const o of state.politics!.sabotage) expect(o.by, `order ${o.id} in month ${o.month}`).not.toBeNull();
  };

  it('S4-T-AC-11 (§3 invariant): in a twelve-month game no order, at any phase, has by === null; and the walk is not vacuous', () => {
    const state = walk(5, noOrderWithoutHand);
    const orders = state.politics!.sabotage;
    expect(orders.length).toBeGreaterThanOrEqual(10);
    expect(orders.some((o) => o.culpritPublic)).toBe(true);
    expect(orders.some((o) => o.fine)).toBe(true);
  });

  it('S4-T-AC-11 (§9 single writer): nothing outside sabotage.ts writes politics.sabotage, politics.guards or politics.rumoured (the grep in the PR checklist)', () => {
    const hits = execFileSync('git', ['grep', '-n', '-E', 'politics(!)?\\.(sabotage|guards|rumoured)[[:space:]]*=', '--', 'packages/engine/src'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((line) => line && !line.startsWith('packages/engine/src/sabotage.ts:'));
    // observe.ts hides secrets on its own copy of the state, the one reviewed exception (hidePolitics works on a clone).
    expect(hits.filter((line) => !line.startsWith('packages/engine/src/observe.ts:'))).toEqual([]);
  });
});
