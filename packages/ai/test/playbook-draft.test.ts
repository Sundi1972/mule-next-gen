import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  AI_PLANS,
  createGame,
  GAME,
  GOODS,
  MS_PER_SECOND,
  observe,
  stableJson,
  STRATEGIST,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type Good,
  type Phase,
  type Strategy,
} from '@mule/engine';
import { Brain } from '../src/brain.js';
import { PERSONAS } from '../src/personas.js';
import { playGame } from '../src/play.js';
import { draftPlaybook, type DraftPhase } from '../src/playbook/draft.js';
import { AiSeat } from '../src/seat.js';
import { applySets } from '../src/sim.js';
import { goodPlan, landDecision, leaderOf, tradeDecision } from '../src/strategist.js';
import { beforeTax, canFeed, cashReserve, installGain, type Mind } from '../src/value.js';
import { outlook } from '../src/outlook.js';

const PERSONAS_AT_TABLE: AiPersonaId[] = ['cautious', 'aggressive', 'trader', 'saboteur'];

/** A month-1 table, one seat per persona, and each seat's mind and seed as AiSeat builds them. */
function table(level: AiLevelId, options: { politics?: boolean; maxMonths?: number } = {}) {
  const state = createGame({ seed: 11, players: PERSONAS_AT_TABLE.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })), ...options });
  const seats = PERSONAS_AT_TABLE.map((persona, i) => {
    const seed = 100 + i;
    return { mind: new AiSeat({ id: `ai${i}`, name: `AI ${i + 1}`, persona, level, seed }).mind, seed };
  });
  return { state, seats };
}

/** The budget for the Trader table's hundred-odd drafts: under 1 s alone, four to five times that in CI's parallel run. */
const SLOW_MS = 20_000;

/**
 * The month's strategy, read off a development draft: every phase of a month drafts the same one (the test below
 * checks it), and this draft skips the land ranking, which is most of a planning draft's cost.
 */
function strategyOf(state: GameState, mind: Mind, seed: number): Strategy {
  return draftPlaybook({ state, seat: mind.me, mind, seed, phase: 'development' }).strategy;
}

/** Runs `fn` with AI_PLANS paths set by --set, then puts each back. */
function withPlans<T>(sets: string[], fn: () => T): T {
  const read = (path: string) => path.split('.').slice(1).reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], AI_PLANS);
  const saved = sets.map((s) => `${s.split('=')[0]}=${String(read(s.split('=')[0]!))}`);
  applySets(sets);
  try {
    return fn();
  } finally {
    applySets(saved);
  }
}

/** RULE-4's money-maker score, written out from the rule's words: the best plots' install gains, less the rivals' share. */
function moneyMakerByRule(state: GameState, mind: Mind): Good | null {
  const obs = observe(state, mind.me);
  const o = outlook(obs, mind.me, { lookAhead: mind.level.lookAhead });
  const plots = obs.tiles.filter((t) => t.terrain !== 'store' && (t.owner === null || (t.owner === mind.me && !t.outfit)));
  let best: { good: Good; score: number } | null = null;
  for (const good of GOODS.filter((g) => canFeed(obs, mind.me, g))) {
    const gains = plots.map((t) => installGain(obs, o, t, good, mind).gain).sort((a, b) => b - a);
    const sum = gains.slice(0, AI_PLANS.moneyMaker.plots).reduce((n, g) => n + g, 0);
    const rivals = obs.tiles.filter((t) => t.owner !== null && t.owner !== mind.me && t.outfit === good).length;
    const score = sum * (1 - AI_PLANS.moneyMaker.rivalDiscount * rivals);
    if (score > 0 && (!best || score > best.score)) best = { good, score };
  }
  return best?.good ?? null;
}

