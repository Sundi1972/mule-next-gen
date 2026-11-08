import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// securitySpend is slice 5's hook and returns 0 until the Security line exists; the tests set it through the module sabotage.ts imports.
const security = vi.hoisted(() => ({ spend: 0 }));
vi.mock('../src/politics.js', async (original) => {
  const real = await original<typeof import('../src/politics.js')>();
  return { ...real, securitySpend: () => security.spend };
});

import {
  canGuard,
  advancePhase,
  canOrder,
  captureOdds,
  createGame,
  observe,
  investigate,
  orderSabotage,
  POLITICS,
  resolveSabotage,
  runFor,
  RuleError,
  setGuards,
  type GameState,
  type SabotageOrder,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const BOUNTY = POLITICS.sheriff.bounty;

beforeEach(() => {
  POLITICS.sabotage.on = true;
  security.spend = 0;
});
afterEach(() => {
  POLITICS.sabotage.on = false;
  security.spend = 0;
});

/** Month 4's planning, Ossa the Sheriff; Brix owns a Food plot, Kai a Smithore one, Ossa a Smithore one; `bare` is owned by nobody. */
function monthOf(seed = 7, sheriff: string | null = 'ossa') {
  const state = createGame({ seed, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  state.month = 4;
  state.politics = { ...state.politics!, governor: 'lena', sheriff, election: null };
  const [food, ore, own, bare] = state.tiles.map((t, i) => [t, i] as const).filter(([t]) => t.terrain !== 'store' && t.owner === null).map(([, i]) => i) as [number, number, number, number];
  Object.assign(state.tiles[food]!, { owner: 'brix', outfit: 'food' });
  Object.assign(state.tiles[ore]!, { owner: 'kai', outfit: 'smithore' });
  Object.assign(state.tiles[own]!, { owner: 'ossa', outfit: 'smithore' });
  state.treasury.money = 1_000;
  for (const p of state.players) p.money = 1_000;
  return { state, food, ore, own, bare };
}

const moneyOf = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.money;
const orders = (state: GameState) => state.politics!.sabotage;
const refusalOf = (run: () => void): string => {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'valid';
};

/** Lena orders a power cut on `tile`, then the month resolves with `guards` posted. */
function cutAndResolve(state: GameState, tile: number, guards: number[] = [], by = 'lena'): SabotageOrder {
  orderSabotage(state, by, { kind: 'powerCut', tile });
  state.politics!.guards = guards;
  resolveSabotage(state);
  return orders(state)[0]!;
}

describe('S4-T-AC-17: the Sheriff may not guard its own plots (AM-11)', () => {
  it('S4-T-AC-17: setGuards refuses a Sheriff-owned tile in the published words and changes nothing', () => {
    const { state, food, own } = monthOf();
    const before = structuredClone(state.politics);
    expect(refusalOf(() => setGuards(state, 'ossa', [food, own]))).toBe("You can't guard your own plots");
    expect(state.politics).toEqual(before);
  });

  it('S4-T-AC-17: canGuard agrees with setGuards on every tile of the map: another player\'s, the Sheriff\'s own, unowned', () => {
    const { state, food, ore, own, bare } = monthOf();
    expect(canGuard(state, 'ossa', food)).toBe(true);
    expect(canGuard(state, 'ossa', ore)).toBe(true);
    expect(canGuard(state, 'ossa', own)).toBe("You can't guard your own plots");
    expect(canGuard(state, 'ossa', bare)).toBe("Guards watch players' plots");
    for (let tile = 0; tile < state.tiles.length; tile++) {
      const can = canGuard(state, 'ossa', tile);
      const said = refusalOf(() => setGuards(structuredClone(state), 'ossa', [tile]));
      expect(said).toBe(can === true ? 'valid' : can);
    }
  });
});

describe('S4-T-AC-18: the Sheriff\'s bounty', () => {
  it('S4-T-AC-18: a guarded catch pays the Sheriff from the fund on the office-pay line and records it on the order', () => {
    const { state, food } = monthOf();
    const [money, fund] = [moneyOf(state, 'ossa'), state.treasury.money];
    const order = cutAndResolve(state, food, [food]);
    expect(order).toMatchObject({ outcome: 'caught', culpritPublic: true, bounty: { to: 'ossa', paid: BOUNTY } });
    expect(moneyOf(state, 'ossa')).toBe(money + BOUNTY);
    expect(state.treasury.money).toBe(fund - BOUNTY);
    expect(state.colony!.ledger.out.officePay).toBe(BOUNTY);
  });

  /** The first seed whose unguarded cut on Brix's plot is seen (caught on the spot) or not. */
  function spotSeed(seen: boolean): number {
    for (let seed = 1; seed <= 300; seed++) {
      const { state, food } = monthOf(seed);
      if ((cutAndResolve(state, food).outcome === 'caught') === seen) return seed;
    }
    throw new Error('no seed');
  }

  it('S4-T-AC-18: a catch on the spot pays no bounty and counts no record', () => {
    const { state, food } = monthOf(spotSeed(true));
    const order = cutAndResolve(state, food);
    expect(order).toMatchObject({ outcome: 'caught', culpritPublic: true });
    expect(order.bounty).toBeUndefined();
    expect(moneyOf(state, 'ossa')).toBe(1_000);
    expect(state.politics!.sheriffRecord).toEqual({ caught: 0, solved: 0 });
  });

  it('S4-T-AC-18: a Sheriff who is the culprit earns nothing for being caught at a guard', () => {
    const { state, food } = monthOf();
    // The Sheriff cannot order (S4-T-AC-21), so the rule is pinned on an order whose orderer is made the Sheriff in the state.
    orderSabotage(state, 'lena', { kind: 'powerCut', tile: food });
    orders(state)[0]!.by = 'ossa';
    state.politics!.guards = [food];
    resolveSabotage(state);
    const order = orders(state)[0]!;
    expect(order).toMatchObject({ by: 'ossa', outcome: 'caught' });
    expect(order.bounty).toBeUndefined();
    expect(state.politics!.sheriffRecord).toEqual({ caught: 0, solved: 0 });
    expect(state.colony!.ledger.out.officePay).toBeUndefined();
  });

  it('S4-T-AC-18: with no Sheriff there is no bounty and no record', () => {
    const { state, food } = monthOf(7, null);
    const order = cutAndResolve(state, food, [food]);
    expect(order).toMatchObject({ outcome: 'caught' });
    expect(order.bounty).toBeUndefined();
    expect(state.politics!.sheriffRecord).toEqual({ caught: 0, solved: 0 });
  });

  it('S4-T-AC-18: a short fund pays what it has, records it, and owes nothing afterwards', () => {
    const { state, food } = monthOf();
    state.treasury.money = 20;
    const order = cutAndResolve(state, food, [food]);
    expect(order.bounty).toEqual({ to: 'ossa', paid: 20 });
    expect(moneyOf(state, 'ossa')).toBe(1_020);
    expect(state.treasury.money).toBe(0);
    // Nothing is owed: a later fund payment is not reduced by an old debt.
    state.treasury.money = 500;
    expect(moneyOf(state, 'ossa')).toBe(1_020);
  });

  it('S4-T-AC-18: an empty fund records a bounty of 0', () => {
    const { state, food } = monthOf();
    state.treasury.money = 0;
    const order = cutAndResolve(state, food, [food]);
    expect(order.bounty).toEqual({ to: 'ossa', paid: 0 });
    expect(moneyOf(state, 'ossa')).toBe(1_000);
    expect(state.politics!.sheriffRecord.caught).toBe(1);
  });

  /** A resolved month-3 rumour of Lena's, unsolved, filed straight into the list. */
  function filed(state: GameState, by: string): SabotageOrder {
    const order: SabotageOrder = { id: 'sab-filed1', by, month: 3, target: { kind: 'rumour', good: 'food', dir: 'up' }, cost: 0, outcome: 'done', culpritPublic: false, victim: null, worked: true, investigated: null, fine: null };
    state.politics = { ...state.politics!, sabotage: [order] };
    return order;
  }

  it('S4-T-AC-18: a solved investigation pays the bounty; a cold one pays nothing', () => {
    let solved = 0;
    let cold = 0;
    for (let seed = 1; seed <= 80 && (!solved || !cold); seed++) {
      const { state } = monthOf(seed);
      const order = filed(state, 'lena');
      const [money, fund] = [moneyOf(state, 'ossa'), state.treasury.money];
      const result = investigate(state, 'ossa', order.id);
      if (result.culpritPublic) {
        solved++;
        expect(result.bounty).toEqual({ to: 'ossa', paid: BOUNTY });
        expect(moneyOf(state, 'ossa')).toBe(money + BOUNTY);
        expect(state.treasury.money).toBe(fund - BOUNTY);
        expect(state.politics!.sheriffRecord).toEqual({ caught: 0, solved: 1 });
      } else {
        cold++;
        expect(result.bounty).toBeUndefined();
        expect(moneyOf(state, 'ossa')).toBe(money);
        expect(state.politics!.sheriffRecord).toEqual({ caught: 0, solved: 0 });
      }
    }
    expect(solved).toBeGreaterThan(0);
    expect(cold).toBeGreaterThan(0);
  });

  it('S4-T-AC-18: a solved investigation of the Sheriff\'s own order pays nothing', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const { state } = monthOf(seed);
      const result = investigate(state, 'ossa', filed(state, 'ossa').id);
      if (!result.culpritPublic) continue;
      expect(result.bounty).toBeUndefined();
      expect(state.politics!.sheriffRecord).toEqual({ caught: 0, solved: 0 });
      return;
    }
    throw new Error('no seed solved');
  });
});

describe('S4-T-AC-19 / S4-B-AC-12: the Sheriff\'s own plots are seen harder', () => {
  const { detect } = POLITICS.sabotage.orders.powerCut;
  const bonus = POLITICS.sheriff.ownPlotDetectBonus;

  function odds(tile: (p: ReturnType<typeof monthOf>) => number, sheriff: string | null = 'ossa', guards: number[] = []): number {
    const m = monthOf(7, sheriff);
    orderSabotage(m.state, 'lena', { kind: 'powerCut', tile: tile(m) });
    m.state.politics!.guards = guards;
    return captureOdds(m.state, orders(m.state)[0]!);
  }

  it('S4-B-AC-12: a power cut is seen with chance 0.5 on the Sheriff\'s plot and 0.3 on anyone else\'s', () => {
    expect(odds((m) => m.own)).toBeCloseTo(detect + bonus);
    expect(odds((m) => m.own)).toBeCloseTo(0.5);
    expect(odds((m) => m.food)).toBe(detect);
  });

  it('S4-T-AC-19: with Security the bonus adds to the Security term; the whole is capped at 1', () => {
    security.spend = 100;
    expect(odds((m) => m.food)).toBeCloseTo(detect + POLITICS.sheriff.securityDetect);
    expect(odds((m) => m.own)).toBeCloseTo(detect + bonus + POLITICS.sheriff.securityDetect);
    security.spend = 100 * 20;
    expect(odds((m) => m.own)).toBe(1);
  });

  it('S4-T-AC-19: a guarded plot is 1, a rumour is unchanged, and with no Sheriff there is no bonus', () => {
    const m = monthOf();
    expect(odds((q) => q.food, 'ossa', [m.food])).toBe(1);
    const rumour = monthOf().state;
    orderSabotage(rumour, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
    expect(captureOdds(rumour, orders(rumour)[0]!)).toBe(POLITICS.sabotage.orders.rumour.detect);
    expect(odds((q) => q.own, null)).toBe(detect);
  });
});

describe('S4-T-AC-20: the Sheriff\'s term record', () => {
  it('S4-T-AC-20: counts guard catches and solved investigations, and nothing else', () => {
    const { state, food } = monthOf();
    cutAndResolve(state, food, [food]);
    expect(state.politics!.sheriffRecord).toEqual({ caught: 1, solved: 0 });
    for (let seed = 1; seed <= 80; seed++) {
      const m = monthOf(seed);
      m.state.politics = { ...m.state.politics!, sabotage: [{ id: 'sab-x', by: 'lena', month: 3, target: { kind: 'rumour', good: 'food', dir: 'up' }, cost: 0, outcome: 'done', culpritPublic: false, victim: null, worked: true, investigated: null, fine: null }] };
      if (investigate(m.state, 'ossa', 'sab-x').culpritPublic) {
        expect(m.state.politics!.sheriffRecord).toEqual({ caught: 0, solved: 1 });
        return;
      }
    }
    throw new Error('no seed solved');
  });
});

describe('S4-B-AC-11 (engine leg): what another seat sees of the bounty', () => {
  it('S4-B-AC-11: the record and a revealed order\'s bounty reach every seat; a hidden order carries none', () => {
    const { state, food, ore } = monthOf();
    cutAndResolve(state, food, [food]);
    const seen = observe(state, 'kai');
    expect(seen.politics!.sheriffRecord).toEqual({ caught: 1, solved: 0 });
    expect(seen.politics!.sabotage[0]).toMatchObject({ by: 'lena', bounty: { to: 'ossa', paid: BOUNTY } });
    expect(seen.politics!.guards).toEqual([]);
    // A failed, unseen order is hidden from others whole.
    const quiet = monthOf().state;
    orderSabotage(quiet, 'lena', { kind: 'powerCut', tile: ore });
    expect(observe(quiet, 'kai').politics!.sabotage).toEqual([]);
  });
});

describe('S4-T-AC-17 (list order): a list is refused by the first row that matches over the whole list', () => {
  it('S4-T-AC-17: [unowned, own] and [own, unowned] both give the own-plot words', () => {
    const { state, own, bare, food } = monthOf();
    for (const list of [[bare, own], [own, bare], [food, bare, own], [own, food, bare]]) {
      expect(refusalOf(() => setGuards(state, 'ossa', list)), JSON.stringify(list)).toBe("You can't guard your own plots");
    }
    expect(refusalOf(() => setGuards(state, 'ossa', [food, bare]))).toBe("Guards watch players' plots");
  });
});

describe('S4-T-AC-21: the sitting Sheriff does not sabotage (AM-11 item 5)', () => {
  const cutOn = (tile: number) => ({ kind: 'powerCut' as const, tile });
  const rumour = { kind: 'rumour' as const, good: 'food' as const, dir: 'up' as const };

  it('S4-T-AC-21: the Sheriff\'s cut and rumour are refused in the published words, and canOrder says sheriff', () => {
    const { state, food } = monthOf();
    const before = structuredClone(state.politics);
    expect(canOrder(state, 'ossa')).toBe('sheriff');
    expect(canOrder(state, 'lena')).toBe(true);
    expect(refusalOf(() => orderSabotage(state, 'ossa', cutOn(food)))).toBe("The Sheriff can't order sabotage");
    expect(refusalOf(() => orderSabotage(state, 'ossa', rumour))).toBe("The Sheriff can't order sabotage");
    expect(refusalOf(() => orderSabotage(state, 'ossa', null)), 'a withdrawal is refused too').toBe("The Sheriff can't order sabotage");
    expect(state.politics).toEqual(before);
    // The off and not-planning rows come first.
    state.phase = 'auction';
    expect(canOrder(state, 'ossa')).toBe('notPlanning');
  });

  it('S4-T-AC-21: a Sheriff whose term ended may order again', () => {
    const { state, food } = monthOf();
    state.politics = { ...state.politics!, sheriff: 'kai' };
    orderSabotage(state, 'ossa', cutOn(food));
    expect(orders(state)).toHaveLength(1);
  });

  it('S4-T-AC-21: an order placed during the election by the player who then takes the Sheriff\'s office is withdrawn at takeOffice, money unchanged', () => {
    const saved = POLITICS.offices;
    POLITICS.offices = ['governor', 'sheriff'];
    try {
      const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
      const free = state.tiles.map((t, i) => [t, i] as const).filter(([t]) => t.terrain !== 'store' && t.owner === null).map(([, i]) => i);
      Object.assign(state.tiles[free[0]!]!, { owner: 'brix', outfit: 'food' });
      for (const p of state.players) p.money = 1_000;
      runFor(state, 'lena', 'governor', { kind: 'hold' });
      runFor(state, 'ossa', 'sheriff');
      orderSabotage(state, 'ossa', { kind: 'powerCut', tile: free[0]! });
      orderSabotage(state, 'lena', { kind: 'powerCut', tile: free[0]! });
      // An earlier month's resolved order of Ossa's is history and stays; only this month's pending one goes.
      const old: SabotageOrder = { id: 'sab-old001', by: 'ossa', month: state.month - 1, target: { kind: 'rumour', good: 'food', dir: 'up' }, cost: 0, outcome: 'done', culpritPublic: false, victim: null, worked: true };
      state.politics = { ...state.politics!, sabotage: [old, ...orders(state)] };
      expect(orders(state)).toHaveLength(3);
      advancePhase(state);
      expect(state.politics!.sheriff).toBe('ossa');
      expect(orders(state).map((o) => [o.by, o.id])).toEqual([['ossa', 'sab-old001'], ['lena', expect.any(String)]]);
      expect(moneyOf(state, 'ossa')).toBe(1_000);
    } finally {
      POLITICS.offices = saved;
    }
  });
});
