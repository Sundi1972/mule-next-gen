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
  GAME,
  GOOD_CONFIG,
  MULE,
  mulePrice,
  needsOf,
  PERCENT,
  runProduction,
  runUpkeep,
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

/** Three seats; p0 owns `outfits`, one plot each, plains first, and a production has run. */
function table(outfits: readonly (Outfit | null)[] = ['food', 'smithore']): { state: GameState; plots: number[] } {
  const state = createGame({ seed: 7, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })) });
  const free = state.tiles.map((t, i) => (t.terrain === 'store' ? -1 : i)).filter((i) => i >= 0);
  free.sort((a, b) => Number(state.tiles[b]!.terrain === 'plains') - Number(state.tiles[a]!.terrain === 'plains'));
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

/** What upkeep leaves of `held` Water, as runUpkeep plays it: the drink, then spoilage rounded down, then the depot cap. */
const afterUpkeep = (state: GameState, held: number) =>
  Math.min(UPKEEP.depotCapacity, Math.floor(Math.max(0, held - needsOf(state, 'p0').water) * (1 - GOOD_CONFIG.water.spoilage)));

const SHORT = pct(UPKEEP.shortOutputShare);
const CREW_RULE = `a raw MULE adds ${UPKEEP.crew.raw} crew, a works ${UPKEEP.crew.factory}`;

/** Idle plains plots no one owns. */
const freePlains = (state: GameState) => state.tiles.flatMap((t, i) => (t.terrain === 'plains' && t.owner === null ? [i] : []));
const install = (state: GameState, plots: readonly number[], outfit: Outfit) => {
  for (const i of plots) Object.assign(state.tiles[i]!, { owner: 'p0', outfit });
};

/** Whether each Food plot of p0's was cut for want of Water at the production that runs on `state`, on a copy; Energy is plentiful so only Water cuts. */
function waterCut(state: GameState): boolean[] {
  const copy = structuredClone(state);
  p0(copy).stock.energy = UPKEEP.depotCapacity * UPKEEP.depotCapacity;
  const { lines } = runProduction(copy);
  const farms = lines.filter((l) => l.good === 'food' && copy.tiles[l.tile]!.owner === 'p0');
  expect(farms.length).toBeGreaterThan(0);
  for (const l of farms) expect(l.parts.reduce((n, part) => n + Math.max(0, part.delta), 0)).toBeGreaterThan(0);
  return farms.map((l) => l.parts.some((part) => part.why === 'noWater'));
}

/** The game after this month's upkeep, on a copy, with `more` raw MULEs installed on free plains as next month's development would. */
function nextMonth(state: GameState, held: number, more: number, farm?: number): GameState {
  const copy = structuredClone(state);
  p0(copy).stock.water = held;
  runUpkeep(copy);
  if (farm !== undefined) install(copy, [farm], 'food');
  install(copy, freePlains(copy).slice(0, more), 'smithore');
  return copy;
}

