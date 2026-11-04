import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  AI_PLANS,
  createGame,
  GAME,
  monthNeeds,
  MS_PER_SECOND,
  stableJson,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type Phase,
  type Playbook,
} from '@mule/engine';
import { playGame } from '../src/play.js';
import { draftPlaybook, type DraftPhase } from '../src/playbook/draft.js';
import { validatorFor, type PlanEdit } from '../src/playbook/validate.js';
import { AiSeat } from '../src/seat.js';
import type { Mind } from '../src/value.js';

const PERSONAS_AT_TABLE: AiPersonaId[] = ['cautious', 'aggressive', 'trader', 'saboteur'];
const players = PERSONAS_AT_TABLE.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true }));

/** Seed 11's table played to month 2's planning, with a copy of the state at the end of each phase. */
function played(): Record<string, GameState> {
  const kept: Record<string, GameState> = {};
  const enough = new Error('played far enough');
  try {
    playGame(11, PERSONAS_AT_TABLE.map((persona) => ({ persona, level: 'trader' })), {
      onPhase: (s) => {
        kept[`${s.phase}${s.month}`] = structuredClone(s);
        if (s.month === 2 && s.phase === 'planning') throw enough;
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

const kept = played();
const at: Record<DraftPhase, GameState> = {
  planning: createGame({ seed: 11, players }),
  development: advanceTo(kept.landGrant1!, 'development'),
  auction: advanceTo(kept.production1!, 'auction'),
};
/** Month 2's planning: the seats own land from month 1. */
const planning2 = kept.planning2!;

const mindOf = (i: number, level: AiLevelId = 'trader'): Mind => new AiSeat({ id: `ai${i}`, name: `AI ${i + 1}`, persona: PERSONAS_AT_TABLE[i]!, level, seed: 100 + i }).mind;
const draftOf = (state: GameState, phase: DraftPhase, mind: Mind, seed: number) => draftPlaybook({ state, seat: mind.me, mind, seed, phase });

/** Validates edits to seat ai2's (trader) engine draft of the phase. */
function run(phase: DraftPhase, edits: PlanEdit[], options: { state?: GameState; mind?: Mind; draft?: Playbook } = {}) {
  const state = options.state ?? at[phase];
  const mind = options.mind ?? mindOf(2);
  const draft = options.draft ?? draftOf(state, phase, mind, 102);
  const result = validatorFor({ mind, seed: 102 })(state, mind.me, draft, edits);
  return { draft, ...result };
}

const edit = (path: string, to: unknown): PlanEdit => ({ path, to, reason: 'a test edit' });
const read = (pb: Playbook, path: string) => path.split('/').slice(1).reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], pb);
const freePlots = (state: GameState) => state.tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.owner === null && t.terrain !== 'store').map(({ i }) => i);
const ownPlots = (state: GameState, id: string) => state.tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.owner === id).map(({ i }) => i);

/** One edit: the value that plays at its path, and why it was refused or clamped (null: accepted as sent). */
function one(phase: DraftPhase, path: string, to: unknown, options: Parameters<typeof run>[2] = {}) {
  const r = run(phase, [edit(path, to)], options);
  return { plays: read(r.playbook, path), why: r.rejected.find((x) => x.path === path)?.why ?? null, r };
}

describe('the validator holds every playbook to RULE-1', () => {
  it('T-AC-1: RULE-1, one case per row family', () => {
    const month = at.planning.month;
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);

    // S1-S3: a kind, a good, a good to corner.
    expect(one('planning', '/strategy/kind', 'tycoon')).toMatchObject({ plays: draft.strategy.kind, why: 'no such kind' });
    expect(one('planning', '/strategy/moneyMaker', 'gold')).toMatchObject({ plays: draft.strategy.moneyMaker, why: 'no such good' });
    expect(one('planning', '/strategy/moneyMaker', 'crystite')).toMatchObject({ plays: 'crystite', why: null });
    expect(one('planning', '/strategy/monopolyTarget', 'crystite')).toMatchObject({ plays: draft.strategy.monopolyTarget, why: 'not a good to corner' });
    expect(one('planning', '/strategy/monopolyTarget', 'food')).toMatchObject({ plays: draft.strategy.monopolyTarget, why: 'spoils too fast to corner' });
    expect(one('planning', '/strategy/monopolyTarget', 'smithore')).toMatchObject({ plays: 'smithore', why: null });
    // S4, spec §3's example.
    expect(one('planning', '/strategy/cashFloor', 5000)).toMatchObject({ plays: 2000, why: 'clamped to 2000: AI_PLANS.bounds.cashFloorMax' });
    expect(one('planning', '/strategy/cashFloor', -5).plays).toBe(0);
    // S5: plots from owned now to owned + claimsPerGrant a month, by this month to the last.
    const target = one('planning', '/strategy/landTarget', { plots: 99, byMonth: 99 });
    expect(target.plays).toEqual({ plots: GAME.claimsPerGrant * (at.planning.maxMonths - month), byMonth: at.planning.maxMonths });
    expect(target.why).toMatch(/^clamped to /);
    expect(one('planning', '/strategy/landTarget/byMonth', 0).plays).toBe(month);
    // S6: another seat of this game; a stance from the four. RULE-1's example: a stance for the seat itself.
    expect(one('planning', '/strategy/stances/ai2', 'rival').why).toBe('no such player');
    expect(one('planning', '/strategy/stances/ai7', 'rival').why).toBe('no such player');
    expect(one('planning', '/strategy/stances/ai0', 'enemy')).toMatchObject({ plays: 'neutral', why: 'no such stance' });
    expect(one('planning', '/strategy/stances/ai0', 'rival')).toMatchObject({ plays: 'rival', why: null });
    // S7, S8: the first notes kept, each cut.
    const long = 'x'.repeat(AI_PLANS.bounds.rivalReadChars + 9);
    const reads = one('planning', '/rivalReads/ai1', ['a', long, 'c', 'd']);
    expect(reads.plays).toEqual(['a', 'x'.repeat(AI_PLANS.bounds.rivalReadChars), 'c'].slice(0, AI_PLANS.bounds.rivalReadNotes));
    expect(reads.why).toMatch(/^clamped to /);
    expect(one('planning', '/rivalReads/ai2', ['self']).why).toBe('no such player');
    const lessons = Array.from({ length: AI_PLANS.bounds.lessons + 2 }, (_, i) => `lesson ${i}`);
    expect(one('planning', '/lessons', lessons).plays).toEqual(lessons.slice(0, AI_PLANS.bounds.lessons));
    // S9: the reason is the writer's shape check.
    expect(one('planning', '/strategy/reason', 'Ore, all of it.')).toMatchObject({ plays: 'Ore, all of it.', why: null });

    // P1: a part of another phase, or one this playbook lacks. Spec §3's example.
    expect(one('development', '/auction/food/role', 'buyer').why).toBe('not in this playbook');
    expect(one('planning', '/development/route', [{ act: 'pub' }]).why).toBe('not in this playbook');
    const goods = Object.keys(run('auction', []).playbook.auction!);
    expect(one('auction', '/auction/gold/role', 'buyer').why).toBe('not in this playbook');

    // P2: the engine's own orderGeoDrone on a copy, in its own words.
    const [f1, f2, f3] = freePlots(at.planning);
    expect(one('planning', '/planning/drone', [f1, f2])).toMatchObject({ plays: [f1, f2], why: null });
    expect(one('planning', '/planning/drone', [f1, f2, f3]).why).toBe('Pick 1 to 2 plots');
    const rivalPlot = ownPlots(planning2, 'ai0')[0]!;
    expect(one('planning', '/planning/drone', [rivalPlot], { state: planning2 }).why).toBe('The drone only flies over free or listed plots');
    // P3: lots.ts's list on a copy, each entry after the ones before it. RULE-1's example: a plot it doesn't own.
    const before = stableJson(at.planning);
    const listing = (plot: number) => ({ item: 'plot', plot, minimum: 100, unsold: 'store' });
    expect(one('planning', '/planning/list', [listing(f1!)])).toMatchObject({ plays: undefined, why: 'Not your plot' });
    expect(stableJson(at.planning)).toBe(before);
    const [mine1, mine2] = ownPlots(planning2, 'ai2');
    const before2 = stableJson(planning2);
    expect(one('planning', '/planning/list', [listing(mine1!)], { state: planning2 })).toMatchObject({ plays: [listing(mine1!)], why: null });
    expect(one('planning', '/planning/list', [listing(mine1!), listing(mine1!)], { state: planning2 }).why).toBe('That plot is already up for auction');
    expect(one('planning', '/planning/list', [listing(mine2!), { ...listing(mine1!), minimum: 0 }], { state: planning2 }).why).toBe('Pick a minimum of 1 or more');
    expect(stableJson(planning2)).toBe(before2);

    // P4: free plots, listed once, whole values of 0 or more; the bad entries dropped; none left, refused.
    const [p1, p2, p3] = freePlots(planning2);
    const ranked = one('planning', '/landGrant/ranked', [
      { plot: p1, value: 300 },
      { plot: p1, value: 200 },
      { plot: rivalPlot, value: 900 },
      { plot: p2, value: -4 },
      { plot: p3, value: 120 },
    ], { state: planning2, draft: draftOf(planning2, 'planning', mindOf(2), 102) });
    expect(ranked.plays).toEqual([{ plot: p1, value: 300 }, { plot: p3, value: 120 }]);
    expect(ranked.why).toMatch(/^clamped to /);
    expect(one('planning', '/landGrant/ranked', [{ plot: f1, value: 1.5 }]).why).toBe('no free plot left to rank');
    // P5, P6, P7.
    expect(one('planning', '/landGrant/pressShare', { start: 1.4, end: 0.9 }).plays).toEqual({ start: 1, end: 0.9 });
    expect(one('planning', '/landGrant/pressShare/end', 0.9).plays).toBe(draft.landGrant!.pressShare.start);
    expect(one('planning', '/landGrant/claims', GAME.claimsPerGrant + 3)).toMatchObject({ plays: GAME.claimsPerGrant, why: `clamped to ${GAME.claimsPerGrant}: GAME.claimsPerGrant` });
    expect(one('planning', '/landGrant/deny', [{ plot: f1, rival: 'ai0', maxCost: 50 }, { plot: f2, rival: 'ai2', maxCost: 50 }, { plot: f1, rival: 'ai1', maxCost: 9 }, { plot: f3, rival: 'ai1', maxCost: -1 }]).plays).toEqual([
      { plot: f1, rival: 'ai0', maxCost: 50 },
    ]);
    expect(one('planning', '/landGrant/planB', [f1, f1, f2]).plays).toEqual([f1, f2]);
    expect(one('planning', '/landGrant/pair', [f1, f2])).toMatchObject({ plays: [f1, f2], why: null });
    expect(one('planning', '/landGrant/pair', [f1, f1]).why).toBe('not two free, distinct plots');

    // P8: RULE-1b's grammar; own plots for install and filter, any plot for analyse; the level's MULEs; the step cap.
    const own = ownPlots(at.development, 'ai2');
    const mule = (plot: number) => [{ act: 'buyMule' }, { act: 'outfit', outfit: 'smithore' }, { act: 'install', plot }];
    const route = [{ act: 'analyse', plot: f1 }, ...mule(own[0]!), { act: 'pub' }];
    expect(one('development', '/development/route', route)).toMatchObject({ plays: route, why: null });
    const draftRoute = run('development', []).playbook.development!.route;
    const fault = (r: unknown[]) => one('development', '/development/route', r);
    expect(fault([{ act: 'outfit', outfit: 'food' }, { act: 'pub' }])).toMatchObject({ plays: draftRoute, why: 'route: an outfit with no MULE bought, step 0' });
    expect(fault([{ act: 'buyMule' }, { act: 'install', plot: own[0] }]).why).toBe('route: buyMule not followed by outfit and install, step 1');
    expect(fault([{ act: 'buyMule' }, { act: 'outfit', outfit: 'gold' }, { act: 'install', plot: own[0] }]).why).toBe('route: no such outfit, step 1');
    expect(fault([...mule(own[0]!).slice(0, 2), { act: 'install', plot: rivalPlotIn(at.development) }]).why).toBe('route: not your plot, step 2');
    expect(fault([{ act: 'filter', plot: rivalPlotIn(at.development) }]).why).toBe('route: not your plot, step 0');
    expect(fault([{ act: 'pub' }, { act: 'analyse', plot: f1 }]).why).toBe('route: the pub is the last step, step 0');
    expect(fault([{ act: 'dance' }]).why).toBe('route: no such act, step 0');
    const tooMany = Array.from({ length: mindOf(2).level.mulesPerMonth + 1 }, () => mule(own[0]!)).flat();
    expect(fault(tooMany).why).toBe(`route: more than ${mindOf(2).level.mulesPerMonth} MULEs, step ${mindOf(2).level.mulesPerMonth * mule(0).length}`);
    const steps = Array.from({ length: AI_PLANS.bounds.routeSteps + 1 }, () => ({ act: 'analyse', plot: f1 }));
    expect(fault(steps).why).toBe(`route: more than ${AI_PLANS.bounds.routeSteps} steps, step ${AI_PLANS.bounds.routeSteps}`);
    // P9: RULE-1's example (a 50 s seat asked for 90 s), read against the seat's own development seconds.
    const devMs = at.development.players.find((p) => p.id === 'ai2')!.devSeconds * MS_PER_SECOND;
    expect(one('development', '/development/timeBudgetMs', devMs + 40 * MS_PER_SECOND)).toMatchObject({ plays: devMs, why: `clamped to ${devMs}: the seat's development time` });
    expect(one('development', '/development/ifSoldOut', 'analyse')).toMatchObject({ plays: 'analyse', why: null });
    expect(one('development', '/development/ifSoldOut', 'wait').why).toBe('no such choice');

    // P11-P17, on the good that is up.
    const good = at.auction.auction!.good!;
    const g = (field: string) => `/auction/${good}/${field}`;
    const part = run('auction', []).playbook.auction![good]!;
    expect(one('auction', g('role'), 'broker')).toMatchObject({ plays: part.role, why: 'no such role' });
    expect(one('auction', g('hold'), -3).plays).toBe(0);
    const staple = (['food', 'energy'] as const).find((x) => goods.includes(x))!;
    const need = monthNeeds(at.auction, 'ai2')[staple];
    expect(need).toBeGreaterThan(0);
    const seller = run('auction', [edit(`/auction/${staple}/role`, 'seller'), edit(`/auction/${staple}/hold`, 0)]);
    expect(read(seller.playbook, `/auction/${staple}/hold`)).toBe(need);
    expect(seller.rejected.find((x) => x.path === `/auction/${staple}/hold`)?.why).toBe(`clamped to ${need}: next month's need`);
    // Step 5: the same edits the other way round; the hold is checked again against the role that plays.
    const reversed = run('auction', [edit(`/auction/${staple}/hold`, 0), edit(`/auction/${staple}/role`, 'seller')]);
    expect(read(reversed.playbook, `/auction/${staple}/hold`)).toBe(need);
    expect(reversed.rejected).toContainEqual({ path: `/auction/${staple}/hold`, to: 0, why: `clamped to ${need}: next month's need` });
    expect(one('auction', g('walkAway'), 0).plays).toBe(1);
    const buyer = run('auction', [edit(g('role'), 'buyer'), edit(g('start'), part.walkAway + 40)]);
    expect(read(buyer.playbook, g('start'))).toBe(part.walkAway);
    expect(one('auction', g('concedeCrPerS'), AI_PLANS.bounds.concedeMaxCrPerS + 30).plays).toBe(AI_PLANS.bounds.concedeMaxCrPerS);
    expect(one('auction', g('vsRival'), 'bully').why).toBe('no such tactic');
    expect(one('auction', g('vsRival'), 'yield')).toMatchObject({ plays: 'yield', why: null });
    expect(one('auction', g('per/ai2'), 'yield').why).toBe('no such player');
    expect(one('auction', g('per/ai0'), 'hold')).toMatchObject({ plays: 'hold', why: null });
    expect(one('auction', g('bluff'), 'yes').why).toBe('not a boolean');
    // RULE-1's example; P18; P19.
    expect(one('auction', '/auction/food/market/buyOutStore', { upTo: 3, maxPrice: 40 })).toMatchObject({ plays: undefined, why: 'market play is step 3' });
    expect(one('auction', '/store', {}).why).toBe('no store play in v1');
    expect(one('planning', '/strategy/mood', 'sunny').why).toBe('no such field');
    expect(one('planning', '/landGrant', {}).why).toBe('no such field');
    expect(one('planning', 'strategy/kind', 'builder').why).toBe('no such field');

    // Step 3: an edit to kind re-drafts the phase's parts under the edited strategy; a reason edit does not.
    const handed = { ...run('development', []).draft, development: { route: [{ act: 'pub' as const }], timeBudgetMs: 1000, ifSoldOut: 'pub' as const } };
    const engineDev = run('development', []).playbook.development;
    const kind = handed.strategy.kind === 'builder' ? 'landBaron' : 'builder';
    const redrafted = run('development', [edit('/strategy/kind', kind)], { draft: handed });
    expect(redrafted.playbook.strategy.kind).toBe(kind);
    expect(redrafted.playbook.development).toEqual(engineDev);
    expect(run('development', [edit('/strategy/reason', 'Still me.')], { draft: handed }).playbook.development).toEqual(handed.development);

    // The output: by 'llm' when an edit took; each accepted or clamped edit with from and the value that plays.
    const out = run('planning', [edit('/strategy/cashFloor', 5000), edit('/strategy/kind', 'tycoon'), edit('/strategy/reason', 'Hoard.')]);
    expect(out.playbook.by).toBe('llm');
    expect(out.playbook.edits).toEqual([
      { path: '/strategy/cashFloor', from: draft.strategy.cashFloor, to: 2000, reason: 'a test edit' },
      { path: '/strategy/reason', from: draft.strategy.reason, to: 'Hoard.', reason: 'a test edit' },
    ]);
    expect(out.rejected).toEqual([
      { path: '/strategy/cashFloor', to: 5000, why: 'clamped to 2000: AI_PLANS.bounds.cashFloorMax' },
      { path: '/strategy/kind', to: 'tycoon', why: 'no such kind' },
    ]);
    expect(out.playbook.rejected).toEqual(out.rejected);
    // Every edit refused: the draft plays, by 'engine'.
    expect(run('planning', [edit('/strategy/kind', 'tycoon')]).playbook.by).toBe('engine');

    // Negative: an in-bounds walkAway is accepted unchanged, by 'llm' (RULE-1's example).
    const walkAway = part.role === 'seller' ? Math.max(1, part.walkAway - 1) : part.walkAway + 1;
    const fine = run('auction', [edit(g('walkAway'), walkAway)]);
    expect(fine.rejected).toEqual([]);
    expect(fine.playbook).toEqual({ ...fine.draft, auction: { ...fine.draft.auction, [good]: { ...part, walkAway } }, by: 'llm', edits: [{ path: g('walkAway'), from: part.walkAway, to: walkAway, reason: 'a test edit' }] });
  });
});

