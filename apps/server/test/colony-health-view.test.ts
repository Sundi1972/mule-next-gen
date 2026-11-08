import { describe, expect, it } from 'vitest';
import { advancePhase, colonistMedicineNeed, HEALTH, healthOf, sickShare, type GameState } from '@mule/engine';
import type { ColonyHealthView } from '@mule/protocol';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/** Runs `body` with colony health switched on, and switches it back off whatever happens. */
function withHealth<T>(body: () => T): T {
  HEALTH.enabled = true;
  try {
    return body();
  } finally {
    HEALTH.enabled = false;
  }
}

/** A started game, politics on unless asked otherwise, with no election open. */
function table(politics = true) {
  const { ctx } = fakeContext();
  const game = new MuleGame(ctx, 7, { politics });
  game.start(seats);
  const state = engineOf(game);
  if (state.politics) state.politics = { ...state.politics, election: null };
  return { game, state };
}

/** Plays the engine on to the next upkeep, the store's Medicine shelf set by `medicine` just before it. */
function upkeepWith(state: GameState, medicine: (state: GameState) => number): void {
  for (let steps = 0; state.phase !== 'auction' && steps < 50; steps++) advancePhase(state);
  expect(state.phase).toBe('auction');
  state.store.stock.medicine = medicine(state);
  advancePhase(state);
  expect(state.phase).toBe('upkeep');
}

const NONE = () => 0;
/** Every Medicine the colonists could need, and more. */
const PLENTY = (state: GameState) => Math.ceil(colonistMedicineNeed(state)) + 50;

/** What every screen is sent: the TV and both phones carry the same colonyHealth. */
function sent(game: MuleGame): ColonyHealthView | null | undefined {
  const [tv, ...phones] = [null, 's1', 's2'].map((seat) => game.viewFor(seat).colonyHealth);
  for (const phone of phones) expect(phone, 'every phone sees what the TV sees').toEqual(tv);
  return tv;
}

describe('needs C19: the view carries colony health and the run of Medicine-short upkeeps', () => {
  it('needs B-AC-18: three Medicine-short upkeeps give { health, medicineShort true, shortMonths 3 }, lastHealth the upkeep before; a month with Medicine gives false, 0', () => {
    withHealth(() => {
      const { game, state } = table();
      const seen: (ColonyHealthView | null | undefined)[] = [];
      const shares: number[] = [];
      for (let month = 0; month < 3; month++) {
        upkeepWith(state, NONE);
        seen.push(sent(game));
        shares.push(sickShare(state)!);
      }
      expect(seen[0], 'the first upkeep with health on has no last health').toEqual({ health: healthOf(shares[0]!), medicineShort: true, shortMonths: 1, lastHealth: null });
      expect(seen[2]).toEqual({ health: healthOf(shares[2]!), medicineShort: true, shortMonths: 3, lastHealth: healthOf(shares[1]!) });
      expect(seen[2]!.health, 'the premise: the colony is sicker than it started').toBeLessThan(100);

      upkeepWith(state, PLENTY);
      expect(state.history.at(-1)!.shortages, 'the premise: the colonists got their Medicine').not.toContain('medicine');
      expect(sent(game)).toEqual({ health: healthOf(sickShare(state)!), medicineShort: false, shortMonths: 0, lastHealth: healthOf(shares[2]!) });
    });
  });

  it('needs B-AC-7 (the view half): with no Medicine on the shelf for months, the view shows health 60, the cap', () => {
    withHealth(() => {
      const { game, state } = table();
      for (let month = 0; month < 10; month++) upkeepWith(state, NONE);
      expect(sickShare(state), 'the premise: the sick share sits at the cap').toBe(HEALTH.cap);
      expect(sent(game)).toMatchObject({ health: 60, medicineShort: true, shortMonths: 10, lastHealth: 60 });
    });
  });

  it('needs B-AC-18 (negative): with health off, or politics off, colonyHealth is null', () => {
    const off = table();
    upkeepWith(off.state, NONE);
    expect(HEALTH.enabled, 'health ships off').toBe(false);
    expect(sent(off.game), 'health off').toBeNull();

    withHealth(() => {
      const plain = table(false);
      upkeepWith(plain.state, NONE);
      expect(plain.state.colony, 'the premise: politics off has no colony').toBeNull();
      expect(sent(plain.game), 'politics off').toBeNull();
    });
  });
});

describe("the month end's news line (WS3's named edit)", () => {
  /** The month end's first news line, as the server writes it after the upkeep. */
  const upkeepNews = (game: MuleGame) => {
    (game as unknown as { reportUpkeep(): void }).reportUpkeep();
    return game.viewFor(null).news[0];
  };

  it('FM-news-leaving: a Medicine-only shortage with the colony fed says the store ran out of Medicine, never that colonists are leaving', () => {
    withHealth(() => {
      const { game, state } = table();
      for (let steps = 0; state.phase !== 'auction' && steps < 50; steps++) advancePhase(state);
      Object.assign(state.store.stock, { food: 500, water: 500, medicine: 0 });
      advancePhase(state);
      const report = state.history.at(-1)!;
      expect(report.shortages, 'the premise: Medicine alone ran out').toEqual(['medicine']);
      expect(report.colonistsHungry, 'the premise: the colony is fed').toBe(false);
      expect(upkeepNews(game)).toBe('The store ran out of medicine.');
    });
  });

  it('FM-news-leaving: colonists leave in the news only when the upkeep shrank the colony: no Food says so, 5% short of it (the colony still grows) does not', () => {
    /** The news after an upkeep with 400 colonists and `food` Food on the store's shelf, and the colony's size before and after it. */
    const upkeepWithFood = (food: number) => {
      const { game, state } = table();
      for (let steps = 0; state.phase !== 'auction' && steps < 50; steps++) advancePhase(state);
      state.colonists = 400;
      Object.assign(state.store.stock, { food, water: 500 });
      advancePhase(state);
      return { news: upkeepNews(game), after: state.colonists, hungry: state.history.at(-1)!.colonistsHungry };
    };
    const none = upkeepWithFood(0);
    expect(none.after, 'the premise: the colony shrank').toBeLessThan(400);
    expect(none.news).toBe('The store ran out of food! Colonists are leaving.');

    const slightly = upkeepWithFood(19);
    expect(slightly.hungry, 'the premise: 1 of their 20 Food went missing').toBe(true);
    expect(slightly.after, 'the premise: within the tolerance the colony still grew').toBeGreaterThan(400);
    expect(slightly.news).toBe('The store ran out of food.');
  });
});
