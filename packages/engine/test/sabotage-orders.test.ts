import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// S4-T-AC-4's spy: a pass-through that records pactBreach with the saboteur's reputation at the moment of the call, so
// the order of the two hooks shows (reputationShift has already run if the reputation has moved). vi.spyOn on an ESM
// namespace would not intercept sabotage.ts's own import; vi.mock replaces the module sabotage.ts imports. politics.js
// cannot be wrapped the same way (it imports sabotage.js, so its mock factory would load a cycle), hence the reading.
const hooks = vi.hoisted(() => ({ calls: [] as { fn: 'pactBreach'; args: unknown[]; reputation: number }[] }));
vi.mock('../src/diplomacy.js', async (original) => {
  const real = await original<typeof import('../src/diplomacy.js')>();
  return {
    ...real,
    pactBreach: (...args: Parameters<typeof real.pactBreach>) => {
      hooks.calls.push({ fn: 'pactBreach', args, reputation: args[0].players.find((p) => p.id === args[1])!.reputation });
      return real.pactBreach(...args);
    },
  };
});
import {
  advancePhase,
  captureOdds,
  createGame,
  createRng,
  GOODS,
  goodWords,
  guardsMax,
  investigate,
  orderSabotage,
  POLITICS,
  reputationReasons,
  resolveSabotage,
  RuleError,
  sabotagePossible,
  sabotageEvents,
  seedOf,
  START,
  storeEvent,
  type EventKey,
  type GameState,
  type MonthEvent,
  type SabotageOrder,
  type SabotageTarget,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa'];
const NAME = (id: string) => id[0]!.toUpperCase() + id.slice(1);

/** Sabotage is built off (AM-2): every test here switches it on and puts the config's value back after. */
function sabotageOn(): void {
  let saved: boolean;
  beforeEach(() => {
    saved = POLITICS.sabotage.on;
    POLITICS.sabotage.on = true;
  });
  afterEach(() => {
    POLITICS.sabotage.on = saved;
  });
}

function newGame(options: { politics?: boolean; seed?: number } = {}): GameState {
  return createGame({ seed: options.seed ?? 7, players: SEATS.map((id) => ({ id, name: NAME(id), isAi: false })), politics: options.politics });
}

/** Brix owns a Food plot, Ossa an unoutfitted one and a green belt; the rest are free. Returns their indices. */
function plots(state: GameState) {
  const free = state.tiles.map((t, i) => [t, i] as const).filter(([t]) => t.terrain !== 'store' && t.owner === null);
  const [food, bare, belt, own, none] = free.map(([, i]) => i) as [number, number, number, number, number];
  Object.assign(state.tiles[food]!, { owner: 'brix', outfit: 'food' });
  Object.assign(state.tiles[bare]!, { owner: 'ossa', outfit: null });
  Object.assign(state.tiles[belt]!, { owner: 'ossa', outfit: 'greenBelt' });
  Object.assign(state.tiles[own]!, { owner: 'lena', outfit: 'smithore' });
  return { food, bare, belt, own, none };
}

function refused(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  throw new Error('expected a RuleError');
}

describe('sabotage orders', () => {
  describe('with sabotage on', () => {
    sabotageOn();

    type Row = { row: string; setup?: (s: GameState) => void; target: (p: ReturnType<typeof plots>) => SabotageTarget | null; message?: (s: GameState) => string };
    const cutOn = (pick: keyof ReturnType<typeof plots>) => (p: ReturnType<typeof plots>): SabotageTarget => ({ kind: 'powerCut', tile: p[pick] });
    const rows: Row[] = [
      { row: 'row 2: not planning', setup: (s) => void (s.phase = 'development'), target: cutOn('food'), message: () => 'Orders are given in planning' },
      { row: 'row 4: a plot owned by nobody', target: cutOn('none'), message: () => "Pick another player's plot" },
      { row: 'row 4: the orderer\'s own plot', target: cutOn('own'), message: () => "Pick another player's plot" },
      { row: 'row 5: a plot with no MULE', target: cutOn('bare'), message: () => 'That plot makes nothing to cut' },
      { row: 'row 5: a green belt', target: cutOn('belt'), message: () => 'That plot makes nothing to cut' },
      { row: 'AM-4: a rumour whose direction is neither up nor down', target: () => ({ kind: 'rumour', good: 'food', dir: 'sideways' as never }), message: () => 'A rumour moves a price up or down' },
      { row: 'row 6: a rumour on something that is no good', target: () => ({ kind: 'rumour', good: 'gold' as never, dir: 'up' }), message: () => 'Pick a good' },
      {
        row: 'row 7: money under the cost',
        setup: (s) => void (s.players[0]!.money = POLITICS.sabotage.orders.rumour.cost - 1),
        target: () => ({ kind: 'rumour', good: 'food', dir: 'up' }),
        message: (s) => `A crew costs ${POLITICS.sabotage.orders.rumour.cost} cr; you have ${s.players[0]!.money}`,
      },
    ];

    it.each(rows)('S4-T-AC-1: S4-RULE-2 $row is refused with its message and leaves the list unchanged', ({ setup, target, message }) => {
      const state = newGame();
      const p = plots(state);
      state.players[0]!.money = 1_000;
      // A standing order of Lena's, to show a refusal does not withdraw or replace it.
      orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'down' });
      setup?.(state);
      const before = structuredClone(state.politics!.sabotage);
      expect(refused(() => orderSabotage(state, 'lena', target(p)!))).toBe(message!(state));
      expect(state.politics!.sabotage).toEqual(before);
    });

    it('S4-T-AC-1: S4-RULE-2 row 1: politics off refuses "This game plays without sabotage" and files nothing', () => {
      const state = newGame({ politics: false });
      expect(state.politics).toBeNull();
      expect(refused(() => orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' }))).toBe('This game plays without sabotage');
      expect(state.politics).toBeNull();
    });

    it('S4-T-AC-1: S4-RULE-2 row 1: POLITICS.sabotage.on false refuses the same words', () => {
      POLITICS.sabotage.on = false;
      const state = newGame();
      expect(refused(() => orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' }))).toBe('This game plays without sabotage');
      expect(state.politics!.sabotage).toEqual([]);
    });

    it('S4-T-AC-1: S4-RULE-2 row 8: a power cut on another player\'s working plot is a pending order with the kind\'s cost now', () => {
      const state = newGame();
      const { food } = plots(state);
      orderSabotage(state, 'lena', { kind: 'powerCut', tile: food });
      expect(state.politics!.sabotage).toHaveLength(1);
      expect(state.politics!.sabotage[0]).toMatchObject({
        by: 'lena',
        month: state.month,
        target: { kind: 'powerCut', tile: food },
        cost: POLITICS.sabotage.orders.powerCut.cost,
        outcome: 'pending',
        culpritPublic: false,
      });
      expect(state.politics!.sabotage[0]!.id).toMatch(/^sab-[0-9a-z]{6}$/);
    });

    it('S4-T-AC-1: S4-RULE-2 row 8: a rumour on every good is valid, up or down, and costs nothing until upkeep', () => {
      for (const good of GOODS) {
        for (const dir of ['up', 'down'] as const) {
          const state = newGame();
          const money = state.players[0]!.money;
          orderSabotage(state, 'lena', { kind: 'rumour', good, dir });
          expect(state.politics!.sabotage[0]).toMatchObject({ target: { kind: 'rumour', good, dir }, cost: POLITICS.sabotage.orders.rumour.cost });
          expect(state.players[0]!.money).toBe(money);
        }
      }
    });

    it('S4-T-AC-1: S4-RULE-2 row 8: a second order replaces the first, so the list holds one pending order per player per month', () => {
      const state = newGame();
      const { food } = plots(state);
      orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
      orderSabotage(state, 'brix', { kind: 'rumour', good: 'water', dir: 'up' });
      orderSabotage(state, 'lena', { kind: 'powerCut', tile: food });
      const lena = state.politics!.sabotage.filter((o) => o.by === 'lena');
      expect(lena).toHaveLength(1);
      expect(lena[0]!.target).toEqual({ kind: 'powerCut', tile: food });
      expect(state.politics!.sabotage).toHaveLength(2);
    });

    it('S4-T-AC-1: S4-RULE-2 row 3: null withdraws the player\'s order, with no charge, and with none standing it does nothing', () => {
      const state = newGame();
      const money = state.players[0]!.money;
      orderSabotage(state, 'lena', null);
      expect(state.politics!.sabotage).toEqual([]);
      orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
      orderSabotage(state, 'brix', { kind: 'rumour', good: 'food', dir: 'up' });
      orderSabotage(state, 'lena', null);
      expect(state.politics!.sabotage.map((o) => o.by)).toEqual(['brix']);
      expect(state.players[0]!.money).toBe(money);
    });

    it('S4-T-AC-1: S4-RULE-2 row 3 comes before row 7: a withdrawal needs no money', () => {
      const state = newGame();
      orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
      state.players[0]!.money = 0;
      orderSabotage(state, 'lena', null);
      expect(state.politics!.sabotage).toEqual([]);
    });

    it('S4-T-AC-1: S4-RULE-2 row 7 compares money with the kind\'s cost now, not an earlier order\'s', () => {
      const state = newGame();
      const { food } = plots(state);
      const { powerCut, rumour } = POLITICS.sabotage.orders;
      expect(powerCut.cost).toBeGreaterThan(rumour.cost);
      state.players[0]!.money = rumour.cost;
      orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
      expect(refused(() => orderSabotage(state, 'lena', { kind: 'powerCut', tile: food }))).toBe(`A crew costs ${powerCut.cost} cr; you have ${rumour.cost}`);
      // The refusal left the cheaper order standing.
      expect(state.politics!.sabotage.map((o) => o.target.kind)).toEqual(['rumour']);
    });

    it('S4-T-AC-1: the id is "sab-" and six base-36 characters, the same on a replay of the same seed, and differs from an earlier order\'s', () => {
      const place = (seed: number) => {
        const state = newGame({ seed });
        orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
        orderSabotage(state, 'brix', { kind: 'rumour', good: 'food', dir: 'up' });
        return state.politics!.sabotage.map((o) => o.id);
      };
      const first = place(7);
      expect(first.every((id) => /^sab-[0-9a-z]{6}$/.test(id))).toBe(true);
      expect(place(7)).toEqual(first);
      expect(new Set(first).size).toBe(first.length);
      expect(place(8)).not.toEqual(first);
    });

    it('S4-T-AC-1: AM-4 a replacement keeps its id, and the id is the same whether or not another player ordered first (no leak)', () => {
      const lenaId = (brixOrders: boolean, replace: boolean) => {
        const state = newGame();
        const { food } = plots(state);
        if (brixOrders) orderSabotage(state, 'brix', { kind: 'rumour', good: 'water', dir: 'up' });
        orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
        if (replace) orderSabotage(state, 'lena', { kind: 'powerCut', tile: food });
        return state.politics!.sabotage.find((o) => o.by === 'lena')!.id;
      };
      const alone = lenaId(false, false);
      expect(lenaId(true, false)).toBe(alone);
      expect(lenaId(true, true)).toBe(alone);
      // Lena orders, Brix orders, Lena replaces: her id has not moved.
      const state = newGame();
      orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
      const first = state.politics!.sabotage[0]!.id;
      orderSabotage(state, 'brix', { kind: 'rumour', good: 'water', dir: 'up' });
      orderSabotage(state, 'lena', { kind: 'rumour', good: 'energy', dir: 'down' });
      expect(state.politics!.sabotage.find((o) => o.by === 'lena')!.id).toBe(first);
    });

    it('S4-T-AC-1: AM-4 an order that went void in one month and a later order of another player never share an id', () => {
      const state = newGame();
      const { food } = plots(state);
      state.month = 2;
      state.players[0]!.money = 1_000;
      orderSabotage(state, 'lena', { kind: 'powerCut', tile: food });
      const voidId = state.politics!.sabotage[0]!.id;
      state.tiles[food]!.owner = null;
      resolveSabotage(state);
      expect(state.politics!.sabotage).toEqual([]);
      state.month = 3;
      orderSabotage(state, 'brix', { kind: 'rumour', good: 'food', dir: 'up' });
      expect(state.politics!.sabotage[0]!.id).not.toBe(voidId);
      // And over a longer game: every (month, orderer) pair has its own id.
      const ids = new Set<string>();
      for (let month = 1; month <= 12; month++) {
        const game = newGame();
        game.month = month;
        for (const by of SEATS) orderSabotage(game, by, { kind: 'rumour', good: 'food', dir: 'up' });
        for (const o of game.politics!.sabotage) ids.add(o.id);
      }
      expect(ids.size).toBe(12 * SEATS.length);
    });

    it('S4-T-AC-1: AM-4 a replay on the same seed gives the same ids, month by month', () => {
      const run = () => {
        const state = newGame({ seed: 21 });
        const out: string[] = [];
        for (let month = 1; month <= 3; month++) {
          state.month = month;
          for (const by of SEATS) orderSabotage(state, by, { kind: 'rumour', good: 'food', dir: 'up' });
        }
        for (const o of state.politics!.sabotage) out.push(o.id);
        return out;
      };
      expect(run()).toEqual(run());
    });

    it('S4-T-AC-1: an order of a later month files beside the old ones, which stay for the game', () => {
      const state = newGame();
      orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
      state.politics!.sabotage[0]!.outcome = 'done';
      state.month = 2;
      orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
      expect(state.politics!.sabotage).toHaveLength(2);
      expect(state.politics!.sabotage[0]!.outcome).toBe('done');
      expect(state.politics!.sabotage[1]).toMatchObject({ month: 2, outcome: 'pending' });
    });

    it('S4-T-AC-1: planning opening empties the Sheriff\'s guards and leaves the orders', async () => {
      const { openPlanning } = await import('../src/index.js');
      const state = newGame();
      orderSabotage(state, 'lena', { kind: 'rumour', good: 'food', dir: 'up' });
      state.politics!.guards = [3, 4];
      state.month = 2;
      openPlanning(state);
      expect(state.politics!.guards).toEqual([]);
      expect(state.politics!.sabotage).toHaveLength(1);
    });
  });
});

// --- Task S4-1.3: resolution, and the power cut as a production event -------------------------------------------------

/** Lena orders against Brix's Food plot (and Ossa's other plots); everything is seeded from `seed`. Month 2, no election. */
function monthOfSabotage(seed: number, orders: { by: string; target: (p: ReturnType<typeof plots>) => SabotageTarget }[], guard: (p: ReturnType<typeof plots>) => number[] = () => []) {
  const state = newGame({ seed });
  state.month = 2;
  state.politics = { ...state.politics!, governor: 'lena', election: null };
  const p = plots(state);
  for (const o of orders) {
    state.players.find((x) => x.id === o.by)!.money = 1_000;
    orderSabotage(state, o.by, o.target(p));
  }
  state.politics!.guards = guard(p);
  return { state, p };
}

/** The raw draws the order stream gives a month: [works, seen] for each non-void order in seat order (S4-RULE-3's `draws` line). */
function draws(state: GameState, count: number): { works: number; seen: number }[] {
  const rng = createRng(seedOf(state.seed, state.month, String(POLITICS.sabotage.streamSalt)));
  return Array.from({ length: count }, () => ({ works: rng.next(), seen: rng.next() }));
}

/** The first seed in 1..400 whose single-order month draws the wanted (works, seen) pair; found by search, never hand-tuned. */
function seedFor(want: { works: boolean; seen: boolean }, target: Parameters<typeof monthOfSabotage>[1][0]['target'], guard?: Parameters<typeof monthOfSabotage>[2]): number {
  for (let seed = 1; seed <= 400; seed++) {
    const { state } = monthOfSabotage(seed, [{ by: 'lena', target }], guard);
    const order = state.politics!.sabotage[0]!;
    const [d] = draws(state, 1);
    const terms = POLITICS.sabotage.orders[order.target.kind];
    if (d!.works < terms.success === want.works && d!.seen < captureOdds(state, order) === want.seen) return seed;
  }
  throw new Error('no seed draws that pair');
}

const cutBrix = (p: ReturnType<typeof plots>): SabotageTarget => ({ kind: 'powerCut', tile: p.food });
const rumourFood: SabotageTarget = { kind: 'rumour', good: 'food', dir: 'up' };

describe('sabotage resolution', () => {
  sabotageOn();

  it('S4-T-AC-2: S4-RULE-3 row 1: a cut whose plot lost its owner, changed hands to the orderer, or lost its MULE is void and removed, with no draw', () => {
    const lost: ((s: GameState, p: ReturnType<typeof plots>) => void)[] = [
      (s, p) => void (s.tiles[p.food]!.owner = null),
      (s, p) => void (s.tiles[p.food]!.owner = 'lena'),
      (s, p) => void (s.tiles[p.food]!.outfit = null),
      (s, p) => void (s.tiles[p.food]!.outfit = 'greenBelt'),
    ];
    for (const lose of lost) {
      // Ossa's order is second in seat order: if the void order drew, Ossa's would draw other values than the first pair.
      const { state, p } = monthOfSabotage(11, [
        { by: 'lena', target: cutBrix },
        { by: 'ossa', target: () => rumourFood },
      ]);
      lose(state, p);
      resolveSabotage(state);
      expect(state.politics!.sabotage.map((o) => o.by)).toEqual(['ossa']);
      const [first] = draws(state, 1);
      const terms = POLITICS.sabotage.orders.rumour;
      const worked = first!.works < terms.success;
      const seen = first!.seen < captureOdds(state, state.politics!.sabotage[0]!);
      expect(state.politics!.sabotage[0]).toMatchObject({ outcome: worked ? (seen ? 'caught' : 'done') : seen ? 'caught' : 'failed' });
    }
  });

  const cases = [
    { row: 3, want: { works: true, seen: true }, outcome: 'caught', worked: true, public: true },
    { row: 4, want: { works: true, seen: false }, outcome: 'done', worked: true, public: false },
    { row: 5, want: { works: false, seen: true }, outcome: 'caught', worked: false, public: true },
    { row: 6, want: { works: false, seen: false }, outcome: 'failed', worked: false, public: false },
  ] as const;

  it.each(cases)('S4-T-AC-2: S4-RULE-3 row $row: a power cut that works=$want.works and is seen=$want.seen is $outcome, worked $worked, culpritPublic $public, victim the owner now', ({ want, outcome, worked, public: isPublic }) => {
    const seed = seedFor(want, cutBrix);
    const { state, p } = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }]);
    // Kai buys the plot between the order and production: the victim is the owner now.
    state.tiles[p.food]!.owner = 'ossa';
    resolveSabotage(state);
    expect(state.politics!.sabotage[0]).toMatchObject({ outcome, worked, culpritPublic: isPublic, victim: 'ossa' });
  });

  it.each(cases)('S4-T-AC-2: S4-RULE-3 row $row, a rumour: the same verdict with victim null', ({ want, outcome, worked, public: isPublic }) => {
    const seed = seedFor(want, () => rumourFood);
    const { state } = monthOfSabotage(seed, [{ by: 'lena', target: () => rumourFood }]);
    resolveSabotage(state);
    expect(state.politics!.sabotage[0]).toMatchObject({ outcome, worked, culpritPublic: isPublic, victim: null });
  });

  it('S4-T-AC-2: S4-RULE-3 row 2: a guarded plot is caught and not worked whatever the draws, victim the owner', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { state } = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }], (p) => [p.food]);
      resolveSabotage(state);
      expect(state.politics!.sabotage[0]).toMatchObject({ outcome: 'caught', worked: false, culpritPublic: true, victim: 'brix' });
    }
  });

  it('S4-T-AC-2: only the first guardsMax tiles of the guards list guard (the rest guard nothing)', () => {
    const { state, p } = monthOfSabotage(3, [{ by: 'lena', target: cutBrix }], (q) => [q.own, q.bare, q.food]);
    expect(guardsMax(state)).toBe(POLITICS.sheriff.guards);
    expect(captureOdds(state, state.politics!.sabotage[0]!)).toBe(POLITICS.sabotage.orders.powerCut.detect);
    state.politics!.guards = [p.food, p.own, p.bare];
    expect(captureOdds(state, state.politics!.sabotage[0]!)).toBe(1);
  });

  it('S4-T-AC-2: captureOdds is the chance of being seen: detect, 1 when guarded, and a rumour is never guarded', () => {
    const { state } = monthOfSabotage(3, [{ by: 'lena', target: cutBrix }, { by: 'ossa', target: () => rumourFood }]);
    const [cut, rumour] = state.politics!.sabotage as [SabotageOrder, SabotageOrder];
    expect(captureOdds(state, cut)).toBe(POLITICS.sabotage.orders.powerCut.detect);
    expect(captureOdds(state, rumour)).toBe(POLITICS.sabotage.orders.rumour.detect);
    state.politics!.guards = [(cut.target as { tile: number }).tile];
    expect(captureOdds(state, cut)).toBe(1);
    expect(captureOdds(state, rumour)).toBe(POLITICS.sabotage.orders.rumour.detect);
  });

  it('S4-T-AC-2: both draws are made for every non-void order whatever the guard: the next order\'s outcome is the same guarded or not', () => {
    let differed = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const two = [
        { by: 'lena', target: cutBrix },
        { by: 'ossa', target: () => rumourFood },
      ];
      const guarded = monthOfSabotage(seed, two, (p) => [p.food]);
      const open = monthOfSabotage(seed, two);
      resolveSabotage(guarded.state);
      resolveSabotage(open.state);
      const [g1, g2] = guarded.state.politics!.sabotage;
      const [o1, o2] = open.state.politics!.sabotage;
      expect(g1!.outcome).toBe('caught');
      expect(g2).toMatchObject({ outcome: o2!.outcome, worked: o2!.worked, culpritPublic: o2!.culpritPublic });
      if (g1!.outcome !== o1!.outcome) differed++;
    }
    // The guard changed the first order in some seeds, so the comparison above had something to prove.
    expect(differed).toBeGreaterThan(0);
  });

  it('S4-T-AC-2: orders resolve in seat order, not in the order they were placed', () => {
    const state = monthOfSabotage(5, [
      { by: 'ossa', target: () => rumourFood },
      { by: 'lena', target: cutBrix },
    ]).state;
    const [lena, ossa] = draws(state, 2);
    resolveSabotage(state);
    const byWho = Object.fromEntries(state.politics!.sabotage.map((o) => [o.by, o]));
    expect(state.politics!.sabotage.map((o) => o.outcome)).not.toContain('pending');
    const seenBy = (d: { works: number; seen: number }, order: SabotageOrder) => d.seen < captureOdds(state, order);
    expect(byWho.lena!.culpritPublic).toBe(seenBy(lena!, byWho.lena!));
    expect(byWho.ossa!.culpritPublic).toBe(seenBy(ossa!, byWho.ossa!));
  });

  it('S4-T-AC-2: a what-if copy resolves nothing, and neither does a month of no orders', () => {
    const { state } = monthOfSabotage(5, [{ by: 'lena', target: cutBrix }]);
    const copy = structuredClone(state);
    const real = structuredClone(state);
    resolveSabotage(real);
    expect(real.politics!.sabotage[0]!.outcome).not.toBe('pending');
    copy.whatIf = true;
    resolveSabotage(copy);
    expect(copy.politics!.sabotage[0]!.outcome).toBe('pending');
    expect(sabotageEvents(copy)).toEqual([]);
    const none = newGame();
    resolveSabotage(none);
    expect(none.politics!.sabotage).toEqual([]);
  });

  it('S4-T-AC-2: an order resolves once: a second resolveSabotage in the month changes nothing', () => {
    const { state } = monthOfSabotage(5, [{ by: 'lena', target: cutBrix }]);
    resolveSabotage(state);
    expect(state.politics!.sabotage[0]!.outcome).not.toBe('pending');
    const once = structuredClone(state.politics!.sabotage);
    resolveSabotage(state);
    expect(state.politics!.sabotage).toEqual(once);
  });

  // Task S4-1.3, steps 3: the shape of a sabotage event.
  const EVERY_KEY: Record<EventKey, true> = {
    dustStorm: true, drought: true, acidRain: true, solarFlare: true, cometPass: true, flood: true, volcanicAsh: true, pestSwarm: true,
    wildfire: true, bumperHarvest: true, cavernCollapse: true, federationTax: true, federationGrant: true, immigrationWave: true,
    inheritance: true, muleTheft: true, epidemic: true, coldSnap: true, meteorStrike: true, pirateRaid: true, storeFire: true,
    ratsInSilo: true, crookedAccountant: true, packageFromHome: true, festival: true, generalStrike: true, emigrationWave: true,
    blamedForUnrest: true, storeStrike: true, walkout: true, loyalCrew: true, riot: true, volunteerCleanup: true, powerCut: true,
    marketRumour: true,
  };

  it("S4-T-AC-14 (engine): only powerCut and marketRumour have kind 'sabotage' or a title starting \"Sabotage\"; no colony event has either", () => {
    const state = newGame();
    for (const key of Object.keys(EVERY_KEY) as EventKey[]) {
      const event = storeEvent(state, key, 'production');
      const sabotage = key === 'powerCut' || key === 'marketRumour';
      expect(event.kind === 'sabotage', key).toBe(sabotage);
      expect(event.title.startsWith('Sabotage'), key).toBe(sabotage);
    }
  });

  it("S4-T-AC-14 (engine): every event sabotageEvents files has kind 'sabotage' and a title starting \"Sabotage\"", () => {
    let filed: MonthEvent[] = [];
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = monthOfSabotage(seed, [
        { by: 'lena', target: cutBrix },
        { by: 'ossa', target: () => rumourFood },
      ]);
      resolveSabotage(state);
      filed = filed.concat(sabotageEvents(state));
    }
    expect(filed.length).toBeGreaterThan(0);
    // Both kinds are among the seeds, so the loop below checks a rumour's event too.
    expect(filed.some((e) => e.key === 'marketRumour')).toBe(true);
    expect(filed.some((e) => e.key === 'powerCut')).toBe(true);
    for (const event of filed) {
      expect(event.kind).toBe('sabotage');
      expect(event.title.startsWith('Sabotage')).toBe(true);
      expect(['powerCut', 'marketRumour']).toContain(event.key);
    }
  });
});

