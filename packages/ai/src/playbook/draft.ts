import {
  AI_HANDS,
  AI_PLANS,
  analysisSeconds,
  buyMule,
  cloneForSim,
  GAME,
  GOOD_CONFIG,
  GOODS,
  installMule,
  MS_PER_SECOND,
  observe,
  outfitMule,
  RuleError,
  STRATEGIST,
  walkSeconds,
  WALK,
  type AiPersonaId,
  type DevelopmentPlay,
  type DevPlace,
  type GameState,
  type Good,
  type GoodPlay,
  type LandGrantPlay,
  type Playbook,
  type PlayerId,
  type Strategy,
} from '@mule/engine';
import { OPTION_IDS, TopPickDecider, toOptions, type Choice, type DecisionContext, type ShortOption } from '../decider.js';
import { outlook } from '../outlook.js';
import { PERSONAS, type DecisionKind } from '../personas.js';
import { analysesWanted, developDecision, filtersWanted, goodPlan, landDecision, leaderOf, tradeDecision, type DevAction, type LandPlan } from '../strategist.js';
import type { Shortlist } from '../utility.js';
import { beforeTax, canFeed, cashReserve, installGain, type Mind } from '../value.js';

/**
 * The engine's own playbook for a phase (spec C2): the strategist's shortlists, reshaped, each pick a seeded TopPick.
 * Pure: it reads the game through observe only and never asks the Brain, so drafting changes no later pick of play.
 */

export type DraftPhase = 'planning' | 'development' | 'auction';
type Kind = Strategy['kind'];

/** The seat's pending land pick, as brain.ts's Pending holds it: read, never settled. */
export interface LandPick {
  list: Shortlist<LandPlan>;
  options: ShortOption[];
  answer: Choice | null;
  fallback: Choice;
}

export interface DraftInput {
  state: GameState;
  seat: PlayerId;
  mind: Mind;
  /** The seat's own seed; every pick's seed derives from it. */
  seed: number;
  phase: DraftPhase;
  land?: LandPick | null;
  /** Plays this strategy instead of drafting one, and drafts the parts under it. */
  strategy?: Strategy;
  /** The month the playbook is for; unset, the state's month. */
  month?: number;
}

/** The six plan kinds, in RULE-3's order. */
export const KINDS: readonly Kind[] = ['builder', 'specialist', 'monopolist', 'landBaron', 'politician', 'spoiler'];

const REASONS: Record<Kind, string> = {
  builder: 'Farms and power first, a full larder, then whatever is left over. Slow and steady keeps a colony fed.',
  specialist: 'One good, made well and sold dear: I put my MULEs where they earn the most.',
  monopolist: 'If I hold what everyone needs, they pay my price. Time to corner the market.',
  landBaron: 'Land is the one thing nobody can make more of. I take it while it is still free.',
  politician: 'Offices pay, and a vote costs less than a MULE. I run for the council.',
  spoiler: 'Whoever leads will find every road blocked. I play to bring them down.',
};

/** The month the playbook is for: a draft for next month is seeded as next month's. */
const monthOf = (input: DraftInput, obs: GameState) => input.month ?? obs.month;

