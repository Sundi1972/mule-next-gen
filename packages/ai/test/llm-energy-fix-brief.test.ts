/**
 * Energy fix: the brief's Energy verdict said "covered" when the next production turned a plot off for want of Energy
 * (deep4 diaries, sonnet error 2: 63 of 301 land briefs, 66 of 277 auction briefs). Production turns plots off when what
 * the seat holds at that production, plus what its plants make there beyond their own use, falls short of what its other
 * plots use (production.ts runProduction, energyOffOrder, turnedOff). The verdict must count what that rule counts:
 * the MULEs the drafted route installs before it, upkeep's spoilage between the auction and it, and what the plants
 * make on their ground rather than what one month's event made them make.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_LEVELS,
  AI_PERSONAS,
  allPrices,
  createGame,
  emptyStock,
  energyUseOf,
  runProduction,
  runUpkeep,
  type DevelopmentPlay,
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
  auction: { energy: { role: 'buyer', hold: 3, walkAway: 70, start: 40, concedeCrPerS: 3, bluff: false, vsRival: 'hold' } },
  by: 'engine',
};

const land = (state: GameState, development: DevelopmentPlay | null = null) => landBrief(state, mind, PERSONAS.trader, draft, [], {}, development).text;
const auction = (state: GameState) => phaseBrief(state, mind, PERSONAS.trader, auctionDraft, 'auction', []).text;
const p0 = (state: GameState) => state.players.find((p) => p.id === 'p0')!;

/** The brief's Energy clause: from "Energy — " to the end of its line. */
function energyClause(text: string): string {
  const clause = text.match(/Energy — [^\n]*/)?.[0];
  expect(clause, text).toBeDefined();
  return clause!;
}

/**
 * Three seats; p0 owns `outfits`, one plot each, plains first. A production has run (month 1, before events start, so
 * production here is the rule alone), and its report files each p0 plant's line as runProduction filed it.
 */
function table(outfits: readonly (Outfit | null)[]): { state: GameState; plots: number[] } {
  const state = createGame({ seed: 7, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })) });
  const free = state.tiles.map((t, i) => (t.terrain === 'store' ? -1 : i)).filter((i) => i >= 0);
  free.sort((a, b) => Number(state.tiles[b]!.terrain === 'plains') - Number(state.tiles[a]!.terrain === 'plains'));
  const plots = free.slice(0, outfits.length);
  plots.forEach((i, k) => Object.assign(state.tiles[i]!, { owner: 'p0', outfit: outfits[k] }));
  const ran = structuredClone(state);
  p0(ran).stock.energy = 100;
  const lines = runProduction(ran).lines.filter((l) => l.good === 'energy' && state.tiles[l.tile]!.owner === 'p0');
  const report: MonthReport = {
    month: 1,
    before: { p0: emptyStock() },
    produced: { p0: { ...emptyStock(), energy: lines.reduce((n, l) => n + l.made, 0) } },
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
  state.history.push(report);
  return { state, plots };
}

/** Whether production, run on `state` as it stands, turns any plot of p0's off for want of Energy. */
function turnsOff(state: GameState): boolean {
  const { lines } = runProduction(structuredClone(state));
  return lines.some((l) => state.tiles[l.tile]!.owner === 'p0' && l.parts.some((p) => p.why === 'energyOff'));
}

/** What the plant on `plot` puts in p0's stock at a production on `state`: what it makes less what it pays of its own use. */
function plantNet(state: GameState, plot: number): number {
  const copy = structuredClone(state);
  p0(copy).stock.energy = 100;
  const line = runProduction(copy).lines.find((l) => l.tile === plot)!;
  return line.made - Math.min(line.made, energyUseOf(state, state.tiles[plot]!));
}