// --- The month through advancePhase: the wiring (Task S4-1.10) ----------------------------------------------------

/** Runs the month from planning through to the production report: the wiring of game.ts and production.ts is what is tested. */
function throughProduction(state: GameState) {
  for (let guard = 0; guard < 8 && state.phase !== 'production'; guard++) advancePhase(state);
  expect(state.phase).toBe('production');
  const report = state.history.at(-1)!;
  return { report, lines: report.lines!, events: report.events! };
}

describe('a sabotage month through advancePhase', () => {
  sabotageOn();

  const lineOf = (lines: ReturnType<typeof throughProduction>['lines'], tile: number) => lines.find((l) => l.tile === tile)!;

  it('S4-T-AC-3: the cut\'s part is the plot line\'s last (why \'event\', event \'powerCut\'), the line makes 0, and runMonths still counts', () => {
    const seed = seedFor({ works: true, seen: false }, cutBrix);
    const control = monthOfSabotage(seed, []);
    const cut = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }]);
    const before = cut.state.tiles[cut.p.food]!.runMonths;
    const base = lineOf(throughProduction(control.state).lines, control.p.food);
    const { lines } = throughProduction(cut.state);
    const line = lineOf(lines, cut.p.food);
    expect(base.made).toBeGreaterThan(0);
    expect(line.made).toBe(0);
    expect(line.parts.at(-1)).toEqual({ why: 'event', delta: -base.made, event: 'powerCut' });
    expect(line.parts.slice(0, -1)).toEqual(base.parts.slice(0, line.parts.length - 1));
    expect(cut.state.tiles[cut.p.food]!.runMonths).toBe(control.state.tiles[control.p.food]!.runMonths);
    expect(cut.state.tiles[cut.p.food]!.runMonths).toBeGreaterThan(before);
    expect(cut.state.tiles[cut.p.food]!.outfit).toBe('food');
  });

  it('S4-B-AC-1 (engine): a guarded power cut fails, the plot makes its normal output, and the month\'s production events name the culprit', () => {
    const seed = 9;
    const control = monthOfSabotage(seed, []);
    const guarded = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }], (p) => [p.food]);
    const base = lineOf(throughProduction(control.state).lines, control.p.food);
    const { lines, events } = throughProduction(guarded.state);
    expect(lineOf(lines, guarded.p.food)).toEqual(base);
    const cut = events.find((e) => e.key === 'powerCut')!;
    expect(cut).toBeDefined();
    expect(cut.plots).toEqual([]);
    expect(cut.sabotage).toMatchObject({ culprit: 'lena', worked: false, guarded: true });
    expect(cut.line).toBe('Caught at a guarded plot: the power stays on.');
    expect(guarded.state.monthEvents.some((e) => e.key === 'powerCut')).toBe(true);
    expect(guarded.state.politics!.sabotage[0]).toMatchObject({ outcome: 'caught', culpritPublic: true });
  });

  it('S4-B-AC-2 (engine): an unguarded cut that works and is not seen makes the plot 0 and names nobody', () => {
    const seed = seedFor({ works: true, seen: false }, cutBrix);
    const { state, p } = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }]);
    const { lines, events } = throughProduction(state);
    expect(lineOf(lines, p.food).made).toBe(0);
    const cut = events.find((e) => e.key === 'powerCut')!;
    expect(cut.sabotage).toMatchObject({ culprit: null, worked: true, guarded: false });
    expect(cut.plots.map((q) => q.index)).toEqual([p.food]);
    const good = goodWords(state.tiles[p.food]!.outfit as never);
    expect(cut.line).toBe(`Someone cut the power to a ${good[0]!.toUpperCase() + good.slice(1)} plot: it makes nothing this month.`);
    expect(JSON.stringify(events)).not.toContain('lena');
  });

  it('S4-T-AC-3: S4-RULE-3 row 5 (caught, not worked, not guarded) files an event with the line "Caught! The saboteur is named." and the culprit', () => {
    const seed = seedFor({ works: false, seen: true }, cutBrix);
    const { state } = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }]);
    const { events } = throughProduction(state);
    const cut = events.find((e) => e.key === 'powerCut')!;
    expect(cut.line).toBe('Caught! The saboteur is named.');
    expect(cut.sabotage).toMatchObject({ culprit: 'lena', worked: false, guarded: false });
    expect(cut.plots).toEqual([]);
  });

  it('S4-T-AC-3: the month\'s sabotage events come in seat order, not in the order the orders were placed', () => {
    // Two guarded cuts are both caught whatever the draws: Ossa places first, Lena second.
    const state = newGame({ seed: 9 });
    state.month = 2;
    state.politics = { ...state.politics!, governor: 'lena', election: null };
    const p = plots(state);
    Object.assign(state.tiles[p.none]!, { owner: 'brix', outfit: 'smithore' });
    for (const by of ['ossa', 'lena']) state.players.find((x) => x.id === by)!.money = 1_000;
    orderSabotage(state, 'ossa', { kind: 'powerCut', tile: p.food });
    orderSabotage(state, 'lena', { kind: 'powerCut', tile: p.none });
    state.politics!.guards = [p.food, p.none];
    const { events } = throughProduction(state);
    const cuts = events.filter((e) => e.key === 'powerCut');
    expect(cuts.map((e) => e.sabotage!.culprit)).toEqual(['lena', 'ossa']);
  });

  it('S4-B-AC-2 (engine), negative: a failed, unseen order files no event and changes no output', () => {
    const seed = seedFor({ works: false, seen: false }, cutBrix);
    const control = monthOfSabotage(seed, []);
    const failed = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }]);
    const base = throughProduction(control.state);
    const { lines, events } = throughProduction(failed.state);
    expect(lines).toEqual(base.lines);
    expect(events).toEqual(base.events);
    expect(failed.state.politics!.sabotage[0]).toMatchObject({ outcome: 'failed', culpritPublic: false });
  });
});