/** A pick's seed: the seat's seed, the month and the pick's key, hashed (FNV-1a). */
function seedOf(input: DraftInput, month: number, key: string): number {
  let h = 0x811c9dc5; // literal-ok: FNV-1a's offset basis, a hash constant
  for (const ch of `${input.seed}|${month}|${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193); // literal-ok: FNV-1a's prime
  return h >>> 0;
}

/** One pick among options, as the Classic decider makes it, seeded by its key. */
function pick(input: DraftInput, obs: GameState, kind: DecisionKind, key: string, options: ShortOption[]): string {
  const { mind } = input;
  const context: DecisionContext = {
    kind,
    seat: mind.me,
    name: obs.players.find((p) => p.id === mind.me)!.name,
    month: obs.month,
    maxMonths: obs.maxMonths,
    summary: '',
    seed: seedOf(input, monthOf(input, obs), key),
    pickTolerance: mind.level.pickTolerance,
    tableTalk: [],
  };
  return new TopPickDecider().decide(options, PERSONAS[mind.personaId as AiPersonaId], context).optionId;
}

/** TopPick of a strategist shortlist: the action of the option it draws. */
function topPick<A>(input: DraftInput, obs: GameState, kind: DecisionKind, place: string, list: Shortlist<A>): A {
  const options = toOptions(list);
  const id = pick(input, obs, kind, `${input.phase}|${place}`, options);
  return list.options[Math.max(0, options.findIndex((o) => o.id === id))]!.action;
}

/** RULE-4's goods: each good's money-maker score, its rival plots, and how many candidate plots it is the best use of. */
function goodScores(obs: GameState, mind: Mind) {
  const o = outlook(obs, mind.me, { lookAhead: mind.level.lookAhead });
  const plots = obs.tiles.filter((t) => t.terrain !== 'store' && (t.owner === null || (t.owner === mind.me && !t.outfit)));
  const goods = GOODS.filter((g) => canFeed(obs, mind.me, g));
  const gains = plots.map((t) => new Map(goods.map((g) => [g, installGain(obs, o, t, g, mind).gain])));
  const bestUse = gains.map((byGood) => goods.reduce((b, g) => (byGood.get(g)! > byGood.get(b)! ? g : b), goods[0]!));
  return goods.map((good) => {
    const top = gains.map((byGood) => byGood.get(good)!).sort((a, b) => b - a).slice(0, AI_PLANS.moneyMaker.plots);
    const rivalPlots = obs.tiles.filter((t) => t.owner !== null && t.owner !== mind.me && t.outfit === good).length;
    const score = top.reduce((n, g) => n + g, 0) * (1 - AI_PLANS.moneyMaker.rivalDiscount * rivalPlots);
    return { good, score, rivalPlots, bestOn: bestUse.filter((g) => g === good).length };
  });
}

function best<T extends { score: number }>(rows: T[]): T | null {
  return rows.reduce<T | null>((b, r) => (!b || r.score > b.score ? r : b), null);
}

/** RULE-3 and RULE-4: the plan kind the seat leans to most among those it can play, and the strategy fields for it. */
function draftStrategy(input: DraftInput, obs: GameState): Strategy {
  const { mind, seat } = input;
  const scores = goodScores(obs, mind);
  const moneyMaker: Good | null = best(scores.filter((s) => s.score > 0))?.good ?? null;
  const { monopoly } = AI_PLANS;
  const target: Good | null = mind.level.corners
    ? (best(
        scores.filter(
          (s) => monopoly.goods.includes(s.good) && GOOD_CONFIG[s.good].spoilage < STRATEGIST.cornerMaxSpoilage && s.rivalPlots <= monopoly.maxRivalPlots && s.bestOn >= monopoly.minPlots,
        ),
      )?.good ?? null)
    : null;
  const leader = leaderOf(obs, seat);
  const plots = obs.tiles.filter((t) => t.terrain !== 'store');
  const eligible: Record<Kind, boolean> = {
    builder: true,
    specialist: moneyMaker !== null,
    monopolist: target !== null,
    landBaron: plots.filter((t) => t.owner === null).length >= AI_PLANS.landBaron.minFreeShare * plots.length,
    politician: obs.politics !== null,
    spoiler: mind.level.sabotage && mind.persona.spite > 0 && leader !== null,
  };
  const kind = pickKind(input, obs, eligible);

  const months = Math.min(obs.maxMonths, obs.month + AI_PLANS.landTarget.months);
  const perMonth = AI_PLANS.landTarget.perMonth[kind] ?? AI_PLANS.landTarget.perMonth.other;
  const owned = obs.tiles.filter((t) => t.owner === seat).length;
  return {
    kind,
    moneyMaker: kind === 'builder' || kind === 'politician' ? null : kind === 'monopolist' ? target : moneyMaker,
    monopolyTarget: kind === 'monopolist' ? target : null,
    cashFloor: Math.min(AI_PLANS.bounds.cashFloorMax, cashReserve(obs, mind)),
    // Whole plots, from none to what the grants can give (RULE-1 S5), whatever a sweep sets.
    landTarget: { plots: owned + Math.max(0, Math.round(Math.min(perMonth, GAME.claimsPerGrant) * (months - obs.month))), byMonth: months },
    stances: Object.fromEntries(obs.players.filter((p) => p.id !== seat).map((p) => [p.id, kind === 'spoiler' && p.id === leader ? 'target' : 'neutral'])),
    reason: REASONS[kind],
  };
}

/** The eligible kind with the highest leaning; a tie is a seeded TopPick among the tied. A persona with no leaning builds. */
function pickKind(input: DraftInput, obs: GameState, eligible: Record<Kind, boolean>): Kind {
  const leaning = (AI_PLANS.leaning as Partial<Record<string, Record<Kind, number>>>)[input.mind.personaId];
  if (!leaning) return 'builder';
  const open = KINDS.filter((k) => eligible[k]);
  const top = Math.max(...open.map((k) => leaning[k]));
  const tied = open.filter((k) => leaning[k] === top).slice(0, OPTION_IDS.length);
  if (tied.length === 1) return tied[0]!;
  const options = tied.map((k, i): ShortOption => ({ id: OPTION_IDS[i]!, key: k, label: k, utility: top, value: 0, rationale: '' }));
  // No phase in its key: a month's drafts share one kind.
  const id = pick(input, obs, 'land', 'kind', options);
  return tied[options.findIndex((o) => o.id === id)]!;
}

/** RULE-5 · land grant: the plan the seat's land hand plays (its pending pick), else the draft's own pick. */
function landGrantPart(input: DraftInput, obs: GameState): LandGrantPlay {
  const plan = input.land ? pendingPlan(input.land) : topPick(input, obs, 'land', 'land', landDecision(obs, input.mind));
  return {
    // A plot worth less than nothing still ranks last, at 0: RULE-1 drops a negative value.
    ranked: plan.ranking.map((s) => ({ plot: s.index, value: Math.max(0, Math.round(s.value)) })),
    pressShare: { start: STRATEGIST.grantShare, end: STRATEGIST.grantShare },
    claims: GAME.claimsPerGrant as LandGrantPlay['claims'],
    deny: [],
    planB: [],
  };
}

/** The plan the pending pick will settle on: its answer when that names an option, else its fallback. */
function pendingPlan(land: LandPick): LandPlan {
  const at = (id: string) => land.options.findIndex((o) => o.id === id);
  const answered = land.answer ? at(land.answer.optionId) : -1;
  return land.list.options[answered >= 0 ? answered : Math.max(0, at(land.fallback.optionId))]!.action;
}

/** A MULE's steps in a route: buyMule, outfit, install. */
const MULE_STEPS = 3; // literal-ok: RULE-1b's MULE is three steps
const midSeconds = ([lo, hi]: [number, number]) => (lo + hi) / 2 / MS_PER_SECOND; // literal-ok: the midpoint of a range

/**
 * RULE-5 · development: the analyses, then each MULE as a pick of developDecision on a what-if copy that already holds
 * the MULEs before it, then the filters and the pub. The walk is priced as where the game walks (DEV_WALK).
 */
function developmentPart(input: DraftInput, obs: GameState): DevelopmentPlay {
  const { mind } = input;
  const me = mind.me;
  const copy = cloneForSim(obs);
  const self = copy.players.find((p) => p.id === me)!;
  // Drafted ahead of development (WS2 may ask at any time), the copy plays the coming phase.
  if (copy.phase !== 'development') {
    copy.phase = 'development';
    self.doneDeveloping = false;
  }
  const route: DevelopmentPlay['route'] = [];
  const d = AI_HANDS.develop;
  const pace = mind.level.devPace;
  const taps = (midSeconds(d.buyTapMs) + midSeconds(d.outfitMs) + midSeconds(d.installTapMs)) * pace;
  let at: DevPlace = 'store';
  let left = self.devSeconds;
  // Every step fits under the route cap (RULE-1 P8), the pub's included.
  const cap = AI_PLANS.bounds.routeSteps;
  for (const plot of analysesWanted(copy, mind, left).slice(0, Math.max(0, cap - 1))) {
    route.push({ act: 'analyse', plot });
    left -= walkSeconds(copy, me, at, plot) + analysisSeconds(copy, me) + midSeconds(d.analyseTapMs) * pace;
    at = plot;
  }
  // On the arcade floor the hand prices the walk by the live floor, which this draft does not read.
  for (let k = 0; k < mind.level.mulesPerMonth && route.length + MULE_STEPS < cap; k++) {
    const mule: DevAction = topPick(input, copy, 'develop', `mule:${k}`, developDecision(copy, mind, k, { at, left, taps }));
    if (mule.kind === 'stop') break;
    const tile = copy.tiles[mule.index]!;
    try {
      buyMule(copy, me);
      outfitMule(copy, me, mule.outfit);
      installMule(copy, me, tile.x, tile.y);
    } catch (err) {
      if (err instanceof RuleError) break;
      throw err;
    }
    route.push({ act: 'buyMule' }, { act: 'outfit', outfit: mule.outfit }, { act: 'install', plot: mule.index });
    left -= walkSeconds(copy, me, at, 'corral') + walkSeconds(copy, me, 'corral', mule.index) + taps;
    at = mule.index;
  }
  const room = Math.max(0, cap - route.length - 1);
  for (const plot of filtersWanted(copy, mind).slice(0, room)) route.push({ act: 'filter', plot });
  if (route.length < cap) route.push({ act: 'pub' });
  return { route, timeBudgetMs: obs.players.find((p) => p.id === me)!.devSeconds * MS_PER_SECOND, ifSoldOut: 'pub' };
}

/** RULE-5 · auction: per good, from the one that is up through the queue, the side and hold today's trade pick plays. */
function auctionPart(input: DraftInput, obs: GameState): Partial<Record<Good, GoodPlay>> {
  const a = obs.auction;
  const goods = a ? [...(a.good ? [a.good] : []), ...a.queue] : WALK.order;
  return Object.fromEntries(goods.map((good) => [good, goodPart(input, obs, good)]));
}

function goodPart(input: DraftInput, obs: GameState, good: Good): GoodPlay {
  const { mind } = input;
  const plan = goodPlan(obs, mind, good);
  const trade = topPick(input, obs, 'trade', `trade:${good}`, tradeDecision(obs, mind, plan));
  const me = obs.players.find((p) => p.id === mind.me)!;
  const h = me.stock[good];
  let limit = obs.store.posted[good];
  if (trade.side === 'seller') limit = Math.ceil(beforeTax(obs, plan.values.keep[h - 1] ?? 0));
  if (trade.side === 'buyer') {
    // As the auction hand walks: the Food and Energy it needs may take all its money, anything else its budget.
    const essential = h < plan.values.block && (good === 'food' || good === 'energy');
    const cap = essential ? me.money : Math.min(me.money, plan.budget);
    limit = Math.floor(Math.min(plan.values.buy[h] ?? 0, cap));
  }
  const walkAway = Math.max(1, Number.isFinite(limit) ? limit : Math.round(obs.store.posted[good]));
  return {
    role: trade.side === 'pass' ? 'out' : trade.side,
    hold: trade.side === 'seller' ? trade.keep : trade.side === 'buyer' ? trade.upTo : h,
    walkAway,
    start: walkAway,
    concedeCrPerS: 0,
    bluff: false,
    vsRival: 'undercut1',
  };
}

/**
 * The seat's playbook for a phase, complete, by 'engine' with no edits: the strategy, and the phase's parts drafted
 * under it. Given a strategy, it plays that one; the same input always drafts the same playbook.
 */
export function draftPlaybook(input: DraftInput): Playbook {
  const obs = observe(input.state, input.seat);
  const strategy = input.strategy ?? draftStrategy(input, obs);
  const head = { v: 1 as const, seat: input.seat, month: monthOf(input, obs), phase: input.phase, strategy, by: 'engine' as const };
  if (input.phase === 'planning') return { ...head, planning: {}, landGrant: landGrantPart(input, obs) };
  if (input.phase === 'development') return { ...head, development: developmentPart(input, obs) };
  return { ...head, auction: auctionPart(input, obs) };
}
