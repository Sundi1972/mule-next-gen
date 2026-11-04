import { AI_PLANS, GOOD_CONFIG, GOODS, observe, STRATEGIST, type AiPersonaId, type GameState, type Good, type Playbook, type PlayerId, type Strategy } from '@mule/engine';
import { OPTION_IDS, TopPickDecider, type Choice, type DecisionContext, type ShortOption } from '../decider.js';
import { outlook } from '../outlook.js';
import { PERSONAS, type DecisionKind } from '../personas.js';
import { leaderOf, type LandPlan } from '../strategist.js';
import type { Shortlist } from '../utility.js';
import { canFeed, cashReserve, installGain, type Mind } from '../value.js';

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
}

const KINDS: Kind[] = ['builder', 'specialist', 'monopolist', 'landBaron', 'politician', 'spoiler'];

const REASONS: Record<Kind, string> = {
  builder: 'Farms and power first, a full larder, then whatever is left over. Slow and steady keeps a colony fed.',
  specialist: 'One good, made well and sold dear: I put my MULEs where they earn the most.',
  monopolist: 'If I hold what everyone needs, they pay my price. Time to corner the market.',
  landBaron: 'Land is the one thing nobody can make more of. I take it while it is still free.',
  politician: 'Offices pay, and a vote costs less than a MULE. I run for the council.',
  spoiler: 'Whoever leads will find every road blocked. I play to bring them down.',
};

/** A pick's seed: the seat's seed, the month, the phase and the pick's place, hashed (FNV-1a). */
function seedOf(input: DraftInput, month: number, place: string): number {
  let h = 0x811c9dc5; // literal-ok: FNV-1a's offset basis, a hash constant
  for (const ch of `${input.seed}|${month}|${input.phase}|${place}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193); // literal-ok: FNV-1a's prime
  return h >>> 0;
}

/** One pick among options, as the Classic decider makes it, with a seed of its own. */
function pick(input: DraftInput, obs: GameState, kind: DecisionKind, place: string, options: ShortOption[]): string {
  const { mind } = input;
  const context: DecisionContext = {
    kind,
    seat: mind.me,
    name: obs.players.find((p) => p.id === mind.me)!.name,
    month: obs.month,
    maxMonths: obs.maxMonths,
    summary: '',
    seed: seedOf(input, obs.month, place),
    pickTolerance: mind.level.pickTolerance,
    tableTalk: [],
  };
  return new TopPickDecider().decide(options, PERSONAS[mind.personaId as AiPersonaId], context).optionId;
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
    landTarget: { plots: owned + perMonth * (months - obs.month), byMonth: months },
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
  const id = pick(input, obs, 'land', 'kind', options);
  return tied[options.findIndex((o) => o.id === id)]!;
}

/** The seat's playbook for a phase: complete, by 'engine', with no edits. */
export function draftPlaybook(input: DraftInput): Playbook {
  const obs = observe(input.state, input.seat);
  return { v: 1, seat: input.seat, month: obs.month, phase: input.phase, strategy: input.strategy ?? draftStrategy(input, obs), by: 'engine' };
}
