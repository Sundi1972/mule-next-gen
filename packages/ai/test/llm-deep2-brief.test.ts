/**
 * The brief gaps the t120s audit found (6 Nov), fixed before the deep2-opus monitoring run: the seat's species, the
 * standings by Worth, the result since its last plan, the aim to win, the tools named, and the auction's own prices.
 */
import { describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, allPrices, createGame, postPrices, scoreParts, type GameState, type LandGrantPlay, type Playbook, type Strategy } from '@mule/engine';
import { PERSONAS } from '../src/personas.js';
import type { Mind } from '../src/value.js';
import { atAuctionPrices, landBrief, phaseBrief } from '../src/llm/brief.js';
import { WRITER_SYSTEM } from '../src/llm/system.js';
import type { LandDraft } from '../src/playbook/index.js';

function table(): GameState {
  const state = createGame({ seed: 7, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })) });
  const free = state.tiles.map((t, i) => (t.terrain === 'store' ? -1 : i)).filter((i) => i >= 0);
  state.tiles[free[0]!]!.owner = 'p0';
  state.tiles[free[1]!]!.owner = 'p1';
  state.tiles[free[2]!]!.owner = 'p1';
  state.players.find((p) => p.id === 'p1')!.money += 5_000;
  return state;
}
const mind: Mind = { me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader, salt: 3 };
const STRATEGY: Strategy = { kind: 'builder', moneyMaker: 'food', monopolyTarget: null, cashFloor: 200, landTarget: { plots: 6, byMonth: 6 }, stances: {}, reason: 'Grow steady.' };
const landGrant: LandGrantPlay = { ranked: [{ plot: 12, value: 410 }], pressShare: { start: 0.8, end: 0.4 }, deny: [], planB: [], claims: 1 };
const draft: LandDraft = { strategy: STRATEGY, landGrant };
const auctionDraft: Playbook = {
  v: 1,
  seat: 'p0',
  month: 1,
  phase: 'auction',
  strategy: STRATEGY,
  auction: { food: { role: 'buyer', hold: 3, walkAway: 70, start: 40, concedeCrPerS: 3, bluff: false, vsRival: 'hold' } },
  by: 'engine',
};
const fmt = (n: number) => n.toLocaleString('en-US');
const land = (state: GameState, last = {}) => landBrief(state, mind, PERSONAS.trader, draft, [], last).text;
const auction = (state: GameState, last = {}) => phaseBrief(state, mind, PERSONAS.trader, auctionDraft, 'auction', [], last).text;

describe('deep2: the brief gives Claude what the engine seats play with', () => {
  it("deep2: every brief names the seat's species and what it does", () => {
    const state = table();
    const species = state.players.find((p) => p.id === 'p0')!.species;
    for (const text of [land(state), auction(state)]) expect(text).toMatch(new RegExp(`Your species: ${species[0]!.toUpperCase()}${species.slice(1)} — .+\\.`));
  });

  it("deep2: every brief shows the standings by Worth, best first, with the seat's own Worth line by line", () => {
    const state = table();
    const own = scoreParts(state, 'p0');
    for (const text of [land(state), auction(state)]) {
      const line = text.split('\n').find((l) => l.startsWith('Standings by Worth'));
      expect(line, text).toBeDefined();
      // p1 has 5,000 more credits and two plots: it leads.
      expect(line!.indexOf('Seat 1')).toBeLessThan(line!.indexOf('Seat 0 (you)'));
      expect(line).toContain(`Seat 0 (you) ${fmt(own.total)}`);
      expect(text).toContain(`Your Worth ${fmt(own.total)}: money ${fmt(own.money)}, goods ${fmt(own.goods)}, land ${fmt(own.land)}`);
    }
  });

  it("deep2: given each seat's Worth at its last plan, the brief shows the change since; without it, no such line", () => {
    const state = table();
    const now = Object.fromEntries(state.players.map((p) => [p.id, scoreParts(state, p.id).total]));
    const before = { month: 1, worth: { ...now, p0: now.p0! - 250, p1: now.p1! + 100 } };
    const text = land(state, { worthBefore: before });
    expect(text).toContain(`Since your plan for month 1: your Worth ${fmt(now.p0! - 250)} → ${fmt(now.p0!)} (+250)`);
    expect(text).toContain('Seat 1 −100');
    expect(land(state)).not.toContain('Since your plan for month');
  });

  it('deep2: the brief says the aim is the highest Worth and keeps the character to the table line', () => {
    const text = land(table());
    expect(text).toContain('Your aim: finish with the highest Worth.');
    expect(text).toContain(`Your character, for your table line only: ${PERSONAS.trader.card}`);
  });

  it('deep2: the system text names every tool and the aim to win, and says the character is colour only', () => {
    for (const tool of ['legalMoves', 'worth', 'standings', 'whatIf']) expect(WRITER_SYSTEM).toContain(`- ${tool}:`);
    expect(WRITER_SYSTEM).toContain('Your aim is to win: the highest Worth at the end.');
    expect(WRITER_SYSTEM).not.toContain('in character. The brief shows');
  });

  it("deep2 C1: atAuctionPrices is the game as the auction opens: the store's posted prices moved, the game itself untouched", () => {
    const state = table();
    // Nothing on the shelf or in any hand: Food is short, so its price must rise when the store posts.
    state.store.stock.food = 0;
    for (const p of state.players) p.stock.food = 0;
    const was = allPrices(state).food;
    const expected = structuredClone(state);
    postPrices(expected);
    const view = atAuctionPrices(state);
    expect(allPrices(view).food).toBe(allPrices(expected).food);
    expect(allPrices(view).food).not.toBe(was);
    expect(allPrices(state).food).toBe(was);
    expect(auction(view)).toContain(`Food ${allPrices(expected).food}`);
  });
});
