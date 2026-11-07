/**
 * deep3 fixes: facts the deep3 diaries found missing from the brief. The Water production checks for the Food plots,
 * what a MULE counts for in Worth, and the strategy the seat itself set.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_LEVELS,
  AI_PERSONAS,
  allPrices,
  createGame,
  emptyStock,
  GOOD_CONFIG,
  MULE,
  mulePrice,
  needsOf,
  PERCENT,
  UPKEEP,
  type GameState,
  type LandGrantPlay,
  type MonthReport,
  type Outfit,
  type Playbook,
  type Strategy,
} from '@mule/engine';
import { PERSONAS } from '../src/personas.js';
import type { Mind } from '../src/value.js';
import { landBrief, phaseBrief } from '../src/llm/brief.js';
import { defaultManual } from '../src/llm/manual.js';
import type { LandDraft } from '../src/playbook/index.js';

const mind: Mind = { me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader, salt: 3 };
const STRATEGY: Strategy = { kind: 'builder', moneyMaker: 'food', monopolyTarget: null, cashFloor: 200, landTarget: { plots: 6, byMonth: 6 }, stances: {}, reason: 'Grow steady.' };
const landGrant: LandGrantPlay = { ranked: [], pressShare: { start: 0.8, end: 0.4 }, deny: [], planB: [], claims: 1 };
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

const land = (state: GameState) => landBrief(state, mind, PERSONAS.trader, draft, []).text;
const auction = (state: GameState) => phaseBrief(state, mind, PERSONAS.trader, auctionDraft, 'auction', []).text;
const p0 = (state: GameState) => state.players.find((p) => p.id === 'p0')!;
const pct = (share: number) => `${Math.round(share * PERCENT)}%`;

/** Three seats; p0 owns `outfits`, one plot each, and a production has run. */
function table(outfits: readonly (Outfit | null)[] = ['food', 'smithore']): { state: GameState; plots: number[] } {
  const state = createGame({ seed: 7, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })) });
  const free = state.tiles.map((t, i) => (t.terrain === 'store' ? -1 : i)).filter((i) => i >= 0);
  const plots = free.slice(0, outfits.length);
  plots.forEach((i, k) => Object.assign(state.tiles[i]!, { owner: 'p0', outfit: outfits[k] }));
  const report: MonthReport = {
    month: 1,
    before: { p0: emptyStock() },
    produced: { p0: emptyStock() },
    prices: allPrices(state),
    shortages: [],
    storeMules: 0,
    pollutionBy: {},
    air: 0,
    mulePrice: 0,
    corralSoldOut: false,
    storeCapital: 0,
    colonyFund: 0,
    colonistsHungry: false,
    lines: [],
  };
  state.history.push(report);
  return { state, plots };
}

/** What upkeep leaves of `held` Water, as runUpkeep plays it: the drink, then spoilage rounded down. */
const afterUpkeep = (state: GameState, held: number) => Math.floor(Math.max(0, held - needsOf(state, 'p0').water) * (1 - GOOD_CONFIG.water.spoilage));

