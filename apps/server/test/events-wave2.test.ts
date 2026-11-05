import { DEV_STEER, EVENTS, grantees, inheritanceAmount, UPKEEP, type EventKey, type GameState, type MonthEvent, type Phase } from '@mule/engine';
import { afterEach, describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, pressThroughSidePick, readyAll, seats } from './fake-context.js';

/** A new game in month 1's planning, and its private engine state, which a test reaches to arrange the month. */
function newGame() {
  const fake = fakeContext({});
  const game = new MuleGame(fake.ctx, 7);
  game.start(seats);
  return { game, state: (game as unknown as { state: GameState }).state, ...fake };
}

/** A planning event that changed things off the map and on it: the contract's every optional field. */
const offMap = (state: GameState): MonthEvent => ({
  key: 'meteorStrike',
  kind: 'strike',
  title: 'Meteor strike',
  line: 'A stand-in.',
  scope: 'local',
  origin: { x: 2, y: 1 },
  plots: [{ index: 1 * state.width + 2, order: 0, good: 'food', delta: 0, becomes: 'crater', muleLost: true }],
  effects: [
    { on: 's1', what: 'money', delta: -25 },
    { on: 'store', what: 'crystite', delta: -4 },
  ],
  sign: 'bad',
  phase: 'planning',
});

describe("C1, C4: the server shows this month's events from the month's own list", () => {
  it("an event the month keeps for planning is planning's, in every seat's view, with its effects and what its plot became", () => {
    const { game, state } = newGame();
    state.monthEvents.push(offMap(state));
    for (const seat of [null, 's1', 's2']) {
      const [view] = game.viewFor(seat).events!;
      expect(view).toMatchObject({
        key: 'meteorStrike',
        phase: 'planning',
        // A MULE lost names its good: the screens draw it on its plot until the hit lands, and say what was lost.
        hits: [{ x: 2, y: 1, order: 0, delta: 0, becomes: 'crater', muleLost: true, good: 'food' }],
        effects: [
          { on: 's1', what: 'money', delta: -25 },
          { on: 'store', what: 'crystite', delta: -4 },
        ],
      });
    }
  });

  it('an event with no effects and plain hits carries neither field', () => {
    const { game, state } = newGame();
    const { effects: _, ...plain } = offMap(state);
    state.monthEvents.push({ ...plain, plots: [{ index: 0, order: 0, good: 'food', delta: -1 }] });
    const [view] = game.viewFor(null).events!;
    expect(view).not.toHaveProperty('effects');
    expect(view!.hits).toStrictEqual([{ x: 0, y: 0, order: 0, delta: -1 }]);
  });
});

type Row = { phases: Partial<Record<Phase, number>>; cap: number };
const allRows = (): [string, Row][] => [...Object.entries(EVENTS.colony), ...Object.entries(EVENTS.player)] as [string, Row][];

/** Makes `key` the one row that can fire: each of its phases certain (cap 1), every other row at 0, from month `from`. Returns the restore. */
function forceOnly(key: EventKey, from: number): () => void {
  const saved = allRows().map(([, row]) => ({ row, phases: { ...row.phases }, cap: row.cap }));
  const firstMonth = EVENTS.firstMonth;
  for (const [k, row] of allRows()) {
    row.phases = Object.fromEntries(Object.keys(row.phases).map((p) => [p, k === key ? 1 : 0]));
    if (k === key) row.cap = 1;
  }
  EVENTS.firstMonth = from;
  return () => {
    for (const { row, phases, cap } of saved) Object.assign(row, { phases, cap });
    EVENTS.firstMonth = firstMonth;
  };
}

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

/**
 * Plays with only `key` able to fire (from month `month`) until month `month`'s `phase` opens, humans pressing Ready
 * where the game waits. `prepare` arranges the state once month 1's planning is open. Returns the game, its state, a
 * copy of the state at the last change before the phase opened, and the key's events as every seat's view lists them.
 */
function firedIn(key: EventKey, phase: Phase, month: number, prepare?: (state: GameState) => void) {
  restore?.();
  restore = forceOnly(key, month);
  let game: MuleGame | null = null;
  let last: GameState | null = null;
  let before: GameState | null = null;
  const fake = fakeContext({
    onChanged: () => {
      const state = game && (game as unknown as { state: GameState | null }).state;
      if (!state || before) return;
      if (state.month === month && state.phase === phase) before = last;
      else last = structuredClone(state);
    },
  });
  game = new MuleGame(fake.ctx, 7);
  game.start(seats);
  const state = (game as unknown as { state: GameState }).state;
  prepare?.(state);
  for (let i = 0; i < 200_000 && !(state.month === month && state.phase === phase); i++) {
    if (state.phase === 'planning' || state.phase === 'upkeep') readyAll(game);
    // A good's side pick has no clock (A-7): the people press Ready there, once an event's show has let go.
    pressThroughSidePick(game);
    fake.advance(100);
  }
  expect([state.month, state.phase]).toEqual([month, phase]);
  before ??= last;
  const views = [null, 's1', 's2'].map((seat) => game.viewFor(seat).events!.filter((e) => e.key === key));
  for (const v of views) expect(v).toEqual(views[0]);
  return { game, state, before: before! as GameState, events: views[0]! };
}