describe('deep3 fix 1: the Water production checks for the Food plots', () => {
  it('deep3 fix 1: short, the land brief says the Food plots make the short share at the next production with no Water to buy before it, and production cuts them', () => {
    const { state } = table(['food', 'food', 'smithore']);
    const need = needsOf(state, 'p0').water;
    p0(state).stock.water = need - 1;
    expect(land(state)).toContain(
      `Water in units: you hold ${need - 1}, against the ${need} the next production checks you hold (what your household and 3 crew drink a month): ` +
        `short by 1, so your 2 Food plots make ${SHORT} of their output at that production, and no Water can be bought before it.`,
    );
    expect(waterCut(state)).toEqual([true, true]);
  });

  it('deep3 fix 1: covered, the land brief gives the crew this month may add before the need grows; production keeps the Food plot whole within it and cuts it one past', () => {
    // A seat whose need is about to grow (the review's probe: one more MULE cuts it), and one with room.
    for (const outfits of [['food', 'smithore', 'smithore', 'smithore', 'smithore', 'smithore'], ['food']] as Outfit[][]) {
      const { state } = table(outfits);
      const need = needsOf(state, 'p0').water;
      p0(state).stock.water = need;
      const text = land(state);
      const said = text.match(/covered for (\d+) more crew \(([^)]*)\); one more makes the need (\d+), and then your Food plot makes (\d+%) of its output at that production, with no Water to buy before it\./);
      expect(said, text).not.toBeNull();
      const [, room, rule, next, share] = said!;
      expect([rule, Number(next), share]).toEqual([CREW_RULE, need + 1, SHORT]);
      const within = Math.floor(Number(room) / UPKEEP.crew.raw);
      const grown = (mules: number) => {
        const copy = structuredClone(state);
        install(copy, freePlains(copy).slice(0, mules), 'smithore');
        return copy;
      };
      expect(waterCut(grown(within))).toEqual([false]);
      expect(waterCut(grown(within + 1))).toEqual([true]);
    }
  });

  it("deep3 fix 1: a seat with no Food plot yet hears what one installed this month faces at this month's production, its MULE's crew counted; production agrees", () => {
    const { state, plots } = table(['smithore', null]);
    const farm = plots[1]!;
    const withFarm = structuredClone(state);
    install(withFarm, [farm], 'food');
    const need = needsOf(withFarm, 'p0').water;
    p0(state).stock.water = need - 1;
    expect(land(state)).toContain(
      `Water in units: you hold ${need - 1} and own no Food plot yet. A Food plot you install this month is checked at this month's production, against the ${need} your household and crew drink with its MULE: ` +
        `short by 1, so it makes ${SHORT} of its output at that production, and no Water can be bought before it.`,
    );
    install(state, [farm], 'food');
    expect(waterCut(state)).toEqual([true]);
    state.tiles[farm]!.outfit = null;
    p0(state).stock.water = need;
    expect(land(state)).toMatch(new RegExp(`against the ${need} your household and crew drink with its MULE: covered for \\d+ more crew beyond its MULE \\(${CREW_RULE}\\)`));
    install(state, [farm], 'food');
    expect(waterCut(state)).toEqual([false]);
  });

  it('deep3 fix 1: the auction brief gives the holding that keeps the Food plots whole next month, and the holding once next month\'s MULEs raise the need; upkeep then production agree', () => {
    const { state } = table(['food', 'smithore']);
    const need = needsOf(state, 'p0').water;
    let keep = need;
    while (afterUpkeep(state, keep) < need) keep++;
    p0(state).stock.water = keep - 2;
    const text = auction(state);
    expect(text).toContain(
      `Water in units: you hold ${keep - 2}. To keep your Food plot whole next month, end this auction holding ${keep}: upkeep drinks ${need}, ` +
        `${pct(GOOD_CONFIG.water.spoilage)} of the rest spoils, rounded down, and the next production checks you still hold ${need}: short by 2, or your Food plot makes ${SHORT} of its output next month.`,
    );
    const grows = text.match(
      /If next month's MULEs add (\d+) to (\d+) crew \(([^)]*)\), production checks (\d+): hold (\d+); every (\d+) crew past that add one more to the check\./,
    );
    expect(grows, text).not.toBeNull();
    const [, low, high, rule, next, keepNext, every] = grows!;
    expect([rule, Number(next), Number(high) - Number(low) + 1, Number(every)]).toEqual([CREW_RULE, need + 1, UPKEEP.crewPerWater, UPKEEP.crewPerWater]);
    const mules = (crew: number) => Math.ceil(crew / UPKEEP.crew.raw);
    expect(waterCut(nextMonth(state, keep, 0))).toEqual([false]);
    expect(waterCut(nextMonth(state, keep - 1, 0))).toEqual([true]);
    // The stated holding keeps the Food plot whole across the whole stated range, and one past it the check rises again.
    for (const crew of [Number(low), Number(high)]) {
      expect(waterCut(nextMonth(state, Number(keepNext), mules(crew)))).toEqual([false]);
      expect(waterCut(nextMonth(state, Number(keepNext) - 1, mules(crew)))).toEqual([true]);
    }
    expect(waterCut(nextMonth(state, Number(keepNext), mules(Number(high) + 1)))).toEqual([true]);
  });

  it('deep3 fix 1: with no Food plot yet, the auction brief gives the holding that keeps one installed next month whole; upkeep then production agree', () => {
    const { state, plots } = table(['smithore', null]);
    const farm = plots[1]!;
    p0(state).stock.water = 0;
    const text = auction(state);
    const said = text.match(/Water in units: you hold 0 and own no Food plot yet\. To keep a Food plot you install next month whole, end this auction holding (\d+): upkeep drinks (\d+), \d+% of the rest spoils, rounded down, and the next production checks you still hold (\d+) with its MULE: short by (\d+), or it makes (\d+%) of its output next month\./);
    expect(said, text).not.toBeNull();
    const [, keep, drink, check, short, share] = said!;
    expect([Number(drink), Number(short), share]).toEqual([needsOf(state, 'p0').water, Number(keep), SHORT]);
    const withFarm = structuredClone(state);
    install(withFarm, [farm], 'food');
    expect(Number(check)).toBe(needsOf(withFarm, 'p0').water);
    expect(waterCut(nextMonth(state, Number(keep), 0, farm))).toEqual([false]);
    expect(waterCut(nextMonth(state, Number(keep) - 1, 0, farm))).toEqual([true]);
  });

  it("deep3 fix 1: when the need is above what the depot keeps after upkeep, the auction brief names no holding: it says none keeps the Food plots whole", () => {
    // Enough MULEs that the crew's Water passes the depot's cap.
    const mules = UPKEEP.crewPerWater * UPKEEP.depotCapacity;
    const { state, plots } = table(['food', ...Array<Outfit>(mules).fill('smithore')]);
    expect(plots).toHaveLength(mules + 1);
    const need = needsOf(state, 'p0').water;
    expect(need).toBeGreaterThan(UPKEEP.depotCapacity);
    p0(state).stock.water = 0;
    const text = auction(state);
    expect(text).toContain(
      `Water in units: you hold 0; your household and crew drink ${need} at upkeep, and the depot keeps at most ${UPKEEP.depotCapacity} Water after it, ` +
        `less than the ${need} the next production checks, so no holding keeps your Food plot whole next month.`,
    );
    expect(text).not.toContain('end this auction holding');
  });

  it('deep3 fix 1: in the last month the auction brief says no production checks Water again, the month the land rush ends included', () => {
    const { state } = table(['food']);
    p0(state).stock.water = 0;
    const last = `Water in units: you hold 0; your household and crew drink ${needsOf(state, 'p0').water} at upkeep, and this is the last month: no production checks Water again.`;
    state.month = state.maxMonths;
    expect(auction(state)).toContain(last);
    state.month = GAME.landRushMonths + 1;
    expect(auction(state)).toContain('To keep your Food plot whole next month');
    state.landRanOutMonth = 1;
    expect(state.month).toBeLessThan(state.maxMonths);
    expect(auction(state)).toContain(last);
    expect(auction(state)).not.toContain('To keep your Food plot whole');
  });

  it('deep3 fix 1: the manual says when production checks Water: before any plot runs, from what the last upkeep left, against the crew with that month\'s MULEs', () => {
    const production = defaultManual()
      .split('\n')
      .find((l) => l.startsWith('- production: '))!;
    expect(production).toContain(
      "Who is short of Water is decided as production begins, before any plot runs, from the Water the last upkeep left, against what the household and crew drink with every MULE installed by then, that month's development included: a Food plot installed that month is checked at once, and Water made at a production waters the next one.",
    );
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

  it("deep3 fix 4: the land brief quotes the seat's own strategy as set in its month in place of the draft's; with none set it shows the draft's", () => {
    const { state } = table();
    const text = landBrief(state, mind, PERSONAS.trader, { ...draft, strategy: { ...own, reason: 'The persona line.' } }, [], { ownStrategy: { month: 3, strategy: own } }).text;
    expect(text).toContain('Your strategy as you set it in month 3: specialist, moneyMaker Smithore. "Smithore alone; the mines pay best."');
    expect(text).not.toContain('The persona line.');
    expect(text).not.toContain("This month's draft plays");
    expect(land(state)).toContain('Your strategy: builder, moneyMaker Food. "Grow steady."');
  });

  it("deep3 fix 4: when the draft's kind or money-maker differs from the seat's own, the brief says what the draft plays unless the seat sets its strategy again", () => {
    const { state } = table();
    const text = landBrief(state, mind, PERSONAS.trader, draft, [], { ownStrategy: { month: 3, strategy: own } }).text;
    expect(text).toContain('Your strategy as you set it in month 3: specialist, moneyMaker Smithore. "Smithore alone; the mines pay best."');
    expect(text).toContain("This month's draft plays builder, moneyMaker Food, unless you set your strategy again.");
  });
});
