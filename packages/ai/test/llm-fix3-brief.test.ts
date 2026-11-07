/**
 * B fix 3: the brief tells the seat what each of its plots made at the last production and why it made less, where
 * MULEs come from, and whether its Food and Energy are covered in units (the deep2 diaries: the brief's "covered" only
 * counted the plots it owned).
 */
import { describe, expect, it } from 'vitest';
import {
  AI_LEVELS,
  AI_PERSONAS,
  allPrices,
  BRAIN,
  corralTarget,
  createGame,
  emptyStock,
  energyUseOf,
  EVENTS,
  monthNeeds,
  MULE,
  mulePriceFor,
  type GameState,
  type LandGrantPlay,
  type MonthEvent,
  type MonthReport,
  type Playbook,
  type ProductionLine,
  type Stock,
  type Strategy,
} from '@mule/engine';
import { PERSONAS } from '../src/personas.js';
import type { Mind } from '../src/value.js';
import { landBrief, phaseBrief } from '../src/llm/brief.js';
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
const devDraft: Playbook = { ...auctionDraft, phase: 'development', auction: undefined, development: { route: [], timeBudgetMs: 1_000, ifSoldOut: 'pub' } };

const land = (state: GameState) => landBrief(state, mind, PERSONAS.trader, draft, []).text;
const auction = (state: GameState) => phaseBrief(state, mind, PERSONAS.trader, auctionDraft, 'auction', []).text;

/**
 * Three seats; p0 owns a farm turned off for want of Energy, a mine short of Water, a plot with no MULE, an Electronics
 * works that did not run and a green belt; p1 owns a farm whose line must never show in p0's brief. The last production
 * report files the lines, as runProduction does.
 */
function table(): { state: GameState; plots: number[]; rival: number } {
  const state = createGame({ seed: 7, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })) });
  const free = state.tiles.map((t, i) => (t.terrain === 'store' ? -1 : i)).filter((i) => i >= 0);
  const plots = free.slice(0, 5);
  const outfits = ['food', 'smithore', null, 'electronics', 'greenBelt'] as const;
  plots.forEach((i, k) => Object.assign(state.tiles[i]!, { owner: 'p0', outfit: outfits[k] }));
  const rival = free[9]!;
  Object.assign(state.tiles[rival]!, { owner: 'p1', outfit: 'food' });
  const lines: ProductionLine[] = [
    { tile: plots[0]!, good: 'food', made: 1, parts: [{ why: 'ground', delta: 3 }, { why: 'energyOff', delta: -2 }] },
    { tile: plots[1]!, good: 'smithore', made: 2, parts: [{ why: 'ground', delta: 4 }, { why: 'noWater', delta: -2 }] },
    { tile: rival, good: 'food', made: 4, parts: [{ why: 'ground', delta: 4 }] },
  ];
  state.history.push(report(state, 1, { food: 1, smithore: 2 }, lines));
  return { state, plots, rival };
}

function report(state: GameState, month: number, made: Partial<Stock>, lines: ProductionLine[]): MonthReport {
  return {
    month,
    before: { p0: emptyStock() },
    produced: { p0: { ...emptyStock(), ...made } },
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
    lines,
  };
}

