import { afterEach, describe, expect, it } from 'vitest';
import { advancePhase, createGame, growthRate, HAPPINESS, POLLUTION, runUpkeep, type GameState, type MoodBand } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** The middle of each band, from HAPPINESS.bands. */
const AT: Record<MoodBand, number> = {
  thriving: HAPPINESS.bands.thriving + 5,
  content: HAPPINESS.bands.content + 5,
  restless: HAPPINESS.bands.restless + 5,
  unhappy: HAPPINESS.bands.unhappy + 5,
  unrest: HAPPINESS.bands.unhappy - 5,
};
const COLLAPSE_AIR = POLLUTION.bands.find((b) => b.name === 'collapse')!.from;

/** A month-1 game in the auction phase with clean air and the mood at `h`; politics off when `h` is null. */
function auction(h: number | null): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: h !== null });
  while (state.phase !== 'auction') advancePhase(state);
  if (state.colony && h !== null) state.colony.happiness = h;
  state.air = 0;
  return state;
}

/** The auction-phase game with 100 colonists and a store that feeds them at upkeep: a full shelf at a price their wages cover. */
function fedColony(h: number): GameState {
  const state = auction(h);
  state.colonists = 100;
  for (const good of ['food', 'water'] as const) {
    state.store.stock[good] = 1_000;
    state.store.posted[good] = 1;
  }
  return state;
}

const savedMigration = { ...HAPPINESS.migration };
afterEach(() => {
  Object.assign(HAPPINESS.migration, savedMigration);
});

describe('C27: happiness shapes migration (G-5 RULE-29)', () => {
  it('B-AC-28: a fed colony in Unrest shrinks by 1% at upkeep, where a fed Content colony grows by 4%', () => {
    const unrest = fedColony(AT.unrest);
    const content = fedColony(AT.content);

    for (const state of [unrest, content]) while (state.phase !== 'upkeep') advancePhase(state);

    for (const state of [unrest, content]) expect(state.history.at(-1)!.colonistsHungry, 'the colonists were fed').toBe(false);
    expect(unrest.colonists).toBe(99);
    expect(content.colonists).toBe(104);
  });

  it.each<[string, MoodBand, number, number]>([
    ['T-AC-40', 'thriving', 1.06, 0.97],
    ['T-AC-41', 'content', 1.04, 0.95],
    ['T-AC-42', 'restless', 1.03, 0.94],
    ['T-AC-43', 'unhappy', 1.01, 0.92],
    ['T-AC-44', 'unrest', 0.99, 0.9],
  ])('%s: in %s the colonists grow by %s fed and %s hungry; in Collapse air by 0.95, whatever the mood', (_id, band, fed, hungry) => {
    const state = auction(AT[band]);
    expect(growthRate(state, true)).toBeCloseTo(fed, 10);
    expect(growthRate(state, false)).toBeCloseTo(hungry, 10);

    state.air = COLLAPSE_AIR;
    expect(growthRate(state, true)).toBeCloseTo(0.95, 10);
    expect(growthRate(state, false)).toBeCloseTo(0.95, 10);
  });

  it('T-AC-44: an offset below minus the hungry rate floors the rate at 0, and upkeep empties the colony rather than going negative', () => {
    HAPPINESS.migration.unrest = -2;
    const state = auction(AT.unrest);
    expect(growthRate(state, false)).toBe(0);
    expect(growthRate(state, true)).toBe(0);

    state.colonists = 100;
    runUpkeep(state);
    expect(state.colonists).toBe(0);
  });

  it('T-AC-22 (HC-22, C27): politics off, the colonists grow by 1.04 fed and 0.95 hungry, as before the mood counted; in Collapse air by 0.95', () => {
    const state = auction(null);
    expect(state.colony).toBeNull();
    expect(growthRate(state, true)).toBeCloseTo(1.04, 10);
    expect(growthRate(state, false)).toBeCloseTo(0.95, 10);

    state.air = COLLAPSE_AIR;
    expect(growthRate(state, true)).toBeCloseTo(0.95, 10);
  });
});