describe('the draft picks a plan kind and writes its strategy', () => {
  it('T-AC-5: RULE-3 rows and RULE-4 fields', () => {
    const { state, seats } = table('trader');
    const [cautious, aggressive, trader, saboteur] = seats as [(typeof seats)[0], (typeof seats)[0], (typeof seats)[0], (typeof seats)[0]];
    const others = (me: string) => state.players.map((p) => p.id).filter((id) => id !== me);

    // RULE-3 · builder: always eligible, the cautious favourite. RULE-4 · no money-maker; a month-1 target of 1 plot a
    // month for 3 months; the reserve as today's strategist keeps it; every other seat neutral.
    const builder = strategyOf(state, cautious.mind, cautious.seed);
    expect(builder).toMatchObject({ kind: 'builder', moneyMaker: null, monopolyTarget: null, landTarget: { plots: 3, byMonth: 4 } });
    expect(builder.cashFloor).toBe(cashReserve(observe(state, cautious.mind.me), cautious.mind));
    expect(builder.stances).toEqual(Object.fromEntries(others(cautious.mind.me).map((id) => [id, 'neutral'])));

    // landBaron: while free plots are at least minFreeShare of all; 2 plots a month. Out of reach, the next leaning.
    expect(strategyOf(state, aggressive.mind, aggressive.seed)).toMatchObject({ kind: 'landBaron', landTarget: { plots: 6, byMonth: 4 } });
    expect(withPlans(['AI_PLANS.landBaron.minFreeShare=1.01'], () => strategyOf(state, aggressive.mind, aggressive.seed).kind)).not.toBe('landBaron');

    // specialist: RULE-4 finds a money-maker, the good the rule's own formula scores best.
    const specialist = withPlans(['AI_PLANS.leaning.trader.monopolist=0.9'], () => strategyOf(state, trader.mind, trader.seed));
    expect(specialist).toMatchObject({ kind: 'specialist', moneyMaker: moneyMakerByRule(state, trader.mind), monopolyTarget: null });
    expect(specialist.moneyMaker).not.toBeNull();

    // monopolist: the level corners and a target qualifies; its money-maker is the target, a good that keeps.
    const monopolist = withPlans(['AI_PLANS.leaning.trader.specialist=0.9'], () => strategyOf(state, trader.mind, trader.seed));
    expect(monopolist.kind).toBe('monopolist');
    expect(['energy', 'smithore']).toContain(monopolist.monopolyTarget);
    expect(monopolist.moneyMaker).toBe(monopolist.monopolyTarget);
    // No target qualifies (no good with at most -1 rival plots): not eligible, the specialist plays.
    expect(withPlans(['AI_PLANS.leaning.trader.specialist=0.9', 'AI_PLANS.monopoly.maxRivalPlots=-1'], () => strategyOf(state, trader.mind, trader.seed).kind)).toBe('specialist');

    // politician: only while the game plays politics; its money-maker is null.
    expect(withPlans(['AI_PLANS.leaning.cautious.politician=2'], () => strategyOf(state, cautious.mind, cautious.seed))).toMatchObject({ kind: 'politician', moneyMaker: null });
    const quiet = table('trader', { politics: false });
    expect(withPlans(['AI_PLANS.leaning.cautious.politician=2'], () => strategyOf(quiet.state, quiet.seats[0]!.mind, quiet.seats[0]!.seed).kind)).toBe('builder');

    // spoiler: sabotage, spite > 0 and a leader; it marks the leader its target, the rest neutral.
    const spoiler = strategyOf(state, saboteur.mind, saboteur.seed);
    const leader = leaderOf(observe(state, saboteur.mind.me), saboteur.mind.me)!;
    expect(spoiler.kind).toBe('spoiler');
    expect(spoiler.stances).toEqual(Object.fromEntries(others(saboteur.mind.me).map((id) => [id, id === leader ? 'target' : 'neutral'])));
    const spiteless = { ...saboteur.mind, persona: { ...saboteur.mind.persona, spite: 0 } };
    expect(strategyOf(state, spiteless, saboteur.seed).kind).not.toBe('spoiler');

    // RULE-4 · unknown: no free plot and no idle plot → no money-maker, so no specialist and no monopolist.
    const taken = structuredClone(state);
    for (const t of taken.tiles) if (t.terrain !== 'store') t.owner = 'ai1';
    expect(strategyOf(taken, trader.mind, trader.seed)).toMatchObject({ kind: 'builder', moneyMaker: null, monopolyTarget: null });

    // landTarget's month bound: never past the last month.
    const short = table('trader', { maxMonths: 2 });
    expect(strategyOf(short.state, short.seats[0]!.mind, short.seats[0]!.seed).landTarget).toEqual({ plots: 1, byMonth: 2 });

    // reason: one in-character line per kind, at most 140 characters.
    const reasons = [builder, specialist, monopolist, spoiler].map((s) => s.reason);
    for (const r of reasons) expect(r.length).toBeGreaterThan(0), expect(r.length).toBeLessThanOrEqual(140);
    expect(new Set(reasons).size).toBe(reasons.length);
  });

  it('T-AC-5: a Trader table drafts cautious builder, aggressive landBaron, trader specialist or monopolist, saboteur spoiler; at Rookie no monopolist and no spoiler', { timeout: SLOW_MS }, () => {
    const trader = table('trader');
    const kinds = trader.seats.map((s) => strategyOf(trader.state, s.mind, s.seed).kind);
    expect([kinds[0], kinds[1], kinds[3]]).toEqual(['builder', 'landBaron', 'spoiler']);
    expect(['specialist', 'monopolist']).toContain(kinds[2]);
    // The trader's tie is a seeded TopPick: both kinds come up over seeds, and a fixed seed always draws the same.
    const traderMind = trader.seats[2]!.mind;
    const drawn = new Set(Array.from({ length: 20 }, (_, seed) => strategyOf(trader.state, traderMind, seed).kind));
    expect(drawn).toEqual(new Set(['specialist', 'monopolist']));
    expect(strategyOf(trader.state, traderMind, 102).kind).toBe('specialist');
    // One kind a month: the seat's planning, development and auction drafts of a month draw the same tie.
    for (let seed = 0; seed < 20; seed++) {
      const of = (phase: 'planning' | 'development' | 'auction') => draftPlaybook({ state: trader.state, seat: traderMind.me, mind: traderMind, seed, phase }).strategy.kind;
      const planning = of('planning');
      expect([of('development'), of('auction')], `seed ${seed}`).toEqual([planning, planning]);
    }
    // A draft stamped for next month (WS2's, once this month's grant has run) draws next month's tie, not this one's.
    const nextMonth = { ...structuredClone(trader.state), month: trader.state.month + 1 };
    const stampedKinds = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      const stamped = draftPlaybook({ state: trader.state, seat: traderMind.me, mind: traderMind, seed, phase: 'planning', month: nextMonth.month });
      expect(stamped.month).toBe(nextMonth.month);
      expect(stamped.strategy.kind, `seed ${seed}`).toBe(strategyOf(nextMonth, traderMind, seed).kind);
      stampedKinds.add(stamped.strategy.kind);
    }
    expect(stampedKinds).toEqual(new Set(['specialist', 'monopolist']));

    const rookie = table('rookie');
    const rookieKinds = rookie.seats.map((s) => strategyOf(rookie.state, s.mind, s.seed));
    for (const s of rookieKinds) {
      expect(s.kind).not.toBe('monopolist');
      expect(s.kind).not.toBe('spoiler');
      expect(s.monopolyTarget).toBeNull();
    }
    // The saboteur takes its next leaning instead.
    expect(['specialist', 'landBaron']).toContain(rookieKinds[3]!.kind);
  });

  it('T-AC-5: a persona missing from leaning drafts builder', () => {
    const { state, seats } = table('trader');
    const trader = seats[2]!;
    const leaning = AI_PLANS.leaning as Partial<typeof AI_PLANS.leaning>;
    const saved = leaning.trader!;
    delete leaning.trader;
    try {
      expect(strategyOf(state, trader.mind, trader.seed)).toMatchObject({ kind: 'builder', moneyMaker: null, monopolyTarget: null });
    } finally {
      leaning.trader = saved;
    }
  });
});

