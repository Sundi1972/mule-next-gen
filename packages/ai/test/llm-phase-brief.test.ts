/** The development and auction briefs (C1, C4): what Claude reads to edit the next phase in the slack before it. */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, allPrices, BRAIN, createGame, GOODS, type GameState, type PhaseOutcome, type Playbook, type Strategy } from '@mule/engine';
import { PERSONAS } from '../src/personas.js';
import { GOOD_NAME } from '../src/strategist.js';
import type { Mind } from '../src/value.js';
import { DEVELOPMENT_OFFERS, LAND_OFFERS, landBrief, phaseBrief } from '../src/llm/brief.js';
import { replySchema, writeReply, type WriteComplete, type WriterPrompt } from '../src/llm/writer.js';

/** p0 owns two plots and holds a distinctive stock; p1 holds another, so a leak into p0's brief is unmistakable. */
function table(): GameState {
  const state = createGame({ seed: 7, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })) });
  const free = state.tiles.map((t, i) => (t.terrain === 'store' ? -1 : i)).filter((i) => i >= 0);
  state.tiles[free[0]!]!.owner = 'p0';
  state.tiles[free[1]!]!.owner = 'p0';
  state.players.find((p) => p.id === 'p0')!.stock.food = 75_319;
  state.players.find((p) => p.id === 'p1')!.stock.crystite = 97_531;
  return state;
}
const PLOTS = (state: GameState) => state.tiles.flatMap((t, i) => (t.owner === 'p0' ? [i] : []));

const mind: Mind = { me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader, salt: 3 };
const STRATEGY: Strategy = { kind: 'builder', moneyMaker: 'food', monopolyTarget: null, cashFloor: 200, landTarget: { plots: 6, byMonth: 6 }, stances: {}, reason: 'Grow steady.' };

const devDraft = (state: GameState): Playbook => ({
  v: 1,
  seat: 'p0',
  month: 1,
  phase: 'development',
  strategy: STRATEGY,
  development: { route: [{ act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: PLOTS(state)[0]! }, { act: 'pub' }], timeBudgetMs: 30_000, ifSoldOut: 'pub' },
  by: 'engine',
});
const auctionDraft: Playbook = {
  v: 1,
  seat: 'p0',
  month: 1,
  phase: 'auction',
  strategy: STRATEGY,
  auction: {
    food: { role: 'seller', hold: 4, walkAway: 20, start: 40, concedeCrPerS: 2, bluff: false, vsRival: 'hold' },
    smithore: { role: 'buyer', hold: 3, walkAway: 70, start: 40, concedeCrPerS: 3, bluff: false, vsRival: 'undercut1' },
  },
  by: 'engine',
};

const OUTCOME: PhaseOutcome = { seat: 'p0', month: 1, phase: 'landGrant', items: [{ path: '/landGrant/claims', expected: 2, actual: 1 }], rivals: {} };

describe('C1/C4: the brief for the next phase', () => {
  it('C1: the development brief shows the draft route, its time budget and sold-out choice, the public facts and the last outcome, and offers only the development paths', () => {
    const state = table();
    const brief = phaseBrief(state, mind, PERSONAS.trader, devDraft(state), 'development', [], { outcome: OUTCOME });
    const plot = PLOTS(state)[0]!;
    expect(brief.text).toContain('Your draft development:');
    expect(brief.text).toContain(`Route: buy a MULE, outfit it for ${GOOD_NAME.food}, install it on plot ${plot}, the pub.`);
    expect(brief.text).toContain('Time budget: 30 s of your development time.');
    expect(brief.text).toContain('If the corral is sold out: pub.');
    expect(brief.text).toContain('What happened in your last phase (month 1, landGrant):');
    for (const g of GOODS) expect(brief.text).toContain(`${GOOD_NAME[g]} ${allPrices(state)[g]}`);
    expect(brief.text).toContain('75319');
    expect(brief.text).not.toContain('97531');
    expect(brief.offers.map((o) => o.path)).toEqual(['/development/route', '/development/timeBudgetMs', '/development/ifSoldOut']);
    expect(brief.strategyOffered).toBe(false);
    expect(brief.plans).toEqual([]);
  });

  it("C1: the auction brief shows each good's draft play and offers that good's paths only", () => {
    const state = table();
    const brief = phaseBrief(state, mind, PERSONAS.trader, auctionDraft, 'auction', [], {});
    expect(brief.text).toContain('Your draft auction:');
    expect(brief.text).toContain(`${GOOD_NAME.food}: seller, hold 4, start 40, walk away at 20, concede 2 cr/s, vs a rival on your side hold.`);
    expect(brief.text).toContain(`${GOOD_NAME.smithore}: buyer, hold 3, start 40, walk away at 70, concede 3 cr/s, vs a rival on your side undercut1.`);
    const offered = brief.offers.map((o) => o.path);
    for (const g of ['food', 'smithore']) for (const f of ['role', 'hold', 'walkAway', 'start', 'concedeCrPerS']) expect(offered).toContain(`/auction/${g}/${f}`);
    expect(offered.some((p) => p.startsWith('/auction/energy/'))).toBe(false);
    expect(offered.every((p) => p.startsWith('/auction/'))).toBe(true);
  });

  it('C1: the same state and draft give the same brief, byte for byte', () => {
    const state = table();
    const a = phaseBrief(state, mind, PERSONAS.trader, auctionDraft, 'auction', [], {});
    const b = phaseBrief(structuredClone(state), mind, PERSONAS.trader, structuredClone(auctionDraft), 'auction', [], {});
    expect(b.text).toBe(a.text);
    expect(JSON.stringify(replySchema(b.corners, b.offers, b.strategyOffered))).toBe(JSON.stringify(replySchema(a.corners, a.offers, a.strategyOffered)));
  });
});