function rivalPlotIn(state: GameState): number {
  return ownPlots(state, 'ai0')[0]!;
}

describe('the level bound', () => {
  it('T-AC-2: RULE-2 rows 1-3 on Rookie, accepted on Trader', () => {
    const good = at.auction.auction!.good!;
    const cases = (mind: Mind) => {
      const draft = draftOf(at.auction, 'auction', mind, 102);
      const hold = draft.auction![good]!.hold;
      const r = validatorFor({ mind, seed: 102 })(at.auction, 'ai2', draft, [
        edit('/strategy/monopolyTarget', 'smithore'),
        edit('/strategy/kind', 'monopolist'),
        edit(`/auction/${good}/role`, 'buyer'),
        edit(`/auction/${good}/hold`, hold + 3),
      ]);
      return { draft, hold, r };
    };
    const rookie = cases(mindOf(2, 'rookie'));
    expect(rookie.r.playbook.strategy).toMatchObject({ monopolyTarget: null, kind: rookie.draft.strategy.kind });
    expect(read(rookie.r.playbook, `/auction/${good}/hold`)).toBe(rookie.hold);
    expect(rookie.r.rejected).toEqual([
      { path: '/strategy/monopolyTarget', to: 'smithore', why: 'level never corners' },
      { path: '/strategy/kind', to: 'monopolist', why: 'level never corners' },
      { path: `/auction/${good}/hold`, to: rookie.hold + 3, why: `clamped to ${rookie.hold}: level never corners` },
    ]);
    const trader = cases(mindOf(2, 'trader'));
    expect(trader.r.playbook.strategy).toMatchObject({ monopolyTarget: 'smithore', kind: 'monopolist' });
    expect(read(trader.r.playbook, `/auction/${good}/hold`)).toBe(trader.hold + 3);
    expect(trader.r.rejected).toEqual([]);
    // Positive control: the same Rookie with corners forced true accepts the target.
    const cornering = { ...mindOf(2, 'rookie'), level: { ...mindOf(2, 'rookie').level, corners: true } };
    expect(one('planning', '/strategy/monopolyTarget', 'smithore', { mind: cornering })).toMatchObject({ plays: 'smithore', why: null });
    // A profile with no level reads as corners false.
    const levelless = { ...mindOf(2), level: undefined } as unknown as Mind;
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);
    expect(validatorFor({ mind: levelless, seed: 102 })(at.planning, 'ai2', draft, [edit('/strategy/monopolyTarget', 'smithore')]).rejected).toEqual([
      { path: '/strategy/monopolyTarget', to: 'smithore', why: 'level never corners' },
    ]);
  });
});