/** Plays seed 11's table to the end of month 1's production, keeping a copy of the state at the end of each phase. */
function month1(): Partial<Record<Phase, GameState>> {
  const kept: Partial<Record<Phase, GameState>> = {};
  const enough = new Error('month 1 played');
  try {
    playGame(11, PERSONAS_AT_TABLE.map((persona) => ({ persona, level: 'trader' })), {
      onPhase: (s) => {
        if (s.month !== 1) return;
        kept[s.phase] = structuredClone(s);
        if (s.phase === 'production') throw enough;
      },
    });
  } catch (err) {
    if (err !== enough) throw err;
  }
  return kept;
}

function advanceTo(state: GameState, phase: Phase): GameState {
  const s = structuredClone(state);
  while (s.phase !== phase) advancePhase(s);
  return s;
}

/** The phase's state: planning as month 1 opens, development after the grant, the auction after production. */
const played = month1();
const at: Record<DraftPhase, GameState> = {
  planning: createGame({ seed: 11, players: PERSONAS_AT_TABLE.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) }),
  development: advanceTo(played.landGrant!, 'development'),
  auction: advanceTo(played.production!, 'auction'),
};
const seats = table('trader').seats;
const draftAt = (phase: DraftPhase, i: number, state = at[phase]) => draftPlaybook({ state, seat: seats[i]!.mind.me, mind: seats[i]!.mind, seed: seats[i]!.seed, phase });

