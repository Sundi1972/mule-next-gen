import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  cloneForSim,
  colonistMedicineNeed,
  createGame,
  electronicsComfort,
  GOOD_CONFIG,
  grownColonists,
  growthRate,
  HAPPINESS,
  hardship,
  HEALTH,
  healthGauge,
  healthOf,
  monthlyDemand,
  moodTarget,
  nextSickShare,
  PERCENT,
  POLLUTION,
  PRICE,
  runColony,
  runUpkeep,
  severity,
  shipInPort,
  sickShare,
  stableJson,
  STRATEGIST,
  UPKEEP,
  type GameState,
  type MoodInputs,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const W = HAPPINESS.weights;
const QUIET: MoodInputs = { hardship: 0, air: 0, tax: W.taxFree, broken: 0, prestige: 0, gap: 0, welfare: 0 };
const FED = { food: 0, water: 0, medicine: 0 };

/** Runs `body` with colony health switched on, and switches it back off whatever happens. */
function withHealth<T>(body: () => T): T {
  HEALTH.enabled = true;
  try {
    return body();
  } finally {
    HEALTH.enabled = false;
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

/** A game at month 1's auction whose store holds every Food, Water and Medicine its colonists could need. */
function stockedAtAuction(): GameState {
  const state = toAuction(game());
  Object.assign(state.store.stock, { food: 200, water: 200, medicine: 200 });
  expect(shipInPort(state), 'the premise: no export ship takes from the store this upkeep').toBe(false);
  return state;
}

describe('needs C7: the colonists\' sick share (RULE-7)', () => {
  it('needs T-AC-8: fed and treated, h settles near 0.03 from any start; with no Medicine it stays at the cap; recovery beats contagion for every s_med', () => {
    for (const start of [0, 0.1, 0.25, HEALTH.cap]) {
      let h = start;
      for (let month = 0; month < 40; month++) h = nextSickShare(h, FED);
      expect(h, `from ${start}`).toBeCloseTo(0.03, 2);
    }
    const untreated = { ...FED, medicine: 1 };
    let h = 0;
    for (let month = 0; month < 40; month++) h = nextSickShare(h, untreated);
    expect(h, 'no Medicine: it climbs to the cap').toBe(HEALTH.cap);
    expect(nextSickShare(HEALTH.cap, untreated), 'and stays there').toBe(HEALTH.cap);
    // One month's step, worked by hand (WS7): g(0.5) = (0.4 / 0.9)^1.5 = 8/27, and the Medicine cut on recovery is linear.
    expect(nextSickShare(0, { ...FED, food: 1 }), 'no Food: 0.01 + 0.2').toBeCloseTo(0.21, 6);
    expect(nextSickShare(0, { ...FED, water: 1 }), 'no Water: the worse of the two').toBeCloseTo(0.21, 6);
    expect(nextSickShare(0, { ...FED, medicine: 1 }), 'no Medicine').toBeCloseTo(0.21, 6);
    expect(nextSickShare(0.2, { ...FED, medicine: 0.5 }), '0.2 + 0.8 × (0.04 + 0.2 × 8/27) − 0.2 × 0.5 × (1 − 0.3 × 0.5)').toBeCloseTo(0.194407, 6);
    expect(nextSickShare(0.2, { ...FED, food: 0.5 }), '0.2 + 0.8 × (0.04 + 0.2 × 8/27) − 0.2 × 0.5').toBeCloseTo(0.179407, 6);
    expect(nextSickShare(0.3, { ...FED, food: 0.05 }), 'within the tolerance: no hunger at all').toBe(nextSickShare(0.3, FED));

    // Recovery beats contagion: a month on, an extra sick share h is less than h × (1 − p₀), what it would be if the sick
    // neither infected nor recovered (p₀ = nextSickShare(0): the well's own inflow), for every s_med.
    for (let step = 0; step <= 20; step++) {
      const short = { ...FED, medicine: step / 20 };
      const inflow = nextSickShare(0, short);
      for (const h of [0.01, 0.2]) {
        expect(nextSickShare(h, short) - inflow, `s_med ${short.medicine}, h ${h}`).toBeLessThan(h * (1 - inflow));
      }
    }
  });

  it('needs T-AC-1: the hardship curve g at s = 0, 0.10, 0.11, 0.5 and 1 is 0, 0, about 0.00117, 0.2963 and 1', () => {
    expect(hardship(0)).toBe(0);
    expect(hardship(0.1), 'at the tolerance: nothing yet').toBe(0);
    expect(hardship(0.11), '(0.01 / 0.9)^1.5').toBeCloseTo(0.00117, 5);
    expect(hardship(0.5), '(0.4 / 0.9)^1.5 = 8/27').toBeCloseTo(0.2963, 4);
    expect(hardship(1)).toBe(1);
  });
});

describe('needs C8: sickness weighs on the mood, the growth and the Medicine need (RULE-8)', () => {
  it('needs T-AC-9: the target loses 10 × h, the growth rate 0.05 × h, and the Medicine need grows by (1 + h_old)', () => {
    expect(moodTarget({ ...QUIET, sick: 0.2 })).toBeCloseTo(moodTarget(QUIET) - HEALTH.moodPerSick * 0.2, 9);
    expect(moodTarget({ ...QUIET, sick: 0 })).toBe(moodTarget(QUIET));

    withHealth(() => {
      const upkeep = (sick: number) => {
        const state = stockedAtAuction();
        state.colonists = 400;
        state.colony!.sick = sick;
        const need = colonistMedicineNeed(state);
        const medicine = state.store.stock.medicine;
        advancePhase(state);
        expect(state.phase).toBe('upkeep');
        return { need, medicine, left: state.store.stock.medicine, colonists: state.colonists };
      };
      const well = upkeep(0);
      const sick = upkeep(0.2);
      expect(well.need, 'one Medicine per colonistsPerMedicine').toBe(400 / UPKEEP.colonistsPerMedicine);
      expect(sick.need, '× (1 + h_old)').toBeCloseTo(well.need * 1.2, 9);
      // The store's Medicine then spoils at its slower rate, rounded down.
      const kept = 1 - GOOD_CONFIG.medicine.spoilage * PRICE.storeSpoilage;
      expect(sick.left, 'the colonists take that need from the shelf').toBe(Math.floor((sick.medicine - sick.need) * kept));
      // From h 0 the month ends at 0.01: 400 × (1.04 − 0.0005) still rounds to 416.
      expect(well.colonists).toBe(Math.round(400 * UPKEEP.colonistGrowth.fed));
      // The growth reads the month's new share, not h_old's 0.2: fed and treated, 0.2 + 0.8 × (0.01 + 0.15 × 0.2) − 0.2 × 0.5 = 0.132.
      // Rounded once: 400 × 1.0334 = 413.36 → 413 (h_old's 0.2 would give 412, no cut 416).
      expect(sick.colonists, 'the growth rate is 0.05 × 0.132 lower').toBe(Math.round(400 * (UPKEEP.colonistGrowth.fed - HEALTH.growthPerSick * 0.132)));
    });
  });

  it('needs B-AC-6: health on, a colony at h 0.3 fed with all its Medicine ends upkeep at about 0.19, its mood\'s target about 1.9 lower than at h 0', () => {
    withHealth(() => {
      const state = stockedAtAuction();
      state.colony!.sick = 0.3;
      advancePhase(state);
      expect(state.phase).toBe('upkeep');
      expect(state.history.at(-1)!.shortages, 'fed: the store had all they needed').toEqual([]);
      expect(sickShare(state), '0.3 + 0.7 × 0.055 − 0.15').toBeCloseTo(0.1885, 9);

      // The same month from h 0 ends at the base rate's 0.01, so its target is 0.1 down: the mood, a whole number
      // within one month's step of both targets, ends 2 points higher than the sick colony's.
      const twin = stockedAtAuction();
      advancePhase(twin);
      expect(sickShare(twin)).toBeCloseTo(HEALTH.base, 9);
      expect(twin.colony!.happiness - state.colony!.happiness).toBe(2);
    });
  });

  it('needs B-AC-7: health on and no Medicine on the shelf for months, h never exceeds 0.4', () => {
    withHealth(() => {
      const state = game();
      const seen: number[] = [];
      for (let month = 0; month < 10; month++) {
        toAuction(state);
        state.store.stock.medicine = 0;
        advancePhase(state);
        seen.push(sickShare(state)!);
      }
      expect(Math.max(...seen)).toBeLessThanOrEqual(0.4);
      expect(seen.at(-1), 'it reaches the cap and holds there').toBe(0.4);
    });
  });

  it('needs T-AC-9 (WS7 minor A): a Collapse month with h > 0 sizes the colony by the Collapse rule alone, with no sick cut on top', () => {
    withHealth(() => {
      const state = stockedAtAuction();
      state.colonists = 400;
      state.colony!.sick = 0.3;
      state.air = POLLUTION.bands.find((b) => b.name === 'collapse')!.from;
      const { colonistMonth } = runUpkeep(state);
      runColony(state, colonistMonth);
      expect(state.colonists).toBe(Math.round(400 * (1 - POLLUTION.collapseLeave)));
    });
  });

  it("FM-sick-size-readers: with health on, the export ship keeps the store's cover for the colony's size after the sick cut, not before it", () => {
    withHealth(() => {
      const state = stockedAtAuction();
      state.colonists = 2000;
      state.colony!.sick = HEALTH.cap;
      Object.assign(state.store.stock, { food: 700, water: 700, medicine: 0 });
      // A hold the store's surplus can't fill, so the ship buys down to the cover it keeps.
      state.ship = { ...state.ship, arrives: state.month, goods: ['food'], hold: { food: 1000 }, bought: {} };
      expect(shipInPort(state)).toBe(true);
      const before = cloneForSim(state);
      advancePhase(state);
      expect(state.phase).toBe('upkeep');
      expect(state.colonists, 'the premise: sickness cut the growth').toBeLessThan(Math.round(2000 * UPKEEP.colonistGrowth.fed));
      const sized = cloneForSim(before);
      sized.colonists = state.colonists;
      expect(state.store.stock.food).toBe(Math.ceil(monthlyDemand(sized, 0).food * PRICE.targetCover));
    });
  });

  it('needs T-AC-4: the sick growth cut floors the colony at 0: rate 0 with h 0.4 gives 0, not a negative', () => {
    expect(grownColonists(100, 0, 0.4)).toBe(0);
    expect(grownColonists(100, 1, 0.4), 'above 0 it still cuts').toBe(98);
  });

  it("FM-medicine-shortage: an upkeep the colonists go short of Medicine reports Medicine short, as Food and Water, and the mood does not count it", () => {
    withHealth(() => {
      const state = stockedAtAuction();
      state.store.stock.medicine = 0;
      const { shortages, colonistMonth } = runUpkeep(state);
      expect(shortages, "the store's prices and the computer players' outlook read the month's shortages").toContain('medicine');
      expect(hardship(severity(colonistMonth.short)), 'Medicine reaches the mood only through sickness, not the bite of hardship').toBe(0);

      // At the table: a Medicine-short month's mood differs from a stocked one's by what the sick share explains,
      // moodPerSick × the difference in h (0.21 against 0.01: 2 points), never by a hardship shock on top.
      const short = stockedAtAuction();
      short.store.stock.medicine = 0;
      const stocked = stockedAtAuction();
      advancePhase(short);
      advancePhase(stocked);
      expect(short.history.at(-1)!.shortages).toContain('medicine');
      const explained = HEALTH.moodPerSick * (sickShare(short)! - sickShare(stocked)!);
      expect(explained).toBeCloseTo(2, 9);
      expect(Math.abs(stocked.colony!.happiness - short.colony!.happiness - explained), 'the whole-number mood, within its rounding').toBeLessThan(1);
    });
  });

  it('needs T-AC-9: growth reads the h this upkeep writes, also when the meal went short (Medicine short; hungry)', () => {
    withHealth(() => {
      for (const shelf of [{ food: 500, water: 500, medicine: 0 }, { food: 0, water: 500, medicine: 500 }]) {
        const state = toAuction(game());
        expect(shipInPort(state), 'the premise: no export ship this upkeep').toBe(false);
        state.colonists = 2000;
        state.colony!.sick = 0.1;
        Object.assign(state.store.stock, shelf);
        const short = { food: shelf.food === 0 ? 1 : 0, water: 0, medicine: shelf.medicine === 0 ? 1 : 0 };
        const rate = growthRate(state, severity(short));
        advancePhase(state);
        expect(state.phase).toBe('upkeep');
        expect(state.colonists, `shelf ${JSON.stringify(shelf)}: the cut reads the h the colony now holds`).toBe(grownColonists(2000, rate, sickShare(state)!));
      }
    });
  });
});

describe('needs C9: Electronics are a comfort (RULE-9)', () => {
  it('needs T-AC-10: the bonus is 4 × the share met; a want of 0 gives 0; it is never negative', () => {
    expect(moodTarget({ ...QUIET, comfort: 0.5 })).toBe(moodTarget(QUIET) + HEALTH.electronicsBonus * 0.5);
    expect(moodTarget({ ...QUIET, comfort: 1 })).toBe(moodTarget(QUIET) + HEALTH.electronicsBonus);
    expect(electronicsComfort(400, 4)).toEqual({ took: 4, met: 0.5 });
    expect(electronicsComfort(400, 20), 'they take their want and no more').toEqual({ took: 8, met: 1 });
    expect(electronicsComfort(0, 20), 'no colonists: no want, no bonus').toEqual({ took: 0, met: 0 });
    expect(electronicsComfort(400, 0), 'none on the shelf: no bonus, and no penalty').toEqual({ took: 0, met: 0 });
    expect(electronicsComfort(400, -3).met).toBe(0);
    expect(moodTarget({ ...QUIET, comfort: 0 })).toBe(moodTarget(QUIET));
  });

  it('needs B-AC-8: 400 colonists and 8 Electronics in the store take 8 and the mood\'s target is 4 higher; with none it is unchanged', () => {
    const month = (electronics: number, on: boolean) => {
      const run = () => {
        const state = stockedAtAuction();
        state.colonists = 400;
        state.store.stock.electronics = electronics;
        advancePhase(state);
        return state;
      };
      return on ? withHealth(run) : run();
    };
    const comforted = month(8, true);
    const without = month(0, true);
    const off = month(8, false);
    expect(comforted.store.stock.electronics, 'the colonists took all 8').toBe(0);
    expect(off.store.stock.electronics, 'health off: nobody takes them').toBe(8);
    expect(comforted.colony!.happiness - without.colony!.happiness, 'the target is 4 higher').toBe(HEALTH.electronicsBonus);
    expect(without.colony!.happiness, 'none on the shelf: the mood is as with no comfort rule at all').toBe(off.colony!.happiness);
  });
});

describe('needs HC-13: colony health is on', () => {
  it('needs HC-13: colony health is on by default (Heiko, 8 Nov)', () => {
    expect(HEALTH.enabled, 'health plays').toBe(true);
    expect(STRATEGIST.medicineDespiteInputs, 'a hungry seat may still build a Medicine works').toBe(true);
    expect(HEALTH.growthPerSick * HEALTH.cap, 'growth\'s cut at the cap: sickness bites like hunger').toBeCloseTo(0.08, 9);
  });
});

describe('needs HC-13: health ships switched off', () => {
  // The snapshot is stableJson(state) of this game on b5e59dda, the base before colony health. It may change only when
  // health-off behaviour is meant to change, as needs C3's hardship did (its mood and the colony's memory of hardship).
  // Regenerate with `pnpm --filter @mule/engine test colony-health -u`.
  it('needs T-AC-11: health off, h stays 0 and a month\'s state is identical to the base; politics off, there is no h', async () => {
    expect(HEALTH.enabled, 'health ships off').toBe(false);
    const state = game();
    state.store.stock.electronics = 10;
    for (let steps = 0; state.month < 4 && steps < 200; steps++) advancePhase(state);
    expect(state.month).toBe(4);
    await expect(JSON.stringify(JSON.parse(stableJson(state)), null, 2)).toMatchFileSnapshot('./__snapshots__/health-off-month-4.json');
    expect(sickShare(state)).toBe(0);

    const plain = (on: boolean) => {
      const run = () => {
        const s = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: false });
        s.store.stock.electronics = 10;
        for (let steps = 0; s.month < 4 && steps < 200; steps++) advancePhase(s);
        return s;
      };
      return on ? withHealth(run) : run();
    };
    const offOn = plain(true);
    expect(sickShare(offOn), 'politics off: no colony, so no sick share').toBeNull();
    expect(stableJson(offOn), 'and health on moves nothing without a colony').toBe(stableJson(plain(false)));
  });

  it('needs T-AC-11: health off, or politics off, a hungry upkeep grows the colony at the plain rate, with no sick cut', () => {
    const hungry = (politics: boolean) => {
      const state = toAuction(game(politics));
      expect(shipInPort(state), 'the premise: no export ship this upkeep').toBe(false);
      state.colonists = 2000;
      Object.assign(state.store.stock, { food: 0, water: 500, medicine: 500 });
      const rate = growthRate(state, severity({ food: 1, water: 0 }));
      advancePhase(state);
      return { colonists: state.colonists, plain: Math.round(2000 * rate) };
    };
    const off = hungry(true);
    expect(off.colonists, 'health off').toBe(off.plain);
    const noColony = withHealth(() => hungry(false));
    expect(noColony.colonists, 'health on, politics off').toBe(noColony.plain);
  });
});

describe('needs C19: the gauge reads the engine, never a second copy of its numbers', () => {
  it('needs C19 (bands): health is round(100 × (1 − h)); the gauge is well from 90, at the limit at the cap\'s health, and marks where crews fall sick', () => {
    expect(healthOf(0.12)).toBe(88);
    expect(healthOf(0.155), 'half a point rounds up').toBe(85);
    expect(healthGauge()).toEqual({ wellFrom: 90, atLimit: 60, crewSickAt: 80 });
    const { cap, crewSickFrom } = HEALTH;
    try {
      HEALTH.cap = 0.3;
      HEALTH.crewSickFrom = 0.3;
      expect(healthGauge().atLimit, 'the limit follows the cap, as a tuning --set moves it').toBe(70);
      expect(healthGauge().crewSickAt, 'and the crews\' mark follows crewSickFrom').toBe(70);
    } finally {
      Object.assign(HEALTH, { cap, crewSickFrom });
    }
  });
});