/** A model stand-in that answers `text`, recording each prompt. */
function fakeModel(text: string) {
  const asked: WriterPrompt[] = [];
  const complete: WriteComplete = async (prompt) => (asked.push(prompt), { text, stopReason: 'end_turn' });
  return { complete, asked };
}

describe("C2: the writer takes a phase brief's paths", () => {
  const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

  it("C2: the land reply schema is byte for byte what it was, for both corners flags, so the land request's cache holds", () => {
    // Re-pinned for GAME.claimsPerGrant 2 → 1 (trunk, 5 Nov): the claims enum is [0, 1], so the land cache reset once.
    expect(sha(replySchema(true))).toBe('6975f613536e698b00b8751de3e7adae8a6dc6b121cc7bf63370192e75841e2f');
    expect(sha(replySchema(false))).toBe('8425081cf9c0bb23b4d70a79080cb7fe1daf3f49ee676bbb74b71c566fe3abe0');
  });

  it("C2 (option C): the month's land schema, land and development paths together, is the same bytes for every brief of a level", () => {
    const DEV = { route: [], timeBudgetMs: 1_000, ifSoldOut: 'pub' as const };
    const of = (state: GameState) => {
      const b = landBrief(state, mind, PERSONAS.trader, { strategy: STRATEGY, landGrant: { ranked: [], pressShare: { start: 0.8, end: 0.4 }, deny: [], planB: [], claims: 1 } }, [], {}, DEV);
      return replySchema(b.corners, b.offers, b.strategyOffered);
    };
    const a = of(table());
    const later = table();
    later.month = 4;
    expect(JSON.stringify(of(later))).toBe(JSON.stringify(a));
    expect(sha(a)).not.toBe(sha(replySchema(true)));
    // The land request's schema from 5 Nov (option C): pinned, so a change to it is a deliberate cache reset.
    expect(sha(a)).toBe('9f12206b149b580d2f1115b44dc114024895ccdde0e48925b2da7a2ee53f37a7');
    expect(sha(replySchema(false, [...LAND_OFFERS, ...DEVELOPMENT_OFFERS], true))).toBe('cf2458e506ca0b0197abd4a3701a123cbea04829f6d12d51ccfd4cdf380506a6');
  });

  it("C2: a phase brief's schema offers its paths and no strategy; the request carries that schema", async () => {
    const state = table();
    const brief = phaseBrief(state, mind, PERSONAS.trader, devDraft(state), 'development', [], {});
    const schema = replySchema(brief.corners, brief.offers, brief.strategyOffered);
    expect(Object.keys(schema.properties)).toEqual(['edits', 'line']);
    const enums = (schema.properties.edits.items.anyOf as { properties: { path: { enum: string[] } } }[]).map((v) => v.properties.path.enum[0]);
    expect(enums).toEqual(['/development/route', '/development/timeBudgetMs', '/development/ifSoldOut']);
    const model = fakeModel(JSON.stringify({ edits: [], line: '' }));
    await writeReply(model.complete, { brief, system: 'S', waitMs: 1 });
    expect(model.asked[0]!.schema).toEqual(schema);
  });

  it("C2: on a development brief the writer accepts its paths, drops a route step's null plot and outfit, and refuses a land path or a strategy as not offered", async () => {
    const state = table();
    const plot = PLOTS(state)[1]!;
    const brief = phaseBrief(state, mind, PERSONAS.trader, devDraft(state), 'development', [], {});
    const reply = {
      strategy: { kind: 'specialist', moneyMaker: 'smithore', cashFloor: 1, reason: 'x' },
      edits: [
        { path: '/development/route', to: [{ act: 'buyMule', plot: null, outfit: null }, { act: 'outfit', plot: null, outfit: 'energy' }, { act: 'install', plot, outfit: null }], reason: 'Energy first.' },
        { path: '/development/timeBudgetMs', to: 20_000, reason: 'Quick.' },
        { path: '/landGrant/claims', to: 1, reason: 'Wrong phase.' },
      ],
      line: '',
    };
    const { reply: written, refused } = await writeReply(fakeModel(JSON.stringify(reply)).complete, { brief, system: 'S', waitMs: 1 });
    expect(written.strategy).toBeUndefined();
    expect(written.edits).toEqual([
      { path: '/development/route', to: [{ act: 'buyMule' }, { act: 'outfit', outfit: 'energy' }, { act: 'install', plot }], reason: 'Energy first.' },
      { path: '/development/timeBudgetMs', to: 20_000, reason: 'Quick.' },
    ]);
    expect(refused).toEqual(expect.arrayContaining([{ path: '/landGrant/claims', cause: 'path_not_offered' }]));
    expect(refused.filter((r) => r.path?.startsWith('/strategy/')).every((r) => r.cause === 'path_not_offered')).toBe(true);
    expect(refused.length).toBeGreaterThan(1);
  });

  it('C1: each phase brief section stays within its BRAIN cap', () => {
    const state = table();
    const many: Playbook = {
      ...auctionDraft,
      auction: Object.fromEntries(GOODS.map((g) => [g, { role: 'seller', hold: 1, walkAway: 1, start: 2, concedeCrPerS: 1, bluff: false, vsRival: 'hold' }])),
    };
    const brief = phaseBrief(state, mind, PERSONAS.trader, many, 'auction', [], {});
    const lines = brief.text.split('\n').filter((l) => / walk away at /.test(l));
    expect(lines.length).toBe(Math.min(GOODS.length, BRAIN.brief.auctionGoods));
  });
});
