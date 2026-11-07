import { describe, expect, it, vi } from 'vitest';
import { AI_LEVELS, createGame, EXPORT_SHIP, GAME, MULE, POLLUTION, scoreParts, UPKEEP } from '@mule/engine';
import type { AiAction } from '../src/actions.js';
import { ADVICE, defaultManual, seatBounds, type AdviceLine } from '../src/llm/manual.js';
import { WRITER_SYSTEM } from '../src/llm/system.js';

/** Every AiAction type, listed here rather than read from the descriptors under test; the type keeps it complete. */
const EVERY_MOVE: { readonly [T in AiAction['type']]: true } = {
  claim: true,
  buyMule: true,
  outfit: true,
  install: true,
  analyse: true,
  filter: true,
  pub: true,
  declare: true,
  walk: true,
  run: true,
  vote: true,
  setTax: true,
  done: true,
  drone: true,
  list: true,
  unlist: true,
  commission: true,
  donate: true,
  payStrike: true,
  repair: true,
  propose: true,
  voteLaw: true,
};

/** The text under one `## ` heading, up to the next. */
function section(manual: string, heading: string): string {
  const start = manual.indexOf(`## ${heading}\n`);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const rest = manual.slice(start + 1);
  const end = rest.indexOf('\n## ');
  return end < 0 ? rest : rest.slice(0, end);
}

/** The text under one move's `### ` heading, up to the next heading. */
function moveBlock(manual: string, type: string): string {
  const moves = section(manual, 'Moves');
  const start = moves.indexOf(`### ${type}\n`);
  expect(start, type).toBeGreaterThanOrEqual(0);
  const rest = moves.slice(start + 1);
  const end = rest.indexOf('\n### ');
  return end < 0 ? rest : rest.slice(0, end);
}

const fixture = () =>
  createGame({
    seed: 7,
    players: [
      { id: 'a', name: 'Ada', isAi: false },
      { id: 'b', name: 'Bo', isAi: true },
    ],
  });

