import { describe, expect, it } from 'vitest';
import { AI_PLANS, createGame, GOODS, observe, type AiLevelId, type AiPersonaId, type GameState, type Good, type Strategy } from '@mule/engine';
import { draftPlaybook } from '../src/playbook/draft.js';
import { AiSeat } from '../src/seat.js';
import { applySets } from '../src/sim.js';
import { leaderOf } from '../src/strategist.js';
import { canFeed, cashReserve, installGain, type Mind } from '../src/value.js';
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

function strategyOf(state: GameState, mind: Mind, seed: number): Strategy {
  return draftPlaybook({ state, seat: mind.me, mind, seed, phase: 'planning' }).strategy;
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

  it('T-AC-5: a Trader table drafts cautious builder, aggressive landBaron, trader specialist or monopolist, saboteur spoiler; at Rookie no monopolist and no spoiler', () => {
    const trader = table('trader');
    const kinds = trader.seats.map((s) => strategyOf(trader.state, s.mind, s.seed).kind);
    expect([kinds[0], kinds[1], kinds[3]]).toEqual(['builder', 'landBaron', 'spoiler']);
    expect(['specialist', 'monopolist']).toContain(kinds[2]);
    // The trader's tie is a seeded TopPick: both kinds come up over seeds, and a fixed seed always draws the same.
    const traderMind = trader.seats[2]!.mind;
    const drawn = new Set(Array.from({ length: 20 }, (_, seed) => strategyOf(trader.state, traderMind, seed).kind));
    expect(drawn).toEqual(new Set(['specialist', 'monopolist']));
    expect(strategyOf(trader.state, traderMind, 102).kind).toBe('specialist');

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

  it.todo('B-AC-5: four personas draft four kinds; Rookie drafts no monopolist or spoiler');
});