describe('the validator never lets an error reach the game', () => {
  it('FM-VAL-1: the validator never throws', () => {
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);
    const edits = [edit('/strategy/kind', 'builder'), edit('/strategy/reason', 'Hm.')];
    const r = validatorFor({ mind: mindOf(2), seed: 102 })(at.planning, 'nobody', draft, edits);
    expect(r.playbook).toEqual(draft);
    expect(r.rejected).toEqual(edits.map((e) => ({ path: e.path, to: e.to, why: 'validator error: Unknown player nobody' })));
    // Not even on a state that is not a game.
    const broken = validatorFor({ mind: mindOf(2), seed: 102 })({} as GameState, 'ai2', draft, edits);
    expect(broken.playbook).toEqual(draft);
    expect(broken.rejected.map((x) => x.why.startsWith('validator error: '))).toEqual([true, true]);
  });
});

describe("the engine's own draft passes the gate", () => {
  it('INV-1 (spot): the engine\'s draft with no edits passes unchanged, nothing rejected', () => {
    for (const phase of ['planning', 'development', 'auction'] as const) {
      for (let i = 0; i < PERSONAS_AT_TABLE.length; i++) {
        const mind = mindOf(i);
        const draft = draftOf(at[phase], phase, mind, 100 + i);
        const r = validatorFor({ mind, seed: 100 + i })(at[phase], mind.me, draft, []);
        expect(r.rejected, `${phase} ai${i}`).toEqual([]);
        expect(stableJson(r.playbook), `${phase} ai${i}`).toBe(stableJson(draft));
      }
    }
    // No free plot left: the draft ranks nothing, and ranking nothing passes.
    const taken = structuredClone(at.planning);
    for (const t of taken.tiles) if (t.terrain !== 'store') t.owner = 'ai1';
    const bare = draftOf(taken, 'planning', mindOf(2), 102);
    expect(bare.landGrant!.ranked).toEqual([]);
    const r = validatorFor({ mind: mindOf(2), seed: 102 })(taken, 'ai2', bare, []);
    expect(r.rejected).toEqual([]);
    expect(stableJson(r.playbook)).toBe(stableJson(bare));
  });
});