describe('the manual of moves', () => {
  it('T-AC-A7: changing one config number (GAME.plotScore) changes the manual', () => {
    const saved = GAME.plotScore;
    const before = defaultManual();
    try {
      GAME.plotScore = saved + 7;
      const after = defaultManual();
      expect(after).not.toBe(before);
      expect(section(after, 'How the game is won')).toContain(String(saved + 7));
      expect(section(before, 'How the game is won')).toContain(String(saved));
    } finally {
      GAME.plotScore = saved;
    }
    expect(defaultManual()).toBe(before);
  });

  it('T-AC-A7: production states the Energy cut-off share and the Water shortfall share, each from its own config number', () => {
    const saved = { off: UPKEEP.offOutputShare, short: UPKEEP.shortOutputShare };
    try {
      UPKEEP.offOutputShare = 0.13;
      UPKEEP.shortOutputShare = 0.71;
      const production = section(defaultManual(), 'How a month goes').split('\n').find((l) => l.startsWith('- production: '))!;
      expect(production).toMatch(/Energy[^.;]*13%/);
      expect(production).toMatch(/Water[^.;]*71%/);
      expect(production).not.toMatch(/Energy[^.;]*71%/);
    } finally {
      UPKEEP.offOutputShare = saved.off;
      UPKEEP.shortOutputShare = saved.short;
    }
  });

  /** The line of `How a month goes` for one phase, by its name there. */
  const phaseLine = (manual: string, name: string) => section(manual, 'How a month goes').split('\n').find((l) => l.startsWith(`- ${name}: `))!;

  it("B fix 2: production says the Energy and Water cuts stack, each with its rounding, and how a factory turned off takes its inputs, from config (production.ts runProduction)", () => {
    const saved = { off: UPKEEP.offOutputShare, short: UPKEEP.shortOutputShare };
    const before = phaseLine(defaultManual(), 'production');
    try {
      UPKEEP.offOutputShare = 0.13;
      UPKEEP.shortOutputShare = 0.71;
      const production = phaseLine(defaultManual(), 'production');
      expect(production).not.toBe(before);
      // A plot turned off: offShare, Math.round.
      expect(production).toContain('a plot turned off makes 13% of its output, rounded half up');
      // Short of Water: halve, Math.floor, on what the parts add up to after switchOff.
      expect(production).toContain(`it makes 71% of what it would, rounded down`);
      expect(production).toContain('takes both cuts, the Water cut on what the Energy cut left');
      // A factory turned off: offInput, Math.ceil, of each non-Energy input; none taken when offShare(output) is 0.
      expect(production).toContain('A factory turned off for want of Energy makes 13% of its output from 13% of each non-Energy input, rounded up, and takes no inputs when its share of output rounds to 0');
    } finally {
      UPKEEP.offOutputShare = saved.off;
      UPKEEP.shortOutputShare = saved.short;
    }
  });

  it('B fix 2: development says how the store makes MULEs, what the corral holds and when it runs dry, and how their price moves, from config (upkeep.ts, game.ts, economy.ts mulePrice)', () => {
    const saved = { ...MULE };
    const before = defaultManual();
    try {
      Object.assign(MULE, { labour: 133, smithorePerMule: 3, corralPerPlayer: 7, spareInCorral: 5, scarcityUp: 0.37, surplusDown: 0.23, surplusShare: 0.61, minFactor: 0.47 });
      const manual = defaultManual();
      const development = phaseLine(manual, 'development');
      expect(development).not.toBe(phaseLine(before, 'development'));
      // upkeep.ts: build = min(corralTarget - mules, floor(store Smithore / smithorePerMule)).
      expect(development).toContain('At upkeep the store builds MULEs from its own Smithore, 3 Smithore each, until the corral holds 7 for each player plus 5');
      expect(development).toContain('short of Smithore it builds fewer, so the corral can run dry');
      // economy.ts mulePrice; game.ts at the end of development.
      expect(development).toContain("A MULE costs 133 plus 3 Smithore at the store's posted price, times a scarcity factor");
      expect(development).toContain('up 37% after a development that sold the corral out');
      expect(development).toContain('down 23% after one that left 61% or more of its MULEs unsold');
      expect(development).toContain('never below 47%');
      // Not the old claim: the corral is sized by seats, not by this month's claims.
      const buyMule = section(manual, 'When a move is smart').split('\n').find((l) => l.startsWith('- buyMule '))!;
      expect(buyMule).not.toContain('plot claimed');
      expect(buyMule).toContain('7 for each player plus 5');
      expect(buyMule).toContain('37%');
    } finally {
      Object.assign(MULE, saved);
    }
  });

  it('B fix 2: the export ship buys from players at its month\'s goods auction, then the store\'s surplus at upkeep, at the off-world price stepping down, from config (economy.ts shipPrice, auction.ts, upkeep.ts)', () => {
    const saved = { every: GAME.exportShipEvery, wishlist: EXPORT_SHIP.wishlist, stepDown: EXPORT_SHIP.stepDown, clean: POLLUTION.cleanExportBonus };
    const before = defaultManual();
    try {
      GAME.exportShipEvery = 5;
      EXPORT_SHIP.wishlist = 4;
      EXPORT_SHIP.stepDown = 0.07;
      POLLUTION.cleanExportBonus = 0.13;
      const manual = defaultManual();
      expect(manual).not.toBe(before);
      const auction = phaseLine(manual, 'the goods auction');
      expect(auction).toContain('In a month the export ship calls it buys there too, from any seller');
      expect(auction).toContain('the off-world price for its first unit of a good and 7% less for each one after, 13% more when the air is clean');
      expect(auction).toContain('a sale to it pays the sales tax and any export tax');
      const upkeep = phaseLine(manual, 'upkeep');
      expect(upkeep).toContain('Every 5 months, first in month 5, an export ship calls');
      expect(upkeep).toContain('its wishlist of 4 goods');
      expect(upkeep).toContain('public from the month before');
      expect(upkeep).toContain("buys from players at that month's goods auction, then at upkeep takes the store's surplus of those goods until its hold is full");
      // Not the old line, which had it buy at upkeep only, from nobody named.
      expect(upkeep).not.toContain('buying the 4 goods on its wishlist');
    } finally {
      GAME.exportShipEvery = saved.every;
      EXPORT_SHIP.wishlist = saved.wishlist;
      EXPORT_SHIP.stepDown = saved.stepDown;
      POLLUTION.cleanExportBonus = saved.clean;
    }
  });

  it("T-AC-A7: the default config's manual is byte-identical run to run, and from a fresh module", async () => {
    const first = defaultManual();
    expect(defaultManual()).toBe(first);
    vi.resetModules();
    const fresh = await import('../src/llm/manual.js');
    expect(fresh.defaultManual()).toBe(first);
  });

  it('T-AC-A7: every AiAction appears with what it does, when it is legal and what it costs, and Worth names every scoreParts line', () => {
    const manual = defaultManual();
    for (const type of Object.keys(EVERY_MOVE)) {
      const block = moveBlock(manual, type);
      expect(block, type).toMatch(/\nDoes: \S/);
      expect(block, type).toMatch(/\nLegal when: \S/);
      expect(block, type).toMatch(/\nCost: \S/);
    }
    const development = section(manual, 'How a month goes').split('\n').find((l) => l.startsWith('- development: '))!;
    for (const refusal of ['"Not allowed during <phase>"', '"Your development time is up"', '"Still walking"', '"Still assaying"']) {
      expect(development, refusal).toContain(refusal);
    }
    for (const type of ['buyMule', 'outfit', 'install', 'analyse', 'filter', 'pub']) {
      expect(moveBlock(manual, type), type).toContain('Legal when: the development checks above');
    }
    const won = section(manual, 'How the game is won');
    const state = fixture();
    for (const id of ['a', 'b']) {
      for (const part of Object.keys(scoreParts(state, id))) expect(won, part).toContain(`\n- ${part}: `);
    }
  });

  it('T-AC-A7: an advice line naming a move or playbook field that does not exist fails', () => {
    const advice = section(defaultManual(), 'When a move is smart');
    expect(ADVICE.length).toBeGreaterThan(0);
    for (const line of ADVICE) expect(advice).toContain(`${line.move} (${line.field}): `);

    const when = () => 'when it is a good idea';
    const noMove = { move: 'sellOut', field: 'PlanningPlay.list', when } as unknown as AdviceLine;
    expect(() => defaultManual([...ADVICE, noMove])).toThrow(/sellOut/);
    const noField = { move: 'claim', field: 'LandGrantPlay.grab', when } as unknown as AdviceLine;
    expect(() => defaultManual([...ADVICE, noField])).toThrow(/LandGrantPlay\.grab/);
    const noPlay = { move: 'claim', field: 'Shopping.list', when } as unknown as AdviceLine;
    expect(() => defaultManual([...ADVICE, noPlay])).toThrow(/Shopping\.list/);
  });

  it('HC-8: a level with corners false is told it never aims for a monopoly; a level that may corner is not, and the shared manual says neither', () => {
    expect(AI_LEVELS.rookie.corners).toBe(false);
    const rookie = seatBounds(AI_LEVELS.rookie);
    expect(rookie).toContain('never aims for a monopoly');
    expect(rookie).toContain("'monopolist'");
    // Never offered the field: its reply schema has no monopolyTarget (T-AC-A2).
    expect(rookie).not.toContain('monopolyTarget');
    for (const level of [AI_LEVELS.trader, AI_LEVELS.tycoon]) {
      expect(level.corners).toBe(true);
      expect(seatBounds(level)).not.toContain('never aims for a monopoly');
    }
    expect(defaultManual()).not.toContain('never aims for a monopoly');
  });

  it("B fix 5: the writer's system text and every seat's bounds name no playbook field Claude cannot edit or play does not read (WS9 ruling, 6 Nov)", () => {
    const unread = /monopolyTarget|cashFloor|pressShare|landTarget|stances|buyOutStore|forShip|LandGrantPlay\.(claims|deny|planB|pair)|GoodPlay\.(bluff|vsRival|per|market)\b|PlanningPlay\./;
    expect(WRITER_SYSTEM).not.toMatch(unread);
    for (const level of Object.values(AI_LEVELS)) expect(seatBounds(level)).not.toMatch(unread);
    // The fields the writer is offered: the ranking, the strategy's kind, moneyMaker and reason, the route and the auction's five.
    const offered = /^(LandGrantPlay\.ranked|Strategy\.(kind|moneyMaker|reason)|DevelopmentPlay\.(route|timeBudgetMs|ifSoldOut)|GoodPlay\.(role|hold|walkAway|start|concedeCrPerS))$/;
    for (const line of ADVICE) expect(line.field).toMatch(offered);
  });

  it('B fix 5: an advice line naming a playbook field the writer is not offered fails, as one naming no field does', () => {
    const when = () => 'when it is a good idea';
    for (const field of ['LandGrantPlay.claims', 'LandGrantPlay.deny', 'Strategy.monopolyTarget', 'Strategy.cashFloor', 'GoodPlay.market', 'LandGrantPlay.pressShare']) {
      const line = { move: 'claim', field, when } as AdviceLine;
      expect(() => defaultManual([...ADVICE, line]), field).toThrow(field);
    }
  });

  it("T-AC-A7: the default config's manual is pinned, so the cached system block moves only with the config", () => {
    expect(defaultManual()).toMatchSnapshot();
  });

  it("T-AC-A7: the writer's system block is the manual plus a pinned role and reply, so no wording moves the cache unseen", () => {
    expect(WRITER_SYSTEM).toContain(defaultManual());
    expect(WRITER_SYSTEM.replace(defaultManual(), '<the manual>')).toMatchSnapshot();
  });
});
