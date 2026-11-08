import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  createGame,
  eventChance,
  EVENTS,
  GOOD_CONFIG,
  growthRate,
  HAPPINESS,
  HARDSHIP,
  hardship,
  hardshipMemory,
  monthMood,
  moodStep,
  PERCENT,
  POLLUTION,
  shipInPort,
  UPKEEP,
  type GameState,
} from '../src/index.js';

// The colony needs spec (docs/specs/2026-11-06-colony-needs.md), §1 C3-C5 and §2 RULE-2..RULE-6: how short the
// colonists went moves their mood, their memory of it, the colony's size and the unrest-band events' odds.

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const W = HAPPINESS.weights;

/** Runs `body` with `key` of `table` set to `value`, and puts it back whatever happens. */
function withConfig<T extends object, K extends keyof T, R>(table: T, key: K, value: T[K], body: () => R): R {
  const was = table[key];
  table[key] = value;
  try {
    return body();
  } finally {
    table[key] = was;
  }
}

/** A seed-7 game with Lena governing and no election open, the air clean and the tax at its free level. */
function game(politics = true): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
  if (state.politics) state.politics = { ...state.politics, governor: 'lena', election: null };
  state.treasury.salesTax = W.taxFree / PERCENT;
  state.air = 0;
  return state;
}

/** Plays on to the next auction, so the next advancePhase is upkeep. */
function toAuction(state: GameState): GameState {
  for (let steps = 0; state.phase !== 'auction' && steps < 50; steps++) advancePhase(state);
  expect(state.phase).toBe('auction');
  return state;
}

/**
 * Runs the month's upkeep with 400 colonists (a need of 20 Food and 20 Water) at mood `mood`, the store holding `food`
 * Food and all the Water they need. Returns the state after it.
 */
function upkeepWith(state: GameState, food: number, mood = HAPPINESS.start, water = 200): GameState {
  toAuction(state);
  state.colonists = 400;
  if (state.colony) state.colony.happiness = mood;
  Object.assign(state.store.stock, { food, water });
  expect(shipInPort(state), 'the premise: no export ship takes from the store this upkeep').toBe(false);
  advancePhase(state);
  expect(state.phase).toBe('upkeep');
  return state;
}

describe('needs C3: the mood reads how short the colonists went (RULE-3, RULE-4)', () => {
  it('needs T-AC-2: the memory from 0 by g 0.3 is 0.3, a fed month halves it to 0.15, g 1 every month runs 1, 1.5, 1.75 toward 2, and memoryCap holds under a larger memoryKeep', () => {
    expect(hardshipMemory(0, 0.3)).toBeCloseTo(0.3, 9);
    expect(hardshipMemory(0.3, 0), 'fed: memoryKeep × 0.3').toBeCloseTo(0.15, 9);
    const starving: number[] = [];
    let h = 0;
    for (let month = 0; month < 12; month++) starving.push((h = hardshipMemory(h, 1)));
    expect(starving.slice(0, 4)).toEqual([1, 1.5, 1.75, 1.875]);
    expect(starving.at(-1)).toBeLessThanOrEqual(HARDSHIP.memoryCap);
    expect(starving.at(-1)).toBeCloseTo(2, 2);

    withConfig(HARDSHIP, 'memoryKeep', 0.9, () => {
      expect(hardshipMemory(1.9, 1), '0.9 × 1.9 + 1 = 2.71, held at the cap').toBe(HARDSHIP.memoryCap);
      expect(hardshipMemory(HARDSHIP.memoryCap, 1), 'and it stays there').toBe(HARDSHIP.memoryCap);
    });
  });

  it('needs T-AC-3: the month steps toward its target first and then takes the shock, round(8 × g), never below 0', () => {
    const bite = hardship(0.5);
    // Step first: 60 → 58 toward 58.2, then −round(2.37) → 56. Shock first would read 58, then step to 58.
    expect(monthMood(60, 60 - HARDSHIP.targetPerHardship * bite, bite)).toBe(56);
    expect(monthMood(60, 60, 0), 'no bite: the plain step').toBe(moodStep(60, 60));
    expect(monthMood(60, 60, 1), 'a total miss: the shock is 8, uncapped by the 5-point step').toBe(60 - HARDSHIP.shock);
    expect(monthMood(60, 60, hardship(0.4)), 'g 0.19: round(1.52) = 2').toBe(58);
    expect(monthMood(60, 60, hardship(0.2)), 'g 0.04: round(0.33) = 0').toBe(60);
    expect(monthMood(3, 0, 1), 'floor 0').toBe(0);
  });

  it('needs B-AC-2: a colony at mood 60 short 10 of 20 Food ends upkeep at mood 56 and 5% fewer colonists', () => {
    const state = upkeepWith(game(), 10);
    expect(state.colony!.happiness).toBe(56);
    expect(state.colonists).toBe(380);
    const thirsty = upkeepWith(game(), 20, HAPPINESS.start, 10);
    expect(thirsty.colony!.happiness, 'the same short of Water: the worse of the two counts').toBe(56);
    expect(thirsty.colonists).toBe(380);
  });

  it('needs B-AC-3: that colony fed in full the next month ends at mood 59, not 60, and grows 3% (Restless)', () => {
    const state = upkeepWith(game(), 10);
    expect(state.colony!.happiness).toBe(56);
    // The next month's planning may roll an event; none may move the mood, so the promise reads the rule alone.
    const rows: { phases: Record<string, number> }[] = Object.values(EVENTS.colony);
    const saved = rows.map((row) => row.phases);
    try {
      for (const row of rows) row.phases = Object.fromEntries(Object.keys(row.phases).map((p) => [p, 0]));
      upkeepWith(state, 200, 56);
    } finally {
      rows.forEach((row, i) => (row.phases = saved[i]!));
    }
    expect(state.colony!.happiness).toBe(59);
    // 400 colonists set again before the meal: 400 × (1.04 − 0.01).
    expect(state.colonists).toBe(Math.round(400 * 1.03));
  });
});