describe('deep3 fix 1: the Water production checks for the Food plots', () => {
  it('deep3 fix 1: the land brief, asked before the next production, says the Water held against what that production checks; short, the Food plots make the short share and no Water can be bought before it', () => {
    const { state } = table(['food', 'food', 'smithore']);
    const need = needsOf(state, 'p0').water;
    p0(state).stock.water = need - 1;
    expect(land(state)).toContain(
      `Water in units: you hold ${need - 1}, against the ${need} the next production checks you hold (what your household and crew drink a month, at your MULEs today): ` +
        `short by 1, so your 2 Food plots make ${pct(UPKEEP.shortOutputShare)} of their output at that production, and no Water can be bought before it.`,
    );
    p0(state).stock.water = need;
    expect(land(state)).toContain(`Water in units: you hold ${need}, against the ${need} the next production checks you hold (what your household and crew drink a month, at your MULEs today): covered.`);
  });

  it('deep3 fix 1: the need follows needsOf: another MULE adds crew, and with it the Water checked', () => {
    const { state } = table(['food']);
    const before = needsOf(state, 'p0').water;
    const free = state.tiles.map((t, i) => (t.terrain === 'store' || t.owner ? -1 : i)).filter((i) => i >= 0);
    for (const i of free.slice(0, UPKEEP.crewPerWater)) Object.assign(state.tiles[i]!, { owner: 'p0', outfit: 'smithore' });
    const after = needsOf(state, 'p0').water;
    expect(after).toBeGreaterThan(before);
    p0(state).stock.water = before;
    expect(land(state)).toContain(`you hold ${before}, against the ${after} the next production checks you hold`);
    expect(land(state)).toContain(`short by ${after - before}, so your Food plot makes ${pct(UPKEEP.shortOutputShare)} of its output at that production`);
  });

  it('deep3 fix 1: the auction brief says what the seat must end the auction holding to keep its Food plots whole next month: upkeep drinks one need and spoils some of the rest, production checks the second', () => {
    const { state } = table(['food', 'smithore']);
    const need = needsOf(state, 'p0').water;
    // The least that upkeep leaves at `need` or more, found by playing upkeep's arithmetic.
    let keep = need;
    while (afterUpkeep(state, keep) < need) keep++;
    expect(keep).toBeGreaterThan(need + need - 1);
    p0(state).stock.water = keep - 2;
    const intro = `Water in units: you hold ${keep - 2}. To keep your Food plot whole next month, end this auction holding ${keep}: upkeep drinks ${need}, ${pct(GOOD_CONFIG.water.spoilage)} of the rest spoils, rounded down, and the next production checks you still hold ${need}: `;
    expect(auction(state)).toContain(`${intro}short by 2, or your Food plot makes ${pct(UPKEEP.shortOutputShare)} of its output next month.`);
    p0(state).stock.water = keep;
    expect(auction(state)).toContain(`Water in units: you hold ${keep}. To keep your Food plot whole next month, end this auction holding ${keep}:`);
    expect(auction(state)).toMatch(/still hold \d+: covered\./);
    // The number told is the one upkeep's own arithmetic keeps whole, and one less is not.
    expect(afterUpkeep(state, keep)).toBeGreaterThanOrEqual(need);
    expect(afterUpkeep(state, keep - 1)).toBeLessThan(need);
  });

  it('deep3 fix 1: a seat with no Food plot hears its household drink, and that going short of Water cuts nothing; no plot-cut words', () => {
    const { state } = table(['smithore']);
    const need = needsOf(state, 'p0').water;
    p0(state).stock.water = 0;
    for (const text of [land(state), auction(state)]) {
      expect(text).toContain(`Water in units: you hold 0; your household and crew drink ${need} at upkeep, and with no Food plot of yours, going short of Water cuts nothing.`);
      expect(text).not.toMatch(/Food plots? makes?/);
    }
  });

  it('deep3 fix 1: in the last month the auction brief says no production checks Water again', () => {
    const { state } = table(['food']);
    state.month = state.maxMonths;
    p0(state).stock.water = 0;
    const text = auction(state);
    expect(text).toContain(`Water in units: you hold 0; your household and crew drink ${needsOf(state, 'p0').water} at upkeep, and this is the last month: no production checks Water again.`);
    expect(text).not.toContain('To keep your Food plot whole');
  });

  it('deep3 fix 1: the manual says when production checks Water: before any plot runs, from what the last upkeep left', () => {
    const production = defaultManual()
      .split('\n')
      .find((l) => l.startsWith('- production: '))!;
    expect(production).toContain('Who is short of Water is decided as production begins, before any plot runs, from the Water the last upkeep left: Water made at a production waters the next one.');
  });
});

describe("deep3 fix 2: what a MULE counts for in Worth", () => {
  it("deep3 fix 2: the land brief's MULE line says each MULE the seat owns counts at the store's MULE price, labour plus Smithore at its posted price times the factor, live, and that it moves with Smithore", () => {
    const { state } = table(['food', 'smithore', 'greenBelt', null]);
    state.store.muleFactor = 1.25;
    const line = (smithore: number) =>
      `Each MULE you own (3 now) counts in your Worth at the store's MULE price, now ${mulePrice(state)} cr: ` +
      `(${MULE.labour} labour + ${MULE.smithorePerMule} Smithore × the posted Smithore price ${smithore}) × the store's factor 1.25. ` +
      "At the game's end each counts at that day's price, which rises and falls with Smithore's price.";
    state.store.posted.smithore = 40;
    const cheap = mulePrice(state);
    expect(land(state)).toContain(line(40));
    state.store.posted.smithore = 1_500;
    expect(mulePrice(state)).toBeGreaterThan(cheap);
    expect(land(state)).toContain(line(1_500));
    expect(land(state)).toContain(`now ${mulePrice(state)} cr`);
  });
});

describe('deep3 fix 4: the strategy the seat set itself', () => {
  const own: Strategy = { ...STRATEGY, kind: 'specialist', moneyMaker: 'smithore', reason: 'Smithore alone; the mines pay best.' };

  it("deep3 fix 4: the land brief quotes the seat's own strategy since its month in place of the draft's; with none set it shows the draft's", () => {
    const { state } = table();
    const text = landBrief(state, mind, PERSONAS.trader, { ...draft, strategy: { ...own, reason: 'The persona line.' } }, [], { ownStrategy: { month: 3, strategy: own } }).text;
    expect(text).toContain('Your strategy since month 3: specialist, moneyMaker Smithore. "Smithore alone; the mines pay best."');
    expect(text).not.toContain('The persona line.');
    expect(text).not.toContain("This month's draft plays");
    expect(land(state)).toContain('Your strategy: builder, moneyMaker Food. "Grow steady."');
  });

  it("deep3 fix 4: when the draft's kind or money-maker differs from the seat's own, the brief says what the draft plays unless the seat sets its strategy again", () => {
    const { state } = table();
    const text = landBrief(state, mind, PERSONAS.trader, draft, [], { ownStrategy: { month: 3, strategy: own } }).text;
    expect(text).toContain('Your strategy since month 3: specialist, moneyMaker Smithore. "Smithore alone; the mines pay best."');
    expect(text).toContain("This month's draft plays builder, moneyMaker Food, unless you set your strategy again.");
  });
});
