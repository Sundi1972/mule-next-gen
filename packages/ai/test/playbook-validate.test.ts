import { describe, expect, it, vi } from 'vitest';
import {
  advancePhase,
  AI_PLANS,
  createGame,
  createRng,
  GAME,
  monthNeeds,
  MS_PER_SECOND,
  observe,
  stableJson,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type LandGrantPlay,
  type Phase,
  type Playbook,
} from '@mule/engine';
import { playGame } from '../src/play.js';
import { draftPlaybook, type DraftPhase } from '../src/playbook/draft.js';
import { validatorFor, type PlanEdit } from '../src/playbook/validate.js';
import { AiSeat } from '../src/seat.js';
import { outlook } from '../src/outlook.js';
import { applySets } from '../src/sim.js';
import { unitValues, type Mind } from '../src/value.js';

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
  // Shared by the row families below: read-only facts of the fixture states, and ai2's engine draft of the good up.
  const [f1, f2, f3] = freePlots(at.planning);
  const goods = Object.keys(run('auction', []).playbook.auction!);
  const good = at.auction.auction!.good!;
  const g = (field: string) => `/auction/${good}/${field}`;
  const part = run('auction', []).playbook.auction![good]!;

  it('T-AC-1: RULE-1 S1-S9, the strategy rows', () => {
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
    expect(one('planning', '/strategy/landTarget', { ...draft.strategy.landTarget, extra: 1 })).toMatchObject({ plays: draft.strategy.landTarget, why: expect.stringMatching(/^clamped to /) });
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
  });

  it('T-AC-1: RULE-1 P1-P7, the planning and land-grant rows', () => {
    const month = at.planning.month;
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);

    // P1: a part of another phase, or one this playbook lacks. Spec §3's example.
    expect(one('development', '/auction/food/role', 'buyer').why).toBe('not in this playbook');
    expect(one('planning', '/development/route', [{ act: 'pub' }]).why).toBe('not in this playbook');
    expect(one('auction', '/auction/gold/role', 'buyer').why).toBe('not in this playbook');

    // P2: the engine's own orderGeoDrone on a copy, in its own words.
    expect(one('planning', '/planning/drone', [f1, f2])).toMatchObject({ plays: [f1, f2], why: null });
    expect(one('planning', '/planning/drone', [f1, f2, f3]).why).toBe('Pick 1 to 2 plots');
    const rivalPlot = ownPlots(planning2, 'ai0')[0]!;
    expect(one('planning', '/planning/drone', [rivalPlot], { state: planning2 }).why).toBe('The drone only flies over free or listed plots');
    // P3: lots.ts's list on a copy, each entry after the ones before it. RULE-1's example: a plot it doesn't own.
    const before = stableJson(at.planning);
    const listing = (plot: number) => ({ item: 'plot', plot, minimum: 100, unsold: 'store' });
    expect(one('planning', '/planning/list', [listing(f1!)])).toMatchObject({ plays: undefined, why: 'Not your plot' });
    expect(stableJson(at.planning)).toBe(before);
    // Two plots of its own to list: a grant gives GAME.claimsPerGrant, so a second comes as the land auction would give it.
    const twoOwned = structuredClone(planning2);
    for (const plot of freePlots(twoOwned).slice(0, Math.max(0, 2 - ownPlots(twoOwned, 'ai2').length))) twoOwned.tiles[plot]!.owner = 'ai2';
    const [mine1, mine2] = ownPlots(twoOwned, 'ai2');
    const before2 = stableJson(twoOwned);
    expect(one('planning', '/planning/list', [listing(mine1!)], { state: twoOwned })).toMatchObject({ plays: [listing(mine1!)], why: null });
    expect(one('planning', '/planning/list', [listing(mine1!), listing(mine1!)], { state: twoOwned }).why).toBe('That plot is already up for auction');
    expect(one('planning', '/planning/list', [listing(mine2!), { ...listing(mine1!), minimum: 0 }], { state: twoOwned }).why).toBe('Pick a minimum of 1 or more');
    expect(stableJson(twoOwned)).toBe(before2);

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
    // A clamp that drops entries names how many, not the list that plays (a ranking can run to the whole map).
    expect(ranked.why).toBe('clamped: dropped 3 entries, keeping free plots, each once, at a whole value of 0 or more');
    expect(one('planning', '/landGrant/ranked', [{ plot: f1, value: 1.5 }]).why).toBe('no free plot left to rank');
    // An edit inside the list whose entry the clamp drops is clamped only: none of it plays, so it is no accepted edit.
    const store = at.planning.tiles.findIndex((t) => t.terrain === 'store');
    const lost = one('planning', '/landGrant/ranked/0/plot', store);
    expect(lost.r.playbook.landGrant!.ranked).toEqual(draft.landGrant!.ranked.slice(1));
    expect(lost.r.playbook.edits).toBeUndefined();
    expect(lost.r.playbook.by).toBe('engine');
    expect(lost.r.rejected).toEqual([{ path: '/landGrant/ranked/0/plot', to: store, why: 'clamped: dropped 1 entry, keeping free plots, each once, at a whole value of 0 or more' }]);
    // P5, P6, P7.
    expect(one('planning', '/landGrant/pressShare', { start: 1.4, end: 0.9 }).plays).toEqual({ start: 1, end: 0.9 });
    expect(one('planning', '/landGrant/pressShare/end', 0.9).plays).toBe(draft.landGrant!.pressShare.start);
    expect(one('planning', '/landGrant/claims', GAME.claimsPerGrant + 3)).toMatchObject({ plays: GAME.claimsPerGrant, why: `clamped to ${GAME.claimsPerGrant}: GAME.claimsPerGrant` });
    expect(one('planning', '/landGrant/deny', [{ plot: f1, rival: 'ai0', maxCost: 50 }, { plot: f2, rival: 'ai2', maxCost: 50 }, { plot: f1, rival: 'ai1', maxCost: 9 }, { plot: f3, rival: 'ai1', maxCost: -1 }]).plays).toEqual([
      { plot: f1, rival: 'ai0', maxCost: 50 },
    ]);
    expect(one('planning', '/landGrant/planB', [f1, f1, f2])).toMatchObject({ plays: [f1, f2], why: 'clamped: dropped 1 entry, keeping free, distinct plots' });
    expect(one('planning', '/landGrant/pair', [f1, f2])).toMatchObject({ plays: [f1, f2], why: null });
    expect(one('planning', '/landGrant/pair', [f1, f1]).why).toBe('not two free, distinct plots');
    expect(one('planning', '/landGrant/pair', [rivalPlot, p1], { state: planning2, draft: draftOf(planning2, 'planning', mindOf(2), 102) }).why).toBe('not two free, distinct plots');
  });

  it('T-AC-1: RULE-1 P8-P10, the development rows', () => {
    const month = at.planning.month;
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);

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
  });

  it('T-AC-1: RULE-1 P11-P17 and step 5, the auction rows', () => {
    const month = at.planning.month;
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);

    // P11-P17, on the good that is up.
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
    // Each accepted edit's `to` is the value that plays, after step 5.
    expect(reversed.playbook.edits).toEqual([
      { path: `/auction/${staple}/hold`, from: reversed.draft.auction![staple]!.hold, to: need, reason: 'a test edit' },
      { path: `/auction/${staple}/role`, from: reversed.draft.auction![staple]!.role, to: 'seller', reason: 'a test edit' },
    ]);
  });

  it('T-AC-1: RULE-1 step 6, an edit counts as accepted only if its own value plays', () => {
    const month = at.planning.month;
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);

    // An edit counts as accepted only if its own value plays: one inside a part or good that step 5 replaced whole goes
    // to rejected, naming what plays instead, and is no edit by 'llm'.
    const replaced = (phase: DraftPhase, breakDraft: (pb: Playbook) => void, edits: PlanEdit[]) => {
      const engine = draftOf(at[phase], phase, mindOf(2), 102);
      const broken = structuredClone(engine);
      breakDraft(broken);
      const r = run(phase, edits, { draft: broken });
      expect(r.playbook.edits, phase).toBeUndefined();
      expect(r.playbook.by, phase).toBe('engine');
      return { engine, r };
    };
    const noStart = replaced('auction', (pb) => void (pb.auction!.food!.start = NaN), [edit('/auction/food/walkAway', 50)]);
    expect(noStart.r.playbook.auction!.food).toEqual(noStart.engine.auction!.food);
    expect(noStart.r.rejected).toEqual([
      { path: '/auction/food/walkAway', to: 50, why: "the engine's /auction/food plays" },
      { path: '/auction/food/start', to: NaN, why: "not a number; the engine's /auction/food plays" },
    ]);
    const noDeny = replaced('planning', (pb) => void ((pb.landGrant as unknown as Record<string, unknown>).deny = null), [edit('/landGrant/claims', 0), edit('/landGrant/ranked/0/value', 7)]);
    expect(noDeny.r.playbook.landGrant).toEqual(noDeny.engine.landGrant);
    expect(noDeny.r.rejected).toEqual([
      { path: '/landGrant/claims', to: 0, why: "the engine's /landGrant plays" },
      { path: '/landGrant/ranked/0/value', to: 7, why: "the engine's /landGrant plays" },
      { path: '/landGrant/deny', to: null, why: "not a list of plots to deny; the engine's /landGrant plays" },
    ]);
    const noBudget = replaced('development', (pb) => void (pb.development!.timeBudgetMs = NaN), [edit('/development/ifSoldOut', 'stop')]);
    expect(noBudget.r.playbook.development).toEqual(noBudget.engine.development);
    expect(noBudget.r.rejected).toEqual([
      { path: '/development/ifSoldOut', to: 'stop', why: "the engine's /development plays" },
      { path: '/development/timeBudgetMs', to: NaN, why: "not a number; the engine's /development plays" },
    ]);
    expect(one('auction', g('walkAway'), 0).plays).toBe(1);
    const buyer = run('auction', [edit(g('role'), 'buyer'), edit(g('start'), part.walkAway + 40)]);
    expect(read(buyer.playbook, g('start'))).toBe(part.walkAway);
    const seller2 = run('auction', [edit(g('role'), 'seller'), edit(g('walkAway'), 50), edit(g('start'), 20)]);
    expect(read(seller2.playbook, g('start'))).toBe(50);
    expect(seller2.rejected).toContainEqual({ path: g('start'), to: 20, why: 'clamped to 50: a seller starts at or above its walk-away' });
    expect(one('auction', g('concedeCrPerS'), AI_PLANS.bounds.concedeMaxCrPerS + 30).plays).toBe(AI_PLANS.bounds.concedeMaxCrPerS);
    expect(one('auction', g('concedeCrPerS'), -1)).toMatchObject({ plays: 0, why: 'clamped to 0: a rate of 0 or more' });
    expect(one('auction', g('vsRival'), 'bully').why).toBe('no such tactic');
    expect(one('auction', g('vsRival'), 'yield')).toMatchObject({ plays: 'yield', why: null });
    expect(one('auction', g('per/ai2'), 'yield').why).toBe('no such player');
    expect(one('auction', g('per/ai0'), 'hold')).toMatchObject({ plays: 'hold', why: null });
    expect(one('auction', g('bluff'), 'yes').why).toBe('not a boolean');
  });

  it('T-AC-1: RULE-1 P18, P19 and paths inside a field', () => {
    const month = at.planning.month;
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);

    // RULE-1's example; P18; P19.
    expect(one('auction', '/auction/food/market/buyOutStore', { upTo: 3, maxPrice: 40 })).toMatchObject({ plays: undefined, why: 'market play is step 3' });
    expect(one('auction', '/store', {}).why).toBe('no store play in v1');
    expect(one('planning', '/strategy/mood', 'sunny').why).toBe('no such field');
    expect(one('planning', '/landGrant', {}).why).toBe('no such field');
    expect(one('planning', 'strategy/kind', 'builder').why).toBe('no such field');
    // Inside a field: no key its object does not own, a prototype key least of all, and no empty array index.
    const proto = one('planning', '/strategy/landTarget/__proto__', { plots: 1 });
    expect(proto.why).toBe('no such field');
    expect(proto.r.playbook.by).toBe('engine');
    expect(Object.getPrototypeOf(proto.r.playbook.strategy.landTarget)).toBe(Object.prototype);
    const blank = one('planning', '/landGrant/ranked/', { plot: f1, value: 3 });
    expect(blank.why).toBe('no such field');
    expect(blank.r.playbook.landGrant!.ranked).toEqual(draft.landGrant!.ranked);
  });

  it('T-AC-1: RULE-1 step 3 and the output: re-drafts, by, edits and rejected', () => {
    const month = at.planning.month;
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);

    // Step 3: an edit to kind re-drafts the phase's parts under the edited strategy; a reason edit does not.
    const handed = { ...run('development', []).draft, development: { route: [{ act: 'pub' as const }], timeBudgetMs: 1000, ifSoldOut: 'pub' as const } };
    const engineDev = run('development', []).playbook.development;
    const kind = handed.strategy.kind === 'builder' ? 'landBaron' : 'builder';
    const redrafted = run('development', [edit('/strategy/kind', kind)], { draft: handed });
    expect(redrafted.playbook.strategy.kind).toBe(kind);
    expect(redrafted.playbook.development).toEqual(engineDev);
    expect(run('development', [edit('/strategy/reason', 'Still me.')], { draft: handed }).playbook.development).toEqual(handed.development);
    // So does an edit to the money-maker or the monopoly target.
    const maker = handed.strategy.moneyMaker === 'crystite' ? 'food' : 'crystite';
    expect(run('development', [edit('/strategy/moneyMaker', maker)], { draft: handed }).playbook.development).toEqual(engineDev);
    expect(handed.strategy.monopolyTarget).not.toBe('smithore');
    expect(run('development', [edit('/strategy/monopolyTarget', 'smithore')], { draft: handed }).playbook.development).toEqual(engineDev);

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
    // Row 3 reads the engine's fresh draft, not the playbook handed in: a stale Rookie playbook set on cornering Smithore
    // buys no more than the engine's own draft would, and a fractional hold is a whole number.
    const rookieMind = mindOf(2, 'rookie');
    const fresh = draftOf(at.auction, 'auction', rookieMind, 102);
    const stale = structuredClone(fresh);
    stale.strategy = { ...stale.strategy, kind: 'monopolist', monopolyTarget: 'smithore' };
    stale.auction!.smithore = { ...stale.auction!.smithore!, role: 'buyer', hold: 999 };
    stale.auction![good] = { ...stale.auction![good]!, role: 'buyer', hold: 3.6, start: 1, walkAway: 1 };
    expect(fresh.auction![good]!.hold).toBeGreaterThanOrEqual(4);
    const cornered = validatorFor({ mind: rookieMind, seed: 102 })(at.auction, 'ai2', stale, []);
    const ore = fresh.auction!.smithore!.hold;
    expect(read(cornered.playbook, '/auction/smithore/hold')).toBe(ore);
    expect(read(cornered.playbook, `/auction/${good}/hold`)).toBe(4);
    expect(cornered.rejected).toEqual([
      { path: '/strategy/kind', to: 'monopolist', why: `level never corners; the engine's draft plays ${fresh.strategy.kind}` },
      { path: '/strategy/monopolyTarget', to: 'smithore', why: "level never corners; the engine's draft plays null" },
      { path: `/auction/${good}/hold`, to: 3.6, why: 'clamped to 4: a whole number' },
      { path: '/auction/smithore/hold', to: 999, why: `clamped to ${ore}: level never corners` },
    ]);
    // Positive control: the same Rookie with corners forced true accepts the target.
    const cornering = { ...mindOf(2, 'rookie'), level: { ...mindOf(2, 'rookie').level, corners: true } };
    expect(one('planning', '/strategy/monopolyTarget', 'smithore', { mind: cornering })).toMatchObject({ plays: 'smithore', why: null });
    // A profile with no level reads as corners false.
    const levelless = { ...mindOf(2), level: undefined } as unknown as Mind;
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);
    expect(validatorFor({ mind: levelless, seed: 102 })(at.planning, 'ai2', draft, [edit('/strategy/monopolyTarget', 'smithore')]).rejected).toEqual([
      { path: '/strategy/monopolyTarget', to: 'smithore', why: 'level never corners' },
    ]);
    // It has no draft of its own to bound a buyer's hold, so it buys nothing.
    const levellessBuyer = validatorFor({ mind: levelless, seed: 102 })(at.auction, 'ai2', fresh, [edit(`/auction/${good}/role`, 'buyer'), edit(`/auction/${good}/hold`, 5)]);
    expect(levellessBuyer.rejected).toEqual([{ path: `/auction/${good}/hold`, to: 5, why: 'clamped to 0: level never corners' }]);
    expect(read(levellessBuyer.playbook, `/auction/${good}/hold`)).toBe(0);
  });
});