describe('needs C4: the colony grows or shrinks by how short it went (RULE-5)', () => {
  it("needs T-AC-4: RULE-5's rows and examples, the band's migration offset, Collapse first, and the floor at 0", () => {
    const at = (mood: number, politics = true) => {
      const state = game(politics);
      if (state.colony) state.colony.happiness = mood;
      return state;
    };
    const content = HAPPINESS.bands.content;
    expect(growthRate(at(content), 0.05), 'within the tolerance: fed').toBeCloseTo(1.04, 9);
    expect(growthRate(at(content), HARDSHIP.tolerance), 'at the tolerance: still fed').toBeCloseTo(1.04, 9);
    expect(growthRate(at(content), 0.5), 's 0.5 Content').toBeCloseTo(0.95, 9);
    expect(growthRate(at(HAPPINESS.bands.unhappy - 1), 1), 's 1 Unrest').toBeCloseTo(0.85, 9);
    expect(growthRate(at(content, false), 0.5), 'politics off: no offset').toBeCloseTo(0.95, 9);
    expect(growthRate(at(content, false), 0), 'politics off, fed').toBeCloseTo(1.04, 9);
    expect(growthRate(at(content, false), 1), 'politics off, nothing to eat').toBeCloseTo(0.9, 9);
    expect(growthRate(at(content, false), 0.2), 'politics off, a fifth short').toBeCloseTo(0.98, 9);
    expect(growthRate(at(HAPPINESS.bands.thriving), 0), 'Thriving draws settlers').toBeCloseTo(1.06, 9);
    expect(growthRate(at(HAPPINESS.bands.restless), 0), 'Restless loses some').toBeCloseTo(1.03, 9);
    expect(growthRate(at(HAPPINESS.bands.unhappy), 0.2), 'Unhappy, 20% short: 1 − 0.02 − 0.03').toBeCloseTo(0.95, 9);

    const collapse = at(HAPPINESS.bands.thriving);
    collapse.air = 100;
    expect(growthRate(collapse, 0), 'Collapse overrides the meal and the mood').toBeCloseTo(1 - POLLUTION.collapseLeave, 9);

    withConfig(UPKEEP, 'colonistShrinkPerShortfall', 2, () => {
      expect(growthRate(at(HAPPINESS.bands.unhappy - 1), 1), 'never below 0').toBe(0);
    });
  });

  it('needs B-AC-1: a politics game whose colonists need 20 Food and get 19 keeps its mood and grows 4%', () => {
    const state = upkeepWith(game(), 19);
    expect(state.history.at(-1)!.colonistMeal!.food).toEqual({ need: 20, took: 19 });
    expect(state.colony!.happiness, 'a 5% miss is shrugged off').toBe(HAPPINESS.start);
    expect(state.colonists).toBe(Math.round(400 * UPKEEP.colonistGrowth.fed));
  });

  it('needs B-AC-5: a politics-off game short 10 of 20 Food shrinks 5% and has no mood', () => {
    const state = upkeepWith(game(false), 10);
    expect(state.colonists).toBe(380);
    expect(state.colony).toBeNull();
    expect(upkeepWith(game(false), 0).colonists, 'nothing to eat: 10% fewer, not the old flat 5%').toBe(360);
    expect(upkeepWith(game(false), 16).colonists, 'a fifth short: 2% fewer').toBe(392);
  });
});

describe('needs C5: the memory of hardship raises the unrest-band events\' odds (RULE-6)', () => {
  it("needs T-AC-5: an unrest row's points grow ×(1 + 0.25 H); a thriving row's stay; politics off is unchanged", () => {
    const planning = (mood: number, memory: number) => {
      const state = game();
      state.month = EVENTS.firstMonth;
      state.colony!.happiness = mood;
      state.colony!.hardship = memory;
      state.store.posted.food = GOOD_CONFIG.food.refPrice;
      return state;
    };
    const strike = EVENTS.colony.generalStrike;
    const unrest = HAPPINESS.bands.unhappy - 5;
    const chance = (mood: number, memory: number) => eventChance(planning(mood, memory), strike, 'planning');
    expect(chance(unrest, 0), 'no memory: the band\'s points').toBeCloseTo(strike.mood.unrest, 9);
    expect(chance(unrest, 1)).toBeCloseTo(strike.mood.unrest * 1.25, 9);
    expect(chance(unrest, HARDSHIP.memoryCap), 'at the cap: ×1.5').toBeCloseTo(strike.mood.unrest * 1.5, 9);
    expect(chance(HAPPINESS.bands.unhappy, HARDSHIP.memoryCap), 'an Unhappy row at the cap: ×1.5').toBeCloseTo(strike.mood.unhappy * 1.5, 9);
    expect(eventChance(planning(HAPPINESS.bands.restless, 2), EVENTS.colony.emigrationWave, 'planning')).toBeCloseTo(EVENTS.colony.emigrationWave.mood.restless * 1.5, 9);

    const wave = EVENTS.colony.immigrationWave;
    const thriving = HAPPINESS.bands.thriving + 5;
    expect(eventChance(planning(thriving, 2), wave, 'planning'), 'a thriving row: unchanged by the memory').toBeCloseTo(eventChance(planning(thriving, 0), wave, 'planning'), 9);

    const theft = EVENTS.player.muleTheft;
    const off = game(false);
    off.month = EVENTS.firstMonth;
    expect(eventChance(off, theft, 'development', { player: 'lena' }), 'politics off: the row\'s base, no mood').toBe(theft.phases.development);
  });
});
