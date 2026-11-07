import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGame, GOODS, orderSabotage, POLITICS, RuleError, type GameState, type SabotageTarget } from '../src/index.js';

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