describe('energy fix: the Energy verdict agrees with the production that follows it', () => {
  it("energy fix: the land brief does not say covered when the drafted route's MULE takes the Energy production then lacks; it says covered when production then turns nothing off", () => {
    const { state, plots } = table(['food', 'energy', 'food', 'food', 'food', 'food', null]);
    const plant = plots[1]!;
    const idle = plots[6]!;
    const net = plantNet(state, plant);
    const route: DevelopmentPlay = {
      route: [{ act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: idle }],
      timeBudgetMs: 30_000,
      ifSoldOut: 'pub',
    };
    const withRoute = structuredClone(state);
    withRoute.tiles[idle]!.outfit = 'food';
    expect(plantNet(withRoute, plant)).toBe(net);
    const use = (s: GameState) => s.tiles.filter((t) => t.owner === 'p0' && t.outfit && t.outfit !== 'energy').reduce((n, t) => n + energyUseOf(s, t), 0);
    // Short by one at the production the route runs into, though what the seat owns today is covered.
    const held = use(withRoute) - net - 1;
    expect(held).toBeGreaterThanOrEqual(0);
    expect(held + net).toBeGreaterThanOrEqual(use(state));
    p0(state).stock.energy = held;
    p0(withRoute).stock.energy = held;
    expect(turnsOff(withRoute)).toBe(true);
    expect(energyClause(land(state, route))).not.toMatch(/covered/);

    p0(state).stock.energy = held + 1;
    p0(withRoute).stock.energy = held + 1;
    expect(turnsOff(withRoute)).toBe(false);
    expect(energyClause(land(state, route))).toMatch(/covered/);
  });

  it("energy fix: the land brief counts what the plants make on their ground, not last production's event: not covered when production then turns a plot off", () => {
    const { state, plots } = table(['energy', 'food', 'food', 'food', 'food', 'food', 'food']);
    const plant = plots[0]!;
    const net = plantNet(state, plant);
    const use = plots.slice(1).reduce((n, i) => n + energyUseOf(state, state.tiles[i]!), 0);
    // The last production's event gave the plant 3 more than its ground makes.
    const line = state.history.at(-1)!.lines![0]!;
    line.made += 3;
    line.parts.push({ why: 'event', delta: 3, event: 'solarFlare' });
    state.history.at(-1)!.produced.p0!.energy = line.made;
    const held = use - net - 1;
    expect(held).toBeGreaterThanOrEqual(0);
    p0(state).stock.energy = held;
    expect(turnsOff(state)).toBe(true);
    expect(energyClause(land(state))).not.toMatch(/covered/);

    p0(state).stock.energy = held + 1;
    expect(turnsOff(state)).toBe(false);
    expect(energyClause(land(state))).toMatch(/covered/);
  });

  it("energy fix: the auction brief counts upkeep's spoilage before the next production: not covered when upkeep then production turn a plot off", () => {
    const { state, plots } = table(['energy', 'food', 'food', 'food', 'food', 'food', 'food']);
    const plant = plots[0]!;
    const net = plantNet(state, plant);
    const use = plots.slice(1).reduce((n, i) => n + energyUseOf(state, state.tiles[i]!), 0);
    /** Upkeep, then next month's production with `more` Food MULEs installed, on a copy where p0 ends the auction holding `held`. */
    const nextProduction = (held: number, more = 0) => {
      const copy = structuredClone(state);
      p0(copy).stock.energy = held;
      runUpkeep(copy);
      const free = copy.tiles.flatMap((t, i) => (t.terrain === 'plains' && t.owner === null ? [i] : []));
      for (const i of free.slice(0, more)) Object.assign(copy.tiles[i]!, { owner: 'p0', outfit: 'food' });
      return turnsOff(copy);
    };
    // Holding exactly what the plots use beyond the plants' make: covered today, but upkeep spoils some of it.
    const held = use - net;
    expect(held).toBeGreaterThan(0);
    p0(state).stock.energy = held;
    expect(nextProduction(held)).toBe(true);
    expect(energyClause(auction(state))).not.toMatch(/: covered/);

    // Two more held outlast the spoilage.
    p0(state).stock.energy = held + 2;
    expect(nextProduction(held + 2)).toBe(false);
    const clause = energyClause(auction(state));
    expect(clause).toMatch(/: covered/);

    // The holdings it names are the least that upkeep then production keep whole: today's plots, and one or two more use.
    const said = clause.match(/end this auction holding (\d+):.*If next month's MULEs add 1 more use \(.*\), hold (\d+); 2 more, hold (\d+)\./);
    expect(said, clause).not.toBeNull();
    const [keep, keep1, keep2] = said!.slice(1).map(Number) as [number, number, number];
    for (const [more, k] of [[0, keep], [1, keep1], [2, keep2]] as const) {
      expect(nextProduction(k, more), `${more} more`).toBe(false);
      expect(nextProduction(k - 1, more), `${more} more, one less held`).toBe(true);
    }
  });
});
