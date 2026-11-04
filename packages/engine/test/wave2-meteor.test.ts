import { afterEach, describe, expect, it } from 'vitest';
import { advancePhase, createGame, EVENTS, rollAfterOutput, type GameState, type Phase } from '../src/index.js';

type Row = { phases: Partial<Record<Phase, number>>; cap: number };
const allRows = (): [string, Row][] => [...Object.entries(EVENTS.colony), ...Object.entries(EVENTS.player)] as [string, Row][];
const saved = allRows().map(([, row]) => ({ row, phases: { ...row.phases }, cap: row.cap }));
afterEach(() => {
  for (const { row, phases, cap } of saved) Object.assign(row, { phases, cap });
});

/** Only the meteor strike can fire, at `chance` (cap 1); every other row at 0. */
function meteorAt(chance: number) {
  for (const [k, row] of allRows()) {
    row.phases = Object.fromEntries(Object.keys(row.phases).map((p) => [p, k === 'meteorStrike' ? chance : 0]));
    if (k === 'meteorStrike') row.cap = 1;
  }
}

/** Month 2, every non-store plot owned and outfitted for Smithore, every player with Energy to spare; in development. */
function fullColony(seed: number): GameState {
  const state = createGame({ seed, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
  state.month = EVENTS.firstMonth;
  state.tiles
    .filter((t) => t.terrain !== 'store')
    .forEach((t, i) => Object.assign(t, { owner: `p${i % 3}`, outfit: 'smithore' }));
  for (const p of state.players) p.stock.energy = 1000;
  state.phase = 'development';
  return state;
}

describe('RULE-1, RULE-3, AM-1 1a: the meteor strikes after the output, on any tile but the store', () => {
  it('the struck plot made its output and polluted this month; then it loses its MULE and becomes a crater', () => {
    meteorAt(1);
    const struck = fullColony(4);
    advancePhase(struck);
    meteorAt(0);
    const calm = fullColony(4);
    advancePhase(calm);

    const report = struck.history.at(-1)!;
    const strike = report.events!.find((e) => e.key === 'meteorStrike')!;
    expect(strike.plots).toHaveLength(1);
    const [hit] = strike.plots;
    expect(hit).toMatchObject({ becomes: 'crater', muleLost: true, delta: 0 });
    expect(report.lines!.find((l) => l.tile === hit!.index)!.made).toBeGreaterThan(0);
    expect(struck.tiles[hit!.index]).toMatchObject({ outfit: null, special: { kind: 'meteorCrater' } });
    // The plot ran this month: its pollution counts as if no meteor had come.
    expect(report.pollutionBy).toEqual(calm.history.at(-1)!.pollutionBy);
    expect(struck.air).toBe(calm.air);
  });

  it('never the store: on a map of the store and one plot, every seed strikes the plot', () => {
    meteorAt(1);
    for (let seed = 1; seed <= 40; seed++) {
      const state = createGame({ seed, players: [0, 1].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
      state.month = EVENTS.firstMonth;
      const store = state.tiles.find((t) => t.terrain === 'store')!;
      const plot = state.tiles.find((t) => t.terrain !== 'store')!;
      state.tiles = [store, plot];
      const [strike] = rollAfterOutput(state);
      expect([seed, strike!.plots.map((p) => p.index)]).toEqual([seed, [1]]);
    }
  });
});