describe('the validator never lets an error reach the game', () => {
  it('FM-VAL-1: the validator never throws, and logs its own error with the seat', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const draft = draftOf(at.planning, 'planning', mindOf(2), 102);
    const edits = [edit('/strategy/kind', 'builder'), edit('/strategy/reason', 'Hm.')];
    const r = validatorFor({ mind: mindOf(2), seed: 102 })(at.planning, 'nobody', draft, edits);
    expect(r.playbook).toEqual(draft);
    expect(r.rejected).toEqual(edits.map((e) => ({ path: e.path, to: e.to, why: 'validator error: Unknown player nobody' })));
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]!.join(' ')).toMatch(/nobody.*Unknown player nobody/);
    // Not even on a state that is not a game.
    const broken = validatorFor({ mind: mindOf(2), seed: 102 })({} as GameState, 'ai2', draft, edits);
    expect(broken.playbook).toEqual(draft);
    expect(broken.rejected.map((x) => x.why.startsWith('validator error: '))).toEqual([true, true]);
    expect(logged).toHaveBeenCalledTimes(2);
    logged.mockRestore();
  });
});

describe("the engine's own draft passes the gate", () => {
  it("INV-1 (spot): the engine's draft with no edits passes unchanged, nothing rejected, and so does the gate's output for any draft", () => {
    const passes = (label: string) => {
      for (const phase of ['planning', 'development', 'auction'] as const) {
        for (let i = 0; i < PERSONAS_AT_TABLE.length; i++) {
          const mind = mindOf(i);
          const draft = draftOf(at[phase], phase, mind, 100 + i);
          const r = validatorFor({ mind, seed: 100 + i })(at[phase], mind.me, draft, []);
          expect(r.rejected, `${label} ${phase} ai${i}`).toEqual([]);
          expect(stableJson(r.playbook), `${label} ${phase} ai${i}`).toBe(stableJson(draft));
        }
      }
    };
    passes('as configured');
    // A --set sweep that moves a bound moves the draft with it: a route cap that leaves room for the pub alone, a land
    // baron's target past what the grants can give, and plots a month that are fractional or below nothing.
    const sweeps = [
      ['AI_PLANS.bounds.routeSteps=1', `AI_PLANS.landTarget.perMonth.landBaron=${GAME.claimsPerGrant + 1}`, 'AI_PLANS.landTarget.perMonth.other=0.4'],
      ['AI_PLANS.landTarget.perMonth.other=-1'],
    ];
    const valueAt = (path: string) => path.split('.').slice(1).reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], AI_PLANS);
    for (const sweep of sweeps) {
      const saved = sweep.map((set) => `${set.split('=')[0]}=${String(valueAt(set.split('=')[0]!))}`);
      applySets(sweep);
      try {
        passes(`swept ${sweep.join(' ')}`);
      } finally {
        applySets(saved);
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

    // Whatever draft goes in, the gate's output is a fixed point: it passes the gate again, twice, unchanged.
    const drafts = new Map<string, Playbook>();
    const draftFor = (phase: DraftPhase, i: number) => {
      const key = `${phase}${i}`;
      if (!drafts.has(key)) drafts.set(key, draftOf(at[phase], phase, mindOf(i), 100 + i));
      return structuredClone(drafts.get(key)!);
    };
    type Seat = { mind?: Mind; state?: GameState };
    const gate = (phase: DraftPhase, i: number, pb: Playbook, { mind = mindOf(i), state = at[phase] }: Seat = {}) => validatorFor({ mind, seed: 100 + i })(state, `ai${i}`, pb, []);
    const plays = (pb: Playbook) => {
      const { rejected: _, ...rest } = pb;
      return stableJson(rest);
    };
    const isObject = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
    /** Validates `pb`, then its output twice more: each pass must take the one before unchanged. */
    const fixedPoint = (phase: DraftPhase, i: number, pb: Playbook, label: string, seat: Seat = {}) => {
      const { mind = mindOf(i), state = at[phase] } = seat;
      const first = gate(phase, i, pb, seat);
      let out = first.playbook;
      // RULE-2 row 3: a seat that never corners buys no more than the engine's fresh draft, under the strategy that plays.
      if (!mind.level.corners && out.auction) {
        const engine = draftPlaybook({ state, seat: mind.me, mind, seed: 100 + i, phase: 'auction', strategy: out.strategy }).auction!;
        for (const [g, play] of Object.entries(out.auction)) {
          if (play?.role === 'buyer') expect(play.hold, `${label}: ${g}'s hold at corners false`).toBeLessThanOrEqual(engine[g as keyof typeof engine]?.hold ?? 0);
        }
      }
      // The rows hold no field whose container is not an object, so the containers are checked here.
      const containers = [out.strategy.stances, ...(['planning', 'landGrant', 'development', 'auction'] as const).filter((k) => out[k] !== undefined).map((k) => out[k]), ...Object.values(out.auction ?? {})];
      expect(containers.every(isObject), `${label}: every part and good is an object`).toBe(true);
      for (const pass of [2, 3]) {
        const r = gate(phase, i, out, seat);
        expect(r.rejected, `${label}, pass ${pass}`).toEqual([]);
        expect(plays(r.playbook), `${label}, pass ${pass}`).toBe(plays(out));
        out = r.playbook;
      }
      return first;
    };
    const DROP = Symbol('drop');
    const put = (pb: Playbook, path: (string | number)[], v: unknown) => {
      const parent = path.slice(0, -1).reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, pb as unknown as Record<string, unknown>);
      if (v === DROP) delete parent[path.at(-1)!];
      else parent[path.at(-1)!] = v;
    };

    // The review's probes, on seat ai2's auction draft: a seller's start lost below its walk-away, a seller's hold lost
    // below next month's need.
    const food = draftFor('auction', 2);
    food.auction!.food = { ...food.auction!.food!, role: 'seller', walkAway: 62, start: NaN };
    const fed = fixedPoint('auction', 2, food, 'probe: a seller with no start').playbook.auction!.food!;
    expect(fed.start).toBeGreaterThanOrEqual(fed.walkAway);
    // Next month's need as the hands measure it (AM-7's floorUnits), on a seat with Energy to sell whose own power plant
    // makes some of that need, so the engine's Energy play is a seller's and the floor is below the gross monthNeeds.
    const plant = structuredClone(at.auction);
    plant.tiles.find((t) => t.owner === 'ai2')!.outfit = 'energy';
    // A second plot that draws Energy, so the plant makes some of the need, not all of it: a grant gives one claim
    // (GAME.claimsPerGrant), so it comes as the land auction would give it.
    if (ownPlots(plant, 'ai2').length < 2) Object.assign(plant.tiles[freePlots(plant)[0]!]!, { owner: 'ai2', outfit: 'food' });
    plant.players.find((p) => p.id === 'ai2')!.stock.energy = 25;
    const obs = observe(plant, 'ai2');
    const floor = unitValues(obs, outlook(obs, 'ai2', { lookAhead: mindOf(2).level.lookAhead }), 'energy', mindOf(2)).floorUnits;
    const gross = monthNeeds(plant, 'ai2').energy;
    expect(floor).toBeLessThan(gross);
    const energy = draftOf(plant, 'auction', mindOf(2), 102);
    expect(energy.auction!.energy!.role).toBe('seller');
    energy.auction!.energy!.hold = NaN;
    const powered = fixedPoint('auction', 2, energy, 'probe: a seller with no hold', { state: plant }).playbook.auction!.energy!;
    expect(powered.role).toBe('seller');
    expect(powered.hold).toBeGreaterThanOrEqual(floor);
    const holdAtFloor = (mind: Mind) => read(validatorFor({ mind, seed: 102 })(plant, 'ai2', draftOf(plant, 'auction', mindOf(2), 102), [edit('/auction/energy/hold', floor)]).playbook, '/auction/energy/hold');
    expect(holdAtFloor(mindOf(2))).toBe(floor);
    // A profile with no level reads the gross monthNeeds.
    expect(holdAtFloor({ ...mindOf(2), level: undefined } as unknown as Mind)).toBe(gross);
    // A Rookie handed a playbook set on cornering Smithore.
    const cornering = draftFor('auction', 2);
    cornering.strategy = { ...cornering.strategy, kind: 'monopolist', monopolyTarget: 'smithore' };
    cornering.auction!.smithore = { ...cornering.auction!.smithore!, role: 'buyer', hold: 999 };
    fixedPoint('auction', 2, cornering, 'probe: a Rookie buying Smithore to corner it', { mind: mindOf(2, 'rookie') });
    // A strategy, part, good's play or stance list that is not an object at all is replaced, not passed over, and the
    // record names what plays.
    const notObject = (phase: DraftPhase, path: string[], v: unknown, label: string) => {
      const pb = draftFor(phase, 2);
      put(pb, path, v);
      const first = fixedPoint(phase, 2, pb, label);
      expect(first.rejected, label).toContainEqual({ path: `/${path.join('/')}`, to: v, why: `not an object; the engine's /${path.join('/')} plays` });
      return first.playbook;
    };
    expect(notObject('auction', ['auction', 'food'], null, 'a good played as null').auction!.food).toEqual(draftFor('auction', 2).auction!.food);
    expect(notObject('development', ['development'], 5, 'development played as 5').development).toEqual(draftFor('development', 2).development);
    expect(notObject('planning', ['strategy', 'stances'], 5, 'stances played as 5').strategy.stances).toEqual(draftFor('planning', 2).strategy.stances);
    const strategy = draftFor('planning', 2);
    (strategy as unknown as Record<string, unknown>).strategy = null;
    expect(gate('planning', 2, strategy).rejected, 'a strategy played as null').toEqual([{ path: '/strategy', to: null, why: "not an object; the engine's /strategy plays" }]);
    expect(notObject('planning', ['strategy'], null, 'a strategy played as null').strategy).toEqual(draftFor('planning', 2).strategy);
    // A field every land grant has, missing, is missing nowhere in the output: the engine's part plays.
    const denied = draftFor('planning', 2);
    delete (denied.landGrant as Partial<LandGrantPlay>).deny;
    expect(fixedPoint('planning', 2, denied, 'a land grant with no deny list').playbook.landGrant).toEqual(draftFor('planning', 2).landGrant);

    // Seeded perturbations of the fixture drafts: in one part, one field broken (out of range, of the wrong type, or
    // missing) beside one or two siblings moved to other in-range values that may now bound it.
    const rng = createRng(2026);
    /** Per part and field: [values in range, values that break it]. */
    const FIELDS: Record<string, Record<string, [unknown[], unknown[]]>> = {
      strategy: {
        kind: [['builder', 'monopolist', 'landBaron'], ['tycoon', null, DROP]],
        moneyMaker: [['food', null], ['gold', 7]],
        monopolyTarget: [['smithore', null], ['food', 7]],
        cashFloor: [[0, 500], [NaN, 1e9, -5]],
        landTarget: [[{ plots: 1, byMonth: 1 }], [{ plots: -3, byMonth: 99 }, null]],
        reason: [['Mine.'], [5, DROP]],
        stances: [[{}], [null, { ai0: 'enemy' }, 5]],
      },
      landGrant: {
        ranked: [[[]], [[{ plot: -1, value: 1 }], [{ plot: 0, value: NaN }], null]],
        pressShare: [[{ start: 0.5, end: 0.2 }], [{ start: 2, end: 3 }, null]],
        claims: [[0, 1], [9, NaN]],
        deny: [[[]], [null, 'x', DROP]],
        planB: [[[]], ['x', [-1], DROP]],
        pair: [[], [[0, 0], null]],
      },
      development: {
        route: [[[{ act: 'pub' }]], [[{ act: 'dance' }], null, DROP]],
        timeBudgetMs: [[0], [NaN, 1e12]],
        ifSoldOut: [['stop', 'analyse'], ['x', DROP]],
      },
      good: {
        role: [['buyer', 'seller', 'out'], ['broker', DROP]],
        hold: [[0, 3, 9], [NaN, -2, DROP]],
        walkAway: [[1, 62, 400], [0, NaN, DROP]],
        start: [[1, 62, 400], [NaN, -1, DROP]],
        concedeCrPerS: [[0, 10], [-1, NaN]],
        vsRival: [['hold', 'yield'], ['x']],
        bluff: [[true], ['y']],
        per: [[{ ai0: 'hold' }], [{ ai9: 'x' }, null]],
      },
    };
    let cases = 0;
    for (let n = 0; n < 50; n++) {
      const phase = rng.pick(['planning', 'development', 'auction'] as const);
      const i = rng.int(0, PERSONAS_AT_TABLE.length - 1);
      const pb = draftFor(phase, i);
      const part = phase === 'planning' ? rng.pick(['strategy', 'landGrant']) : phase === 'development' ? rng.pick(['strategy', 'development']) : rng.pick(['strategy', 'good', 'good', 'good']);
      const at: (string | number)[] = part === 'good' ? ['auction', rng.pick(Object.keys(pb.auction!))] : [part];
      const fields = FIELDS[part]!;
      // A good's start and hold are bounded by its role and walk-away, so those pairs come up most.
      const bounded = part === 'good' && rng.next() < 0.6;
      const broken = bounded ? rng.pick(['start', 'hold']) : rng.pick(Object.keys(fields).filter((f) => fields[f]![1].length > 0));
      const siblings = bounded ? ['role', 'walkAway'] : Object.keys(fields).filter((f) => f !== broken && fields[f]![0].length > 0);
      const moved = Array.from({ length: rng.int(1, 2) }, () => rng.pick(siblings));
      const changed: string[] = [];
      for (const [field, pool] of [...moved.map((f) => [f, fields[f]![0]] as const), [broken, fields[broken]![1]] as const]) {
        const v = rng.pick(pool);
        put(pb, [...at, field], v);
        changed.push(`/${[...at, field].join('/')}=${typeof v === 'symbol' ? 'dropped' : JSON.stringify(v)}`);
      }
      // Every other case is validated by the seat's Rookie, which never corners: a Trader's draft is foreign to it.
      const level = n % 2 === 1 ? 'rookie' : 'trader';
      fixedPoint(phase, i, pb, `case ${n}: ${phase} ai${i} ${level} ${changed.join(' ')}`, { mind: mindOf(i, level) });
      cases++;
    }
    expect(cases).toBe(50);
  });
});