// --- Task S4-1.4: the one reveal -----------------------------------------------------------------------------------

/** A pact between Lena and Brix that binds months 1 to 3. */
function pactLenaBrix(state: GameState): void {
  state.politics!.deals.push({ id: 'deal-pact001', from: 'lena', to: 'brix', terms: { kind: 'pact' }, offered: 1, until: 3, status: 'active', brokenBy: null, settled: null });
}

describe('the one reveal', () => {
  sabotageOn();
  beforeEach(() => void (hooks.calls.length = 0));

  const caughtMove = () => POLITICS.reputation.moves.caught;

  it('S4-T-AC-4: a guarded cut: reputationShift(culprit, caught x multiplier) first (seen in the reputation pactBreach is called with), then pactBreach once with (culprit, victim, order.month)', () => {
    const { state } = monthOfSabotage(4, [{ by: 'lena', target: cutBrix }], (p) => [p.food]);
    resolveSabotage(state);
    const order = state.politics!.sabotage[0]!;
    const before = START.reputation;
    expect(state.players[0]!.reputation).toBe(before + caughtMove());
    expect(hooks.calls).toHaveLength(1);
    expect(hooks.calls[0]!.args.slice(1, 4)).toEqual(['lena', 'brix', order.month]);
    // The caught move was already made when pactBreach was called: reputationShift first, then the pact.
    expect(hooks.calls[0]!.reputation).toBe(before + caughtMove() * 1);
    expect(order.culpritPublic).toBe(true);
  });

  it('S4-T-AC-4: a caught-on-the-spot cut (works or not) goes through the same two hooks', () => {
    for (const worked of [true, false]) {
      hooks.calls.length = 0;
      const seed = seedFor({ works: worked, seen: true }, cutBrix);
      const { state } = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }]);
      resolveSabotage(state);
      expect(hooks.calls).toHaveLength(1);
      expect(hooks.calls[0]!.args.slice(1, 4)).toEqual(['lena', 'brix', state.month]);
      expect(hooks.calls[0]!.reputation).toBe(START.reputation + caughtMove());
    }
  });

  it('S4-T-AC-4: a rumour caught moves reputation but never asks about a pact', () => {
    const seed = seedFor({ works: true, seen: true }, () => rumourFood);
    const { state } = monthOfSabotage(seed, [{ by: 'lena', target: () => rumourFood }]);
    const before = state.players[0]!.reputation;
    resolveSabotage(state);
    expect(hooks.calls).toEqual([]);
    expect(state.players[0]!.reputation).toBe(before + caughtMove());
  });

  it('S4-T-AC-4: an order that is not seen reveals nothing: no reputation move, no pact check, culprit unknown', () => {
    const seed = seedFor({ works: true, seen: false }, cutBrix);
    const { state } = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }]);
    const before = state.players[0]!.reputation;
    resolveSabotage(state);
    expect(hooks.calls).toEqual([]);
    expect(state.players[0]!.reputation).toBe(before);
  });

  it('S4-T-AC-4: caught against a pact partner: -10 caught then the pact breaks for -20 more, -30 in all, once per card', () => {
    const { state } = monthOfSabotage(4, [{ by: 'lena', target: cutBrix }], (p) => [p.food]);
    pactLenaBrix(state);
    const before = state.players[0]!.reputation;
    resolveSabotage(state);
    expect(state.players[0]!.reputation).toBe(before + caughtMove() + POLITICS.reputation.moves.pactBroken);
    expect(state.politics!.deals[0]).toMatchObject({ status: 'broken', brokenBy: 'lena' });
    expect(hooks.calls).toHaveLength(1);
    expect(hooks.calls[0]!.reputation).toBe(before + caughtMove());
  });

  it('S4-T-AC-4: sabotagePossible is true exactly when politics is on and POLITICS.sabotage.on', () => {
    const on = newGame();
    const off = newGame({ politics: false });
    for (const flag of [true, false]) {
      POLITICS.sabotage.on = flag;
      expect(sabotagePossible(on)).toBe(flag);
      expect(sabotagePossible(off)).toBe(false);
    }
  });

  it('S4-T-AC-4: a public, attributed order is a "caught" reputation reason, in its month, among the others newest first', () => {
    const { state } = monthOfSabotage(4, [{ by: 'lena', target: cutBrix }], (p) => [p.food]);
    resolveSabotage(state);
    expect(reputationReasons(state, 'lena')).toEqual([{ kind: 'caught', month: state.month }]);
    expect(reputationReasons(state, 'brix')).toEqual([]);
    // An order nobody has attributed is no reason.
    const quiet = monthOfSabotage(seedFor({ works: true, seen: false }, cutBrix), [{ by: 'lena', target: cutBrix }]);
    resolveSabotage(quiet.state);
    expect(reputationReasons(quiet.state, 'lena')).toEqual([]);
  });

  it('S4-T-AC-4: an order revealed by an investigation is a "caught" reason in the month it was revealed, not the month it was ordered', () => {
    let seen = false;
    for (let seed = 1; seed <= 60 && !seen; seed++) {
      const { state } = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }]);
      resolveSabotage(state);
      const order = state.politics!.sabotage[0]!;
      if (order.outcome !== 'done') continue;
      expect(reputationReasons(state, 'lena')).toEqual([]);
      state.politics!.sheriff = 'ossa';
      state.month = order.month + 2;
      state.phase = 'planning';
      if (!investigate(state, 'ossa', order.id).culpritPublic) continue;
      seen = true;
      expect(reputationReasons(state, 'lena')).toEqual([{ kind: 'caught', month: order.month + 2 }]);
    }
    expect(seen).toBe(true);
  });

  // Was red until Task S4-1.7 built investigate: the order a Sheriff solves months later still carries its own month to pactBreach.
  it('S4-T-AC-4 (investigation leg): an investigation months later still calls pactBreach with the order\'s month', () => {
    let solved = false;
    for (let seed = 1; seed <= 60 && !solved; seed++) {
      hooks.calls.length = 0;
      const { state } = monthOfSabotage(seed, [{ by: 'lena', target: cutBrix }]);
      resolveSabotage(state);
      const order = state.politics!.sabotage[0]!;
      if (order.outcome !== 'done') continue;
      state.politics!.sheriff = 'ossa';
      state.month = order.month + 2;
      state.phase = 'planning';
      pactLenaBrix(state);
      state.politics!.deals[0]!.until = state.month;
      if (investigate(state, 'ossa', order.id).culpritPublic) {
        solved = true;
        expect(hooks.calls).toHaveLength(1);
        expect(hooks.calls[0]!.args.slice(1, 4)).toEqual(['lena', 'brix', order.month]);
        expect(hooks.calls[0]!.reputation).toBe(START.reputation + caughtMove());
      }
    }
    expect(solved).toBe(true);
  });
});
