import {
  AI_HANDS,
  AI_PLANS,
  analysisSeconds,
  buyMule,
  cloneForSim,
  createRng,
  GAME,
  GOOD_CONFIG,
  GOODS,
  installMule,
  MS_PER_SECOND,
  mulePrice,
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
  type Outfit,
  type PlanningPlay,
  type Playbook,
  type PlayerId,
  type Strategy,
  type Tile,
} from '@mule/engine';
import { OPTION_IDS, TopPickDecider, toOptions, type Choice, type DecisionContext, type ShortOption } from '../decider.js';
import { outlook, productionsLeft, type Outlook } from '../outlook.js';
import { PERSONAS, type DecisionKind } from '../personas.js';
import { analysesWanted, developDecision, filtersWanted, goodPlan, landDecision, leaderOf, sellWanted, shortfallHold, tradeDecision, walkVeto, type DevAction, type DevWalk, type LandPlan } from '../strategist.js';
import { candidate, shortlist, type Shortlist } from '../utility.js';
import { beforeTax, canFeed, cashReserve, chainInputs, chainLinks, chainOutlook, installGain, linkShare, standingLinks, type Mind } from '../value.js';
import { landTargetWithin, planMind, type PlanFields } from './plan.js';
import type { ReplanTrigger } from './replan.js';

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
  /** The plan the seat keeps: drafted under, with its cash floor, stances and reason drafted afresh. See C12. */
  kept?: PlanFields | null;
  /** The re-plan trigger that drafted the plan, which its reason names. See RULE-8. */
  replanned?: ReplanTrigger | null;
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

/** What a reason says first when a re-plan trigger drafted the plan. */
const REPLAN_LINES: Record<ReplanTrigger, string> = {
  lostKeyPlot: 'Lost a key plot.',
  rivalProducer: 'A rival makes my good now.',
  priceShock: 'The price moved.',
  event: 'An event cut my output.',
  election: 'New faces in office.',
};

/** The month the playbook is for: a draft for next month is seeded as next month's. */
const monthOf = (input: DraftInput, obs: GameState) => input.month ?? obs.month;