const money = (s: GameState) => s.players.map((p) => p.money);
/** Gives s1 `n` plots outfitted for Food, out of the free land. */
const farms = (n: number) => (state: GameState) =>
  state.tiles
    .filter((t) => t.terrain !== 'store' && !t.owner)
    .slice(0, n)
    .forEach((t) => Object.assign(t, { owner: 's1', outfit: 'food' }));

describe('T-AC-1: each wave-2 event fires in its phase, changes the state as RULE-4 says, and every seat sees it', () => {
  it('federationTax: planning takes a tenth of each cash into the colony fund', () => {
    const { state, before, events } = firedIn('federationTax', 'planning', 2);
    const taken = before.players.map((p) => Math.floor(p.money * EVENTS.colony.federationTax.share));
    expect(money(state)).toEqual(before.players.map((p, i) => p.money - taken[i]!));
    expect(state.treasury.money).toBe(before.treasury.money + taken.reduce((a, b) => a + b, 0));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ phase: 'planning', kind: 'ledger', hits: [], weight: 'headline' });
    expect(events[0]!.effects).toEqual(state.players.flatMap((p, i) => (taken[i] ? [{ on: p.id, what: 'money', delta: -taken[i]! }] : [])));
  });

  it('federationGrant: planning pays the two poorest 150 each, new money', () => {
    const { state, before, events } = firedIn('federationGrant', 'planning', 2);
    const poorest = grantees(before).map((p) => p.id);
    const { amount } = EVENTS.colony.federationGrant;
    expect(money(state)).toEqual(before.players.map((p) => p.money + (poorest.includes(p.id) ? amount : 0)));
    expect(state.treasury.money).toBe(before.treasury.money);
    expect(events[0]!.effects).toEqual(poorest.map((on) => ({ on, what: 'money', delta: amount })));
  });

  it('immigrationWave: planning grows the colonists by a tenth, for good', () => {
    const { state, before, events } = firedIn('immigrationWave', 'planning', 2);
    const grown = Math.round(before.colonists * (1 + EVENTS.colony.immigrationWave.growth));
    expect(state.colonists).toBe(grown);
    expect(events[0]!.effects).toEqual([{ on: 'colony', what: 'colonists', delta: grown - before.colonists }]);
  });

  it('inheritance: planning pays each player between min and max, as its effect says', () => {
    const { state, before, events } = firedIn('inheritance', 'planning', 2);
    expect(events.map((e) => e.player)).toEqual(state.players.map((p) => p.id));
    state.players.forEach((p, i) => {
      const [effect] = events[i]!.effects!;
      expect(effect).toMatchObject({ on: p.id, what: 'money' });
      expect(effect!.delta).toBeGreaterThanOrEqual(EVENTS.player.inheritance.min);
      expect(effect!.delta).toBeLessThanOrEqual(EVENTS.player.inheritance.max);
      expect(p.money).toBe(before.players[i]!.money + effect!.delta);
      expect(effect!.delta).toBe(inheritanceAmount(before, p.id));
    });
    // The gallery's bulletin: inheritances share one roll call, not a headline each.
    expect(events.map((e) => e.weight)).toEqual(state.players.map(() => 'bulletin'));
  });

  it("muleTheft: development and the month end each take one of the owner's MULEs; the plot stands idle", () => {
    const dev = firedIn('muleTheft', 'development', 1, farms(2));
    const [theft] = dev.events;
    expect(theft).toMatchObject({ player: 's1', phase: 'development', kind: 'plot', hits: [{ delta: 0, becomes: 'idle', muleLost: true, good: 'food' }] });
    const { x, y } = theft!.hits[0]!;
    expect(dev.state.tiles[y * dev.state.width + x]).toMatchObject({ owner: 's1', outfit: null, runMonths: 0 });
    const upkeep = firedIn('muleTheft', 'upkeep', 1, farms(2));
    const mine = (events: readonly { player?: string; phase: string }[]) => events.filter((e) => e.player === 's1').map((e) => e.phase);
    expect(mine(upkeep.events)).toEqual(['upkeep']);
    expect(mine(upkeep.state.history.at(-1)!.events!.filter((e) => e.key === 'muleTheft'))).toEqual(['development', 'upkeep']);
    expect(upkeep.state.tiles.filter((t) => t.owner === 's1' && t.outfit === 'food')).toHaveLength(0);
  });

  it('epidemic: development sickens everyone without Medicine, this turn and next; a Medicine cures and is used', () => {
    const { game, state, events } = firedIn('epidemic', 'development', 1, (s) => {
      for (const p of s.players) p.stock.medicine = p.id === 's1' ? 1 : 0;
    });
    expect(events[0]).toMatchObject({ phase: 'development', kind: 'colonists', effects: [{ on: 's1', what: 'medicine', delta: -1 }] });
    expect(state.players.map((p) => [p.id, p.sick, p.sickNext, p.stock.medicine])).toEqual([
      ['s1', false, false, 0],
      ['s2', true, true, 0],
      ['s3', true, true, 0],
    ]);
    const sick = game.viewFor(null).events!.filter((e) => e.key === 'sickness');
    expect(sick.map((e) => [e.player, e.line])).toEqual([
      ['s2', 'Mia fell sick: the epidemic.'],
      ['s3', 'The Baron fell sick: the epidemic.'],
    ]);
  });

  it('coldSnap: production burns twice the Energy, and says so', () => {
    const { state, before, events } = firedIn('coldSnap', 'production', 1, (s) => {
      farms(1)(s);
      s.players[0]!.stock.energy = 10;
    });
    expect(events[0]).toMatchObject({ phase: 'production', kind: 'sweep', effects: [{ on: 'colony', what: 'energyNeed', delta: 100 }] });
    const burnt = before.players[0]!.stock.energy - state.players[0]!.stock.energy;
    expect(burnt).toBe(EVENTS.colony.coldSnap.factor * UPKEEP.energyUse.food);
    // Without a snap the same farm burns its plain need: the factor is the snap's alone.
    const plain = firedIn('packageFromHome', 'production', 1, (s) => {
      farms(1)(s);
      s.players[0]!.stock.energy = 10;
    });
    expect(plain.before.players[0]!.stock.energy - plain.state.players[0]!.stock.energy).toBe(UPKEEP.energyUse.food);
  });

  it("meteorStrike: after production's output a tile becomes a crater and loses any MULE", () => {
    const { state, events } = firedIn('meteorStrike', 'production', 1);
    const [strike] = events;
    expect(strike).toMatchObject({ phase: 'production', kind: 'strike', hits: [{ delta: 0, becomes: 'crater' }] });
    // No MULE on the struck tile, so nothing was lost: the hit names no good (only a MULE lost does).
    expect(strike!.hits[0]).not.toHaveProperty('good');
    const tile = state.tiles[strike!.hits[0]!.y * state.width + strike!.hits[0]!.x]!;
    expect(tile.terrain).not.toBe('store');
    expect(tile).toMatchObject({ outfit: null, special: { kind: 'meteorCrater' } });
  });

  it("pirateRaid: the auction opens with every player's and the store's Crystite at 0", () => {
    const { state, before, events } = firedIn('pirateRaid', 'auction', 1, (s) => {
      s.players[0]!.stock.crystite = 3;
      s.store.stock.crystite = 5;
    });
    expect(state.players.map((p) => p.stock.crystite)).toEqual([0, 0, 0]);
    expect(state.store.stock.crystite).toBe(0);
    const held = [...before.players.map((p) => ({ on: p.id, n: p.stock.crystite })), { on: 'store', n: before.store.stock.crystite }].filter((h) => h.n > 0);
    expect(held).toContainEqual({ on: 's1', n: 3 });
    expect(events[0]).toMatchObject({ phase: 'auction', effects: held.map(({ on, n }) => ({ on, what: 'crystite', delta: -n })) });
  });

  it('storeFire: the auction opens with the store empty and the corral at 0', () => {
    const { state, before, events } = firedIn('storeFire', 'auction', 1);
    expect(state.store.mules).toBe(0);
    for (const good of Object.keys(state.store.stock) as (keyof typeof state.store.stock)[]) expect([good, state.store.stock[good]]).toEqual([good, 0]);
    expect(events[0]!.effects).toContainEqual({ on: 'store', what: 'mules', delta: -before.store.mules });
    expect(events[0]!.effects).toContainEqual({ on: 'store', what: 'food', delta: -before.store.stock.food });
  });

  it('ratsInSilo: the month end takes half of each held Food', () => {
    const { before, events } = firedIn('ratsInSilo', 'upkeep', 1);
    const fed = before.players.filter((p) => p.stock.food >= 2);
    expect(fed.length).toBeGreaterThan(0);
    expect(events.map((e) => e.effects)).toEqual(fed.map((p) => [{ on: p.id, what: 'food', delta: -Math.floor(p.stock.food * EVENTS.player.ratsInSilo.share) }]));
  });

  it('crookedAccountant: the month end takes a tenth of each cash', () => {
    const { before, events } = firedIn('crookedAccountant', 'upkeep', 1);
    expect(events.map((e) => e.effects)).toEqual(before.players.map((p) => [{ on: p.id, what: 'money', delta: -Math.floor(p.money * EVENTS.player.crookedAccountant.share) }]));
  });

  it('packageFromHome: the month end brings each player 3 Food', () => {
    const { events } = firedIn('packageFromHome', 'upkeep', 1);
    expect(events.map((e) => [e.player, e.effects])).toEqual(seats.map((s) => [s.id, [{ on: s.id, what: 'food', delta: EVENTS.player.packageFromHome.amount }]]));
  });
});