/** RULE-1b: (analyse | buyMule outfit install | filter)* pub?, pub at most once and last. */
const ROUTE = /^(?:(?:analyse|buyMule outfit install|filter)(?: |$))*(?:pub)?$/;
const grammar = (route: { act: string }[]) => route.map((s) => s.act).join(' ');

describe('the draft writes the parts of its phase', () => {
  it('T-AC-4: the same state drafts stableJson-identical playbooks, for each phase', () => {
    for (const phase of ['planning', 'development', 'auction'] as const) {
      for (let i = 0; i < seats.length; i++) {
        const before = stableJson(at[phase]);
        const first = draftAt(phase, i);
        expect(first[phase === 'planning' ? 'landGrant' : phase], `${phase} ai${i}`).toBeDefined();
        expect(stableJson(draftAt(phase, i)), `${phase} ai${i}`).toBe(stableJson(first));
        // The draft reads a copy; the game it was handed is untouched.
        expect(stableJson(at[phase]), `${phase} ai${i}`).toBe(before);
      }
    }
  });

  // trace-allow: the plan's RULE-5 table test (spec C2); the spec's RULE-5 names no AC, INV-1 (T-AC-3) consumes it in Task 1.7
  it("RULE-5: each phase's parts", () => {
    // planning: the strategy, an empty planning part (no listing until RULE-12, no drone), the land grant part.
    const planning = draftAt('planning', 2);
    expect(Object.keys(planning).sort()).toEqual(['by', 'landGrant', 'month', 'phase', 'planning', 'seat', 'strategy', 'v']);
    expect(planning).toMatchObject({ v: 1, seat: 'ai2', month: 1, phase: 'planning', by: 'engine', planning: {} });
    const grant = planning.landGrant!;
    expect(grant).toMatchObject({ pressShare: { start: STRATEGIST.grantShare, end: STRATEGIST.grantShare }, claims: GAME.claimsPerGrant, deny: [], planB: [] });
    // With no pending pick, the ranking of one of landDecision's plans, as {plot, value}.
    const mind = seats[2]!.mind;
    const plans = landDecision(observe(at.planning, 'ai2'), mind).options.map((c) => c.action.ranking.map((s) => ({ plot: s.index, value: Math.round(s.value) })));
    expect(plans).toContainEqual(grant.ranked);
    expect(new Set(grant.ranked.map((r) => r.plot)).size).toBe(grant.ranked.length);
    for (const r of grant.ranked) expect(at.planning.tiles[r.plot]).toMatchObject({ owner: null }), expect(at.planning.tiles[r.plot]!.terrain).not.toBe('store');

    // With the seat's pending pick, the plan it answered, else its fallback; the pick stays unsettled.
    const obs = observe(at.planning, 'ai2');
    const pending = new Brain(mind, PERSONAS.trader, 'AI 3', 7, null).ask('land', landDecision(obs, mind), obs, Infinity, null, '');
    expect(pending.options.length).toBeGreaterThan(1);
    const rankingOf = (k: number) => pending.list.options[k]!.action.ranking.map((s) => ({ plot: s.index, value: Math.round(s.value) }));
    const withPick = (answer: typeof pending.answer) =>
      draftPlaybook({ state: at.planning, seat: 'ai2', mind, seed: seats[2]!.seed, phase: 'planning', land: { ...pending, answer } }).landGrant!.ranked;
    expect(withPick({ optionId: 'B', line: null, by: 'llm' })).toEqual(rankingOf(1));
    const fallback = pending.options.findIndex((o) => o.id === pending.fallback.optionId);
    expect(withPick(null)).toEqual(rankingOf(fallback));
    expect(withPick({ optionId: 'Z', line: null, by: 'llm' })).toEqual(rankingOf(fallback));
    expect(pending.settled).toBeNull();

    // development: RULE-1b's grammar ending at the pub, MULEs on distinct idle plots of its own, at most the level's.
    for (let i = 0; i < seats.length; i++) {
      const dev = draftAt('development', i);
      expect(Object.keys(dev).sort()).toEqual(['by', 'development', 'month', 'phase', 'seat', 'strategy', 'v']);
      const { route, timeBudgetMs, ifSoldOut } = dev.development!;
      expect(grammar(route), `ai${i}`).toMatch(ROUTE);
      expect(route.at(-1)).toEqual({ act: 'pub' });
      expect(route.length).toBeLessThanOrEqual(AI_PLANS.bounds.routeSteps);
      const installs = route.filter((s) => s.act === 'install').map((s) => s.plot!);
      expect(installs.length).toBeLessThanOrEqual(mind.level.mulesPerMonth);
      expect(new Set(installs).size).toBe(installs.length);
      for (const plot of installs) expect(at.development.tiles[plot]).toMatchObject({ owner: `ai${i}`, outfit: null });
      for (const step of route.filter((s) => s.act === 'outfit')) expect(step.outfit).toBeDefined();
      expect(timeBudgetMs).toBe(at.development.players[i]!.devSeconds * MS_PER_SECOND);
      expect(ifSoldOut).toBe('pub');
    }
    // After month 1's grant every seat holds idle land and the cash for a MULE: at least one seat drafts two.
    expect(seats.map((_, i) => draftAt('development', i).development!.route.filter((s) => s.act === 'buyMule').length)).toContain(2);
    // Negative: with no idle plot of its own, no MULE at all.
    const bare = advanceTo(at.planning, 'development');
    expect(bare.tiles.some((t) => t.owner === 'ai0')).toBe(false);
    expect(draftAt('development', 0, bare).development!.route.filter((s) => s.act !== 'analyse' && s.act !== 'filter')).toEqual([{ act: 'pub' }]);

    // auction: the good that is up and the queue; role and hold from a tradeDecision option; the walk's defaults.
    const a = at.auction.auction!;
    const goods = [a.good!, ...a.queue];
    for (let i = 0; i < seats.length; i++) {
      const auction = draftAt('auction', i);
      expect(Object.keys(auction).sort()).toEqual(['auction', 'by', 'month', 'phase', 'seat', 'strategy', 'v']);
      expect(Object.keys(auction.auction!)).toEqual(goods);
      const sobs = observe(at.auction, `ai${i}`);
      const me = sobs.players[i]!;
      for (const good of goods) {
        const part = auction.auction![good]!;
        const plan = goodPlan(sobs, seats[i]!.mind, good);
        const h = me.stock[good];
        const options = tradeDecision(sobs, seats[i]!.mind, plan).options.map(({ action: t }) =>
          t.side === 'seller' ? { role: 'seller', hold: t.keep } : t.side === 'buyer' ? { role: 'buyer', hold: t.upTo } : { role: 'out', hold: h },
        );
        expect(options, `ai${i} ${good}`).toContainEqual({ role: part.role, hold: part.hold });
        expect(part).toMatchObject({ start: part.walkAway, concedeCrPerS: 0, bluff: false, vsRival: 'undercut1' });
        expect(part.per).toBeUndefined();
        expect(part.market).toBeUndefined();
        expect(Number.isInteger(part.walkAway) && part.walkAway >= 1).toBe(true);
        // The walk-away is today's limit for the first unit: a seller's floor, a buyer's ceiling.
        if (part.role === 'seller') expect(part.walkAway).toBe(Math.max(1, Math.ceil(beforeTax(sobs, plan.values.keep[h - 1]!))));
        if (part.role === 'buyer') {
          const essential = h < plan.values.block && (good === 'food' || good === 'energy');
          expect(part.walkAway).toBe(Math.max(1, Math.floor(Math.min(plan.values.buy[h]!, essential ? me.money : Math.min(me.money, plan.budget)))));
        }
      }
    }
  });
});
