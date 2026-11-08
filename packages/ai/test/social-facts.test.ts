import { describe, expect, it } from 'vitest';
import { allPrices, createGame, observe, scoreParts, type GameState } from '@mule/engine';
import { factsHold, type Fact } from '../src/social/index.js';
import { GOOD_NAME } from '../src/strategist.js';
import type { PhaseFact } from '../src/playbook/index.js';

/** Three seats; p0 is the AI that speaks, owns a plot and holds some Food. */
function table(): GameState {
  const state = createGame({ seed: 5, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: i === 0 })) });
  const plot = state.tiles.findIndex((t) => t.terrain !== 'store' && t.owner === null);
  state.tiles[plot]!.owner = 'p1';
  state.players[0]!.stock.food = 7;
  return state;
}
const ownedPlot = (state: GameState) => state.tiles.findIndex((t) => t.owner === 'p1');

const said = (text: string, facts: Fact[] = []) => ({ text, facts });

describe('the fact guard (spec B RULE-B2)', () => {
  it('T-AC-B2: RULE-B2 on declared facts and numbers', () => {
    const state = table();
    const food = allPrices(observe(state, 'p0')).food;
    const pass = (text: string, facts: Fact[] = []) => expect(factsHold(state, 'p0', said(text, facts)), text).toBe(true);
    const drop = (text: string, facts: Fact[] = []) => expect(factsHold(state, 'p0', said(text, facts)), text).toBe(false);

    // A false declared price: dropped, whether the text names its number or not.
    drop(`${GOOD_NAME.food} is at ${food + 9} now.`, [{ price: 'food', value: food + 9 }]);
    drop(`${GOOD_NAME.food} is dear today.`, [{ price: 'food', value: food + 9 }]);
    // A number with no declared fact: dropped.
    drop(`${GOOD_NAME.food} is at ${food} now.`);
    // A bluff about its own intentions declares no fact: sent.
    pass("I'll vote for you.");
    // A false claim in prose with no number and no declared fact: sent (accepted risk R-B1).
    pass(`The store is out of ${GOOD_NAME.food}.`);
    // A true declared price: sent.
    pass(`${GOOD_NAME.food} is at ${food} now.`, [{ price: 'food', value: food }]);
    // A rule fact naming an action the game does not have: dropped; one it has: sent.
    drop('You may borrow from the store.', [{ rule: 'borrow' }]);
    pass('Anyone may run for Governor.', [{ rule: 'run' }]);
  });

  it('T-AC-B2: owner, score and holding facts are checked against the public state; a price may be a public trade\'s', () => {
    const state = table();
    const plot = ownedPlot(state);
    const worth = scoreParts(state, 'p1').total;
    const check = (text: string, facts: Fact[], trades: PhaseFact[] = []) => factsHold(state, 'p0', said(text, facts), trades);

    expect(check(`Seat 1 holds plot ${plot}.`, [{ owner: plot, player: 'p1' }])).toBe(true);
    expect(check(`Seat 2 holds plot ${plot}.`, [{ owner: plot, player: 'p2' }])).toBe(false);
    expect(check(`Seat 1 is worth ${worth}.`, [{ score: 'p1', value: worth }])).toBe(true);
    expect(check(`Seat 1 is worth ${worth + 1}.`, [{ score: 'p1', value: worth + 1 }])).toBe(false);
    // A holding is the speaker's own stock only.
    expect(check(`I hold 7 ${GOOD_NAME.food}.`, [{ holding: 'food', value: 7 }])).toBe(true);
    expect(check(`I hold 9 ${GOOD_NAME.food}.`, [{ holding: 'food', value: 9 }])).toBe(false);
    // A price that is no posted price but was a public trade's.
    const trade: PhaseFact = { month: 1, phase: 'auction', kind: 'trade', good: 'energy', buyer: 'p1', seller: 'p2', price: 77, qty: 2 };
    expect(check(`${GOOD_NAME.energy} went for 77.`, [{ price: 'energy', value: 77 }], [trade])).toBe(true);
    expect(check(`${GOOD_NAME.energy} went for 77.`, [{ price: 'energy', value: 77 }])).toBe(false);
  });

  it('T-AC-B2: a number may name a month, a plot, or a count of the speaker\'s own intentions; any other undeclared number drops', () => {
    const state = table();
    const pass = (text: string) => expect(factsHold(state, 'p0', said(text)), text).toBe(true);
    const drop = (text: string) => expect(factsHold(state, 'p0', said(text)), text).toBe(false);

    pass('See you in month 4.');
    pass('Keep off plot 12 and I keep off yours.');
    pass(`I'll sell you 4 ${GOOD_NAME.food} at 30 next auction.`);
    drop(`I hold 4 ${GOOD_NAME.food}.`);
    drop(`The store has 12 ${GOOD_NAME.smithore} left.`);
    // Past the game's last month a "month" number is no month.
    drop(`See you in month ${state.maxMonths + 1}.`);
  });
});