describe('B fix 3: what the brief tells the seat of its plots, its MULEs and its Food and Energy', () => {
  it('B fix 3: the land and auction briefs give one line per plot of the seat\'s own: what it made last production, and why it made less where the engine recorded why', () => {
    const { state, plots, rival } = table();
    for (const text of [land(state), auction(state)]) {
      expect(text).toContain('What your plots made at the last production (month 1):');
      expect(text).toContain(`- plot ${plots[0]} Food MULE: made 1 Food (turned off for want of Energy −2)`);
      expect(text).toContain(`- plot ${plots[1]} Smithore MULE: made 2 Smithore (short of Water −2)`);
      expect(text).toContain(`- plot ${plots[2]}: no MULE, made nothing`);
      expect(text).toContain(`- plot ${plots[3]} Electronics works: made nothing: it did not run, short of its inputs`);
      expect(text).toContain(`- plot ${plots[4]} green belt: makes no goods`);
      // A rival's plot is not the seat's: its line is never shown as its own.
      expect(text).not.toContain(`- plot ${rival} `);
    }
  });

  it('B fix 3: a plot that made its full output names no reason; before the first production the brief says none has run', () => {
    const { state, plots } = table();
    state.history.at(-1)!.lines![0] = { tile: plots[0]!, good: 'food', made: 3, parts: [{ why: 'ground', delta: 3 }] };
    expect(land(state)).toContain(`- plot ${plots[0]} Food MULE: made 3 Food\n`);
    state.history.length = 0;
    expect(land(state)).toContain('No production has run yet.');
    expect(land(state)).not.toContain('What your plots made');
  });

  it('B fix 3: the plot lines stop at BRAIN.brief.plotsPerPlayer, the rest counted', () => {
    const { state } = table();
    const more = state.tiles.map((t, i) => (t.terrain === 'store' || t.owner ? -1 : i)).filter((i) => i >= 0).slice(0, BRAIN.brief.plotsPerPlayer);
    for (const i of more) state.tiles[i]!.owner = 'p0';
    const owned = state.tiles.filter((t) => t.owner === 'p0').length;
    const text = land(state);
    expect(text.split('\n').filter((l) => /^- plot \d+/.test(l))).toHaveLength(BRAIN.brief.plotsPerPlayer);
    expect(text).toContain(`- and ${owned - BRAIN.brief.plotsPerPlayer} more plots`);
  });

  it('B fix 3: the land brief says where MULEs come from: the corral now, the store\'s Smithore, what the next upkeep can build, and this month\'s price', () => {
    const { state } = table();
    state.store.mules = 6;
    state.store.stock.smithore = 4;
    const target = corralTarget(state.players.length);
    const buildable = Math.floor(4 / MULE.smithorePerMule);
    const text = land(state);
    expect(text).toContain(
      `MULEs: 6 in the corral, at ${mulePriceFor(state, 'p0')} cr each to you this month. ` +
        `The store holds 4 Smithore; at the next upkeep it builds MULEs to fill the corral back to ${target}, ${MULE.smithorePerMule} Smithore each: ` +
        `on its Smithore today, ${Math.min(target, buildable)} if the corral sells out, ${Math.max(0, Math.min(target - 6, buildable))} if it sells none (the auction and a ship that takes Smithore can change that).`,
    );
  });

  it('B fix 3: Food and Energy covered counts units: what the seat holds and its plots made, against what upkeep and its plots burn', () => {
    const { state } = table();
    const p0 = state.players.find((p) => p.id === 'p0')!;
    p0.stock.food = 0;
    p0.stock.energy = 0;
    const need = monthNeeds(state, 'p0');
    expect(need.food).toBeGreaterThan(1);
    expect(need.energy).toBeGreaterThan(0);
    const short = land(state);
    expect(short).toContain(
      `Food and Energy in units: Food — you hold 0 and your plots made 1 at the last production, against ${need.food} your household eats a month: short by ${need.food - 1}; ` +
        `Energy — you hold 0 and your plants made 0 beyond their own use, against ${need.energy} your plots and works use a production: short by ${need.energy}.`,
    );
    p0.stock.food = need.food;
    p0.stock.energy = need.energy;
    const covered = land(state);
    expect(covered).toMatch(/Food — you hold \d+ and your plots made 1 at the last production, against \d+ your household eats a month: covered;/);
    expect(covered).toMatch(/your plots and works use a production: covered\./);
    expect(auction(state)).toContain('Food and Energy in units: ');
  });

  it('B fix 3: a plant pays its own use as the last production charged it, a cold snap included', () => {
    const { state, plots } = table();
    const plant = plots[1]!;
    state.tiles[plant]!.outfit = 'energy';
    const use = energyUseOf(state, state.tiles[plant]!);
    const factor = EVENTS.colony.coldSnap.factor;
    const made = use * factor + 3;
    const last = state.history.at(-1)!;
    last.produced.p0 = { ...emptyStock(), energy: made };
    last.lines = [{ tile: plant, good: 'energy', made, parts: [{ why: 'ground', delta: made }] }];
    expect(land(state)).toContain(`your plants made ${made - use} beyond their own use`);
    last.events = [{ key: 'coldSnap' } as MonthEvent];
    expect(land(state)).toContain(`your plants made ${made - use * factor} beyond their own use`);
  });

  it("B fix 3: the auction brief, asked after production, does not count this month's Food twice: it is in what the seat holds, and upkeep eats next", () => {
    const { state } = table();
    const p0 = state.players.find((p) => p.id === 'p0')!;
    const need = monthNeeds(state, 'p0');
    // Holds one short of upkeep's Food, the 1 made at the last production included: short, though holds + made covers it.
    p0.stock.food = need.food - 1;
    p0.stock.energy = need.energy;
    expect(auction(state)).toContain(
      `Food — you hold ${need.food - 1}, the 1 your plots made at the last production included, against ${need.food} your household eats a month: short by 1;`,
    );
    // Asked at upkeep, before the next production: what the plots make comes before upkeep eats, so it counts.
    expect(land(state)).toContain(`Food — you hold ${need.food - 1} and your plots made 1 at the last production, against ${need.food} your household eats a month: covered;`);
  });

  it("B fix 3: a land plan's reason no longer says the seat's Food and Energy are covered for owning a farm and a plant; it says what it counted", () => {
    const { state, plots } = table();
    state.tiles[plots[1]!]!.outfit = 'energy';
    const p0 = state.players.find((p) => p.id === 'p0')!;
    p0.stock.food = 0;
    // A level that looks ahead counts units (strategist.ts landDecision: its outlook's supply against monthNeeds), so its
    // own words stand. Owning a farm and a plant, it is never told it lacks one.
    for (const held of [0, 50]) {
      p0.stock.food = held;
      p0.stock.energy = held;
      const text = land(state);
      expect(text).not.toContain('I lack a Food plot or an Energy plot');
      expect(text).not.toContain('I own a Food plot and an Energy plot');
      expect(text).toMatch(/I still buy my Food and Energy|my Food and Energy are covered/);
    }
    p0.stock.food = 0;
    // A level without a look-ahead still counts plots; the brief says so instead of "covered".
    const rookie: Mind = { ...mind, levelId: 'rookie', level: AI_LEVELS.rookie };
    const rookieText = landBrief(state, rookie, PERSONAS.trader, draft, []).text;
    expect(rookieText).not.toContain('my Food and Energy are covered');
    expect(rookieText).toContain('I own a Food plot and an Energy plot');
    state.tiles[plots[1]!]!.outfit = 'smithore';
    state.tiles[plots[0]!]!.outfit = 'smithore';
    expect(land(state)).not.toContain('I still buy my Food and Energy');
  });

  it('B fix 3: the development brief, asked at no point in play, is unchanged by these lines', () => {
    const { state } = table();
    const text = phaseBrief(state, mind, PERSONAS.trader, devDraft, 'development', []).text;
    for (const line of ['What your plots made', 'MULEs: ', 'Food and Energy in units']) expect(text).not.toContain(line);
  });
});
