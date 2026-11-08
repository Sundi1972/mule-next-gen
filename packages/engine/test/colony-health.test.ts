import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  colonistMedicineNeed,
  createGame,
  electronicsComfort,
  GOOD_CONFIG,
  HAPPINESS,
  HEALTH,
  moodInputs,
  moodTarget,
  nextSickShare,
  PERCENT,
  PRICE,
  runUpkeep,
  shipInPort,
  sickShare,
  stableJson,
  UPKEEP,
  type GameState,
  type MoodInputs,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const W = HAPPINESS.weights;
const QUIET: MoodInputs = { short: 0, air: 0, tax: W.taxFree, broken: 0, prestige: 0, gap: 0, welfare: 0 };
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
    // Each sick colonist recovers at recovery × (1 − medicineCut × s_med) and infects at most contagion a month.
    for (let step = 0; step <= 20; step++) {
      const sMed = step / 20;
      expect(HEALTH.recovery * (1 - HEALTH.medicineCut * sMed), `s_med ${sMed}`).toBeGreaterThan(HEALTH.contagion);
    }
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
        runUpkeep(state);
        return { need, medicine, left: state.store.stock.medicine, colonists: state.colonists };
      };
      const well = upkeep(0);
      const sick = upkeep(0.2);
      expect(well.need, 'one Medicine per colonistsPerMedicine').toBe(400 / UPKEEP.colonistsPerMedicine);
      expect(sick.need, '× (1 + h_old)').toBeCloseTo(well.need * 1.2, 9);
      // The store's Medicine then spoils at its slower rate, rounded down.
      const kept = 1 - GOOD_CONFIG.medicine.spoilage * PRICE.storeSpoilage;
      expect(sick.left, 'the colonists take that need from the shelf').toBe(Math.floor((sick.medicine - sick.need) * kept));
      expect(well.colonists).toBe(Math.round(400 * UPKEEP.colonistGrowth.fed));
      expect(sick.colonists, 'the growth rate is 0.05 × 0.2 lower').toBe(Math.round(400 * (UPKEEP.colonistGrowth.fed - HEALTH.growthPerSick * 0.2)));
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
      expect(HEALTH.moodPerSick * sickShare(state)!, 'the target is 1.885 below the one at h 0').toBeCloseTo(1.885, 9);

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

  it("FM-medicine-shortage: an upkeep the colonists go short of Medicine reports Medicine short, as Food and Water, and the mood does not count it", () => {
    withHealth(() => {
      const state = stockedAtAuction();
      state.store.stock.medicine = 0;
      const { shortages } = runUpkeep(state);
      expect(shortages, "the store's prices and the computer players' outlook read the month's shortages").toContain('medicine');
      expect(moodInputs(state, shortages).short, 'Medicine reaches the mood only through sickness').toBe(0);
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

describe('needs HC-13: health ships switched off', () => {
  // The snapshot is stableJson(state) of this game on b5e59dda, the base before colony health. It may change only when
  // health-off behaviour is meant to change. Regenerate with `pnpm --filter @mule/engine test colony-health -u`.
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
});
