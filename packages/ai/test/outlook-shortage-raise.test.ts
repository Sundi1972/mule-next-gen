import { describe, expect, it } from 'vitest';
import { advancePhase, cloneForSim, createGame, nextPostedPrice, observe, STRATEGIST, type GameState } from '@mule/engine';
import { outlook } from '../src/outlook.js';

/**
 * The forecast's shortage raise (outlook's rollForward, pricing RULE-6 row 2): for a good the colonists went short of in
 * the months the forecast rolls through, `later` forecasts at least the store's own price for the month after such a
 * shortage. Without the raise, `later` holds the price posted at the asked month (STRATEGIST.outlookMonths on), which
 * lags a shelf that runs dry after it.
 */

const SEED = 3;
/** Store Food that lasts past the asked month's auction (posted in the short band) but runs dry at the upkeep after. */
const STORE_FOOD = 25;

/** Month 1's development, the store's shelf holding STORE_FOOD. */
function development(): GameState {
  const state = createGame({ seed: SEED, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
  while (state.phase !== 'development') advancePhase(state);
  state.store.stock.food = STORE_FOOD;
  return state;
}

describe('outlook: the forecast raises a good the colonists went short of', () => {
  it('T-AC-outlook-shortage-raise: later(Food) is the store\'s price after a Food shortage, above the price posted at the asked month', () => {
    const o = outlook(observe(development(), 'ai0'), 'ai0', { lookAhead: true });
    const asked = o.stage.month + STRATEGIST.outlookMonths;

    // The status quo the forecast plays, played here on its own copy by the engine's phases: nobody claims, builds or
    // trades, so Food moves only by production, meals and spoilage (the forecast's corral drain moves MULEs, not Food).
    const replay = cloneForSim(o.stage);
    let postedAtAsked: number | null = null;
    const foodShort = () => replay.history.find((h) => h.shortages.includes('food'));
    for (let guard = 0; guard < 64 && !foodShort() && replay.phase !== 'gameOver'; guard++) { // literal-ok: a guard on the replay, not balance
      advancePhase(replay);
      if (replay.phase === 'auction' && replay.month === asked) postedAtAsked = replay.store.posted.food;
    }

    // The premise: the colonists go short of Food in a month the forecast rolls through, after the asked month's posting.
    const short = foodShort();
    expect(short, 'the premise: the colonists go short of Food within the forecast').toBeDefined();
    expect(short!.month, 'the premise: the shortage falls inside the forecast\'s horizon').toBeLessThan(o.stage.month + STRATEGIST.horizon);
    expect(postedAtAsked, 'the premise: the asked month\'s auction posts before the shortage').not.toBeNull();

    // The store's own price for the month after its colonists went short of Food, from the engine's pricing.
    const raised = nextPostedPrice(replay, 'food', undefined, ['food']);
    expect(raised, 'the premise: the raise lifts Food above the price posted at the asked month').toBeGreaterThan(postedAtAsked!);
    expect(o.later('food')).toBe(Math.max(postedAtAsked!, raised));
  });
});