/** A pick's seed: the seat's seed, the month and the pick's key, hashed (FNV-1a). */
function seedOf(input: Pick<DraftInput, 'seed'>, month: number, key: string): number {
  let h = 0x811c9dc5; // literal-ok: FNV-1a's offset basis, a hash constant
  for (const ch of `${input.seed}|${month}|${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193); // literal-ok: FNV-1a's prime
  return h >>> 0;
}

/**
 * A roll in [0, 1) from the draft's own seeded stream: the seat's seed, the month and `key`. A drafted part's table line
 * draws it, so the line never touches the Brain's or a hand's stream. See AM-22.
 */
export function draftRoll(seed: number, month: number, key: string): number {
  return createRng(seedOf({ seed }, month, `line|${key}`)).next();
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

/**
 * RULE-4's goods: each good's money-maker score, its rival plots, and how many candidate plots it is the best use of. A
 * factory good the seat can't feed is scored as a chain (chainScore), and left out when it can't be one.
 */
function goodScores(obs: GameState, mind: Mind) {
  const o = outlook(obs, mind.me, { lookAhead: mind.level.lookAhead });
  const plots = obs.tiles.filter((t) => t.terrain !== 'store' && (t.owner === null || (t.owner === mind.me && !t.outfit)));
  const fed = GOODS.filter((g) => canFeed(obs, mind.me, g));
  const gains = plots.map((t) => new Map(fed.map((g) => [g, installGain(obs, o, t, g, mind).gain])));
  const bestUse = gains.map((byGood) => fed.reduce((b, g) => (byGood.get(g)! > byGood.get(b)! ? g : b), fed[0]!));
  return GOODS.flatMap((good) => {
    const own = fed.includes(good) ? topGains(gains.map((byGood) => byGood.get(good)!)) : chainScore(obs, o, plots, good, mind);
    if (own === null) return [];
    const rivalPlots = obs.tiles.filter((t) => t.owner !== null && t.owner !== mind.me && t.outfit === good).length;
    const score = own * (1 - AI_PLANS.moneyMaker.rivalDiscount * rivalPlots);
    return [{ good, score, rivalPlots, bestOn: bestUse.filter((g) => g === good).length }];
  });
}

/** A good's own score: its install gain summed over its best AI_PLANS.moneyMaker.plots plots. */
const topGains = (gains: number[]) => [...gains].sort((a, b) => b - a).slice(0, AI_PLANS.moneyMaker.plots).reduce((n, g) => n + g, 0);

/**
 * RULE-4's chain row, on what is still to build: the works' own score, its input charge refunded (chainOutlook) and
 * scaled by the least share of its run a link supplies (linkShare), plus each link at its running cost. A missing link
 * takes the plot of its own where it adds most to the chain; a link that stands counts its running cost with no
 * install price. Null when `good` is no chain (chainLinks), the plots run short, or the MULEs for the works and the
 * missing links don't fit in AI_PLANS.chain.months at the level's MULEs a month, or cost more than the cash on hand.
 */
function chainScore(obs: GameState, o: Outlook, plots: Tile[], good: Good, mind: Mind): number | null {
  const links = chainLinks(obs, mind.me, good);
  const mules = 1 + links.length;
  if (links.length === 0 || plots.length < mules || Math.ceil(mules / mind.level.mulesPerMonth) > AI_PLANS.chain.months) return null;
  const standing = standingLinks(obs, mind.me, good);
  const standingGoods = [...new Set(standing.map((t) => t.outfit as Good))];
  const members = [good, ...links, ...standingGoods];
  const valued = chainOutlook(o, [...links, ...standingGoods]);
  const works = plots.map((t) => ({ t, ...installGain(obs, valued, t, good, mind) })).sort((a, b) => b.gain - a.gain);
  const taken = new Set([works[0]!.t]);
  let running = 0;
  let share = 1;
  let cost = works[0]!.cost;
  for (const link of links) {
    const at = plots
      .filter((t) => !taken.has(t))
      .map((t) => ({ t, share: linkShare(obs, t, link, members, mind.me), ...installGain(obs, valued, t, link, mind) }))
      .reduce((b, w) => (w.gain + w.share * works[0]!.gain > b.gain + b.share * works[0]!.gain ? w : b));
    taken.add(at.t);
    running += at.gain;
    share = Math.min(share, at.share);
    cost += at.cost;
  }
  for (const g of standingGoods) {
    const plotsOf = standing.filter((t) => t.outfit === g);
    for (const t of plotsOf) {
      const { gain, cost: outfit } = installGain(obs, valued, t, g, mind);
      running += gain + outfit;
    }
    share = Math.min(share, plotsOf.reduce((n, t) => n + linkShare(obs, t, g, members, mind.me), 0));
  }
  return cost <= obs.players.find((p) => p.id === mind.me)!.money ? topGains(works.map((w) => w.gain)) * share + running : null;
}

function best<T extends { score: number }>(rows: T[]): T | null {
  return rows.reduce<T | null>((b, r) => (!b || r.score > b.score ? r : b), null);
}

/** RULE-3 and RULE-4: the plan kind the seat leans to most among those it can play, and the strategy fields for it. */
function draftStrategy(input: DraftInput, obs: GameState): Strategy {
  if (input.kept) return keptStrategy(input, obs, input.kept);
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
  const plots = obs.tiles.filter((t) => t.terrain !== 'store');
  const eligible: Record<Kind, boolean> = {
    builder: true,
    specialist: moneyMaker !== null,
    monopolist: target !== null,
    landBaron: plots.filter((t) => t.owner === null).length >= AI_PLANS.landBaron.minFreeShare * plots.length,
    politician: obs.politics !== null,
    spoiler: mind.level.sabotage && mind.persona.spite > 0 && leaderOf(obs, seat) !== null,
  };
  const kind = pickKind(input, obs, eligible);

  const months = Math.min(obs.maxMonths, obs.month + AI_PLANS.landTarget.months);
  const perMonth = AI_PLANS.landTarget.perMonth[kind] ?? AI_PLANS.landTarget.perMonth.other;
  const owned = obs.tiles.filter((t) => t.owner === seat).length;
  return keptStrategy(input, obs, {
    kind,
    moneyMaker: kind === 'builder' || kind === 'politician' ? null : kind === 'monopolist' ? target : moneyMaker,
    monopolyTarget: kind === 'monopolist' ? target : null,
    // Whole plots, from none to what the grants can give (RULE-1 S5), whatever a sweep sets.
    landTarget: { plots: owned + Math.max(0, Math.round(Math.min(perMonth, GAME.claimsPerGrant) * (months - obs.month))), byMonth: months },
  });
}

/** RULE-4's strategy for a plan: the plan's fields, its land target held within reach, and the rest drafted afresh. */
function keptStrategy(input: DraftInput, obs: GameState, plan: PlanFields): Strategy {
  const { seat } = input;
  const leader = plan.kind === 'spoiler' ? leaderOf(obs, seat) : null;
  return {
    kind: plan.kind,
    moneyMaker: plan.moneyMaker,
    monopolyTarget: plan.monopolyTarget,
    cashFloor: Math.min(AI_PLANS.bounds.cashFloorMax, cashReserve(obs, planMind(input.mind, plan))),
    landTarget: landTargetWithin(obs, seat, plan.landTarget),
    stances: Object.fromEntries(obs.players.filter((p) => p.id !== seat).map((p) => [p.id, p.id === leader ? 'target' : 'neutral'])),
    reason: input.replanned ? `${REPLAN_LINES[input.replanned]} ${REASONS[plan.kind]}` : REASONS[plan.kind],
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

/** What the seat lists in planning when short of cash; nothing outside this month's planning, as lots.ts lists only there (RULE-5). */
function planningPart(input: DraftInput, obs: GameState, moneyMaker: Good | null): PlanningPlay {
  if (obs.phase !== 'planning' || monthOf(input, obs) !== obs.month) return {};
  // The money-maker's chain links stay off the list: selling one breaks the plan (AM-33).
  const list = sellWanted(obs, input.mind, moneyMaker ? chainInputs(obs, input.mind.me, moneyMaker) : []);
  return list.length > 0 ? { list } : {};
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

/** MULE `k` as the development draft picks it on `input.state`, under the draft's own key. See RULE-9 row 3. */
export function draftMulePick(input: DraftInput, k: number, walk: DevWalk | undefined, focus: Good | null): DevAction {
  const at: DraftInput = { ...input, phase: 'development' };
  const obs = observe(at.state, at.seat);
  return topPick(at, obs, 'develop', `mule:${k}`, keepOutfit(obs, at.mind, developDecision(obs, at.mind, k, walk, focus), walk));
}

/** The outfit of the MULE the seat leads already fitted (one won at the land auction), or null. */
export function ledOutfit(obs: GameState, me: PlayerId): Outfit | null {
  const carried = obs.players.find((p) => p.id === me)!.carriedMule;
  return carried === null || carried === 'empty' ? null : carried;
}

/**
 * The pick for a MULE the seat leads already fitted keeps its outfit, so only its plot is picked: the floor cannot fit
 * it again, and on taps a re-fit pays twice. It is paid for, so of the purchase's vetoes only the walk's is its own;
 * with no plot the walk allows, 'stop'. See AM-27.
 */
function keepOutfit(obs: GameState, mind: Mind, list: Shortlist<DevAction>, walk: DevWalk | undefined): Shortlist<DevAction> {
  const outfit = ledOutfit(obs, mind.me);
  if (outfit === null) return list;
  const walkOf = (index: number): string | null => {
    if (!walk) return null;
    const legs = walk.floor?.(index, outfit);
    // As developDecision prices it: on the floor by the live legs, where the game walks by the corral and out.
    const there = legs ? legs.there : walkSeconds(obs, mind.me, walk.at!, 'corral') + walkSeconds(obs, mind.me, 'corral', index);
    return walkVeto(walk, there, legs ? legs.pub : 0);
  };
  const kept = list.all.flatMap((c) =>
    c.action.kind === 'install' && c.action.outfit === outfit ? [candidate(c.key, c.label, c.action, c.value, c.considerations, walkOf(c.action.index))] : [],
  );
  const stop = list.all.filter((c) => c.action.kind === 'stop');
  return shortlist(kept.some((c) => !c.veto) ? kept : stop, mind.level.shortlist, mind.level.shortlistTolerance);
}

/** Whether the fitted MULE the seat leads makes anything over the game on one of its idle plots; true when it leads none. See AM-27. */
export function keptOutfitEarns(state: GameState, mind: Mind): boolean {
  const obs = observe(state, mind.me);
  const outfit = ledOutfit(obs, mind.me);
  if (outfit === null) return true;
  const o = outlook(obs, mind.me, { lookAhead: mind.level.lookAhead });
  // installGain's residual for an idle plot (value.ts): the MULE's worth at the end, not what it makes.
  const residual = productionsLeft(obs) > 0 ? mulePrice(obs) * STRATEGIST.residual : 0;
  return obs.tiles.some((t) => {
    if (t.owner !== mind.me || t.outfit) return false;
    const { gain, cost } = installGain(obs, o, t, outfit, mind);
    return gain + cost - residual > 0;
  });
}

/**
 * MULE `mule` led out on a copy of `copy` as the hand plays it: a MULE the seat already leads is not bought, nor
 * outfitted again for the outfit it carries. The copy with it installed, or the rules' refusal. See AM-27.
 */
function leadOut(copy: GameState, me: PlayerId, mule: Extract<DevAction, { kind: 'install' }>): GameState | RuleError {
  const trial = cloneForSim(copy);
  const self = trial.players.find((p) => p.id === me)!;
  const tile = trial.tiles[mule.index]!;
  try {
    if (self.carriedMule === null) buyMule(trial, me);
    if (self.carriedMule !== mule.outfit) outfitMule(trial, me, mule.outfit);
    installMule(trial, me, tile.x, tile.y);
  } catch (err) {
    if (err instanceof RuleError) return err;
    throw err;
  }
  return trial;
}

/** A MULE pick the development draft left out because the what-if copy's rules refused it. */
export interface LeftOutPick {
  /** Its place among the month's MULEs, from 1. */
  mule: number;
  outfit: Outfit;
  plot: number;
  refused: string;
}

/**
 * RULE-5 · development: the analyses, then each MULE as a pick of developDecision, leaning to the money-maker, on a
 * what-if copy that already holds the MULEs before it, then the filters and the pub. The walk is priced as where the
 * game walks (DEV_WALK). A pick the copy's rules refuse is left out, into `leftOut`, and the picks go on.
 */
function developmentPart(input: DraftInput, obs: GameState, moneyMaker: Good | null, leftOut: LeftOutPick[]): DevelopmentPlay {
  const { mind } = input;
  const me = mind.me;
  let copy = cloneForSim(obs);
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
    const walk: DevWalk = { at, left, taps };
    const mule: DevAction = topPick(input, copy, 'develop', `mule:${k}`, keepOutfit(copy, mind, developDecision(copy, mind, k, walk, moneyMaker), walk));
    if (mule.kind === 'stop') break;
    const led = leadOut(copy, me, mule);
    if (led instanceof RuleError) {
      leftOut.push({ mule: k + 1, outfit: mule.outfit, plot: mule.index, refused: led.message });
      continue;
    }
    copy = led;
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
    // As the auction hand walks: the Food and Energy it needs, and the units it must hold to be whole next month, may
    // take all its money; anything else its budget.
    const essential = (h < plan.values.block && (good === 'food' || good === 'energy')) || h < plan.mustHold;
    const cap = essential ? me.money : Math.min(me.money, plan.budget);
    limit = Math.floor(Math.min(plan.values.buy[h] ?? 0, cap));
  }
  const walkAway = Math.max(1, Number.isFinite(limit) ? limit : Math.round(obs.store.posted[good]));
  return {
    role: trade.side === 'pass' ? 'out' : trade.side,
    // A seller keeps at least what its hands will keep at the good's status screen, as the gate holds it (P12).
    hold: trade.side === 'seller' ? Math.max(trade.keep, shortfallHold(obs, mind.me, good).mustHold) : trade.side === 'buyer' ? trade.upTo : h,
    walkAway,
    start: walkAway,
    concedeCrPerS: 0,
    bluff: false,
    vsRival: 'undercut1',
  };
}

/** The planning part a planning draft from `input` carries, alone: the same decision, without the strategy or the land grant. */
export function draftPlanningPart(input: DraftInput): PlanningPlay {
  const obs = observe(input.state, input.seat);
  const { strategy } = headOf(input, obs);
  return planningPart(planned(input, strategy), obs, strategy.moneyMaker);
}

/** The draft's strategy alone, as the seat's playbook for the phase would carry it. */
export function draftStrategyOf(input: DraftInput): Strategy {
  return headOf(input, observe(input.state, input.seat)).strategy;
}

/** The plots the planning draft's land grant ranks, best first: the plan's key plots are its first. See RULE-8. */
export function landRanking(input: DraftInput): number[] {
  return landGrantPart(input, observe(input.state, input.seat)).ranked.map((r) => r.plot);
}

/** The draft's input with the plan mind, for every part but the land grant, which ranks as the land hand does. See RULE-14. */
const planned = (input: DraftInput, strategy: Strategy): DraftInput => ({ ...input, mind: planMind(input.mind, strategy) });

/**
 * The seat's playbook for a phase, complete, by 'engine' with no edits: the strategy, and the phase's parts drafted
 * under it. Given a strategy, it plays that one; the same input always drafts the same playbook. The MULE picks the
 * development draft left out go into `leftOut`, for the caller to log.
 */
export function draftPlaybook(input: DraftInput, leftOut: LeftOutPick[] = []): Playbook {
  const obs = observe(input.state, input.seat);
  const head = headOf(input, obs);
  const plan = planned(input, head.strategy);
  if (input.phase === 'planning') return { ...head, planning: planningPart(plan, obs, head.strategy.moneyMaker), landGrant: landGrantPart(input, obs) };
  if (input.phase === 'development') return { ...head, development: developmentPart(plan, obs, head.strategy.moneyMaker, leftOut) };
  return { ...head, auction: auctionPart(plan, obs) };
}

/**
 * The seat's auction playbook for `good` alone, drafted at its status screen, so its unit values see the good's status
 * rows and the money the earlier goods left. See AM-20.
 */
export function draftGoodPlaybook(input: Omit<DraftInput, 'phase'>, good: Good): Playbook {
  const auction: DraftInput = { ...input, phase: 'auction' };
  const obs = observe(auction.state, auction.seat);
  const head = headOf(auction, obs);
  return { ...head, auction: { [good]: goodPart(planned(auction, head.strategy), obs, good) } };
}

function headOf(input: DraftInput, obs: GameState) {
  const strategy = input.strategy ?? draftStrategy(input, obs);
  return { v: 1 as const, seat: input.seat, month: monthOf(input, obs), phase: input.phase, strategy, by: 'engine' as const };
}
